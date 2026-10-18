import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AiStatus } from '@/ai/connection';
import type { AiSettingsClient } from '@/ai/settings-client';
import { setInputValue } from '@/autofill/fill';
import { AiSettingsView } from './AiSettingsView';

const KEY = 'sk-ant-test-not-a-real-key-0000000000';

const OFF: AiStatus = {
  connected: false,
  remembered: false,
  keyHint: null,
  permission: false,
  model: 'fast',
  dailyLimit: 50,
  requestsToday: 0,
  estimatedCostToday: 0,
};

const ON: AiStatus = {
  ...OFF,
  connected: true,
  permission: true,
  keyHint: '0000',
  requestsToday: 3,
  estimatedCostToday: 0.0009,
};

let root: Root;
let host: HTMLElement;

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function fakeClient(
  status: AiStatus = OFF,
  over: Partial<AiSettingsClient> = {},
) {
  let current = status;
  const client = {
    supported: vi.fn(() => true),
    status: vi.fn(() => Promise.resolve(current)),
    requestPermission: vi.fn(() => Promise.resolve(true)),
    connect: vi.fn((_key: string, remember: boolean) => {
      current = { ...ON, remembered: remember, requestsToday: 0 };
      return Promise.resolve({ ok: true as const, status: current });
    }),
    disconnect: vi.fn(() => {
      current = OFF;
      return Promise.resolve(true);
    }),
    saveSettings: vi.fn(() => Promise.resolve(true)),
    ...over,
  };
  return client;
}

async function flush() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render(client: AiSettingsClient) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(<AiSettingsView client={client} />);
  });
  await flush();
}

function button(name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(
    (b) => b.textContent.trim() === name,
  );
  if (!found) throw new Error(`No button ${name}`);
  return found;
}

function keyInput(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('input[type="password"]');
  if (!input) throw new Error('No key input');
  return input;
}

async function typeKey(value = KEY) {
  act(() => {
    setInputValue(keyInput(), value);
  });
  await flush();
}

async function submit() {
  act(() => {
    host.querySelector('form')?.requestSubmit();
  });
  await flush();
}

describe('AiSettingsView', () => {
  it('explains the feature and starts disconnected', async () => {
    await render(fakeClient());

    expect(host.querySelector('h1')?.textContent).toBe('AI Assistant');
    expect(host.textContent).toContain(
      'Connect your own Anthropic API key to draft answers using information you choose to share.',
    );
    expect(keyInput().autocomplete).toBe('off');
    expect(button('Connect').disabled).toBe(true);
    expect(
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked,
    ).toBe(false);
  });

  it('asks for the permission, then connects for the session', async () => {
    const client = fakeClient();
    await render(client);
    await typeKey();

    await submit();

    expect(client.requestPermission).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledWith(KEY, false);
    expect(host.textContent).toContain('Key ending 0000');
    expect(host.textContent).toContain('Kept until the browser closes');
    expect(host.textContent).not.toContain(KEY);
    expect(host.querySelector('input[type="password"]')).toBeNull();
  });

  it('says a remembered key is stored without encryption', async () => {
    const client = fakeClient();
    await render(client);
    await typeKey();
    act(() => {
      host.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click();
    });

    await submit();

    expect(client.connect).toHaveBeenCalledWith(KEY, true);
    expect(host.textContent).toContain(
      'Remembered on this device, stored without encryption',
    );
  });

  it('sends nothing when the permission is refused', async () => {
    const client = fakeClient(OFF, {
      requestPermission: vi.fn(() => Promise.resolve(false)),
    });
    await render(client);
    await typeKey();

    await submit();

    expect(client.connect).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'needs your permission to reach api.anthropic.com',
    );
    expect(keyInput().value).toBe(KEY);
  });

  it('explains a rejected key and keeps it for correction', async () => {
    const client = fakeClient(OFF, {
      connect: vi.fn(() =>
        Promise.resolve({
          ok: false as const,
          failure: 'invalid-key' as const,
        }),
      ),
    });
    await render(client);
    await typeKey();

    await submit();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Anthropic did not accept this key.',
    );
    expect(host.textContent).not.toContain('Key ending');
  });

  it('changes the model and a lower daily limit', async () => {
    const client = fakeClient(ON);
    await render(client);
    expect(host.textContent).toContain('3 of 50 used today');

    act(() => {
      host
        .querySelectorAll<HTMLInputElement>('input[type="radio"]')[1]
        ?.click();
    });
    await flush();
    expect(client.saveSettings).toHaveBeenLastCalledWith({
      model: 'quality',
      dailyLimit: 50,
    });

    const limit = host.querySelector<HTMLInputElement>('input[type="number"]');
    if (!limit) throw new Error('No limit');
    act(() => {
      setInputValue(limit, '10');
    });
    act(() => {
      limit.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await flush();
    expect(client.saveSettings).toHaveBeenLastCalledWith({
      model: 'quality',
      dailyLimit: 10,
    });
  });

  it('refuses a limit above 50', async () => {
    const client = fakeClient(ON);
    await render(client);
    const limit = host.querySelector<HTMLInputElement>('input[type="number"]');
    if (!limit) throw new Error('No limit');

    act(() => {
      setInputValue(limit, '500');
    });
    act(() => {
      limit.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    });
    await flush();

    expect(client.saveSettings).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Choose a limit from 1 to 50.',
    );
  });

  it('disconnects, removing the key', async () => {
    const client = fakeClient(ON);
    await render(client);

    act(() => {
      button('Disconnect').click();
    });
    await flush();

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Disconnected.');
    expect(keyInput()).toBeDefined();
  });

  it('asks to connect again when the permission was removed', async () => {
    await render(fakeClient({ ...ON, permission: false }));

    expect(host.textContent).toContain(
      'Access to api.anthropic.com was removed',
    );
    expect(keyInput()).toBeDefined();
  });

  it('can remove a key whose permission was removed', async () => {
    const client = fakeClient({ ...ON, permission: false, remembered: true });
    await render(client);

    act(() => {
      button('Remove key').click();
    });
    await flush();

    expect(client.disconnect).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(
      'Your key was removed from this browser.',
    );
    expect(host.textContent).not.toContain('Remove key');
  });

  it('explains when the browser cannot use AI drafting', async () => {
    const client = fakeClient(OFF, { supported: vi.fn(() => false) });
    await render(client);

    expect(host.textContent).toContain(
      'AI drafting is not available in this browser.',
    );
    expect(client.status).not.toHaveBeenCalled();
  });
});
