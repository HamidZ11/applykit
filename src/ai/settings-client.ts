import { browser } from 'wxt/browser';
import {
  AI_CONNECT_TYPE,
  AI_DISCONNECT_TYPE,
  AI_SESSION_ONLY_TYPE,
  AI_STATUS_TYPE,
  isAiConnectResponse,
  isAiStatus,
  type AiConnectResponse,
} from '@/messages';
import { browserAiSettingsStore, type AiSettings } from '@/storage/ai-settings';
import type { AiStatus } from './connection';
import { browserHostAccess } from './host-access';

/**
 * What the AI settings section of the profile page may do (ADR 0019). The
 * key is handed to the background worker to connect; the page never reads
 * it back.
 */
export interface AiSettingsClient {
  /** Whether this browser has what AI drafting needs. */
  supported(): boolean;
  /**
   * Whether a key may be remembered on this device. Not in Safari, where
   * extension storage on disk cannot be kept from content scripts.
   */
  canRemember(): boolean;
  /** Moves a remembered key to this session only, keeping it. */
  keepForSessionOnly(): Promise<boolean>;
  status(): Promise<AiStatus | null>;
  /** Asks for the host permission; call it first in the user's click. */
  requestPermission(): Promise<boolean>;
  connect(key: string, remember: boolean): Promise<AiConnectResponse | null>;
  disconnect(): Promise<boolean>;
  saveSettings(settings: AiSettings): Promise<boolean>;
}

async function send(message: object): Promise<unknown> {
  try {
    return (await browser.runtime.sendMessage(message)) as unknown;
  } catch {
    return null;
  }
}

export const browserAiSettingsClient: AiSettingsClient = {
  supported() {
    // Session storage limited to trusted contexts (Chrome 102+, Safari
    // 17.1+), so a session key is never readable by content scripts.
    const area = (
      browser.storage as { session?: { setAccessLevel?: unknown } } | undefined
    )?.session;
    const permissions = (browser as { permissions?: unknown }).permissions;
    return (
      typeof area?.setAccessLevel === 'function' && permissions !== undefined
    );
  },
  canRemember: () => import.meta.env.BROWSER !== 'safari',
  async keepForSessionOnly() {
    const reply = await send({ type: AI_SESSION_ONLY_TYPE });
    return (
      typeof reply === 'object' &&
      reply !== null &&
      (reply as { ok?: unknown }).ok === true
    );
  },
  async status() {
    const reply = await send({ type: AI_STATUS_TYPE });
    return isAiStatus(reply) ? reply : null;
  },
  requestPermission: () => browserHostAccess.request(),
  async connect(key, remember) {
    const reply = await send({ type: AI_CONNECT_TYPE, key, remember });
    return isAiConnectResponse(reply) ? reply : null;
  },
  async disconnect() {
    const reply = await send({ type: AI_DISCONNECT_TYPE });
    return (
      typeof reply === 'object' &&
      reply !== null &&
      (reply as { ok?: unknown }).ok === true
    );
  },
  saveSettings: (settings) => browserAiSettingsStore.save(settings),
};
