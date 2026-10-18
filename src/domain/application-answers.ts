import { z } from 'zod';

/**
 * Saved answers to common application questions: notice period,
 * relocation, working arrangement, earliest start date and salary
 * expectation. A fixed set of typed categories, never free-form questions,
 * so nothing can be saved for a question ApplyKit must not answer
 * (ADR 0016). Kept apart from the profile: each is saved and recovered on
 * its own.
 */

export const ANSWERS_SCHEMA_VERSION = 1;

export const ANSWER_CATEGORIES = [
  'noticePeriod',
  'relocation',
  'workArrangement',
  'startDate',
  'salary',
] as const;

export type AnswerCategory = (typeof ANSWER_CATEGORIES)[number];

export const NOTICE_UNITS = ['days', 'weeks', 'months'] as const;
export type NoticeUnit = (typeof NOTICE_UNITS)[number];

export interface NoticePeriod {
  /** Whole days, weeks or months; 0 means no notice is needed. */
  amount: number;
  unit: NoticeUnit;
}

export const WILLINGNESS = ['yes', 'no', 'depends'] as const;
export type Willingness = (typeof WILLINGNESS)[number];

/** Each part is null when the user has not said. */
export interface Relocation {
  /** Moving within the country the user lives in. */
  withinCountry: Willingness | null;
  /** Moving to another country. */
  abroad: Willingness | null;
}

export const WORK_ARRANGEMENTS = [
  'remote',
  'hybrid',
  'on-site',
  'flexible',
] as const;
export type WorkArrangement = (typeof WORK_ARRANGEMENTS)[number];

export const SALARY_PERIODS = ['year', 'month', 'day', 'hour'] as const;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number];

export const CURRENCIES = [
  'GBP',
  'EUR',
  'USD',
  'CAD',
  'AUD',
  'CHF',
  'INR',
  'SGD',
] as const;
export type Currency = (typeof CURRENCIES)[number];

export interface Salary {
  amount: number;
  currency: Currency;
  period: SalaryPeriod;
}

/** Every category; null when nothing is saved for it. */
export interface ApplicationAnswers {
  noticePeriod: NoticePeriod | null;
  relocation: Relocation | null;
  workArrangement: WorkArrangement | null;
  /** The earliest start date, "YYYY-MM-DD". */
  startDate: string | null;
  salary: Salary | null;
}

export interface SavedAnswers {
  schemaVersion: typeof ANSWERS_SCHEMA_VERSION;
  answers: ApplicationAnswers;
  /** ISO 8601; also the version a later save must start from. */
  updatedAt: string;
}

export function emptyAnswers(): ApplicationAnswers {
  return {
    noticePeriod: null,
    relocation: null,
    workArrangement: null,
    startDate: null,
    salary: null,
  };
}

/** A real calendar date written as "YYYY-MM-DD". */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = [match[1], match[2], match[3]].map(Number) as [
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

const willingness = z.enum(WILLINGNESS).nullable();

/** The rules each category must meet, when saving and when read back. */
const CATEGORY_SCHEMAS = {
  noticePeriod: z.object({
    amount: z
      .number()
      .int('Enter a whole number')
      .min(0, 'Enter 0 or more')
      .max(365, 'Enter a shorter notice period'),
    unit: z.enum(NOTICE_UNITS),
  }),
  relocation: z
    .object({ withinCountry: willingness, abroad: willingness })
    .refine(
      (value) => value.withinCountry !== null || value.abroad !== null,
      'Answer at least one of the two questions',
    ),
  workArrangement: z.enum(WORK_ARRANGEMENTS),
  startDate: z
    .string()
    .refine(isCalendarDate, 'Enter a date, for example 2027-01-04'),
  salary: z.object({
    amount: z
      .number()
      .positive('Enter an amount above 0')
      .max(10_000_000, 'Enter a smaller amount')
      .refine(
        (value) => Number.isInteger(value * 100),
        'Use at most two decimal places',
      ),
    currency: z.enum(CURRENCIES),
    period: z.enum(SALARY_PERIODS),
  }),
} satisfies Record<AnswerCategory, z.ZodType>;

/** Why a category's value cannot be saved, or null when it can. */
export function answerProblem(
  category: AnswerCategory,
  value: unknown,
): string | null {
  const result = CATEGORY_SCHEMAS[category].safeParse(value);
  return result.success
    ? null
    : (result.error.issues[0]?.message ?? 'Check this answer');
}

const storedSchema = z.object({
  schemaVersion: z.literal(ANSWERS_SCHEMA_VERSION),
  answers: z.record(z.string(), z.unknown()),
  updatedAt: z.iso.datetime(),
});

export interface StoredAnswersRead {
  saved: SavedAnswers;
  /**
   * Categories whose stored value could not be read. They are treated as
   * not saved, and the original data is backed up before it is replaced.
   */
  damaged: AnswerCategory[];
}

/**
 * Reads stored answers. Each category is read on its own, so one damaged
 * answer never makes the others unusable. Null when the data is not saved
 * answers at all, or comes from an unknown schema version.
 */
export function parseStoredAnswers(value: unknown): StoredAnswersRead | null {
  const stored = storedSchema.safeParse(value);
  if (!stored.success) return null;
  const answers = emptyAnswers();
  const damaged: AnswerCategory[] = [];
  for (const category of ANSWER_CATEGORIES) {
    const raw = stored.data.answers[category];
    if (raw === null || raw === undefined) continue;
    const parsed = CATEGORY_SCHEMAS[category].safeParse(raw);
    if (parsed.success) {
      (answers as Record<AnswerCategory, unknown>)[category] = parsed.data;
    } else {
      damaged.push(category);
    }
  }
  return {
    saved: {
      schemaVersion: ANSWERS_SCHEMA_VERSION,
      answers,
      updatedAt: stored.data.updatedAt,
    },
    damaged,
  };
}
