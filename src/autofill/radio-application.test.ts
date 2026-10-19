import { describe, expect, it, vi } from 'vitest';
import type { DiversityPreferences } from '@/domain/diversity';
import { resolveDiversity } from '@/storage/diversity-source';
import { savedAnswers } from '@/test/answer-fixtures';
import { educationRecords, fullProfile } from '@/test/autofill-fixtures';
import { savedDiversity } from '@/test/diversity-fixtures';
import { loadFixture } from '@/test/load-fixture';
import { withDiversityChoices } from './diversity';
import { fillFields } from './fill';
import { autofillValuesFrom } from './profile-values';
import { checkedRadio } from './radio-group';
import { planFill, type FieldReport } from './report';
import { confirmAnswer } from './resolve';
import { scanFields } from './scan';

/**
 * Native radio groups on fixtures/radio-application.html (ADR 0020):
 * answered only where ApplyKit already answers the question, with the
 * same approval, and never anywhere else.
 */

const NOW = new Date('2026-10-18T12:00:00Z');
const visible = { isVisible: (e: Element) => !e.closest('[hidden]') };
const ALL = [
  'gender',
  'ethnicity',
  'disability',
  'religion',
  'sexualOrientation',
] as const;

function values(preferences: DiversityPreferences = savedDiversity()) {
  const profile = fullProfile();
  profile.education = educationRecords();
  return autofillValuesFrom(profile, savedAnswers(), {
    reuse: preferences.reuse,
    saved: preferences.reuse ? [...ALL] : [],
  });
}

function plan(preferences?: DiversityPreferences) {
  return planFill(scanFields(document, visible), values(preferences), NOW);
}

function resolver(preferences: DiversityPreferences = savedDiversity()) {
  const store = {
    load: () =>
      Promise.resolve({
        status: 'loaded' as const,
        preferences,
        updatedAt: '2026-10-18T12:00:00.000Z',
        damaged: [],
      }),
  };
  return (requests: Parameters<typeof resolveDiversity>[1]) =>
    resolveDiversity(store, requests);
}

/** Autofill as the panel runs it: plan, diversity choices, write. */
async function autofill(preferences: DiversityPreferences = savedDiversity()) {
  const fields = scanFields(document, visible);
  return fillFields(
    await withDiversityChoices(
      planFill(fields, values(preferences), NOW),
      resolver(preferences),
      new Set(fields.map((f) => f.element)),
    ),
  );
}

function byId(reports: FieldReport[], id: string): FieldReport {
  const found = reports.find((r) => r.field.element.id === id);
  if (!found) throw new Error(`No field #${id}`);
  return found;
}

const radio = (id: string) => document.getElementById(id) as HTMLInputElement;
const choice = (id: string) => checkedRadio(radio(id))?.value ?? null;

describe('radio groups on an application', () => {
  it('suggests saved and graduation answers, and keeps an existing choice', () => {
    loadFixture('radio-application.html');
    const reports = plan();

    expect(byId(reports, 'gradBefore-y')).toMatchObject({
      status: 'suggest',
      fillValue: 'Yes',
      note: 'Expected graduation: June 2027',
    });
    expect(byId(reports, 'relocateAbroad-y')).toMatchObject({
      status: 'suggest',
      fillValue: 'No',
    });
    expect(byId(reports, 'arrangement-remote')).toMatchObject({
      status: 'suggest',
      fillValue: 'Hybrid',
    });
    expect(byId(reports, 'relocateUk-y')).toMatchObject({
      status: 'keep',
      value: 'Yes',
    });
  });

  it('lists no disabled or hidden group, and guides an unlabelled one', () => {
    loadFixture('radio-application.html');
    const ids = plan().map((r) => r.field.element.id);

    for (const id of ['gradDisabled-y', 'gradDisabled-n', 'gradHidden-y']) {
      expect(ids, id).not.toContain(id);
    }
    expect(byId(plan(), 'mystery-a').fillValue).toBeNull();
  });

  it('never answers consent, eligibility, health, adjustments or convictions', () => {
    loadFixture('radio-application.html');
    const reports = plan();

    for (const id of [
      'rtw-y',
      'sponsorship-y',
      'health-y',
      'adjustments-y',
      'convictions-y',
      'consent',
    ]) {
      expect(byId(reports, id), id).toMatchObject({
        status: 'manual',
        fillValue: null,
      });
    }
  });
});

describe('Autofill with radio groups', () => {
  it('chooses monitoring answers with reuse on, and nothing that needs confirming', async () => {
    loadFixture('radio-application.html');
    const submit = vi.fn((event: Event) => {
      event.preventDefault();
    });
    document.getElementById('application')?.addEventListener('submit', submit);

    const outcomes = await autofill();

    expect(choice('religion-c')).toBe('none');
    expect(choice('disability-y')).toBe('n');
    expect(choice('orientation-h')).toBe('p');
    expect(byId(outcomes, 'religion-c')).toMatchObject({
      status: 'filled',
      value: null,
    });
    // Male and Female do not say the saved Non-binary.
    expect(choice('gender-male')).toBeNull();
    // Suggestions wait for "Use this answer"; nothing else is touched.
    for (const id of [
      'gradBefore-y',
      'relocateAbroad-y',
      'arrangement-remote',
      'rtw-y',
      'sponsorship-y',
      'health-y',
      'adjustments-y',
      'convictions-y',
      'mystery-a',
    ]) {
      expect(choice(id), id).toBeNull();
    }
    expect(choice('relocateUk-y')).toBe('y');
    expect(radio('consent').checked).toBe(false);
    expect(submit).not.toHaveBeenCalled();
  });

  it('chooses no monitoring answer with reuse off', async () => {
    loadFixture('radio-application.html');

    await autofill({ ...savedDiversity(), reuse: false });

    for (const id of ['religion-c', 'disability-y', 'orientation-h']) {
      expect(choice(id), id).toBeNull();
    }
    // Positive control.
    expect((document.getElementById('first') as HTMLInputElement).value).toBe(
      'Alex',
    );
  });

  it('chooses nothing where the saved answer is missing or options are ambiguous', async () => {
    loadFixture('radio-application.html');
    const preferences = savedDiversity();

    await autofill({
      ...preferences,
      answers: { ...preferences.answers, religion: null },
    });

    expect(choice('religion-c')).toBeNull();
    // Positive control: the others still fit.
    expect(choice('disability-y')).toBe('n');
  });

  it('leaves a group the page replaced after it was listed', async () => {
    loadFixture('radio-application.html');
    const fields = scanFields(document, visible);
    const planned = await withDiversityChoices(
      planFill(fields, values(), NOW),
      resolver(),
      new Set(fields.map((f) => f.element)),
    );
    const slot = document.getElementById('religion-slot');
    if (!slot) throw new Error('No slot');
    slot.innerHTML = `<fieldset>
      <legend>What is your religion?</legend>
      <label><input type="radio" id="religion2-none" name="religion" value="none"> No religion</label>
      <label><input type="radio" name="religion" value="other"> Any other religion or belief</label></fieldset>`;

    const outcomes = await fillFields(planned);

    expect(byId(outcomes, 'religion-c').status).toBe('detached');
    expect(radio('religion2-none').checked).toBe(false);
  });
});

describe('confirming a radio answer', () => {
  const rescan = () => scanFields(document, visible);

  it('chooses Yes for a graduation question only after confirmation', async () => {
    loadFixture('radio-application.html');
    const previewed = byId(plan(), 'gradBefore-y');

    const check = confirmAnswer(rescan(), values(), previewed, NOW);
    if (!check.ok) throw new Error(check.message);
    const [outcome] = await fillFields(check.plan);

    expect(outcome).toMatchObject({ status: 'filled', chosen: true });
    expect(choice('gradBefore-y')).toBe('y');
    expect(choice('relocateAbroad-y')).toBeNull();
  });

  it('chooses No for a graduation question the saved degree answers No', async () => {
    loadFixture('radio-application.html');
    const legend = radio('gradBefore-y')
      .closest('fieldset')
      ?.querySelector('legend');
    if (legend) legend.textContent = 'Will you graduate before March 2027?';
    const previewed = byId(plan(), 'gradBefore-y');
    expect(previewed).toMatchObject({ status: 'suggest', fillValue: 'No' });

    const check = confirmAnswer(rescan(), values(), previewed, NOW);
    if (!check.ok) throw new Error(check.message);
    await fillFields(check.plan);

    expect(choice('gradBefore-y')).toBe('n');
  });

  it('chooses a saved answer only after confirmation', async () => {
    loadFixture('radio-application.html');
    const previewed = byId(plan(), 'arrangement-remote');

    const check = confirmAnswer(rescan(), values(), previewed, NOW);
    if (!check.ok) throw new Error(check.message);
    await fillFields(check.plan);

    expect(choice('arrangement-remote')).toBe('hybrid');
  });

  it('chooses nothing when the question changed since', () => {
    loadFixture('radio-application.html');
    const previewed = byId(plan(), 'gradBefore-y');
    const legend = radio('gradBefore-y')
      .closest('fieldset')
      ?.querySelector('legend');
    if (legend) legend.textContent = 'Will you graduate before March 2027?';

    expect(confirmAnswer(rescan(), values(), previewed, NOW)).toMatchObject({
      ok: false,
    });
  });

  it('chooses nothing when the user answered meanwhile', () => {
    loadFixture('radio-application.html');
    const previewed = byId(plan(), 'gradBefore-y');
    radio('gradBefore-n').checked = true;

    expect(confirmAnswer(rescan(), values(), previewed, NOW)).toEqual({
      ok: false,
      message: 'You entered an answer here, so ApplyKit left it as it is.',
    });
    expect(choice('gradBefore-y')).toBe('n');
  });

  it('chooses nothing when the options changed since', () => {
    loadFixture('radio-application.html');
    const previewed = byId(plan(), 'arrangement-remote');
    const hybrid = radio('arrangement-hybrid').closest('label')?.lastChild;
    if (hybrid) hybrid.textContent = ' Hybrid (two days)';

    expect(confirmAnswer(rescan(), values(), previewed, NOW)).toMatchObject({
      ok: false,
    });
  });
});
