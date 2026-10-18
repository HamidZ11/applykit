import type { ApplicationAnswers } from '@/domain/application-answers';
import type { EducationLevel } from './education';

/**
 * The profile values the autofill engine can place into application forms.
 * Plain data with no browser or React dependencies.
 */

/** Fields filled with a saved text value as it is. */
export const TEXT_FIELDS = [
  'fullName',
  'firstName',
  'lastName',
  'preferredName',
  'email',
  'phone',
  'addressLine1',
  'addressLine2',
  'city',
  'region',
  'postcode',
  'linkedin',
  'github',
  'portfolio',
] as const;

export type TextField = (typeof TEXT_FIELDS)[number];

/** Fields filled from one of the saved education records. */
export const EDUCATION_FIELDS = [
  'institution',
  'qualification',
  'fieldOfStudy',
  'educationStart',
  'educationEnd',
  'grade',
] as const;

export type EducationField = (typeof EDUCATION_FIELDS)[number];

/** Fields filled from one of the saved employment records. */
export const EMPLOYMENT_FIELDS = [
  'employer',
  'jobTitle',
  'employmentType',
  'employmentStart',
  'employmentEnd',
  'currentlyEmployed',
  'jobDescription',
] as const;

export type EmploymentField = (typeof EMPLOYMENT_FIELDS)[number];

/**
 * Questions answered from the saved application answers: only ever
 * suggested, and written only when the user confirms each one.
 */
export const ANSWER_FIELDS = [
  'noticePeriod',
  'relocation',
  'workArrangement',
  'startDate',
  'salaryExpectation',
] as const;

export type AnswerField = (typeof ANSWER_FIELDS)[number];

export const AUTOFILL_FIELDS = [
  ...TEXT_FIELDS,
  'country',
  'phoneCountryCode',
  'phoneNational',
  ...EDUCATION_FIELDS,
  ...EMPLOYMENT_FIELDS,
  ...ANSWER_FIELDS,
] as const;

export type AutofillField = (typeof AUTOFILL_FIELDS)[number];

export const AUTOFILL_FIELD_LABEL: Record<AutofillField, string> = {
  fullName: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  preferredName: 'Preferred name',
  email: 'Email address',
  phone: 'Phone number',
  addressLine1: 'Address line 1',
  addressLine2: 'Address line 2',
  city: 'Town or city',
  region: 'Region or county',
  postcode: 'Postcode',
  country: 'Country',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio or website',
  phoneCountryCode: 'Phone country code',
  phoneNational: 'Phone number without country code',
  institution: 'Institution',
  qualification: 'Qualification',
  fieldOfStudy: 'Field of study',
  educationStart: 'Education start date',
  educationEnd: 'Graduation or end date',
  grade: 'Grade',
  employer: 'Employer',
  jobTitle: 'Job title',
  employmentType: 'Employment type',
  employmentStart: 'Employment start date',
  employmentEnd: 'Employment end date',
  currentlyEmployed: 'Current role',
  jobDescription: 'Role description',
  noticePeriod: 'Notice period',
  relocation: 'Willingness to relocate',
  workArrangement: 'Working arrangement',
  startDate: 'Earliest start date',
  salaryExpectation: 'Salary expectation',
};

export function isEducationField(
  field: AutofillField,
): field is EducationField {
  return (EDUCATION_FIELDS as readonly string[]).includes(field);
}

export function isEmploymentField(
  field: AutofillField,
): field is EmploymentField {
  return (EMPLOYMENT_FIELDS as readonly string[]).includes(field);
}

export function isAnswerField(field: AutofillField): field is AnswerField {
  return (ANSWER_FIELDS as readonly string[]).includes(field);
}

/** Fields answered from one saved record, chosen per section of a form. */
export function isRecordField(
  field: AutofillField,
): field is EducationField | EmploymentField {
  return isEducationField(field) || isEmploymentField(field);
}

/** One saved education record, as autofill uses it. */
export interface EducationValue {
  /** The saved record's id, so the user can choose it for a section. */
  id: string;
  institution: string;
  qualification: string;
  fieldOfStudy: string;
  /** "YYYY-MM". */
  startDate: string;
  /** "YYYY-MM": when it ended or is expected to. */
  endDate: string;
  /** Optional: empty when not saved. */
  grade: string;
  /** University-level or school, from the qualification; null if unclear. */
  level: EducationLevel | null;
}

/** One saved job, as autofill uses it. */
export interface EmploymentValue {
  /** The saved record's id, so the user can choose it for a section. */
  id: string;
  employer: string;
  title: string;
  /** One of the profile's employment types, or empty when not saved. */
  employmentType: string;
  /** "YYYY-MM". */
  startDate: string;
  /** "YYYY-MM", or empty while `current` is true. */
  endDate: string;
  /** The user marked this as their current role. */
  current: boolean;
  /** Optional: empty when not saved. */
  description: string;
}

/** The saved country, with every representation a form might expect. */
export interface CountryValue {
  /** ISO 3166-1 alpha-2, e.g. "GB". */
  code: string;
  /** ISO 3166-1 alpha-3, e.g. "GBR". */
  alpha3: string;
  /** The display name, e.g. "United Kingdom". */
  name: string;
  /** Other recognised names, e.g. "UK", "Great Britain". */
  aliases: string[];
}

/**
 * The saved phone number split into its parts, for forms that ask for the
 * international calling code separately.
 */
export interface PhoneParts {
  /** Digits only, e.g. "44". */
  callingCode: string;
  /** The national significant number: no calling code, no trunk "0". */
  nationalNumber: string;
  /**
   * Names and codes of the number's country or territory, used only to tell
   * apart options that share a calling code (+44: United Kingdom, Jersey).
   * Empty when the number does not say which one.
   */
  regionNames: string[];
}

/**
 * The values autofill may use, taken only from the confirmed profile.
 * Empty strings mean "not in the profile"; nothing is ever invented.
 */
export interface AutofillValues {
  text: Record<TextField, string>;
  /**
   * `text.preferredName` is the first name because the user chose that for
   * preferred-name fields, rather than a saved preferred name.
   */
  preferredNameIsFirstName: boolean;
  country: CountryValue | null;
  /**
   * `text.phone` split into its parts, or null when there is no saved
   * number or it cannot be read unambiguously.
   */
  phone: PhoneParts | null;
  /** Saved education records, in the order the user saved them. */
  education: EducationValue[];
  /** Saved jobs, in the order the user saved them. */
  employment: EmploymentValue[];
  /**
   * Saved answers to common questions, only ever suggested, never filled
   * without the user's confirmation. Null when they could not be read.
   */
  answers: ApplicationAnswers | null;
}
