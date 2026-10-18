import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  browserCredentialStore as store,
  isApiKeyShape,
  restrictSessionStorage,
} from './ai-credential';

const KEY = 'sk-ant-test-not-a-real-key-0000000000';
const OTHER = 'sk-ant-test-not-a-real-key-1111111111';

async function stored() {
  return {
    session: (await fakeBrowser.storage.session.get('aiCredential'))
      .aiCredential,
    local: (await fakeBrowser.storage.local.get('aiCredential')).aiCredential,
  };
}

beforeEach(() => {
  fakeBrowser.reset();
});

describe('credential storage', () => {
  it('has no key until one is saved', async () => {
    expect(await store.load()).toBeNull();
  });

  it('keeps a key for the session by default', async () => {
    expect(await store.save(KEY, false)).toBe(true);

    expect(await store.load()).toEqual({ key: KEY, remembered: false });
    expect(await stored()).toEqual({ session: KEY, local: undefined });
  });

  it('remembers a key on this device only when asked', async () => {
    await store.save(KEY, false);

    await store.save(OTHER, true);

    expect(await store.load()).toEqual({ key: OTHER, remembered: true });
    expect(await stored()).toEqual({ session: undefined, local: OTHER });
  });

  it('forgets a remembered key when switched to the session', async () => {
    await store.save(KEY, true);

    await store.save(KEY, false);

    expect(await stored()).toEqual({ session: KEY, local: undefined });
  });

  it('removes the key from both places', async () => {
    await fakeBrowser.storage.session.set({ aiCredential: KEY });
    await fakeBrowser.storage.local.set({ aiCredential: OTHER });

    expect(await store.remove()).toBe(true);

    expect(await store.load()).toBeNull();
    expect(await stored()).toEqual({ session: undefined, local: undefined });
  });

  it('refuses and ignores anything that is not a key', async () => {
    expect(await store.save('not a key', false)).toBe(false);
    await fakeBrowser.storage.local.set({ aiCredential: { key: KEY } });

    expect(await store.load()).toBeNull();
    expect(isApiKeyShape(KEY)).toBe(true);
    expect(isApiKeyShape(`${KEY} `)).toBe(false);
    expect(isApiKeyShape('sk-ant-short')).toBe(false);
  });

  it('reports a failed save', async () => {
    vi.spyOn(fakeBrowser.storage.session, 'set').mockRejectedValueOnce(
      new Error('quota'),
    );

    expect(await store.save(KEY, false)).toBe(false);
  });

  it('limits session storage to trusted contexts where supported', async () => {
    const setAccessLevel = vi.fn(() => Promise.resolve());

    await restrictSessionStorage({ setAccessLevel });
    await restrictSessionStorage(undefined);
    await restrictSessionStorage({
      setAccessLevel: () => Promise.reject(new Error('unsupported')),
    });

    expect(setAccessLevel).toHaveBeenCalledWith({
      accessLevel: 'TRUSTED_CONTEXTS',
    });
  });
});
