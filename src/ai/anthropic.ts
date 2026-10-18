import { MODELS, type ModelChoice, type TokenUsage } from './models';

/**
 * ApplyKit's only network client (ADR 0019): Anthropic's Messages API,
 * used only by the background worker with the user's own key. The URL is
 * fixed here, never taken from a caller. Nothing here logs, and no result
 * carries the key, the request or the API's own error text: failures are
 * reduced to a fixed kind. There are no automatic retries, so a request
 * the user did not ask for is never sent.
 */

/** The optional host permission requested when the user connects. */
export const ANTHROPIC_HOST_PERMISSION = 'https://api.anthropic.com/*';

const API = 'https://api.anthropic.com/v1';
const API_VERSION = '2023-06-01';

/**
 * Chrome stops a service worker whose fetch response takes more than 30
 * seconds to arrive; a short draft takes a few.
 */
export const REQUEST_TIMEOUT_MS = 25_000;

export type AiFailure =
  /** 401: malformed, revoked or expired key. */
  | 'invalid-key'
  /** 400: an identity-linked key not scoped to one workspace. */
  | 'workspace-required'
  /** 403: the key may not use this API or model. */
  | 'forbidden'
  /** 402: billing problem on the account. */
  | 'billing'
  /** A spend limit (organisation, workspace or tier) was reached. */
  | 'spend-limit'
  /** 429: too many requests; `retryAfterSeconds` when given. */
  | 'rate-limited'
  /** 404: the model is no longer available. */
  | 'model-unavailable'
  /** 413 */
  | 'too-large'
  /** 529 */
  | 'overloaded'
  /** 500, 504 and other server errors. */
  | 'server'
  /** Any other 400: the request was not accepted. */
  | 'rejected'
  | 'timeout'
  | 'network'
  | 'cancelled'
  /** A 200 response that is not a valid message. */
  | 'malformed'
  /** The model declined to answer. */
  | 'refusal'
  /** The answer reached `max_tokens` and is incomplete. */
  | 'truncated'
  /** No text in the answer. */
  | 'empty';

export type DraftReply =
  | { ok: true; text: string; usage: TokenUsage }
  | {
      ok: false;
      failure: AiFailure;
      /** Tokens billed despite the failure, when the API reported them. */
      usage: TokenUsage | null;
      retryAfterSeconds: number | null;
    };

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

export interface CallOptions {
  fetch?: Fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface DraftCall {
  key: string;
  model: ModelChoice;
  system: string;
  prompt: string;
  maxTokens: number;
}

const defaultFetch: Fetch = (input, init) => fetch(input, init);

/** Asks Claude for one draft. Never throws. */
export async function requestDraft(
  call: DraftCall,
  options: CallOptions = {},
): Promise<DraftReply> {
  const model = MODELS[call.model];
  const sent = await post(
    '/messages',
    call.key,
    {
      model: model.id,
      max_tokens: call.maxTokens,
      thinking: model.thinking,
      system: call.system,
      messages: [{ role: 'user', content: call.prompt }],
    },
    options,
  );
  if (!sent.ok) return { ...sent, usage: null };
  const message = readMessage(sent.body);
  if (!message) {
    return failed('malformed', null);
  }
  if (message.stop === 'refusal') return failed('refusal', message.usage);
  if (message.stop === 'max_tokens') return failed('truncated', message.usage);
  const text = message.text.trim();
  if (text === '') return failed('empty', message.usage);
  return { ok: true, text, usage: message.usage };
}

/**
 * Whether Anthropic accepts the key, using token counting, which is free.
 * Never throws.
 */
export async function checkKey(
  key: string,
  options: CallOptions = {},
): Promise<{ ok: true } | { ok: false; failure: AiFailure }> {
  const sent = await post(
    '/messages/count_tokens',
    key,
    {
      model: MODELS.fast.id,
      messages: [{ role: 'user', content: 'Hello' }],
    },
    options,
  );
  if (!sent.ok) return { ok: false, failure: sent.failure };
  const { input_tokens: tokens } = sent.body as { input_tokens?: unknown };
  return typeof tokens === 'number'
    ? { ok: true }
    : { ok: false, failure: 'malformed' };
}

function failed(failure: AiFailure, usage: TokenUsage | null): DraftReply {
  return { ok: false, failure, usage, retryAfterSeconds: null };
}

type Sent =
  | { ok: true; body: unknown }
  | { ok: false; failure: AiFailure; retryAfterSeconds: number | null };

async function post(
  path: '/messages' | '/messages/count_tokens',
  key: string,
  body: object,
  { fetch = defaultFetch, signal, timeoutMs = REQUEST_TIMEOUT_MS }: CallOptions,
): Promise<Sent> {
  const controller = new AbortController();
  // Set from the timer, so read through an object TypeScript cannot narrow.
  const state = { timedOut: false };
  const timer = setTimeout(() => {
    state.timedOut = true;
    controller.abort();
  }, timeoutMs);
  const cancel = () => {
    controller.abort();
  };
  signal?.addEventListener('abort', cancel);
  try {
    if (signal?.aborted) {
      return { ok: false, failure: 'cancelled', retryAfterSeconds: null };
    }
    let response: Response;
    try {
      response = await fetch(`${API}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${key}`,
          'anthropic-version': API_VERSION,
          'content-type': 'application/json',
          // Anthropic answers requests that carry a browser Origin only with
          // this header; the official SDK sends it for browser use. ApplyKit
          // accepts the risk it names by keeping the key in the background
          // (ADR 0019).
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      });
    } catch {
      return {
        ok: false,
        failure: state.timedOut
          ? 'timeout'
          : signal?.aborted
            ? 'cancelled'
            : 'network',
        retryAfterSeconds: null,
      };
    }
    let json: unknown = null;
    try {
      json = await response.json();
    } catch {
      if (state.timedOut || signal?.aborted) {
        return {
          ok: false,
          failure: state.timedOut ? 'timeout' : 'cancelled',
          retryAfterSeconds: null,
        };
      }
    }
    if (response.ok) {
      return json === null
        ? { ok: false, failure: 'malformed', retryAfterSeconds: null }
        : { ok: true, body: json };
    }
    return {
      ok: false,
      failure: failureOf(response.status, json),
      retryAfterSeconds:
        response.status === 429 ? retryAfter(response.headers) : null,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

/** The kind of an API error; its message is read only to tell kinds apart. */
function failureOf(status: number, body: unknown): AiFailure {
  const error =
    typeof body === 'object' && body !== null
      ? (body as { error?: unknown }).error
      : null;
  const details =
    typeof error === 'object' && error !== null
      ? (error as { message?: unknown; details?: unknown })
      : {};
  const message =
    typeof details.message === 'string' ? details.message.toLowerCase() : '';
  const code =
    typeof details.details === 'object' && details.details !== null
      ? (details.details as { error_code?: unknown }).error_code
      : null;
  switch (status) {
    case 400:
      if (message.includes('anthropic-workspace-id')) {
        return 'workspace-required';
      }
      return message.includes('usage limit') ? 'spend-limit' : 'rejected';
    case 401:
      return 'invalid-key';
    case 402:
      return 'billing';
    case 403:
      return 'forbidden';
    case 404:
      return 'model-unavailable';
    case 413:
      return 'too-large';
    case 429:
      return code === 'enforced_spend_limit_reached'
        ? 'spend-limit'
        : 'rate-limited';
    case 529:
      return 'overloaded';
    default:
      return 'server';
  }
}

function retryAfter(headers: Headers): number | null {
  const value = Number(headers.get('retry-after'));
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}

interface Message {
  text: string;
  stop: string;
  usage: TokenUsage;
}

/** A Messages API response, checked by shape; null if it is not one. */
function readMessage(body: unknown): Message | null {
  if (typeof body !== 'object' || body === null) return null;
  const {
    type,
    content,
    stop_reason: stop,
    usage,
  } = body as Record<string, unknown>;
  if (type !== 'message' || !Array.isArray(content)) return null;
  if (typeof stop !== 'string') return null;
  const tokens = readUsage(usage);
  if (!tokens) return null;
  const parts: string[] = [];
  for (const block of content as unknown[]) {
    if (typeof block !== 'object' || block === null) return null;
    const { type: kind, text } = block as { type?: unknown; text?: unknown };
    if (kind === 'text') {
      if (typeof text !== 'string') return null;
      parts.push(text);
    }
  }
  return { text: parts.join(''), stop, usage: tokens };
}

function readUsage(usage: unknown): TokenUsage | null {
  if (typeof usage !== 'object' || usage === null) return null;
  const { input_tokens: input, output_tokens: output } = usage as {
    input_tokens?: unknown;
    output_tokens?: unknown;
  };
  if (!isCount(input) || !isCount(output)) return null;
  return { inputTokens: input, outputTokens: output };
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
