import { normalise } from './detect';
import type { AutofillField } from './fields';
import { fieldTarget, type ScannedField } from './scan';

/**
 * Groups for the expanded field list, so long forms read by topic rather
 * than as one "Other fields" list. Categories organise what the user sees;
 * they never decide what is filled.
 */
export type FieldCategory =
  | 'personal'
  | 'contact'
  | 'address'
  | 'education'
  | 'employment'
  | 'references'
  | 'questions'
  | 'sensitive'
  | 'other';

/** The order groups appear in, roughly the order forms ask. */
export const CATEGORY_ORDER: readonly FieldCategory[] = [
  'personal',
  'contact',
  'address',
  'education',
  'employment',
  'references',
  'questions',
  'sensitive',
  'other',
];

export const CATEGORY_LABEL: Record<FieldCategory, string> = {
  personal: 'Personal information',
  contact: 'Contact details',
  address: 'Address',
  education: 'Education',
  employment: 'Employment',
  references: 'References and other contacts',
  questions: 'Application questions',
  sensitive: 'Sensitive disclosures',
  other: 'Other fields',
};

const BY_TARGET: Record<AutofillField, FieldCategory> = {
  fullName: 'personal',
  firstName: 'personal',
  lastName: 'personal',
  preferredName: 'personal',
  email: 'contact',
  phone: 'contact',
  phoneCountryCode: 'contact',
  phoneNational: 'contact',
  linkedin: 'contact',
  github: 'contact',
  portfolio: 'contact',
  addressLine1: 'address',
  addressLine2: 'address',
  city: 'address',
  region: 'address',
  postcode: 'address',
  country: 'address',
  institution: 'education',
  qualification: 'education',
  fieldOfStudy: 'education',
  educationStart: 'education',
  educationEnd: 'education',
  grade: 'education',
  employer: 'employment',
  jobTitle: 'employment',
  employmentType: 'employment',
  employmentStart: 'employment',
  employmentEnd: 'employment',
  currentlyEmployed: 'employment',
  jobDescription: 'employment',
};

/** Equality, diversity and social-mobility questions. */
const DISCLOSURE =
  /\b(?:gender|sex|ethnic\w*|race|religio\w*|belief|sexual\w*|orientation|disabilit\w*|disabled|age|date of birth|dob|veteran|military|criminal|convictions?|pronouns?|marital|pregnan\w*|caste|diversity|equal opportunit\w*|nationality|citizen\w*|origin|native|social mobility|socio ?economic|free school meals|first generation|carers?|caring responsibilit\w*|type of school|school type)\b/;

const OTHER_PEOPLE =
  /\b(?:references?|referees?|emergency|next of kin|guardian|spouse|partner)\b/;

/** Topic words, tried in this order on the label, then on the section. */
const TOPICS: [FieldCategory, RegExp][] = [
  [
    'employment',
    /\b(?:employ\w*|jobs?|work|experience|company|internships?|manager|supervisor|career)\b/,
  ],
  [
    'education',
    /\b(?:education|universit\w*|school|college|degrees?|qualifications?|gpa|grades?|graduat\w*|course|subjects?|major|a ?levels?|gcses?|academic|studies|study)\b/,
  ],
  [
    'address',
    /\b(?:address|street|city|town|county|state|postcode|post code|zip|country|location)\b/,
  ],
  [
    'contact',
    /\b(?:e ?mail|phone|telephone|mobile|contact|linkedin|github|website|portfolio|url)\b/,
  ],
  ['personal', /\b(?:name|surname|title)\b/],
  [
    'questions',
    /\b(?:questions?|questionnaire|additional information|motivation|cover letter|supporting statement)\b/,
  ],
];

const QUESTION =
  /^(?:how|why|what|which|when|where|who|do|does|did|are|is|have|has|will|would|can|could|please|tell|describe|explain)\b/;

/** Which group a field belongs in, from what ApplyKit found and its text. */
export function categoryOf(field: ScannedField): FieldCategory {
  const { support } = field;
  const target =
    support.status === 'duplicate' ? support.field : fieldTarget(field);
  if (target) return BY_TARGET[target];

  const label = normalise(field.label);
  const surroundings = `${label} ${field.context}`;
  if (DISCLOSURE.test(surroundings)) return 'sensitive';
  if (support.status === 'manual') {
    // Reasons for leaving, gaps in employment, disciplinary records.
    if (support.reason === 'answer') return 'employment';
    return support.reason === 'verification' ? 'other' : 'questions';
  }
  if (support.status === 'other-person') {
    if (OTHER_PEOPLE.test(surroundings)) return 'references';
    return TOPICS[0]?.[1].test(surroundings) ? 'employment' : 'references';
  }
  // "Referee job title" in a reference section is about the referee.
  if (OTHER_PEOPLE.test(field.context)) return 'references';

  for (const text of [label, field.context]) {
    for (const [category, words] of TOPICS) {
      if (words.test(text)) return category;
    }
  }
  if (
    QUESTION.test(label) ||
    field.label.trim().endsWith('?') ||
    field.kind === 'textarea' ||
    field.kind === 'radio' ||
    field.kind === 'checkbox'
  ) {
    return 'questions';
  }
  return 'other';
}
