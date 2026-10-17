import type { AutofillField } from './fields';
import {
  detectControl,
  labelText,
  type Evidence,
  type ManualReason,
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
 * What the engine can do with a control. `match` fields can be filled from
 * the profile; everything else is left to the user, with the reason.
 */
export type FieldSupport =
  | { status: 'match'; field: AutofillField; evidence: Evidence[] }
  | { status: 'conflict'; fields: AutofillField[]; evidence: Evidence[] }
  | { status: 'other-person'; evidence: Evidence[] }
  | { status: 'manual'; reason: ManualReason }
  /** A text field ApplyKit does not recognise. */
  | { status: 'unrecognised' }
  /** A control type ApplyKit does not fill. */
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

export interface ScanOptions {
  /**
   * Whether a control is shown to the user. Defaults to the browser's own
   * check; hidden controls (including honeypots) are never listed or filled.
   */
  isVisible?: (element: Element) => boolean;
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

/** Input types the engine may write text into. */
const TEXT_INPUT_TYPES = new Set(['text', 'email', 'tel', 'url', 'search']);

const DATE_TYPES = new Set(['date', 'datetime-local', 'month', 'week', 'time']);

function defaultIsVisible(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  return typeof element.checkVisibility === 'function'
    ? element.checkVisibility({ visibilityProperty: true })
    : true;
}

/**
 * Lists every control an applicant can complete in `root`, with what the
 * engine is able to do for each. Read-only: never changes the page.
 *
 * Radio buttons sharing a name are reported once, as one question. When the
 * page has forms, only the application form (the one with the most
 * recognised fields) is considered, so search boxes and newsletter sign-ups
 * elsewhere on the page are never touched.
 */
export function scanFields(
  root: ParentNode,
  { isVisible = defaultIsVisible }: ScanOptions = {},
): ScannedField[] {
  const fields: ScannedField[] = [];
  const radioGroups = new Set<string>();

  for (const element of root.querySelectorAll<FormControl>(
    'input, select, textarea',
  )) {
    if (element.disabled || !isVisible(element)) continue;

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

  return withinApplicationForm(fields);
}

function withinApplicationForm(fields: ScannedField[]): ScannedField[] {
  const recognised = new Map<HTMLFormElement, number>();
  for (const field of fields) {
    const form = field.element.form;
    if (form && field.support.status === 'match') {
      recognised.set(form, (recognised.get(form) ?? 0) + 1);
    }
  }
  let application: HTMLFormElement | null = null;
  let best = 0;
  for (const [form, count] of recognised) {
    if (count > best) {
      application = form;
      best = count;
    }
  }
  return application
    ? fields.filter((field) => field.element.form === application)
    : fields;
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
  const detection = detectControl(element);
  if (detection.kind === 'manual') {
    return { status: 'manual', reason: detection.reason };
  }
  if (detection.kind === 'other-person') {
    return { status: 'other-person', evidence: detection.evidence };
  }

  // What the engine can write: text-like inputs, and native selects for the
  // country only.
  const writable = isInput(element)
    ? TEXT_INPUT_TYPES.has(element.type)
    : element.localName === 'select' &&
      detection.kind === 'match' &&
      detection.field === 'country';
  if (!writable) return { status: 'unsupported' };

  switch (detection.kind) {
    case 'match':
      return {
        status: 'match',
        field: detection.field,
        evidence: detection.evidence,
      };
    case 'conflict':
      return {
        status: 'conflict',
        fields: detection.fields,
        evidence: detection.evidence,
      };
    case 'none':
      return { status: 'unrecognised' };
  }
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
