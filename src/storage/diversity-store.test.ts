import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { emptyDiversity } from '@/domain/diversity';
import { savedDiversity } from '@/test/diversity-fixtures';
import { browserAnswersStore } from './answers-store';
import { browserDiversityStore } from './diversity-store';
import { browserProfileStore } from './profile-store';

const FIRST = new Date('2026-10-18T12:00:00.000Z');
const SECOND = new Date('2026-10-18T13:00:00.000Z');

beforeEach(() => {
  fakeBrowser.reset();
});

async function stored(key: string): Promise<unknown> {
  return (await fakeBrowser.storage.local.get(key))[key];
}

describe('browserDiversityStore', () => {
  it('starts empty, with reuse off', async () => {
    expect(await browserDiversityStore.load()).toEqual({
      status: 'loaded',
      preferences: emptyDiversity(),
      updatedAt: null,
      damaged: [],
    });
    expect(emptyDiversity().reuse).toBe(false);
  });

  it('saves, reloads, edits and clears one answer', async () => {
    await browserDiversityStore.save(savedDiversity(), null, FIRST);
    expect(await browserDiversityStore.load()).toMatchObject({
      preferences: savedDiversity(),
      updatedAt: FIRST.toISOString(),
    });

    const edited = savedDiversity();
    edited.answers.religion = null;
    edited.answers.gender = 'woman';
    await browserDiversityStore.save(edited, FIRST.toISOString(), SECOND);

    expect(await browserDiversityStore.load()).toMatchObject({
      preferences: edited,
    });
  });

  it('never overwrites a save from another tab', async () => {
    await browserDiversityStore.save(savedDiversity(), null, FIRST);
    const other = { ...savedDiversity(), reuse: false };
    await browserDiversityStore.save(other, FIRST.toISOString(), SECOND);

    const result = await browserDiversityStore.save(
      emptyDiversity(),
      FIRST.toISOString(),
      new Date('2026-10-18T14:00:00.000Z'),
    );

    expect(result).toMatchObject({
      status: 'conflict',
      current: { preferences: other },
    });
    expect(await browserDiversityStore.load()).toMatchObject({
      preferences: other,
    });
  });

  it('turns reuse on only for a stored true', async () => {
    for (const reuse of ['true', 1, 'yes', null]) {
      await fakeBrowser.storage.local.set({
        diversityPreferences: {
          schemaVersion: 1,
          preferences: { reuse, answers: { disability: 'no' } },
          updatedAt: FIRST.toISOString(),
        },
      });
      expect(await browserDiversityStore.load(), String(reuse)).toMatchObject({
        preferences: { reuse: false, answers: { disability: 'no' } },
      });
    }
  });

  it('never maps an unknown choice to another, and reports it', async () => {
    await fakeBrowser.storage.local.set({
      diversityPreferences: {
        schemaVersion: 1,
        preferences: {
          reuse: true,
          answers: { gender: 'female', ethnicity: 'indian' },
        },
        updatedAt: FIRST.toISOString(),
      },
    });

    expect(await browserDiversityStore.load()).toMatchObject({
      preferences: { answers: { gender: null, ethnicity: 'indian' } },
      damaged: ['gender'],
    });
  });

  it('backs up damaged data, keeping every copy', async () => {
    await fakeBrowser.storage.local.set({ diversityPreferences: 'damaged' });
    expect(await browserDiversityStore.load()).toMatchObject({
      damaged: 'all',
      preferences: emptyDiversity(),
    });

    await browserDiversityStore.save(savedDiversity(), null, FIRST);
    await fakeBrowser.storage.local.set({ diversityPreferences: 'again' });
    await browserDiversityStore.save(savedDiversity(), null, SECOND);

    expect(await stored('diversityPreferencesBackup')).toEqual([
      { backedUpAt: FIRST.toISOString(), data: 'damaged' },
      { backedUpAt: SECOND.toISOString(), data: 'again' },
    ]);
  });

  it('never writes over preferences from a newer version', async () => {
    const newer = {
      schemaVersion: 2,
      preferences: { reuse: true, answers: {} },
      updatedAt: FIRST.toISOString(),
    };
    await fakeBrowser.storage.local.set({ diversityPreferences: newer });

    expect(await browserDiversityStore.load()).toEqual({
      status: 'unsupported',
    });
    expect(
      await browserDiversityStore.save(savedDiversity(), null, SECOND),
    ).toEqual({ status: 'unsupported' });
    expect(await stored('diversityPreferences')).toEqual(newer);
  });

  it('keeps fields this version does not know', async () => {
    await fakeBrowser.storage.local.set({
      diversityPreferences: {
        schemaVersion: 1,
        preferences: {
          reuse: false,
          answers: { disability: 'no', caring: 'example' },
          note: 'kept',
        },
        updatedAt: FIRST.toISOString(),
        device: 'kept',
      },
    });

    await browserDiversityStore.save(
      {
        ...emptyDiversity(),
        answers: { ...emptyDiversity().answers, disability: 'yes' },
      },
      FIRST.toISOString(),
      SECOND,
    );

    expect(await stored('diversityPreferences')).toMatchObject({
      device: 'kept',
      preferences: {
        note: 'kept',
        answers: { disability: 'yes', caring: 'example' },
      },
    });
  });

  it('deletes everything, including backups, when cleared', async () => {
    await fakeBrowser.storage.local.set({
      diversityPreferences: 'damaged',
      diversityPreferencesBackup: [{ backedUpAt: null, data: 'x' }],
    });

    expect(await browserDiversityStore.clearAll()).toBe(true);

    expect(await stored('diversityPreferences')).toBeUndefined();
    expect(await stored('diversityPreferencesBackup')).toBeUndefined();
  });

  it('reports storage failures without changing anything', async () => {
    await browserDiversityStore.save(savedDiversity(), null, FIRST);
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(
      new Error('unavailable'),
    );
    expect(await browserDiversityStore.load()).toEqual({ status: 'error' });

    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('quota'),
    );
    expect(
      await browserDiversityStore.save(
        emptyDiversity(),
        FIRST.toISOString(),
        SECOND,
      ),
    ).toEqual({ status: 'error' });
    expect(await browserDiversityStore.load()).toMatchObject({
      preferences: savedDiversity(),
    });
  });

  it('is independent of the profile and the saved answers', async () => {
    await browserDiversityStore.save(savedDiversity(), null, FIRST);
    await fakeBrowser.storage.local.set({ profile: { broken: true } });

    expect(await browserProfileStore.load()).toEqual({ status: 'invalid' });
    expect(await browserAnswersStore.load()).toMatchObject({
      status: 'loaded',
      updatedAt: null,
    });
    expect(await browserDiversityStore.load()).toMatchObject({
      preferences: savedDiversity(),
    });
  });
});
