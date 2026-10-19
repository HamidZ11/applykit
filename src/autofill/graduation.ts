import { MONTH_NAMES } from '@/domain/application-answers';
import type { AnswerPlan } from './answers';
import {
  currentMonthIndex,
  dateFormatOf,
  monthIndex,
  parseYearMonth,
} from './dates';
import { normalise } from './detect';
import {
  qualificationType,
  requestedLevel,
  type QualificationType,
} from './education';
import type { EducationValue } from './fields';
import {
  daysIn,
  readGraduationQuestion,
  type Deadline,
  type Relation,
} from './graduation-question';
import { choiceOptions } from './choices';
import { comparable } from './options';
import type { ControlField, ScannedField } from './scan';

/**
 * Graduation questions answered from saved education (ADR 0017): which
 * saved degree a question is about, what its saved end date says, and
 * whether that settles the question (the questions themselves are
 * defined in `graduation-question`).
 *
 * A saved end date is month-precise and means "ended, or expected to".
 * Only a date still to come is read as an expected graduation; a past one
 * never proves a degree was awarded, so it answers nothing. Answers are
 * only suggested and filled when the user confirms them.
 */

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

type NoAnswer = Exclude<AnswerPlan, { display: string }>;

type Derived =
  | {
      /** "yes", "no", or a year for "What year…?". */
      answer: string;
      basis: string;
    }
  | NoAnswer;

/** Kinds of degree "undergraduate" and "postgraduate" mean. */
const STUDY_LEVELS: [RegExp, QualificationType[]][] = [
  [/\bundergraduate\b/, ['bachelor', 'foundation', 'hnd', 'hnc']],
  [/\bpostgraduate\b/, ['master', 'doctorate']],
];

/**
 * The degree a question can be about. University-level records, and
 * records whose level ApplyKit cannot tell (which might be the degree),
 * narrowed by any kind of degree the question names. Never school
 * qualifications, never chosen by order or recency.
 */
function degreeFor(
  question: string,
  section: string,
  records: readonly EducationValue[],
): EducationValue | NoAnswer {
  if (
    requestedLevel(question) === 'school' ||
    requestedLevel(section) === 'school'
  ) {
    return {
      status: 'manual',
      reason: 'This asks about school qualifications, not a degree.',
    };
  }
  const named = qualificationType(question);
  const level = STUDY_LEVELS.find(([pattern]) => pattern.test(question))?.[1];
  const possible = records.filter((r) => r.level !== 'school');
  const fitting = possible.filter((r) => {
    const type = qualificationType(r.qualification);
    if (named) return type === named;
    if (level) return type !== null && level.includes(type);
    return true;
  });
  const [only] = fitting;
  if (fitting.length === 1 && only?.level === 'higher') return only;
  if (only) {
    return {
      status: 'ambiguous',
      reason:
        fitting.length > 1
          ? 'Several of your saved qualifications could be the one this asks about, so ApplyKit does not suggest an answer.'
          : 'ApplyKit cannot tell whether your saved qualification is a degree, so it does not suggest an answer.',
    };
  }
  return {
    status: 'no-value',
    reason:
      possible.length > 0
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
  // The question itself, without hints such as "(Yes or no)".
  const text = normalise(field.label.replace(/\([^)]*\)/g, ' '));
  const question = readGraduationQuestion(text);
  if (!question) {
    return {
      status: 'manual',
      reason: 'ApplyKit cannot answer this question from your profile.',
    };
  }
  if (question.kind === 'invalid') {
    return {
      status: 'manual',
      reason: `${question.reason} Answer it yourself.`,
    };
  }
  const degree = degreeFor(text, field.context, records);
  if ('status' in degree) return degree;
  const end = parseYearMonth(degree.endDate);
  if (!end) {
    return { status: 'no-value', reason: 'Your saved degree has no end date.' };
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

/**
 * The answer as one control takes it. Yes or No only into a list whose
 * choices are exactly Yes and No; a year into a number, list or text
 * field that does not ask for another format. A text field is never
 * given "Yes": its expected format is not stated.
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
    const options = choiceOptions(element);
    if (!options) {
      return {
        status: 'manual',
        reason: `The likely answer is ${words}, based on your expected graduation. ApplyKit fills Yes or No only into a list or radio group offering them; answer it yourself.`,
      };
    }
    const choices = options.map((o) => comparable(o.text)).sort();
    const chosen = options.find((o) => comparable(o.text) === answer);
    return choices.join('|') === 'no|yes' && chosen
      ? { display: chosen.text, fillValue: chosen.value, basis }
      : {
          status: 'no-option',
          reason:
            'These choices are not just Yes and No, so ApplyKit leaves the choice to you.',
        };
  }
  const options = choiceOptions(element);
  if (options) {
    // A list's values may count ("2027"); a radio group's never do.
    const matching = options.filter(
      (o) =>
        comparable(o.text) === answer ||
        (element instanceof HTMLSelectElement &&
          comparable(o.value) === answer),
    );
    const [only] = matching;
    return matching.length === 1 && only
      ? { display: only.text, fillValue: only.value, basis }
      : { status: 'no-option', reason: `None of the options is ${answer}.` };
  }
  const format = dateFormatOf(element, field.label);
  if (format.kind !== 'year' && format.kind !== 'unknown') {
    return {
      status: 'unusable',
      reason:
        'This field asks for a date in another format, and your answer is a year.',
    };
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
