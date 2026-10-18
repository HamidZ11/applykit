import { storage } from 'wxt/utils/storage';
import { AI_REMEMBERED_KEY, AI_SESSION_KEY } from './keys';

/**
 * Where the user's Anthropic API key is kept (ADR 0019). Only the
 * background worker uses this module: the key is never sent to the panel,
 * the page or the profile page, never logged and never part of the
 * profile. Extension storage is not encrypted; session storage is kept in
 * memory, while a remembered key is written to disk as it is.
 */

/** Shape only, so a typo is caught before anything is sent. */
const KEY_SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,400}$/;

export function isApiKeyShape(value: string): boolean {
  return KEY_SHAPE.test(value);
}

export interface StoredCredential {
  key: string;
  remembered: boolean;
}

export interface CredentialStore {
  /** The key, or null when there is none or it cannot be read. */
  load(): Promise<StoredCredential | null>;
  /** Keeps the key in one place only. Returns false if it was not saved. */
  save(key: string, remember: boolean): Promise<boolean>;
  /** Removes the key from both places. Returns false if it could not. */
  remove(): Promise<boolean>;
}

async function read(item: typeof AI_SESSION_KEY | typeof AI_REMEMBERED_KEY) {
  const value = await storage.getItem<unknown>(item);
  return typeof value === 'string' && isApiKeyShape(value) ? value : null;
}

export const browserCredentialStore: CredentialStore = {
  async load() {
    try {
      const session = await read(AI_SESSION_KEY);
      if (session) return { key: session, remembered: false };
      const remembered = await read(AI_REMEMBERED_KEY);
      return remembered ? { key: remembered, remembered: true } : null;
    } catch {
      return null;
    }
  },

  async save(key, remember) {
    if (!isApiKeyShape(key)) return false;
    try {
      await storage.setItem(remember ? AI_REMEMBERED_KEY : AI_SESSION_KEY, key);
      await storage.removeItem(remember ? AI_SESSION_KEY : AI_REMEMBERED_KEY);
      return true;
    } catch {
      return false;
    }
  },

  async remove() {
    try {
      await storage.removeItem(AI_SESSION_KEY);
      await storage.removeItem(AI_REMEMBERED_KEY);
      return true;
    } catch {
      return false;
    }
  },
};

/**
 * Session storage is limited to trusted extension contexts by default in
 * Chrome and Safari 17.1+; this makes it explicit where the browser
 * supports it. It is access control, not encryption.
 */
export async function restrictSessionStorage(
  session:
    | { setAccessLevel?: (access: { accessLevel: string }) => Promise<void> }
    | undefined,
): Promise<void> {
  try {
    await session?.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    // Older browsers: the default applies.
  }
}
