import { describe, expect, it, vi } from 'vitest';
import { checkKey, requestDraft, type Fetch } from './anthropic';

const KEY = 'sk-ant-test-not-a-real-key-0000000000';

const CALL = {
  key: KEY,
  model: 'fast' as const,
  system: 'System rules',
  prompt: 'The question',
  maxTokens: 300,
};

function reply(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return vi.fn<Fetch>(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json', ...headers },
      }),
    ),
  );
}

function message(
  text: string,
  stop = 'end_turn',
  usage: unknown = { input_tokens: 120, output_tokens: 40 },
) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text }],
    stop_reason: stop,
    usage,
  };
}

describe('requestDraft', () => {
  it('posts to the fixed endpoint with the required headers', async () => {
    const fetch = reply(200, message('A draft.'));

    const result = await requestDraft(CALL, { fetch });

    expect(result).toEqual({
      ok: true,
      text: 'A draft.',
      usage: { inputTokens: 120, outputTokens: 40 },
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('omit');
    expect(init?.redirect).toBe('error');
    expect(init?.headers).toEqual({
      authorization: `Bearer ${KEY}`,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    });
    expect(JSON.parse(init?.body as string)).toEqual({
      model: 'claude-haiku-5-5',
      max_tokens: 300,
      thinking: { type: 'disabled' },
      system: 'System rules',
      messages: [{ role: 'user', content: 'The question' }],
    });
  });

  it('uses the model and thinking setting the user chose', async () => {
    const fetch = reply(200, message('A draft.'));

    await requestDraft({ ...CALL, model: 'quality' }, { fetch });

    const body = JSON.parse(fetch.mock.calls[0]?.[1].body as string) as {
      model: string;
      thinking: unknown;
    };
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.thinking).toEqual({ type: 'between_tools' });
  });

  it('joins text blocks and ignores thinking blocks', async () => {
    const fetch = reply(200, {
      ...message(''),
      content: [
        { type: 'thinking', thinking: '', signature: 'x' },
        { type: 'text', text: 'First. ' },
        { type: 'text', text: 'Second.' },
      ],
    });

    expect(await requestDraft(CALL, { fetch })).toMatchObject({
      ok: true,
      text: 'First. Second.',
    });
  });

  it.each([
    [
      400,
      { error: { type: 'invalid_request_error', message: 'x' } },
      'rejected',
    ],
    [
      400,
      {
        error: {
          type: 'invalid_request_error',
          message: 'anthropic-workspace-id is required when authenticating',
        },
      },
      'workspace-required',
    ],
    [
      400,
      {
        error: {
          type: 'invalid_request_error',
          message: 'You have reached your specified workspace API usage limits',
        },
      },
      'spend-limit',
    ],
    [401, { error: { type: 'authentication_error' } }, 'invalid-key'],
    [402, { error: { type: 'billing_error' } }, 'billing'],
    [403, { error: { type: 'permission_error' } }, 'forbidden'],
    [404, { error: { type: 'not_found_error' } }, 'model-unavailable'],
    [413, { error: { type: 'request_too_large' } }, 'too-large'],
    [
      429,
      {
        error: {
          type: 'rate_limit_error',
          details: { error_code: 'enforced_spend_limit_reached' },
        },
      },
      'spend-limit',
    ],
    [500, { error: { type: 'api_error' } }, 'server'],
    [504, { error: { type: 'timeout_error' } }, 'server'],
    [529, { error: { type: 'overloaded_error' } }, 'overloaded'],
  ])('maps HTTP %i to a fixed failure', async (status, body, failure) => {
    const result = await requestDraft(CALL, { fetch: reply(status, body) });

    expect(result).toMatchObject({ ok: false, failure });
  });

  it('reports when to retry after a rate limit, without retrying', async () => {
    const fetch = reply(
      429,
      { error: { type: 'rate_limit_error' } },
      { 'retry-after': '12' },
    );

    expect(await requestDraft(CALL, { fetch })).toEqual({
      ok: false,
      failure: 'rate-limited',
      usage: null,
      retryAfterSeconds: 12,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('never returns the key or the API’s error text', async () => {
    const result = await requestDraft(CALL, {
      fetch: reply(401, {
        error: {
          type: 'authentication_error',
          message: `invalid x-api-key ${KEY}`,
        },
      }),
    });

    expect(JSON.stringify(result)).not.toContain(KEY);
    expect(JSON.stringify(result)).not.toContain('invalid x-api-key');
  });

  it.each([
    ['a refusal', message('No.', 'refusal'), 'refusal'],
    ['a cut-off answer', message('Half a', 'max_tokens'), 'truncated'],
    ['an empty answer', message('   '), 'empty'],
    ['not a message', { type: 'error' }, 'malformed'],
    ['missing usage', message('Text', 'end_turn', null), 'malformed'],
    [
      'a bad text block',
      { ...message(''), content: [{ type: 'text', text: 5 }] },
      'malformed',
    ],
  ])('treats %s as a failure', async (_, body, failure) => {
    expect(await requestDraft(CALL, { fetch: reply(200, body) })).toMatchObject(
      { ok: false, failure },
    );
  });

  it('keeps billed usage for a refusal', async () => {
    const result = await requestDraft(CALL, {
      fetch: reply(200, message('No.', 'refusal')),
    });

    expect(result).toMatchObject({
      usage: { inputTokens: 120, outputTokens: 40 },
    });
  });

  it('reports network failures', async () => {
    const fetch = vi.fn<Fetch>(() =>
      Promise.reject(new TypeError('Failed to fetch')),
    );

    expect(await requestDraft(CALL, { fetch })).toMatchObject({
      ok: false,
      failure: 'network',
    });
  });

  it('times out', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn<Fetch>(
      (_, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );

    const pending = requestDraft(CALL, { fetch, timeoutMs: 1000 });
    await vi.advanceTimersByTimeAsync(1000);

    expect(await pending).toMatchObject({ ok: false, failure: 'timeout' });
    vi.useRealTimers();
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    const fetch = vi.fn<Fetch>(
      (_, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );

    const pending = requestDraft(CALL, { fetch, signal: controller.signal });
    controller.abort();

    expect(await pending).toMatchObject({ ok: false, failure: 'cancelled' });
  });

  it('sends nothing when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort();
    const fetch = reply(200, message('A draft.'));

    expect(
      await requestDraft(CALL, { fetch, signal: controller.signal }),
    ).toMatchObject({ ok: false, failure: 'cancelled' });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('checkKey', () => {
  it('uses free token counting', async () => {
    const fetch = reply(200, { input_tokens: 8 });

    expect(await checkKey(KEY, { fetch })).toEqual({ ok: true });
    expect(fetch.mock.calls[0]?.[0]).toBe(
      'https://api.anthropic.com/v1/messages/count_tokens',
    );
  });

  it('reports a rejected key', async () => {
    expect(
      await checkKey(KEY, {
        fetch: reply(401, { error: { type: 'authentication_error' } }),
      }),
    ).toEqual({ ok: false, failure: 'invalid-key' });
  });
});
