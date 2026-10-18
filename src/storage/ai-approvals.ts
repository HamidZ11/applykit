import { storage } from 'wxt/utils/storage';
import { AI_APPROVALS_KEY } from './keys';

/**
 * What the user approved sharing in this browser session (ADR 0019), as
 * fingerprints of the exact request content. Session storage: forgotten
 * when the browser closes, so the first request of each session shows the
 * full preview again. Only the background worker reads and writes it.
 */
export interface ApprovalStore {
  has(fingerprint: string): Promise<boolean>;
  add(fingerprint: string): Promise<void>;
}

const MAX = 200;

async function list(): Promise<string[]> {
  try {
    const value = await storage.getItem<unknown>(AI_APPROVALS_KEY);
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

export const browserApprovalStore: ApprovalStore = {
  async has(fingerprint) {
    return (await list()).includes(fingerprint);
  },
  async add(fingerprint) {
    const current = (await list()).filter((f) => f !== fingerprint);
    try {
      await storage.setItem(
        AI_APPROVALS_KEY,
        [...current, fingerprint].slice(-MAX),
      );
    } catch {
      // Not remembered: the full preview shows again next time.
    }
  },
};
