/**
 * The two Claude models AI drafting offers (ADR 0019). IDs, thinking
 * settings and prices were checked against Anthropic's documentation on
 * 2026-10-18 (models overview, thinking, pricing). A retired ID returns
 * `not_found_error`, which ApplyKit reports instead of switching models.
 */

export const MODELS_CHECKED = '2026-10-18';

export const MODEL_CHOICES = ['fast', 'quality'] as const;

export type ModelChoice = (typeof MODEL_CHOICES)[number];

export interface ModelInfo {
  id: string;
  label: string;
  /**
   * The lowest thinking setting each model accepts. Both models think by
   * default, and thinking tokens are billed as output and count toward
   * `max_tokens`; short answers do not need it. Sonnet 5.5 rejects
   * `disabled`, and `between_tools` without tools returns text only.
   */
  thinking: { type: 'disabled' } | { type: 'between_tools' };
  /** US dollars per million tokens, for prompts under 100K tokens. */
  price: { input: number; output: number };
}

export const MODELS: Record<ModelChoice, ModelInfo> = {
  fast: {
    id: 'claude-haiku-5-5',
    label: 'Fast',
    thinking: { type: 'disabled' },
    price: { input: 0.1, output: 0.5 },
  },
  quality: {
    id: 'claude-sonnet-5-5',
    label: 'Higher quality',
    thinking: { type: 'between_tools' },
    price: { input: 2, output: 10 },
  },
};

export function isModelChoice(value: unknown): value is ModelChoice {
  return value === 'fast' || value === 'quality';
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** An estimate in US dollars from reported usage and list prices. */
export function estimateCost(model: ModelChoice, usage: TokenUsage): number {
  const { price } = MODELS[model];
  return (
    (usage.inputTokens * price.input + usage.outputTokens * price.output) /
    1_000_000
  );
}
