import type { EducationRecord, EmploymentRecord } from '@/domain/user-profile';

/**
 * What CV extraction found, before anything touches the profile.
 *
 * Certainty is a category, not a score: `confident` when the text matched an
 * unambiguous pattern (an email address, a labelled phone number, a dated
 * entry with a recognisable title), `review` when it is plausible but the
 * user should check it. Anything not found is simply absent.
 */
export type Certainty = 'confident' | 'review';

export interface Candidate {
  value: string;
  certainty: Certainty;
  /** The CV text it came from, shown to the user as evidence. */
  source: string;
}

export interface PersonalCandidates {
  firstName: Candidate | null;
  lastName: Candidate | null;
  email: Candidate | null;
  phone: Candidate | null;
  city: Candidate | null;
}

export interface LinkCandidates {
  linkedin: Candidate | null;
  github: Candidate | null;
  portfolio: Candidate | null;
}

export interface RecordCandidate<T> {
  record: T;
  certainty: Certainty;
  /** The CV lines the record was read from. */
  source: string;
  /** What could not be determined, e.g. "Dates are years only". */
  notes: string[];
}

export type EducationCandidate = RecordCandidate<Omit<EducationRecord, 'id'>>;
export type EmploymentCandidate = RecordCandidate<Omit<EmploymentRecord, 'id'>>;

export interface CvExtraction {
  personal: PersonalCandidates;
  links: LinkCandidates;
  education: EducationCandidate[];
  employment: EmploymentCandidate[];
  /** Things the user should know about the extraction as a whole. */
  warnings: string[];
}
