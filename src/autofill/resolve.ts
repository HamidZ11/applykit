import {
  isEducationField,
  isEmploymentField,
  type AutofillValues,
  type EducationValue,
  type EmploymentValue,
} from './fields';
import { needsYou, planFill, type FieldReport } from './report';
import type { ScannedField } from './scan';

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
