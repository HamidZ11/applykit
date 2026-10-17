/**
 * The personal details ApplyKit can place into application forms.
 *
 * Deliberately minimal: fields are added only when a working feature needs them.
 */
export interface Profile {
  firstName: string;
  lastName: string;
  email: string;
}

export type ProfileField = keyof Profile;

export const PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'email',
] as const satisfies readonly ProfileField[];

/**
 * Fictional data for the proof of concept. Uses the reserved example.com
 * domain so nothing can be mistaken for, or delivered to, a real person.
 */
export const SAMPLE_PROFILE: Profile = {
  firstName: 'Alex',
  lastName: 'Sample',
  email: 'alex.sample@example.com',
};
