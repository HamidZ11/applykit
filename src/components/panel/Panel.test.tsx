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
  type Mock,
} from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { AutofillValues } from '@/autofill/fields';
import { fillFields, setInputValue } from '@/autofill/fill';
import { scanFields } from '@/autofill/scan';
import {
  GET_PANEL_SETTINGS,
  OPEN_PROFILE,
  type AutofillValuesResponse,
} from '@/messages';
import { autofillValuesFrom } from '@/autofill/profile-values';
import {
  educationRecords,
  employmentRecords,
  fullProfile,
  gcseRecord,
  sampleValues,
} from '@/test/autofill-fixtures';
import { emptyAnswers } from '@/domain/application-answers';
import type { DiversityPreferences } from '@/domain/diversity';
import type {
  AiDraftResponse,
  AiPrepareResponse,
  DiversityRequest,
  SharedItem,
  ResolveDiversityResponse,
} from '@/messages';
import type { Drafting } from './usePanel';
import {
  loadDiversityStatus,
  resolveDiversity,
} from '@/storage/diversity-source';
import { savedDiversity } from '@/test/diversity-fixtures';
import { savedAnswers } from '@/test/answer-fixtures';
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

  it('explains each field without the engine’s workings', () => {
    click('Show all fields');
    click(/^First name/);

    const text = dialog().textContent;
    expect(text).toContain('ApplyKit will fill this with your first name.');
    expect(text).toContain('Will fill');
    expect(button(/^First name/).textContent).toContain('Alex');
    expect(text).not.toContain('matched as');
    expect(text).not.toContain('autocomplete=');
    expect(
      host.querySelector('[aria-label="Developer diagnostics"]'),
    ).toBeNull();
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

describe('choosing a saved job', () => {
  function twoJobs(): AutofillValuesResponse {
    const profile = fullProfile();
    profile.employment = employmentRecords();
    return ready(autofillValuesFrom(profile));
  }

  beforeEach(async () => {
    loadFixture('employment-application.html');
    document.body.append(host);
    await open(twoJobs());
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

  async function choose(employer: string) {
    const radio = radios().find((r) =>
      r.closest('label')?.textContent.includes(employer),
    );
    if (!radio) throw new Error(`No job ${employer}`);
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

  function previewRows(): string[] {
    const preview = host.querySelector('[aria-label="What this record fills"]');
    return [...(preview?.querySelectorAll('li') ?? [])].map((li) =>
      li.textContent.trim(),
    );
  }

  it('groups the jobs under Employment', () => {
    expect(dialog().textContent).toContain('Employment');
    expect(button(/^Company name/).textContent).toContain(
      'Several records fit',
    );
  });

  it('offers both jobs with their titles and years, choosing neither', async () => {
    await openChooser(/^Company name/);

    expect(radios().map((r) => r.closest('label')?.textContent.trim())).toEqual(
      [
        'Example Testing ServicesTest Centre Associate · 2025–Present',
        'Example LogisticsWarehouse Operative · 2024–2025',
      ],
    );
    expect(radios().some((r) => r.checked)).toBe(false);
    expect(button(/^Fill fields/).disabled).toBe(true);
    // Descriptions are not shown to tell jobs apart.
    expect(
      host.querySelector('fieldset')?.textContent.includes('invigilated'),
    ).toBe(false);
  });

  it('previews and fills only the chosen section after confirming', async () => {
    await openChooser(/^Company name/);
    await choose('Example Logistics');

    expect(previewRows()).toEqual([
      'Company nameWill fill',
      'Position heldWill fill',
      'FromWill fill',
      'ToWill fill',
      'ResponsibilitiesWill fill',
    ]);
    expect(field('j1-company').value).toBe('');

    click('Fill 5 fields');
    await settle();

    expect(field('j1-company').value).toBe('Example Logistics');
    expect(field('j1-from').value).toBe('2024-01');
    expect(field('j2-employer').value).toBe('');
    expect(fillFields).toHaveBeenCalledTimes(1);
    expect(loadValues).toHaveBeenCalledTimes(2);
    expect(announcement()).toBe(
      'Filled 5 fields from the record you chose. Nothing was submitted.',
    );
    expect(dialog().textContent).toContain('Filled · your choice');
    expect(document.activeElement).toBe(button(/^Company name/));
  });

  it('says what a current job leaves to the user before filling', async () => {
    await openChooser(/^EmployerSeveral/);
    await choose('Example Testing Services');

    expect(previewRows()).toEqual([
      'EmployerWill fill',
      'Start dateSaved value does not fit',
      'End dateAnswer yourself',
      'Employment typeChoose on the page',
      'Job titleAlready filled',
    ]);
    expect(button('Fill 1 field').disabled).toBe(false);
  });

  it('cancels with Escape without filling or closing the panel', async () => {
    await openChooser(/^Company name/);
    await choose('Example Logistics');
    const [first] = radios();
    if (!first) throw new Error('No radio');

    act(() => {
      first.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });

    expect(radios()).toHaveLength(0);
    expect(field('j1-company').value).toBe('');
    expect(fillFields).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button(/^Company name/));
  });

  it('guides the current-role box and never ticks it', async () => {
    click(/^I currently work here/);

    expect(dialog().textContent).toContain('From your saved profile');
    expect(dialog().textContent).toContain('Tick it');
    expect(findButton('Choose a saved record')).toBeUndefined();

    click('Show summary');
    await autofill();

    expect(input('cur-current').checked).toBe(false);
    expect(field('cur-employer').value).toBe('Example Testing Services');
    expect(field('j1-company').value).toBe('');
  });

  it('never shows an arbitrary job for a custom dropdown several jobs fit', () => {
    // The second "Employment type": Employment 2's custom dropdown.
    const row = [...host.querySelectorAll('button')].filter((b) =>
      b.textContent.startsWith('Employment type'),
    )[1];
    act(() => {
      row?.click();
    });

    expect(dialog().textContent).toContain(
      'Several of your saved jobs could fit, so ApplyKit does not suggest one.',
    );
    expect(dialog().textContent).not.toContain('From your saved profile');
  });
});

describe('field actions', () => {
  /** Two saved jobs: numbered employment sections need a choice. */
  async function openEmployment() {
    loadFixture('employment-application.html');
    document.body.append(host);
    const saved = fullProfile();
    saved.employment = employmentRecords();
    await open(ready(autofillValuesFrom(saved)));
    click('Show all fields');
  }

  const actionNames = () =>
    [...host.querySelectorAll('li > div button')].map((b) =>
      b.textContent.trim(),
    );

  it('shows the actions for a field as one row of bordered buttons', async () => {
    await openEmployment();
    click(/^Company name/);

    expect(actionNames()).toEqual(['Choose a saved record', 'Go to field']);
    const choose = button('Choose a saved record');
    const goTo = button('Go to field');
    for (const action of [choose, goTo]) {
      expect(action.type).toBe('button');
      expect(action.disabled).toBe(false);
    }
    // One shared treatment, visibly bounded before any hover.
    expect(choose.className).toBe(goTo.className);
    expect(choose.className).toMatch(/\bborder\b/);
    // Explanations stay text, not controls.
    expect(dialog().textContent).toContain('Several employment records fit');
    expect(findButton(/Several employment records fit/)).toBeUndefined();
  });

  it('gives profile links the same treatment', async () => {
    const values = sampleValues();
    values.text.lastName = '';
    await open(ready(values));
    click('Show all fields');
    click(/^Last name/);

    expect(actionNames()).toEqual(['Edit your profile', 'Go to field']);
    expect(button(/Edit your profile$/).className).toBe(
      button('Go to field').className,
    );
  });

  it('swaps the row for the chooser and restores it on Cancel', async () => {
    await openEmployment();
    click(/^Company name/);

    click('Choose a saved record');
    await settle();

    // While choosing, only the chooser's own actions are offered.
    expect(findButton('Go to field')).toBeUndefined();
    expect(findButton('Choose a saved record')).toBeUndefined();
    expect(button(/^Fill fields/).disabled).toBe(true);
    expect(button('Cancel').disabled).toBe(false);

    click('Cancel');

    expect(actionNames()).toEqual(['Choose a saved record', 'Go to field']);
    expect(document.activeElement).toBe(button(/^Company name/));
  });

  it('marks the chosen record and enables the primary action', async () => {
    await openEmployment();
    click(/^Company name/);
    click('Choose a saved record');
    await settle();
    const radio = [
      ...host.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    ].find((r) =>
      r.closest('label')?.textContent.includes('Example Logistics'),
    );
    if (!radio) throw new Error('No record');

    await act(async () => {
      radio.click();
      await Promise.resolve();
    });

    const labels = [...host.querySelectorAll('fieldset label')];
    expect(labels.map((l) => l.className.includes('bg-accent-soft'))).toEqual([
      false,
      true,
    ]);
    expect(button('Fill 5 fields').disabled).toBe(false);
  });

  it('keeps the compact mode free of field actions', async () => {
    await openEmployment();
    click('Show summary');

    for (const name of [
      'Choose a saved record',
      'Go to field',
      'Edit your profile',
    ]) {
      expect(findButton(name), name).toBeUndefined();
    }
  });
});

describe('saved application answers', () => {
  function withAnswers(answers = savedAnswers()): AutofillValuesResponse {
    return ready(autofillValuesFrom(fullProfile(), answers));
  }

  beforeEach(async () => {
    loadFixture('reusable-answers.html');
    document.body.append(host);
    await open(withAnswers());
    click('Show all fields');
  });

  function field(id: string): HTMLInputElement {
    const element = document.getElementById(id);
    if (!element) throw new Error(`No #${id}`);
    return element as HTMLInputElement;
  }

  function useButtons(): HTMLButtonElement[] {
    return [...host.querySelectorAll('button')].filter(
      (b) => b.textContent.trim() === 'Use this answer',
    );
  }

  /** The "Use this answer" button in the row whose button matches `row`. */
  function useIn(row: RegExp): HTMLButtonElement | undefined {
    return useButtons().find((b) =>
      row.test(
        b.closest('li')?.querySelector(':scope > button')?.textContent ?? '',
      ),
    );
  }

  it('lists answer questions under Application questions, unfilled', () => {
    expect(dialog().textContent).toContain('Application questions');
    expect(button(/^Notice period in weeks/).textContent).toContain('4');
    expect(field('notice-weeks').value).toBe('');
  });

  it('shows the saved answer and a clear action to use it', () => {
    click(/^Notice period in weeks/);

    expect(dialog().textContent).toContain('From your saved answers');
    expect(dialog().textContent).toContain(
      'ApplyKit fills it only if you choose to use it.',
    );
    const use = button('Use this answer');
    expect(use.type).toBe('button');
    expect(use.disabled).toBe(false);
    expect(findButton('Go to field')).toBeDefined();
  });

  it('never fills saved answers when the user presses Autofill', async () => {
    click('Show summary');

    await autofill();

    expect(field('first').value).toBe('Alex');
    for (const id of ['notice-weeks', 'start-date', 'salary-annual']) {
      expect(field(id).value, id).toBe('');
    }
  });

  it('fills one question after the user confirms it', async () => {
    // Four fields and the native radio group about relocating abroad.
    expect(useButtons()).toHaveLength(5);

    act(() => {
      useIn(/^Notice period in weeks/)?.click();
    });
    await settle();

    expect(field('notice-weeks').value).toBe('4');
    expect(field('salary-annual').value).toBe('');
    // The saved answers are read again before writing.
    expect(loadValues).toHaveBeenCalledTimes(2);
    expect(fillFields).toHaveBeenCalledTimes(1);
    expect(announcement()).toBe(
      'Filled your saved answer. Nothing was submitted.',
    );
    // One answer at a time: the others still wait for the user, and focus
    // moves on to the next.
    expect(useButtons()).toHaveLength(4);
    expect(useIn(/^Notice period in weeks/)).toBeUndefined();
    expect(document.activeElement).toBe(useIn(/^Earliest available start/));
    click(/^Notice period in weeks/);
    expect(dialog().textContent).toContain('Filled · your choice');
  });

  it('writes nothing when the saved answer changed meanwhile', async () => {
    click(/^Notice period in weeks/);
    profile = withAnswers({
      ...savedAnswers(),
      noticePeriod: { amount: 8, unit: 'weeks' },
    });

    click('Use this answer');
    await settle();

    expect(field('notice-weeks').value).toBe('');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'This question or your saved answer has changed. Nothing was filled; check it again.',
    );
    expect(fillFields).not.toHaveBeenCalled();
  });

  it('keeps what the user typed before confirming', async () => {
    click(/^Notice period in weeks/);
    field('notice-weeks').value = '6';

    click('Use this answer');
    await settle();

    expect(field('notice-weeks').value).toBe('6');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'You entered an answer here, so ApplyKit left it as it is.',
    );
  });

  it('explains an answer that does not fit, without offering to use it', () => {
    click(/^Expected hourly rate/);

    expect(dialog().textContent).toContain(
      'Your saved salary is a yearly amount, but this asks for an hourly rate.',
    );
    expect(useIn(/^Expected hourly rate/)).toBeUndefined();
  });

  it('links questions without a saved answer to the answers editor', async () => {
    act(() => {
      root.unmount();
    });
    const openPage = vi.fn(() => Promise.resolve(true));
    root = createRoot(host);
    profile = withAnswers({ ...savedAnswers(), noticePeriod: null });
    act(() => {
      root.render(
        <Panel
          onClose={onClose}
          loadValues={loadValues}
          openProfile={openPage}
        />,
      );
    });
    await settle();
    click('Show all fields');
    click(/^Notice period in weeks/);

    click('Edit application answers');

    expect(openPage).toHaveBeenCalledWith('answers');
    expect(findButton(/Edit your profile$/)).toBeUndefined();
  });

  it('chooses a native radio option only after the user confirms it', async () => {
    const radio = (id: string) =>
      document.getElementById(id) as HTMLInputElement;
    click(/^Would you consider relocating outside the UK/);
    expect(dialog().textContent).toContain('From your saved answers');
    expect(radio('relocate-abroad-yes').checked).toBe(false);

    act(() => {
      useIn(/^Would you consider relocating outside the UK/)?.click();
    });
    await settle();

    const checked = [
      ...document.querySelectorAll<HTMLInputElement>(
        'input[name="relocateAbroad"]:checked',
      ),
    ];
    expect(checked.map((r) => r.value)).toEqual(['no']);
    expect(announcement()).toBe(
      'Filled your saved answer. Nothing was submitted.',
    );
  });

  it('keeps the compact mode free of answer actions', () => {
    click('Show summary');

    expect(findButton('Use this answer')).toBeUndefined();
    expect(dialog().textContent).not.toContain('£32,000');
  });
});

describe('suggested answers in the compact panel', () => {
  async function openWith(answers = savedAnswers()) {
    loadFixture('reusable-answers.html');
    document.body.append(host);
    await open(ready(autofillValuesFrom(fullProfile(), answers)));
  }

  function line(): HTMLElement | null {
    return host.querySelector('section[aria-label="Suggested answers"]');
  }

  function focusedUse(): string {
    const focused = document.activeElement;
    return focused?.textContent.trim() === 'Use this answer'
      ? (focused.closest('li')?.querySelector(':scope > button')?.textContent ??
          '')
      : '';
  }

  it('counts only answers that fit a field that can take them', async () => {
    await openWith();

    // Four fit; ranges, other units, "after an offer", the entry already
    // typed, radio buttons, custom dropdowns, the hourly rate and every
    // sensitive or consent question are not counted.
    expect(line()?.textContent).toBe(
      'Suggested answers · 5 availableReview answers',
    );
  });

  it('counts a single answer', async () => {
    await openWith({
      ...emptyAnswers(),
      noticePeriod: { amount: 4, unit: 'weeks' },
    });

    expect(line()?.textContent).toContain('1 available');
  });

  it('shows nothing when no saved answer fits', async () => {
    await openWith({
      ...emptyAnswers(),
      salary: { amount: 15, currency: 'EUR', period: 'hour' },
    });

    expect(line()).toBeNull();
    expect(findButton('Review answers')).toBeUndefined();
  });

  it('opens the suggested answers, focused, without writing anything', async () => {
    await openWith();

    click('Review answers');
    await settle();

    expect(dialog().dataset.mode).toBe('expanded');
    const sections = [...host.querySelectorAll('section[aria-label]')].map(
      (section) => section.getAttribute('aria-label'),
    );
    expect(sections[0]).toBe('Suggested answers');
    expect(focusedUse()).toMatch(/^Notice period in weeks/);
    expect(fillFields).not.toHaveBeenCalled();
    for (const id of ['notice-weeks', 'start-date', 'relocate-uk']) {
      expect((document.getElementById(id) as HTMLInputElement).value).toBe('');
    }
  });

  it('stays available after autofill, with the same count', async () => {
    await openWith();

    await autofill();

    expect((document.getElementById('first') as HTMLInputElement).value).toBe(
      'Alex',
    );
    expect(line()?.textContent).toContain('5 available');
    click('Review answers');
    await settle();
    expect(focusedUse()).toMatch(/^Notice period in weeks/);
  });

  it('updates the count after an answer is used and after a rescan', async () => {
    await openWith();
    click('Review answers');
    await settle();

    act(() => {
      (document.activeElement as HTMLButtonElement).click();
    });
    await settle();
    click('Show summary');
    expect(line()?.textContent).toContain('4 available');

    (document.getElementById('salary-annual') as HTMLInputElement).value =
      'Typed';
    click('Rescan the page');
    await settle();
    // The filled answer and the typed one are no longer suggestions.
    expect(line()?.textContent).toContain('3 available');
  });

  it('is a button the keyboard reaches, with a clear name', async () => {
    await openWith();

    const review = button('Review answers');
    expect(review.type).toBe('button');
    expect(review.disabled).toBe(false);
  });
});

describe('developer diagnostics', () => {
  const DIAGNOSTIC = /matched as|autocomplete="|name="|id="|label “|in “/;

  async function openWith(
    fixture: string,
    response: AutofillValuesResponse,
    diagnostics = false,
  ) {
    act(() => {
      root.unmount();
    });
    loadFixture(fixture);
    document.body.append(host);
    profile = response;
    root = createRoot(host);
    act(() => {
      root.render(
        <Panel
          onClose={onClose}
          loadValues={loadValues}
          loadSettings={() => Promise.resolve({ diagnostics, ai: false })}
        />,
      );
    });
    await settle();
  }

  /** Opens every row of the full list in turn and checks its detail. */
  function expectEveryRowFreeOfDiagnostics() {
    const names = [
      ...host.querySelectorAll<HTMLButtonElement>(
        '[aria-label="Fields on this form"] li > button',
      ),
    ].map((b) => b.textContent);
    expect(names.length).toBeGreaterThan(5);
    for (const name of names) {
      const row = [
        ...host.querySelectorAll<HTMLButtonElement>(
          '[aria-label="Fields on this form"] li > button',
        ),
      ].find((b) => b.textContent === name);
      if (!row) continue;
      if (row.getAttribute('aria-expanded') !== 'true') {
        act(() => {
          row.click();
        });
      }
      const detail = row.closest('li')?.querySelector(':scope > div');
      // The explanation is still there, and nothing of the engine's.
      expect(detail?.querySelector('p')?.textContent, name).not.toBe('');
      expect(detail?.textContent ?? '', name).not.toMatch(DIAGNOSTIC);
      expect(
        detail?.querySelector('[aria-label="Developer diagnostics"]'),
        name,
      ).toBeNull();
    }
  }

  it.each([
    ['full-application.html', () => ready()],
    [
      'interactive-education.html',
      () => {
        const saved = fullProfile();
        saved.education = [...educationRecords(), gcseRecord()];
        return ready(autofillValuesFrom(saved));
      },
    ],
    [
      'employment-application.html',
      () => {
        const saved = fullProfile();
        saved.employment = employmentRecords();
        return ready(autofillValuesFrom(saved));
      },
    ],
    ['custom-controls.html', () => ready()],
    [
      'reusable-answers.html',
      () => ready(autofillValuesFrom(fullProfile(), savedAnswers())),
    ],
  ] as const)(
    'shows none by default on %s, before and after autofill',
    async (fixture, response) => {
      await openWith(fixture, response());
      click('Show all fields');
      expectEveryRowFreeOfDiagnostics();

      click('Show summary');
      await autofill();
      click('Show all fields');
      expectEveryRowFreeOfDiagnostics();
    },
  );

  it('shows none for a value the site rejected, and still says why', async () => {
    await openWith('job-application.html', ready());
    const first = document.getElementById('given') as HTMLInputElement;
    first.addEventListener('input', () => {
      first.value = '';
    });

    await autofill();
    click('Show all fields');
    click(/^First name/);

    expect(dialog().textContent).toContain(
      'The site cleared this value. Enter it yourself.',
    );
    expectEveryRowFreeOfDiagnostics();
  });

  it('shows the workings separately when turned on', async () => {
    await openWith('job-application.html', ready(), true);
    click('Show all fields');
    click(/^First name/);

    const group = host.querySelector('[aria-label="Developer diagnostics"]');
    expect(group?.getAttribute('role')).toBe('group');
    expect(group?.textContent).toContain('matched as first name');
    expect(group?.textContent).toContain('autocomplete="given-name"');
    expect(group?.textContent).toContain('label “First name *”');
    // The explanation stays outside it.
    expect(group?.textContent).not.toContain('ApplyKit will fill this');
  });

  it('keeps them off when the setting cannot be read', async () => {
    // Values come from `loadValues`; only the settings request fails.
    const sendMessage = vi
      .spyOn(fakeBrowser.runtime, 'sendMessage')
      .mockRejectedValue(new Error('unreachable'));
    act(() => {
      root.unmount();
    });
    loadFixture('job-application.html');
    document.body.append(host);
    profile = ready();
    root = createRoot(host);
    act(() => {
      root.render(<Panel onClose={onClose} loadValues={loadValues} />);
    });
    await settle();
    click('Show all fields');
    click(/^First name/);

    expect(dialog().textContent).toContain(
      'ApplyKit will fill this with your first name.',
    );
    expect(
      host.querySelector('[aria-label="Developer diagnostics"]'),
    ).toBeNull();
    expect(sendMessage).toHaveBeenCalledWith(GET_PANEL_SETTINGS);
  });
});

describe('graduation answers', () => {
  beforeEach(async () => {
    loadFixture('graduation-application.html');
    document.body.append(host);
    const saved = fullProfile();
    saved.education = educationRecords();
    await open(ready(autofillValuesFrom(saved)));
  });

  function rowOf(name: RegExp): HTMLLIElement | null {
    return button(name).closest('li');
  }

  it('counts the answers the saved degree settles', () => {
    expect(
      host.querySelector('section[aria-label="Suggested answers"]')
        ?.textContent,
    ).toContain('7 available');
  });

  it('shows the answer with the saved fact it rests on', async () => {
    click('Review answers');
    await settle();

    const row = rowOf(/^Will you graduate before October 2027/);
    expect(row?.textContent).toContain('Based on your saved education');
    expect(row?.textContent).toContain('Expected graduation: June 2027');
    expect(row?.textContent).toContain(
      'Worked out from your expected graduation date.',
    );
    expect(row?.textContent).not.toContain('From your saved answers');
  });

  it('fills a graduation answer only when the user uses it', async () => {
    const field = document.getElementById('grad-before') as HTMLSelectElement;
    await autofill();
    expect(field.value).toBe('');
    click('Show all fields');
    click(/^Will you graduate before October 2027/);

    const use = [
      ...(rowOf(/^Will you graduate before October 2027/)?.querySelectorAll(
        'button',
      ) ?? []),
    ].find((b) => b.textContent.trim() === 'Use this answer');
    act(() => {
      use?.click();
    });
    await settle();

    expect(field.value).toBe('y');
    expect(
      (document.getElementById('grad-by') as HTMLSelectElement).value,
    ).toBe('');
  });

  it('links a degree question with no matching degree to the profile', () => {
    click('Show all fields');
    click(/^Will you have completed your master/);

    expect(findButton(/Edit your profile$/)).toBeDefined();
    expect(findButton('Edit application answers')).toBeUndefined();
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

describe('opening the profile', () => {
  it('says so when the profile page could not be opened', async () => {
    await open();
    root.render(
      <Panel
        onClose={onClose}
        loadValues={loadValues}
        openProfile={() => Promise.resolve(false)}
      />,
    );
    await settle();

    click('Open your profile');
    await settle();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'ApplyKit could not open your profile.',
    );
  });

  it('tells the user to reopen ApplyKit after it was reloaded', async () => {
    await open({ status: 'error' });
    fakeBrowser.runtime.id = '';
    click('Rescan the page');
    await settle();

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'ApplyKit was updated or reloaded since this panel opened. Close the panel and open ApplyKit again from the toolbar.',
    );
  });
});

describe('diversity questions', () => {
  function storeOf(preferences: DiversityPreferences) {
    return {
      load: () =>
        Promise.resolve({
          status: 'loaded' as const,
          preferences,
          updatedAt: '2026-10-18T12:00:00.000Z',
          damaged: [],
        }),
    };
  }

  const openPage = vi.fn(() => Promise.resolve(true));
  let chooseDiversity: Mock<
    (requests: DiversityRequest[]) => Promise<ResolveDiversityResponse>
  >;

  async function openWith(preferences: DiversityPreferences) {
    loadFixture('diversity-application.html');
    document.body.append(host);
    const store = storeOf(preferences);
    const status = await loadDiversityStatus(store);
    chooseDiversity = vi.fn((requests: DiversityRequest[]) =>
      resolveDiversity(store, requests),
    );
    profile = ready(autofillValuesFrom(fullProfile(), emptyAnswers(), status));
    root = createRoot(host);
    act(() => {
      root.render(
        <Panel
          onClose={onClose}
          loadValues={loadValues}
          openProfile={openPage}
          chooseDiversity={chooseDiversity}
        />,
      );
    });
    await settle();
  }

  function select(id: string): HTMLSelectElement {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLSelectElement)) throw new Error(`No #${id}`);
    return element;
  }

  it('fills matching monitoring lists only after Autofill, with reuse on', async () => {
    await openWith(savedDiversity());
    expect(chooseDiversity).not.toHaveBeenCalled();

    await autofill();

    expect(chooseDiversity).toHaveBeenCalledTimes(1);
    expect(select('ethnicity').value).toBe('e12');
    expect(select('orientation').value).toBe('p');
    // Male and Female do not say the saved Non-binary.
    expect(select('gender').value).toBe('');
    // A choice already made on the page is kept.
    expect(select('religion').value).toBe('Prefer not to say');
    // A native radio group is answered like a list, with reuse on.
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          'input[name="disability"]:checked',
        ),
      ].map((r) => r.value),
    ).toEqual(['no']);
  });

  it('never fills a monitoring list the panel had not listed', async () => {
    await openWith(savedDiversity());
    const late = document.createElement('div');
    late.innerHTML = `<label for="late">What is your sexual orientation?</label>
      <select id="late"><option value="">Select…</option>
      <option value="x">Prefer not to say</option></select>`;
    document.getElementById('orientation')?.replaceWith(late);

    await autofill();

    expect(select('late').value).toBe('');
    // Positive control: a listed one was filled.
    expect(select('ethnicity').value).toBe('e12');
  });

  it('fills nothing and asks for nothing with reuse off', async () => {
    await openWith({ ...savedDiversity(), reuse: false });

    await autofill();

    expect(chooseDiversity).not.toHaveBeenCalled();
    expect(select('ethnicity').value).toBe('');
    expect(select('orientation').value).toBe('');
    click('Show all fields');
    click(/^What is your ethnic group/);
    expect(dialog().textContent).toContain(
      'Reuse of your saved diversity answers is off, so ApplyKit leaves this to you.',
    );
  });

  it('groups monitoring questions as sensitive disclosures, without values', async () => {
    await openWith(savedDiversity());
    await autofill();

    const compact = dialog().textContent;
    click('Show all fields');
    const section = host.querySelector(
      '[aria-label="Fields on this form"] section[aria-label="Sensitive disclosures"]',
    );
    expect(section?.textContent).toContain('What is your ethnic group');
    expect(section?.textContent).toContain('What is your sexual orientation');
    click(/^What is your ethnic group/);
    expect(dialog().textContent).toContain(
      'Filled from your saved diversity preferences. The site accepted it.',
    );

    for (const text of [compact, dialog().textContent]) {
      for (const value of [
        'Any other Mixed',
        'Non-binary',
        'non-binary',
        'other-mixed',
        'Prefer not to say',
      ]) {
        expect(text, value).not.toContain(value);
      }
    }
  });

  it('explains a list whose choices differ from the saved answer', async () => {
    await openWith(savedDiversity());
    await autofill();
    click('Show all fields');
    click(/^What is your gender/);

    expect(dialog().textContent).toContain(
      'The choices here differ from your saved answer, so ApplyKit leaves this to you.',
    );
  });

  it('links monitoring questions to the diversity preferences', async () => {
    await openWith({ ...savedDiversity(), reuse: false });
    click('Show all fields');
    click(/^What is your ethnic group/);

    click('Diversity preferences');

    expect(openPage).toHaveBeenCalledWith('diversity');
  });
});

describe('AI drafting', () => {
  const ITEMS: SharedItem[] = [
    {
      id: 'skills',
      group: 'skills',
      title: 'Technical skills',
      summary: 'Python · TypeScript · PostgreSQL',
      text: 'Skills: Python, TypeScript, PostgreSQL',
    },
    {
      id: 'project:inventory',
      group: 'project',
      title: 'Inventory Dashboard',
      summary: 'Python · PostgreSQL',
      text: 'Project: Inventory Dashboard: Built a dashboard for tracking stock.',
    },
  ];
  const DRAFT = 'I write Python and TypeScript. I use PostgreSQL daily.';

  function ready(
    approved = false,
  ): Extract<AiPrepareResponse, { status: 'ready' }> {
    return {
      status: 'ready',
      kind: 'skills',
      items: ITEMS,
      selected: ['skills'],
      approved,
      model: 'Fast',
    };
  }

  let previewReply: AiPrepareResponse | null;
  let draftReply: AiDraftResponse | null;
  let drafting: {
    preview: Mock<Drafting['preview']>;
    draft: Mock<Drafting['draft']>;
  };
  const openPage = vi.fn(() => Promise.resolve(true));

  async function openWith(ai = true, change?: () => void) {
    loadFixture('open-questions.html');
    change?.();
    document.body.append(host);
    previewReply = ready();
    draftReply = { status: 'draft', text: DRAFT };
    drafting = {
      preview: vi.fn(() => Promise.resolve(previewReply)),
      draft: vi.fn(() => Promise.resolve(draftReply)),
    };
    profile = { status: 'ready', values: sampleValues() };
    root = createRoot(host);
    act(() => {
      root.render(
        <Panel
          onClose={onClose}
          loadValues={loadValues}
          openProfile={openPage}
          loadSettings={() => Promise.resolve({ diagnostics: false, ai })}
          drafting={drafting}
        />,
      );
    });
    await settle();
    click('Show all fields');
  }

  function field(id: string): HTMLTextAreaElement {
    const element = document.getElementById(id);
    if (!(element instanceof HTMLTextAreaElement)) throw new Error(`No #${id}`);
    return element;
  }

  function draftBox(): HTMLTextAreaElement {
    const box = dialog().querySelector('textarea');
    if (!box) throw new Error('No draft box');
    return box;
  }

  async function startDraft(row = /^Describe your programming skills/) {
    click(row);
    click('Draft with AI');
    await settle();
  }

  async function send(name = 'Send to Anthropic') {
    click(name);
    await settle();
  }

  it('counts open questions apart from autofill and other fields', async () => {
    await openWith();
    click('Show summary');

    const text = dialog().textContent;
    expect(text).toContain('Fill 2 fields from your profile');
    expect(text).toContain('8 open questions you can draft with AI');
    expect(text).toMatch(/Leave \d+ other fields for you/);
    expect(text).not.toContain('Fill 10');
  });

  it('does not count questions the form forbids AI for as draftable', async () => {
    await openWith(true, () => {
      document
        .getElementById('q-skills')
        ?.insertAdjacentHTML(
          'afterend',
          '<p>Please do not use AI tools to write your answers.</p>',
        );
    });
    click('Show summary');

    // The notice is in the "Your application" section, with all 8.
    expect(dialog().textContent).not.toContain('you can draft with AI');
  });

  it('describes open questions plainly while AI drafting is off', async () => {
    await openWith(false);
    click('Show summary');

    expect(dialog().textContent).toContain(
      '8 open questions to answer in your own words',
    );
    expect(dialog().textContent).not.toContain('AI');
  });

  it('offers nothing while AI drafting is not connected', async () => {
    await openWith(false);
    click(/^Describe your programming skills/);

    expect(dialog().textContent).toContain('Open question');
    expect(findButton('Draft with AI')).toBeUndefined();
    expect(drafting.preview).not.toHaveBeenCalled();
  });

  it('shows exactly what will be shared before sending anything', async () => {
    await openWith();

    await startDraft();

    const text = dialog().textContent;
    expect(text).toContain('To share with Anthropic');
    expect(text).toContain(
      'Describe your programming skills in two sentences.',
    );
    // Compact: type, title and summary; the exact text one click away.
    expect(text).toContain('Technical skills');
    expect(text).toContain('Python · TypeScript · PostgreSQL');
    expect(text).not.toContain('Skills: Python, TypeScript, PostgreSQL');
    act(() => {
      findButton('Show details')?.click();
    });
    expect(dialog().textContent).toContain(
      'Skills: Python, TypeScript, PostgreSQL',
    );
    expect(text).toContain(
      'Contact details and diversity answers are never shared',
    );
    expect(drafting.preview).toHaveBeenCalledWith({
      question: 'Describe your programming skills in two sentences.',
      limits: {
        words: { min: null, max: null },
        characters: { min: null, max: null },
        sentences: { min: 2, max: 2 },
        conflict: null,
      },
      role: '',
      employer: '',
      mode: 'draft',
      original: '',
    });
    expect(drafting.draft).not.toHaveBeenCalled();
    const boxes = [
      ...dialog().querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
  });

  it('sends only the ticked items, after approval, and never inserts by itself', async () => {
    await openWith();
    await startDraft();
    act(() => {
      dialog()
        .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]
        ?.click();
    });

    await send();

    expect(drafting.draft).toHaveBeenCalledTimes(1);
    expect(drafting.draft.mock.calls[0]?.[0]).toMatchObject({
      selected: ['skills', 'project:inventory'],
      approve: true,
    });
    expect(draftBox().value).toBe(DRAFT);
    expect(field('q-skills').value).toBe('');
  });

  it('inserts the edited answer only when asked, and never submits', async () => {
    await openWith();
    const submitted = vi.fn((event: Event) => {
      event.preventDefault();
    });
    document
      .getElementById('application')
      ?.addEventListener('submit', submitted);
    await startDraft();
    await send();

    act(() => {
      setInputValue(draftBox(), 'I write Python daily. I enjoy tidy SQL.');
    });
    click('Insert answer');
    await settle();

    expect(field('q-skills').value).toBe(
      'I write Python daily. I enjoy tidy SQL.',
    );
    expect(announcement()).toBe('Inserted your answer. Nothing was submitted.');
    expect(submitted).not.toHaveBeenCalled();
    expect(field('q-project').value).toBe('');
  });

  it('will not insert an answer over the question’s limit', async () => {
    await openWith();
    draftReply = { status: 'draft', text: 'One. Two. Three.' };
    await startDraft();
    await send();

    expect(dialog().textContent).toContain(
      'Has 3 sentences; the question asks for exactly 2 sentences.',
    );
    expect(button('Insert answer').disabled).toBe(true);

    act(() => {
      setInputValue(draftBox(), 'One. Two.');
    });
    expect(button('Insert answer').disabled).toBe(false);
  });

  it('will not insert one sentence where exactly two are required', async () => {
    await openWith();
    draftReply = { status: 'draft', text: 'I write Python and TypeScript.' };
    await startDraft();
    await send();

    expect(dialog().textContent).toContain(
      'Has 1 sentence; the question asks for exactly 2 sentences.',
    );
    expect(button('Insert answer').disabled).toBe(true);
    expect(field('q-skills').value).toBe('');
  });

  it('explains a draft that was cut off and inserts nothing', async () => {
    await openWith();
    draftReply = {
      status: 'failed',
      failure: 'truncated',
      retryAfterSeconds: null,
    };
    await startDraft();
    await send();

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'did not show an incomplete draft',
    );
    expect(findButton('Try again')).toBeDefined();
    expect(field('q-skills').value).toBe('');
    expect(drafting.draft).toHaveBeenCalledTimes(1);
  });

  it('says when a question’s requirements conflict, never claiming full compliance', async () => {
    await openWith(true, () => {
      const label = document.querySelector('label[for="q-experience"]');
      if (label) {
        label.textContent =
          'What relevant experience do you have? Write at least 200 words, maximum 15 words.';
      }
    });
    draftReply = {
      status: 'draft',
      text: 'I served customers and ran the till.',
    };
    await startDraft(/^What relevant experience do you have/);
    await send();

    expect(dialog().textContent).toContain(
      'This question’s requirements conflict (at least 200 words and at most 15 words), so no answer can meet them all.',
    );
    // The maximum still applies.
    act(() => {
      setInputValue(
        draftBox(),
        Array.from({ length: 16 }, () => 'word').join(' '),
      );
    });
    expect(button('Insert answer').disabled).toBe(true);
  });

  it('keeps what the user typed on the page meanwhile', async () => {
    await openWith();
    await startDraft();
    await send();
    field('q-skills').value = 'My own words.';

    click('Insert answer');
    await settle();

    expect(field('q-skills').value).toBe('My own words.');
    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'You entered an answer here, so ApplyKit left it as it is.',
    );
  });

  it('inserts nothing when the question changed', async () => {
    await openWith();
    await startDraft();
    await send();
    const label = document.querySelector('label[for="q-skills"]');
    if (label)
      label.textContent = 'Describe your design skills in two sentences.';

    click('Insert answer');
    await settle();

    expect(field('q-skills').value).toBe('');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'This question has changed',
    );
  });

  it('can be cancelled while drafting', async () => {
    await openWith();
    let signal: AbortSignal | undefined;
    drafting.draft.mockImplementation((_request, s) => {
      signal = s;
      return new Promise(() => undefined);
    });
    await startDraft();
    click('Send to Anthropic');
    await settle();
    expect(dialog().textContent).toContain('Drafting with Claude…');

    click('Cancel');
    await settle();

    expect(signal?.aborted).toBe(true);
    expect(field('q-skills').value).toBe('');
  });

  it('shows a short summary for a request approved earlier', async () => {
    await openWith();
    previewReply = ready(true);
    await startDraft();

    expect(dialog().textContent).toContain(
      'Shares the question and 1 item with Anthropic, as you approved before.',
    );
    await send('Draft');
    expect(drafting.draft.mock.calls[0]?.[0]).toMatchObject({ approve: false });
  });

  it('shows everything again when the background asks for approval', async () => {
    await openWith();
    previewReply = ready(true);
    draftReply = { status: 'needs-approval' };
    await startDraft();

    await send('Draft');

    expect(dialog().textContent).toContain('To share with Anthropic');
    expect(findButton('Send to Anthropic')).toBeDefined();
  });

  it('sends nothing with nothing ticked', async () => {
    await openWith();
    await startDraft();
    act(() => {
      dialog()
        .querySelector<HTMLInputElement>('input[type="checkbox"]')
        ?.click();
    });

    expect(button('Send to Anthropic').disabled).toBe(true);
  });

  it('explains failures without retrying', async () => {
    await openWith();
    draftReply = {
      status: 'failed',
      failure: 'rate-limited',
      retryAfterSeconds: 30,
    };
    await startDraft();

    await send();

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Anthropic is limiting requests. Try again in 30 seconds.',
    );
    expect(drafting.draft).toHaveBeenCalledTimes(1);
  });

  it('points to Skills & projects when the facts are not enough', async () => {
    await openWith();
    draftReply = {
      status: 'failed',
      failure: 'insufficient',
      retryAfterSeconds: null,
    };
    await startDraft();
    await send();

    click('Skills & projects');

    expect(openPage).toHaveBeenCalledWith('skills');
  });

  it('keeps the compact mode free of AI actions', async () => {
    await openWith();
    click('Show summary');

    expect(findButton('Draft with AI')).toBeUndefined();
    expect(dialog().textContent).not.toContain('Anthropic');
  });

  it('offers to improve, not draft, a question already answered', async () => {
    await openWith();

    click(/^What motivates you to apply/);

    expect(findButton('Draft with AI')).toBeUndefined();
    expect(findButton('Improve my answer')).toBeDefined();
  });

  describe('improving the applicant’s answer', () => {
    const ORIGINAL =
      'I enjoy turning messy data into something people can use.';
    const IMPROVED =
      'I enjoy turning messy data into something people can use and trust.';

    async function improve() {
      await openWith();
      previewReply = { ...ready(), selected: [], approved: false };
      draftReply = { status: 'draft', text: IMPROVED };
      click(/^What motivates you to apply/);
      click('Improve my answer');
      await settle();
    }

    it('shows the answer it would send, and sends only on approval', async () => {
      await improve();

      expect(dialog().textContent).toContain(
        'Your answer on the page, to improve',
      );
      expect(dialog().textContent).toContain(ORIGINAL);
      expect(drafting.preview).toHaveBeenCalledWith(
        expect.objectContaining({ mode: 'improve', original: ORIGINAL }),
      );
      expect(drafting.draft).not.toHaveBeenCalled();

      await send();

      expect(drafting.draft.mock.calls[0]?.[0]).toMatchObject({
        mode: 'improve',
        original: ORIGINAL,
        selected: [],
        approve: true,
      });
    });

    it('replaces the answer only after confirming, keeping the original visible', async () => {
      await improve();
      await send();

      click('Replace your answer…');
      expect(field('q-answered').value).toBe(ORIGINAL);
      expect(dialog().textContent).toContain('Replace the text in this field');
      click('Show your original');
      expect(dialog().textContent).toContain(ORIGINAL);

      click('Replace');
      await settle();

      expect(field('q-answered').value).toBe(IMPROVED);
      expect(announcement()).toBe(
        'Replaced your answer. Nothing was submitted.',
      );
    });

    it('keeps the answer when the user chooses to', async () => {
      await improve();
      await send();

      click('Replace your answer…');
      click('Keep mine');

      expect(field('q-answered').value).toBe(ORIGINAL);
      expect(findButton('Replace your answer…')).toBeDefined();
    });

    it('replaces an answer that ends with a space or new line', async () => {
      await openWith();
      field('q-answered').value = `${ORIGINAL}\n`;
      previewReply = { ...ready(), selected: [], approved: false };
      draftReply = { status: 'draft', text: IMPROVED };
      click(/^What motivates you to apply/);
      click('Improve my answer');
      await settle();
      await send();
      expect(drafting.draft.mock.calls[0]?.[0]).toMatchObject({
        original: ORIGINAL,
      });

      click('Replace your answer…');
      click('Replace');
      await settle();

      expect(field('q-answered').value).toBe(IMPROVED);
    });

    it('explains an answer too long to send for improving', async () => {
      await openWith();
      field('q-answered').value = 'x'.repeat(4001);
      click(/^What motivates you to apply/);

      click('Improve my answer');
      await settle();

      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        'longer than ApplyKit sends for improving',
      );
      expect(drafting.preview).not.toHaveBeenCalled();
    });

    it('never replaces an answer the user changed meanwhile', async () => {
      await improve();
      await send();
      field('q-answered').value = 'My newer words.';

      click('Replace your answer…');
      click('Replace');
      await settle();

      expect(field('q-answered').value).toBe('My newer words.');
      expect(host.querySelector('[role="alert"]')?.textContent).toContain(
        'Your answer on the page has changed',
      );
    });
  });

  it('revises a draft that misses the limits only when asked, keeping the previous version', async () => {
    await openWith();
    draftReply = { status: 'draft', text: 'I write Python.' };
    await startDraft();
    await send();
    expect(button('Insert answer').disabled).toBe(true);

    draftReply = { status: 'draft', text: 'I write Python. I use SQL daily.' };
    click('Revise to fit');
    await settle();

    expect(drafting.draft).toHaveBeenCalledTimes(2);
    expect(drafting.draft.mock.calls[1]?.[0]).toMatchObject({
      mode: 'improve',
      original: 'I write Python.',
      approve: true,
    });
    expect(draftBox().value).toBe('I write Python. I use SQL daily.');
    click('Show the previous version');
    expect(dialog().textContent).toContain('I write Python.');
    // Still inserted, not replaced: the field was empty.
    click('Insert answer');
    await settle();
    expect(field('q-skills').value).toBe('I write Python. I use SQL daily.');
  });

  it('offers no AI drafting where the form forbids AI', async () => {
    await openWith(true, () => {
      document
        .getElementById('q-skills')
        ?.insertAdjacentHTML(
          'afterend',
          '<p class="hint">Please do not use AI tools to write your answers.</p>',
        );
    });

    click(/^Describe your programming skills/);

    expect(findButton('Draft with AI')).toBeUndefined();
    expect(dialog().textContent).toContain(
      'This form asks for answers written without AI',
    );
    expect(drafting.preview).not.toHaveBeenCalled();
  });

  it('prefills role and employer for motivation questions', async () => {
    document.title =
      'Junior Data Engineer · Example Fernhill Analytics Careers';
    await openWith();
    document.title = '';

    await startDraft(/^Why are you interested in this role/);

    expect(drafting.preview).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'Junior Data Engineer',
        employer: 'Example Fernhill Analytics',
      }),
    );
  });
});

describe('native radio groups', () => {
  async function openRadios(reuse = true) {
    loadFixture('radio-application.html');
    document.body.append(host);
    const preferences = { ...savedDiversity(), reuse };
    const store = {
      load: () =>
        Promise.resolve({
          status: 'loaded' as const,
          preferences,
          updatedAt: '2026-10-18T12:00:00.000Z',
          damaged: [],
        }),
    };
    const profile = fullProfile();
    profile.education = educationRecords();
    profile_ = ready(
      autofillValuesFrom(
        profile,
        savedAnswers(),
        await loadDiversityStatus(store),
      ),
    );
    root = createRoot(host);
    act(() => {
      root.render(
        <Panel
          onClose={onClose}
          loadValues={() => Promise.resolve(profile_)}
          chooseDiversity={(requests) => resolveDiversity(store, requests)}
        />,
      );
    });
    await settle();
  }
  let profile_: AutofillValuesResponse;

  const checked = (name: string) =>
    document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)
      ?.value ?? null;

  it('offers to use a graduation answer on a radio group, and chooses it only then', async () => {
    await openRadios();
    click('Show all fields');
    click(/^Will you graduate before October 2027/);

    expect(dialog().textContent).toContain('Based on your saved education');
    expect(checked('gradBefore')).toBeNull();

    click('Use this answer');
    await settle();

    expect(checked('gradBefore')).toBe('y');
    expect(checked('relocateAbroad')).toBeNull();
  });

  it('chooses monitoring answers on Autofill without showing them', async () => {
    await openRadios();

    await autofill();

    expect(checked('religion')).toBe('none');
    expect(checked('gradBefore')).toBeNull();
    click('Show all fields');
    click(/^What is your religion/);
    expect(dialog().textContent).toContain(
      'Filled from your saved diversity preferences.',
    );
    expect(dialog().textContent).not.toContain('No religion');
  });

  it('chooses no monitoring answer with reuse off', async () => {
    await openRadios(false);

    await autofill();

    expect(checked('religion')).toBeNull();
    expect(checked('disability')).toBeNull();
  });
});
