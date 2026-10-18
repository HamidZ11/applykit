import { describe, expect, it, vi } from 'vitest';
import type { EducationRecord } from '@/domain/user-profile';
import { savedAnswers } from '@/test/answer-fixtures';
import { educationRecords, fullProfile } from '@/test/autofill-fixtures';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { detectControl, normalise, type DetectableControl } from './detect';
import { fillFields } from './fill';
import {
  compareGraduation,
  parseGraduationQuestion,
  type Deadline,
} from './graduation';
import { autofillValuesFrom } from './profile-values';
import { planFill, summarise, type FieldReport } from './report';
import { confirmAnswer } from './resolve';
import { scanFields } from './scan';

const NOW = new Date('2026-10-18T12:00:00Z');
const visible = { isVisible: (e: Element) => !e.closest('[hidden]') };

/** A fictional BSc expected in June 2027, and A levels before it. */
const [degree, aLevels] = educationRecords() as [
  EducationRecord,
  EducationRecord,
];
const masters: EducationRecord = {
  id: 'masters',
  institution: 'Example Institute of Technology',
  qualification: 'MSc Data Science',
  fieldOfStudy: 'Data Science',
  startDate: '2027-09',
  endDate: '2028-09',
  grade: '',
};

function values(records: EducationRecord[] = [degree, aLevels]) {
  const profile = fullProfile();
  profile.education = records;
  return autofillValuesFrom(profile, savedAnswers());
}

function plan(records?: EducationRecord[]): FieldReport[] {
  return planFill(scanFields(document, visible), values(records), NOW);
}

function byId(reports: FieldReport[], id: string): FieldReport {
  const found = reports.find((r) => r.field.element.id === id);
  if (!found) throw new Error(`No field #${id}`);
  return found;
}

const YES_NO =
  '<select id="q"><option value="">Select…</option><option value="y">Yes</option><option value="n">No</option></select>';

/** Plans one question asked as a Yes/No list. */
function ask(question: string, records?: EducationRecord[]): FieldReport {
  loadHtml(`<form><label>${question} ${YES_NO}</label></form>`);
  return byId(plan(records), 'q');
}

function detected(html: string): string {
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

describe('reading the question', () => {
  const parse = (text: string) => parseGraduationQuestion(normalise(text));

  it.each([
    [
      'Will you graduate before October 2027?',
      { relation: 'before', deadline: { year: 2027, month: 10, day: null } },
    ],
    [
      'Will you have graduated by 15th September 2027?',
      { relation: 'by', deadline: { year: 2027, month: 9, day: 15 } },
    ],
    [
      'Will you graduate before the end of 2027?',
      { relation: 'by', deadline: { year: 2027, month: null, day: null } },
    ],
    [
      'Are you graduating in Sept 2027?',
      { relation: 'in', deadline: { year: 2027, month: 9, day: null } },
    ],
    [
      'Will you complete your degree no later than 1 June 2027?',
      { relation: 'by', deadline: { year: 2027, month: 6, day: 1 } },
    ],
  ])('reads “%s”', (text, expected) => {
    expect(parse(text)).toEqual({ kind: 'deadline', ...expected });
  });

  it('reads year and already-graduated questions', () => {
    expect(parse('What year do you expect to graduate?')).toEqual({
      kind: 'year',
    });
    expect(parse('Have you already graduated?')).toEqual({
      kind: 'completed',
    });
  });

  it.each([
    ['Will you graduate before October?', 'no date with a year'],
    [
      'Will you graduate between June 2027 and September 2027?',
      'more than one date',
    ],
    ['Will you graduate before 31 February 2027?', 'not valid'],
    ['Will you graduate on 15 June 2027?', 'cannot tell how the date'],
    ['Are you graduating in 15 June 2027?', 'not a single day'],
  ])('never guesses from “%s”', (text, reason) => {
    const question = parse(text);
    expect(question.kind).toBe('unclear');
    expect(question.kind === 'unclear' && question.reason).toContain(reason);
  });
});

describe('comparing dates at the precision saved', () => {
  const june2027 = { year: 2027, month: 6 };
  const at = (
    year: number,
    month: number | null = null,
    day: number | null = null,
  ): Deadline => ({ year, month, day });

  it.each([
    ['before', at(2027, 10), 'yes'],
    ['before', at(2027, 3), 'no'],
    ['before', at(2027, 6), 'no'],
    ['by', at(2027, 6), 'yes'],
    ['by', at(2027, 5), 'no'],
    ['in', at(2027, 6), 'yes'],
    ['in', at(2027, 7), 'no'],
    ['before', at(2028), 'yes'],
    ['before', at(2027), 'no'],
    ['by', at(2027), 'yes'],
    ['by', at(2026), 'no'],
    ['in', at(2027), 'yes'],
    ['in', at(2026), 'no'],
    ['before', at(2027, 7, 1), 'yes'],
    ['before', at(2027, 5, 31), 'no'],
    ['before', at(2027, 6, 15), 'unknown'],
    ['before', at(2027, 6, 1), 'no'],
    ['by', at(2027, 6, 15), 'unknown'],
    ['by', at(2027, 6, 30), 'yes'],
    ['by', at(2027, 7, 1), 'yes'],
  ] as const)('June 2027 %s %j → %s', (relation, deadline, expected) => {
    expect(compareGraduation(june2027, relation, deadline)).toBe(expected);
  });

  it('knows how long each month is', () => {
    expect(
      compareGraduation({ year: 2028, month: 2 }, 'by', at(2028, 2, 29)),
    ).toBe('yes');
    expect(
      compareGraduation({ year: 2027, month: 2 }, 'by', at(2027, 2, 28)),
    ).toBe('yes');
    expect(
      compareGraduation({ year: 2028, month: 2 }, 'by', at(2028, 2, 28)),
    ).toBe('unknown');
  });
});

describe('graduation answers from saved education', () => {
  it('says Yes before a later deadline, from the expected date', () => {
    expect(ask('Will you graduate before October 2027?')).toMatchObject({
      status: 'suggest',
      fillValue: 'y',
      value: 'Yes',
      note: 'Expected graduation: June 2027',
    });
  });

  it('says No before an earlier deadline', () => {
    expect(ask('Will you graduate before March 2027?')).toMatchObject({
      status: 'suggest',
      fillValue: 'n',
    });
  });

  it('treats “by” as including the month', () => {
    expect(
      ask('Will you have completed your degree by June 2027?').fillValue,
    ).toBe('y');
  });

  it('compares a year', () => {
    expect(ask('Are you graduating in 2027?').fillValue).toBe('y');
    expect(ask('Are you graduating in 2026?').fillValue).toBe('n');
  });

  it('never guesses a day the profile does not save', () => {
    expect(ask('Will you graduate before 15 June 2027?')).toMatchObject({
      status: 'manual',
      fillValue: null,
      reason:
        'Your profile saves only the month you expect to graduate, June 2027, so ApplyKit cannot tell. Answer it yourself.',
    });
  });

  it('suggests the expected year', () => {
    loadHtml(
      '<form><label>What year do you expect to graduate? <input id="q" type="number"></label></form>',
    );
    expect(byId(plan(), 'q')).toMatchObject({
      status: 'suggest',
      fillValue: '2027',
    });
  });

  it('says No to “already graduated” only while graduation is still to come', () => {
    expect(ask('Have you already graduated?').fillValue).toBe('n');

    const ended = { ...degree, endDate: '2025-06' };
    expect(ask('Have you already graduated?', [ended])).toMatchObject({
      status: 'manual',
      fillValue: null,
    });
    expect(ask('Will you graduate before October 2027?', [ended]).status).toBe(
      'manual',
    );
  });

  it('never reads an end date this month as an expected graduation', () => {
    expect(
      ask('Will you graduate before December 2026?', [
        { ...degree, endDate: '2026-10' },
      ]).status,
    ).toBe('manual');
  });

  it('says when the degree has no end date', () => {
    expect(
      ask('Will you graduate before October 2027?', [
        { ...degree, endDate: '' },
      ]),
    ).toMatchObject({
      status: 'no-value',
      reason: 'Your saved degree has no end date.',
    });
  });
});

describe('which saved degree', () => {
  it('uses the one degree, never school qualifications', () => {
    expect(
      ask('Will you graduate before October 2027?', [aLevels, degree])
        .fillValue,
    ).toBe('y');
    expect(
      ask('Will you graduate before October 2027?', [aLevels]),
    ).toMatchObject({
      status: 'no-value',
      reason: 'None of your saved education is clearly a university degree.',
    });
  });

  it('asks the user when several degrees fit', () => {
    expect(
      ask('Will you graduate before October 2027?', [degree, masters]),
    ).toMatchObject({ status: 'ambiguous', fillValue: null });
  });

  it('uses the kind of degree the question names', () => {
    expect(
      ask('Will you have completed your bachelor’s degree by September 2027?', [
        degree,
        masters,
      ]).fillValue,
    ).toBe('y');
    expect(
      ask('Will you have completed your master’s degree by September 2027?', [
        degree,
        masters,
      ]).fillValue,
    ).toBe('n');
    expect(
      ask('Will you have completed your doctoral degree by September 2027?', [
        degree,
      ]),
    ).toMatchObject({
      status: 'no-value',
      reason:
        'None of your saved degrees is the kind this question asks about.',
    });
  });
});

describe('recognising graduation questions', () => {
  it.each([
    'When is your graduation ceremony?',
    'Will you attend your graduation ceremony in July 2027?',
    'Are you eligible for our graduate programme?',
    'Do you meet the graduation requirements for this role?',
    'Can you provide proof that you graduated?',
    'Please upload your transcript',
    'What classification do you expect to graduate with?',
    'Is this a graduate role you are applying for?',
  ])('does not answer “%s”', (label) => {
    expect(detected(`<label>${label} ${YES_NO}</label>`)).not.toBe(
      'graduation',
    );
  });

  it('never answers for someone else', () => {
    expect(
      detected(
        `<label>Will your partner graduate before October 2027? ${YES_NO}</label>`,
      ),
    ).not.toBe('graduation');
  });

  it('never reads a question from a technical name alone', () => {
    expect(
      detected('<input name="graduateBeforeOctober" id="willGraduate">'),
    ).not.toBe('graduation');
  });

  it('keeps declarations and eligibility to work protected', () => {
    expect(
      detected(
        '<label><input type="checkbox"> I declare that I meet all eligibility requirements, including graduation before October 2027.</label>',
      ),
    ).toBe('manual:consent');
    expect(
      detected(
        `<label>Will you need visa sponsorship after you graduate in 2027? ${YES_NO}</label>`,
      ),
    ).toBe('manual:sensitive');
  });

  it('is recognised inside an education section', () => {
    expect(
      detected(
        `<fieldset><legend>Education</legend><label>Will you graduate before October 2027? ${YES_NO}</label></fieldset>`,
      ),
    ).toBe('graduation');
  });
});

describe('controls', () => {
  it('never types Yes into a text field', () => {
    loadHtml(
      '<form><label>Will you graduate before December 2027? <input id="q"></label></form>',
    );
    expect(byId(plan(), 'q')).toMatchObject({
      status: 'manual',
      fillValue: null,
    });
    expect(byId(plan(), 'q').reason).toContain('The likely answer is Yes');
  });

  it('needs an option that says exactly Yes or No', () => {
    loadHtml(
      '<form><label>Will you graduate before October 2027? <select id="q"><option value="">Select…</option><option>Yes, by then</option><option>Not sure</option></select></label></form>',
    );
    expect(byId(plan(), 'q')).toMatchObject({ status: 'no-option' });
  });

  it('guides radio buttons and custom dropdowns, never fills them', () => {
    loadFixture('graduation-application.html');
    const reports = plan();

    for (const id of ['grad-radio-yes', 'grad-custom']) {
      expect(byId(reports, id), id).toMatchObject({
        status: 'unsupported',
        fillValue: null,
        suggestion: {
          kind: 'value',
          value: 'Yes',
          note: 'Expected graduation: June 2027. Choose it yourself on this page.',
        },
      });
    }
  });

  it('keeps an answer already chosen', () => {
    loadFixture('graduation-application.html');
    expect(byId(plan(), 'grad-answered').status).toBe('keep');
  });
});

describe('the graduation fixture', () => {
  it('suggests exactly the answers the saved degree settles', async () => {
    loadFixture('graduation-application.html');
    const reports = plan();

    const suggested = reports
      .filter((r) => r.status === 'suggest')
      .map((r) => [r.field.element.id, r.fillValue] as const);
    expect(suggested).toEqual([
      ['grad-before', 'y'],
      ['grad-by', 'y'],
      ['grad-in', 'y'],
      ['grad-year', '2027'],
      ['grad-done', 'n'],
      ['grad-bachelor', 'y'],
    ]);
    for (const id of ['ceremony', 'eligible']) {
      expect(byId(reports, id).target, id).toBeNull();
    }
    for (const id of [
      'rtw-yes',
      'sponsorship',
      'gender',
      'ethnicity',
      'declaration',
      'privacy',
    ]) {
      expect(byId(reports, id).status, id).toBe('manual');
    }
    // Ordinary education autofill is unchanged beside them.
    expect(byId(reports, 'graduation')).toMatchObject({
      status: 'fill',
      fillValue: '06/2027',
    });

    // Autofill never writes a graduation answer.
    const outcomes = await fillFields(reports);
    for (const [id] of suggested) {
      expect((document.getElementById(id) as HTMLInputElement).value).toBe('');
    }
    expect(summarise(outcomes).needsYou).toBeGreaterThanOrEqual(6);
  });
});

describe('confirming a graduation answer', () => {
  const rescan = () => scanFields(document, visible);
  const select = (id: string) =>
    document.getElementById(id) as HTMLSelectElement;

  it('fills the one question the user confirms, and verifies it', async () => {
    loadFixture('graduation-application.html');
    const previewed = byId(plan(), 'grad-before');

    const check = confirmAnswer(rescan(), values(), previewed, NOW);
    if (!check.ok) throw new Error(check.message);
    const [outcome] = await fillFields(check.plan);

    expect(outcome).toMatchObject({ status: 'filled', chosen: true });
    expect(select('grad-before').value).toBe('y');
    expect(select('grad-by').value).toBe('');
  });

  it('writes nothing when the saved degree changed or was removed', () => {
    loadFixture('graduation-application.html');
    const previewed = byId(plan(), 'grad-before');

    expect(
      confirmAnswer(
        rescan(),
        values([{ ...degree, endDate: '2027-11' }]),
        previewed,
        NOW,
      ).ok,
    ).toBe(false);
    expect(confirmAnswer(rescan(), values([aLevels]), previewed, NOW).ok).toBe(
      false,
    );
  });

  it('writes nothing when the deadline changed', () => {
    loadFixture('graduation-application.html');
    const previewed = byId(plan(), 'grad-before');
    // As the page's "Change intake" does.
    const label = document.getElementById('grad-before-label');
    if (label) label.textContent = 'Will you graduate before March 2027?';

    expect(confirmAnswer(rescan(), values(), previewed, NOW)).toEqual({
      ok: false,
      message:
        'This question or your saved answer has changed. Nothing was filled; check it again.',
    });
    expect(select('grad-before').value).toBe('');
  });

  it('keeps an answer the user chose first', () => {
    loadFixture('graduation-application.html');
    const previewed = byId(plan(), 'grad-before');
    select('grad-before').value = 'n';

    expect(confirmAnswer(rescan(), values(), previewed, NOW).ok).toBe(false);
    expect(select('grad-before').value).toBe('n');
  });

  it('reports an answer the page rejects', async () => {
    loadFixture('graduation-application.html');
    const element = select('grad-year');
    element.addEventListener('input', () => {
      (element as unknown as HTMLInputElement).value = '';
    });
    const check = confirmAnswer(
      rescan(),
      values(),
      byId(plan(), 'grad-year'),
      NOW,
    );
    if (!check.ok) throw new Error(check.message);

    const [outcome] = await fillFields(check.plan);

    expect(outcome?.status).toBe('rejected');
  });

  it('never submits, clicks or presses keys', async () => {
    loadFixture('graduation-application.html');
    const onSubmit = vi.fn((event: Event) => {
      event.preventDefault();
    });
    const onClick = vi.fn();
    document
      .getElementById('application')
      ?.addEventListener('submit', onSubmit);
    document.addEventListener('click', onClick, true);
    const check = confirmAnswer(
      rescan(),
      values(),
      byId(plan(), 'grad-done'),
      NOW,
    );
    if (!check.ok) throw new Error(check.message);

    await fillFields(check.plan);

    expect(select('grad-done').value).toBe('n');
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});
