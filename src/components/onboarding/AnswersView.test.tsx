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
import { setInputValue, setSelectValue } from '@/autofill/fill';
import { emptyAnswers } from '@/domain/application-answers';
import type { LoadResult, ProfileStore } from '@/storage/profile-store';
import { browserAnswersStore } from '@/storage/answers-store';
import { savedAnswers } from '@/test/answer-fixtures';
import { validProfile } from '@/test/profile-fixtures';
import { AnswersView } from './AnswersView';
import { OnboardingApp } from './OnboardingApp';

const NOW = new Date('2026-10-18T12:00:00.000Z');

let root: Root;
let host: HTMLElement;

async function flush() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function render(element: React.ReactElement) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(element);
  });
  await flush();
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.scrollTo = () => undefined;
});

beforeEach(() => {
  document.body.innerHTML = '';
  fakeBrowser.reset();
  window.location.hash = '';
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
});

function row(title: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(`li[aria-label="${title}"]`);
  if (!found) throw new Error(`No row ${title}`);
  return found;
}

function button(name: string, within: ParentNode = host): HTMLButtonElement {
  const found = [...within.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name,
  );
  if (!found) throw new Error(`No button ${name}`);
  return found;
}

async function click(name: string, within?: ParentNode) {
  act(() => {
    button(name, within).click();
  });
  await flush();
}

/** The control labelled `name` inside the open editor. */
function control(name: string): HTMLInputElement | HTMLSelectElement {
  const label = [...host.querySelectorAll('label')].find(
    (l) => l.textContent.trim() === name,
  );
  const element = label && document.getElementById(label.htmlFor);
  if (
    !(element instanceof HTMLInputElement) &&
    !(element instanceof HTMLSelectElement)
  ) {
    throw new Error(`No control ${name}`);
  }
  return element;
}

function enter(name: string, value: string) {
  const element = control(name);
  act(() => {
    if (element instanceof HTMLSelectElement) setSelectValue(element, value);
    else setInputValue(element, value);
  });
}

async function stored() {
  return browserAnswersStore.load();
}

describe('AnswersView', () => {
  it('lists every category as optional and not saved', async () => {
    await render(<AnswersView now={() => NOW} />);

    expect(host.querySelector('h1')?.textContent).toBe('Application answers');
    for (const title of [
      'Notice period',
      'Relocation',
      'Working arrangement',
      'Earliest start date',
      'Salary expectation',
    ]) {
      expect(row(title).textContent).toContain('Not saved');
      expect(button(`Add ${title.toLowerCase()}`).className).toMatch(
        /\bborder\b/,
      );
    }
    expect(host.textContent).toContain('nothing is filled until you choose');
  });

  it('adds an answer and saves only it', async () => {
    await render(<AnswersView now={() => NOW} />);

    await click('Add notice period');
    expect(document.activeElement).toBe(control('Notice'));
    enter('Notice', '4');
    enter('Unit', 'weeks');
    await click('Save answer');

    expect(row('Notice period').textContent).toContain('4 weeks');
    expect(host.textContent).toContain('Notice period saved.');
    expect(await stored()).toMatchObject({
      answers: {
        ...emptyAnswers(),
        noticePeriod: { amount: 4, unit: 'weeks' },
      },
      updatedAt: NOW.toISOString(),
    });
    expect(document.activeElement).toBe(button('Edit notice period'));
  });

  it('checks an answer before saving it', async () => {
    await render(<AnswersView now={() => NOW} />);

    await click('Add notice period');
    await click('Save answer');
    expect(host.textContent).toContain('Enter a number');

    await click('Cancel');
    await click('Add relocation');
    await click('Save answer');
    expect(host.textContent).toContain(
      'Answer at least one of the two questions',
    );

    await click('Cancel');
    await click('Add salary expectation');
    enter('Amount', '32,000.505');
    await click('Save answer');
    expect(host.textContent).toContain('Use at most two decimal places');
    expect(await stored()).toMatchObject({ updatedAt: null });
  });

  it('edits and removes a saved answer', async () => {
    await browserAnswersStore.save(savedAnswers(), null, NOW);
    const later = new Date('2026-10-18T13:00:00.000Z');
    await render(<AnswersView now={() => later} />);
    expect(row('Salary expectation').textContent).toContain('£32,000 a year');

    await click('Edit working arrangement');
    enter('Preferred arrangement', 'remote');
    await click('Save answer');
    expect(row('Working arrangement').textContent).toContain('Remote');

    await click('Remove salary expectation');
    expect(row('Salary expectation').textContent).toContain(
      'Remove this answer?',
    );
    await click('Remove', row('Salary expectation'));

    expect(row('Salary expectation').textContent).toContain('Not saved');
    expect(await stored()).toMatchObject({
      answers: { ...savedAnswers(), workArrangement: 'remote', salary: null },
    });
  });

  it('cancels with Escape without saving', async () => {
    await render(<AnswersView now={() => NOW} />);
    await click('Add earliest start date');
    enter('Earliest start date', '2027-01-04');

    act(() => {
      control('Earliest start date').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
    });
    await flush();

    expect(row('Earliest start date').textContent).toContain('Not saved');
    expect(document.activeElement).toBe(button('Add earliest start date'));
    expect(await stored()).toMatchObject({ updatedAt: null });
  });

  it('never overwrites answers saved in another tab', async () => {
    await browserAnswersStore.save(savedAnswers(), null, NOW);
    await render(
      <AnswersView now={() => new Date('2026-10-18T14:00:00.000Z')} />,
    );
    await click('Edit notice period');
    enter('Notice', '8');
    // Meanwhile another tab changes a different answer.
    await browserAnswersStore.save(
      { ...savedAnswers(), workArrangement: 'on-site' },
      NOW.toISOString(),
      new Date('2026-10-18T13:00:00.000Z'),
    );

    await click('Save answer');

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'changed in another tab, so this was not saved',
    );
    expect(row('Working arrangement').textContent).toContain('On-site');
    expect(control('Notice').value).toBe('8');
    expect(await stored()).toMatchObject({
      answers: { noticePeriod: { amount: 4 }, workArrangement: 'on-site' },
    });

    // Saving again keeps the other tab's change and adds this one.
    await click('Save answer');
    expect(await stored()).toMatchObject({
      answers: { noticePeriod: { amount: 8 }, workArrangement: 'on-site' },
    });
  });

  it('says when saved answers cannot be read, and changes nothing', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(
      new Error('unavailable'),
    );
    await render(<AnswersView now={() => NOW} />);

    expect(host.textContent).toContain(
      'ApplyKit could not read your saved answers',
    );
    expect(host.querySelector('li')).toBeNull();

    await click('Try again');
    expect(row('Notice period').textContent).toContain('Not saved');
  });

  it('warns about a damaged answer instead of hiding it', async () => {
    await fakeBrowser.storage.local.set({
      applicationAnswers: {
        schemaVersion: 1,
        answers: { ...savedAnswers(), salary: { amount: 'lots' } },
        updatedAt: NOW.toISOString(),
      },
    });
    await render(<AnswersView now={() => NOW} />);

    expect(host.textContent).toContain(
      'Some saved answers could not be read (Salary expectation)',
    );
    expect(row('Notice period').textContent).toContain('4 weeks');
  });
});

describe('the answers section of the profile page', () => {
  function profileStore(initial: LoadResult): ProfileStore {
    return {
      load: () => Promise.resolve(initial),
      save: (profile) => Promise.resolve({ status: 'saved', profile }),
      loadDraft: () => Promise.resolve({ status: 'none' }),
      saveDraft: () => Promise.resolve(true),
      clearDraft: () => Promise.resolve(true),
    };
  }

  it('opens at the answers when the panel links to them', async () => {
    window.location.hash = '#answers';
    await render(
      <OnboardingApp
        store={profileStore({
          status: 'loaded',
          profile: validProfile(),
          unmatchedCountry: null,
        })}
        now={() => NOW}
      />,
    );

    expect(host.querySelector('h1')?.textContent).toBe('Application answers');
    expect(button('Application answers').getAttribute('aria-current')).toBe(
      'page',
    );
  });

  it('switches between the profile and the answers from the rail', async () => {
    await render(
      <OnboardingApp
        store={profileStore({
          status: 'loaded',
          profile: validProfile(),
          unmatchedCountry: null,
        })}
        now={() => NOW}
      />,
    );
    expect(host.querySelector('h1')?.textContent).toBe('Your profile');

    await click('Application answers');
    expect(host.querySelector('h1')?.textContent).toBe('Application answers');
    expect(document.activeElement).toBe(host.querySelector('h1'));

    await click('Personal details');
    expect(host.querySelector('h1')?.textContent).toBe('Personal details');
  });

  it('keeps answers editable when the profile cannot be read', async () => {
    window.location.hash = '#answers';
    await render(
      <OnboardingApp
        store={profileStore({ status: 'invalid' })}
        now={() => NOW}
      />,
    );

    await click('Add working arrangement');
    enter('Preferred arrangement', 'hybrid');
    await click('Save answer');

    expect(await stored()).toMatchObject({
      answers: { workArrangement: 'hybrid' },
    });
  });
});
