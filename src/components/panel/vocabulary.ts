import { describeEvidence } from '@/autofill/detect';
import { AUTOFILL_FIELD_LABEL, isDiversityField } from '@/autofill/fields';
import type { FieldReport, FieldStatus } from '@/autofill/report';
import type { FieldKind, ScannedField } from '@/autofill/scan';

/** Short status label, shared by both modes so the words mean one thing. */
export const STATUS_LABEL: Record<FieldStatus, string> = {
  fill: 'Will fill',
  suggest: 'Saved answer',
  filled: 'Filled',
  reformatted: 'Filled, reformatted',
  keep: 'Your entry',
  kept: 'Your entry',
  rejected: 'Not accepted',
  detached: 'Left the page',
  'no-value': 'Not in profile',
  'no-profile': 'Needs profile',
  'no-option': 'No matching option',
  unusable: 'Saved value does not fit',
  ambiguous: 'Several records fit',
  unrecognised: 'Not recognised',
  conflict: 'Unclear',
  duplicate: 'Asked twice',
  unsupported: 'Not supported yet',
  manual: 'Answer yourself',
  open: 'Open question',
  'other-person': 'Not about you',
};

export const KIND_LABEL: Record<FieldKind, string> = {
  text: 'Text',
  email: 'Email',
  tel: 'Phone number',
  url: 'Link',
  number: 'Number',
  date: 'Date',
  textarea: 'Long answer',
  select: 'Dropdown',
  file: 'File upload',
  checkbox: 'Checkbox',
  radio: 'Choice',
  custom: 'Custom dropdown',
  other: 'Field',
};

/** One sentence explaining what happens, or happened, to a field. */
export function explain(report: FieldReport): string {
  const target = report.target
    ? AUTOFILL_FIELD_LABEL[report.target].toLowerCase()
    : 'value';
  // Monitoring answers are never named in the panel.
  if (report.target !== null && isDiversityField(report.target)) {
    if (report.status === 'fill') {
      return 'When you autofill, ApplyKit fills this from your saved diversity preferences if one of the choices says the same as your answer.';
    }
    if (report.status === 'filled' || report.status === 'reformatted') {
      return 'Filled from your saved diversity preferences. The site accepted it.';
    }
  }
  switch (report.status) {
    case 'fill':
      return withNote(`ApplyKit will fill this with your ${target}.`, report);
    case 'suggest':
      if (report.field.kind === 'custom') {
        return report.value === null
          ? 'Suggested answer available from your saved diversity preferences. ApplyKit chooses it in this dropdown only if you ask, then checks the page kept it.'
          : 'Suggested answer available. ApplyKit chooses it in this dropdown only if you ask, then checks the page kept it.';
      }
      return report.target === 'graduation'
        ? 'Worked out from your expected graduation date. ApplyKit fills it only if you choose to use it.'
        : 'Your saved answer fits this question. ApplyKit fills it only if you choose to use it.';
    case 'filled':
      return withNote(
        `Filled with your ${target}. The site accepted it.`,
        report,
      );
    case 'unsupported':
      return (
        report.reason ??
        `${KIND_LABEL[report.field.kind]} fields are not supported yet.`
      );
    default:
      return report.reason ?? STATUS_LABEL[report.status];
  }
}

function withNote(text: string, report: FieldReport): string {
  return report.note ? `${text} ${report.note}` : text;
}

/**
 * Why ApplyKit treated the field as it did: the profile property it matched
 * and the page signals it read. Shown as technical detail in expanded mode.
 */
export function detectionDetail(report: FieldReport): {
  target: string | null;
  evidence: string[];
} {
  return {
    target: report.target ? AUTOFILL_FIELD_LABEL[report.target] : null,
    evidence: report.evidence.map(describeEvidence),
  };
}

/** The page element to point at: the whole question for radio groups. */
export function locateTarget(field: ScannedField): Element {
  if (field.kind === 'radio') {
    return field.element.closest('fieldset') ?? field.element;
  }
  return field.element;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}
