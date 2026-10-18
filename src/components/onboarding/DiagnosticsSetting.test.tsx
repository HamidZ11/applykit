import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browserSettingsStore } from '@/storage/settings-store';
import { DiagnosticsSetting } from './DiagnosticsSetting';

let root: Root;
let host: HTMLElement;

async function render() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<DiagnosticsSetting />);
    await Promise.resolve();
  });
}

async function flush() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function checkbox(): HTMLInputElement {
  const found = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!found) throw new Error('No checkbox');
  return found;
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  fakeBrowser.reset();
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
});

describe('DiagnosticsSetting', () => {
  it('is an unticked checkbox with a label and a description', async () => {
    await render();

    const box = checkbox();
    expect(box.checked).toBe(false);
    expect(box.closest('label')?.textContent.trim()).toBe(
      'Developer diagnostics',
    );
    const hint = box.getAttribute('aria-describedby');
    expect(hint && document.getElementById(hint)?.textContent).toBe(
      'Shows in the panel how ApplyKit recognised each field.',
    );
  });

  it('saves the setting at once and shows it again later', async () => {
    await render();

    act(() => {
      checkbox().click();
    });
    await flush();
    expect(await browserSettingsStore.loadDiagnostics()).toBe(true);

    act(() => {
      root.unmount();
    });
    await render();
    await flush();
    expect(checkbox().checked).toBe(true);
  });

  it('goes back to what is saved when saving fails', async () => {
    await render();
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('quota'),
    );

    act(() => {
      checkbox().click();
    });
    await flush();

    expect(checkbox().checked).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Could not save this setting. Try again.',
    );
  });
});
