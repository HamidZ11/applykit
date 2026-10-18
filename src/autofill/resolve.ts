import {
  isEducationField,
  isEmploymentField,
  type AutofillValues,
  type EducationValue,
  type EmploymentValue,
} from './fields';
import { currentValue, needsYou, planFill, type FieldReport } from './report';
import { limitViolations } from './answer-limits';
import type { OpenQuestion } from './open-question';
import { isFormControl, type ScannedField } from './scan';

/**
 * User-approved record choices. When several saved education records or
 * jobs fit a section, the user picks one; this module previews what that
 * would fill and checks, just before filling, that the page still matches
 * what the user saw. Writing is left to `fillFields`, as for any other plan.
 */

/** A saved record the user picked for one section. */
export interface SectionChoice {
  /** The section, as `ScannedField.group`. */
  group: Element | null;
  recordId: string;
}

export interface ChoicePreview {
  record: EducationValue | EmploymentValue;
  /**
   * The section's fields the choice applies to, planned with the chosen
   * record (`fill` or why not), then those on the same topic that stay with
   * the user (a custom dropdown, "Reason for leaving"), then those that
   * already have a value.
   */
  reports: FieldReport[];
}

/** The saved record with this id, and its topic. */
function findRecord(
  values: AutofillValues,
  id: string,
): {
  record: EducationValue | EmploymentValue;
  topic: 'education' | 'employment';
} | null {
  const education = values.education.find((r) => r.id === id);
  if (education) return { record: education, topic: 'education' };
  const job = values.employment.find((r) => r.id === id);
  return job ? { record: job, topic: 'employment' } : null;
}

/** Whether a field of the section is about the chosen record's topic. */
function onTopic(
  report: FieldReport,
  topic: 'education' | 'employment',
): boolean {
  const { target } = report;
  if (topic === 'education') return target !== null && isEducationField(target);
  if (target !== null) return isEmploymentField(target);
  // "Reason for leaving" and the like: about the job, never saved.
  const { support } = report.field;
  return support.status === 'manual' && support.reason === 'answer';
}

/**
 * What choosing a record would do to its section, without touching the
 * page. Null when the record is not one of the section's candidates.
 */
export function previewChoice(
  fields: readonly ScannedField[],
  values: AutofillValues,
  choice: SectionChoice,
  now: Date = new Date(),
): ChoicePreview | null {
  const found = findRecord(values, choice.recordId);
  if (!found) return null;
  const { record, topic } = found;

  const inSection = (report: FieldReport) =>
    report.field.group === choice.group && onTopic(report, topic);
  const before = planFill(fields, values, now).filter(inSection);
  const applies = new Set(
    before
      .filter(
        (r) => r.status === 'ambiguous' && r.candidates.includes(record.id),
      )
      .map((r) => r.field.element),
  );
  if (applies.size === 0) return null;

  const after = planFill(
    fields,
    values,
    now,
    new Map([[choice.group, choice.recordId]]),
  );
  return {
    record,
    reports: [
      ...after.filter((r) => applies.has(r.field.element)),
      // Shown so the user knows what stays with them.
      ...after.filter(
        (r) =>
          inSection(r) &&
          !applies.has(r.field.element) &&
          r.status !== 'keep' &&
          needsYou(r),
      ),
      // Shown so the user knows they are kept, never written.
      ...before.filter((r) => r.status === 'keep'),
    ],
  };
}

export type ChoiceCheck =
  { ok: true; plan: FieldReport[] } | { ok: false; message: string };

/**
 * Re-checks a choice against a fresh scan and fresh profile values just
 * before filling: the record must still be saved, the section still on the
 * page, and the choice must apply to exactly the fields the user previewed.
 * Anything else means the page or profile changed, and nothing is written.
 */
export function confirmChoice(
  fields: readonly ScannedField[],
  values: AutofillValues,
  choice: SectionChoice,
  previewed: readonly FieldReport[],
  now: Date = new Date(),
): ChoiceCheck {
  if (!findRecord(values, choice.recordId)) {
    return {
      ok: false,
      message: 'That record is no longer in your saved profile. Choose again.',
    };
  }
  if (choice.group && !choice.group.isConnected) {
    return {
      ok: false,
      message:
        'This section is no longer on the page. Rescan to see the form as it is now.',
    };
  }
  const preview = previewChoice(fields, values, choice, now);
  if (!preview || !samePlan(preview.reports, previewed)) {
    return {
      ok: false,
      message:
        'This section has changed since you chose. Nothing was filled; review it again.',
    };
  }
  return { ok: true, plan: preview.reports };
}

/**
 * The same fields, each to receive exactly what the user saw: a profile
 * edited in another tab between preview and confirm must not fill values
 * the user never previewed.
 */
function samePlan(
  current: readonly FieldReport[],
  previewed: readonly FieldReport[],
): boolean {
  const seen = new Map(previewed.map((r) => [r.field.element, r]));
  return (
    current.length === previewed.length &&
    current.every((report) => {
      const before = seen.get(report.field.element);
      return (
        before?.status === report.status &&
        before.fillValue === report.fillValue
      );
    })
  );
}

/**
 * Re-checks one saved answer the user chose to use, against a fresh scan
 * and freshly read answers, just before writing: the question must still
 * be on the page, read the same and be recognised the same way, still be
 * empty, and still receive exactly the value the user saw. Anything else
 * writes nothing. The returned plan is the one field, for `fillFields`.
 */
export function confirmAnswer(
  fields: readonly ScannedField[],
  values: AutofillValues,
  previewed: FieldReport,
  now: Date = new Date(),
): ChoiceCheck {
  const element = previewed.field.element;
  if (!element.isConnected || !fields.some((f) => f.element === element)) {
    return {
      ok: false,
      message:
        'This question is no longer on the page. Rescan to see the form as it is now.',
    };
  }
  const current = planFill(fields, values, now).find(
    (report) => report.field.element === element,
  );
  if (current?.status === 'keep') {
    return {
      ok: false,
      message: 'You entered an answer here, so ApplyKit left it as it is.',
    };
  }
  if (
    current?.status !== 'suggest' ||
    current.target !== previewed.target ||
    current.field.label !== previewed.field.label ||
    current.fillValue !== previewed.fillValue
  ) {
    return {
      ok: false,
      message:
        'This question or your saved answer has changed. Nothing was filled; check it again.',
    };
  }
  return { ok: true, plan: [{ ...current, status: 'fill', chosen: true }] };
}

/**
 * Re-checks an AI draft the user reviewed and chose to insert (ADR 0019),
 * against a fresh scan, just before writing: the field must still be on
 * the page, still be the same open question, still be empty and
 * writable, and the user's final text must fit the question's limits and
 * the field's `maxlength`. Anything else writes nothing. The returned
 * plan is the one field, for `fillFields`, which never submits.
 */
export function confirmDraft(
  fields: readonly ScannedField[],
  previewed: FieldReport,
  text: string,
  /** The question as it was when the draft was requested. */
  drafted: OpenQuestion,
): ChoiceCheck {
  const { element, support } = previewed.field;
  const current = fields.find((field) => field.element === element);
  if (!element.isConnected || !current) {
    return {
      ok: false,
      message:
        'This question is no longer on the page. Rescan to see the form as it is now.',
    };
  }
  if (
    support.status !== 'open' ||
    current.support.status !== 'open' ||
    current.label !== previewed.field.label ||
    current.support.question.question !== drafted.question ||
    current.support.question.kind !== drafted.kind ||
    JSON.stringify(current.support.question.limits) !==
      JSON.stringify(drafted.limits)
  ) {
    return {
      ok: false,
      message:
        'This question has changed since the draft was written. Nothing was inserted.',
    };
  }
  const [report] = planFill([current], null);
  if (!report || !isFormControl(element)) {
    return { ok: false, message: 'This field cannot be written to.' };
  }
  if (element.disabled || ('readOnly' in element && element.readOnly)) {
    return {
      ok: false,
      message: 'This field can no longer be written to. Nothing was inserted.',
    };
  }
  if (currentValue(current) !== null) {
    return {
      ok: false,
      message: 'You entered an answer here, so ApplyKit left it as it is.',
    };
  }
  const answer = text.trim();
  if (answer === '') {
    return { ok: false, message: 'The answer is empty. Nothing was inserted.' };
  }
  const maxLength =
    'maxLength' in element && element.maxLength > 0 ? element.maxLength : null;
  if (
    limitViolations(answer, current.support.question.limits).length > 0 ||
    (maxLength !== null && answer.length > maxLength)
  ) {
    return {
      ok: false,
      message:
        'The answer does not meet the length this question asks for. Change it, then insert it.',
    };
  }
  return {
    ok: true,
    plan: [
      {
        ...report,
        status: 'fill',
        value: answer,
        fillValue: answer,
        chosen: true,
        reason: null,
        note: 'Drafted with AI, reviewed and inserted by you.',
      },
    ],
  };
}
