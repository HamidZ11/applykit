import type { AutofillValues } from '@/autofill/fields';
import type { EducationRecord } from '@/domain/user-profile';
import { autofillValuesFrom } from '@/autofill/profile-values';
import { profileFromDraft, type UserProfile } from '@/domain/user-profile';
import { validDraft } from './profile-fixtures';

/**
 * A fictional profile with every autofill field completed. Test use only:
 * the extension never fills from sample data.
 */
export function fullProfile(
  updatedAt = '2026-10-17T12:00:00.000Z',
): UserProfile {
  const draft = validDraft();
  draft.personal.preferredName = 'Al';
  draft.personal.address.line2 = 'Flat 2';
  draft.personal.address.region = 'Greater London';
  draft.links = {
    linkedin: 'https://www.linkedin.com/in/alex-sample',
    github: 'https://github.com/alex-sample',
    portfolio: 'https://alex-sample.example.com',
    other: [],
  };
  return profileFromDraft(draft, null, new Date(updatedAt));
}

/** Fictional education: a degree and the A levels before it. */
export function educationRecords(): EducationRecord[] {
  return [
    {
      id: 'degree',
      institution: 'University of Example',
      qualification: 'BSc Computer Science',
      fieldOfStudy: 'Computer Science',
      startDate: '2024-09',
      endDate: '2027-06',
      grade: '',
    },
    {
      id: 'a-levels',
      institution: 'Example Sixth Form College',
      qualification: 'A levels',
      fieldOfStudy: 'Mathematics, Physics, Computing',
      startDate: '2022-09',
      endDate: '2024-06',
      grade: 'A*AA',
    },
  ];
}

/** The values autofill receives for `fullProfile()`. */
export function sampleValues(): AutofillValues {
  return autofillValuesFrom(fullProfile());
}
