import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browserCredentialStore } from '@/storage/ai-credential';
import {
  browserAiSettingsStore,
  browserAiUsageStore,
} from '@/storage/ai-settings';
import type { Fetch } from './anthropic';
import {
  aiAvailable,
  aiStatus,
  connect,
  disconnect,
  type ConnectionDeps,
} from './connection';
import type { HostAccess } from './host-access';

const KEY = 'sk-ant-test-not-a-real-key-0000000000';
const NOW = new Date(2026, 9, 18, 12);

function host(granted = true): HostAccess & { removed: boolean } {
  const state = { granted, removed: false };
  return {
    get removed() {
      return state.removed;
    },
    granted: () => Promise.resolve(state.granted),
    request: () => Promise.resolve(state.granted),
    remove: () => {
      state.removed = true;
      state.granted = false;
      return Promise.resolve();
    },
  };
}

function accepts(status = 200) {
  return vi.fn<Fetch>(() =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          status === 200
            ? { input_tokens: 8 }
            : { error: { type: 'authentication_error' } },
        ),
        { status },
      ),
    ),
  );
}

function deps(over: Partial<ConnectionDeps> = {}): ConnectionDeps {
  return {
    credentials: browserCredentialStore,
    host: host(),
    settings: browserAiSettingsStore,
    usage: browserAiUsageStore,
    fetch: accepts(),
    now: () => NOW,
    ...over,
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('AI connection', () => {
  it('is not connected and not available by default', async () => {
    expect(await aiStatus(deps())).toEqual({
      connected: false,
      remembered: false,
      keyHint: null,
      permission: true,
      model: 'fast',
      dailyLimit: 50,
      requestsToday: 0,
      estimatedCostToday: 0,
      writingSample: '',
      avoid: '',
    });
    expect(await aiAvailable(deps())).toBe(false);
  });

  it('keeps an accepted key for the session and shows only its end', async () => {
    const result = await connect(deps(), `  ${KEY} `, false);

    expect(result).toMatchObject({
      ok: true,
      status: { connected: true, remembered: false, keyHint: '0000' },
    });
    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(await browserCredentialStore.load()).toEqual({
      key: KEY,
      remembered: false,
    });
    expect(await aiAvailable(deps())).toBe(true);
  });

  it('remembers the key only when asked', async () => {
    await connect(deps(), KEY, true);

    expect(await browserCredentialStore.load()).toEqual({
      key: KEY,
      remembered: true,
    });
  });

  it('keeps nothing when Anthropic rejects the key', async () => {
    expect(await connect(deps({ fetch: accepts(401) }), KEY, false)).toEqual({
      ok: false,
      failure: 'invalid-key',
    });
    expect(await browserCredentialStore.load()).toBeNull();
  });

  it('sends nothing without the host permission or a key-shaped value', async () => {
    const fetch = accepts();

    expect(
      await connect(deps({ fetch, host: host(false) }), KEY, false),
    ).toEqual({ ok: false, failure: 'no-permission' });
    expect(await connect(deps({ fetch }), 'my password', false)).toEqual({
      ok: false,
      failure: 'not-a-key',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('is unavailable when the permission was removed', async () => {
    await connect(deps(), KEY, false);

    expect(await aiAvailable(deps({ host: host(false) }))).toBe(false);
    expect(await aiStatus(deps({ host: host(false) }))).toMatchObject({
      connected: true,
      permission: false,
    });
  });

  it('removes the key and the permission on disconnect', async () => {
    const access = host();
    await connect(deps({ host: access }), KEY, true);

    expect(await disconnect(deps({ host: access }))).toBe(true);

    expect(await browserCredentialStore.load()).toBeNull();
    expect(access.removed).toBe(true);
    expect(await aiStatus(deps({ host: access }))).toMatchObject({
      connected: false,
      keyHint: null,
    });
  });
});
