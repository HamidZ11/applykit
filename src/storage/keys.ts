/** Extension storage keys (WXT notation: area, then key). */

export const PROFILE_KEY = 'local:profile';

/** Where an unreadable stored profile is kept before it is overwritten. */
export const BACKUP_KEY = 'local:profileBackup';

/** Unfinished onboarding or unsaved edits; never the confirmed profile. */
export const DRAFT_KEY = 'local:profileDraft';

/** Where an unreadable draft is kept before it is removed. */
export const DRAFT_BACKUP_KEY = 'local:profileDraftBackup';

/** Saved answers to common application questions (ADR 0016). */
export const ANSWERS_KEY = 'local:applicationAnswers';

/** Where unreadable saved answers are kept before they are overwritten. */
export const ANSWERS_BACKUP_KEY = 'local:applicationAnswersBackup';
