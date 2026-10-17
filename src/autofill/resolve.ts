import type { AutofillValues, EducationValue } from './fields';
import { isEducationField } from './fields';
import { planFill, type FieldReport } from './report';
import type { FormControl, ScannedField } from './scan';

/**
 * User-approved education choices. When several saved records fit a
 * section, the user picks one; this module previews what that would fill
 * and checks, just before filling, that the page still matches what the
 * user saw. Writing is left to `fillFields`, as for any other plan.
 */

/** A saved record the user picked for one education section. */
export interface SectionChoice {
  /** The section, as `ScannedField.group`. */
  group: Element | null;
  recordId: string;
}

export interface ChoicePreview {
  record: EducationValue;
  /**
   * The section's fields the choice applies to, planned with the chosen
   * record (`fill` or why not), then those that already have a value.
   */
  reports: FieldReport[];
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
  const record = values.education.find((r) => r.id === choice.recordId);
  if (!record) return null;

  const inSection = (report: FieldReport) =>
    report.field.group === choice.group &&
    report.target !== null &&
    isEducationField(report.target);
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
  previewed: readonly FormControl[],
  now: Date = new Date(),
): ChoiceCheck {
  if (!values.education.some((r) => r.id === choice.recordId)) {
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
  const current = preview?.reports.map((r) => r.field.element) ?? [];
  if (!preview || !sameElements(current, previewed)) {
    return {
      ok: false,
      message:
        'This section has changed since you chose. Nothing was filled; review it again.',
    };
  }
  return { ok: true, plan: preview.reports };
}

function sameElements(
  a: readonly FormControl[],
  b: readonly FormControl[],
): boolean {
  const set = new Set(a);
  return a.length === b.length && b.every((element) => set.has(element));
}
