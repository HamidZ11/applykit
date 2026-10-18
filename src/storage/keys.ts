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

/**
 * Every unreadable copy of the saved answers, kept before it was
 * overwritten (a list, oldest first).
 */
export const ANSWERS_BACKUP_KEY = 'local:applicationAnswersBackup';

/** Whether the panel shows developer diagnostics; off unless `true`. */
export const DIAGNOSTICS_KEY = 'local:developerDiagnostics';
