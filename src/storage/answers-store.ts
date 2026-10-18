import { storage } from 'wxt/utils/storage';
import {
  ANSWERS_SCHEMA_VERSION,
  emptyAnswers,
  type AnswerCategory,
  type ApplicationAnswers,
  type SavedAnswers,
} from '@/domain/application-answers';
import { isNewerAnswers, parseStoredAnswers } from '@/domain/answers-schema';
import { ANSWERS_BACKUP_KEY, ANSWERS_KEY } from './keys';
import { keepBackup, keepingUnknown } from './backups';
import { withLock } from './lock';

/**
 * Local persistence for saved application answers, separate from the
 * profile (ADR 0016), with the same safeguards: everything read is
 * validated, results are returned rather than thrown, saves are
 * compare-and-set, and unreadable data is backed up before it is replaced.
 */

export type AnswersLoadResult =
  | {
      status: 'loaded';
      /** All categories; those never saved are null. */
      answers: ApplicationAnswers;
      /** The saved version, or null when nothing has been saved yet. */
      updatedAt: string | null;
      /**
       * Saved data could not be read, in whole (`all`) or for some
       * categories. It is kept, and backed up on the next save.
       */
      damaged: AnswerCategory[] | 'all';
    }
  /**
   * Saved by a newer ApplyKit: kept exactly as it is, and never written
   * over by this version.
   */
  | { status: 'unsupported' }
  | { status: 'error' };

export type AnswersSaveResult =
  | { status: 'saved'; saved: SavedAnswers }
  /**
   * Another tab saved since this one loaded; nothing was written.
   * `damaged` lists categories of `current` that could not be read.
   */
  | { status: 'conflict'; current: SavedAnswers; damaged: AnswerCategory[] }
  /** A newer ApplyKit saved the answers; nothing was written. */
  | { status: 'unsupported' }
  | { status: 'error' };

export interface AnswersStore {
  load(): Promise<AnswersLoadResult>;
  /**
   * Saves every category at once, unless the stored answers are no longer
   * the version the edit started from (`basedOn`, null for none).
   */
  save(
    answers: ApplicationAnswers,
    basedOn: string | null,
    now: Date,
  ): Promise<AnswersSaveResult>;
}

export const browserAnswersStore: AnswersStore = {
  async load() {
    let value: unknown;
    try {
      value = await storage.getItem<unknown>(ANSWERS_KEY);
    } catch {
      return { status: 'error' };
    }
    if (isNewerAnswers(value)) return { status: 'unsupported' };
    if (value === null) {
      return {
        status: 'loaded',
        answers: emptyAnswers(),
        updatedAt: null,
        damaged: [],
      };
    }
    const read = parseStoredAnswers(value);
    return read
      ? {
          status: 'loaded',
          answers: read.saved.answers,
          updatedAt: read.saved.updatedAt,
          damaged: read.damaged,
        }
      : {
          status: 'loaded',
          answers: emptyAnswers(),
          updatedAt: null,
          damaged: 'all',
        };
  },

  async save(answers, basedOn, now) {
    const saved: SavedAnswers = {
      schemaVersion: ANSWERS_SCHEMA_VERSION,
      answers,
      updatedAt: now.toISOString(),
    };
    try {
      const outcome = await withLock('applykit:answers', async () => {
        const existing = await storage.getItem<unknown>(ANSWERS_KEY);
        if (isNewerAnswers(existing)) return 'unsupported' as const;
        const read = existing === null ? null : parseStoredAnswers(existing);
        // Unreadable data has no version: the user saw it as not saved.
        if (read && read.saved.updatedAt !== basedOn) return read;
        if (existing !== null && (read === null || read.damaged.length > 0)) {
          // Never silently discard data we could not read.
          await keepBackup(ANSWERS_BACKUP_KEY, existing, now);
        }
        await storage.setItem(
          ANSWERS_KEY,
          read ? keepingUnknown(existing, saved, 'answers') : saved,
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
};
