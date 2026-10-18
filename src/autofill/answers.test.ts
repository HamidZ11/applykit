import { describe, expect, it, vi } from 'vitest';
import {
  emptyAnswers,
  type ApplicationAnswers,
  type WorkArrangement,
} from '@/domain/application-answers';
import { savedAnswers } from '@/test/answer-fixtures';
import { fullProfile } from '@/test/autofill-fixtures';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { detectControl, type DetectableControl } from './detect';
import { fillFields } from './fill';
import { autofillValuesFrom } from './profile-values';
import { planFill, summarise, type FieldReport } from './report';
import { confirmAnswer } from './resolve';
import { scanFields, type ScannedField } from './scan';

const NOW = new Date('2026-10-18T12:00:00Z');
const visible = { isVisible: (e: Element) => !e.closest('[hidden]') };

function values(answers: ApplicationAnswers | null = savedAnswers()) {
  return autofillValuesFrom(fullProfile(), answers);
}

function plan(answers?: ApplicationAnswers | null): FieldReport[] {
  return planFill(scanFields(document, visible), values(answers), NOW);
}

function byId(reports: FieldReport[], id: string): FieldReport {
  const found = reports.find((r) => r.field.element.id === id);
  if (!found) throw new Error(`No field #${id}`);
  return found;
}

/** What the first control in the markup is recognised as. */
function detected(html: string): string | null {
  loadHtml(html);
  const control = document.querySelector<DetectableControl>(
    'input, select, textarea',
  );
  if (!control) throw new Error('No control');
  const detection = detectControl(control);
  return detection.kind === 'match'
    ? detection.field
    : detection.kind === 'manual'
      ? `manual:${detection.reason}`
      : detection.kind;
}

/** Plans one labelled control with the given saved answers. */
function one(
  html: string,
  answers: ApplicationAnswers | null = savedAnswers(),
): FieldReport {
  loadHtml(`<form>${html}</form>`);
  const [report] = plan(answers);
  if (!report) throw new Error('No field');
  return report;
}

describe('recognising saved-answer questions', () => {
  it.each([
    ['What is your notice period?', 'noticePeriod'],
    ['How much notice must you give your current employer?', 'noticePeriod'],
    ['Notice period (weeks)', 'noticePeriod'],
    ['Are you willing to relocate?', 'relocation'],
    ['Would you consider relocating for this position?', 'relocation'],
    ['Do you prefer remote, hybrid or office-based work?', 'workArrangement'],
    ['What is your preferred working arrangement?', 'workArrangement'],
    ['What is your earliest available start date?', 'startDate'],
    ['When would you be available to begin?', 'startDate'],
    ['What are your salary expectations?', 'salaryExpectation'],
    ['What annual salary are you seeking?', 'salaryExpectation'],
    ['Expected salary', 'salaryExpectation'],
  ])('recognises “%s”', (label, field) => {
    expect(detected(`<label>${label} <input></label>`)).toBe(field);
  });

  it.each([
    'Please describe the notice you received',
    'Please describe the notice period you received from your last employer',
    'Do you need relocation assistance?',
    'Where would you like to relocate?',
    'Are you able to work on-site three days a week?',
    'Start date',
    'Current salary',
    'What is your salary history?',
    'Minimum salary you would accept',
  ])('does not take “%s” for a saved-answer question', (label) => {
    expect([
      'noticePeriod',
      'relocation',
      'workArrangement',
      'startDate',
      'salaryExpectation',
    ]).not.toContain(detected(`<label>${label} <input></label>`));
  });

  it('keeps salary history and pay amounts sensitive', () => {
    expect(detected('<label>Current salary <input></label>')).toBe(
      'manual:sensitive',
    );
    expect(
      detected('<label>Expected salary, and current salary <input></label>'),
    ).toBe('manual:sensitive');
  });

  it('never reads a question from generated ids or technical names', () => {
    expect(detected('<input id="notice_period" name="noticePeriod">')).toBe(
      'none',
    );
    expect(detected('<input name="salary_expectation">')).toBe(
      'manual:sensitive',
    );
  });

  it('reads a radio group’s question from its legend', () => {
    expect(
      detected(
        '<fieldset><legend>Are you willing to relocate?</legend><label><input type="radio" name="r"> Yes</label></fieldset>',
      ),
    ).toBe('relocation');
  });

  it('lets sensitive or legal wording take precedence', () => {
    for (const label of [
      'Expected salary and visa sponsorship requirements',
      'Are you willing to relocate, and do you have the right to work there?',
      'Notice period (please state if you have a disability that affects this)',
      'I agree that my notice period may be checked',
    ]) {
      expect(detected(`<label>${label} <input></label>`), label).toMatch(
        /^manual:/,
      );
    }
  });

  it('never answers for someone else', () => {
    expect(
      detected(
        '<fieldset><legend>Reference</legend><label>Referee’s notice period <input></label></fieldset>',
      ),
    ).not.toBe('noticePeriod');
    expect(
      detected('<label>Would your partner relocate with you? <input></label>'),
    ).not.toBe('relocation');
  });
});

describe('notice period', () => {
  it('gives a text field the amount and unit', () => {
    expect(
      one('<label>What is your notice period? <input id="f"></label>'),
    ).toMatchObject({ status: 'suggest', fillValue: '4 weeks' });
  });

  it('gives the number alone where the field names the same unit', () => {
    expect(
      one('<label>Notice period in weeks <input id="f" type="number"></label>'),
    ).toMatchObject({ status: 'suggest', fillValue: '4' });
  });

  it('never converts units', () => {
    expect(
      one('<label>Notice period in days <input id="f"></label>'),
    ).toMatchObject({
      status: 'unusable',
      fillValue: null,
      reason:
        'Your saved notice period is in weeks, but this asks in days. ApplyKit does not convert it.',
    });
  });

  it('leaves a number field that names no unit, or several', () => {
    expect(
      one('<label>Notice period <input type="number"></label>').status,
    ).toBe('ambiguous');
    expect(
      one('<label>Notice period (days or weeks) <input></label>').status,
    ).toBe('ambiguous');
  });

  it('chooses only an option that says exactly the saved notice', () => {
    const select = (options: string) =>
      one(
        `<label>Notice period <select><option value="">Select…</option>${options}</select></label>`,
      );
    expect(
      select(
        '<option value="a">2 weeks</option><option value="b">Four weeks</option>',
      ),
    ).toMatchObject({ status: 'suggest', fillValue: 'b' });
    expect(
      select(
        '<option value="a">Less than 1 month</option><option value="b">1–3 months</option>',
      ),
    ).toMatchObject({ status: 'no-option', fillValue: null });
    expect(select('<option value="a">1 month</option>')).toMatchObject({
      status: 'no-option',
    });
  });

  it('matches "no notice" to an immediate option', () => {
    const answers = {
      ...savedAnswers(),
      noticePeriod: { amount: 0, unit: 'weeks' as const },
    };
    expect(
      one(
        '<label>Notice period <select><option value="">Select…</option><option value="i">Immediately available</option><option value="m">1 month</option></select></label>',
        answers,
      ),
    ).toMatchObject({ status: 'suggest', fillValue: 'i' });
  });

  it('says when nothing is saved', () => {
    expect(
      one('<label>Notice period <input></label>', emptyAnswers()),
    ).toMatchObject({
      status: 'no-value',
      reason: 'You have not saved an answer to this question.',
    });
  });
});

describe('relocation', () => {
  const ask = (question: string, relocation = savedAnswers().relocation) =>
    one(`<label>${question} <input></label>`, {
      ...savedAnswers(),
      relocation,
    });

  it('answers within the country and abroad separately', () => {
    expect(ask('Are you willing to relocate within the UK?')).toMatchObject({
      status: 'suggest',
      fillValue: 'Yes',
    });
    expect(ask('Are you willing to relocate internationally?')).toMatchObject({
      status: 'suggest',
      fillValue: 'No',
    });
    expect(ask('Would you relocate outside the UK?').fillValue).toBe('No');
  });

  it('asks the user when the question does not say where', () => {
    expect(ask('Are you willing to relocate?')).toMatchObject({
      status: 'ambiguous',
      fillValue: null,
    });
    // The same answer for both places answers either.
    expect(
      ask('Are you willing to relocate?', {
        withinCountry: 'depends',
        abroad: 'depends',
      }),
    ).toMatchObject({ status: 'suggest', fillValue: 'It depends' });
    expect(
      ask('Are you willing to relocate?', {
        withinCountry: 'yes',
        abroad: null,
      }).status,
    ).toBe('ambiguous');
  });

  it('never answers about a particular place', () => {
    expect(ask('Would you be willing to relocate to London?').status).toBe(
      'ambiguous',
    );
  });

  it('says which part is not saved', () => {
    expect(
      ask('Are you willing to relocate abroad?', {
        withinCountry: 'yes',
        abroad: null,
      }),
    ).toMatchObject({
      status: 'no-value',
      reason: 'You have not saved whether you would move to another country.',
    });
  });

  it('chooses only an option that says yes, no or depends exactly', () => {
    const select = (options: string) =>
      one(
        `<label>Are you willing to relocate within the UK? <select><option value="">Select…</option>${options}</select></label>`,
      );
    expect(
      select('<option value="y">Yes</option><option value="n">No</option>'),
    ).toMatchObject({ status: 'suggest', fillValue: 'y' });
    expect(
      select(
        '<option value="y">Yes, within commuting distance</option><option value="n">No</option>',
      ).status,
    ).toBe('no-option');
  });
});

describe('working arrangement', () => {
  const select = (
    options: string,
    workArrangement: WorkArrangement = 'hybrid',
  ) =>
    one(
      `<label>Preferred working arrangement <select><option value="">Select…</option>${options}</select></label>`,
      { ...savedAnswers(), workArrangement },
    );

  it.each([
    ['remote', 'Fully remote', 'r'],
    ['hybrid', 'Hybrid', 'h'],
    ['on-site', 'Office based', 'o'],
    ['flexible', 'No preference', 'f'],
  ] as const)('chooses %s', (arrangement, option, value) => {
    expect(
      select(
        `<option value="r">Fully remote</option><option value="h">Hybrid</option><option value="o">Office based</option><option value="f">No preference</option>`,
        arrangement,
      ),
    ).toMatchObject({ status: 'suggest', fillValue: value, value: option });
  });

  it('never chooses an option with conditions the user did not save', () => {
    expect(
      select(
        '<option value="r">Fully remote</option><option value="h">Hybrid (3 days in office)</option>',
      ).status,
    ).toBe('no-option');
  });

  it('gives a text field the saved arrangement', () => {
    expect(
      one('<label>What is your preferred working arrangement? <input></label>')
        .fillValue,
    ).toBe('Hybrid');
  });
});

describe('earliest start date', () => {
  it('fills a date input with the saved date', () => {
    expect(
      one('<label>Earliest start date <input type="date"></label>'),
    ).toMatchObject({
      status: 'suggest',
      fillValue: '2027-01-04',
      value: '4 January 2027',
    });
  });

  it('writes a text field in the format it states', () => {
    expect(
      one('<label>Earliest start date (DD/MM/YYYY) <input></label>').fillValue,
    ).toBe('04/01/2027');
    expect(
      one('<label>Available from <input placeholder="YYYY-MM-DD"></label>')
        .fillValue,
    ).toBe('2027-01-04');
  });

  it('leaves a text field that states no format', () => {
    expect(one('<label>When could you start? <input></label>').status).toBe(
      'unusable',
    );
  });

  it('never gives a date for "how soon after an offer"', () => {
    expect(
      one(
        '<label>How soon could you start after receiving an offer? <input></label>',
      ),
    ).toMatchObject({ status: 'manual', fillValue: null });
  });

  it('never suggests a date that has passed', () => {
    expect(
      one('<label>Earliest start date <input type="date"></label>', {
        ...savedAnswers(),
        startDate: '2026-09-01',
      }),
    ).toMatchObject({
      status: 'unusable',
      reason:
        'Your saved start date, 1 September 2026, has passed. Update it in your application answers.',
    });
  });

  it('leaves date lists to the user', () => {
    expect(
      one(
        '<label>Earliest start date <select><option value="">Select…</option><option>January 2027</option></select></label>',
      ).status,
    ).toBe('unusable');
  });
});

describe('salary expectation', () => {
  it('fills a field that states the same period and currency with the amount', () => {
    expect(
      one('<label>Expected annual salary (GBP) <input></label>'),
    ).toMatchObject({
      status: 'suggest',
      fillValue: '32000',
      value: '£32,000 a year',
    });
  });

  it('writes the period and currency where the field states neither', () => {
    expect(
      one('<label>What are your salary expectations? <input></label>')
        .fillValue,
    ).toBe('£32,000 a year');
  });

  it('never converts the period', () => {
    expect(
      one('<label>Expected hourly rate (£) <input></label>'),
    ).toMatchObject({
      status: 'unusable',
      reason:
        'Your saved salary is a yearly amount, but this asks for an hourly rate. ApplyKit does not convert it.',
    });
    expect(one('<label>Expected monthly salary <input></label>').status).toBe(
      'unusable',
    );
  });

  it('never converts the currency', () => {
    expect(
      one('<label>Expected annual salary (EUR) <input></label>'),
    ).toMatchObject({
      status: 'unusable',
      reason:
        'Your saved salary is in GBP, but this asks in EUR. ApplyKit does not convert it.',
    });
    expect(
      one('<label>Expected annual salary ($) <input></label>').status,
    ).toBe('ambiguous');
  });

  it('leaves a number field that does not state the period or currency', () => {
    expect(
      one('<label>Expected salary (GBP) <input type="number"></label>').status,
    ).toBe('ambiguous');
    expect(
      one('<label>Expected annual salary <input type="number"></label>').status,
    ).toBe('ambiguous');
  });

  it('never chooses a salary band', () => {
    expect(
      one(
        '<label>Salary expectations <select><option value="">Select…</option><option>£30,000–£35,000</option></select></label>',
      ).status,
    ).toBe('no-option');
  });

  it('keeps an existing entry', () => {
    expect(
      one('<label>Expected salary <input value="Negotiable"></label>'),
    ).toMatchObject({ status: 'keep', value: 'Negotiable' });
  });
});

describe('saved answers are suggested, never filled by autofill', () => {
  it('writes no answer during autofill, and counts them as needing you', async () => {
    loadFixture('reusable-answers.html');
    const reports = plan();
    const changed = vi.fn();
    document.addEventListener('input', (event) => {
      changed((event.target as HTMLElement).id);
    });

    await fillFields(reports);

    for (const id of [
      'notice-weeks',
      'start-date',
      'relocate-uk',
      'salary-annual',
    ]) {
      expect(byId(reports, id).status, id).toBe('suggest');
      expect((document.getElementById(id) as HTMLInputElement).value, id).toBe(
        '',
      );
    }
    // Positive control: autofill did run for the applicant's details.
    expect(changed.mock.calls.map(([id]) => id as string)).toEqual([
      'first',
      'last',
      'email',
    ]);
    expect(summarise(reports).needsYou).toBeGreaterThanOrEqual(4);
  });

  it('says why nothing is suggested when the saved answers could not be read', () => {
    expect(one('<label>Notice period <input></label>', null)).toMatchObject({
      status: 'no-value',
      reason:
        'Your saved answers could not be read. Open them to check, then rescan.',
    });
  });

  it('guides radio groups and custom dropdowns without choosing', () => {
    loadFixture('reusable-answers.html');
    const reports = plan();

    expect(byId(reports, 'relocate-abroad-yes')).toMatchObject({
      status: 'unsupported',
      fillValue: null,
      suggestion: { kind: 'value', value: 'No' },
    });
    expect(byId(reports, 'arrangement')).toMatchObject({
      status: 'unsupported',
      suggestion: { kind: 'value', value: 'Hybrid' },
    });
  });
});

describe('confirming one saved answer', () => {
  function setup(answers: ApplicationAnswers | null = savedAnswers()) {
    loadFixture('reusable-answers.html');
    const fields = scanFields(document, visible);
    const reports = planFill(fields, values(answers), NOW);
    return { fields, reports };
  }
  const rescan = (): ScannedField[] => scanFields(document, visible);
  const input = (id: string) => document.getElementById(id) as HTMLInputElement;

  it('fills only the confirmed question and verifies it', async () => {
    const { reports } = setup();
    const previewed = byId(reports, 'notice-weeks');

    const check = confirmAnswer(rescan(), values(), previewed, NOW);
    if (!check.ok) throw new Error(check.message);
    const outcomes = await fillFields(check.plan);

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]).toMatchObject({ status: 'filled', chosen: true });
    expect(input('notice-weeks').value).toBe('4');
    for (const id of ['start-date', 'relocate-uk', 'salary-annual']) {
      expect(input(id).value, id).toBe('');
    }
  });

  it('writes nothing when the saved answer changed or was removed', () => {
    const { reports } = setup();
    const previewed = byId(reports, 'notice-weeks');

    expect(
      confirmAnswer(
        rescan(),
        values({
          ...savedAnswers(),
          noticePeriod: { amount: 6, unit: 'weeks' },
        }),
        previewed,
        NOW,
      ).ok,
    ).toBe(false);
    expect(
      confirmAnswer(
        rescan(),
        values({ ...savedAnswers(), noticePeriod: null }),
        previewed,
        NOW,
      ).ok,
    ).toBe(false);
  });

  it('writes nothing when the question was replaced', () => {
    const { reports } = setup();
    const previewed = byId(reports, 'notice-weeks');
    document.getElementById('ask-months')?.click();
    // Inline scripts do not run in tests: replace the field as the page does.
    const slot = document.getElementById('notice-weeks-slot');
    if (slot) {
      slot.innerHTML =
        '<label for="notice-months">Notice period in months</label><input id="notice-months">';
    }

    expect(confirmAnswer(rescan(), values(), previewed, NOW)).toEqual({
      ok: false,
      message:
        'This question is no longer on the page. Rescan to see the form as it is now.',
    });
  });

  it('writes nothing when the question’s wording changed', () => {
    const { reports } = setup();
    const previewed = byId(reports, 'notice-weeks');
    const label = document.querySelector('label[for="notice-weeks"]');
    if (label) label.textContent = 'Notice period in days';

    expect(confirmAnswer(rescan(), values(), previewed, NOW).ok).toBe(false);
  });

  it('keeps what the user typed after the suggestion', () => {
    const { reports } = setup();
    const previewed = byId(reports, 'notice-weeks');
    input('notice-weeks').value = '8';

    expect(confirmAnswer(rescan(), values(), previewed, NOW)).toEqual({
      ok: false,
      message: 'You entered an answer here, so ApplyKit left it as it is.',
    });
    expect(input('notice-weeks').value).toBe('8');
  });

  it('writes nothing more when confirmed twice', async () => {
    const { reports } = setup();
    const previewed = byId(reports, 'salary-annual');
    const first = confirmAnswer(rescan(), values(), previewed, NOW);
    if (!first.ok) throw new Error(first.message);
    await fillFields(first.plan);

    expect(confirmAnswer(rescan(), values(), previewed, NOW).ok).toBe(false);
  });

  it('reports an answer the page rejects', async () => {
    const { reports } = setup();
    const element = input('salary-annual');
    element.addEventListener('input', () => {
      element.value = '';
    });
    const check = confirmAnswer(
      rescan(),
      values(),
      byId(reports, 'salary-annual'),
      NOW,
    );
    if (!check.ok) throw new Error(check.message);

    const [outcome] = await fillFields(check.plan);

    expect(outcome?.status).toBe('rejected');
  });

  it('never confirms a field that was not a suggestion', () => {
    const { reports } = setup();

    for (const id of [
      'notice-days',
      'salary-hourly',
      'sponsorship',
      'signature',
    ]) {
      expect(
        confirmAnswer(rescan(), values(), byId(reports, id), NOW).ok,
        id,
      ).toBe(false);
    }
  });

  it('never submits, clicks or presses keys', async () => {
    const { reports } = setup();
    const onSubmit = vi.fn((event: Event) => {
      event.preventDefault();
    });
    const onClick = vi.fn();
    const onKey = vi.fn();
    document
      .getElementById('application')
      ?.addEventListener('submit', onSubmit);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);

    const check = confirmAnswer(
      rescan(),
      values(),
      byId(reports, 'relocate-uk'),
      NOW,
    );
    if (!check.ok) throw new Error(check.message);
    await fillFields(check.plan);

    expect(input('relocate-uk').value).toBe('y');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
    expect(onKey).not.toHaveBeenCalled();
  });
});

describe('questions saved answers never reach', () => {
  it('leaves eligibility, monitoring, consent and signatures alone', () => {
    loadFixture('reusable-answers.html');
    const reports = plan();

    for (const id of [
      'rtw-yes',
      'sponsorship',
      'gender',
      'ethnicity',
      'disability',
      'privacy',
      'signature',
    ]) {
      expect(byId(reports, id).status, id).toBe('manual');
      expect(byId(reports, id).suggestion, id).toBeNull();
    }
    expect(byId(reports, 'motivation')).toMatchObject({
      status: 'unsupported',
      target: null,
    });
  });
});

describe('cases found in review', () => {
  const ANSWERS = [
    'noticePeriod',
    'relocation',
    'workArrangement',
    'startDate',
    'salaryExpectation',
  ];

  it.each([
    'Current and expected salary',
    'Current/expected salary',
    'Current total compensation and salary expectations',
    'Salary today and expected salary',
    'What do you make now and what salary are you expecting?',
    'Current package and salary expectations',
    'Salary expectation in previous role',
    'What were your salary expectations last year?',
    'Expected salary – minimum acceptable',
    'Salary expectations: lowest you would accept',
  ])('keeps “%s” sensitive', (label) => {
    expect(detected(`<label>${label} <input></label>`)).toBe(
      'manual:sensitive',
    );
  });

  it('keeps an expectation label with a current-pay name sensitive', () => {
    expect(
      detected('<label>Expected salary <input name="current_salary"></label>'),
    ).toBe('manual:sensitive');
  });

  it.each([
    'Would you relocate within Europe?',
    'Are you willing to relocate within the EU?',
    'Are you planning to relocate within the next six months?',
    'Would you be willing to relocate outside of London?',
    'Would you relocate to London, Paris or another location?',
  ])('never guesses where “%s” means', (label) => {
    expect(one(`<label>${label} <input></label>`).status).not.toBe('suggest');
  });

  it('reads "within" and "outside" the saved country', () => {
    expect(
      one(
        '<label>Are you willing to relocate within the United Kingdom? <input></label>',
      ).fillValue,
    ).toBe('Yes');
    expect(
      one('<label>Would you relocate outside the UK? <input></label>')
        .fillValue,
    ).toBe('No');
  });

  it.each([
    'Do you require relocation?',
    'Relocation date',
    'Preferred relocation city',
    'Will the company relocate you?',
    'Relocation offered?',
    'Are you currently relocating?',
    'Have you relocated for a job before?',
    'Would your family be willing to relocate with you?',
    'Would your dependants relocate with you?',
    'Are you relocating from outside the UK?',
  ])('does not take “%s” for willingness to relocate', (label) => {
    expect(ANSWERS).not.toContain(detected(`<label>${label} <input></label>`));
  });

  it('never chooses a notice option that is a range or a bound', () => {
    const select = (saved: number, unit: 'weeks' | 'months', options: string) =>
      one(
        `<label>Notice period <select><option value="">Select…</option>${options}</select></label>`,
        { ...savedAnswers(), noticePeriod: { amount: saved, unit } },
      ).status;
    const bands =
      '<option>Immediately</option><option>&lt; 1 month</option><option>1-3 months</option><option>&gt; 3 months</option>';
    expect(select(1, 'months', bands)).toBe('no-option');
    expect(select(3, 'months', bands)).toBe('no-option');
    expect(select(3, 'months', '<option>3+ months</option>')).toBe('no-option');
    expect(
      select(
        1,
        'months',
        '<option>Up to 1 month</option><option>1 month+</option>',
      ),
    ).toBe('no-option');
  });

  it.each([
    'Are you currently serving your notice period?',
    'Is your notice period negotiable?',
    'When does your notice period end?',
    'What notice period does the company require from new hires?',
    'Your line manager’s notice period',
    'Notice period for your direct reports',
  ])('does not take “%s” for the applicant’s notice period', (label) => {
    expect(ANSWERS).not.toContain(detected(`<label>${label} <input></label>`));
  });

  it.each([
    'Describe your working style',
    'Describe your home work setup',
    'What working model does your current team use?',
  ])('does not take “%s” for a working preference', (label) => {
    expect(ANSWERS).not.toContain(detected(`<label>${label} <input></label>`));
  });

  it('leaves preferences inside a past job to the job', () => {
    expect(
      detected(
        '<fieldset><legend>Employment history</legend><label>Working arrangement <select><option>Hybrid</option></select></label></fieldset>',
      ),
    ).not.toBe('workArrangement');
    expect(
      detected(
        '<fieldset><legend>Employment history</legend><label>Available from <input type="date"></label></fieldset>',
      ),
    ).not.toBe('startDate');
    // Notice for the current job is still the applicant's notice period.
    expect(
      detected(
        '<fieldset><legend>Current employment</legend><label>Notice period <input></label></fieldset>',
      ),
    ).toBe('noticePeriod');
  });

  it.each([
    'When can you join a call with us?',
    'When could you start the online assessment?',
    'Date available to start interviews',
  ])('does not take “%s” for a start date', (label) => {
    expect(detected(`<label>${label} <input type="date"></label>`)).not.toBe(
      'startDate',
    );
  });

  it('never lets a placeholder example outweigh the label', () => {
    expect(
      detected(
        '<label>Anything else we should know? <input placeholder="For example, your notice period"></label>',
      ),
    ).not.toBe('noticePeriod');
  });

  it('never fills a salary field that counts in thousands', () => {
    expect(
      one('<label>Expected annual salary (£k) <input></label>').status,
    ).toBe('unusable');
    expect(
      one(
        '<label>Expected annual salary in GBP (thousands) <input type="number"></label>',
      ).status,
    ).toBe('unusable');
  });

  it('leaves a date field that states two formats', () => {
    expect(
      one(
        '<label>Earliest start date (DD/MM/YYYY or MM/DD/YYYY) <input></label>',
      ).status,
    ).toBe('ambiguous');
  });
});
