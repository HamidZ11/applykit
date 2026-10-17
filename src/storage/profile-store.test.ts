import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { validProfile } from '@/test/profile-fixtures';
import { hasSavedProfile } from './profile-presence';
import { browserProfileStore } from './profile-store';

beforeEach(() => {
  fakeBrowser.reset();
});

async function stored(key: string): Promise<unknown> {
  const items = await fakeBrowser.storage.local.get(key);
  return items[key];
}

describe('browserProfileStore', () => {
  it('reports empty when nothing has been saved', async () => {
    expect(await browserProfileStore.load()).toEqual({ status: 'empty' });
    expect(await hasSavedProfile()).toBe(false);
  });

  it('saves a profile and loads it back', async () => {
    const profile = validProfile();

    expect(await browserProfileStore.save(profile)).toEqual({
      status: 'saved',
      profile,
    });
    expect(await browserProfileStore.load()).toEqual({
      status: 'loaded',
      profile,
    });
    expect(await hasSavedProfile()).toBe(true);
  });

  it('replaces an existing profile when saving an update', async () => {
    await browserProfileStore.save(validProfile());
    const updated = validProfile('2026-11-01T09:00:00.000Z');
    updated.personal.preferredName = 'Al';

    await browserProfileStore.save(updated);

    const result = await browserProfileStore.load();
    expect(result).toEqual({ status: 'loaded', profile: updated });
  });

  it('reports malformed stored data as invalid instead of using it', async () => {
    await fakeBrowser.storage.local.set({
      profile: {
        personal: { firstName: 'Alex' },
        metadata: { schemaVersion: 1 },
      },
    });

    expect(await browserProfileStore.load()).toEqual({ status: 'invalid' });
  });

  it('keeps unreadable data as a backup before overwriting it', async () => {
    const corrupt = { not: 'a profile' };
    await fakeBrowser.storage.local.set({ profile: corrupt });

    await browserProfileStore.save(validProfile());

    expect(await stored('profileBackup')).toEqual(corrupt);
    expect(await browserProfileStore.load()).toMatchObject({
      status: 'loaded',
    });
  });

  it('does not create a backup when replacing a valid profile', async () => {
    await browserProfileStore.save(validProfile());
    await browserProfileStore.save(validProfile('2026-11-01T09:00:00.000Z'));

    expect(await stored('profileBackup')).toBeUndefined();
  });

  it('returns an error when storage cannot be read', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(
      new Error('storage unavailable'),
    );

    expect(await browserProfileStore.load()).toEqual({
      status: 'error',
      message: 'ApplyKit could not read your saved profile from this browser.',
    });
    expect(await hasSavedProfile()).toBe(false);
  });

  it('returns an error when storage cannot be written', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded'),
    );

    const result = await browserProfileStore.save(validProfile());

    expect(result).toMatchObject({ status: 'error' });
    expect(await stored('profile')).toBeUndefined();
  });
});
