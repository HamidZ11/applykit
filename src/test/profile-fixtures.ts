import {
  emptyDraft,
  profileFromDraft,
  type ProfileDraft,
  type UserProfile,
} from '@/domain/user-profile';

/** Fictional profile data for tests. Never use real personal details. */

/** A complete, valid draft with fictional data. */
export function validDraft(): ProfileDraft {
  const draft = emptyDraft();
  draft.personal = {
    firstName: 'Alex',
    lastName: 'Sample',
    preferredName: '',
    email: 'alex.sample@example.com',
    phone: '+44 20 7946 0000',
    address: {
      line1: '1 Example Street',
      line2: '',
      city: 'London',
      region: '',
      postcode: 'N1 9GU',
      country: 'United Kingdom',
    },
  };
  return draft;
}

export function validProfile(
  updatedAt = '2026-10-17T12:00:00.000Z',
): UserProfile {
  return profileFromDraft(validDraft(), null, new Date(updatedAt));
}
