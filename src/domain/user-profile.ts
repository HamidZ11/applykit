/**
 * The applicant's saved profile: what onboarding collects and what ApplyKit
 * will later use to fill applications.
 *
 * Optional text fields are stored as empty strings rather than omitted, so
 * every field has one shape in forms, storage and future autofill. The schema
 * is versioned (`metadata.schemaVersion`) so stored profiles can be migrated
 * when the model grows.
 */

export const PROFILE_SCHEMA_VERSION = 1;

/** A calendar month as `YYYY-MM`, the value of an `<input type="month">`. */
export type YearMonth = string;

export interface Address {
  line1: string;
  /** Optional. */
  line2: string;
  city: string;
  /** Region, county or state. Optional. */
  region: string;
  postcode: string;
  country: string;
}

export interface PersonalDetails {
  firstName: string;
  lastName: string;
  /** Optional. */
  preferredName: string;
  email: string;
  phone: string;
  address: Address;
}

export interface EducationRecord {
  id: string;
  institution: string;
  qualification: string;
  fieldOfStudy: string;
  startDate: YearMonth;
  /** End date, or the expected graduation date. */
  endDate: YearMonth;
  /** Optional, e.g. "First-class honours" or "3.8 GPA". */
  grade: string;
}

export const EMPLOYMENT_TYPES = [
  'full-time',
  'part-time',
  'contract',
  'temporary',
  'internship',
  'apprenticeship',
  'volunteer',
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export interface EmploymentRecord {
  id: string;
  employer: string;
  title: string;
  /** Optional: empty when not given. */
  employmentType: EmploymentType | '';
  startDate: YearMonth;
  /** Empty while `current` is true. */
  endDate: YearMonth;
  current: boolean;
  /** Optional. */
  description: string;
}

export interface OtherLink {
  id: string;
  label: string;
  url: string;
}

/** All links are optional; empty strings mean "not given". */
export interface ProfessionalLinks {
  linkedin: string;
  github: string;
  portfolio: string;
  other: OtherLink[];
}

export interface ProfileMetadata {
  schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  /** ISO 8601 timestamps. */
  createdAt: string;
  updatedAt: string;
}

export interface UserProfile {
  personal: PersonalDetails;
  education: EducationRecord[];
  employment: EmploymentRecord[];
  links: ProfessionalLinks;
  metadata: ProfileMetadata;
}

/** A profile being edited: everything except metadata, which saving sets. */
export type ProfileDraft = Omit<UserProfile, 'metadata'>;

export function emptyDraft(): ProfileDraft {
  return {
    personal: {
      firstName: '',
      lastName: '',
      preferredName: '',
      email: '',
      phone: '',
      address: {
        line1: '',
        line2: '',
        city: '',
        region: '',
        postcode: '',
        country: '',
      },
    },
    education: [],
    employment: [],
    links: { linkedin: '', github: '', portfolio: '', other: [] },
  };
}

export function newEducationRecord(): EducationRecord {
  return {
    id: newId(),
    institution: '',
    qualification: '',
    fieldOfStudy: '',
    startDate: '',
    endDate: '',
    grade: '',
  };
}

export function newEmploymentRecord(): EmploymentRecord {
  return {
    id: newId(),
    employer: '',
    title: '',
    employmentType: '',
    startDate: '',
    endDate: '',
    current: false,
    description: '',
  };
}

export function newOtherLink(): OtherLink {
  return { id: newId(), label: '', url: '' };
}

export function draftFromProfile(profile: UserProfile): ProfileDraft {
  return {
    personal: profile.personal,
    education: profile.education,
    employment: profile.employment,
    links: profile.links,
  };
}

function newId(): string {
  return crypto.randomUUID();
}

/**
 * Builds the profile to save from a validated draft, keeping the original
 * creation time when an existing profile is being updated.
 */
export function profileFromDraft(
  draft: ProfileDraft,
  previous: ProfileMetadata | null,
  now: Date,
): UserProfile {
  const timestamp = now.toISOString();
  return {
    ...draft,
    metadata: {
      schemaVersion: PROFILE_SCHEMA_VERSION,
      createdAt: previous?.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
  };
}
