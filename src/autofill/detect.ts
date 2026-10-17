import {
  isEducationField,
  type AutofillField,
  type EducationField,
} from './fields';

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

/**
 * Anything detection reads: native controls, and custom controls such as
 * ARIA comboboxes, which have no `name`, `labels` or `form` of their own.
 */
export type DetectableControl = HTMLElement;

/** The control's `name`, or its name attribute for custom controls. */
export function nameOf(control: DetectableControl): string {
  return 'name' in control && typeof control.name === 'string'
    ? control.name
    : (control.getAttribute('name') ?? '');
}

/** The form a control belongs to: its own `form`, else the one around it. */
export function formOf(control: DetectableControl): HTMLFormElement | null {
  return 'form' in control && control.form instanceof HTMLFormElement
    ? control.form
    : control.closest('form');
}

/** The placeholder, or `aria-placeholder` on custom controls. */
export function placeholderOf(control: DetectableControl): string {
  return control instanceof HTMLInputElement ||
    control instanceof HTMLTextAreaElement
    ? control.placeholder
    : (control.getAttribute('aria-placeholder') ?? '');
}

/** `<label>` elements for the control, including `for` on custom controls. */
function labelsOf(control: DetectableControl): Iterable<HTMLLabelElement> {
  if ('labels' in control && control.labels instanceof NodeList) {
    return control.labels as NodeListOf<HTMLLabelElement>;
  }
  if (!control.id) return [];
  return control.ownerDocument.querySelectorAll<HTMLLabelElement>(
    `label[for="${CSS.escape(control.id)}"]`,
  );
}

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
const TEXT_RULES: Record<Exclude<AutofillField, EducationField>, RegExp[]> = {
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

/**
 * Education fields. `strong` patterns say what they ask on their own
 * ("University", "Graduation date"); `contextual` ones ("Start date",
 * "Grade", "Subject") count only inside an education section.
 */
const EDUCATION_RULES: Record<
  EducationField,
  { strong: RegExp[]; contextual: RegExp[] }
> = {
  institution: {
    strong: [
      /\buniversit(?:y|ies)\b/,
      /\b(?:educational |academic |awarding )?institution\b/,
      /\beducation provider\b/,
      /\bplace of study\b/,
      /^(?:name of (?:your )?)?(?:school|college)(?: name| attended)?$/,
      /\bschool (?:or|and) (?:college|university)\b/,
    ],
    contextual: [/^(?:establishment|provider)(?: name)?$/],
  },
  qualification: {
    strong: [
      /\bqualifications?(?: type| level| title| name| obtained| achieved)?\b/,
      /\bdegrees?(?: type| level| title| name)?\b/,
      /\btype of (?:degree|qualification)\b/,
      /\b(?:level of|highest) (?:education|study|qualification)\b/,
      /\beducation level\b/,
    ],
    contextual: [/^(?:level|award|type)$/],
  },
  fieldOfStudy: {
    strong: [
      /\b(?:field|area|subject) of (?:study|degree)\b/,
      /^(?:your |intended |declared )?major$/,
      /\bdegree subject\b/,
      /\b(?:course|programme|program) of study\b/,
    ],
    contextual: [
      /^(?:main )?subjects?$/,
      /^(?:course|programme|program|discipline|specialisation|specialization)(?: title| name)?$/,
    ],
  },
  educationStart: {
    strong: [
      /\b(?:course|study|studies|education|university|degree|enrol(?:l)?ment) start(?: date| year| month)?\b/,
      /\bdate (?:started|of enrol(?:l)?ment)\b/,
      /\byear of (?:entry|enrol(?:l)?ment)\b/,
    ],
    contextual: [
      /^(?:start(?:ed|ing)?|from|began|commenced)(?: date| year| month)?$/,
      /^(?:date|year|month) (?:started|from)$/,
    ],
  },
  educationEnd: {
    strong: [
      /\bgraduat(?:ion|ed|ing)\b/,
      /\bdate (?:of )?(?:award|completion)\b/,
      /\b(?:date|year) (?:awarded|obtained|achieved|completed|conferred)\b/,
      /\byear of (?:completion|graduation)\b/,
      /\b(?:course|study|studies|degree) (?:end|finish|completion)(?: date| year)?\b/,
    ],
    contextual: [
      /^(?:end(?:ed|ing)?|to|finish(?:ed)?|until|complet(?:ed|ion))(?: date| year| month)?$/,
      /^(?:date|year|month) (?:ended|finished|completed|to)$/,
    ],
  },
  grade: {
    strong: [
      /\b(?:degree )?classification\b/,
      /\bgpa\b/,
      /\bgrade point average\b/,
      /\b(?:predicted|expected|final|overall|degree|achieved|obtained) grades?\b/,
      /\bgrades? (?:achieved|obtained|awarded|predicted|expected)\b/,
      /\bdegree result\b/,
    ],
    contextual: [
      /^(?:grades?|results?|score|marks?)$/,
      /^(?:overall|final) (?:result|score|mark)$/,
    ],
  },
};

/** Sections about education, or about jobs, from legends and headings. */
const EDUCATION_CONTEXT =
  /\b(?:education|educational|academic|qualifications?|universit(?:y|ies)|degrees?|studies|schooling|school|college)\b/;
const EMPLOYMENT_CONTEXT =
  /\b(?:employment|experience|work history|employers?|career|jobs?|positions?|internships?)\b/;

/**
 * When text matches several education fields, the more specific wins:
 * "Degree classification" is a grade, "University start date" a date.
 */
const LESS_SPECIFIC: [EducationField, EducationField[]][] = [
  [
    'institution',
    [
      'qualification',
      'fieldOfStudy',
      'educationStart',
      'educationEnd',
      'grade',
    ],
  ],
  [
    'qualification',
    ['fieldOfStudy', 'educationStart', 'educationEnd', 'grade'],
  ],
  ['fieldOfStudy', ['educationStart', 'educationEnd', 'grade']],
];

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
  // "University ID", "University email": about the institution, not it.
  institution:
    /\b(?:id|number|no|email|e mail|phone|telephone|address|city|town|country|postcode|website|url|code|ranking|financial|bank)\b/,
  qualification: /\b(?:number|id|code|reference|certificate number)\b/,
};
const INSTRUCTION = /\b(?:include|including|incl|with)\b/;

function excluded(field: AutofillField, text: string): boolean {
  return (EXCLUDE[field]?.test(text) ?? false) && !INSTRUCTION.test(text);
}

/** Never answered automatically. */
const SENSITIVE =
  /\b(?:right to work|work permit|visa|sponsor\w*|salary|compensation|pay|wage|disabilit\w*|disabled|gender|sex|ethnic\w*|race|religio\w*|belief|sexual\w*|orientation|age|date of birth|dob|birth\w*|veteran|military|criminal|convictions?|pronouns?|marital|pregnan\w*|nationality|citizen\w*|origin|native|passport|national insurance|social security|ssn|diversity|equal opportunit\w*|caste|medical|health|political|politics|trade union\w*)\b/;

/**
 * The same, for technical `name` and `id` attributes of a labelled control.
 * Words that are also common in component and framework names ("native"
 * select, "origin", "page", "age") are left out: they decide only when they
 * appear in wording people read, or when the control has no label at all.
 */
const SENSITIVE_IDENTIFIER =
  /\b(?:right to work|work permit|visa|sponsor\w*|salary|compensation|disabilit\w*|disabled|gender|ethnic\w*|religio\w*|sexual\w*|orientation|date of birth|dob|birth\w*|veteran|military|criminal|convictions?|pronouns?|marital|pregnan\w*|nationality|citizen\w*|passport|national insurance|social security|ssn|diversity|equal opportunit\w*|caste|medical|health|political|politics|trade union\w*)\b/;
const CONSENT =
  /\b(?:consent|agree\w*|declar\w*|terms|privacy|acknowledg\w*|certify|newsletter|marketing|subscribe|opt in)\b/;
const VERIFICATION = /captcha|turnstile|g-recaptcha/i;

/** Someone or something other than the applicant. */
const OTHER_PERSON =
  /\b(?:references?|referees?|referr\w*|referrals?|employers?|employees?|colleagues?|friends?|relatives?|interviewers?|company|organi[sz]ation|hiring|recruiter|manager|supervisor|emergency|next of kin|guardian|parent|spouse|partner|agency|business|work|office|school|university|college|previous|former|landlord|contact person)\b/;

/**
 * For education fields: schools, universities and previous study are the
 * applicant's own education, but people and employers are still not.
 */
const OTHER_PERSON_EDUCATION =
  /\b(?:references?|referees?|referr\w*|referrals?|employers?|employees?|colleagues?|friends?|relatives?|interviewers?|company|organi[sz]ation|hiring|recruiter|manager|supervisor|emergency|next of kin|guardian|parent|spouse|partner|agency|business|work|office|landlord|contact person)\b/;

/**
 * The same idea for the nearest heading before a control. Narrower, because
 * headings also carry job titles ("Engineering Manager") and company names.
 */
const OTHER_PERSON_HEADING =
  /\b(?:references?|referees?|referr\w*|referrals?|employers?|supervisors?|emergency|next of kin|guardian|spouse|partner|landlord|contact person)\b/;

export function detectControl(control: DetectableControl): Detection {
  const texts = textSignals(control);
  const context = sectionText(control);
  const heading = normalise(headingElementBefore(control)?.textContent ?? '');
  const all = [...texts.map((t) => t.normalised), context].join(' | ');
  const surroundings = `${context} ${heading}`;
  const inEducation =
    EDUCATION_CONTEXT.test(surroundings) &&
    !EMPLOYMENT_CONTEXT.test(surroundings);
  const inEmployment = EMPLOYMENT_CONTEXT.test(surroundings);

  const identifiers = [
    nameOf(control),
    control.id,
    control.className,
    ...texts.map((t) => t.raw),
  ].join(' ');
  if (VERIFICATION.test(identifiers)) {
    return { kind: 'manual', reason: 'verification' };
  }
  // Wording people read decides; technical names add evidence, but never
  // make an ordinary labelled field sensitive on their own.
  const wording = [
    ...texts
      .filter((t) => t.signal === 'label' || t.signal === 'placeholder')
      .map((t) => t.normalised),
    context,
    heading,
  ].join(' | ');
  const technical = texts
    .filter((t) => t.signal === 'name' || t.signal === 'id')
    .map((t) => t.normalised)
    .join(' | ');
  const hasLabel = texts.some((t) => t.signal === 'label');
  if (
    SENSITIVE.test(wording) ||
    (hasLabel ? SENSITIVE_IDENTIFIER : SENSITIVE).test(technical)
  ) {
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
    if (inEmployment && !inEducation) continue;
    for (const field of matchEducation(normalised, inEducation)) {
      add(field, { signal, text: raw });
    }
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

  // In an education section, "Name" or "Email" is about the institution;
  // only explicit autocomplete semantics still count.
  if (inEducation) {
    for (const [field, found] of [...candidates]) {
      if (
        !isEducationField(field) &&
        !found.some((e) => e.signal === 'autocomplete')
      ) {
        candidates.delete(field);
      }
    }
  }
  for (const [general, specific] of LESS_SPECIFIC) {
    if (specific.some((field) => candidates.has(field))) {
      candidates.delete(general);
    }
  }

  const evidence = [...candidates.values()].flat();
  const onlyEducation =
    candidates.size > 0 && [...candidates.keys()].every(isEducationField);
  const otherPerson = onlyEducation ? OTHER_PERSON_EDUCATION : OTHER_PERSON;
  if (
    notPersonal ||
    otherPerson.test(all) ||
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
    Exclude<AutofillField, EducationField>,
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

/** The education fields a piece of normalised text refers to. */
function matchEducation(text: string, inEducation: boolean): EducationField[] {
  if (text.split(' ').length > MAX_WORDS) return [];
  const matches: EducationField[] = [];
  for (const [field, rules] of Object.entries(EDUCATION_RULES) as [
    EducationField,
    { strong: RegExp[]; contextual: RegExp[] },
  ][]) {
    const patterns = inEducation
      ? [...rules.strong, ...rules.contextual]
      : rules.strong;
    if (!patterns.some((pattern) => pattern.test(text))) continue;
    if (excluded(field, text)) continue;
    matches.push(field);
  }
  return matches;
}

const FORMAT_HINT = /\b(?:dd|mm|yyyy|yy)\b/g;

interface TextSignal {
  signal: Signal;
  raw: string;
  normalised: string;
}

function textSignals(control: DetectableControl): TextSignal[] {
  const raw: [Signal, string][] = [
    ['label', labelText(control)],
    ['name', nameOf(control)],
    ['id', control.id],
    ['placeholder', placeholderOf(control)],
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
      )
        // Format hints ("Start date (MM/YYYY)") say how to answer, not what
        // is asked; dates.ts reads them when formatting the value.
        .replace(FORMAT_HINT, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
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

const SECTIONS = 'fieldset, section, [role="group"], [role="region"]';

/**
 * The nearest heading before the control within its section (its fieldset
 * or labelled group, else its form, else the page): many forms mark
 * sections such as "Reference 1" with headings rather than fieldsets.
 */
function headingElementBefore(control: DetectableControl): Element | null {
  const scope =
    control.closest(SECTIONS) ?? formOf(control) ?? control.ownerDocument.body;
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
  return nearest;
}

/** Where a control sits: its section's text and the element grouping it. */
export interface ControlContext {
  /** Normalised legends, group labels and the nearest heading. */
  text: string;
  /**
   * The fieldset or labelled section around the control, else the heading
   * it follows, else its form. Controls sharing it form one section.
   */
  group: Element | null;
}

export function controlContext(control: DetectableControl): ControlContext {
  const heading = headingElementBefore(control);
  return {
    text: normalise(`${sectionText(control)} ${heading?.textContent ?? ''}`),
    group: control.closest(SECTIONS) ?? heading ?? formOf(control),
  };
}

export function labelText(control: DetectableControl): string {
  const parts: string[] = [];
  for (const label of labelsOf(control)) parts.push(ownText(label));
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
