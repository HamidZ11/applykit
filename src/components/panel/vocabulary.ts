import type { FieldReport, FieldStatus } from '@/autofill/report';
import type { FieldKind, ScannedField } from '@/autofill/scan';
import type { ProfileField } from '@/domain/profile';

/** Short status label, shared by both concepts so the words mean one thing. */
export const STATUS_LABEL: Record<FieldStatus, string> = {
  fill: 'Will fill',
  filled: 'Filled',
  keep: 'Your entry',
  kept: 'Your entry',
  'no-value': 'No profile value',
  unrecognised: 'Not recognised',
  unsupported: 'Not supported yet',
};

export const PROFILE_FIELD_LABEL: Record<ProfileField, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
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
  other: 'Field',
};

/** One sentence explaining why a field is left to the user. */
export function explain(report: FieldReport): string {
  switch (report.status) {
    case 'fill':
      return 'ApplyKit will fill this from your profile.';
    case 'filled':
      return 'Filled from your profile.';
    case 'keep':
      return 'You already typed this. ApplyKit will leave it as is.';
    case 'kept':
      return 'You had already typed this, so ApplyKit left it as is.';
    case 'no-value':
      return 'Recognised, but your profile has no value for it.';
    case 'unrecognised':
      return 'ApplyKit does not know what this field asks for yet.';
    case 'unsupported':
      return `${KIND_LABEL[report.field.kind]} fields are not supported yet.`;
  }
}

/** The page element to point at: the whole question for radio groups. */
export function locateTarget(field: ScannedField): Element {
  if (field.kind === 'radio') {
    return field.element.closest('fieldset') ?? field.element;
  }
  return field.element;
}

/**
 * How the engine identified a fillable field, as the attribute it read.
 * Shown as technical metadata, never as the main label.
 */
export function detectionDetail(field: ScannedField): string | null {
  const { support, element } = field;
  if (support.status !== 'fillable') return null;
  switch (support.source) {
    case 'autocomplete':
      return `autocomplete="${element.getAttribute('autocomplete') ?? ''}"`;
    case 'type':
      return `type="${element.getAttribute('type') ?? ''}"`;
    case 'name':
      return `name="${element.getAttribute('name') ?? ''}"`;
    case 'id':
      return `id="${element.id}"`;
    case 'label':
      return 'label text';
    case 'placeholder':
      return 'placeholder text';
  }
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}
