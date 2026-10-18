import { describe, expect, it } from 'vitest';
import { savedAnswers } from '@/test/answer-fixtures';
import { emptyAnswers, isCalendarDate } from './application-answers';
import { answerProblem, parseStoredAnswers } from './answers-schema';

const stored = (answers: Record<string, unknown>) => ({
  schemaVersion: 1,
  answers,
  updatedAt: '2026-10-18T12:00:00.000Z',
});

describe('answerProblem', () => {
  it('accepts well-formed answers', () => {
    const answers = savedAnswers();
    for (const [category, value] of Object.entries(answers)) {
      expect(
        answerProblem(category as keyof typeof answers, value),
        category,
      ).toBeNull();
    }
  });

  it.each([
    ['noticePeriod', { amount: 2.5, unit: 'weeks' }, 'Enter a whole number'],
    ['noticePeriod', { amount: -1, unit: 'weeks' }, 'Enter 0 or more'],
    [
      'relocation',
      { withinCountry: null, abroad: null },
      'Answer at least one of the two questions',
    ],
    ['startDate', '2027-02-30', 'Enter a date, for example 2027-01-04'],
    [
      'salary',
      { amount: 0, currency: 'GBP', period: 'year' },
      'Enter an amount above 0',
    ],
    [
      'salary',
      { amount: 30000.125, currency: 'GBP', period: 'year' },
      'Use at most two decimal places',
    ],
  ] as const)('rejects %s %j', (category, value, message) => {
    expect(answerProblem(category, value)).toBe(message);
  });

  it('accepts only the fixed lists of units, currencies and choices', () => {
    expect(
      answerProblem('noticePeriod', { amount: 4, unit: 'fortnights' }),
    ).not.toBeNull();
    expect(answerProblem('workArrangement', 'four-day week')).not.toBeNull();
    expect(
      answerProblem('salary', { amount: 1, currency: 'XYZ', period: 'year' }),
    ).not.toBeNull();
  });
});

describe('isCalendarDate', () => {
  it.each([
    ['2027-01-04', true],
    ['2028-02-29', true],
    ['2027-02-29', false],
    ['2027-13-01', false],
    ['04/01/2027', false],
  ])('%s → %s', (value, expected) => {
    expect(isCalendarDate(value)).toBe(expected);
  });
});

describe('parseStoredAnswers', () => {
  it('reads saved answers back', () => {
    expect(parseStoredAnswers(stored({ ...savedAnswers() }))).toEqual({
      saved: {
        schemaVersion: 1,
        answers: savedAnswers(),
        updatedAt: '2026-10-18T12:00:00.000Z',
      },
      damaged: [],
    });
  });

  it('keeps readable answers when one is damaged', () => {
    const read = parseStoredAnswers(
      stored({
        ...savedAnswers(),
        salary: { amount: 'lots', currency: 'GBP', period: 'year' },
      }),
    );

    expect(read?.damaged).toEqual(['salary']);
    expect(read?.saved.answers).toEqual({ ...savedAnswers(), salary: null });
  });

  it('treats missing categories as not saved', () => {
    expect(
      parseStoredAnswers(stored({ workArrangement: 'remote' }))?.saved.answers,
    ).toEqual({ ...emptyAnswers(), workArrangement: 'remote' });
  });

  it('ignores anything that is not a known category', () => {
    const read = parseStoredAnswers(
      stored({ ethnicity: 'example', 'Why do you want this job?': 'text' }),
    );

    expect(read?.saved.answers).toEqual(emptyAnswers());
    expect(read?.damaged).toEqual([]);
  });

  it.each([
    null,
    'answers',
    { schemaVersion: 2, answers: {}, updatedAt: '2026-10-18T12:00:00.000Z' },
    { schemaVersion: 1, answers: {}, updatedAt: 'yesterday' },
    { schemaVersion: 1, updatedAt: '2026-10-18T12:00:00.000Z' },
  ])('rejects data that is not saved answers: %j', (value) => {
    expect(parseStoredAnswers(value)).toBeNull();
  });
});
