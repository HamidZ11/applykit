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
import { autofillValuesFrom } from '@/autofill/profile-values';
import {
  educationRecords,
  fullProfile,
  gcseRecord,
  sampleValues,
} from '@/test/autofill-fixtures';
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

  it('groups the full list by topic, without empty groups', () => {
    click('Show all fields');

    const groups = [
      ...host.querySelectorAll<HTMLElement>(
        '[aria-label="Fields on this form"] section',
      ),
    ].map((section) => [
      section.getAttribute('aria-label'),
      section.querySelectorAll('li').length,
    ]);

    expect(groups.map(([name]) => name)).toEqual([
      'Personal information',
      'Contact details',
      'Address',
      'Employment',
      'Application questions',
    ]);
    expect(groups.every(([, count]) => Number(count) > 0)).toBe(true);
    // Every field appears exactly once.
    expect(groups.reduce((sum, [, count]) => sum + Number(count), 0)).toBe(15);
  });

  it('moves through the list in the order it is shown', () => {
    click('Show all fields');
    const shown = [
      ...host.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Fields on this form"] li > button',
      ),
    ].map((row) => row.textContent);

    const visited: (string | undefined)[] = [];
    shown.forEach(() => {
      press('ArrowDown');
      visited.push(
        host.querySelector<HTMLButtonElement>(
          '[aria-label="Fields on this form"] li > button[aria-pressed="true"]',
        )?.textContent,
      );
    });

    expect(visited).toEqual(shown);
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
      'ApplyKit does not know what this field asks for.',
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

describe('choosing a saved education record', () => {
  /** A degree, A levels and GCSEs: two records fit a school section. */
  function threeRecords(): AutofillValuesResponse {
    const profile = fullProfile();
    profile.education = [...educationRecords(), gcseRecord()];
    return ready(autofillValuesFrom(profile));
  }

  beforeEach(async () => {
    loadFixture('interactive-education.html');
    document.body.append(host);
    await open(threeRecords());
    click('Show all fields');
  });

  function field(id: string): HTMLInputElement {
    const element = document.getElementById(id);
    if (!element) throw new Error(`No #${id}`);
    return element as HTMLInputElement;
  }

  function radios(): HTMLInputElement[] {
    return [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  }

  async function choose(institution: string) {
    const radio = radios().find((r) =>
      r.closest('label')?.textContent.includes(institution),
    );
    if (!radio) throw new Error(`No record ${institution}`);
    await act(async () => {
      radio.click();
      await Promise.resolve();
    });
  }

  async function openChooser(row: RegExp) {
    click(row);
    click('Choose a saved record');
    await settle();
  }

  it('offers only the records that fit the section', async () => {
    await openChooser(/^School name/);

    expect(radios().map((r) => r.closest('label')?.textContent.trim())).toEqual(
      [
        'Example Sixth Form CollegeA levels · 2022–2024',
        'Example Grammar SchoolGCSEs · 2017–2022',
      ],
    );
    expect(document.activeElement?.closest('label')?.textContent).toContain(
      'Example Sixth Form College',
    );
    // Nothing is chosen for the user.
    expect(radios().some((r) => r.checked)).toBe(false);
    expect(button(/^Fill fields/).disabled).toBe(true);
  });

  it('previews exactly what the chosen record fills', async () => {
    await openChooser(/^School name/);
    await choose('Example Grammar School');

    const preview = host.querySelector('[aria-label="What this record fills"]');
    expect(
      [...(preview?.querySelectorAll('li') ?? [])].map((li) =>
        li.textContent.trim(),
      ),
    ).toEqual([
      'School nameWill fill',
      'QualificationWill fill',
      'Grades achievedNot in this record',
      'Year completedWill fill',
    ]);
    expect(button('Fill 3 fields').disabled).toBe(false);
    // Previewing changes nothing on the page.
    expect(field('sec-school').value).toBe('');
  });

  it('fills the section only after the user confirms', async () => {
    const needsYouBefore = tabCounts()[2];
    await openChooser(/^School name/);
    await choose('Example Sixth Form College');

    click('Fill 4 fields');
    await settle();

    expect(field('sec-school').value).toBe('Example Sixth Form College');
    expect(field('sec-qual').value).toBe('al');
    expect(field('sec-grades').value).toBe('A*AA');
    expect(field('sec-year').value).toBe('2024');
    // Other sections and fields are untouched.
    for (const id of ['e1-inst', 'e2-inst', 'first']) {
      expect(field(id).value, id).toBe('');
    }
    expect(fillFields).toHaveBeenCalledTimes(1);
    // The profile is read again before writing.
    expect(loadValues).toHaveBeenCalledTimes(2);
    expect(announcement()).toBe(
      'Filled 4 fields from the record you chose. Nothing was submitted.',
    );
    // Same mode, same row, now reported as filled by the user's choice.
    expect(dialog().dataset.mode).toBe('expanded');
    expect(button(/^School name/).getAttribute('aria-pressed')).toBe('true');
    expect(button(/^School name/).textContent).toContain(
      'Example Sixth Form College',
    );
    expect(dialog().textContent).toContain('Filled · your choice');
    expect(document.activeElement).toBe(button(/^School name/));
    expect(tabCounts()[2]).not.toBe(needsYouBefore);
    expect(radios()).toHaveLength(0);
  });

  it('cancels without filling anything', async () => {
    await openChooser(/^School name/);
    await choose('Example Sixth Form College');

    click('Cancel');

    expect(radios()).toHaveLength(0);
    expect(field('sec-school').value).toBe('');
    expect(fillFields).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button(/^School name/));
  });

  it('fills nothing when the section changed after the preview', async () => {
    await openChooser(/^Institution/);
    await choose('University of Example');
    document
      .querySelector('[aria-labelledby="edu-1"]')
      ?.insertAdjacentHTML(
        'beforeend',
        '<label>Grade <input id="e1-grade"></label>',
      );

    click(/^Fill \d fields?$/);
    await settle();

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'This section has changed since you chose. Nothing was filled; review it again.',
    );
    expect(field('e1-inst').value).toBe('');
    expect(fillFields).not.toHaveBeenCalled();
  });

  it('keeps focus in a row detail when the arrow keys are pressed', () => {
    click(/^School name/);
    const action = button('Choose a saved record');
    act(() => {
      action.focus();
    });

    act(() => {
      action.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });

    expect(action.isConnected).toBe(true);
    expect(document.activeElement).toBe(action);
    expect(button(/^School name/).getAttribute('aria-pressed')).toBe('true');
  });

  it('does not offer autofill for fields already filled from a choice', async () => {
    // Only the ambiguous school section is left to fill on this page.
    field('first').value = 'Typed';
    field('last').value = 'Typed';
    click('Rescan the page');
    await settle();
    expect(button(/^Nothing to fill/).disabled).toBe(true);
    await openChooser(/^School name/);
    await choose('Example Sixth Form College');

    click('Fill 4 fields');
    await settle();

    expect(button(/^Nothing to fill/).disabled).toBe(true);
    press('Enter');
    await settle();
    expect(fillFields).toHaveBeenCalledTimes(1);
  });

  it('cannot be cancelled while it is filling', async () => {
    await openChooser(/^School name/);
    await choose('Example Sixth Form College');
    let release: (value: AutofillValuesResponse) => void = () => undefined;
    loadValues.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );

    click('Fill 4 fields');

    expect(button('Cancel').disabled).toBe(true);
    release(threeRecords());
    await settle();
  });

  it('keeps the arrow keys, Enter and Escape for the chooser', async () => {
    await openChooser(/^School name/);
    const [first] = radios();
    if (!first) throw new Error('No radio');
    act(() => {
      first.focus();
    });

    for (const key of ['ArrowDown', 'Enter']) {
      act(() => {
        first.dispatchEvent(
          new KeyboardEvent('keydown', { key, bubbles: true }),
        );
      });
    }
    expect(button(/^School name/).getAttribute('aria-pressed')).toBe('true');
    expect(field('sec-school').value).toBe('');

    act(() => {
      first.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    expect(radios()).toHaveLength(0);
    expect(dialog().dataset.mode).toBe('expanded');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('never fills a section just because a record was previewed', async () => {
    await openChooser(/^School name/);
    await choose('Example Sixth Form College');
    click('Cancel');
    click('Show summary');

    await autofill();

    expect(field('sec-school').value).toBe('');
    expect(field('sec-grades').value).toBe('');
    // Autofill still fills what is certain.
    expect(field('first').value).toBe('Alex');
  });

  it('explains a dropdown without the saved value', () => {
    click(/^University/);

    expect(dialog().textContent).toContain(
      'Choose the right option on the page yourself.',
    );
    expect(findButton('Choose a saved record')).toBeUndefined();
  });

  it('keeps the compact mode free of choosers', () => {
    click('Show summary');

    expect(findButton('Choose a saved record')).toBeUndefined();
    expect(radios()).toHaveLength(0);
  });
});

describe('missing profile details', () => {
  it('links to the profile editor', async () => {
    const values = sampleValues();
    values.text.lastName = '';
    await open(ready(values));
    const sendMessage = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockResolvedValue(undefined);
    click('Show all fields');
    click(/^Last name/);

    click(/Edit your profile$/);

    expect(sendMessage).toHaveBeenCalledWith(OPEN_PROFILE);
  });
});

describe('custom dropdowns', () => {
  function withEducation(): AutofillValuesResponse {
    const profile = fullProfile();
    profile.education = educationRecords();
    return ready(autofillValuesFrom(profile));
  }

  beforeEach(async () => {
    loadFixture('custom-controls.html');
    document.body.append(host);
    Element.prototype.scrollIntoView = () => undefined;
    await open(withEducation());
  });

  function groups(): [string | null, number][] {
    return [
      ...host.querySelectorAll('[aria-label="Fields on this form"] section'),
    ].map((section) => [
      section.getAttribute('aria-label'),
      section.querySelectorAll('li').length,
    ]);
  }

  it('counts every question once, and only native fields as fillable', () => {
    expect(dialog().textContent).toContain('12 fields on this form');
    expect(dialog().textContent).toContain('Fill 3 fields from your profile');
    expect(dialog().textContent).toContain('Keep 1 entry you already typed');
    expect(dialog().textContent).toContain('Leave 8 for you');

    click('Show all fields');

    expect(tabCounts()).toEqual(['All 12', 'Fillable 4', 'Needs you 8']);
    expect(groups()).toEqual([
      ['Personal information', 2],
      ['Contact details', 2],
      ['Address', 1],
      ['Education', 5],
      ['Sensitive disclosures', 1],
      ['Other fields', 1],
    ]);
  });

  it('shows the saved value for a custom dropdown and goes to it', () => {
    click('Show all fields');
    click(/^Country of residence/);

    const text = dialog().textContent;
    expect(text).toContain('Choose it yourself on this page.');
    expect(text).toContain('From your saved profile');
    expect(text).toContain('United Kingdom');

    click('Go to field');

    // Custom controls are only scrolled to: focusing can open some widgets.
    expect(document.activeElement?.id).not.toBe('residence');
    expect(dialog().contains(document.activeElement)).toBe(true);
    expect(
      document.getElementById('residence')?.getAttribute('aria-expanded'),
    ).toBe('false');
    expect(dialog().textContent).toContain(
      'Scrolled to it. Click it on the page to choose.',
    );
  });

  it('says when several saved records could fit instead of guessing', () => {
    click('Show all fields');
    act(() => {
      [...host.querySelectorAll<HTMLButtonElement>('li > button')]
        .find((b) => b.textContent.startsWith('Institution'))
        ?.click();
    });

    expect(dialog().textContent).toContain(
      'Several of your saved education records could fit.',
    );
    expect(dialog().textContent).not.toContain('From your saved profile');
    expect(findButton('Choose a saved record')).toBeUndefined();
  });

  it('offers no saved information for a sensitive question', () => {
    click('Show all fields');
    click(/^Gender/);

    expect(dialog().textContent).not.toContain('From your saved profile');
    expect(dialog().textContent).toContain('Go to field');
  });

  it('reports a field that has left the page', () => {
    click('Show all fields');
    click(/^Country of residence/);
    document.getElementById('residence')?.remove();

    click('Go to field');

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'This field is no longer on the page. Rescan to update the list.',
    );
  });

  it('lists a question that appeared, after a rescan', async () => {
    document
      .getElementById('conditional')
      ?.insertAdjacentHTML(
        'beforeend',
        '<span id="source-label">How did you hear about us?</span><div id="source" role="combobox" tabindex="0" aria-labelledby="source-label"></div>',
      );
    expect(dialog().textContent).toContain('12 fields on this form');

    click('Rescan the page');
    await settle();

    expect(dialog().textContent).toContain('13 fields on this form');
  });

  it('steps to custom dropdowns with Next field and never fills them', async () => {
    await autofill();
    click(/^Go to first/);

    expect(button(/^Country of residence/).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(document.getElementById('residence')?.textContent.trim()).toBe(
      'Select…',
    );
    expect(announcement()).toContain('Filled 3 fields');
  });

  it('keeps compact rows free of saved values', async () => {
    await autofill();

    expect(dialog().textContent).not.toContain('United Kingdom');
    expect(dialog().textContent).not.toContain('From your saved profile');
  });
});
