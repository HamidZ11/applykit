import {
  isAnswerField,
  isDiversityField,
  isRecordField,
  type AutofillField,
} from './fields';
import {
  controlContext,
  detectControl,
  duringScan,
  fieldHints,
  SECTIONS,
  formOf,
  nameOf,
  radioQuestionText,
  placeholderOf,
  labelText,
  normalise,
  type Evidence,
  type ManualReason,
} from './detect';
import { readLimits } from './answer-limits';
import { isShown } from './visibility';
import { radioGroupOf } from './radio-group';
import {
  MAX_QUESTION_LENGTH,
  openQuestionKind,
  prohibitsAi,
  type OpenQuestion,
} from './open-question';

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
   * An open question the applicant answers in their own words, which AI
   * drafting may help with (ADR 0019). Never filled by autofill.
   */
  | { status: 'open'; question: OpenQuestion }
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

/**
 * The profile field a field asks for: matched for filling, or seen on a
 * control ApplyKit only guides (a custom dropdown, a checkbox).
 */
export function fieldTarget(field: ScannedField): AutofillField | null {
  const { support } = field;
  if (support.status === 'match') return support.field;
  if (support.status === 'unsupported') return support.custom?.field ?? null;
  return null;
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
  'diversityGender',
  'diversityEthnicity',
  'diversityDisability',
  'diversityReligion',
  'diversitySexualOrientation',
  'country',
  'phoneCountryCode',
  'institution',
  'qualification',
  'fieldOfStudy',
  'educationStart',
  'educationEnd',
  'grade',
  'employer',
  'jobTitle',
  'employmentType',
  'employmentStart',
  'employmentEnd',
  'noticePeriod',
  'relocation',
  'workArrangement',
  'startDate',
  'salaryExpectation',
  'graduation',
]);

/**
 * Date inputs, writable only for education and employment dates. A `date`
 * input is listed so the panel can say why it is left: it needs a day.
 */
const DATE_INPUT_TYPES = new Set(['month', 'number', 'date']);
const DATE_FIELDS = new Set<AutofillField>([
  'educationStart',
  'educationEnd',
  'employmentStart',
  'employmentEnd',
]);

/**
 * Saved answers that suit special inputs: a start date in a date or month
 * input, a notice period or salary in a number input.
 */
const ANSWER_INPUTS: Record<string, ReadonlySet<AutofillField>> = {
  date: new Set(['startDate']),
  month: new Set(['startDate']),
  number: new Set(['noticePeriod', 'salaryExpectation', 'graduation']),
};

/** Long answers ApplyKit may fill: only a saved description of a job. */
const TEXTAREA_FIELDS = new Set<AutofillField>(['jobDescription']);

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
  { isVisible = isShown }: ScanOptions = {},
): ScannedField[] {
  return duringScan(() => scanWithin(root, isVisible));
}

function scanWithin(
  root: ParentNode,
  isVisible: (element: Element) => boolean,
): ScannedField[] {
  const fields: ScannedField[] = [];
  // One field per radio group: per form element (not its id, which two
  // forms may lack) and name.
  const radioGroups = new Map<HTMLFormElement | null, Set<string>>();
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
        const names = radioGroups.get(element.form) ?? new Set<string>();
        radioGroups.set(element.form, names);
        if (names.has(element.name)) continue;
        names.add(element.name);
      }
    } else if (isTextArea(element) && element.readOnly) {
      continue;
    }

    fields.push(describe(element, root, isVisible));
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
 * Education and jobs are asked once per record, so such a field only
 * repeats one in the same section: "University" and "School name", or
 * "Employer" in "Employment 1" and "Employment 2", are all kept.
 */
function firstOfEachDetail(fields: ScannedField[]): ScannedField[] {
  const seen = new Set<string>();
  const seenInSection = new Map<Element | null, Set<string>>();
  return fields.map((field) => {
    const { support, element } = field;
    // Saved answers are each confirmed by the user, so asking twice
    // ("Notice period in weeks", "… in days") is not a risk.
    if (support.status !== 'match' || isAnswerField(support.field)) {
      return field;
    }
    let scope = seen;
    if (isRecordField(support.field)) {
      scope = seenInSection.get(field.group) ?? new Set();
      seenInSection.set(field.group, scope);
    }
    const key = detailKey(support.field, field.label);
    if (!scope.has(key)) {
      scope.add(key);
      return field;
    }
    const text = normalise(
      [labelText(element), nameOf(element), element.id].join(' '),
    );
    if (CONFIRMATION.test(text)) return field;
    return { ...field, support: { ...support, status: 'duplicate' } };
  });
}

/** "Start month" and "Start year" are two parts of one date, not a repeat. */
function detailKey(field: AutofillField, label: string): string {
  if (!DATE_FIELDS.has(field)) return field;
  const month = /\bmonths?\b/i.test(label);
  const year = /\byears?\b/i.test(label);
  return month === year ? field : `${field}:${month ? 'month' : 'year'}`;
}

function describe(
  element: FieldElement,
  root: ParentNode,
  isVisible: (element: Element) => boolean = isShown,
): ScannedField {
  const radio = isInput(element) && element.type === 'radio';
  const question = radio ? element.closest('fieldset') : null;

  const context = controlContext(element);
  const label =
    (radio && cleanLabel(radioQuestionText(element))) ||
    fieldLabel(element, question);
  return {
    element,
    label,
    section: sectionOf(element, question),
    kind: kindOf(element),
    required: isRequired(element, root),
    support: supportOf(element, label, isVisible),
    context: context.text,
    group: context.group,
  };
}

function supportOf(
  element: FieldElement,
  label: string,
  isVisible: (element: Element) => boolean,
): FieldSupport {
  const detection = detectControl(element);
  if (detection.kind === 'manual') {
    return { status: 'manual', reason: detection.reason };
  }
  if (detection.kind === 'other-person') {
    return { status: 'other-person', evidence: detection.evidence };
  }

  // Custom dropdowns built on a text input commit a choice through their own
  // scripts; typing into them would not select anything. Checkboxes are
  // only guided. A radio group is answered only for a saved answer or a
  // monitoring question, and only when it is a native group whose
  // boundary and labels are certain (ADR 0020); otherwise it is guided.
  // Monitoring questions are otherwise written only into a native list
  // allowing one choice (ADR 0018).
  const matched = detection.kind === 'match' ? detection.field : null;
  const monitoring = matched !== null && isDiversityField(matched);
  const answerable = matched !== null && (isAnswerField(matched) || monitoring);
  const radio = isInput(element) && element.type === 'radio';
  const certainGroup =
    radio && answerable && radioGroupOf(element, isVisible) !== null;
  if (
    !isFormControl(element) ||
    isCustomDropdown(element) ||
    (monitoring &&
      !(element instanceof HTMLSelectElement && !element.multiple) &&
      !certainGroup) ||
    (radio && answerable && !certainGroup) ||
    matched === 'currentlyEmployed'
  ) {
    return {
      status: 'unsupported',
      custom: {
        field: detection.kind === 'match' ? detection.field : null,
        evidence: detection.kind === 'match' ? detection.evidence : [],
      },
    };
  }

  if (detection.kind === 'none') {
    const open = openQuestionOf(element, label);
    if (open) return { status: 'open', question: open };
  }

  // What the engine can write: text-like inputs, and native selects whose
  // options it can match exactly.
  const writable = isInput(element)
    ? certainGroup ||
      TEXT_INPUT_TYPES.has(element.type) ||
      (DATE_INPUT_TYPES.has(element.type) &&
        matched !== null &&
        (DATE_FIELDS.has(matched) ||
          (ANSWER_INPUTS[element.type]?.has(matched) ?? false)))
    : matched !== null &&
      (isTextArea(element) ? TEXTAREA_FIELDS : SELECT_FIELDS).has(matched);
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

/**
 * An open question in a text box: a textarea, or a text input whose
 * length says it wants more than a word or two. Only ever drafted on the
 * user's request, never filled by autofill.
 */
function openQuestionOf(
  element: FieldElement,
  label: string,
): OpenQuestion | null {
  const textArea = isTextArea(element);
  if (!textArea && !(isInput(element) && element.type === 'text')) return null;
  const hints = fieldHints(element);
  const kind = openQuestionKind(label, hints);
  if (!kind) return null;
  const maxLength = element.maxLength > 0 ? element.maxLength : null;
  const placeholder = element.placeholder;
  const limits = readLimits(`${label} | ${hints} | ${placeholder}`, maxLength);
  if (
    !textArea &&
    (maxLength === null || maxLength < 100) &&
    limits.words.max === null &&
    limits.sentences.max === null
  ) {
    return null;
  }
  // A prohibition counts only when it sits with this question: in its
  // label, its own hints or its section, never elsewhere on the page.
  const section = element.closest(SECTIONS)?.textContent ?? '';
  return {
    kind,
    question: label.trim().slice(0, MAX_QUESTION_LENGTH),
    limits,
    aiProhibited: prohibitsAi(
      `${label} | ${hints} | ${placeholder} | ${section.slice(0, 4000)}`,
    ),
  };
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
