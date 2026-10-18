import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browserSettingsStore } from './settings-store';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('browserSettingsStore', () => {
  it('keeps developer diagnostics off by default', async () => {
    expect(await browserSettingsStore.loadDiagnostics()).toBe(false);
  });

  it('remembers the setting', async () => {
    expect(await browserSettingsStore.saveDiagnostics(true)).toBe(true);
    expect(await browserSettingsStore.loadDiagnostics()).toBe(true);

    await browserSettingsStore.saveDiagnostics(false);
    expect(await browserSettingsStore.loadDiagnostics()).toBe(false);
  });

  it.each(['true', 1, { on: true }, [true]])(
    'never turns them on from unexpected data (%j), nor removes it',
    async (value) => {
      await fakeBrowser.storage.local.set({ developerDiagnostics: value });

      expect(await browserSettingsStore.loadDiagnostics()).toBe(false);
      expect(
        (await fakeBrowser.storage.local.get('developerDiagnostics'))
          .developerDiagnostics,
      ).toEqual(value);
    },
  );

  it('keeps them off when storage cannot be read', async () => {
    await browserSettingsStore.saveDiagnostics(true);
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(
      new Error('unavailable'),
    );

    expect(await browserSettingsStore.loadDiagnostics()).toBe(false);
  });

  it('says when the setting could not be saved', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('quota'),
    );

    expect(await browserSettingsStore.saveDiagnostics(true)).toBe(false);
  });

  it('is stored apart from the profile and the saved answers', async () => {
    await browserSettingsStore.saveDiagnostics(true);

    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toEqual([
      'developerDiagnostics',
    ]);
  });
});
