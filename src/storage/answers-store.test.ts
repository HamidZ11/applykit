import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { emptyAnswers } from '@/domain/application-answers';
import { savedAnswers } from '@/test/answer-fixtures';
import { validProfile } from '@/test/profile-fixtures';
import { browserAnswersStore } from './answers-store';
import { loadAutofillValues } from './autofill-source';
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
      damaged: [],
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

    expect(await stored('applicationAnswersBackup')).toEqual([
      { backedUpAt: FIRST.toISOString(), data: corrupt },
    ]);
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

    expect(await stored('applicationAnswersBackup')).toEqual([
      { backedUpAt: SECOND.toISOString(), data: raw },
    ]);
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

describe('answers from a newer ApplyKit', () => {
  const newer = {
    schemaVersion: 2,
    answers: { noticePeriod: { weeks: 4 }, commute: { minutes: 45 } },
    updatedAt: '2027-03-01T09:00:00.000Z',
    device: 'example',
  };

  it('reports them as unsupported instead of unreadable', async () => {
    await fakeBrowser.storage.local.set({ applicationAnswers: newer });

    expect(await browserAnswersStore.load()).toEqual({
      status: 'unsupported',
    });
  });

  it('never writes over them, and keeps them exactly', async () => {
    await fakeBrowser.storage.local.set({ applicationAnswers: newer });

    expect(await browserAnswersStore.save(savedAnswers(), null, FIRST)).toEqual(
      { status: 'unsupported' },
    );
    expect(await stored('applicationAnswers')).toEqual(newer);
    expect(await stored('applicationAnswersBackup')).toBeUndefined();
  });

  it('sends no answers to the panel rather than empty ones', async () => {
    await fakeBrowser.storage.local.set({ applicationAnswers: newer });
    await browserProfileStore.save(validProfile(), null);

    const response = await loadAutofillValues(
      browserProfileStore,
      browserAnswersStore,
    );

    expect(response).toMatchObject({
      status: 'ready',
      values: { answers: null },
    });
  });
});

describe('fields this version does not know', () => {
  it('keeps them when saving', async () => {
    const stored1 = {
      schemaVersion: 1,
      answers: { ...savedAnswers(), commute: { minutes: 45 } },
      updatedAt: FIRST.toISOString(),
      note: 'kept',
    };
    await fakeBrowser.storage.local.set({ applicationAnswers: stored1 });

    await browserAnswersStore.save(
      { ...savedAnswers(), workArrangement: 'remote' },
      FIRST.toISOString(),
      SECOND,
    );

    expect(await stored('applicationAnswers')).toEqual({
      schemaVersion: 1,
      answers: {
        ...savedAnswers(),
        workArrangement: 'remote',
        commute: { minutes: 45 },
      },
      updatedAt: SECOND.toISOString(),
      note: 'kept',
    });
  });
});

describe('backups of damaged answers', () => {
  it('keeps every damaged copy, not only the latest', async () => {
    await fakeBrowser.storage.local.set({ applicationAnswers: { first: 1 } });
    await browserAnswersStore.save(savedAnswers(), null, FIRST);
    await fakeBrowser.storage.local.set({ applicationAnswers: 'second' });
    await browserAnswersStore.save(savedAnswers(), null, SECOND);

    expect(await stored('applicationAnswersBackup')).toEqual([
      { backedUpAt: FIRST.toISOString(), data: { first: 1 } },
      { backedUpAt: SECOND.toISOString(), data: 'second' },
    ]);
  });

  it('keeps a backup written by the earlier format', async () => {
    await fakeBrowser.storage.local.set({
      applicationAnswersBackup: { older: true },
      applicationAnswers: 'damaged',
    });

    await browserAnswersStore.save(savedAnswers(), null, FIRST);

    expect(await stored('applicationAnswersBackup')).toEqual([
      { backedUpAt: null, data: { older: true } },
      { backedUpAt: FIRST.toISOString(), data: 'damaged' },
    ]);
  });

  it.each([
    ['a string', 'answers'],
    ['a missing version', { answers: {}, updatedAt: FIRST.toISOString() }],
    ['a version that is not a number', { schemaVersion: 'two', answers: {} }],
    ['a version below 1', { schemaVersion: 0, answers: {} }],
    [
      'answers that are not an object',
      { schemaVersion: 1, answers: 'x', updatedAt: FIRST.toISOString() },
    ],
  ])('treats %s as damaged, not newer', async (_, value) => {
    await fakeBrowser.storage.local.set({ applicationAnswers: value });

    expect(await browserAnswersStore.load()).toMatchObject({
      status: 'loaded',
      damaged: 'all',
    });
  });
});
