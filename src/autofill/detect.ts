import type { AutofillField } from './fields';

/**
 * Field detection: decides what a form control asks for, with the evidence,
 * before anything is written. Pure DOM reading with no browser-extension or
 * React dependencies.
 *
 * Conservative by design. Explicit semantics (`autocomplete`, input type)
 * are preferred; keyword matching only uses short labels and attribute
 * names. Anything about someone else (a reference, an employer), anything
 * sensitive, and anything with disagreeing signals is not matched: a correct
 * skip is better than a wrong fill.
 */

export type DetectableControl =
  HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export type Signal =
  | 'autocomplete'
  | 'type'
  | 'label'
  | 'name'
  | 'id'
  | 'placeholder'
  /** A select's options, e.g. calling codes such as "+44". */
  | 'options';

export interface Evidence {
  signal: Signal;
  /** The attribute value or text that was read. */
  text: string;
}

export type ManualReason = 'sensitive' | 'consent' | 'verification';

export type Detection =
  | { kind: 'match'; field: AutofillField; evidence: Evidence[] }
  /** Signals point at different fields, so it is left to the user. */
  | { kind: 'conflict'; fields: AutofillField[]; evidence: Evidence[] }
  /** About someone or something else: a reference, an employer, a company. */
  | { kind: 'other-person'; evidence: Evidence[] }
  /** Questions ApplyKit never answers for the user. */
  | { kind: 'manual'; reason: ManualReason }
  | { kind: 'none' };

/** `autocomplete` field names (WHATWG) and what they mean for the profile. */
const AUTOCOMPLETE: Record<string, AutofillField> = {
  name: 'fullName',
  'given-name': 'firstName',
  'family-name': 'lastName',
  nickname: 'preferredName',
  email: 'email',
  tel: 'phone',
  'tel-country-code': 'phoneCountryCode',
  'tel-national': 'phoneNational',
  'address-line1': 'addressLine1',
  'address-line2': 'addressLine2',
  'address-level2': 'city',
  'address-level1': 'region',
  'postal-code': 'postcode',
  country: 'country',
  'country-name': 'country',
};

/** Autocomplete hints that mark a value as not the applicant's own. */
const AUTOCOMPLETE_NOT_PERSONAL = new Set(['work', 'fax', 'pager']);

/**
 * Patterns on normalised text (lower case, words separated by single
 * spaces). Anchored patterns only match a whole label or attribute.
 */
const TEXT_RULES: Record<AutofillField, RegExp[]> = {
  fullName: [
    /^(?:your |applicant |candidate )?(?:full |legal |full legal )?name$/,
    /^fullname$/,
    /\bfull (?:legal )?name\b/,
    /\bfirst (?:and|&) (?:last|family) names?\b/,
  ],
  firstName: [
    /\bfirst names?\b/,
    /\bgiven names?\b/,
    /\bforenames?\b/,
    /^(?:fname|firstname|first|given)$/,
    /\bname first\b/,
  ],
  lastName: [
    /\blast names?\b/,
    /\bsurnames?\b/,
    /\bfamily names?\b/,
    /^(?:lname|lastname|last|family)$/,
    /\bname last\b/,
  ],
  preferredName: [
    /\bpreferred (?:first )?name\b/,
    /\bknown as\b/,
    /\bnick ?name\b/,
  ],
  email: [/\be ?mail\b/],
  phone: [/\b(?:phone|telephone|tel|mobile|cell)\b/, /\bcontact number\b/],
  addressLine1: [
    /\baddress (?:line )?1\b/,
    /\bstreet(?: address)?\b/,
    /\bline 1\b/,
  ],
  addressLine2: [
    /\baddress (?:line )?2\b/,
    /\b(?:apartment|suite|apt)\b/,
    /\bline 2\b/,
  ],
  city: [/\b(?:city|town|locality|municipality)\b/],
  region: [/\b(?:county|state|region|province)\b/],
  postcode: [/\bpost ?code\b/, /\bpostal code\b/, /\bzip(?: ?code)?\b/],
  country: [/\bcountry\b/],
  phoneCountryCode: [
    /\b(?:international|country) (?:telephone |phone |mobile )?(?:calling|dialling|dialing|dial) code\b/,
    /\b(?:calling|dialling|dialing|dial) code\b/,
    /\b(?:phone|telephone|mobile) country code\b/,
    /\bcountry code (?:for )?(?:your )?(?:phone|telephone|mobile)\b/,
    /\binternational (?:dialling |calling )?prefix\b/,
  ],
  // Only from `autocomplete="tel-national"`, or a phone field next to a
  // separate calling code (see report.ts).
  phoneNational: [],
  linkedin: [/\blinked ?in\b/],
  github: [/\bgit ?hub\b/],
  portfolio: [
    /\bportfolio\b/,
    /\bpersonal (?:website|site|url|web ?page|home ?page)\b/,
    /^(?:your )?(?:website|web site|home ?page|url|website url|web address)$/,
  ],
};

/** Address parts are short labels; longer text is likely a question. */
const SHORT_ONLY = new Set<AutofillField>(['city', 'region', 'country']);
const MAX_WORDS = 8;
const MAX_SHORT_WORDS = 4;

const OTHER_NAMES =
  /\b(?:other|another|second|alternative|alias(?:es)?|maiden|middle)\b/;

/**
 * Words that turn a matching label into something else, such as a phone
 * extension or a dialling code. They veto the field whatever other signals
 * say, unless they only appear in an instruction ("including country code").
 */
const EXCLUDE: Partial<Record<AutofillField, RegExp>> = {
  phone:
    /\b(?:ext|extension|prefix)\b|\b(?:phone|tel|telephone|mobile) (?:type|code)\b|\b(?:country|area|dial(?:l?ing)?|calling) code\b/,
  country: /\b(?:code|dial(?:l?ing)?|calling|prefix)\b/,
  // Previous or additional names are not the current name.
  fullName: OTHER_NAMES,
  firstName: OTHER_NAMES,
  lastName: OTHER_NAMES,
  preferredName: OTHER_NAMES,
};
const INSTRUCTION = /\b(?:include|including|incl|with)\b/;

function excluded(field: AutofillField, text: string): boolean {
  return (EXCLUDE[field]?.test(text) ?? false) && !INSTRUCTION.test(text);
}

/** Never answered automatically. */
const SENSITIVE =
  /\b(?:right to work|work permit|visa|sponsor\w*|salary|compensation|pay|wage|disabilit\w*|disabled|gender|sex|ethnic\w*|race|religio\w*|belief|sexual\w*|orientation|age|date of birth|dob|birth\w*|veteran|military|criminal|convictions?|pronouns?|marital|pregnan\w*|nationality|citizen\w*|origin|native|passport|national insurance|social security|ssn|diversity|equal opportunit\w*|caste)\b/;
const CONSENT =
  /\b(?:consent|agree\w*|declar\w*|terms|privacy|acknowledg\w*|certify|newsletter|marketing|subscribe|opt in)\b/;
const VERIFICATION = /captcha|turnstile|g-recaptcha/i;

/** Someone or something other than the applicant. */
const OTHER_PERSON =
  /\b(?:references?|referees?|referr\w*|referrals?|employers?|employees?|colleagues?|friends?|relatives?|interviewers?|company|organi[sz]ation|hiring|recruiter|manager|supervisor|emergency|next of kin|guardian|parent|spouse|partner|agency|business|work|office|school|university|college|previous|former|landlord|contact person)\b/;

/**
 * The same idea for the nearest heading before a control. Narrower, because
 * headings also carry job titles ("Engineering Manager") and company names.
 */
const OTHER_PERSON_HEADING =
  /\b(?:references?|referees?|referr\w*|referrals?|employers?|supervisors?|emergency|next of kin|guardian|spouse|partner|landlord|contact person)\b/;

export function detectControl(control: DetectableControl): Detection {
  const texts = textSignals(control);
  const context = sectionText(control);
  const heading = normalise(headingBefore(control));
  const all = [...texts.map((t) => t.normalised), context].join(' | ');

  const identifiers = [
    control.name,
    control.id,
    control.className,
    ...texts.map((t) => t.raw),
  ].join(' ');
  if (VERIFICATION.test(identifiers)) {
    return { kind: 'manual', reason: 'verification' };
  }
  if (SENSITIVE.test(all) || SENSITIVE.test(heading)) {
    return { kind: 'manual', reason: 'sensitive' };
  }
  if (CONSENT.test(all)) return { kind: 'manual', reason: 'consent' };

  const candidates = new Map<AutofillField, Evidence[]>();
  const add = (field: AutofillField, evidence: Evidence) => {
    const list = candidates.get(field);
    if (list) list.push(evidence);
    else candidates.set(field, [evidence]);
  };

  const autocomplete = (control.getAttribute('autocomplete') ?? '')
    .trim()
    .toLowerCase();
  const tokens = autocomplete.split(/\s+/).filter(Boolean);
  const notPersonal = tokens.some((token) =>
    AUTOCOMPLETE_NOT_PERSONAL.has(token),
  );
  const semantic = AUTOCOMPLETE[tokens.at(-1) ?? ''];
  if (semantic && !notPersonal) {
    add(semantic, { signal: 'autocomplete', text: autocomplete });
  }

  if (control instanceof HTMLInputElement) {
    const type = control.type;
    if (type === 'email') add('email', { signal: 'type', text: type });
    if (type === 'tel') add('phone', { signal: 'type', text: type });
  }

  for (const { signal, raw, normalised } of texts) {
    for (const field of matchText(normalised))
      add(field, { signal, text: raw });
  }

  // "Country code" alone could be an ISO code or a calling code; a select
  // whose options are calling codes settles it.
  const callingCodes = callingCodeOptions(control);
  if (
    callingCodes &&
    texts.some((t) => t.signal === 'label' && BARE_CODE.test(t.normalised))
  ) {
    add('phoneCountryCode', { signal: 'options', text: callingCodes });
  }

  // A label that asks something else outweighs an example in the
  // placeholder: "How did you hear about us?" with "e.g. LinkedIn".
  const labelled = texts.some((t) => t.signal === 'label');
  for (const [field, found] of [...candidates]) {
    const placeholderOnly = found.every((e) => e.signal === 'placeholder');
    if (
      (labelled && placeholderOnly) ||
      texts.some((t) => excluded(field, t.normalised))
    ) {
      candidates.delete(field);
    }
  }

  const evidence = [...candidates.values()].flat();
  if (
    notPersonal ||
    OTHER_PERSON.test(all) ||
    OTHER_PERSON_HEADING.test(heading)
  ) {
    return evidence.length > 0 || notPersonal
      ? { kind: 'other-person', evidence }
      : { kind: 'none' };
  }

  // A specific name part is more precise than a generic "Name" label.
  if (
    candidates.has('fullName') &&
    (candidates.has('firstName') || candidates.has('lastName'))
  ) {
    candidates.delete('fullName');
  }
  // "Preferred first name" is the preferred name, not the first name.
  if (candidates.has('preferredName')) candidates.delete('firstName');

  const fields = [...candidates.keys()];
  const [only] = fields;
  if (fields.length === 1 && only) {
    return { kind: 'match', field: only, evidence: candidates.get(only) ?? [] };
  }
  if (fields.length > 1) return { kind: 'conflict', fields, evidence };
  return { kind: 'none' };
}

const BARE_CODE = /^(?:country |phone )?(?:code|prefix)$/;
const CALLING_CODE = /\+\s?\d{1,4}\b/;

/**
 * For a select whose options are mostly calling codes ("+44",
 * "United Kingdom (+44)"), an example option; otherwise null.
 */
function callingCodeOptions(control: DetectableControl): string | null {
  if (!(control instanceof HTMLSelectElement)) return null;
  const options = [...control.options].filter((o) => o.value !== '');
  const coded = options.filter((o) => CALLING_CODE.test(o.text));
  return options.length >= 2 && coded.length / options.length >= 0.8
    ? (coded[0]?.text.trim() ?? null)
    : null;
}

/** The fields a piece of normalised text refers to. */
function matchText(text: string): AutofillField[] {
  const words = text.split(' ').length;
  if (words > MAX_WORDS) return [];
  // "First and last name" is one full-name field, not two.
  const fullNameOnly = TEXT_RULES.fullName.some((pattern) =>
    pattern.test(text),
  );
  const matches: AutofillField[] = [];
  for (const [field, patterns] of Object.entries(TEXT_RULES) as [
    AutofillField,
    RegExp[],
  ][]) {
    if (fullNameOnly && (field === 'firstName' || field === 'lastName')) {
      continue;
    }
    if (SHORT_ONLY.has(field) && words > MAX_SHORT_WORDS) continue;
    if (!patterns.some((pattern) => pattern.test(text))) continue;
    if (excluded(field, text)) continue;
    matches.push(field);
  }
  return matches;
}

interface TextSignal {
  signal: Signal;
  raw: string;
  normalised: string;
}

function textSignals(control: DetectableControl): TextSignal[] {
  const raw: [Signal, string][] = [
    ['label', labelText(control)],
    ['name', control.name],
    ['id', control.id],
    ['placeholder', 'placeholder' in control ? control.placeholder : ''],
  ];
  return raw
    .map(([signal, text]) => ({
      signal,
      raw: text.replace(/\s+/g, ' ').trim(),
      // Example addresses in placeholders ("name@company.com") are not
      // statements about the field.
      normalised: normalise(
        signal === 'placeholder'
          ? text.replace(/\S+@\S+|\S*(?:https?:\/\/|www\.)\S*/gi, ' ')
          : text,
      ),
    }))
    .filter((signal) => signal.normalised !== '');
}

/**
 * Legends and labels of the groups and sections around the control, e.g.
 * "Reference 1".
 */
function sectionText(control: DetectableControl): string {
  const parts: string[] = [];
  let node: Element | null = control.parentElement;
  while (node) {
    if (node instanceof HTMLFieldSetElement) {
      parts.push(node.querySelector(':scope > legend')?.textContent ?? '');
    }
    const role = node.getAttribute('role');
    if (
      node instanceof HTMLFieldSetElement ||
      node.localName === 'section' ||
      role === 'group' ||
      role === 'region'
    ) {
      parts.push(accessibleName(node));
    }
    node = node.parentElement;
  }
  return normalise(parts.join(' '));
}

/** `aria-label`, or the text of the elements named by `aria-labelledby`. */
function accessibleName(element: Element): string {
  const parts = [element.getAttribute('aria-label') ?? ''];
  for (const id of (element.getAttribute('aria-labelledby') ?? '').split(
    /\s+/,
  )) {
    if (id)
      parts.push(element.ownerDocument.getElementById(id)?.textContent ?? '');
  }
  return parts.join(' ');
}

const HEADINGS = 'h1, h2, h3, h4, h5, h6, [role="heading"]';

/**
 * The nearest heading before the control within its section (its fieldset
 * or labelled group, else its form, else the page): many forms mark
 * sections such as "Reference 1" with headings rather than fieldsets.
 */
function headingBefore(control: DetectableControl): string {
  const scope =
    control.closest('fieldset, section, [role="group"], [role="region"]') ??
    control.form ??
    control.ownerDocument.body;
  let nearest: Element | null = null;
  for (const heading of scope.querySelectorAll(HEADINGS)) {
    if (
      heading.compareDocumentPosition(control) &
      Node.DOCUMENT_POSITION_FOLLOWING
    ) {
      nearest = heading;
    } else {
      break;
    }
  }
  return nearest?.textContent ?? '';
}

export function labelText(control: DetectableControl): string {
  const parts: string[] = [];
  for (const label of control.labels ?? []) parts.push(ownText(label));
  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const element = control.ownerDocument.getElementById(id);
      if (element) parts.push(ownText(element));
    }
  }
  parts.push(control.getAttribute('aria-label') ?? '');
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * An element's text without the contents of controls inside it, so a label
 * wrapped around a select is not read as its list of options.
 */
function ownText(node: Node): string {
  let text = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? '';
    } else if (
      child instanceof Element &&
      !child.matches('select, textarea, button, script, style, template')
    ) {
      text += ` ${ownText(child)} `;
    }
  }
  return text;
}

/** "applicant[addressLine1]" → "applicant address line 1" */
export function normalise(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([a-zA-Z])(\d)/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** How evidence is shown to people, e.g. `autocomplete="given-name"`. */
export function describeEvidence(evidence: Evidence): string {
  switch (evidence.signal) {
    case 'label':
    case 'placeholder':
      return `${evidence.signal} “${evidence.text}”`;
    case 'options':
      return `options like “${evidence.text}”`;
    default:
      return `${evidence.signal}="${evidence.text}"`;
  }
}
