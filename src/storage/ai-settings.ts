import { storage } from 'wxt/utils/storage';
import {
  estimateCost,
  isModelChoice,
  type ModelChoice,
  type TokenUsage,
} from '@/ai/models';
import { AI_SETTINGS_KEY, AI_USAGE_KEY } from './keys';
import { withLock } from './lock';

/**
 * AI drafting preferences and the local daily request count (ADR 0019).
 * The count limits requests from this browser only; it is not a provider
 * spending cap. Unreadable data falls back to the defaults, never to more
 * requests.
 */

export const MAX_DAILY_LIMIT = 50;

export interface AiSettings {
  model: ModelChoice;
  /** Requests allowed per day, 1 to 50. */
  dailyLimit: number;
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  model: 'fast',
  dailyLimit: MAX_DAILY_LIMIT,
};

export function isDailyLimit(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= MAX_DAILY_LIMIT
  );
}

export interface AiSettingsStore {
  load(): Promise<AiSettings>;
  /** Returns false if the settings could not be saved. */
  save(settings: AiSettings): Promise<boolean>;
}

export const browserAiSettingsStore: AiSettingsStore = {
  async load() {
    try {
      const value = await storage.getItem<unknown>(AI_SETTINGS_KEY);
      if (typeof value !== 'object' || value === null) {
        return DEFAULT_AI_SETTINGS;
      }
      const { model, dailyLimit } = value as Record<string, unknown>;
      return {
        model: isModelChoice(model) ? model : DEFAULT_AI_SETTINGS.model,
        dailyLimit: isDailyLimit(dailyLimit)
          ? dailyLimit
          : DEFAULT_AI_SETTINGS.dailyLimit,
      };
    } catch {
      return DEFAULT_AI_SETTINGS;
    }
  },

  async save(settings) {
    if (!isModelChoice(settings.model) || !isDailyLimit(settings.dailyLimit)) {
      return false;
    }
    try {
      await storage.setItem(AI_SETTINGS_KEY, {
        model: settings.model,
        dailyLimit: settings.dailyLimit,
      });
      return true;
    } catch {
      return false;
    }
  },
};

export interface UsageToday {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  /** US dollars, estimated from reported tokens and list prices. */
  estimatedCost: number;
}

export interface AiUsageStore {
  today(now: Date): Promise<UsageToday>;
  /**
   * Counts one request if today's count is below `limit`. False when the
   * limit is reached or the count cannot be stored: no request then.
   */
  reserve(limit: number, now: Date): Promise<boolean>;
  /** Adds the tokens the API reported for a request. */
  record(model: ModelChoice, usage: TokenUsage, now: Date): Promise<void>;
}

export function localDay(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const LOCK = 'applykit:ai-usage';

/**
 * Only the background worker counts requests. Its own concurrent requests
 * are serialised here as well, where the Web Locks API is missing.
 */
let pending: Promise<unknown> = Promise.resolve();

function serially<T>(task: () => Promise<T>): Promise<T> {
  const run = pending.then(() => withLock(LOCK, task));
  pending = run.catch(() => undefined);
  return run;
}

function emptyUsage(day: string): UsageToday {
  return {
    day,
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    estimatedCost: 0,
  };
}

function count(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

/**
 * Today's stored usage. Unreadable data for today counts as the limit
 * reached, so a damaged counter never allows more requests.
 */
async function readUsage(day: string): Promise<UsageToday | null> {
  const value = await storage.getItem<unknown>(AI_USAGE_KEY);
  if (value === null) return emptyUsage(day);
  if (typeof value !== 'object') return null;
  const stored = value as Record<string, unknown>;
  if (stored.day !== day) {
    return typeof stored.day === 'string' ? emptyUsage(day) : null;
  }
  const requests = count(stored.requests);
  const inputTokens = count(stored.inputTokens);
  const outputTokens = count(stored.outputTokens);
  const estimatedCost = count(stored.estimatedCost);
  if (
    requests === null ||
    inputTokens === null ||
    outputTokens === null ||
    estimatedCost === null
  ) {
    return null;
  }
  return { day, requests, inputTokens, outputTokens, estimatedCost };
}

export const browserAiUsageStore: AiUsageStore = {
  async today(now) {
    const day = localDay(now);
    try {
      return (
        (await readUsage(day)) ?? {
          ...emptyUsage(day),
          requests: MAX_DAILY_LIMIT,
        }
      );
    } catch {
      return emptyUsage(day);
    }
  },

  async reserve(limit, now) {
    const day = localDay(now);
    try {
      return await serially(async () => {
        const usage = await readUsage(day);
        if (!usage || usage.requests >= limit) return false;
        await storage.setItem(AI_USAGE_KEY, {
          ...usage,
          requests: usage.requests + 1,
        });
        return true;
      });
    } catch {
      return false;
    }
  },

  async record(model, usage, now) {
    const day = localDay(now);
    try {
      await serially(async () => {
        const current = await readUsage(day);
        if (!current) return;
        await storage.setItem(AI_USAGE_KEY, {
          ...current,
          inputTokens: current.inputTokens + usage.inputTokens,
          outputTokens: current.outputTokens + usage.outputTokens,
          estimatedCost: current.estimatedCost + estimateCost(model, usage),
        });
      });
    } catch {
      // The request was made; only the local estimate is incomplete.
    }
  },
};
