import type { DiversityPreferences } from '@/domain/diversity';

/**
 * Fictional diversity preferences for tests, with reuse turned on. Test
 * use only: never anyone's real answers, and never sample data in the
 * extension.
 */
export function savedDiversity(): DiversityPreferences {
  return {
    reuse: true,
    answers: {
      gender: 'non-binary',
      ethnicity: 'other-mixed',
      disability: 'no',
      religion: 'none',
      sexualOrientation: 'prefer-not-to-say',
    },
  };
}
