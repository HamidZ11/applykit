import { storage } from 'wxt/utils/storage';
import { parseStoredDraft, type StoredDraft } from '@/domain/profile-draft';
import { parseStoredProfile } from '@/domain/profile-schema';
import type { UserProfile } from '@/domain/user-profile';
import { BACKUP_KEY, DRAFT_BACKUP_KEY, DRAFT_KEY, PROFILE_KEY } from './keys';
import { withLock } from './lock';

/**
 * Local persistence for the user's profile and onboarding draft, in
 * `browser.storage.local`.
 *
 * The only module that touches extension storage for profiles. Data read
 * back is validated before use; failures are returned as values with a
 * user-facing message, never thrown, and never logged with personal data.
 * The draft lives under its own key and can never replace the profile.
 */

export type LoadResult =
  | {
      status: 'loaded';
      profile: UserProfile;
      /** Old free-text country that could not be matched; ask the user. */
      unmatchedCountry: string | null;
    }
  | { status: 'empty' }
  /** Something is stored but is not a valid profile. */
  | { status: 'invalid' }
  | { status: 'error'; message: string };

export type SaveResult =
  | { status: 'saved'; profile: UserProfile }
  /**
   * Another tab saved a different version since this one was loaded.
   * Nothing was written; `current` is what is saved now.
   */
  | { status: 'conflict'; current: UserProfile }
  | { status: 'error'; message: string };

export type DraftLoadResult =
  | { status: 'loaded'; draft: StoredDraft }
  /** No draft, or one that was unreadable and has been discarded. */
  | { status: 'none' }
  | { status: 'error' };

export interface ProfileStore {
  load(): Promise<LoadResult>;
  /**
   * Saves a validated profile and clears any draft, unless the saved
   * profile is no longer the one the edit started from: `basedOn` is its
   * `metadata.updatedAt`, or null when there was none.
   */
  save(profile: UserProfile, basedOn: string | null): Promise<SaveResult>;
  loadDraft(): Promise<DraftLoadResult>;
  /** Returns false if the draft could not be written. */
  saveDraft(draft: StoredDraft): Promise<boolean>;
  clearDraft(): Promise<boolean>;
}

export const browserProfileStore: ProfileStore = {
  async load() {
    let value: unknown;
    try {
      value = await storage.getItem<unknown>(PROFILE_KEY);
    } catch {
      return {
        status: 'error',
        message:
          'ApplyKit could not read your saved profile from this browser.',
      };
    }
    if (value === null) return { status: 'empty' };
    const stored = parseStoredProfile(value);
    return stored ? { status: 'loaded', ...stored } : { status: 'invalid' };
  },

  async save(profile, basedOn) {
    try {
      const conflict = await withLock('applykit:profile', async () => {
        const existing = await storage.getItem<unknown>(PROFILE_KEY);
        const stored = existing === null ? null : parseStoredProfile(existing);
        if (stored && stored.profile.metadata.updatedAt !== basedOn) {
          return stored.profile;
        }
        if (existing !== null && stored === null) {
          // Never silently discard data we could not read.
          await storage.setItem(BACKUP_KEY, existing);
        }
        await storage.setItem(PROFILE_KEY, profile);
        return null;
      });
      if (conflict) return { status: 'conflict', current: conflict };
    } catch {
      return {
        status: 'error',
        message:
          'ApplyKit could not save your profile. Your changes are still on this page; try again.',
      };
    }
    // The profile is saved. A leftover draft is harmless if removal fails:
    // drafts based on an older profile are discarded when loaded.
    await storage.removeItem(DRAFT_KEY).catch(() => undefined);
    return { status: 'saved', profile };
  },

  async loadDraft() {
    let value: unknown;
    try {
      value = await storage.getItem<unknown>(DRAFT_KEY);
    } catch {
      return { status: 'error' };
    }
    if (value === null) return { status: 'none' };
    const draft = parseStoredDraft(value);
    if (draft) return { status: 'loaded', draft };
    // Unreadable, perhaps written by another version: keep a copy rather than
    // silently losing the user's unfinished work, then start afresh.
    await storage
      .setItem(DRAFT_BACKUP_KEY, value)
      .then(() => storage.removeItem(DRAFT_KEY))
      .catch(() => undefined);
    return { status: 'none' };
  },

  async saveDraft(draft) {
    try {
      await storage.setItem(DRAFT_KEY, draft);
      return true;
    } catch {
      return false;
    }
  },

  async clearDraft() {
    try {
      await storage.removeItem(DRAFT_KEY);
      return true;
    } catch {
      return false;
    }
  },
};
