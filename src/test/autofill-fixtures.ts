import type { AutofillValues } from '@/autofill/fields';
import type { EducationRecord, EmploymentRecord } from '@/domain/user-profile';
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

/** A second school record, so school sections have two candidates. */
export function gcseRecord(): EducationRecord {
  return {
    id: 'gcses',
    institution: 'Example Grammar School',
    qualification: 'GCSEs',
    fieldOfStudy: 'Ten subjects',
    startDate: '2017-09',
    endDate: '2022-06',
    grade: '',
  };
}

/**
 * Fictional jobs: a current part-time role and the full-time job before
 * it. Every employer is invented.
 */
export function employmentRecords(): EmploymentRecord[] {
  return [
    {
      id: 'testing',
      employer: 'Example Testing Services',
      title: 'Test Centre Associate',
      employmentType: 'part-time',
      startDate: '2025-02',
      endDate: '',
      current: true,
      description:
        'Welcomed candidates, checked identification and invigilated computer-based exams.',
    },
    {
      id: 'logistics',
      employer: 'Example Logistics',
      title: 'Warehouse Operative',
      employmentType: 'full-time',
      startDate: '2024-01',
      endDate: '2025-01',
      current: false,
      description:
        'Picked and packed orders, ran stock counts and kept the loading bay safe.',
    },
  ];
}

/** The values autofill receives for `fullProfile()`. */
export function sampleValues(): AutofillValues {
  return autofillValuesFrom(fullProfile());
}
