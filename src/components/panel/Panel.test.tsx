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
import { autofill } from '@/autofill/fill';
import { scanFields } from '@/autofill/scan';
import { loadFixture } from '@/test/load-fixture';
import { validProfile } from '@/test/profile-fixtures';
import { OPEN_PROFILE } from '@/messages';
import { Panel } from './Panel';

// Count real engine calls without changing what the engine does.
vi.mock('@/autofill/fill', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/autofill/fill')>();
  return { ...actual, autofill: vi.fn(actual.autofill) };
});
vi.mock('@/autofill/scan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/autofill/scan')>();
  return { ...actual, scanFields: vi.fn(actual.scanFields) };
});

const TYPED_EMAIL = 'a.sample@example.org';

let root: Root;
let host: HTMLElement;
let onClose: () => void;

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom implements neither; the panel only uses them to show fields.
  Element.prototype.scrollIntoView = () => undefined;
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query }) as MediaQueryList;
});

beforeEach(() => {
  fakeBrowser.reset();
  loadFixture('job-application.html');
  input('email').value = TYPED_EMAIL;
  host = document.createElement('div');
  document.body.append(host);
  onClose = vi.fn();
  root = createRoot(host);
  act(() => {
    root.render(<Panel onClose={onClose} />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
});

function input(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`No #${id}`);
  return element;
}

function dialog(): HTMLElement {
  const found = host.querySelectorAll<HTMLElement>('[role="dialog"]');
  expect(found).toHaveLength(1);
  const [first] = found;
  if (!first) throw new Error('No dialog');
  return first;
}

/** A button by accessible name: aria-label, else its text. */
function button(name: string | RegExp): HTMLButtonElement {
  const match = [...host.querySelectorAll('button')].find((candidate) => {
    const label =
      candidate.getAttribute('aria-label') ?? candidate.textContent.trim();
    return typeof name === 'string' ? label === name : name.test(label);
  });
  if (!match) throw new Error(`No button ${String(name)}`);
  return match;
}

function click(name: string | RegExp) {
  act(() => {
    button(name).click();
  });
}

function press(key: string) {
  act(() => {
    dialog().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
  });
}

function status(): string {
  return host.querySelector('[role="status"]')?.textContent ?? '';
}

describe('Panel', () => {
  it('opens compact with the plan, having scanned once and filled nothing', () => {
    expect(dialog().dataset.mode).toBe('compact');
    expect(dialog().textContent).toContain('Fill 2 fields from your profile');
    expect(dialog().textContent).toContain('Keep 1 entry you already typed');
    expect(dialog().textContent).toContain('Leave 12 for you');
    expect(scanFields).toHaveBeenCalledTimes(1);
    expect(autofill).not.toHaveBeenCalled();
    expect(input('given').value).toBe('');
  });

  it('keeps results and values through repeated mode switches', () => {
    click(/^Autofill/);
    const announced = status();

    for (let i = 0; i < 5; i++) {
      click('Show all fields');
      expect(dialog().dataset.mode).toBe('expanded');
      click('Show summary');
      expect(dialog().dataset.mode).toBe('compact');
    }

    expect(autofill).toHaveBeenCalledTimes(1);
    // Once on open and once after autofill; switching modes never rescans.
    expect(scanFields).toHaveBeenCalledTimes(2);
    expect(status()).toBe(announced);
    expect(announced).toBe(
      'Autofill complete. Filled 2 fields, kept 1 existing entry, 12 fields need you.',
    );
    expect(input('given').value).toBe('Alex');
    expect(input('family').value).toBe('Sample');
    expect(input('email').value).toBe(TYPED_EMAIL);
    expect(dialog().textContent).toContain('Filled 2 fields');
  });

  it('shares the current field between modes', () => {
    click(/^Autofill/);
    click(/^Go to first/);
    expect(button(/^Phone/).getAttribute('aria-pressed')).toBe('true');

    click('Show all fields');
    expect(button(/^Phone/).getAttribute('aria-pressed')).toBe('true');
    expect(dialog().textContent).toContain(
      'ApplyKit does not know what this field asks for yet.',
    );

    click(/^Next field/);
    expect(button(/^Current location/).getAttribute('aria-pressed')).toBe(
      'true',
    );

    click('Show summary');
    expect(button(/^Current location/).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(button(/^Next field/)).toBeTruthy();
  });

  it('opens the full list on the filter a plan line refers to', () => {
    click(/^Leave 12 for you/);

    expect(dialog().dataset.mode).toBe('expanded');
    const selectedTab = host.querySelector(
      '[role="tab"][aria-selected="true"]',
    );
    expect(selectedTab?.textContent).toMatch(/^Needs you\s*12$/);
    const rows = host.querySelectorAll('[aria-label="Fields on this form"] li');
    expect(rows).toHaveLength(12);
  });

  it('remembers the filter across collapse and expand', () => {
    click('Show all fields');
    click(/^Fillable/);
    click('Show summary');
    click('Show all fields');

    const selectedTab = host.querySelector(
      '[role="tab"][aria-selected="true"]',
    );
    expect(selectedTab?.textContent).toMatch(/^Fillable/);
  });

  it('runs the primary action from the keyboard in either mode', () => {
    press('Enter');
    expect(autofill).toHaveBeenCalledTimes(1);

    click('Show all fields');
    press('Enter');
    expect(button(/^Phone/).getAttribute('aria-pressed')).toBe('true');
    press('ArrowDown');
    expect(button(/^Current location/).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(autofill).toHaveBeenCalledTimes(1);
  });

  it('Escape collapses the expanded mode, then closes', () => {
    click('Show all fields');

    press('Escape');
    expect(dialog().dataset.mode).toBe('compact');
    expect(onClose).not.toHaveBeenCalled();

    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps focus in the panel when a mode switch removes the focused control', () => {
    const planLine = button(/^Leave 12 for you/);
    planLine.focus();

    act(() => {
      planLine.click();
    });

    expect(planLine.isConnected).toBe(false);
    expect(document.activeElement).toBe(dialog());
  });

  it('rescans on request without leaving the current mode', () => {
    click(/^Autofill/);
    click('Show all fields');

    click('Rescan the page');

    expect(dialog().dataset.mode).toBe('expanded');
    expect(status()).toBe('');
    expect(button(/^Nothing to fill/).disabled).toBe(true);
    expect(autofill).toHaveBeenCalledTimes(1);
  });
});

describe('profile access', () => {
  async function settle() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  it('offers profile setup when no profile is saved', async () => {
    await settle();
    const sendMessage = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockResolvedValue(undefined);

    expect(dialog().textContent).toContain('No profile saved yet.');
    click('Set up your profile');

    expect(sendMessage).toHaveBeenCalledWith(OPEN_PROFILE);
  });

  it('only links to the profile once one is saved', async () => {
    act(() => {
      root.unmount();
    });
    await fakeBrowser.storage.local.set({ profile: validProfile() });
    root = createRoot(host);
    act(() => {
      root.render(<Panel onClose={onClose} />);
    });
    await settle();

    expect(dialog().textContent).not.toContain('No profile saved yet.');
    expect(button('Open your profile')).toBeTruthy();
  });
});
