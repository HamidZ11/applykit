import { describe, expect, it, vi } from 'vitest';
import { resolveDiversity } from '@/storage/diversity-source';
import { fullProfile } from '@/test/autofill-fixtures';
import { savedDiversity } from '@/test/diversity-fixtures';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { normalise } from './detect';
import {
  diversityQuestion,
  matchDiversityOption,
  withDiversityChoices,
} from './diversity';
import type { DiversityStatus } from './fields';
import { fillFields } from './fill';
import { autofillValuesFrom } from './profile-values';
import { planFill, type FieldReport } from './report';
import { scanFields } from './scan';

const options = (...texts: string[]) =>
  texts.map((text, index) => ({ value: `v${String(index)}`, text }));

describe('diversityQuestion', () => {
  it.each([
    ['What is your gender?', 'gender'],
    ['Gender (optional)', 'gender'],
    ['Which of the following best describes your gender identity?', 'gender'],
    ['What is your ethnic group?', 'ethnicity'],
    ['Ethnic background', 'ethnicity'],
    ['Ethnicity', 'ethnicity'],
    ['Do you consider yourself to have a disability?', 'disability'],
    ['Religion or belief', 'religion'],
    ['What is your sexual orientation?', 'sexualOrientation'],
  ])('recognises “%s”', (text, category) => {
    expect(diversityQuestion(normalise(text.replace(/\([^)]*\)/g, ' ')))).toBe(
      category,
    );
  });

  it.each([
    'What is your sex?',
    'What is your legal sex?',
    'Sex assigned at birth',
    'Sex as shown on your birth certificate',
    'Gender and sex',
    'Is the gender you identify with the same as your sex registered at birth?',
    'Do you consider yourself to have a disability or long-term health condition?',
    'Do you require any reasonable adjustments?',
    'Gender and ethnicity',
    'Your partner’s gender',
    'What is your national identity?',
    'Which religion was your school affiliated with?',
    'Do you identify as LGBTQ+?',
    'Age',
  ])('does not take “%s” for a supported question', (text) => {
    expect(diversityQuestion(normalise(text))).toBeNull();
  });
});

describe('matchDiversityOption', () => {
  it('chooses the one option that says the saved answer', () => {
    expect(
      matchDiversityOption(
        'gender',
        'non-binary',
        options('Woman', 'Man', 'Non-binary', 'Prefer not to say'),
      ),
    ).toEqual({ value: 'v2' });
    expect(
      matchDiversityOption(
        'disability',
        'no',
        options('Yes', 'No', 'Prefer not to say'),
      ),
    ).toEqual({ value: 'v1' });
    expect(
      matchDiversityOption(
        'religion',
        'christian',
        options('Christianity', 'Islam', 'None'),
      ),
    ).toEqual({ value: 'v0' });
  });

  it('chooses prefer not to say only when that is saved', () => {
    const offered = options('Yes', 'No', 'I prefer not to say');
    expect(
      matchDiversityOption('disability', 'prefer-not-to-say', offered),
    ).toEqual({ value: 'v2' });
  });

  it('takes Male and Female for a saved Man and Woman in a plain list', () => {
    const offered = options('Select…', 'Male', 'Female');
    expect(matchDiversityOption('gender', 'man', offered)).toEqual({
      value: 'v1',
    });
    expect(matchDiversityOption('gender', 'woman', offered)).toEqual({
      value: 'v2',
    });
  });

  it('never takes Male or Female for any other answer or category', () => {
    const offered = options('Male', 'Female', 'Other', 'Prefer not to say');
    expect(matchDiversityOption('gender', 'non-binary', offered)).toEqual({
      reason: 'no-option',
    });
    expect(matchDiversityOption('sexualOrientation', 'other', offered)).toEqual(
      { reason: 'no-option' },
    );
  });

  it('leaves Male and Female next to options about sex', () => {
    for (const offered of [
      options('Male', 'Female', 'Intersex'),
      options('Male (assigned at birth)', 'Female (assigned at birth)'),
      options('Male', 'Female', 'Prefer not to state my legal sex'),
    ]) {
      expect(matchDiversityOption('gender', 'man', offered)).toEqual({
        reason: 'no-option',
      });
    }
  });

  it('never chooses when both Man and Male are offered', () => {
    expect(
      matchDiversityOption(
        'gender',
        'man',
        options('Man', 'Male', 'Woman', 'Female'),
      ),
    ).toEqual({ reason: 'no-option' });
  });

  it('never chooses a nearby or broader answer', () => {
    expect(
      matchDiversityOption(
        'sexualOrientation',
        'gay-lesbian',
        options('Gay man', 'Gay woman / lesbian', 'Bisexual'),
      ),
    ).toEqual({ reason: 'no-option' });
    expect(
      matchDiversityOption('religion', 'other', options('Other', 'None')),
    ).toEqual({ reason: 'no-option' });
    expect(
      matchDiversityOption(
        'sexualOrientation',
        'other',
        options('Any other religion', 'Other sexual orientation'),
      ),
    ).toEqual({ value: 'v1' });
  });

  it('reads ethnic categories written with their group', () => {
    expect(
      matchDiversityOption(
        'ethnicity',
        'indian',
        options(
          'Asian or Asian British - Indian',
          'Asian or Asian British - Pakistani',
          'White - Irish',
        ),
      ),
    ).toEqual({ value: 'v0' });
    expect(
      matchDiversityOption(
        'ethnicity',
        'white-irish',
        options('Irish (White)', 'Indian', 'White British'),
      ),
    ).toEqual({ value: 'v0' });
  });

  it('uses the broad group only when the form lists only broad groups', () => {
    const broad = options(
      'Asian or Asian British',
      'Black or Black British',
      'Mixed',
      'White',
      'Other ethnic group',
      'Prefer not to say',
    );
    expect(matchDiversityOption('ethnicity', 'other-mixed', broad)).toEqual({
      value: 'v2',
    });
    // A detailed list without the saved category is not a broad list.
    expect(
      matchDiversityOption(
        'ethnicity',
        'other-mixed',
        options('White', 'Indian', 'Mixed'),
      ),
    ).toEqual({ reason: 'no-option' });
  });

  it('never chooses between two options that both fit', () => {
    expect(
      matchDiversityOption('religion', 'none', options('None', 'No religion')),
    ).toEqual({ reason: 'no-option' });
  });
});

describe('monitoring questions on a form', () => {
  const NOW = new Date('2026-10-18T12:00:00Z');
  const visible = { isVisible: (e: Element) => !e.closest('[hidden]') };
  const ALL = [
    'gender',
    'ethnicity',
    'disability',
    'religion',
    'sexualOrientation',
  ] as const;

  function plan(
    status: DiversityStatus | null = { reuse: true, saved: [...ALL] },
  ) {
    return planFill(
      scanFields(document, visible),
      autofillValuesFrom(fullProfile(), undefined, status),
      NOW,
    );
  }

  /** What the panel listed before the user pressed Autofill. */
  function listed() {
    return new Set<Element>(
      scanFields(document, visible).map((field) => field.element),
    );
  }

  function byId(reports: FieldReport[], id: string): FieldReport {
    const found = reports.find((r) => r.field.element.id === id);
    if (!found) throw new Error(`No field #${id}`);
    return found;
  }

  /** The real background resolver over fictional saved preferences. */
  function resolver(preferences = savedDiversity()) {
    const store = {
      load: () =>
        Promise.resolve({
          status: 'loaded' as const,
          preferences,
          updatedAt: '2026-10-18T12:00:00.000Z',
          damaged: [],
        }),
    };
    const calls: unknown[] = [];
    return {
      calls,
      request: (requests: Parameters<typeof resolveDiversity>[1]) => {
        calls.push(requests);
        return resolveDiversity(store, requests);
      },
    };
  }

  function select(id: string): HTMLSelectElement {
    return document.getElementById(id) as HTMLSelectElement;
  }

  it('recognises supported questions and nothing else', () => {
    loadFixture('diversity-application.html');
    const targets = Object.fromEntries(
      plan().map((r) => [r.field.element.id, r.target]),
    );

    expect(targets).toMatchObject({
      ethnicity: 'diversityEthnicity',
      orientation: 'diversitySexualOrientation',
      gender: 'diversityGender',
      religion: 'diversityReligion',
      'disability-yes': 'diversityDisability',
      identity: 'diversityGender',
      background: 'diversityEthnicity',
      sex: null,
      'birth-sex': null,
      health: null,
      adjustments: null,
      sponsorship: null,
      'rtw-yes': null,
      consent: null,
    });
  });

  it.each([
    '<fieldset><legend>Emergency contact</legend><label>Gender <select><option>Woman</option></select></label></fieldset>',
    '<fieldset><legend>Your partner</legend><label>Ethnicity <select><option>White</option></select></label></fieldset>',
    '<h2>Declaration</h2><label>Gender <select><option>Woman</option></select></label>',
    '<select name="gender" id="ethnicity"><option>Woman</option></select>',
    '<input placeholder="Gender">',
  ])('keeps a monitoring word in another setting protected: %s', (html) => {
    loadHtml(`<form>${html}</form>`);
    const [report] = plan();
    expect(report?.target).toBeNull();
    expect(report?.fillValue ?? null).toBeNull();
  });

  it('leaves every question to the user while reuse is off', () => {
    loadFixture('diversity-application.html');
    const reports = plan({ reuse: false, saved: [] });

    for (const id of ['ethnicity', 'orientation', 'gender']) {
      expect(byId(reports, id), id).toMatchObject({
        status: 'manual',
        fillValue: null,
        reason:
          '“Use these answers when autofilling” is off in your diversity preferences, so ApplyKit leaves this to you.',
      });
    }
  });

  it('says when no answer is saved, and never treats it as prefer not to say', () => {
    loadFixture('diversity-application.html');
    expect(
      byId(plan({ reuse: true, saved: ['gender'] }), 'ethnicity'),
    ).toMatchObject({
      status: 'no-value',
      reason: 'You have not saved an answer to this question.',
    });
  });

  it('leaves everything when the preferences could not be read', () => {
    loadFixture('diversity-application.html');
    expect(byId(plan(null), 'ethnicity')).toMatchObject({
      status: 'manual',
      fillValue: null,
    });
  });

  it('plans no value until autofill asks the background', () => {
    loadFixture('diversity-application.html');
    expect(byId(plan(), 'ethnicity')).toMatchObject({
      status: 'fill',
      fillValue: null,
      value: null,
    });
  });

  it('fills the lists whose choices fit, and only those', async () => {
    loadFixture('diversity-application.html');
    const { request, calls } = resolver();
    const changed: string[] = [];
    document.addEventListener('input', (event) => {
      changed.push((event.target as HTMLElement).id);
    });

    const outcomes = await fillFields(
      await withDiversityChoices(plan(), request, listed()),
    );

    expect(select('ethnicity').selectedOptions[0]?.text).toBe(
      'Mixed or Multiple ethnic groups - Any other Mixed or Multiple ethnic background',
    );
    expect(select('orientation').value).toBe('p');
    expect(byId(outcomes, 'ethnicity')).toMatchObject({
      status: 'filled',
      value: null,
    });
    // Male and Female do not say the saved Non-binary.
    expect(select('gender').value).toBe('');
    expect(byId(outcomes, 'gender')).toMatchObject({
      status: 'no-option',
      reason:
        'The choices here differ from your saved answer, so ApplyKit leaves this to you.',
    });
    expect(select('religion').selectedOptions[0]?.text).toBe(
      'Prefer not to say',
    );
    // A native radio group is answered like a list (ADR 0020): the saved
    // "No", and nothing else.
    expect(
      [
        ...document.querySelectorAll<HTMLInputElement>(
          '[type="radio"], [type="checkbox"]',
        ),
      ]
        .filter((box) => box.checked)
        .map((box) => box.id),
    ).toEqual(['disability-no']);
    expect(byId(outcomes, 'disability-yes')).toMatchObject({
      status: 'filled',
      value: null,
    });
    expect(select('background').selectedOptions).toHaveLength(0);
    for (const id of ['sex', 'birth-sex', 'health', 'sponsorship']) {
      expect(select(id).value, id).toBe('');
    }
    expect(changed).toEqual([
      'first',
      'last',
      'email',
      'ethnicity',
      'orientation',
      'disability-no',
    ]);
    // The background was asked only about lists and the native radio
    // group, with the page's own option labels, never raw values.
    expect(calls).toHaveLength(1);
    const asked = calls[0] as {
      category: string;
      options: { value: string; text: string }[];
    }[];
    expect(asked.map((r) => r.category)).toEqual([
      'ethnicity',
      'sexualOrientation',
      'gender',
      'disability',
    ]);
    expect(asked[3]?.options).toEqual([
      { value: 'Yes', text: 'Yes' },
      { value: 'No', text: 'No' },
      { value: 'Prefer not to say', text: 'Prefer not to say' },
    ]);
  });

  it('never writes an option the page did not offer, or without a reply', async () => {
    loadFixture('diversity-application.html');

    const offMenu = await withDiversityChoices(
      plan(),
      (requests) =>
        Promise.resolve({
          results: requests.map(() => ({ value: 'injected' })),
        }),
      listed(),
    );
    const noReply = await withDiversityChoices(
      plan(),
      () => Promise.resolve(null),
      listed(),
    );
    const failed = await withDiversityChoices(
      plan(),
      () => Promise.reject(new Error('unreachable')),
      listed(),
    );

    for (const reports of [offMenu, noReply, failed]) {
      expect(byId(reports, 'ethnicity')).toMatchObject({
        status: 'manual',
        fillValue: null,
      });
      expect(
        reports.some((r) => r.status === 'fill' && r.fillValue === null),
      ).toBe(false);
    }
  });

  it('answers nothing when reuse was turned off in the meantime', async () => {
    loadFixture('diversity-application.html');
    const { request } = resolver({ ...savedDiversity(), reuse: false });

    const outcomes = await fillFields(
      await withDiversityChoices(plan(), request, listed()),
    );

    expect(select('ethnicity').value).toBe('');
    expect(byId(outcomes, 'ethnicity').status).toBe('manual');
  });

  it('reports a choice the page rejects', async () => {
    loadFixture('diversity-application.html');
    const element = select('ethnicity');
    element.addEventListener('input', () => {
      element.value = '';
    });

    const outcomes = await fillFields(
      await withDiversityChoices(plan(), resolver().request, listed()),
    );

    expect(byId(outcomes, 'ethnicity').status).toBe('rejected');
  });

  it('never submits, presses keys or clicks with a mouse', async () => {
    loadFixture('diversity-application.html');
    const onSubmit = vi.fn((event: Event) => {
      event.preventDefault();
    });
    // A radio's choice is reported with a plain click Event (ADR 0020),
    // only on the chosen radio, never a mouse click.
    const clicks: { target: string; mouse: boolean }[] = [];
    const onClick = vi.fn((event: Event) => {
      clicks.push({
        target: (event.target as HTMLElement).id,
        mouse: event instanceof MouseEvent,
      });
    });
    const onKey = vi.fn();
    document
      .getElementById('application')
      ?.addEventListener('submit', onSubmit);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);

    await fillFields(
      await withDiversityChoices(plan(), resolver().request, listed()),
    );

    expect(onSubmit).not.toHaveBeenCalled();
    expect(clicks).toEqual([{ target: 'disability-no', mouse: false }]);
    expect(onKey).not.toHaveBeenCalled();
  });

  it('asks only about lists listed before Autofill was pressed', async () => {
    loadFixture('diversity-application.html');
    const before = listed();
    const late = document.createElement('div');
    late.innerHTML = `<label for="late">What is your sexual orientation?</label>
      <select id="late"><option value="">Select…</option>
      <option value="x">Prefer not to say</option></select>`;
    // The page swaps its list for a new one when the user clicks.
    document.getElementById('orientation')?.replaceWith(late);
    const { request, calls } = resolver();

    const outcomes = await fillFields(
      await withDiversityChoices(plan(), request, before),
    );

    expect(byId(outcomes, 'late')).toMatchObject({
      status: 'manual',
      reason:
        'This question appeared after you pressed Autofill, so ApplyKit left it to you.',
    });
    expect(select('late').value).toBe('');
    // Positive control: the listed lists were still filled.
    expect(select('ethnicity').value).toBe('e12');
    // The late list's options were never sent to the background.
    expect(calls).toHaveLength(1);
    expect(JSON.stringify(calls)).not.toContain('"x"');
  });

  it('never writes a value two options share, or a list that changed', async () => {
    loadFixture('diversity-application.html');
    for (const option of select('orientation').options) {
      if (option.text === 'Gay or lesbian') option.value = 'p';
    }
    const changing = (requests: Parameters<typeof resolveDiversity>[1]) =>
      resolver()
        .request(requests)
        .then((reply) => {
          const ethnicity = select('ethnicity');
          const chosen = [...ethnicity.options].find((o) => o.value === 'e12');
          if (chosen) chosen.text = 'White - Irish';
          return reply;
        });

    const outcomes = await fillFields(
      await withDiversityChoices(plan(), changing, listed()),
    );

    for (const id of ['orientation', 'ethnicity']) {
      expect(byId(outcomes, id).status, id).toBe('manual');
      expect(select(id).value, id).toBe('');
    }
  });

  it('shows no answer the page already had once filling is done', async () => {
    loadFixture('diversity-application.html');
    const pending = await withDiversityChoices(
      plan(),
      resolver().request,
      listed(),
    );
    select('ethnicity').value = 'e3';

    const outcomes = await fillFields(pending);

    expect(byId(outcomes, 'ethnicity')).toMatchObject({
      status: 'kept',
      value: null,
    });
  });

  it.each([
    'Disability (including long-term health conditions)',
    'Do you consider yourself to have a disability (or long-term health condition)?',
    'Gender (as registered at birth)',
    'Gender (legal sex)',
    'Sexual orientation (of your partner)',
  ])('leaves “%s” as a sensitive question', (question) => {
    document.body.innerHTML = `<form><label for="q">${question}</label>
      <select id="q"><option value="">Select…</option><option>Yes</option>
      <option>No</option><option>Woman</option><option>Man</option>
      <option>Prefer not to say</option></select></form>`;

    expect(byId(plan(), 'q')).toMatchObject({ target: null });
  });

  it.each([
    ['Disability (optional)', 'diversityDisability'],
    ['Gender (Optional)', 'diversityGender'],
    [
      'Do you consider yourself to have a disability (as defined by the Equality Act 2010)?',
      'diversityDisability',
    ],
  ])('recognises “%s” with a known hint', (question, target) => {
    document.body.innerHTML = `<form><label for="q">${question}</label>
      <select id="q"><option value="">Select…</option><option>Yes</option>
      <option>No</option><option>Prefer not to say</option></select></form>`;

    expect(byId(plan(), 'q').target).toBe(target);
  });

  describe('Male and Female for a saved Man or Woman', () => {
    const LIST = `<option value="">Select…</option>
      <option value="m">Male</option><option value="f">Female</option>`;

    function form(question: string, extra = '') {
      document.body.innerHTML = `<form>${extra}<label for="g">${question}</label>
        <select id="g">${LIST}</select></form>`;
    }

    async function autofillAs(gender: string, preferences = savedDiversity()) {
      const saved = {
        ...preferences,
        answers: { ...preferences.answers, gender },
      };
      const status = { reuse: saved.reuse, saved: saved.reuse ? [...ALL] : [] };
      return fillFields(
        await withDiversityChoices(
          plan(status),
          resolver(saved).request,
          listed(),
        ),
      );
    }

    it('fills Male for Man and Female for Woman', async () => {
      form('What is your gender?');
      expect(byId(await autofillAs('man'), 'g').status).toBe('filled');
      expect(select('g').value).toBe('m');

      form('What is your gender?');
      await autofillAs('woman');
      expect(select('g').value).toBe('f');
    });

    it('leaves the list for Non-binary', async () => {
      form('What is your gender?');
      expect(byId(await autofillAs('non-binary'), 'g').status).toBe(
        'no-option',
      );
      expect(select('g').value).toBe('');
    });

    it('fills nothing with reuse off', async () => {
      form('What is your gender?');
      const outcomes = await autofillAs('man', {
        ...savedDiversity(),
        reuse: false,
      });
      expect(byId(outcomes, 'g').status).toBe('manual');
      expect(select('g').value).toBe('');
    });

    it('keeps a choice already made', async () => {
      form('What is your gender?');
      select('g').value = 'f';
      const outcomes = await autofillAs('man');
      expect(byId(outcomes, 'g').status).toBe('keep');
      expect(select('g').value).toBe('f');
    });

    it.each([
      ['What is your legal sex?', ''],
      ['Sex assigned at birth', ''],
      ['Gender (as on your birth certificate)', ''],
      ['Gender', '<legend>Sex and gender</legend>'],
      ['Gender', '<legend>As shown on your passport</legend>'],
    ])('never answers “%s” %s', async (question, legend) => {
      document.body.innerHTML = `<form><fieldset>${legend}
        <label for="g">${question}</label><select id="g">${LIST}</select>
        </fieldset></form>`;

      const outcomes = await autofillAs('man');

      expect(byId(outcomes, 'g').target).toBeNull();
      expect(select('g').value).toBe('');
    });

    it('never answers a gender question described as legal sex', async () => {
      form(
        'What is your gender?',
        '<p id="hint">Enter your legal sex as on your passport.</p>',
      );
      select('g').setAttribute('aria-describedby', 'hint');

      const outcomes = await autofillAs('man');

      expect(byId(outcomes, 'g').target).toBeNull();
      expect(select('g').value).toBe('');
    });

    it.each([
      [
        'a placeholder option',
        `<label for="g">Gender</label><select id="g">
          <option value="">Please select your legal sex</option>
          <option value="m">Male</option><option value="f">Female</option></select>`,
      ],
      [
        'a choose-style placeholder',
        `<label for="g">Gender</label><select id="g">
          <option value="">Select sex assigned at birth</option>
          <option value="m">Male</option><option value="f">Female</option></select>`,
      ],
      [
        'a title',
        `<label for="g">Gender</label>
          <select id="g" title="Legal sex as on your passport">${LIST}</select>`,
      ],
      [
        'an aria-description',
        `<label for="g">Gender</label>
          <select id="g" aria-description="As recorded on your birth certificate">${LIST}</select>`,
      ],
      [
        'a hint beside the field',
        `<div><label for="g">Gender</label><select id="g">${LIST}</select>
          <p class="hint">This must match your birth certificate.</p></div>
          <div><label for="e">Email</label><input id="e" type="email"></div>`,
      ],
    ])('never answers a gender question qualified by %s', async (_, html) => {
      document.body.innerHTML = `<form>${html}</form>`;

      const outcomes = await autofillAs('man');

      expect(byId(outcomes, 'g').target).toBeNull();
      expect(select('g').value).toBe('');
    });

    it('fills despite common monitoring notices', async () => {
      document.body.innerHTML = `<form>
        <h2>Equal opportunities</h2>
        <p>We are legally required to ask. Your answers are kept separately from your records.</p>
        <fieldset><legend>About you</legend>
          <div><label for="g">What is your gender?</label>
            <select id="g">${LIST}<option value="p">Prefer not to say</option></select>
            <p class="hint">Optional. Kept separately from your application records.</p></div>
          <div><label for="e">Ethnicity</label><select id="e"></select></div>
        </fieldset></form>`;

      await autofillAs('woman');

      expect(select('g').value).toBe('f');
    });

    it('leaves an ambiguous list unanswered', async () => {
      document.body.innerHTML = `<form><label for="g">What is your gender?</label>
        <select id="g">${LIST}<option value="i">Intersex</option></select></form>`;
      expect(byId(await autofillAs('man'), 'g').status).toBe('no-option');

      document.body.innerHTML = `<form><label for="g">What is your gender?</label>
        <select id="g">${LIST}<option value="x">Man</option></select></form>`;
      expect(byId(await autofillAs('man'), 'g').status).toBe('no-option');
      expect(select('g').value).toBe('');
    });
  });

  it('shows no saved answer in evidence', () => {
    loadFixture('diversity-application.html');
    const evidence = JSON.stringify(plan().map((r) => r.evidence));

    expect(evidence).not.toMatch(/non binary|other-mixed|prefer-not-to-say/i);
  });
});

describe('lists that share option values (review)', () => {
  it('never writes a value a disabled option shares', async () => {
    document.body.innerHTML = `<form><label for="g">What is your gender?</label>
      <select id="g"><option value="">Select…</option>
      <option value="3" disabled>Man</option><option value="1">Woman</option>
      <option value="3">Non-binary</option></select></form>`;
    const visible = { isVisible: () => true };
    const fields = scanFields(document, visible);
    const store = {
      load: () =>
        Promise.resolve({
          status: 'loaded' as const,
          preferences: savedDiversity(),
          updatedAt: '2026-10-18T12:00:00.000Z',
          damaged: [],
        }),
    };
    const planned = await withDiversityChoices(
      planFill(
        fields,
        autofillValuesFrom(fullProfile(), undefined, {
          reuse: true,
          saved: ['gender'],
        }),
      ),
      (requests) => resolveDiversity(store, requests),
      new Set(fields.map((f) => f.element)),
    );

    const [outcome] = await fillFields(planned);

    expect(outcome?.status).toBe('manual');
    expect((document.getElementById('g') as HTMLSelectElement).value).toBe('');
  });
});
