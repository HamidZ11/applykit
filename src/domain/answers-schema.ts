import { z } from 'zod';
import {
  ANSWERS_SCHEMA_VERSION,
  ANSWER_CATEGORIES,
  CURRENCIES,
  NOTICE_UNITS,
  SALARY_PERIODS,
  WILLINGNESS,
  WORK_ARRANGEMENTS,
  emptyAnswers,
  isCalendarDate,
  type AnswerCategory,
  type SavedAnswers,
} from './application-answers';

/**
 * Validation for saved application answers: each category when it is
 * saved, and data read back from storage (untrusted). Kept apart from the
 * model so code that only needs its types and lists (the panel) never
 * loads the validation library.
 */

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
      // 10.2 * 100 is 1019.9999999999999 in floating point: compare in
      // whole hundredths rather than exactly.
      .refine(
        (value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6,
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

/**
 * Stored answers written by a newer ApplyKit (a higher schema version).
 * This version cannot read them, so it must never write over them; that
 * is different from data that is damaged.
 */
export function isNewerAnswers(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { schemaVersion } = value as { schemaVersion?: unknown };
  return (
    typeof schemaVersion === 'number' &&
    Number.isInteger(schemaVersion) &&
    schemaVersion > ANSWERS_SCHEMA_VERSION
  );
}

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
