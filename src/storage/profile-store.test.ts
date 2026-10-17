import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DRAFT_SCHEMA_VERSION, type StoredDraft } from '@/domain/profile-draft';
import { validDraft, validProfile } from '@/test/profile-fixtures';
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
  });

  it('saves a profile and loads it back', async () => {
    const profile = validProfile();

    expect(await browserProfileStore.save(profile, null)).toEqual({
      status: 'saved',
      profile,
    });
    expect(await browserProfileStore.load()).toEqual({
      status: 'loaded',
      profile,
      unmatchedCountry: null,
    });
  });

  it('replaces an existing profile when saving an update', async () => {
    await browserProfileStore.save(validProfile(), null);
    const updated = validProfile('2026-11-01T09:00:00.000Z');
    updated.personal.preferredName = 'Al';

    await browserProfileStore.save(updated, '2026-10-17T12:00:00.000Z');

    const result = await browserProfileStore.load();
    expect(result).toMatchObject({ status: 'loaded', profile: updated });
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

    await browserProfileStore.save(validProfile(), null);

    expect(await stored('profileBackup')).toEqual(corrupt);
    expect(await browserProfileStore.load()).toMatchObject({
      status: 'loaded',
    });
  });

  it('does not create a backup when replacing a valid profile', async () => {
    await browserProfileStore.save(validProfile(), null);
    const second = await browserProfileStore.save(
      validProfile('2026-11-01T09:00:00.000Z'),
      '2026-10-17T12:00:00.000Z',
    );

    expect(second.status).toBe('saved');
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
  });

  it('returns an error when storage cannot be written', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded'),
    );

    const result = await browserProfileStore.save(validProfile(), null);

    expect(result).toMatchObject({ status: 'error' });
    expect(await stored('profile')).toBeUndefined();
  });
});

describe('saving over a profile changed elsewhere', () => {
  const FIRST = '2026-10-17T12:00:00.000Z';

  it('refuses to overwrite a version this edit did not start from', async () => {
    await browserProfileStore.save(validProfile(FIRST), null);
    // Another tab saves first…
    const other = validProfile('2026-11-01T09:00:00.000Z');
    other.personal.preferredName = 'Lex';
    await browserProfileStore.save(other, FIRST);
    await browserProfileStore.saveDraft({
      schemaVersion: DRAFT_SCHEMA_VERSION,
      savedAt: '2026-11-01T09:05:00.000Z',
      basedOn: FIRST,
      step: 'review',
      furthest: 4,
      draft: validDraft(),
    });

    // …then this tab, still based on the first version, saves.
    const mine = validProfile('2026-11-01T09:10:00.000Z');
    const result = await browserProfileStore.save(mine, FIRST);

    expect(result).toEqual({ status: 'conflict', current: other });
    expect(await stored('profile')).toEqual(other);
    // Nothing of this tab's work is cleared.
    expect(await stored('profileDraft')).toBeDefined();
  });

  it('refuses a first save when a profile was saved meanwhile', async () => {
    await browserProfileStore.save(validProfile(FIRST), null);

    const result = await browserProfileStore.save(
      validProfile('2026-11-01T09:00:00.000Z'),
      null,
    );

    expect(result).toMatchObject({ status: 'conflict' });
  });

  it('replaces unreadable data with a backup rather than a conflict', async () => {
    await fakeBrowser.storage.local.set({ profile: { broken: true } });

    const result = await browserProfileStore.save(validProfile(), FIRST);

    expect(result.status).toBe('saved');
    expect(await stored('profileBackup')).toEqual({ broken: true });
  });

  it('lets only one of two simultaneous saves through when locks exist', async () => {
    await browserProfileStore.save(validProfile(FIRST), null);
    // A minimal Web Locks stand-in: one holder at a time, in order.
    let queue: Promise<unknown> = Promise.resolve();
    const locks = {
      request: <T>(_name: string, task: () => Promise<T>) => {
        const run = queue.then(task);
        queue = run.catch(() => undefined);
        return run;
      },
    };
    vi.stubGlobal('navigator', { locks });
    try {
      const results = await Promise.all([
        browserProfileStore.save(
          validProfile('2026-11-01T09:00:00.000Z'),
          FIRST,
        ),
        browserProfileStore.save(
          validProfile('2026-11-01T09:00:01.000Z'),
          FIRST,
        ),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([
        'conflict',
        'saved',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('drafts', () => {
  function draft(basedOn: string | null = null): StoredDraft {
    return {
      schemaVersion: DRAFT_SCHEMA_VERSION,
      savedAt: '2026-10-17T12:00:00.000Z',
      basedOn,
      step: 'education',
      furthest: 1,
      draft: validDraft(),
    };
  }

  it('reports no draft when none was saved', async () => {
    expect(await browserProfileStore.loadDraft()).toEqual({ status: 'none' });
  });

  it('saves a draft separately from the profile and loads it back', async () => {
    const saved = validProfile();
    await browserProfileStore.save(saved, null);

    expect(await browserProfileStore.saveDraft(draft())).toBe(true);

    expect(await browserProfileStore.loadDraft()).toEqual({
      status: 'loaded',
      draft: draft(),
    });
    expect(await stored('profile')).toEqual(saved);
  });

  it('clears the draft when a profile is saved', async () => {
    await browserProfileStore.saveDraft(draft());

    await browserProfileStore.save(validProfile(), null);

    expect(await stored('profileDraft')).toBeUndefined();
  });

  it('clears a draft on request', async () => {
    await browserProfileStore.saveDraft(draft());

    expect(await browserProfileStore.clearDraft()).toBe(true);
    expect(await browserProfileStore.loadDraft()).toEqual({ status: 'none' });
  });

  it('backs up an unreadable draft instead of restoring it', async () => {
    const unreadable = { step: 'personal' };
    await fakeBrowser.storage.local.set({ profileDraft: unreadable });

    expect(await browserProfileStore.loadDraft()).toEqual({ status: 'none' });
    expect(await stored('profileDraft')).toBeUndefined();
    expect(await stored('profileDraftBackup')).toEqual(unreadable);
  });

  it('keeps a draft with very long unfinished values', async () => {
    const long = draft();
    long.draft.employment = [
      {
        id: 'role-1',
        employer: 'Example Ltd',
        title: 'Engineer',
        employmentType: '',
        startDate: '',
        endDate: '',
        current: false,
        description: 'x'.repeat(20_000),
      },
    ];
    await browserProfileStore.saveDraft(long);

    expect(await browserProfileStore.loadDraft()).toEqual({
      status: 'loaded',
      draft: long,
    });
  });

  it('reports draft storage failures without throwing', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValue(
      new Error('QUOTA_BYTES quota exceeded'),
    );
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValue(
      new Error('storage unavailable'),
    );

    expect(await browserProfileStore.saveDraft(draft())).toBe(false);
    expect(await browserProfileStore.loadDraft()).toEqual({ status: 'error' });
  });
});
