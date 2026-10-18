import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { browserProfileStore } from '@/storage/profile-store';
import { validProfile } from '@/test/profile-fixtures';
import { OnboardingApp } from './OnboardingApp';

/**
 * Two profile pages over the same browser storage, as two tabs would be.
 * (Real tabs share storage through the browser; here both use the fake
 * browser's storage.local.)
 */

interface Tab {
  host: HTMLElement;
  root: Root;
}

let tabs: Tab[] = [];

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  fakeBrowser.reset();
});

afterEach(() => {
  for (const tab of tabs) {
    act(() => {
      tab.root.unmount();
    });
    tab.host.remove();
  }
  tabs = [];
});

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function openTab(clock: () => Date): Promise<Tab> {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  act(() => {
    root.render(<OnboardingApp store={browserProfileStore} now={clock} />);
  });
  await settle();
  const tab = { host, root };
  tabs.push(tab);
  return tab;
}

async function click(tab: Tab, name: string) {
  const button = [...tab.host.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name,
  );
  if (!button) throw new Error(`No button "${name}"`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await settle();
}

function typeInto(tab: Tab, label: string, value: string) {
  const labelElement = [...tab.host.querySelectorAll('label')].find(
    (l) => l.textContent.replace(/Optional$/, '').trim() === label,
  );
  const input = labelElement?.htmlFor
    ? tab.host.querySelector<HTMLInputElement>(
        `#${CSS.escape(labelElement.htmlFor)}`,
      )
    : null;
  if (!input) throw new Error(`No field "${label}"`);
  act(() => {
    Reflect.set(HTMLInputElement.prototype, 'value', value, input);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function editPreferredName(tab: Tab, value: string) {
  await click(tab, 'Edit personal details');
  typeInto(tab, 'Preferred name', value);
  for (let i = 0; i < 4; i++) await click(tab, 'Continue');
  await click(tab, 'Save changes');
}

describe('two tabs editing one profile', () => {
  it('reports a conflict instead of overwriting the other tab’s save', async () => {
    await browserProfileStore.save(
      validProfile('2026-10-17T12:00:00.000Z'),
      null,
    );
    const a = await openTab(() => new Date('2026-10-18T09:00:00.000Z'));
    const b = await openTab(() => new Date('2026-10-18T09:05:00.000Z'));

    await editPreferredName(a, 'Al');
    await editPreferredName(b, 'Lex');

    const stored = await browserProfileStore.load();
    expect(stored).toMatchObject({
      status: 'loaded',
      profile: { personal: { preferredName: 'Al' } },
    });
    expect(b.host.textContent).toContain('saved in another tab');
    expect(b.host.textContent).toContain('Lex');
  });
});
