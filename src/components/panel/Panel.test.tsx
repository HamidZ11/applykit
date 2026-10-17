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
import type { AutofillValues } from '@/autofill/fields';
import { fillFields } from '@/autofill/fill';
import { scanFields } from '@/autofill/scan';
import { OPEN_PROFILE, type AutofillValuesResponse } from '@/messages';
import { sampleValues } from '@/test/autofill-fixtures';
import { loadFixture } from '@/test/load-fixture';
import { Panel } from './Panel';

// Count real engine calls without changing what the engine does.
vi.mock('@/autofill/fill', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/autofill/fill')>();
  return { ...actual, fillFields: vi.fn(actual.fillFields) };
});
vi.mock('@/autofill/scan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/autofill/scan')>();
  return { ...actual, scanFields: vi.fn(actual.scanFields) };
});

const TYPED_EMAIL = 'a.sample@example.org';

let root: Root;
let host: HTMLElement;
let onClose: () => void;
/** What the background would answer; tests change it to simulate edits. */
let profile: AutofillValuesResponse;
const loadValues = vi.fn(() => Promise.resolve(profile));

function ready(
  values: AutofillValues = sampleValues(),
): AutofillValuesResponse {
  return { status: 'ready', values };
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom implements neither; the panel only uses them to show fields.
  Element.prototype.scrollIntoView = () => undefined;
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query }) as MediaQueryList;
});

async function open(response: AutofillValuesResponse = ready()) {
  profile = response;
  root = createRoot(host);
  act(() => {
    root.render(<Panel onClose={onClose} loadValues={loadValues} />);
  });
  await settle();
}

/** Lets pending profile reads, fills and page checks finish. */
async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  fakeBrowser.reset();
  loadFixture('job-application.html');
  input('email').value = TYPED_EMAIL;
  host = document.createElement('div');
  document.body.append(host);
  onClose = vi.fn();
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

function findButton(name: string | RegExp): HTMLButtonElement | undefined {
  return [...host.querySelectorAll('button')].find((candidate) => {
    const label =
      candidate.getAttribute('aria-label') ?? candidate.textContent.trim();
    return typeof name === 'string' ? label === name : name.test(label);
  });
}

/** A button by accessible name: aria-label, else its text. */
function button(name: string | RegExp): HTMLButtonElement {
  const match = findButton(name);
  if (!match) throw new Error(`No button ${String(name)}`);
  return match;
}

function click(name: string | RegExp) {
  act(() => {
    button(name).click();
  });
}

async function autofill() {
  click(/^Autofill/);
  await settle();
}

function press(key: string) {
  act(() => {
    dialog().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
  });
}

function announcement(): string {
  return host.querySelector('[role="status"]')?.textContent ?? '';
}

function tabCounts(): string[] {
  return [...host.querySelectorAll('[role="tab"]')].map((tab) =>
    tab.textContent.replace(/(\D)(\d)/, '$1 $2').trim(),
  );
}

describe('Panel with a saved profile', () => {
  beforeEach(async () => {
    await open();
  });

  it('opens compact with the plan, having scanned once and filled nothing', () => {
    expect(dialog().dataset.mode).toBe('compact');
    expect(dialog().textContent).toContain('Fill 6 fields from your profile');
    expect(dialog().textContent).toContain('Keep 1 entry you already typed');
    expect(dialog().textContent).toContain('Leave 8 for you');
    expect(dialog().textContent).toContain('Your saved profile');
    expect(scanFields).toHaveBeenCalledTimes(1);
    expect(loadValues).toHaveBeenCalledTimes(1);
    expect(fillFields).not.toHaveBeenCalled();
    expect(input('given').value).toBe('');
  });

  it('fills from the saved profile and reports what happened', async () => {
    await autofill();

    expect(input('given').value).toBe('Alex');
    expect(input('family').value).toBe('Sample');
    expect(input('preferred').value).toBe('Al');
    expect(input('phone').value).toBe('+44 20 7946 0000');
    expect(input('email').value).toBe(TYPED_EMAIL);
    expect(dialog().textContent).toContain('Filled 6 fields');
    expect(dialog().textContent).toContain('Kept 1 entry you typed');
    expect(dialog().textContent).toContain('8 left for you');
    expect(announcement()).toBe(
      'Autofill finished. Filled 6 fields, kept 1 existing entry, 8 fields need you. Nothing was submitted.',
    );
  });

  it('never shows personal values in compact mode', async () => {
    expect(dialog().textContent).not.toMatch(/Alex|Sample|example\.(com|org)/);

    await autofill();

    expect(dialog().textContent).not.toMatch(/Alex|Sample|example\.(com|org)/);
  });

  it('shows the same counts in both modes', async () => {
    click('Show all fields');
    expect(tabCounts()).toEqual(['All 15', 'Fillable 7', 'Needs you 8']);

    await autofill();

    expect(tabCounts()).toEqual(['All 15', 'Done 7', 'Needs you 8']);
    click('Show summary');
    expect(dialog().textContent).toContain('Done · 7');
    expect(dialog().textContent).toContain('8 left for you');
  });

  it('explains each field with its evidence in expanded mode', () => {
    click('Show all fields');
    click(/^First name/);

    const text = dialog().textContent;
    expect(text).toContain('ApplyKit will fill this with your first name.');
    expect(text).toContain('matched as first name');
    expect(text).toContain('autocomplete="given-name"');
    expect(text).toContain('label “First name *”');
    expect(button(/^First name/).textContent).toContain('Alex');
  });

  it('keeps results and values through repeated mode switches', async () => {
    await autofill();
    const announced = announcement();

    for (let i = 0; i < 5; i++) {
      click('Show all fields');
      expect(dialog().dataset.mode).toBe('expanded');
      click('Show summary');
      expect(dialog().dataset.mode).toBe('compact');
    }

    expect(fillFields).toHaveBeenCalledTimes(1);
    // Once on open and once before autofill; switching modes never rescans.
    expect(scanFields).toHaveBeenCalledTimes(2);
    expect(announcement()).toBe(announced);
    expect(input('given').value).toBe('Alex');
  });

  it('fills once even when asked repeatedly', async () => {
    act(() => {
      button(/^Autofill/).click();
    });
    press('Enter');
    act(() => {
      findButton(/^Autofill/)?.click();
    });
    await settle();

    expect(fillFields).toHaveBeenCalledTimes(1);
    expect(loadValues).toHaveBeenCalledTimes(2);
  });

  it('shares the current field between modes', async () => {
    await autofill();
    click(/^Go to first/);
    expect(button(/^Current location/).getAttribute('aria-pressed')).toBe(
      'true',
    );

    click('Show all fields');
    expect(button(/^Current location/).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(dialog().textContent).toContain(
      'The page’s labels disagree (town or city or country), so ApplyKit leaves it to you.',
    );

    click(/^Next field/);
    expect(button(/^Résumé/).getAttribute('aria-pressed')).toBe('true');

    click('Show summary');
    expect(button(/^Résumé/).getAttribute('aria-pressed')).toBe('true');
    expect(button(/^Next field/)).toBeTruthy();
  });

  it('opens the full list on the filter a plan line refers to', () => {
    click(/^Leave 8 for you/);

    expect(dialog().dataset.mode).toBe('expanded');
    const selectedTab = host.querySelector(
      '[role="tab"][aria-selected="true"]',
    );
    expect(selectedTab?.textContent).toMatch(/^Needs you\s*8$/);
    const rows = host.querySelectorAll('[aria-label="Fields on this form"] li');
    expect(rows).toHaveLength(8);
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

  it('runs the primary action from the keyboard in either mode', async () => {
    press('Enter');
    await settle();
    expect(fillFields).toHaveBeenCalledTimes(1);

    click('Show all fields');
    press('Enter');
    expect(button(/^Current location/).getAttribute('aria-pressed')).toBe(
      'true',
    );
    press('ArrowDown');
    expect(button(/^Résumé/).getAttribute('aria-pressed')).toBe('true');
    expect(fillFields).toHaveBeenCalledTimes(1);
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
    const planLine = button(/^Leave 8 for you/);
    planLine.focus();

    act(() => {
      planLine.click();
    });

    expect(planLine.isConnected).toBe(false);
    expect(document.activeElement).toBe(dialog());
  });

  it('rescans on request without leaving the current mode', async () => {
    await autofill();
    click('Show all fields');

    click('Rescan the page');
    await settle();

    expect(dialog().dataset.mode).toBe('expanded');
    expect(announcement()).toBe('');
    expect(button(/^Nothing to fill/).disabled).toBe(true);
    expect(fillFields).toHaveBeenCalledTimes(1);
  });

  it('links to the profile from the header', () => {
    const sendMessage = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockResolvedValue(undefined);

    click('Open your profile');

    expect(sendMessage).toHaveBeenCalledWith(OPEN_PROFILE);
  });
});

describe('Panel profile lifecycle', () => {
  function edited(firstName: string): AutofillValuesResponse {
    const values = sampleValues();
    values.text.firstName = firstName;
    return ready(values);
  }

  it('fills from the latest saved profile, not the copy read on open', async () => {
    await open();
    profile = edited('Sam');

    await autofill();

    expect(input('given').value).toBe('Sam');
  });

  it('shows the latest profile after an explicit rescan', async () => {
    await open(edited('Alex'));
    click('Show all fields');
    expect(button(/^First name/).textContent).toContain('Alex');

    profile = edited('Sam');
    click('Rescan the page');
    await settle();

    expect(loadValues).toHaveBeenCalledTimes(2);
    expect(button(/^First name/).textContent).toContain('Sam');
  });

  it('never changes the page when the profile changes', async () => {
    await open();
    await autofill();

    profile = edited('Sam');
    click('Rescan the page');
    await settle();

    expect(input('given').value).toBe('Alex');
    expect(fillFields).toHaveBeenCalledTimes(1);
  });

  it('stops without filling when the profile was removed meanwhile', async () => {
    await open();
    profile = { status: 'missing' };

    await autofill();

    expect(fillFields).not.toHaveBeenCalled();
    expect(input('given').value).toBe('');
    expect(dialog().textContent).toContain('Set up your profile to autofill');
  });

  it('ignores a slow earlier read that arrives after a newer one', async () => {
    let resolveFirst: (value: AutofillValuesResponse) => void = () => undefined;
    loadValues.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    await open(edited('Sam'));
    click('Rescan the page');
    await settle();

    resolveFirst(edited('Old'));
    await settle();
    click('Show all fields');

    expect(button(/^First name/).textContent).toContain('Sam');
  });
});

describe('Panel without a usable profile', () => {
  it('offers profile setup and never fills', async () => {
    await open({ status: 'missing' });
    const sendMessage = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockResolvedValue(undefined);

    expect(dialog().textContent).toContain('Set up your profile to autofill');
    expect(dialog().textContent).toContain(
      'It recognised 7 fields it could fill here.',
    );
    expect(dialog().textContent).toContain('No profile saved');
    expect(findButton(/^Autofill/)).toBeUndefined();

    press('Enter');
    await settle();
    expect(fillFields).not.toHaveBeenCalled();
    expect(input('given').value).toBe('');

    act(() => {
      host
        .querySelector('footer button:last-child')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(sendMessage).toHaveBeenCalledWith(OPEN_PROFILE);
  });

  it('marks recognised fields as needing a profile in expanded mode', async () => {
    await open({ status: 'missing' });
    click('Show all fields');
    click(/^First name/);

    expect(dialog().textContent).toContain(
      'Set up your profile so ApplyKit can fill this.',
    );
  });

  it('asks the user to check a profile that cannot be read', async () => {
    await open({ status: 'invalid' });

    expect(dialog().textContent).toContain('Your saved profile needs checking');
    expect(findButton(/^Autofill/)).toBeUndefined();
    expect(host.querySelector('footer button:last-child')?.textContent).toBe(
      'Open your profile',
    );
  });

  it('retries after a storage error and then offers autofill', async () => {
    await open({ status: 'error' });
    expect(dialog().textContent).toContain('Your profile could not be read');

    profile = ready();
    click('Try again');
    await settle();

    expect(button(/^Autofill/).disabled).toBe(false);
    expect(dialog().textContent).toContain('Fill 6 fields from your profile');
  });
});
