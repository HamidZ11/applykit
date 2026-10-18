import { storage } from 'wxt/utils/storage';
import {
  SKILLS_SCHEMA_VERSION,
  emptySkillsProjects,
  isNewerSkillsProjects,
  parseStoredSkillsProjects,
  type SavedSkillsProjects,
  type SkillsProjects,
} from '@/domain/skills-projects';
import { keepBackup } from './backups';
import { SKILLS_BACKUP_KEY, SKILLS_KEY } from './keys';
import { withLock } from './lock';

/**
 * Local persistence for skills and projects, apart from the profile, with
 * the safeguards of the other stores (ADR 0014): read by shape,
 * compare-and-set saves under a lock, data from a newer version never
 * written over, and unreadable data backed up before it is replaced.
 */

export type SkillsLoadResult =
  | {
      status: 'loaded';
      content: SkillsProjects;
      /** The saved version, or null when nothing has been saved yet. */
      updatedAt: string | null;
      damaged: boolean;
    }
  | { status: 'unsupported' }
  | { status: 'error' };

export type SkillsSaveResult =
  | { status: 'saved'; saved: SavedSkillsProjects }
  /** Another tab saved since this one loaded; nothing was written. */
  | { status: 'conflict'; current: SavedSkillsProjects }
  | { status: 'unsupported' }
  | { status: 'error' };

export interface SkillsStore {
  load(): Promise<SkillsLoadResult>;
  save(
    content: SkillsProjects,
    basedOn: string | null,
    now: Date,
  ): Promise<SkillsSaveResult>;
}

const LOCK = 'applykit:skills';

export const browserSkillsStore: SkillsStore = {
  async load() {
    let value: unknown;
    try {
      value = await storage.getItem<unknown>(SKILLS_KEY);
    } catch {
      return { status: 'error' };
    }
    if (isNewerSkillsProjects(value)) return { status: 'unsupported' };
    if (value === null) {
      return {
        status: 'loaded',
        content: emptySkillsProjects(),
        updatedAt: null,
        damaged: false,
      };
    }
    const read = parseStoredSkillsProjects(value);
    return read
      ? {
          status: 'loaded',
          content: read.saved.content,
          updatedAt: read.saved.updatedAt,
          damaged: read.damaged,
        }
      : {
          status: 'loaded',
          content: emptySkillsProjects(),
          updatedAt: null,
          damaged: true,
        };
  },

  async save(content, basedOn, now) {
    const saved: SavedSkillsProjects = {
      schemaVersion: SKILLS_SCHEMA_VERSION,
      content,
      updatedAt: now.toISOString(),
    };
    try {
      const outcome = await withLock(LOCK, async () => {
        const existing = await storage.getItem<unknown>(SKILLS_KEY);
        if (isNewerSkillsProjects(existing)) return 'unsupported' as const;
        const read =
          existing === null ? null : parseStoredSkillsProjects(existing);
        if (read && read.saved.updatedAt !== basedOn) return read.saved;
        if (existing !== null && (read === null || read.damaged)) {
          await keepBackup(SKILLS_BACKUP_KEY, existing, now);
        }
        // Fields a later version adds next to `content` are kept.
        await storage.setItem(
          SKILLS_KEY,
          read ? { ...(existing as object), ...saved } : saved,
        );
        return null;
      });
      if (outcome === 'unsupported') return { status: 'unsupported' };
      if (outcome) return { status: 'conflict', current: outcome };
    } catch {
      return { status: 'error' };
    }
    return { status: 'saved', saved };
  },
};
