import { MONTH_NAMES } from '@/domain/application-answers';
import type { AnswerPlan } from './answers';
import { currentMonthIndex, monthIndex, parseYearMonth } from './dates';
import { normalise } from './detect';
import { qualificationType, requestedLevel } from './education';
import type { EducationValue } from './fields';
import { comparable, usableOptions } from './options';
import type { ControlField, ScannedField } from './scan';

/**
 * Graduation questions answered from saved education (ADR 0017): "Will
 * you graduate before October 2027?", "… by September 2027?", "… in
 * 2027?", "What year do you expect to graduate?", "Have you already
 * graduated?". Pure rules: which saved degree the question is about, what
 * its saved end date says, and whether that settles the question.
 *
 * A saved end date is month-precise and means "ended, or expected to".
 * Only a date still to come is read as an expected graduation; a past one
 * never proves a degree was awarded, so it answers nothing. Answers are
 * only suggested and filled when the user confirms them.
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
  | { kind: 'unclear'; reason: string };

/** Month names and their usual short forms ("Sep", "Sept"), numbered. */
const MONTHS = new Map<string, number>([['sept', 9]]);
MONTH_NAMES.forEach((name, index) => {
  const lower = name.toLowerCase();
  MONTHS.set(lower, index + 1);
  MONTHS.set(lower.slice(0, 3), index + 1);
});
const MONTH_WORD = [...MONTHS.keys()].join('|');

/** "15 September 2027", "15th of Sept 2027", "October 2027", "2027". */
const DATE = new RegExp(
  `\\b(?:(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${MONTH_WORD}) |(${MONTH_WORD}) )?((?:19|20)\\d{2})\\b`,
  'g',
);

/** The words just before the date, and what they make of it. */
const RELATIONS: [RegExp, Relation][] = [
  [/\b(?:by|before) the end of $/, 'by'],
  [/\bno later than $/, 'by'],
  [/\b(?:before|prior to) $/, 'before'],
  [/\bby $/, 'by'],
  [/\b(?:in|during) $/, 'in'],
];

const HAVE_GRADUATED =
  /\b(?:have|did) you (?:already |yet )?(?:graduated|completed|finished)\b|\balready graduated\b/;

/** Days in a month, from the calendar. */
function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * What a recognised graduation question asks, from its normalised text.
 * Only one stated date, with "before", "by" or "in" right before it, is
 * read; a missing year is never filled in.
 */
export function parseGraduationQuestion(text: string): GraduationQuestion {
  const dates = [...text.matchAll(DATE)];
  if (dates.length > 1) {
    return {
      kind: 'unclear',
      reason: 'This question mentions more than one date.',
    };
  }
  const [date] = dates;
  if (!date) {
    if (/\b(?:what|which) year\b/.test(text)) return { kind: 'year' };
    if (HAVE_GRADUATED.test(text)) return { kind: 'completed' };
    return {
      kind: 'unclear',
      reason: 'This question gives no date with a year to compare with.',
    };
  }
  const before = text.slice(0, date.index);
  const relation = RELATIONS.find(([pattern]) => pattern.test(before))?.[1];
  if (!relation) {
    return {
      kind: 'unclear',
      reason:
        'ApplyKit cannot tell how the date in this question relates to your graduation.',
    };
  }
  const [, day, dayMonth, monthOnly, year] = date;
  const monthWord = dayMonth ?? monthOnly;
  const deadline: Deadline = {
    year: Number(year),
    month: monthWord ? (MONTHS.get(monthWord) ?? null) : null,
    day: day ? Number(day) : null,
  };
  if (
    deadline.day !== null &&
    (deadline.month === null ||
      deadline.day < 1 ||
      deadline.day > daysIn(deadline.year, deadline.month))
  ) {
    return {
      kind: 'unclear',
      reason: 'The date in this question is not valid.',
    };
  }
  if (relation === 'in' && deadline.day !== null) {
    return {
      kind: 'unclear',
      reason:
        'ApplyKit compares graduation with a month or a year, not a single day.',
    };
  }
  return { kind: 'deadline', relation, deadline };
}

export type Comparison = 'yes' | 'no' | 'unknown';

/**
 * Whether a graduation in `saved` (a month) is before, by or in the
 * deadline. Calendar comparisons at the deadline's precision; within the
 * saved month, the day is unknown, so the answer is too unless every day
 * of the month gives the same one.
 */
export function compareGraduation(
  saved: { year: number; month: number },
  relation: Relation,
  deadline: Deadline,
): Comparison {
  const answer = (condition: boolean): Comparison => (condition ? 'yes' : 'no');
  if (deadline.month === null) {
    if (relation === 'before') return answer(saved.year < deadline.year);
    if (relation === 'by') return answer(saved.year <= deadline.year);
    return answer(saved.year === deadline.year);
  }
  const graduated = saved.year * 12 + saved.month;
  const due = deadline.year * 12 + deadline.month;
  if (deadline.day === null) {
    if (relation === 'before') return answer(graduated < due);
    if (relation === 'by') return answer(graduated <= due);
    return answer(graduated === due);
  }
  if (graduated !== due) return answer(graduated < due);
  // The same month: any day of it could be the graduation day.
  if (relation === 'before') return deadline.day === 1 ? 'no' : 'unknown';
  return deadline.day === daysIn(deadline.year, deadline.month)
    ? 'yes'
    : 'unknown';
}

/** "June 2027". */
function monthYear(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1] ?? ''} ${String(year)}`;
}

type Derived =
  | {
      /** "yes", "no", or a year for "What year…?". */
      answer: string;
      basis: string;
    }
  | Exclude<AnswerPlan, { display: string }>;

/** The degree a question can be about: university-level records only. */
function degreeFor(
  text: string,
  records: readonly EducationValue[],
): EducationValue | Exclude<AnswerPlan, { display: string }> {
  if (requestedLevel(text) === 'school') {
    return {
      status: 'manual',
      reason: 'This asks about school qualifications, not a degree.',
    };
  }
  const type = qualificationType(text);
  const degrees = records.filter((r) => r.level === 'higher');
  const fitting = type
    ? degrees.filter((r) => qualificationType(r.qualification) === type)
    : degrees;
  const [only] = fitting;
  if (fitting.length === 1 && only) return only;
  if (fitting.length > 1) {
    return {
      status: 'ambiguous',
      reason:
        'Several of your saved degrees could be the one this asks about, so ApplyKit does not suggest an answer.',
    };
  }
  return {
    status: 'no-value',
    reason:
      degrees.length > 0
        ? 'None of your saved degrees is the kind this question asks about.'
        : 'None of your saved education is clearly a university degree.',
  };
}

/**
 * The answer the saved degree gives to the question, with the fact it
 * rests on, or why there is none.
 */
function derive(
  field: ScannedField,
  records: readonly EducationValue[],
  now: Date,
): Derived {
  const placeholder =
    field.element instanceof HTMLInputElement ? field.element.placeholder : '';
  const text = normalise(`${field.label} ${placeholder}`);
  const question = parseGraduationQuestion(text);
  if (question.kind === 'unclear') {
    return {
      status: 'manual',
      reason: `${question.reason} Answer it yourself.`,
    };
  }
  const degree = degreeFor(text, records);
  if ('status' in degree) return degree;
  const end = parseYearMonth(degree.endDate);
  if (!end) {
    return {
      status: 'no-value',
      reason: 'Your saved degree has no end date.',
    };
  }
  const saved = { year: Number(end.year), month: Number(end.month) };
  const ended = monthYear(saved.year, saved.month);
  // Only a date still to come is an expected graduation. A past one says
  // when study ended, not that the degree was awarded.
  if (monthIndex(end) <= currentMonthIndex(now)) {
    return {
      status: 'manual',
      reason: `Your saved end date, ${ended}, is not in the future, and your profile does not say whether your degree was awarded. Answer it yourself.`,
    };
  }
  const basis = `Expected graduation: ${ended}`;
  switch (question.kind) {
    case 'year':
      return { answer: end.year, basis };
    case 'completed':
      return { answer: 'no', basis };
    case 'deadline': {
      const result = compareGraduation(
        saved,
        question.relation,
        question.deadline,
      );
      if (result === 'unknown') {
        return {
          status: 'manual',
          reason: `Your profile saves only the month you expect to graduate, ${ended}, so ApplyKit cannot tell. Answer it yourself.`,
        };
      }
      return { answer: result, basis };
    }
  }
}

const SAYS: Record<'yes' | 'no', RegExp> = { yes: /^yes$/, no: /^no$/ };

/**
 * The answer as one control takes it. Yes or No only into a list offering
 * exactly that option; a year into a text, number or list field. A text
 * field is never given "Yes": its expected format is not stated.
 */
export function planGraduation(
  field: ControlField,
  records: readonly EducationValue[],
  now: Date,
): AnswerPlan {
  const derived = derive(field, records, now);
  if ('status' in derived) return derived;
  const { answer, basis } = derived;
  const { element } = field;
  if (answer === 'yes' || answer === 'no') {
    const words = answer === 'yes' ? 'Yes' : 'No';
    if (!(element instanceof HTMLSelectElement)) {
      return {
        status: 'manual',
        reason: `The likely answer is ${words}, based on your expected graduation. ApplyKit fills Yes or No only into a list offering them; answer it yourself.`,
      };
    }
    const matching = usableOptions(element).filter((o) =>
      SAYS[answer].test(comparable(o.text)),
    );
    const [only] = matching;
    return matching.length === 1 && only
      ? { display: only.text.trim(), fillValue: only.value, basis }
      : {
          status: 'no-option',
          reason: `None of the options is simply “${words}”.`,
        };
  }
  if (element instanceof HTMLSelectElement) {
    const matching = usableOptions(element).filter(
      (o) => comparable(o.text) === answer || comparable(o.value) === answer,
    );
    const [only] = matching;
    return matching.length === 1 && only
      ? { display: only.text.trim(), fillValue: only.value, basis }
      : { status: 'no-option', reason: `None of the options is ${answer}.` };
  }
  return { display: answer, fillValue: answer, basis };
}

/** The same answer in words, for radio groups and custom dropdowns. */
export function graduationGuidance(
  field: ScannedField,
  records: readonly EducationValue[],
  now: Date,
): AnswerPlan {
  const derived = derive(field, records, now);
  if ('status' in derived) return derived;
  const words =
    derived.answer === 'yes'
      ? 'Yes'
      : derived.answer === 'no'
        ? 'No'
        : derived.answer;
  return {
    display: words,
    fillValue: words,
    basis: `${derived.basis}. Choose it yourself on this page.`,
  };
}
