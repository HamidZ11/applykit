import { storage } from 'wxt/utils/storage';
import {
  DIVERSITY_SCHEMA_VERSION,
  emptyDiversity,
  isNewerDiversity,
  parseStoredDiversity,
  type DiversityCategory,
  type DiversityPreferences,
  type SavedDiversity,
} from '@/domain/diversity';
import { keepBackup, keepingUnknown } from './backups';
import { DIVERSITY_BACKUP_KEY, DIVERSITY_KEY } from './keys';
import { withLock } from './lock';

/**
 * Local persistence for diversity preferences (ADR 0018), apart from the
 * profile and the saved answers, with the same safeguards: everything read
 * is checked, saves are compare-and-set, data from a newer version is never
 * written over, and unreadable data is backed up before it is replaced.
 * Nothing here logs or reports a saved value.
 */

export type DiversityLoadResult =
  | {
      status: 'loaded';
      preferences: DiversityPreferences;
      /** The saved version, or null when nothing has been saved yet. */
      updatedAt: string | null;
      damaged: DiversityCategory[] | 'all';
    }
  /** Saved by a newer ApplyKit: kept as it is, never written over. */
  | { status: 'unsupported' }
  | { status: 'error' };

export type DiversitySaveResult =
  | { status: 'saved'; saved: SavedDiversity }
  /** Another tab saved since this one loaded; nothing was written. */
  | {
      status: 'conflict';
      current: SavedDiversity;
      damaged: DiversityCategory[];
    }
  | { status: 'unsupported' }
  | { status: 'error' };

export interface DiversityStore {
  load(): Promise<DiversityLoadResult>;
  /**
   * Saves the preferences, unless the stored ones are no longer the
   * version the edit started from (`basedOn`, null for none).
   */
  save(
    preferences: DiversityPreferences,
    basedOn: string | null,
    now: Date,
  ): Promise<DiversitySaveResult>;
  /**
   * Deletes every saved answer, the reuse setting and any backups of
   * them. Returns false if storage could not be changed.
   */
  clearAll(): Promise<boolean>;
}

const LOCK = 'applykit:diversity';

export const browserDiversityStore: DiversityStore = {
  async load() {
    let value: unknown;
    try {
      value = await storage.getItem<unknown>(DIVERSITY_KEY);
    } catch {
      return { status: 'error' };
    }
    if (isNewerDiversity(value)) return { status: 'unsupported' };
    if (value === null) {
      return {
        status: 'loaded',
        preferences: emptyDiversity(),
        updatedAt: null,
        damaged: [],
      };
    }
    const read = parseStoredDiversity(value);
    return read
      ? {
          status: 'loaded',
          preferences: read.saved.preferences,
          updatedAt: read.saved.updatedAt,
          damaged: read.damaged,
        }
      : {
          status: 'loaded',
          preferences: emptyDiversity(),
          updatedAt: null,
          damaged: 'all',
        };
  },

  async save(preferences, basedOn, now) {
    const saved: SavedDiversity = {
      schemaVersion: DIVERSITY_SCHEMA_VERSION,
      preferences,
      updatedAt: now.toISOString(),
    };
    try {
      const outcome = await withLock(LOCK, async () => {
        const existing = await storage.getItem<unknown>(DIVERSITY_KEY);
        if (isNewerDiversity(existing)) return 'unsupported' as const;
        const read = existing === null ? null : parseStoredDiversity(existing);
        if (read && read.saved.updatedAt !== basedOn) return read;
        if (existing !== null && (read === null || read.damaged.length > 0)) {
          await keepBackup(DIVERSITY_BACKUP_KEY, existing, now);
        }
        await storage.setItem(
          DIVERSITY_KEY,
          read
            ? keepingUnknown(
                existing,
                {
                  ...saved,
                  preferences: keepingUnknown(
                    (existing as { preferences: unknown }).preferences,
                    preferences,
                    'answers',
                  ),
                },
                'preferences',
              )
            : saved,
        );
        return null;
      });
      if (outcome === 'unsupported') return { status: 'unsupported' };
      if (outcome) {
        return {
          status: 'conflict',
          current: outcome.saved,
          damaged: outcome.damaged,
        };
      }
    } catch {
      return { status: 'error' };
    }
    return { status: 'saved', saved };
  },

  async clearAll() {
    try {
      await withLock(LOCK, async () => {
        await storage.removeItem(DIVERSITY_KEY);
        await storage.removeItem(DIVERSITY_BACKUP_KEY);
      });
      return true;
    } catch {
      return false;
    }
  },
};
