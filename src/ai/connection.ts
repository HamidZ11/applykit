import type { CredentialStore } from '@/storage/ai-credential';
import { isApiKeyShape } from '@/storage/ai-credential';
import type { AiSettingsStore, AiUsageStore } from '@/storage/ai-settings';
import { checkKey, type AiFailure, type Fetch } from './anthropic';
import type { HostAccess } from './host-access';
import type { ModelChoice } from './models';

/**
 * Connecting and disconnecting the user's Anthropic key, in the background
 * worker (ADR 0019). The profile page sends the key once to connect and
 * afterwards sees only its last four characters.
 */

export interface ConnectionDeps {
  credentials: CredentialStore;
  host: HostAccess;
  settings: AiSettingsStore;
  usage: AiUsageStore;
  fetch?: Fetch;
  now: () => Date;
}

/** What the AI settings show. Never the key itself. */
export interface AiStatus {
  connected: boolean;
  /** Kept on this device rather than for the browser session. */
  remembered: boolean;
  /** The key's last four characters, to tell keys apart. */
  keyHint: string | null;
  /** Whether the optional host permission is still granted. */
  permission: boolean;
  model: ModelChoice;
  dailyLimit: number;
  requestsToday: number;
  estimatedCostToday: number;
}

export type ConnectFailure =
  'not-a-key' | 'no-permission' | 'not-saved' | AiFailure;

export async function aiStatus(deps: ConnectionDeps): Promise<AiStatus> {
  const [credential, permission, settings, today] = await Promise.all([
    deps.credentials.load(),
    deps.host.granted(),
    deps.settings.load(),
    deps.usage.today(deps.now()),
  ]);
  return {
    connected: credential !== null,
    remembered: credential?.remembered ?? false,
    keyHint: credential ? credential.key.slice(-4) : null,
    permission,
    model: settings.model,
    dailyLimit: settings.dailyLimit,
    requestsToday: today.requests,
    estimatedCostToday: today.estimatedCost,
  };
}

/** Whether drafting can be offered: a key and the host permission. */
export async function aiAvailable(
  deps: Pick<ConnectionDeps, 'credentials' | 'host'>,
): Promise<boolean> {
  const [credential, permission] = await Promise.all([
    deps.credentials.load(),
    deps.host.granted(),
  ]);
  return credential !== null && permission;
}

/**
 * Checks the key with Anthropic (free) and keeps it only if accepted. The
 * page has already asked for the host permission in the user's click.
 */
export async function connect(
  deps: ConnectionDeps,
  key: string,
  remember: boolean,
): Promise<
  { ok: true; status: AiStatus } | { ok: false; failure: ConnectFailure }
> {
  const trimmed = key.trim();
  if (!isApiKeyShape(trimmed)) return { ok: false, failure: 'not-a-key' };
  if (!(await deps.host.granted())) {
    return { ok: false, failure: 'no-permission' };
  }
  const checked = await checkKey(
    trimmed,
    deps.fetch ? { fetch: deps.fetch } : {},
  );
  if (!checked.ok) return { ok: false, failure: checked.failure };
  if (!(await deps.credentials.save(trimmed, remember))) {
    return { ok: false, failure: 'not-saved' };
  }
  return { ok: true, status: await aiStatus(deps) };
}

/** Removes the key from both storage areas and the host permission. */
export async function disconnect(deps: ConnectionDeps): Promise<boolean> {
  const removed = await deps.credentials.remove();
  await deps.host.remove();
  return removed;
}
