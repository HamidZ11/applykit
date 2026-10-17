import { isEducationField, type AutofillField } from './fields';
import {
  controlContext,
  detectControl,
  labelText,
  normalise,
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
  /**
   * Asks for the same detail as an earlier field, so it may be about someone
   * else (a second contact, a reference). Only the first is filled.
   */
  | { status: 'duplicate'; field: AutofillField; evidence: Evidence[] }
  | { status: 'conflict'; fields: AutofillField[]; evidence: Evidence[] }
  | { status: 'other-person'; evidence: Evidence[] }
  | { status: 'manual'; reason: ManualReason }
  /** A text field ApplyKit does not recognise. */
  | { status: 'unrecognised' }
  /**
   * A control ApplyKit does not fill. For a custom dropdown built on a text
   * input, `field` says what it appears to ask for.
   */
  | {
      status: 'unsupported';
      custom?: { field: AutofillField | null; evidence: Evidence[] };
    };

export interface ScannedField {
  element: FormControl;
  /** Human-readable question, taken from the page's own labels. */
  label: string;
  /** The enclosing section's legend, when the form has sections. */
  section: string | null;
  kind: FieldKind;
  required: boolean;
  support: FieldSupport;
  /** Normalised legends, group labels and heading around the field. */
  context: string;
  /** The section the field belongs to; fields sharing it form a section. */
  group: Element | null;
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

/** Fields a native select may be filled for, by exact option match. */
const SELECT_FIELDS = new Set<AutofillField>([
  'country',
  'phoneCountryCode',
  'institution',
  'qualification',
  'fieldOfStudy',
  'educationStart',
  'educationEnd',
  'grade',
]);

/**
 * Date inputs, writable only for education dates. A `date` input is listed
 * so the panel can say why it is left: it needs a day.
 */
const DATE_INPUT_TYPES = new Set(['month', 'number', 'date']);
const DATE_FIELDS = new Set<AutofillField>(['educationStart', 'educationEnd']);

const POPUP_ROLES = new Set([
  'listbox',
  'tree',
  'grid',
  'dialog',
  'menu',
  'true',
]);

/** A text input that works as a custom dropdown (combobox) widget. */
function isCustomDropdown(element: FormControl): boolean {
  if (!isInput(element)) return false;
  const popup = element.getAttribute('aria-haspopup');
  return (
    element.getAttribute('role') === 'combobox' ||
    (popup !== null && POPUP_ROLES.has(popup))
  );
}

const DATE_TYPES = new Set(['date', 'datetime-local', 'month', 'week', 'time']);

/** Smaller than this in either direction, a control is not meant to be seen. */
const MIN_VISIBLE_PX = 2;

function defaultIsVisible(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  if (typeof element.checkVisibility !== 'function') {
    // Older browsers: at least honour display and visibility.
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  if (
    !element.checkVisibility({
      visibilityProperty: true,
      opacityProperty: true,
    })
  ) {
    return false;
  }
  // Honeypots are often shrunk to nothing or moved off the page.
  const box = element.getBoundingClientRect();
  return (
    box.width >= MIN_VISIBLE_PX &&
    box.height >= MIN_VISIBLE_PX &&
    box.right + window.scrollX > 0 &&
    box.bottom + window.scrollY > 0
  );
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

  return firstOfEachDetail(withinApplicationForm(fields));
}

/**
 * Keeps the controls of the application: the form with the most recognised
 * fields, where controls outside any form count as one more "form", since
 * many application pages are built without a form element.
 */
function withinApplicationForm(fields: ScannedField[]): ScannedField[] {
  const recognised = new Map<HTMLFormElement | null, number>();
  for (const field of fields) {
    if (field.support.status === 'match') {
      const form = field.element.form;
      recognised.set(form, (recognised.get(form) ?? 0) + 1);
    }
  }
  if (recognised.size === 0) return fields;
  let application: HTMLFormElement | null = null;
  let best = 0;
  for (const [form, count] of recognised) {
    if (count > best) {
      application = form;
      best = count;
    }
  }
  return fields.filter((field) => field.element.form === application);
}

/** "Confirm email", "Re-enter your email address" and the like. */
const CONFIRMATION =
  /\b(?:confirm\w*|re ?enter|re ?type|repeat|verify|again)\b/;

/**
 * When several fields ask for the same detail, only the first is the
 * applicant's for certain; the rest may belong to a second contact or a
 * reference whose section ApplyKit could not recognise. Confirmation fields
 * ("Confirm email") are the exception.
 *
 * Education is asked once per record, so an education field only repeats
 * one in the same section: "University" and "School name" in separate
 * sections are both kept.
 */
function firstOfEachDetail(fields: ScannedField[]): ScannedField[] {
  const seen = new Set<AutofillField>();
  const seenInSection = new Map<Element | null, Set<AutofillField>>();
  return fields.map((field) => {
    const { support, element } = field;
    if (support.status !== 'match') return field;
    let scope = seen;
    if (isEducationField(support.field)) {
      scope = seenInSection.get(field.group) ?? new Set();
      seenInSection.set(field.group, scope);
    }
    if (!scope.has(support.field)) {
      scope.add(support.field);
      return field;
    }
    const text = normalise(
      [labelText(element), element.name, element.id].join(' '),
    );
    if (CONFIRMATION.test(text)) return field;
    return { ...field, support: { ...support, status: 'duplicate' } };
  });
}

function describe(element: FormControl, root: ParentNode): ScannedField {
  const question =
    isInput(element) && element.type === 'radio'
      ? element.closest('fieldset')
      : null;

  const context = controlContext(element);
  return {
    element,
    label: fieldLabel(element, question),
    section: sectionOf(element, question),
    kind: kindOf(element),
    required: isRequired(element, root),
    support: supportOf(element),
    context: context.text,
    group: context.group,
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

  // Custom dropdowns built on a text input commit a choice through their own
  // scripts; typing into them would not select anything.
  if (isCustomDropdown(element)) {
    return {
      status: 'unsupported',
      custom: {
        field: detection.kind === 'match' ? detection.field : null,
        evidence: detection.kind === 'match' ? detection.evidence : [],
      },
    };
  }

  // What the engine can write: text-like inputs, and native selects whose
  // options it can match exactly.
  const writable = isInput(element)
    ? TEXT_INPUT_TYPES.has(element.type) ||
      (DATE_INPUT_TYPES.has(element.type) &&
        detection.kind === 'match' &&
        DATE_FIELDS.has(detection.field))
    : element.localName === 'select' &&
      detection.kind === 'match' &&
      SELECT_FIELDS.has(detection.field);
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
