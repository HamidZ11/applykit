import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { GET_AUTOFILL_VALUES, OPEN_PROFILE } from '@/messages';
import { browserProfileStore } from '@/storage/profile-store';
import { fullProfile } from '@/test/autofill-fixtures';
import background from '@/entrypoints/background';

let setAccessLevel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeBrowser.reset();
  setAccessLevel = vi.fn().mockResolvedValue(undefined);
  Reflect.set(fakeBrowser.storage.local, 'setAccessLevel', setAccessLevel);
  background.main();
});

/** Only the parts of a sender the background reads. */
function sender(
  id: string,
  frame: { tab?: { id: number }; frameId?: number },
): Browser.runtime.MessageSender {
  return { id, ...frame } as Browser.runtime.MessageSender;
}

/** Delivers a message as the browser would, and waits for the reply. */
async function send(
  message: unknown,
  senderId = fakeBrowser.runtime.id,
  frame: { tab?: { id: number }; frameId?: number } = {
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
    await browserProfileStore.save(fullProfile());

    expect(await send(GET_AUTOFILL_VALUES)).toMatchObject({
      status: 'ready',
      values: { text: { firstName: 'Alex' } },
    });
  });

  it('answers that no profile is saved', async () => {
    expect(await send(GET_AUTOFILL_VALUES)).toEqual({ status: 'missing' });
  });

  it('ignores messages from anything but ApplyKit itself', async () => {
    await browserProfileStore.save(fullProfile());

    expect(
      await send(GET_AUTOFILL_VALUES, 'another-extension'),
    ).toBeUndefined();
  });

  it('opens the profile page on request', async () => {
    const open = vi
      .spyOn(fakeBrowser.runtime, 'openOptionsPage')
      .mockResolvedValue(undefined);

    await send(OPEN_PROFILE);

    expect(open).toHaveBeenCalledTimes(1);
  });

  it('answers the panel in a tab’s top frame and extension pages', async () => {
    await browserProfileStore.save(fullProfile());

    expect(await send(GET_AUTOFILL_VALUES)).toMatchObject({ status: 'ready' });
    expect(
      await send(GET_AUTOFILL_VALUES, fakeBrowser.runtime.id, {}),
    ).toMatchObject({ status: 'ready' });
  });

  it('never sends profile values into a frame within a page', async () => {
    await browserProfileStore.save(fullProfile());

    expect(
      await send(GET_AUTOFILL_VALUES, fakeBrowser.runtime.id, {
        tab: { id: 7 },
        frameId: 3,
      }),
    ).toBeUndefined();
  });

  it('ignores unknown messages', async () => {
    expect(await send({ type: 'applykit:unknown' })).toBeUndefined();
  });
});
