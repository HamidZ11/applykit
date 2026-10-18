import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  browserAiSettingsStore as settings,
  browserAiUsageStore as usage,
  DEFAULT_AI_SETTINGS,
  localDay,
} from './ai-settings';

const NOW = new Date(2026, 9, 18, 12, 0);
const TOMORROW = new Date(2026, 9, 19, 0, 5);

beforeEach(() => {
  fakeBrowser.reset();
});

describe('AI settings', () => {
  it('defaults to the fast model and 50 requests a day', async () => {
    expect(await settings.load()).toEqual({ model: 'fast', dailyLimit: 50 });
  });

  it('saves a model and a lower limit', async () => {
    expect(await settings.save({ model: 'quality', dailyLimit: 10 })).toBe(
      true,
    );

    expect(await settings.load()).toEqual({ model: 'quality', dailyLimit: 10 });
  });

  it('never saves a limit above 50 or below 1', async () => {
    for (const dailyLimit of [0, 51, 2.5, Number.NaN]) {
      expect(await settings.save({ model: 'fast', dailyLimit })).toBe(false);
    }
  });

  it('reads unexpected stored values as the defaults', async () => {
    await fakeBrowser.storage.local.set({
      aiSettings: { model: 'claude-opus', dailyLimit: 5000 },
    });

    expect(await settings.load()).toEqual(DEFAULT_AI_SETTINGS);
  });
});

describe('daily usage', () => {
  it('counts requests up to the limit', async () => {
    expect(await usage.reserve(2, NOW)).toBe(true);
    expect(await usage.reserve(2, NOW)).toBe(true);
    expect(await usage.reserve(2, NOW)).toBe(false);

    expect((await usage.today(NOW)).requests).toBe(2);
  });

  it('starts again on a new local day', async () => {
    await usage.reserve(1, NOW);

    expect(await usage.reserve(1, NOW)).toBe(false);
    expect(await usage.reserve(1, TOMORROW)).toBe(true);
    expect(localDay(TOMORROW)).toBe('2026-10-19');
  });

  it('adds reported tokens and an estimated cost', async () => {
    await usage.reserve(50, NOW);
    await usage.record('fast', { inputTokens: 1000, outputTokens: 200 }, NOW);
    await usage.record(
      'quality',
      { inputTokens: 1000, outputTokens: 200 },
      NOW,
    );

    const today = await usage.today(NOW);
    expect(today).toMatchObject({
      requests: 1,
      inputTokens: 2000,
      outputTokens: 400,
    });
    // 0.0001 + 0.0001 for Haiku 5.5; 0.002 + 0.002 for Sonnet 5.5.
    expect(today.estimatedCost).toBeCloseTo(0.0042, 6);
  });

  it('allows no request when the count is damaged', async () => {
    await fakeBrowser.storage.local.set({
      aiUsage: { day: localDay(NOW), requests: 'many' },
    });

    expect(await usage.reserve(50, NOW)).toBe(false);
    expect((await usage.today(NOW)).requests).toBe(50);
  });

  it('allows no request when the count cannot be stored', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('quota'),
    );

    expect(await usage.reserve(50, NOW)).toBe(false);
  });

  it('never over-counts concurrent requests', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => usage.reserve(3, NOW)),
    );

    expect(results.filter(Boolean)).toHaveLength(3);
    expect((await usage.today(NOW)).requests).toBe(3);
  });
});
