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
import { DRAFT_SCHEMA_VERSION, type StoredDraft } from '@/domain/profile-draft';
import type { UserProfile } from '@/domain/user-profile';
import type {
  DraftLoadResult,
  LoadResult,
  ProfileStore,
  SaveResult,
} from '@/storage/profile-store';
import { validDraft, validProfile } from '@/test/profile-fixtures';
import type { CvFile, CvReadResult } from '@/cv/read';
import { CLASSIC_CV } from '@/test/cv-fixtures';
import { OnboardingApp } from './OnboardingApp';
import { AUTOSAVE_DELAY } from './useDraftAutosave';

const NOW = new Date('2026-10-17T12:00:00.000Z');

let root: Root;
let host: HTMLElement;

/** An in-memory store standing in for browser storage. */
function memoryStore(
  initial: LoadResult = { status: 'empty' },
  options: {
    saveResult?: SaveResult;
    draft?: DraftLoadResult;
    draftWrites?: boolean;
  } = {},
) {
  const saved: UserProfile[] = [];
  const drafts: StoredDraft[] = [];
  const store = {
    load: vi.fn(() => Promise.resolve(initial)),
    save: vi.fn((profile: UserProfile) => {
      if (options.saveResult) return Promise.resolve(options.saveResult);
      saved.push(profile);
      return Promise.resolve<SaveResult>({ status: 'saved', profile });
    }),
    loadDraft: vi.fn(() =>
      Promise.resolve<DraftLoadResult>(options.draft ?? { status: 'none' }),
    ),
    saveDraft: vi.fn((draft: StoredDraft) => {
      if (options.draftWrites === false) return Promise.resolve(false);
      drafts.push(draft);
      return Promise.resolve(true);
    }),
    clearDraft: vi.fn(() => Promise.resolve(true)),
  } satisfies ProfileStore;
  return { store, saved, drafts };
}

async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

async function render(
  store: ProfileStore,
  readCvFile: (file: CvFile) => Promise<CvReadResult> = () =>
    Promise.resolve({ ok: true, kind: 'pdf', text: CLASSIC_CV, notes: [] }),
) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <OnboardingApp store={store} now={() => NOW} readCvFile={readCvFile} />,
    );
    await flush();
  });
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.useRealTimers();
});

function heading(): string {
  return host.querySelector('h1')?.textContent ?? '';
}

/** The control labelled `name` (ignoring the "Optional" marker). */
function field(name: string, index = 0): HTMLElement {
  const labels = [...host.querySelectorAll('label')].filter(
    (label) => label.textContent.replace(/Optional$/, '').trim() === name,
  );
  const label = labels[index];
  const control = label?.htmlFor
    ? document.getElementById(label.htmlFor)
    : (label?.querySelector<HTMLElement>('input, select, textarea') ?? null);
  if (!control) throw new Error(`No field "${name}"`);
  return control;
}

function type(name: string, value: string, index = 0) {
  const control = field(name, index);
  act(() => {
    if (control instanceof HTMLSelectElement) {
      Reflect.set(HTMLSelectElement.prototype, 'value', value, control);
      control.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      const proto =
        control instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Reflect.set(proto, 'value', value, control);
      control.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

/** Searches the country combobox and chooses the best match with Enter. */
function chooseCountry(search: string) {
  const control = field('Country');
  act(() => {
    control.focus();
  });
  type('Country', search);
  act(() => {
    control.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
  });
}

function button(name: string | RegExp): HTMLButtonElement {
  const match = [...host.querySelectorAll('button')].find((candidate) => {
    const label =
      candidate.getAttribute('aria-label') ?? candidate.textContent.trim();
    return typeof name === 'string' ? label === name : name.test(label);
  });
  if (!match) throw new Error(`No button ${String(name)}`);
  return match;
}

async function click(name: string | RegExp) {
  await act(async () => {
    button(name).click();
    await flush();
  });
}

async function start() {
  await click('Get started');
}

function errorFor(name: string, index = 0): string | null {
  const control = field(name, index);
  if (control.getAttribute('aria-invalid') !== 'true') return null;
  const ids = control.getAttribute('aria-describedby')?.split(' ') ?? [];
  return (
    ids
      .map((id) => document.getElementById(id))
      .find((element) => element?.id.endsWith('-error'))?.textContent ?? null
  );
}

function fillPersonal() {
  type('First name', 'Alex');
  type('Last name', 'Sample');
  type('Email address', 'alex.sample@example.com');
  type('Phone number', '+44 20 7946 0000');
  type('Address line 1', '1 Example Street');
  type('Town or city', 'London');
  type('Postcode', 'N1 9GU');
  chooseCountry('United Kingdom');
}

function storedDraft(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    savedAt: '2026-10-16T18:30:00.000Z',
    basedOn: null,
    step: 'education',
    furthest: 1,
    draft: validDraft(),
    ...overrides,
  };
}

describe('first-run onboarding', () => {
  it('requires personal details before continuing', async () => {
    await render(memoryStore().store);
    await start();

    await click('Continue');

    expect(heading()).toBe('Personal details');
    expect(errorFor('First name')).toBe('Enter your first name');
    expect(errorFor('Email address')).toBe('Enter your email address');
    expect(errorFor('Preferred name')).toBeNull();
    expect(errorFor('Address line 2')).toBeNull();
    expect(errorFor('Country')).toBe('Choose your country');
    expect(document.activeElement).toBe(field('First name'));
  });

  it('keeps values when going back and forth between steps', async () => {
    await render(memoryStore().store);
    await start();
    fillPersonal();
    type('Preferred name', 'Al');

    await click('Continue');
    expect(heading()).toBe('Education');
    await click('Back');

    expect(heading()).toBe('Personal details');
    expect((field('First name') as HTMLInputElement).value).toBe('Alex');
    expect((field('Preferred name') as HTMLInputElement).value).toBe('Al');
  });

  it('adds, validates, edits and removes an education record', async () => {
    await render(memoryStore().store);
    await start();
    fillPersonal();
    await click('Continue');

    expect(host.textContent).toContain('No education added');
    await click('Add education');
    await click('Done');
    expect(errorFor('Institution')).toBe('Enter the institution');

    type('Institution', 'Example University');
    type('Degree or qualification', 'BA');
    type('Field of study', 'History');
    type('Start date', '2019-09');
    type('End date', '2022-06');
    await click('Done');

    expect(host.textContent).toContain('BA, History');
    expect(host.textContent).toContain(
      'Example University · Sep 2019 – Jun 2022',
    );

    await click('Edit BA, History');
    type('Grade or classification', 'First-class honours');
    await click('Done');

    await click('Remove BA, History');
    expect(host.textContent).toContain('Remove this education?');
    await click('Remove');
    expect(host.textContent).toContain('No education added');
  });

  it('never uses the first name as a preferred name unless asked', async () => {
    const { store, saved } = memoryStore();
    await render(store);
    await start();
    fillPersonal();
    const reuse = field(
      'If I leave this empty, use my first name when a form asks for a preferred name',
    ) as HTMLInputElement;
    expect(reuse.checked).toBe(false);

    await act(async () => {
      reuse.click();
      await Promise.resolve();
    });
    for (let i = 0; i < 4; i++) await click('Continue');
    expect(host.textContent).toContain('Same as first name');
    await click('Save profile');

    expect(saved[0]?.personal).toMatchObject({
      preferredName: '',
      useFirstNameAsPreferred: true,
    });
  });

  it('saves a complete profile after review', async () => {
    const { store, saved } = memoryStore();
    await render(store);
    await start();
    fillPersonal();
    await click('Continue'); // → Education, left empty
    await click('Continue'); // → Experience
    await click('Add role');
    type('Job title', 'Designer');
    type('Employer', 'Example Ltd');
    type('Employment type', 'full-time');
    type('Start date', '2023-01');
    await act(async () => {
      (field('I currently work here') as HTMLInputElement).click();
      await Promise.resolve();
    });
    await click('Continue'); // → Links
    type('Portfolio or personal website', 'example.com');
    await click('Continue'); // → Review

    expect(heading()).toBe('Review your profile');
    expect(host.textContent).toContain('https://example.com');
    expect(host.textContent).toContain('Jan 2023 – Present');

    await click('Save profile');

    expect(store.save).toHaveBeenCalledTimes(1);
    expect(saved[0]).toMatchObject({
      personal: {
        firstName: 'Alex',
        email: 'alex.sample@example.com',
        address: { country: 'GB' },
      },
      education: [],
      employment: [
        {
          title: 'Designer',
          employer: 'Example Ltd',
          employmentType: 'full-time',
          current: true,
          endDate: '',
        },
      ],
      links: { portfolio: 'https://example.com', linkedin: '' },
      metadata: {
        schemaVersion: 3,
        createdAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    });
    expect(heading()).toBe('Your profile');
    expect(host.textContent).toContain('Profile saved');
    expect(button('Saved').disabled).toBe(true);
  });

  it('shows a storage failure and keeps the entered data', async () => {
    const { store } = memoryStore(
      { status: 'empty' },
      {
        saveResult: {
          status: 'error',
          message: 'ApplyKit could not save your profile.',
        },
      },
    );
    await render(store);
    await start();
    fillPersonal();
    for (let i = 0; i < 4; i++) await click('Continue');

    await click('Save profile');

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'ApplyKit could not save your profile.',
    );
    expect(host.textContent).not.toContain('Profile saved');
    expect(button('Save profile').disabled).toBe(false);
    expect(host.textContent).toContain('alex.sample@example.com');
  });
});

describe('editing a saved profile', () => {
  it('never overwrites a newer save from another tab', async () => {
    const existing = validProfile('2026-01-01T00:00:00.000Z');
    const newer = validProfile('2026-02-01T00:00:00.000Z');
    newer.personal.phone = '020 7946 0999';
    const { store, saved } = memoryStore(
      { status: 'loaded', profile: existing, unmatchedCountry: null },
      { saveResult: { status: 'conflict', current: newer } },
    );
    await render(store);
    await click('Edit personal details');
    type('Phone number', '020 7946 0001');
    for (let i = 0; i < 4; i++) await click('Continue');

    await click('Save changes');

    // The edit started from the existing version, and says so.
    expect(store.save).toHaveBeenCalledWith(
      expect.anything(),
      '2026-01-01T00:00:00.000Z',
    );
    expect(saved).toEqual([]);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'saved in another tab',
    );
    // This tab's edits are still here, unsaved.
    expect(host.textContent).toContain('020 7946 0001');
    expect(host.textContent).toContain('Unsaved changes');
    expect(store.clearDraft).not.toHaveBeenCalled();

    await click('Discard my edits and load the saved version');

    expect(store.clearDraft).toHaveBeenCalled();
    expect(host.textContent).toContain('020 7946 0999');
    expect(host.textContent).not.toContain('020 7946 0001');
    expect(button('Saved').disabled).toBe(true);
  });

  it('opens a saved profile that today’s rules reject, and says so', async () => {
    const existing = validProfile('2026-01-01T00:00:00.000Z');
    existing.personal.email = 'not-an-address';
    const { store } = memoryStore({
      status: 'loaded',
      profile: existing,
      unmatchedCountry: null,
    });

    await render(store);

    expect(heading()).toBe('Your profile');
    expect(host.textContent).toContain('Alex');
    expect(host.textContent).toContain('no longer pass ApplyKit’s checks');
  });

  it('passes no version for a first save', async () => {
    const { store } = memoryStore();
    await render(store);
    await start();
    fillPersonal();
    for (let i = 0; i < 4; i++) await click('Continue');

    await click('Save profile');

    expect(store.save).toHaveBeenCalledWith(expect.anything(), null);
  });

  it('opens on the overview and saves changes, keeping the creation date', async () => {
    const existing = validProfile('2026-01-01T00:00:00.000Z');
    const { store, saved } = memoryStore({
      status: 'loaded',
      profile: existing,
      unmatchedCountry: null,
    });
    await render(store);

    expect(heading()).toBe('Your profile');
    expect(host.textContent).toContain('alex.sample@example.com');
    expect(button('Saved').disabled).toBe(true);

    await click('Edit personal details');
    type('Phone number', '020 7946 0001');
    for (let i = 0; i < 4; i++) await click('Continue');
    expect(host.textContent).toContain('Unsaved changes');
    await click('Save changes');

    expect(saved[0]?.personal.phone).toBe('020 7946 0001');
    expect(saved[0]?.metadata).toEqual({
      schemaVersion: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: NOW.toISOString(),
    });
  });

  it('sends the user back to fix errors instead of saving', async () => {
    const { store } = memoryStore({
      status: 'loaded',
      profile: validProfile(),
      unmatchedCountry: null,
    });
    await render(store);

    await click('Edit personal details');
    type('Email address', 'not-an-email');
    await click('Review');
    await click('Save changes');

    expect(store.save).not.toHaveBeenCalled();
    expect(heading()).toBe('Personal details');
    expect(errorFor('Email address')).toBe(
      'Enter an email address like name@example.com',
    );
  });
});

describe('stored data problems', () => {
  it('explains unreadable stored data on the welcome screen', async () => {
    await render(memoryStore({ status: 'invalid' }).store);

    expect(heading()).toBe('Your next application, a little easier.');
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(
      /could not read.*kept as a backup/,
    );
  });

  it('reports a storage read failure without offering to start over', async () => {
    const { store, drafts } = memoryStore({
      status: 'error',
      message: 'Storage is unavailable.',
    });
    await render(store);

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Storage is unavailable.',
    );
    expect(host.textContent).not.toContain('Get started');
    await flush();
    expect(drafts).toEqual([]);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('reads stored data again on request', async () => {
    const { store } = memoryStore({
      status: 'error',
      message: 'Storage is unavailable.',
    });
    await render(store);
    store.load.mockResolvedValue({ status: 'empty' });

    await act(async () => {
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Try again')
        ?.click();
      await Promise.resolve();
    });
    await flush();

    expect(store.load).toHaveBeenCalledTimes(2);
    expect(heading()).toBe('Your next application, a little easier.');
  });

  it('does not start over when unsaved changes cannot be read', async () => {
    const { store, drafts } = memoryStore(
      { status: 'empty' },
      { draft: { status: 'error' } },
    );
    await render(store);

    expect(host.textContent).toContain('could not read your unsaved changes');
    expect(host.textContent).not.toContain('Get started');
    expect(drafts).toEqual([]);
  });
});

describe('welcome', () => {
  it('introduces ApplyKit before the first step', async () => {
    await render(memoryStore().store);

    expect(heading()).toBe('Your next application, a little easier.');
    expect(host.textContent).toContain('never submits anything');
    expect(host.textContent).toContain('stored only in this browser');

    await start();

    expect(heading()).toBe('Personal details');
    expect(document.activeElement).toBe(host.querySelector('h1'));
  });

  it('goes straight to the overview for a saved profile', async () => {
    await render(
      memoryStore({
        status: 'loaded',
        profile: validProfile(),
        unmatchedCountry: null,
      }).store,
    );

    expect(heading()).toBe('Your profile');
    expect(host.textContent).not.toContain('Get started');
  });
});

describe('drafts', () => {
  it('saves a draft after a pause, not on every keystroke', async () => {
    vi.useFakeTimers();
    const { store, drafts } = memoryStore();
    await render(store);
    await start();

    type('First name', 'A');
    type('First name', 'Al');
    type('First name', 'Alex');
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY - 1);
    });
    expect(store.saveDraft).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(1);
      await flush();
    });

    expect(store.saveDraft).toHaveBeenCalledTimes(1);
    expect(drafts[0]).toMatchObject({
      basedOn: null,
      step: 'personal',
      draft: { personal: { firstName: 'Alex' } },
    });
    expect(store.save).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Progress saved in this browser');
  });

  it('restores unfinished onboarding where the user left off', async () => {
    await render(
      memoryStore(
        { status: 'empty' },
        {
          draft: { status: 'loaded', draft: storedDraft() },
        },
      ).store,
    );

    expect(heading()).toBe('Education');
    expect(host.textContent).toContain('Welcome back');

    await click('Back');
    expect((field('First name') as HTMLInputElement).value).toBe('Alex');
    expect((field('Country') as HTMLInputElement).value).toBe('United Kingdom');
  });

  it('can start over from restored progress', async () => {
    const { store } = memoryStore(
      { status: 'empty' },
      {
        draft: { status: 'loaded', draft: storedDraft() },
      },
    );
    await render(store);

    await click('Start over');
    expect(host.textContent).toContain('Clear everything entered?');
    await click('Start over');

    expect(heading()).toBe('Your next application, a little easier.');
    expect(store.clearDraft).toHaveBeenCalled();
  });

  it('keeps the confirmed profile untouched while edits are autosaved', async () => {
    vi.useFakeTimers();
    const profile = validProfile();
    const { store, drafts } = memoryStore({
      status: 'loaded',
      profile,
      unmatchedCountry: null,
    });
    await render(store);

    await click('Edit personal details');
    type('Phone number', '020 7946 0001');
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY);
      await flush();
    });

    expect(drafts[0]).toMatchObject({
      basedOn: profile.metadata.updatedAt,
      draft: { personal: { phone: '020 7946 0001' } },
    });
    expect(store.save).not.toHaveBeenCalled();
    expect(profile.personal.phone).toBe('+44 20 7946 0000');
  });

  it('restores unsaved edits and can discard them', async () => {
    const profile = validProfile();
    const edited = validDraft();
    edited.personal.phone = '020 7946 0001';
    const { store } = memoryStore(
      { status: 'loaded', profile, unmatchedCountry: null },
      {
        draft: {
          status: 'loaded',
          draft: storedDraft({
            basedOn: profile.metadata.updatedAt,
            step: 'review',
            furthest: 4,
            draft: edited,
          }),
        },
      },
    );
    await render(store);

    expect(host.textContent).toContain('020 7946 0001');
    expect(host.textContent).toContain('Restored changes you had not saved');

    await click('Discard changes');
    await click('Discard');

    expect(host.textContent).toContain('+44 20 7946 0000');
    expect(host.textContent).not.toContain('020 7946 0001');
    expect(store.clearDraft).toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('discards a draft made obsolete by a later save', async () => {
    const profile = validProfile('2026-10-18T09:00:00.000Z');
    const stale = validDraft();
    stale.personal.phone = '020 7946 0001';
    const { store } = memoryStore(
      { status: 'loaded', profile, unmatchedCountry: null },
      {
        draft: {
          status: 'loaded',
          draft: storedDraft({
            basedOn: '2026-10-01T09:00:00.000Z',
            draft: stale,
          }),
        },
      },
    );
    await render(store);

    expect(store.clearDraft).toHaveBeenCalled();
    expect(host.textContent).toContain('+44 20 7946 0000');
    expect(host.textContent).not.toContain('020 7946 0001');
  });

  it('stops autosaving once the profile is saved', async () => {
    vi.useFakeTimers();
    const { store } = memoryStore(
      { status: 'empty' },
      {
        draft: {
          status: 'loaded',
          draft: storedDraft({ step: 'review', furthest: 4 }),
        },
      },
    );
    await render(store);

    await click('Save profile');
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY * 2);
      await flush();
    });

    expect(store.save).toHaveBeenCalledTimes(1);
    expect(store.saveDraft).not.toHaveBeenCalled();
    expect(host.textContent).toContain('Profile saved');
  });

  it('says when a draft cannot be kept', async () => {
    vi.useFakeTimers();
    const { store } = memoryStore({ status: 'empty' }, { draftWrites: false });
    await render(store);
    await start();

    type('First name', 'Alex');
    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY);
      await flush();
    });

    expect(host.textContent).toContain('Could not keep a draft');
  });
});

describe('country', () => {
  it('asks the user to choose again when an old country did not match', async () => {
    const profile = validProfile();
    profile.personal.address.country = '';
    await render(
      memoryStore({ status: 'loaded', profile, unmatchedCountry: 'England' })
        .store,
    );

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'could not match “England”',
    );
  });
});

describe('CV import', () => {
  async function importCv() {
    const input = host.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('No file input');
    Object.defineProperty(input, 'files', {
      value: [new File(['fictional'], 'Alex_Sample_CV.pdf')],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await flush();
    });
    await click('Add to profile');
  }

  it('fills the draft from the welcome screen without saving anything', async () => {
    const { store } = memoryStore();
    await render(store);

    await click('Import from CV');
    expect(heading()).toBe('Import from your CV');
    await importCv();

    expect(heading()).toBe('Personal details');
    expect((field('First name') as HTMLInputElement).value).toBe('Alex');
    expect((field('Email address') as HTMLInputElement).value).toBe(
      'alex.sample@example.com',
    );
    expect(host.textContent).toContain('Added 9 details from your CV');
    expect(store.save).not.toHaveBeenCalled();
  });

  it('still requires everything the profile needs before continuing', async () => {
    await render(memoryStore().store);
    await click('Import from CV');
    await importCv();

    await click('Continue');

    expect(heading()).toBe('Personal details');
    expect(errorFor('Address line 1')).toBe(
      'Enter the first line of your address',
    );
    expect(errorFor('First name')).toBeNull();
  });

  it('keeps imported details in the draft, not the saved profile', async () => {
    vi.useFakeTimers();
    const { store, drafts } = memoryStore();
    await render(store);
    await click('Import from CV');
    await importCv();

    await act(async () => {
      vi.advanceTimersByTime(AUTOSAVE_DELAY);
      await flush();
    });

    expect(drafts.at(-1)?.draft.personal.firstName).toBe('Alex');
    expect(drafts.at(-1)?.draft.employment).toHaveLength(2);
    expect(store.save).not.toHaveBeenCalled();
  });

  it('changes only the draft of a saved profile until it is saved', async () => {
    const profile = validProfile();
    const { store, saved } = memoryStore({
      status: 'loaded',
      profile,
      unmatchedCountry: null,
    });
    await render(store);

    await click('Import from CV');
    await importCv();

    expect(heading()).toBe('Your profile');
    expect(host.textContent).toContain('https://linkedin.com/in/alex-sample');
    expect(host.textContent).toContain('Unsaved changes');
    expect(store.save).not.toHaveBeenCalled();

    await click('Save changes');

    expect(saved[0]?.links.linkedin).toBe(
      'https://linkedin.com/in/alex-sample',
    );
    expect(saved[0]?.personal.address).toEqual(profile.personal.address);
    expect(saved[0]?.employment).toHaveLength(2);
  });

  it('can discard imported changes to a saved profile', async () => {
    const { store } = memoryStore({
      status: 'loaded',
      profile: validProfile(),
      unmatchedCountry: null,
    });
    await render(store);
    await click('Import from CV');
    await importCv();

    await click('Discard changes');
    await click('Discard');

    expect(host.textContent).not.toContain(
      'https://linkedin.com/in/alex-sample',
    );
    expect(store.save).not.toHaveBeenCalled();
  });
});
