import type { DraftFailure } from '@/messages';
import type { AiFailure } from './anthropic';
import type { ConnectFailure } from './connection';

/**
 * What to tell the user when an AI request fails. Fixed wording: never the
 * API's own error text, which could echo a request, and never the key.
 */
export function failureText(
  failure: ConnectFailure | AiFailure | DraftFailure,
  retryAfterSeconds: number | null = null,
): string {
  switch (failure) {
    case 'daily-limit':
      return 'You have reached today’s limit for AI requests. You can change it in AI Assistant.';
    case 'busy':
      return 'Another draft is being written in this tab. Try again when it finishes.';
    case 'no-context':
      return 'Choose at least one thing to share, so the draft has facts to use.';
    case 'insufficient':
      return 'What you shared does not answer this question, so no draft was written. Share more, or add details in Skills & projects.';
    case 'not-a-key':
      return 'That does not look like an Anthropic API key. Keys start with sk-ant-.';
    case 'no-permission':
      return 'ApplyKit needs your permission to reach api.anthropic.com. Nothing was sent.';
    case 'not-saved':
      return 'ApplyKit could not keep your key in this browser. Try again.';
    case 'invalid-key':
      return 'Anthropic did not accept this key. It may be mistyped, disabled or expired.';
    case 'workspace-required':
      return 'This key works in several workspaces. Create a key for a single workspace in the Claude Console.';
    case 'forbidden':
      return 'This key is not allowed to use this model. Check its permissions in the Claude Console.';
    case 'billing':
      return 'Anthropic reported a billing problem with this account. Check it in the Claude Console.';
    case 'spend-limit':
      return 'Your Anthropic spend limit has been reached. Nothing more will be sent until it is raised.';
    case 'rate-limited':
      return retryAfterSeconds
        ? `Anthropic is limiting requests. Try again in ${String(retryAfterSeconds)} seconds.`
        : 'Anthropic is limiting requests. Try again shortly.';
    case 'model-unavailable':
      return 'This model is no longer available. Choose the other model, or update ApplyKit.';
    case 'too-large':
      return 'The request was too large. Share less information and try again.';
    case 'overloaded':
      return 'Anthropic is busy right now. Try again shortly.';
    case 'server':
      return 'Anthropic had a problem with this request. Try again shortly.';
    case 'rejected':
      return 'Anthropic did not accept this request. Try again, or share less information.';
    case 'timeout':
      return 'Anthropic took too long to answer. Try again.';
    case 'network':
      return 'ApplyKit could not reach Anthropic. Check your connection and try again.';
    case 'cancelled':
      return 'Cancelled. Nothing was inserted.';
    case 'malformed':
      return 'Anthropic’s answer could not be read. Try again.';
    case 'refusal':
      return 'Claude declined to draft this answer. Write it yourself, or change what you share.';
    case 'truncated':
      return 'The draft was cut off. Try again, or ask for a shorter answer.';
    case 'empty':
      return 'Claude returned an empty draft. Try again.';
  }
}
