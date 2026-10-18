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

/** Optional diversity monitoring answers and whether reuse is on (ADR 0018). */
export const DIVERSITY_KEY = 'local:diversityPreferences';

/** Every unreadable copy of the diversity preferences, oldest first. */
export const DIVERSITY_BACKUP_KEY = 'local:diversityPreferencesBackup';

/**
 * The user's Anthropic API key for AI drafting (ADR 0019), for this browser
 * session only: in memory, cleared when the browser closes. Read only by
 * the background worker.
 */
export const AI_SESSION_KEY = 'session:aiCredential';

/**
 * The same key when the user chose "Remember on this device": on disk and
 * unencrypted. Never both at once.
 */
export const AI_REMEMBERED_KEY = 'local:aiCredential';

/** AI drafting preferences: model choice and daily request limit. */
export const AI_SETTINGS_KEY = 'local:aiSettings';

/** Today's AI request count and reported token usage, for the daily limit. */
export const AI_USAGE_KEY = 'local:aiUsage';
