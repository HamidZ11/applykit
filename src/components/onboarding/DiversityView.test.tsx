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
import { setSelectValue } from '@/autofill/fill';
import { emptyDiversity } from '@/domain/diversity';
import { browserDiversityStore } from '@/storage/diversity-store';
import type { ProfileStore } from '@/storage/profile-store';
import { savedDiversity } from '@/test/diversity-fixtures';
import { validProfile } from '@/test/profile-fixtures';
import { DiversityView } from './DiversityView';
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

function button(name: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name,
  );
  if (!found) throw new Error(`No button ${name}`);
  return found;
}

async function click(name: string) {
  act(() => {
    button(name).click();
  });
  await flush();
}

function list(title: string): HTMLSelectElement {
  const label = [...host.querySelectorAll('label')].find(
    (l) => l.textContent.replace(/Optional$/, '').trim() === title,
  );
  const element = label && document.getElementById(label.htmlFor);
  if (!(element instanceof HTMLSelectElement)) throw new Error(`No ${title}`);
  return element;
}

function reuse(): HTMLInputElement {
  const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!box) throw new Error('No reuse checkbox');
  return box;
}

function choose(title: string, value: string) {
  act(() => {
    setSelectValue(list(title), value);
  });
}

async function stored() {
  return browserDiversityStore.load();
}

describe('DiversityView', () => {
  it('explains the section, with reuse off and nothing saved', async () => {
    await render(<DiversityView now={() => NOW} />);

    expect(host.querySelector('h1')?.textContent).toBe('Diversity & Inclusion');
    expect(host.textContent).toContain(
      'Save optional responses to common diversity questions',
    );
    expect(reuse().checked).toBe(false);
    expect(reuse().closest('label')?.textContent).toContain(
      'Use these answers when autofilling',
    );
    expect(reuse().closest('label')?.textContent).toContain(
      'saving answers does not turn it on',
    );
    for (const title of [
      'Gender',
      'Ethnic group',
      'Disability',
      'Religion or belief',
      'Sexual orientation',
    ]) {
      expect(list(title).value, title).toBe('');
      expect(list(title).selectedOptions[0]?.text).toBe('No saved answer');
    }
  });

  it('saves answers without turning reuse on', async () => {
    await render(<DiversityView now={() => NOW} />);

    choose('Ethnic group', 'other-mixed');
    choose('Disability', 'prefer-not-to-say');
    await click('Save answers');

    expect(await stored()).toMatchObject({
      preferences: {
        reuse: false,
        answers: {
          ethnicity: 'other-mixed',
          disability: 'prefer-not-to-say',
          gender: null,
        },
      },
    });
    // Saving names the setting once; it is not turned on.
    expect(host.textContent).toContain(
      'They are used when autofilling only if you turn on “Use these answers when autofilling” below.',
    );
  });

  it('asks to save changes before reuse can be turned on', async () => {
    await render(<DiversityView now={() => NOW} />);

    choose('Disability', 'no');

    expect(reuse().disabled).toBe(true);
    expect(reuse().closest('label')?.textContent).toContain(
      'Save your changes first.',
    );
    await click('Save answers');
    expect(reuse().disabled).toBe(false);
    expect(reuse().checked).toBe(false);
  });

  it('turns reuse on and off at once, keeping answers', async () => {
    await browserDiversityStore.save(
      { ...savedDiversity(), reuse: false },
      null,
      NOW,
    );
    const later = new Date('2026-10-18T13:00:00.000Z');
    await render(<DiversityView now={() => later} />);

    act(() => {
      reuse().click();
    });
    await flush();
    expect(await stored()).toMatchObject({
      preferences: { reuse: true, answers: savedDiversity().answers },
    });

    act(() => {
      reuse().click();
    });
    await flush();
    expect(await stored()).toMatchObject({
      preferences: { reuse: false, answers: savedDiversity().answers },
    });
  });

  it('clears one answer back to no saved answer', async () => {
    await browserDiversityStore.save(savedDiversity(), null, NOW);
    await render(
      <DiversityView now={() => new Date('2026-10-18T13:00:00.000Z')} />,
    );

    choose('Religion or belief', '');
    await click('Save answers');

    expect(await stored()).toMatchObject({
      preferences: { answers: { religion: null, disability: 'no' } },
    });
  });

  it('deletes everything only after confirming', async () => {
    await browserDiversityStore.save(savedDiversity(), null, NOW);
    await fakeBrowser.storage.local.set({
      diversityPreferencesBackup: [{ backedUpAt: null, data: 'x' }],
    });
    await render(<DiversityView now={() => NOW} />);

    await click('Clear all diversity preferences');
    expect(host.textContent).toContain(
      'Delete every answer and backup copy, and turn reuse off?',
    );
    await click('Cancel');
    expect(await stored()).toMatchObject({ preferences: savedDiversity() });

    await click('Clear all diversity preferences');
    await click('Delete all');

    expect(await stored()).toMatchObject({
      preferences: emptyDiversity(),
      updatedAt: null,
    });
    expect(
      (await fakeBrowser.storage.local.get('diversityPreferencesBackup'))
        .diversityPreferencesBackup,
    ).toBeUndefined();
    expect(host.textContent).toContain('All diversity preferences deleted.');
    expect(reuse().checked).toBe(false);
  });

  it('never overwrites a save from another tab, keeping unsaved answers', async () => {
    await browserDiversityStore.save(savedDiversity(), null, NOW);
    await render(
      <DiversityView now={() => new Date('2026-10-18T14:00:00.000Z')} />,
    );
    choose('Gender', 'woman');
    await browserDiversityStore.save(
      { ...savedDiversity(), reuse: false },
      NOW.toISOString(),
      new Date('2026-10-18T13:00:00.000Z'),
    );

    await click('Save answers');

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'changed in another tab, so this was not saved',
    );
    expect(list('Gender').value).toBe('woman');
    expect(reuse().checked).toBe(false);
    expect(await stored()).toMatchObject({
      preferences: { reuse: false, answers: { gender: 'non-binary' } },
    });
  });

  it('changes nothing when storage fails', async () => {
    await render(<DiversityView now={() => NOW} />);
    choose('Gender', 'man');
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(
      new Error('quota'),
    );

    await click('Save answers');

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'could not save your preferences',
    );
    expect(list('Gender').value).toBe('man');
    expect(await stored()).toMatchObject({ updatedAt: null });
  });

  it('is read-only for preferences from a newer version', async () => {
    const newer = {
      schemaVersion: 2,
      preferences: { reuse: true, answers: {} },
      updatedAt: NOW.toISOString(),
    };
    await fakeBrowser.storage.local.set({ diversityPreferences: newer });

    await render(<DiversityView now={() => NOW} />);

    expect(host.textContent).toContain('saved by a newer version of ApplyKit');
    expect(host.querySelectorAll('select, input')).toHaveLength(0);
    expect(
      (await fakeBrowser.storage.local.get('diversityPreferences'))
        .diversityPreferences,
    ).toEqual(newer);

    // Still the user's to delete.
    await click('Clear all diversity preferences');
    await click('Delete all');

    expect(
      (await fakeBrowser.storage.local.get('diversityPreferences'))
        .diversityPreferences,
    ).toBeUndefined();
    expect(reuse().checked).toBe(false);
  });

  it('turns reuse off even after a save in another tab', async () => {
    await browserDiversityStore.save(savedDiversity(), null, NOW);
    await render(
      <DiversityView now={() => new Date('2026-10-18T14:00:00.000Z')} />,
    );
    await browserDiversityStore.save(
      {
        ...savedDiversity(),
        answers: { ...savedDiversity().answers, gender: 'woman' },
      },
      NOW.toISOString(),
      new Date('2026-10-18T13:00:00.000Z'),
    );

    act(() => {
      reuse().click();
    });
    await flush();

    expect(await stored()).toMatchObject({
      preferences: { reuse: false, answers: { gender: 'woman' } },
    });
    expect(reuse().checked).toBe(false);
    expect(host.textContent).toContain(
      'Reuse turned off. Your answers are kept.',
    );
  });

  it('keeps unsaved answers across a visit to the profile', async () => {
    window.location.hash = '#diversity';
    const profileStore: ProfileStore = {
      load: () =>
        Promise.resolve({
          status: 'loaded',
          profile: validProfile(),
          unmatchedCountry: null,
        }),
      save: (profile) => Promise.resolve({ status: 'saved', profile }),
      loadDraft: () => Promise.resolve({ status: 'none' }),
      saveDraft: () => Promise.resolve(true),
      clearDraft: () => Promise.resolve(true),
    };
    await render(<OnboardingApp store={profileStore} now={() => NOW} />);
    expect(host.querySelector('h1')?.textContent).toBe('Diversity & Inclusion');
    choose('Disability', 'yes');

    await click('Personal details');
    await click('Diversity & Inclusion');

    expect(list('Disability').value).toBe('yes');
    expect(await stored()).toMatchObject({ updatedAt: null });
  });
});
