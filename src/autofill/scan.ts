import { isEducationField, type AutofillField } from './fields';
import {
  controlContext,
  detectControl,
  duringScan,
  formOf,
  nameOf,
  placeholderOf,
  labelText,
  normalise,
  type Evidence,
  type ManualReason,
} from './detect';

export type FormControl =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

/**
 * What a field is on the page: a native control ApplyKit can read and
 * fill, or a custom control (an ARIA combobox, listbox or popup button)
 * that it only reports and points at.
 */
export type FieldElement = FormControl | HTMLElement;

export function isFormControl(element: Element): element is FormControl {
  return (
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement
  );
}

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
  /** A custom control such as an ARIA combobox: reported, never written. */
  | 'custom'
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

/** A field whose element is a native control, the only kind ever written. */
export type ControlField = ScannedField & { element: FormControl };

export function isControlField(field: ScannedField): field is ControlField {
  return isFormControl(field.element);
}

export interface ScannedField {
  element: FieldElement;
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
    (popup !== null && POPUP_ROLES.has(popup)) ||
    // ARIA 1.0 comboboxes wrap their text input in the combobox element.
    // Inputs inside a combobox or popup wrapper belong to that widget.
    element.parentElement?.closest(CUSTOM_CONTROLS) != null
  );
}

/**
 * Custom controls that are not native inputs: comboboxes, buttons that open
 * a listbox, and listboxes shown on the page. Menus ("aria-haspopup=menu"
 * or "true") are left out: they are navigation and actions, not answers.
 */
const CUSTOM_CONTROLS =
  '[role="combobox"], [role="listbox"], [aria-haspopup="listbox"]';

/** Page furniture whose dropdowns are never part of an application. */
const OUTSIDE_APPLICATION =
  'nav, [role="navigation"], [role="search"], [role="menubar"], [role="menu"], [role="toolbar"], [role="banner"]';

/**
 * Navigation, site search, menus, and the page's own header and footer
 * (but not a header inside the application form or main content).
 */
function isPageFurniture(element: Element): boolean {
  if (element.closest(OUTSIDE_APPLICATION)) return true;
  const edge = element.closest('header, footer, [role="contentinfo"], search');
  return (
    edge !== null &&
    edge.parentElement?.closest(
      'form, main, [role="main"], section, article',
    ) == null
  );
}

/** A native control that can actually be answered: shown and editable. */
function isAnswerable(
  control: Element,
  isVisible: (element: Element) => boolean,
): boolean {
  return (
    isFormControl(control) &&
    !(control instanceof HTMLInputElement && control.type === 'hidden') &&
    !control.matches(':disabled') &&
    !('readOnly' in control && control.readOnly) &&
    isVisible(control)
  );
}

/**
 * Whether a custom control element should be listed as a field on its own.
 * Evidence comes from roles and ARIA relationships only, never from class
 * names, so one logical question is counted once. `owned` holds the ids
 * other elements control or own (popup lists), collected once per scan.
 */
function isCustomField(
  element: HTMLElement,
  isVisible: (element: Element) => boolean,
  owned: ReadonlySet<string>,
): boolean {
  if (isFormControl(element)) return false;
  if (isPageFurniture(element)) return false;
  if (
    element.getAttribute('aria-disabled') === 'true' ||
    element.hasAttribute('disabled') ||
    element.closest('fieldset[disabled]')
  ) {
    return false;
  }
  if (!isVisible(element)) return false;
  // An answerable native control inside represents the question (and is
  // reported as a custom dropdown itself). Hidden, read-only or disabled
  // backing inputs do not.
  if (
    [...element.querySelectorAll('input, select, textarea')].some((control) =>
      isAnswerable(control, isVisible),
    )
  ) {
    return false;
  }
  // Counted once: the outermost of nested candidates.
  if (element.parentElement?.closest(CUSTOM_CONTROLS)) return false;
  if (element.getAttribute('role') === 'listbox' && owned.has(element.id)) {
    return false;
  }
  // Without a name there is nothing to tell the user, and too little
  // evidence that it is a question at all.
  return labelText(element) !== '';
}

/** Ids that some element controls or owns: popups of other controls. */
function ownedIds(root: ParentNode): Set<string> {
  const ids = new Set<string>();
  for (const owner of root.querySelectorAll('[aria-controls], [aria-owns]')) {
    for (const attribute of ['aria-controls', 'aria-owns']) {
      for (const id of (owner.getAttribute(attribute) ?? '').split(/\s+/)) {
        if (id) ids.add(id);
      }
    }
  }
  return ids;
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
  return duringScan(() => scanWithin(root, isVisible));
}

function scanWithin(
  root: ParentNode,
  isVisible: (element: Element) => boolean,
): ScannedField[] {
  const fields: ScannedField[] = [];
  const radioGroups = new Set<string>();
  const owned = ownedIds(root);

  for (const element of root.querySelectorAll<HTMLElement>(
    `input, select, textarea, ${CUSTOM_CONTROLS}`,
  )) {
    if (!isFormControl(element)) {
      if (isCustomField(element, isVisible, owned)) {
        fields.push(describe(element, root));
      }
      continue;
    }
    // `:disabled` includes controls disabled by their fieldset.
    if (element.matches(':disabled') || !isVisible(element)) continue;
    // Site search and navigation are never part of an application, also on
    // pages without a form element.
    if (isPageFurniture(element)) continue;

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
      const form = formOf(field.element);
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
  return fields.filter((field) => formOf(field.element) === application);
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
      [labelText(element), nameOf(element), element.id].join(' '),
    );
    if (CONFIRMATION.test(text)) return field;
    return { ...field, support: { ...support, status: 'duplicate' } };
  });
}

function describe(element: FieldElement, root: ParentNode): ScannedField {
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

function supportOf(element: FieldElement): FieldSupport {
  const detection = detectControl(element);
  if (detection.kind === 'manual') {
    return { status: 'manual', reason: detection.reason };
  }
  if (detection.kind === 'other-person') {
    return { status: 'other-person', evidence: detection.evidence };
  }

  // Custom dropdowns built on a text input commit a choice through their own
  // scripts; typing into them would not select anything.
  if (!isFormControl(element) || isCustomDropdown(element)) {
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

function kindOf(element: FieldElement): FieldKind {
  if (!isFormControl(element)) return 'custom';
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
  element: FieldElement,
  question: HTMLFieldSetElement | null,
): string {
  const candidates = [
    question ? legendText(question) : '',
    labelText(element),
    placeholderOf(element),
    nameOf(element),
  ];
  for (const candidate of candidates) {
    const text = cleanLabel(candidate);
    if (text) return text;
  }
  return 'Unlabelled field';
}

function sectionOf(
  element: FieldElement,
  question: HTMLFieldSetElement | null,
): string | null {
  // For a radio group the nearest fieldset is the question itself, so the
  // section is the fieldset around that.
  const start = question?.parentElement ?? element;
  const section = start.closest('fieldset');
  if (!section) return null;
  return cleanLabel(legendText(section)) || null;
}

function isRequired(element: FieldElement, root: ParentNode): boolean {
  if (
    (isFormControl(element) && element.required) ||
    element.getAttribute('aria-required') === 'true'
  ) {
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

function isInput(element: Element): element is HTMLInputElement {
  return element.localName === 'input';
}

function isTextArea(element: Element): element is HTMLTextAreaElement {
  return element.localName === 'textarea';
}
