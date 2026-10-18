import { browser } from 'wxt/browser';
import { ANTHROPIC_HOST_PERMISSION } from './anthropic';

/**
 * The optional host permission for Anthropic's API (ADR 0019): requested
 * only when the user connects, removed when they disconnect. Without it,
 * ApplyKit sends no AI request.
 */
export interface HostAccess {
  granted(): Promise<boolean>;
  /** Must run in the user's click on Connect. */
  request(): Promise<boolean>;
  remove(): Promise<void>;
}

const ORIGINS = { origins: [ANTHROPIC_HOST_PERMISSION] };

export const browserHostAccess: HostAccess = {
  async granted() {
    try {
      return await browser.permissions.contains(ORIGINS);
    } catch {
      return false;
    }
  },
  async request() {
    try {
      return await browser.permissions.request(ORIGINS);
    } catch {
      return false;
    }
  },
  async remove() {
    try {
      await browser.permissions.remove(ORIGINS);
    } catch {
      // Already removed, or not removable in this browser.
    }
  },
};
