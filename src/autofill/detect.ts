import type { DiversityCategory } from '@/domain/diversity';
import { readGraduationQuestion } from './graduation-question';
import {
  isAnswerField,
  isEducationField,
  isEmploymentField,
  type AnswerField,
  DIVERSITY_FIELD,
  type AutofillField,
  type DiversityField,
  type EducationField,
  type EmploymentField,
} from './fields';
import { diversityQuestion } from './diversity';

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

export type ManualReason =
  | 'sensitive'
  | 'consent'
  | 'verification'
  /** About the applicant's own circumstances, which no profile holds. */
  | 'answer';

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
const TEXT_RULES: Record<
  Exclude<
    AutofillField,
    EducationField | EmploymentField | AnswerField | DiversityField
  >,
  RegExp[]
> = {
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

/**
 * Employment fields. `strong` patterns name the applicant's own job
 * ("Current employer", "Previous job title"); `contextual` ones
 * ("Company", "Title", "From") count only inside a work-history section.
 * A job the applicant is applying for is never their employment history.
 */
const EMPLOYMENT_RULES: Record<
  Exclude<EmploymentField, 'currentlyEmployed'>,
  { strong: RegExp[]; contextual: RegExp[] }
> = {
  employer: {
    strong: [
      /^(?:name of )?(?:your )?(?:current|present|previous|former|most recent|last|latest) (?:employer|company|organi[sz]ation)(?: s)?(?: name)?$/,
    ],
    contextual: [
      /^(?:name of )?(?:the )?(?:employer|company|organi[sz]ation|business|firm)(?: s)?(?: name)?$/,
      /^employed (?:by|at)$/,
    ],
  },
  jobTitle: {
    strong: [
      /^(?:your )?(?:current|present|previous|former|most recent|last|latest) (?:job title|job|role|position|post)(?: title| held)?$/,
    ],
    contextual: [
      /^(?:job |role |position )?title$/,
      /^(?:job|role|position|post|occupation)(?: held| title| name)?$/,
      /^positions? held$/,
    ],
  },
  employmentType: {
    strong: [],
    contextual: [
      /^(?:employment|contract|job|work|position|role) type$/,
      /^type of (?:employment|contract|job|work|position|role)$/,
      /^full (?:time )?or part time$/,
    ],
  },
  employmentStart: {
    strong: [
      /\b(?:employment|job|role|position) start(?: date| month| year)?\b/,
      /\bdate (?:employment|job|role) (?:started|began|commenced)\b/,
      /\bstart(?:ed)? (?:date )?(?:of|in) (?:employment|role|position|job)\b/,
    ],
    contextual: [
      /^(?:start(?:ed|ing)?|from|began|commenced|joined)(?: date| year| month)?$/,
      /^(?:date|year|month) (?:started|from|joined)$/,
    ],
  },
  employmentEnd: {
    strong: [
      /\b(?:employment|job|role|position) end(?: date| month| year)?\b/,
      /\bdate (?:employment|job|role) (?:ended|finished)\b/,
    ],
    contextual: [
      /^(?:end(?:ed|ing)?|to|until|finish(?:ed)?|left)(?: date| year| month)?$/,
      /^(?:date|year|month) (?:ended|finished|to|left)$/,
      /^(?:leaving date|date of leaving)$/,
    ],
  },
  jobDescription: {
    strong: [],
    contextual: [
      /^(?:(?:main|key) )?(?:duties|responsibilities)(?: (?:and|&) (?:duties|responsibilities))?$/,
      /^(?:job|role|position) (?:description|summary|duties|responsibilities)$/,
      /^(?:description|summary)(?: of (?:your )?(?:role|duties|responsibilities|job|position))?$/,
    ],
  },
};

/** "I currently work here": only ever a checkbox, and only ever guided. */
const CURRENT_ROLE = {
  strong: [
    /^(?:i )?(?:currently|still) (?:work|working|am working|employed) (?:here|there)$/,
    /^i (?:currently |still )?work here$/,
    /^i am (?:currently |still )?(?:employed|working) here$/,
    /^(?:this is )?(?:my )?current (?:role|job|position|employer|employment)$/,
    /^currently employed here$/,
  ],
  contextual: [
    /^(?:current|currently employed|present|to present|until present|ongoing|still employed)$/,
  ],
};

/**
 * Sections clearly about the applicant's own jobs. "Experience" alone is
 * not enough: forms use it for CVs, portfolios and links too.
 */
const WORK_HISTORY =
  /\b(?:(?<!application for )(?<!apply for )employment(?! (?:application|applications|form|details|status|eligibility|opportunit\w*|preferences?|equity|type|agenc\w*))|work (?:history|experience)|career history|job history|professional experience|positions? held|(?:current|present|previous|former|past|prior|recent|earlier|last|latest) (?:employment|employers?|company)|(?:current|present) (?:job|position|role)|(?:previous|former|past|prior|recent|earlier|last|latest) (?:jobs?|positions?|roles?)|(?:employers?|employment) \d+|employer details)\b/;

/**
 * Sections about the job being applied for: whatever they ask, it is not
 * the applicant's history. Read from the field's own section and heading. "Apply for one of our current jobs", "Which
 * roles are you applying for?", "Our vacancies".
 */
const APPLYING =
  /\b(?:appl(?:y|ying|ied)|vacanc\w*|opportunit\w*|role preferences?|our (?:jobs|roles|positions|openings))\b/;

/**
 * Personal details that, inside a work-history section, belong to the
 * employer: its name, address, phone or email.
 */
const EMPLOYER_DETAILS = new Set<AutofillField>([
  'fullName',
  'firstName',
  'lastName',
  'preferredName',
  'email',
  'phone',
  'phoneCountryCode',
  'phoneNational',
  'addressLine1',
  'addressLine2',
  'city',
  'region',
  'postcode',
  'country',
]);

/** Questions about what someone expects to earn, not what they earn. */
const SALARY_EXPECTATION =
  /\b(?:(?:salary|pay|compensation|remuneration|rate) expectations?|expected (?:annual |yearly |monthly |base |basic |starting )?(?:salary|pay|compensation|remuneration|rate|hourly rate|day rate|daily rate)|desired (?:annual |yearly |base |starting )?(?:salary|pay|compensation)|salary (?:requirements?|expected|sought)|what (?:annual |yearly |monthly |hourly |starting )?(?:salary|pay|rate) (?:are|would) you (?:be )?(?:expecting|seeking|looking for|expect))\b/;

/**
 * Questions with a saved application answer, read from wording people see
 * (labels, accessible names, a radio group's legend), never from technical
 * names. `exclude` turns a match into something else: notice someone
 * received, relocation support, a particular place, salary history.
 */
const ANSWER_RULES: Record<
  Exclude<AnswerField, 'graduation'>,
  { include: RegExp[]; exclude: RegExp | null }
> = {
  noticePeriod: {
    include: [
      /\bnotice period\b/,
      /\bperiod of notice\b/,
      /\bhow much notice\b/,
      /\bnotice (?:do you need to|must you|are you required to|you need to|you must|you would need to) give\b/,
    ],
    // Notice someone received or is serving, whether it can change or when
    // it ends, and the notice other people or the company require.
    exclude:
      /\b(?:received|served|serving|given to you|redundan\w*|dismiss\w*|terminat\w*|probation\w*|negotiab\w*|end|ends|ending|expir\w*|company|new hires|reports|team)\b/,
  },
  relocation: {
    // Willingness to move, not plans, support, dates or places.
    include: [
      /\b(?:willing\w*|open|consider\w*|prepared|happy|able) (?:to |for )?relocat\w*/,
      /\b(?:would|could|can|will) you relocate\b/,
      /^(?:relocation|relocate)$/,
    ],
    exclude:
      /\b(?:assistance|package|support|costs?|allowance|expenses|budget|bonus|where|which|reasons?|requir\w*|need\w*|date|city|offer\w*|company|currently|before|from|planning|plans?)\b/,
  },
  workArrangement: {
    include: [
      /\b(?:working|work) (?:arrangement|model|location type|location preference)s?\b/,
      /\bremote,? hybrid,? (?:or|and) (?:office|on ?site|in office)\b/,
      /\bprefer\w*\b.*\b(?:remote|hybrid|on ?site|office based)\b/,
    ],
    // How someone works, or how a team or company works, is not a preference.
    exclude:
      /\b(?:current|currently|team|company|describe|style|setup|set up)\b/,
  },
  startDate: {
    include: [
      /\b(?:earliest|possible|available|availability|proposed|desired|anticipated) (?:start(?:ing)? date|date (?:to|you can|you could) start)\b/,
      // Starting the job, not a call or an assessment.
      /\bwhen (?:can|could|would|will) you (?:start|begin|commence|join)(?: (?:the|this|a|new|role|job|position|post|work|working|with|us|employment|in|it))*$/,
      // A duration rather than a date: recognised, then left to the user.
      /\bhow (?:soon|quickly) (?:can|could|would|will) you (?:start|begin|commence|join)\b/,
      /\bdate (?:you are |you re )?available (?:to start|from)$/,
      /\bavailab\w* to (?:start|begin|commence)(?: (?:the|this|a|new|role|job|position|post|work|employment))*$/,
      /^(?:date )?available from$/,
    ],
    exclude:
      /\b(?:call|interview\w*|assessment|tests?|meeting|chat|course|training|exams?|session)\b/,
  },
  salaryExpectation: {
    include: [SALARY_EXPECTATION],
    exclude: null,
  },
};

/**
 * Anything about what someone earns, earned or would settle for keeps a
 * salary question sensitive, wherever it appears in the question.
 */
const SALARY_HISTORY =
  /\b(?:current|currently|previous|present|last|former|past|existing|minimum|lowest|least|now|today|make|made|earn\w*|package|total|history|accept\w*)\b/;

/**
 * Inside a past job's section, these questions describe that job (its
 * arrangement, start, pay). A notice period there is still the applicant's.
 */
const ANSWERS_IN_JOB_SECTIONS = new Set<AnswerField>(['noticePeriod']);

/** Words a salary-expectation question may use without being sensitive. */
const SALARY_WORDS =
  /\b(?:salary|salaries|pay|compensation|remuneration|wages?)\b/g;

/** Yes/no questions about one arrangement are not a preference. */
const YES_NO = /^(?:are|can|could|would|will|is|do|does|have|has)\b/;

const MAX_QUESTION_WORDS = 20;

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
/** The job applied for, or the start someone could make: not their history. */
const NOT_OWN_JOB =
  /\b(?:appl(?:y|ying|ied)|desired|preferred|target|seeking|sought|vacanc\w*|advert\w*|available|availability|earliest|notice)\b/;

const EXCLUDE: Partial<Record<AutofillField, RegExp>> = {
  phone:
    /\b(?:ext|extension|prefix)\b|\b(?:phone|tel|telephone|mobile) (?:type|code)\b|\b(?:country|area|dial(?:l?ing)?|calling) code\b/,
  country:
    /\b(?:code|dial(?:l?ing)?|calling|prefix)\b|\b(?:preferred|desired|target|willing|relocat\w*)\b/,
  // Where the applicant would like to work is not where they live.
  city: /\b(?:preferred|desired|target|willing|relocat\w*)\b/,
  region: /\b(?:preferred|desired|target|willing|relocat\w*)\b/,
  // Previous or additional names are not the current name.
  fullName: OTHER_NAMES,
  firstName: OTHER_NAMES,
  lastName: OTHER_NAMES,
  preferredName: OTHER_NAMES,
  // "University ID", "University email": about the institution, not it.
  institution:
    /\b(?:id|number|no|email|e mail|phone|telephone|address|city|town|country|postcode|website|url|code|ranking|financial|bank)\b/,
  // Professional or language qualifications are not the saved education.
  qualification:
    /\b(?:number|id|code|reference|certificate number|professional|language|teaching|driving|vocational)\b/,
  // "Employer address", "Company website": about the employer, not its name.
  employer:
    /\b(?:address|street|city|town|country|postcode|post code|zip|phone|telephone|mobile|email|e mail|website|url|web|contact|number|no|id|code|reference|size|industry|sector|type|registration)\b|\b(?:appl(?:y|ying|ied)|desired|preferred|target)\b/,
  jobTitle: NOT_OWN_JOB,
  employmentType: NOT_OWN_JOB,
  employmentStart: NOT_OWN_JOB,
  employmentEnd: NOT_OWN_JOB,
  jobDescription:
    /\b(?:reasons?|leaving|left|gaps?|why|motivation|cover|salary|achievements?)\b|\b(?:appl(?:y|ying|ied)|vacanc\w*|advert\w*)\b/,
};
const INSTRUCTION = /\b(?:include|including|incl|with)\b/;

function excluded(field: AutofillField, text: string): boolean {
  return (EXCLUDE[field]?.test(text) ?? false) && !INSTRUCTION.test(text);
}

/** Never answered automatically; open questions about these are never drafted. */
export const SENSITIVE =
  /\b(?:reasonable adjustments?|access requirements?|right to work|work permit|visa|sponsor\w*|salary|compensation|pay|wage|disabilit\w*|disabled|gender|sex|ethnic\w*|race|religio\w*|belief|sexual\w*|orientation|age|date of birth|dob|birth\w*|veteran|military|criminal|convictions?|pronouns?|marital|pregnan\w*|nationality|citizen\w*|origin|native|passport|national insurance|social security|ssn|diversity|equal opportunit\w*|caste|medical|health|political|politics|trade union\w*|authori[sz]ation|authori[sz]ed to work|eligib\w* to work|entitle\w* to work|permission to work|work eligibility|immigration)\b/;

/**
 * The same, for technical `name` and `id` attributes of a labelled control.
 * Words that are also common in component and framework names ("native"
 * select, "origin", "page", "age") are left out: they decide only when they
 * appear in wording people read, or when the control has no label at all.
 */
const SENSITIVE_IDENTIFIER =
  /\b(?:reasonable adjustments?|access requirements?|right to work|work permit|visa|sponsor\w*|salary|compensation|disabilit\w*|disabled|gender|ethnic\w*|religio\w*|sexual\w*|orientation|date of birth|dob|birth\w*|veteran|military|criminal|convictions?|pronouns?|marital|pregnan\w*|nationality|citizen\w*|passport|national insurance|social security|ssn|diversity|equal opportunit\w*|caste|medical|health|political|politics|trade union\w*|authori[sz]ation|authori[sz]ed to work|eligib\w* to work|entitle\w* to work|permission to work|work eligibility|immigration)\b/;
const CONSENT =
  /\b(?:consent|agree\w*|declar\w*|terms|privacy|acknowledg\w*|certify|newsletter|marketing|subscribe|opt in|signature|signed|sign here)\b/;
const VERIFICATION = /captcha|turnstile|g-recaptcha/i;

/**
 * Questions about the applicant's own circumstances: a profile never holds
 * the answer, and ApplyKit never writes one.
 */
const ANSWER_YOURSELF =
  /\b(?:reasons? for (?:leaving|wanting to leave|change|changing)|why (?:did |are |do )?you (?:leave|left|leaving|want to leave|wish to leave)|leaving reason|gaps? in (?:your )?(?:employment|work history|career|cv)|employment gaps?|career breaks?|disciplinary)\b/;

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

/**
 * For employment fields: employers, companies and previous jobs are the
 * applicant's own history, but people at them, and anyone else, are not.
 * "Employer contact", "Company representative", "Hiring manager".
 */
const OTHER_PERSON_EMPLOYMENT =
  /\b(?:references?|referees?|referr\w*|referrals?|colleagues?|friends?|relatives?|interviewers?|hiring|recruit\w*|managers?|supervisors?|representatives?|contacts?|emergency|next of kin|guardian|parent|spouse|partner|landlord|agency|agencies|clients?|customers?|person to (?:speak|contact)|speak to)\b/;
/**
 * For saved-answer questions: "How much notice must you give your
 * employer?" is about the applicant; anyone else's plans are not.
 */
const OTHER_PERSON_ANSWER =
  /\b(?:references?|referees?|referr\w*|referrals?|colleagues?|friends?|relatives?|interviewers?|hiring|recruit\w*|emergency|next of kin|guardian|parents?|spouse|partner|landlord|agency|agencies|clients?|family|dependants?|dependents?|children|manager s|direct reports)\b/;
const OTHER_PERSON_HEADING_EMPLOYMENT =
  /\b(?:references?|referees?|referr\w*|referrals?|hiring|recruit\w*|managers?|supervisors?|representatives?|contacts?|emergency|next of kin|guardian|spouse|partner|landlord|agency|agencies|clients?|customers?|person to (?:speak|contact)|speak to)\b/;

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
  // The field's own section and heading, not a page-wide "Apply" region.
  const applying = APPLYING.test(
    `${groupName(control.closest(SECTIONS))} ${heading}`,
  );
  const inWorkHistory = WORK_HISTORY.test(surroundings) && !applying;
  const checkbox =
    control instanceof HTMLInputElement && control.type === 'checkbox';

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
  // The question people read: labels, and a radio group's legend.
  const questions = questionTexts(control, texts);
  // A supported equal-opportunities question, asked of the applicant in a
  // section that is not a declaration or about someone else, is matched so
  // that a user who turned on reuse can have it filled (ADR 0018). Every
  // other sensitive question stays the user's alone.
  const monitoring = monitoringQuestion(
    questions,
    `${context} ${heading}`,
    () => genderContext(control, heading),
  );
  if (monitoring) {
    return {
      kind: 'match',
      field: DIVERSITY_FIELD[monitoring.category],
      evidence: [{ signal: monitoring.signal, text: monitoring.raw }],
    };
  }
  // Asking what someone expects to earn is not sensitive in itself; any
  // other sensitive wording, or asking what they earn, still is.
  const salaryQuestion =
    questions.some((q) => SALARY_EXPECTATION.test(q.normalised)) &&
    !SALARY_HISTORY.test(wording) &&
    !SALARY_HISTORY.test(technical);
  const screened = (text: string) =>
    salaryQuestion ? text.replace(SALARY_WORDS, ' ') : text;
  if (
    SENSITIVE.test(screened(wording)) ||
    (hasLabel ? SENSITIVE_IDENTIFIER : SENSITIVE).test(screened(technical))
  ) {
    return { kind: 'manual', reason: 'sensitive' };
  }
  // A "Declaration" heading makes the fields under it (often "Full name"
  // as a typed signature) part of the declaration.
  if (CONSENT.test(all) || CONSENT.test(heading)) {
    return { kind: 'manual', reason: 'consent' };
  }
  if (texts.some((t) => ANSWER_YOURSELF.test(t.normalised))) {
    return { kind: 'manual', reason: 'answer' };
  }

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

  // Generic employment labels count only where the section is clearly
  // about jobs, and not also about education.
  const jobContext = inWorkHistory && !EDUCATION_CONTEXT.test(surroundings);
  for (const { signal, raw, normalised, core } of texts) {
    for (const field of matchText(normalised))
      add(field, { signal, text: raw });
    for (const field of matchEmployment(core, jobContext, checkbox)) {
      add(field, { signal, text: raw });
    }
    if (inEmployment && !inEducation) continue;
    for (const field of matchEducation(normalised, inEducation)) {
      add(field, { signal, text: raw });
    }
  }
  for (const { signal, raw, normalised, core } of questions) {
    for (const field of matchAnswer(normalised, core)) {
      if (inWorkHistory && !ANSWERS_IN_JOB_SECTIONS.has(field)) continue;
      add(field, { signal, text: raw });
    }
  }
  for (const field of [...candidates.keys()]) {
    // Only "I currently work here" is a checkbox; nothing else is.
    if (checkbox !== (field === 'currentlyEmployed')) candidates.delete(field);
    // Nothing in a section about the job applied for is history.
    if (applying && isEmploymentField(field)) candidates.delete(field);
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
        // Graduation questions often sit with the education they ask about.
        field !== 'graduation' &&
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
  // In a work-history section, a name, phone or address is the employer's.
  const employerDetails: Evidence[] = [];
  if (inWorkHistory) {
    for (const [field, found] of [...candidates]) {
      if (
        EMPLOYER_DETAILS.has(field) &&
        !found.some((e) => e.signal === 'autocomplete')
      ) {
        employerDetails.push(...found);
        candidates.delete(field);
      }
    }
  }

  const evidence = [...[...candidates.values()].flat(), ...employerDetails];
  const keys = [...candidates.keys()];
  const onlyEducation = keys.length > 0 && keys.every(isEducationField);
  const onlyEmployment = keys.length > 0 && keys.every(isEmploymentField);
  const onlyAnswers = keys.length > 0 && keys.every(isAnswerField);
  const otherPerson = onlyEducation
    ? OTHER_PERSON_EDUCATION
    : onlyEmployment
      ? OTHER_PERSON_EMPLOYMENT
      : onlyAnswers
        ? OTHER_PERSON_ANSWER
        : OTHER_PERSON;
  const otherPersonHeading =
    onlyEmployment || onlyAnswers
      ? OTHER_PERSON_HEADING_EMPLOYMENT
      : OTHER_PERSON_HEADING;
  if (
    notPersonal ||
    otherPerson.test(all) ||
    otherPersonHeading.test(heading) ||
    (candidates.size === 0 && employerDetails.length > 0)
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
  // A question about graduating says more than a field named for an end
  // date ("graduationYear"): it is asked as a question, and never filled
  // without the user's confirmation.
  if (candidates.has('graduation')) candidates.delete('educationEnd');

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
/** "Did you attend…", "Which city…": a question, not a field name. */
const QUESTION =
  /^(?:did|do|does|are|is|have|has|were|was|will|would|which|what|where|when|how|can|could)\b/;

function matchText(text: string): AutofillField[] {
  const words = text.split(' ').length;
  const question = QUESTION.test(text);
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
    if (SHORT_ONLY.has(field) && (words > MAX_SHORT_WORDS || question))
      continue;
    if (!patterns.some((pattern) => pattern.test(text))) continue;
    if (excluded(field, text)) continue;
    matches.push(field);
  }
  return matches;
}

/** The education fields a piece of normalised text refers to. */
function matchEducation(text: string, inEducation: boolean): EducationField[] {
  if (text.split(' ').length > MAX_WORDS || QUESTION.test(text)) return [];
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

/** Sections about someone else, where "Gender" is not the applicant's. */
const SOMEONE_ELSE =
  /\b(?:references?|referees?|emergency|next of kin|guardian|parents?|spouse|partner|children|child|dependants?|dependents?|family|relatives?|contact person)\b/;

const MONITORING_HINT =
  /\(\s*(?:optional|required|(?:please )?(?:select|choose|tick) (?:one|all that apply)|as defined (?:by|in|under) the equality act(?: 2010)?)\s*\)/gi;

/**
 * Wording that makes a gender question about sex or official records
 * ("Sex and gender", "as shown on your passport"): the user answers it.
 * Narrow phrases only, as general monitoring notices ("kept separately
 * from your records", "we are legally required to ask") are common.
 */
const SEX_QUALIFIER =
  /\b(?:sex|sexes|legal (?:sex|gender|status)|legally (?:recorded|registered)|birth|born|assigned|registered|biological|passport|certificate|official (?:documents?|records?|identification)|as (?:shown|stated|recorded|it appears) (?:on|in))\b/;

/**
 * The one supported monitoring question the control's question asks, if
 * its whole wording is one, from a label or legend (never a placeholder or
 * a technical name), outside declarations and other people's sections.
 * A gender question is not one if `genderContext` qualifies it.
 */
function monitoringQuestion(
  questions: { signal: Signal; raw: string; core: string }[],
  surroundings: string,
  genderContext: () => string,
): { category: DiversityCategory; signal: Signal; raw: string } | null {
  if (CONSENT.test(surroundings) || SOMEONE_ELSE.test(surroundings)) {
    return null;
  }
  const found = questions
    .filter((q) => q.signal === 'label')
    .flatMap((q) => {
      // Other brackets can change the question ("Gender (legal sex)").
      const category = diversityQuestion(
        normalise(q.raw.replace(MONITORING_HINT, ' ')),
      );
      return category ? [{ category, signal: q.signal, raw: q.raw }] : [];
    });
  const [first] = found;
  if (!first || !found.every((f) => f.category === first.category)) {
    return null;
  }
  return first.category === 'gender' && SEX_QUALIFIER.test(genderContext())
    ? null
    : first;
}

const CONTROLS = 'input:not([type="hidden"]), select, textarea';

/**
 * Everything near a gender question that could say it asks about sex:
 * its own group and heading, its description (`aria-describedby`,
 * `aria-description`, `title`), the text around it that belongs to no
 * other field, and every option, including a list's placeholder ("Please
 * select your legal sex").
 */
function genderContext(control: DetectableControl, heading: string): string {
  const options =
    control instanceof HTMLSelectElement
      ? [...control.options].map((o) => o.text)
      : [];
  return normalise(
    [
      groupName(control.closest(SECTIONS)),
      heading,
      fieldHints(control),
      ...options,
    ].join(' | '),
  );
}

/**
 * Text that describes this one field: its description (`aria-describedby`,
 * `aria-description`, `title`) and the text around it that belongs to no
 * other field (the largest wrapper holding only this control), such as
 * "Maximum 200 words" under a box. Raw, not normalised.
 */
export function fieldHints(control: Element): string {
  const root = control.getRootNode();
  const byId = (id: string) =>
    root instanceof Document || root instanceof ShadowRoot
      ? root.getElementById(id)
      : control.ownerDocument.getElementById(id);
  const described = (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => byId(id)?.textContent ?? '');
  let wrapper: Element = control;
  for (
    let node = control.parentElement;
    node && !node.matches(`form, ${SECTIONS}`);
    node = node.parentElement
  ) {
    if (node.querySelectorAll(CONTROLS).length > 1) break;
    wrapper = node;
  }
  return [
    ...described,
    control.getAttribute('aria-description') ?? '',
    control.getAttribute('title') ?? '',
    wrapper === control ? '' : wrapper.textContent,
  ].join(' | ');
}

/**
 * The wording of the question a control answers: its label and
 * placeholder, and for a radio button the legend of its group (the
 * button's own label is an option, such as "Yes").
 */
function questionTexts(
  control: DetectableControl,
  texts: TextSignal[],
): { signal: Signal; raw: string; normalised: string; core: string }[] {
  const questions = texts.filter(
    (t) => t.signal === 'label' || t.signal === 'placeholder',
  );
  if (!(control instanceof HTMLInputElement && control.type === 'radio')) {
    return questions;
  }
  const raw = radioQuestionText(control);
  return raw
    ? [
        {
          signal: 'label',
          raw,
          normalised: normalise(raw),
          core: normalise(raw.replace(/\([^)]*\)/g, ' ')),
        },
      ]
    : [];
}

/**
 * The saved-answer questions a piece of question text asks. `core` is the
 * text without parenthesised hints; a graduation question must be exactly
 * one of the supported questions (ADR 0017).
 */
function matchAnswer(text: string, core: string): AnswerField[] {
  if (text.split(' ').length > MAX_QUESTION_WORDS) return [];
  const matches: AnswerField[] =
    readGraduationQuestion(core) === null ? [] : ['graduation'];
  for (const [field, rules] of Object.entries(ANSWER_RULES) as [
    Exclude<AnswerField, 'graduation'>,
    { include: RegExp[]; exclude: RegExp | null },
  ][]) {
    if (!rules.include.some((pattern) => pattern.test(text))) continue;
    if (rules.exclude?.test(text)) continue;
    // A yes/no question about one arrangement or about notice ("Is your
    // notice period negotiable?") does not ask for the saved answer.
    if (
      (field === 'workArrangement' || field === 'noticePeriod') &&
      YES_NO.test(text) &&
      !/\bprefer\w*\b/.test(text)
    ) {
      continue;
    }
    matches.push(field);
  }
  return matches;
}

/**
 * The employment fields a piece of text refers to. `text` has any
 * parenthesised hint removed ("End date (leave blank if current)"); the
 * full text still decides whether the field is about someone else.
 */
function matchEmployment(
  text: string,
  inWorkHistory: boolean,
  checkbox: boolean,
): EmploymentField[] {
  if (text.split(' ').length > MAX_WORDS || QUESTION.test(text)) return [];
  const pick = (rules: { strong: RegExp[]; contextual: RegExp[] }) =>
    inWorkHistory ? [...rules.strong, ...rules.contextual] : rules.strong;
  if (checkbox) {
    return pick(CURRENT_ROLE).some((pattern) => pattern.test(text))
      ? ['currentlyEmployed']
      : [];
  }
  const matches: EmploymentField[] = [];
  for (const [field, rules] of Object.entries(EMPLOYMENT_RULES) as [
    Exclude<EmploymentField, 'currentlyEmployed'>,
    { strong: RegExp[]; contextual: RegExp[] },
  ][]) {
    if (!pick(rules).some((pattern) => pattern.test(text))) continue;
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
  /** `normalised` without parenthesised hints. */
  core: string;
}

/** Lower case words, without format hints such as "MM/YYYY". */
function clean(text: string): string {
  return (
    normalise(text)
      // Format hints ("Start date (MM/YYYY)") say how to answer, not what
      // is asked; dates.ts reads them when formatting the value.
      .replace(FORMAT_HINT, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

function textSignals(control: DetectableControl): TextSignal[] {
  const raw: [Signal, string][] = [
    ['label', labelText(control)],
    ['name', nameOf(control)],
    ['id', control.id],
    ['placeholder', placeholderOf(control)],
  ];
  return raw
    .map(([signal, text]) => {
      // Example addresses in placeholders ("name@company.com") are not
      // statements about the field.
      const read =
        signal === 'placeholder'
          ? text.replace(/\S+@\S+|\S*(?:https?:\/\/|www\.)\S*/gi, ' ')
          : text;
      return {
        signal,
        raw: text.replace(/\s+/g, ' ').trim(),
        normalised: clean(read),
        core: clean(read.replace(/\([^)]*\)/g, ' ')),
      };
    })
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

/**
 * The question a radio button answers: its group's legend, or the
 * accessible name of an ARIA radio group or group around it. The button's
 * own label is an option, such as "Yes".
 */
export function radioQuestionText(radio: HTMLInputElement): string {
  const container = radio.closest(RADIO_CONTAINERS);
  if (!container) return '';
  const legend =
    container instanceof HTMLFieldSetElement
      ? (container.querySelector(':scope > legend')?.textContent ?? '')
      : '';
  return (legend.trim() || accessibleName(container))
    .replace(/\s+/g, ' ')
    .trim();
}

/** What holds one radio question: a fieldset or an ARIA group. */
export const RADIO_CONTAINERS = 'fieldset, [role="radiogroup"], [role="group"]';

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

export const SECTIONS = 'fieldset, section, [role="group"], [role="region"]';

/**
 * Headings per scope, kept only while a scan runs (`duringScan`), so a
 * long form is not searched again for every control.
 */
let headingCache: WeakMap<Element, Element[]> | null = null;

function headingsIn(scope: Element): Element[] {
  const cached = headingCache?.get(scope);
  if (cached) return cached;
  const headings = [...scope.querySelectorAll(HEADINGS)];
  headingCache?.set(scope, headings);
  return headings;
}

/** Runs one scan with heading lookups cached; the cache ends with it. */
export function duringScan<T>(scan: () => T): T {
  headingCache = new WeakMap();
  try {
    return scan();
  } finally {
    headingCache = null;
  }
}

/**
 * The nearest heading before the control within its section (its fieldset
 * or labelled group, else its form, else the page): many forms mark
 * sections such as "Reference 1" with headings rather than fieldsets.
 */
function headingElementBefore(control: DetectableControl): Element | null {
  const section = control.closest(SECTIONS);
  const scope = section ?? formOf(control) ?? control.ownerDocument.body;
  let nearest: Element | null = null;
  for (const heading of headingsIn(scope)) {
    // A heading inside another section describes that section only.
    if (heading.closest(SECTIONS) !== section) continue;
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

/**
 * A section's own name (`ControlContext.group`): its legend, accessible
 * name or heading, normalised. Never the names of sections around it, so a
 * page-wide "Apply to …" region names no section.
 */
export function groupName(group: Element | null): string {
  if (!group || group instanceof HTMLFormElement) return '';
  if (group instanceof HTMLFieldSetElement) {
    return normalise(group.querySelector(':scope > legend')?.textContent ?? '');
  }
  if (group.matches(HEADINGS)) return normalise(group.textContent);
  const heading = [...group.querySelectorAll(HEADINGS)].find(
    (h) => h.closest(SECTIONS) === group,
  );
  return normalise(`${accessibleName(group)} ${heading?.textContent ?? ''}`);
}

export function labelText(control: DetectableControl): string {
  const parts: string[] = [];
  for (const label of labelsOf(control)) parts.push(ownText(label));
  const labelledBy = control.getAttribute('aria-labelledby');
  if (labelledBy) {
    for (const id of labelledBy.split(/\s+/)) {
      const element = control.ownerDocument.getElementById(id);
      // Some widgets name themselves ("labelId selectId"), which would
      // make their current value part of the label.
      if (element && element !== control && !control.contains(element)) {
        parts.push(ownText(element));
      }
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
