import type { ProfileField } from '@/domain/profile';
import {
  classify,
  isFillable,
  labelText,
  type DetectionSource,
} from './detect';

export type FormControl =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export type FieldKind =
  | 'text'
  | 'email'
  | 'tel'
  | 'url'
  | 'number'
  | 'date'
  | 'textarea'
  | 'select'
  | 'file'
  | 'checkbox'
  | 'radio'
  | 'other';

/**
 * What the engine can do with a control today. Kept deliberately honest:
 * `unrecognised` text fields could be filled once ApplyKit knows what they
 * ask for; `unsupported` controls cannot be filled by the engine at all yet.
 */
export type FieldSupport =
  | { status: 'fillable'; field: ProfileField; source: DetectionSource }
  | { status: 'unrecognised' }
  | { status: 'unsupported' };

export interface ScannedField {
  element: FormControl;
  /** Human-readable question, taken from the page's own labels. */
  label: string;
  /** The enclosing section's legend, when the form has sections. */
  section: string | null;
  kind: FieldKind;
  required: boolean;
  support: FieldSupport;
}

/** Inputs that are never shown to, or never typed into by, the applicant. */
const IGNORED_INPUT_TYPES = new Set([
  'hidden',
  'submit',
  'button',
  'reset',
  'image',
  'password',
]);

const DATE_TYPES = new Set(['date', 'datetime-local', 'month', 'week', 'time']);

/**
 * Lists every control an applicant can complete in `root`, with what the
 * engine is able to do for each. Read-only: never changes the page.
 *
 * Radio buttons sharing a name are reported once, as one question.
 */
export function scanFields(root: ParentNode): ScannedField[] {
  const fields: ScannedField[] = [];
  const radioGroups = new Set<string>();

  for (const element of root.querySelectorAll<FormControl>(
    'input, select, textarea',
  )) {
    if (element.disabled) continue;

    if (isInput(element)) {
      if (IGNORED_INPUT_TYPES.has(element.type) || element.readOnly) continue;
      if (element.type === 'radio' && element.name) {
        const key = `${element.form?.id ?? ''}\u0000${element.name}`;
        if (radioGroups.has(key)) continue;
        radioGroups.add(key);
      }
    } else if (isTextArea(element) && element.readOnly) {
      continue;
    }

    fields.push(describe(element, root));
  }

  return fields;
}

function describe(element: FormControl, root: ParentNode): ScannedField {
  const question =
    isInput(element) && element.type === 'radio'
      ? element.closest('fieldset')
      : null;

  return {
    element,
    label: fieldLabel(element, question),
    section: sectionOf(element, question),
    kind: kindOf(element),
    required: isRequired(element, root),
    support: supportOf(element),
  };
}

function supportOf(element: FormControl): FieldSupport {
  if (!isInput(element) || !isFillable(element)) {
    return { status: 'unsupported' };
  }
  const match = classify(element);
  return match ? { status: 'fillable', ...match } : { status: 'unrecognised' };
}

function kindOf(element: FormControl): FieldKind {
  if (isTextArea(element)) return 'textarea';
  if (!isInput(element)) return 'select';

  const type = element.type;
  if (type === 'search') return 'text';
  if (DATE_TYPES.has(type)) return 'date';
  if (
    type === 'text' ||
    type === 'email' ||
    type === 'tel' ||
    type === 'url' ||
    type === 'number' ||
    type === 'file' ||
    type === 'checkbox' ||
    type === 'radio'
  ) {
    return type;
  }
  return 'other';
}

function fieldLabel(
  element: FormControl,
  question: HTMLFieldSetElement | null,
): string {
  const candidates = [
    question ? legendText(question) : '',
    labelText(element),
    'placeholder' in element ? element.placeholder : '',
    element.name,
  ];
  for (const candidate of candidates) {
    const text = cleanLabel(candidate);
    if (text) return text;
  }
  return 'Unlabelled field';
}

function sectionOf(
  element: FormControl,
  question: HTMLFieldSetElement | null,
): string | null {
  // For a radio group the nearest fieldset is the question itself, so the
  // section is the fieldset around that.
  const start = question?.parentElement ?? element;
  const section = start.closest('fieldset');
  if (!section) return null;
  return cleanLabel(legendText(section)) || null;
}

function isRequired(element: FormControl, root: ParentNode): boolean {
  if (element.required || element.getAttribute('aria-required') === 'true') {
    return true;
  }
  if (isInput(element) && element.type === 'radio' && element.name) {
    return Array.from(
      root.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ).some((radio) => radio.name === element.name && radio.required);
  }
  return false;
}

function legendText(fieldset: HTMLFieldSetElement): string {
  return fieldset.querySelector(':scope > legend')?.textContent ?? '';
}

/** Collapses whitespace and drops required-field markers such as "*". */
function cleanLabel(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*(\*|\(required\))\s*$/i, '')
    .trim();
}

function isInput(element: FormControl): element is HTMLInputElement {
  return element.localName === 'input';
}

function isTextArea(element: FormControl): element is HTMLTextAreaElement {
  return element.localName === 'textarea';
}
