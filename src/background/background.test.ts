import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  GET_AUTOFILL_VALUES,
  GET_PANEL_SETTINGS,
  OPEN_PROFILE,
} from '@/messages';
import { browserDiversityStore } from '@/storage/diversity-store';
import { browserSettingsStore } from '@/storage/settings-store';
import { savedDiversity } from '@/test/diversity-fixtures';
import { browserProfileStore } from '@/storage/profile-store';
import { fullProfile } from '@/test/autofill-fixtures';
import background from '@/entrypoints/background';

let setAccessLevel: ReturnType<typeof vi.fn>;
/** The fake browser has no ports; this records the background's listener. */
let connectListeners: ((port: unknown) => void)[];

beforeEach(() => {
  fakeBrowser.reset();
  setAccessLevel = vi.fn().mockResolvedValue(undefined);
  Reflect.set(fakeBrowser.storage.local, 'setAccessLevel', setAccessLevel);
  connectListeners = [];
  Reflect.set(fakeBrowser.runtime, 'onConnect', {
    addListener: (listener: (port: unknown) => void) => {
      connectListeners.push(listener);
    },
  });
  background.main();
});

/** Only the parts of a sender the background reads. */
function sender(
  id: string,
  frame: { tab?: { id: number }; frameId?: number; url?: string },
): Browser.runtime.MessageSender {
  return { id, ...frame } as Browser.runtime.MessageSender;
}

/** Delivers a message as the browser would, and waits for the reply. */
async function send(
  message: unknown,
  senderId = fakeBrowser.runtime.id,
  frame: { tab?: { id: number }; frameId?: number; url?: string } = {
    tab: { id: 7 },
    frameId: 0,
  },
) {
  let reply: unknown;
  const replied = new Promise<void>((resolve) => {
    void fakeBrowser.runtime.onMessage
      .trigger(message, sender(senderId, frame), (response: unknown) => {
        reply = response;
        resolve();
      })
      .then((results: unknown[]) => {
        if (!results.includes(true)) resolve();
      });
  });
  await replied;
  return reply;
}

describe('background', () => {
  it('keeps stored data out of content scripts where supported', async () => {
    await Promise.resolve();

    expect(setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  });
});

describe('background messages', () => {
  it('answers with the confirmed profile’s values', async () => {
    await browserProfileStore.save(fullProfile(), null);

    expect(await send(GET_AUTOFILL_VALUES)).toMatchObject({
      status: 'ready',
      values: { text: { firstName: 'Alex' } },
    });
  });

  it('answers that no profile is saved', async () => {
    expect(await send(GET_AUTOFILL_VALUES)).toEqual({ status: 'missing' });
  });

  it('ignores messages from anything but ApplyKit itself', async () => {
    await browserProfileStore.save(fullProfile(), null);

    expect(
      await send(GET_AUTOFILL_VALUES, 'another-extension'),
    ).toBeUndefined();
  });

  it('opens the profile page on request and says it did', async () => {
    const open = vi
      .spyOn(fakeBrowser.runtime, 'openOptionsPage')
      .mockResolvedValue(undefined);

    expect(await send(OPEN_PROFILE)).toEqual({ ok: true });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('says when the profile page could not be opened', async () => {
    vi.spyOn(fakeBrowser.runtime, 'openOptionsPage').mockRejectedValue(
      new Error('No options page'),
    );

    expect(await send(OPEN_PROFILE)).toEqual({ ok: false });
  });

  it('answers the panel in a tab’s top frame and extension pages', async () => {
    await browserProfileStore.save(fullProfile(), null);

    expect(await send(GET_AUTOFILL_VALUES)).toMatchObject({ status: 'ready' });
    expect(
      await send(GET_AUTOFILL_VALUES, fakeBrowser.runtime.id, {}),
    ).toMatchObject({ status: 'ready' });
  });

  it('never sends profile values into a frame within a page', async () => {
    await browserProfileStore.save(fullProfile(), null);

    expect(
      await send(GET_AUTOFILL_VALUES, fakeBrowser.runtime.id, {
        tab: { id: 7 },
        frameId: 3,
      }),
    ).toBeUndefined();
  });

  it('tells the panel whether to show developer diagnostics', async () => {
    expect(await send(GET_PANEL_SETTINGS)).toEqual({
      diagnostics: false,
      ai: false,
    });

    await browserSettingsStore.saveDiagnostics(true);
    expect(await send(GET_PANEL_SETTINGS)).toEqual({
      diagnostics: true,
      ai: false,
    });
    expect(await send(GET_PANEL_SETTINGS, 'another-extension')).toBeUndefined();
  });

  describe('saved diversity answers', () => {
    const resolve = {
      type: 'applykit:resolve-diversity',
      requests: [
        {
          category: 'disability',
          options: [
            { value: 'y', text: 'Yes' },
            { value: 'n', text: 'No' },
          ],
        },
      ],
    };

    it('sends the panel only reuse and saved categories, never answers', async () => {
      await browserProfileStore.save(fullProfile(), null);
      await browserDiversityStore.save(
        savedDiversity(),
        null,
        new Date('2026-10-18T12:00:00.000Z'),
      );

      const reply = JSON.stringify(await send(GET_AUTOFILL_VALUES));

      expect(reply).toContain('"diversity":{"reuse":true,"saved":');
      for (const answer of ['non-binary', 'other-mixed', 'prefer-not-to-say']) {
        expect(reply).not.toContain(answer);
      }
    });

    it('lists no categories while reuse is off', async () => {
      await browserProfileStore.save(fullProfile(), null);
      await browserDiversityStore.save(
        { ...savedDiversity(), reuse: false },
        null,
        new Date('2026-10-18T12:00:00.000Z'),
      );

      expect(await send(GET_AUTOFILL_VALUES)).toMatchObject({
        values: { diversity: { reuse: false, saved: [] } },
      });
    });

    it('names the option that says the saved answer, only with reuse on', async () => {
      expect(await send(resolve)).toEqual({
        results: [{ reason: 'reuse-off' }],
      });

      await browserDiversityStore.save(
        savedDiversity(),
        null,
        new Date('2026-10-18T12:00:00.000Z'),
      );
      expect(await send(resolve)).toEqual({ results: [{ value: 'n' }] });
    });

    it('answers only ApplyKit in a tab’s top frame', async () => {
      await browserDiversityStore.save(
        savedDiversity(),
        null,
        new Date('2026-10-18T12:00:00.000Z'),
      );

      expect(await send(resolve, 'another-extension')).toBeUndefined();
      expect(
        await send(resolve, fakeBrowser.runtime.id, {
          tab: { id: 7 },
          frameId: 2,
        }),
      ).toBeUndefined();
    });

    it('ignores malformed requests', async () => {
      for (const message of [
        { type: 'applykit:resolve-diversity', requests: [] },
        {
          type: 'applykit:resolve-diversity',
          requests: [{ category: 'age', options: [] }],
        },
        {
          type: 'applykit:resolve-diversity',
          requests: [{ category: 'gender', options: 'Woman' }],
        },
      ]) {
        expect(await send(message)).toBeUndefined();
      }
    });
  });

  it('ignores unknown messages', async () => {
    expect(await send({ type: 'applykit:unknown' })).toBeUndefined();
  });
});

describe('AI settings messages', () => {
  const page = {
    tab: { id: 3 },
    frameId: 0,
    url: fakeBrowser.runtime.getURL('/options.html'),
  };
  const panel = {
    tab: { id: 7 },
    frameId: 0,
    url: 'https://jobs.example.com/apply',
  };

  it('answers the profile page with the status, never a key', async () => {
    await fakeBrowser.storage.session.set({
      aiCredential: 'sk-ant-test-not-a-real-key-0000000000',
    });
    Reflect.set(fakeBrowser.permissions, 'contains', () =>
      Promise.resolve(true),
    );

    const reply = await send(
      { type: 'applykit:ai-status' },
      fakeBrowser.runtime.id,
      page,
    );

    expect(reply).toMatchObject({ connected: true, keyHint: '0000' });
    expect(JSON.stringify(reply)).not.toContain('sk-ant-');
  });

  it('ignores AI settings messages from the panel or other extensions', async () => {
    const disconnect = { type: 'applykit:ai-disconnect' };
    await fakeBrowser.storage.session.set({
      aiCredential: 'sk-ant-test-not-a-real-key-0000000000',
    });

    expect(
      await send({ type: 'applykit:ai-status' }, fakeBrowser.runtime.id, panel),
    ).toBeUndefined();
    expect(
      await send(disconnect, fakeBrowser.runtime.id, panel),
    ).toBeUndefined();
    expect(await send(disconnect, 'another-extension', page)).toBeUndefined();
    expect(
      (await fakeBrowser.storage.session.get('aiCredential')).aiCredential,
    ).toBe('sk-ant-test-not-a-real-key-0000000000');
  });
});

describe('AI drafting preview', () => {
  it('offers nothing while AI drafting is not connected', async () => {
    expect(
      await send({
        type: 'applykit:ai-prepare',
        question: 'Describe your programming skills.',
        limits: {
          words: { min: null, max: null },
          characters: { min: null, max: null },
          sentences: { min: null, max: null },
          conflict: null,
        },
        role: '',
        employer: '',
        mode: 'draft',
        original: '',
      }),
    ).toEqual({ status: 'unavailable' });
  });
});

describe('AI drafting port', () => {
  function port(sender: Partial<Browser.runtime.MessageSender>) {
    const onMessage: ((message: unknown) => void)[] = [];
    const onDisconnect: (() => void)[] = [];
    const posted: unknown[] = [];
    const fake = {
      name: 'applykit:ai-draft',
      sender: sender as Browser.runtime.MessageSender,
      postMessage: vi.fn((message: unknown) => {
        posted.push(message);
      }),
      disconnect: vi.fn(),
      onMessage: {
        addListener: (listener: (message: unknown) => void) => {
          onMessage.push(listener);
        },
      },
      onDisconnect: {
        addListener: (listener: () => void) => {
          onDisconnect.push(listener);
        },
      },
    };
    return {
      fake,
      posted,
      send: (message: unknown) => {
        for (const listener of onMessage) listener(message);
      },
    };
  }

  async function connect(sender: Partial<Browser.runtime.MessageSender>) {
    const p = port(sender);
    for (const listener of connectListeners) listener(p.fake);
    await Promise.resolve();
    return p;
  }

  const request = {
    question: 'Describe your programming skills.',
    limits: {
      words: { min: null, max: null },
      characters: { min: null, max: null },
      sentences: { min: null, max: null },
      conflict: null,
    },
    role: '',
    employer: '',
    mode: 'draft',
    original: '',
    selected: ['skills'],
    previewed: '',
    approve: true,
  };

  it('closes ports from other extensions and frames', async () => {
    for (const sender of [
      { id: 'another-extension', tab: { id: 7 } as never, frameId: 0 },
      { id: fakeBrowser.runtime.id, tab: { id: 7 } as never, frameId: 2 },
      { id: fakeBrowser.runtime.id },
    ]) {
      const p = await connect(sender);
      expect(p.fake.disconnect).toHaveBeenCalled();
    }
  });

  it('drafts nothing while AI drafting is not connected', async () => {
    const p = await connect({
      id: fakeBrowser.runtime.id,
      tab: { id: 7 } as never,
      frameId: 0,
    });

    p.send(request);
    await vi.waitFor(() => {
      expect(p.posted).toEqual([{ status: 'unavailable' }]);
    });
  });

  it('rejects malformed requests', async () => {
    const p = await connect({
      id: fakeBrowser.runtime.id,
      tab: { id: 7 } as never,
      frameId: 0,
    });

    p.send({ ...request, selected: [{ text: 'my own context' }] });

    expect(p.posted).toEqual([
      { status: 'failed', failure: 'rejected', retryAfterSeconds: null },
    ]);
  });
});
