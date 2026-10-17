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
import type { UserProfile } from '@/domain/user-profile';
import type {
  LoadResult,
  ProfileStore,
  SaveResult,
} from '@/storage/profile-store';
import { validProfile } from '@/test/profile-fixtures';
import { OnboardingApp } from './OnboardingApp';

const NOW = new Date('2026-10-17T12:00:00.000Z');

let root: Root;
let host: HTMLElement;

/** An in-memory store standing in for browser storage. */
function memoryStore(
  initial: LoadResult = { status: 'empty' },
  saveResult?: SaveResult,
) {
  const saved: UserProfile[] = [];
  const store = {
    load: vi.fn(() => Promise.resolve(initial)),
    save: vi.fn((profile: UserProfile) => {
      if (saveResult) return Promise.resolve(saveResult);
      saved.push(profile);
      return Promise.resolve<SaveResult>({ status: 'saved', profile });
    }),
  } satisfies ProfileStore;
  return { store, saved };
}

async function render(store: ProfileStore) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root.render(<OnboardingApp store={store} now={() => NOW} />);
    await Promise.resolve();
  });
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = () => undefined;
});

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
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
    await Promise.resolve();
  });
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
  type('Country', 'United Kingdom');
}

describe('first-run onboarding', () => {
  it('requires personal details before continuing', async () => {
    await render(memoryStore().store);

    await click('Continue');

    expect(heading()).toBe('Personal details');
    expect(errorFor('First name')).toBe('Enter your first name');
    expect(errorFor('Email address')).toBe('Enter your email address');
    expect(errorFor('Preferred name')).toBeNull();
    expect(errorFor('Address line 2')).toBeNull();
    expect(document.activeElement).toBe(field('First name'));
  });

  it('keeps values when going back and forth between steps', async () => {
    await render(memoryStore().store);
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

  it('saves a complete profile after review', async () => {
    const { store, saved } = memoryStore();
    await render(store);
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
      personal: { firstName: 'Alex', email: 'alex.sample@example.com' },
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
        schemaVersion: 1,
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
      { status: 'error', message: 'ApplyKit could not save your profile.' },
    );
    await render(store);
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
  it('opens on the overview and saves changes, keeping the creation date', async () => {
    const existing = validProfile('2026-01-01T00:00:00.000Z');
    const { store, saved } = memoryStore({
      status: 'loaded',
      profile: existing,
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
      schemaVersion: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: NOW.toISOString(),
    });
  });

  it('sends the user back to fix errors instead of saving', async () => {
    const { store } = memoryStore({
      status: 'loaded',
      profile: validProfile(),
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
  it('explains unreadable stored data and starts fresh', async () => {
    await render(memoryStore({ status: 'invalid' }).store);

    expect(heading()).toBe('Personal details');
    expect(host.querySelector('[role="alert"]')?.textContent).toMatch(
      /could not read.*kept as a backup/,
    );
  });

  it('reports a storage read failure', async () => {
    await render(
      memoryStore({ status: 'error', message: 'Storage is unavailable.' })
        .store,
    );

    expect(host.querySelector('[role="alert"]')?.textContent).toBe(
      'Storage is unavailable.',
    );
  });
});
