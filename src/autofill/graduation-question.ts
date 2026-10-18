import { MONTH_NAMES } from '@/domain/application-answers';

/**
 * The graduation questions ApplyKit answers, as whole questions: the
 * applicant graduating (or completing their degree) before, by or in one
 * date, the year they expect to graduate, or whether they have already
 * graduated. Text is normalised (lower case, words only) and must be
 * exactly one of these shapes, so a date can never come from another
 * clause ("…by the time you start in September 2027"), and conditions,
 * grades, other people and extra words ("or later", "subject to…") leave
 * the question unrecognised. Shared by detection and planning.
 */

export type Relation = 'before' | 'by' | 'in';

/** A deadline as precise as the question states it, never more. */
export interface Deadline {
  year: number;
  /** 1–12, or null for a year alone. */
  month: number | null;
  /** 1–31, or null when no day is given. */
  day: number | null;
}

export type GraduationQuestion =
  | { kind: 'deadline'; relation: Relation; deadline: Deadline }
  /** "What year do you expect to graduate?" */
  | { kind: 'year' }
  /** "Have you already graduated?" */
  | { kind: 'completed' }
  | { kind: 'invalid'; reason: string };

/** Month names and their usual short forms ("Sep", "Sept"), numbered. */
const MONTHS = new Map<string, number>([['sept', 9]]);
MONTH_NAMES.forEach((name, index) => {
  const lower = name.toLowerCase();
  MONTHS.set(lower, index + 1);
  MONTHS.set(lower.slice(0, 3), index + 1);
});
const MONTH = [...MONTHS.keys()].join('|');

/** "your degree", "your bachelor s degree", "the course", "your studies". */
const OBJECT =
  '(?: (?:your|the|a) (?:[a-z]+ s |[a-z]+ )?(?:degree|studies|course))?(?: (?:from|at) university)?';

/** Graduating, or completing the degree, as the applicant. */
const DOING = `(?:graduate|complete${OBJECT}|finish${OBJECT})`;
const DONE = `(?:graduated|completed${OBJECT}|finished${OBJECT})`;

const RELATION =
  '(in or before|on or before|before the end of|by the end of|no later than|prior to|before|by|in|during)';

/** One date, at the very end: "15 september 2027", "october 2027", "2027". */
const DATE = `(?:(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MONTH}) |(${MONTH}) )?((?:19|20)\\d{2})`;

const DEADLINE_QUESTIONS = [
  // Will you graduate before…, will you have completed your degree by…
  `(?:will|would|do|can) you (?:expect to |plan to |be able to )?(?:${DOING}|have ${DONE})`,
  // Are you graduating in…, are you due/expecting to graduate by…
  `are you (?:graduating|completing${OBJECT}|(?:due|expecting|expected|planning|set) to ${DOING})`,
  // Is your (expected) graduation (date) before…
  'is your (?:expected |anticipated )?graduation(?: date)?',
].map((stem) => new RegExp(`^${stem} ${RELATION} ${DATE}$`));

const YEAR_QUESTION = new RegExp(
  `^(?:in )?(?:what|which) year (?:do|will) you (?:expect to |plan to )?${DOING}$`,
);

const COMPLETED_QUESTION = new RegExp(
  `^(?:have you (?:already )?${DONE}(?: yet)?|did you (?:already )?(?:graduate|complete${OBJECT}|finish${OBJECT}))$`,
);

const RELATIONS: Record<string, Relation> = {
  before: 'before',
  'prior to': 'before',
  by: 'by',
  'no later than': 'by',
  'by the end of': 'by',
  'before the end of': 'by',
  'in or before': 'by',
  'on or before': 'by',
  in: 'in',
  during: 'in',
};

/** Days in a month, from the calendar. */
export function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * What a question asks, or null when it is not one of the supported
 * graduation questions. `text` is normalised, without parenthesised hints.
 */
export function readGraduationQuestion(
  text: string,
): GraduationQuestion | null {
  if (YEAR_QUESTION.test(text)) return { kind: 'year' };
  if (COMPLETED_QUESTION.test(text)) return { kind: 'completed' };
  for (const pattern of DEADLINE_QUESTIONS) {
    const match = pattern.exec(text);
    if (!match) continue;
    const [, relationWords = '', day, dayMonth, monthOnly, year] = match;
    const relation = RELATIONS[relationWords];
    const monthWord = dayMonth ?? monthOnly;
    const deadline: Deadline = {
      year: Number(year),
      month: monthWord ? (MONTHS.get(monthWord) ?? null) : null,
      day: day ? Number(day) : null,
    };
    if (!relation) return null;
    if (
      deadline.day !== null &&
      (deadline.month === null ||
        deadline.day < 1 ||
        deadline.day > daysIn(deadline.year, deadline.month))
    ) {
      return {
        kind: 'invalid',
        reason: 'The date in this question is not valid.',
      };
    }
    if (relation === 'in' && deadline.day !== null) {
      return {
        kind: 'invalid',
        reason:
          'ApplyKit compares graduation with a month or a year, not a single day.',
      };
    }
    return { kind: 'deadline', relation, deadline };
  }
  return null;
}
