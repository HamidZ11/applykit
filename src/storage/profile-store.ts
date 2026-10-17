import { storage } from 'wxt/utils/storage';
import { parseStoredProfile } from '@/domain/profile-schema';
import type { UserProfile } from '@/domain/user-profile';
import { BACKUP_KEY, PROFILE_KEY } from './keys';

/**
 * Local persistence for the user's profile, in `browser.storage.local`.
 *
 * The only module that touches extension storage for profiles. Data read
 * back is validated before use; failures are returned as values with a
 * user-facing message, never thrown, and never logged with personal data.
 */

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; profile: UserProfile }
  /** Something is stored but is not a valid profile. */
  | { status: 'invalid' }
  | { status: 'error'; message: string };

export type SaveResult =
  | { status: 'saved'; profile: UserProfile }
  | { status: 'error'; message: string };

export interface ProfileStore {
  load(): Promise<LoadResult>;
  /** Saves a profile that has already been validated. */
  save(profile: UserProfile): Promise<SaveResult>;
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
    const profile = parseStoredProfile(value);
    return profile ? { status: 'loaded', profile } : { status: 'invalid' };
  },

  async save(profile) {
    try {
      const existing = await storage.getItem<unknown>(PROFILE_KEY);
      if (existing !== null && parseStoredProfile(existing) === null) {
        // Never silently discard data we could not read.
        await storage.setItem(BACKUP_KEY, existing);
      }
      await storage.setItem(PROFILE_KEY, profile);
      return { status: 'saved', profile };
    } catch {
      return {
        status: 'error',
        message:
          'ApplyKit could not save your profile. Your changes are still on this page; try again.',
      };
    }
  },
};
