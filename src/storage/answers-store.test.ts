import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { emptyAnswers } from '@/domain/application-answers';
import { savedAnswers } from '@/test/answer-fixtures';
import { validProfile } from '@/test/profile-fixtures';
import { browserAnswersStore } from './answers-store';
import { browserProfileStore } from './profile-store';

const FIRST = new Date('2026-10-18T12:00:00.000Z');
const SECOND = new Date('2026-10-18T13:00:00.000Z');

beforeEach(() => {
  fakeBrowser.reset();
});

async function stored(key: string): Promise<unknown> {
  const items = await fakeBrowser.storage.local.get(key);
  return items[key];
}

describe('browserAnswersStore', () => {
  it('starts with nothing saved', async () => {
    expect(await browserAnswersStore.load()).toEqual({
      status: 'loaded',
      answers: emptyAnswers(),
      updatedAt: null,
      damaged: [],
    });
  });

  it('saves answers and loads them back', async () => {
    const result = await browserAnswersStore.save(savedAnswers(), null, FIRST);

    expect(result).toMatchObject({ status: 'saved' });
    expect(await browserAnswersStore.load()).toEqual({
      status: 'loaded',
      answers: savedAnswers(),
      updatedAt: FIRST.toISOString(),
      damaged: [],
    });
  });

  it('edits and removes an answer', async () => {
    await browserAnswersStore.save(savedAnswers(), null, FIRST);
    const edited = {
      ...savedAnswers(),
      noticePeriod: { amount: 1, unit: 'months' as const },
      salary: null,
    };

    await browserAnswersStore.save(edited, FIRST.toISOString(), SECOND);

    expect(await browserAnswersStore.load()).toMatchObject({
      answers: edited,
      updatedAt: SECOND.toISOString(),
    });
  });

  it('never overwrites answers saved in another tab', async () => {
    await browserAnswersStore.save(savedAnswers(), null, FIRST);
    const otherTab = { ...savedAnswers(), workArrangement: 'remote' as const };
    await browserAnswersStore.save(otherTab, FIRST.toISOString(), SECOND);

    // This tab still edits the first version.
    const result = await browserAnswersStore.save(
      emptyAnswers(),
      FIRST.toISOString(),
      new Date('2026-10-18T14:00:00.000Z'),
    );

    expect(result).toEqual({
      status: 'conflict',
      current: {
        schemaVersion: 1,
        answers: otherTab,
        updatedAt: SECOND.toISOString(),
      },
    });
    expect(await browserAnswersStore.load()).toMatchObject({
      answers: otherTab,
    });
  });

  it('reports data it cannot read and backs it up before replacing it', async () => {
    const corrupt = { not: 'answers' };
    await fakeBrowser.storage.local.set({ applicationAnswers: corrupt });

    expect(await browserAnswersStore.load()).toMatchObject({
      status: 'loaded',
      answers: emptyAnswers(),
      updatedAt: null,
      damaged: 'all',
    });

    await browserAnswersStore.save(savedAnswers(), null, FIRST);

    expect(await stored('applicationAnswersBackup')).toEqual(corrupt);
    expect(await browserAnswersStore.load()).toMatchObject({
      answers: savedAnswers(),
    });
  });

  it('backs up a damaged answer before saving over it', async () => {
    const raw = {
      schemaVersion: 1,
      answers: { ...savedAnswers(), salary: { amount: 'lots' } },
      updatedAt: FIRST.toISOString(),
    };
    await fakeBrowser.storage.local.set({ applicationAnswers: raw });
    expect(await browserAnswersStore.load()).toMatchObject({
      damaged: ['salary'],
      answers: { ...savedAnswers(), salary: null },
    });

    await browserAnswersStore.save(
      { ...savedAnswers(), salary: null },
      FIRST.toISOString(),
      SECOND,
    );

    expect(await stored('applicationAnswersBackup')).toEqual(raw);
  });

  it('reports storage failures instead of throwing', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(
      new Error('quota'),
    );
    expect(await browserAnswersStore.load()).toEqual({ status: 'error' });

    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('quota'),
    );
    expect(await browserAnswersStore.save(savedAnswers(), null, FIRST)).toEqual(
      { status: 'error' },
    );
  });

  it('is independent of the profile', async () => {
    await fakeBrowser.storage.local.set({ profile: { broken: true } });
    await browserAnswersStore.save(savedAnswers(), null, FIRST);

    expect(await browserProfileStore.load()).toEqual({ status: 'invalid' });
    expect(await browserAnswersStore.load()).toMatchObject({
      answers: savedAnswers(),
    });

    await browserProfileStore.save(validProfile(), null);
    expect(await browserAnswersStore.load()).toMatchObject({
      answers: savedAnswers(),
      updatedAt: FIRST.toISOString(),
    });
  });
});
