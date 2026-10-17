/** Extension storage keys (WXT notation: area, then key). */

export const PROFILE_KEY = 'local:profile';

/** Where an unreadable stored profile is kept before it is overwritten. */
export const BACKUP_KEY = 'local:profileBackup';

/** Unfinished onboarding or unsaved edits; never the confirmed profile. */
export const DRAFT_KEY = 'local:profileDraft';
