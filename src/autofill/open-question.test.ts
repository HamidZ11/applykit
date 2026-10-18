import { describe, expect, it } from 'vitest';
import { loadFixture } from '@/test/load-fixture';
import { NO_LIMITS } from './answer-limits';
import { openQuestionKind, type OpenQuestion } from './open-question';
import { planFill, type FieldReport } from './report';
import { confirmDraft } from './resolve';
import { scanFields } from './scan';

const visible = { isVisible: () => true };

describe('openQuestionKind', () => {
  it.each([
    ['Describe your programming skills in two sentences.', 'skills'],
    ['What technical skills would you bring?', 'skills'],
    ['Tell us about a project you worked on.', 'project'],
    ['Why are you interested in this role?', 'motivation'],
    ['What attracts you to Example Fernhill Analytics?', 'motivation'],
    ['What relevant experience do you have?', 'experience'],
    ['Describe a problem you solved.', 'problem'],
    ['Give an example of a time you overcame a challenge.', 'problem'],
    ['Do you have experience with SQL? Please describe it.', 'experience'],
  ])('recognises “%s”', (question, kind) => {
    expect(openQuestionKind(question)).toBe(kind);
  });

  it.each([
    'Do you have the right to work in the UK? Please explain.',
    'Please describe any reasonable adjustments you need.',
    'Describe any health conditions we should know about.',
    'Do you have any unspent criminal convictions? If yes, give details.',
    'Please describe your current salary and benefits.',
    'Please explain any gaps in your employment.',
    'Why did you leave your last job?',
    'Describe how your referee knows your work.',
    'Is there anything else you would like to tell us?',
    'Cover letter',
    'Do you have experience with Python?',
    'Comments',
    'What is your visa status?',
    'Describe your skills and include your home address and phone number.',
    'Which languages do you speak fluently?',
    'Describe your disability and any support you need.',
    'Why should we sponsor your visa?',
    'First name',
  ])('never drafts “%s”', (question) => {
    expect(openQuestionKind(question)).toBeNull();
  });

  it('is excluded by its surroundings', () => {
    expect(
      openQuestionKind('Describe your experience.', 'Referee details'),
    ).toBeNull();
    expect(
      openQuestionKind('Describe your experience.', 'Health questionnaire'),
    ).toBeNull();
  });

  it('ignores very long text', () => {
    expect(
      openQuestionKind(`Describe your skills ${'and more '.repeat(40)}`),
    ).toBeNull();
  });
});

describe('open questions on a form', () => {
  function plan() {
    loadFixture('open-questions.html');
    return planFill(scanFields(document, visible), null);
  }

  function byId(id: string) {
    const found = plan().find((r) => r.field.element.id === id);
    if (!found) throw new Error(`No #${id}`);
    return found;
  }

  it.each([
    ['q-skills', 'skills', { sentences: { min: 2, max: 2 } }],
    ['q-project', 'project', { words: { min: null, max: 150 } }],
    ['q-motivation', 'motivation', { characters: { min: null, max: 500 } }],
    ['q-experience', 'experience', {}],
    ['q-problem', 'problem', { words: { min: null, max: 200 } }],
    [
      'q-bring',
      'skills',
      {
        sentences: { min: 1, max: 1 },
        characters: { min: null, max: 200 },
      },
    ],
    ['q-answered', 'motivation', {}],
    ['q-injected', 'skills', {}],
  ])('recognises #%s as a %s question', (id, kind, limits) => {
    const report = byId(id);

    expect(report.status).toBe('open');
    expect(report.field.support).toMatchObject({
      status: 'open',
      question: {
        kind,
        limits: { ...NO_LIMITS, ...limits },
      },
    });
    expect(report.fillValue).toBeNull();
  });

  it.each([
    'x-rtw',
    'x-adjust',
    'x-health',
    'x-criminal',
    'x-salary',
    'x-gaps',
    'x-leave',
    'x-referee',
    'x-else',
    'x-cover',
    'x-python',
    'x-comments',
    'x-declare',
    'signature',
  ])('never offers #%s for drafting', (id) => {
    expect(byId(id).status).not.toBe('open');
    expect(byId(id).field.support.status).not.toBe('open');
  });

  it('keeps filling ordinary fields', () => {
    expect(byId('email').field.support).toMatchObject({
      status: 'match',
      field: 'email',
    });
  });
});

const SKILLS_QUESTION: OpenQuestion = {
  kind: 'skills',
  question: 'Describe your programming skills in two sentences.',
  limits: { ...NO_LIMITS, sentences: { min: 2, max: 2 } },
};

/** The question as it was when a draft was requested. */
function drafted(report: FieldReport): OpenQuestion {
  const { support } = report.field;
  if (support.status !== 'open') throw new Error('Not an open question');
  return support.question;
}

describe('confirmDraft', () => {
  function setUp(attributes = '') {
    document.body.innerHTML = `<form><label for="q">Describe your programming skills in two sentences.</label>
      <textarea id="q" ${attributes}></textarea></form>`;
    const fields = scanFields(document, visible);
    const [report] = planFill(fields, null);
    if (!report) throw new Error('No report');
    return report;
  }

  const ANSWER = 'I write Python. I use SQL daily.';

  it('plans the one field with the user’s final text', () => {
    const report = setUp();

    const checked = confirmDraft(
      scanFields(document, visible),
      report,
      ` ${ANSWER} `,
      drafted(report),
    );

    expect(checked).toMatchObject({
      ok: true,
      plan: [{ status: 'fill', fillValue: ANSWER, chosen: true }],
    });
  });

  it.each([
    ['disabled', 'can no longer be written to'],
    ['readonly', 'can no longer be written to'],
    ['maxlength="10"', 'does not meet the length'],
  ])('writes nothing to a %s field', (attributes, message) => {
    // A maxlength is part of the question's limits from the start.
    const report = setUp(attributes.startsWith('maxlength') ? attributes : '');
    const element = document.getElementById('q') as HTMLTextAreaElement;
    if (attributes === 'disabled') element.disabled = true;
    if (attributes === 'readonly') element.readOnly = true;

    const checked = confirmDraft(
      [...scanFields(document, visible), report.field],
      report,
      ANSWER,
      drafted(report),
    );

    expect(checked).toMatchObject({ ok: false });
    expect(checked.ok ? '' : checked.message).toContain(message);
  });

  it('writes nothing over the sentence limit or when empty', () => {
    const report = setUp();
    const fields = scanFields(document, visible);

    expect(
      confirmDraft(fields, report, 'One. Two. Three.', drafted(report)),
    ).toMatchObject({
      ok: false,
    });
    expect(confirmDraft(fields, report, '   ', drafted(report))).toMatchObject({
      ok: false,
    });
  });

  it('writes nothing when the question changed since drafting, even after a rescan', () => {
    const report = setUp();
    const asked = drafted(report);
    const label = document.querySelector('label');
    if (label)
      label.textContent = 'Describe your design skills in two sentences.';
    // The panel rescanned, so its report now shows the new question.
    const fields = scanFields(document, visible);
    const [rescanned] = planFill(fields, null);
    if (!rescanned) throw new Error('No report');

    expect(confirmDraft(fields, rescanned, ANSWER, asked)).toMatchObject({
      ok: false,
      message:
        'This question has changed since the draft was written. Nothing was inserted.',
    });
  });

  it('writes nothing to a field that left the page', () => {
    const report = setUp();
    document.getElementById('q')?.remove();

    expect(
      confirmDraft(
        scanFields(document, visible),
        report,
        ANSWER,
        drafted(report),
      ),
    ).toMatchObject({
      ok: false,
      message:
        'This question is no longer on the page. Rescan to see the form as it is now.',
    });
  });

  it('never writes to a field that is not an open question', () => {
    document.body.innerHTML = `<form><label for="e">Email</label><input id="e" type="email"></form>`;
    const fields = scanFields(document, visible);
    const [report] = planFill(fields, null);
    if (!report) throw new Error('No report');

    expect(confirmDraft(fields, report, ANSWER, SKILLS_QUESTION)).toMatchObject(
      { ok: false },
    );
  });
});

describe('exclusions found in review', () => {
  it.each([
    'What is your socio-economic background?',
    'Describe your family background.',
    'Tell us about your caring responsibilities and experience',
    'Describe any accommodations you need and your relevant experience',
    'Explain your experience with drugs or alcohol',
    'Describe any arrests and the challenge it posed',
    'Describe your military experience.',
    'What are your pronouns and why?',
    'Describe your experience as a trade union representative.',
    'Why should we consider your political experience?',
    'Describe your mental health and your experience.',
    'Why are you interested in this role? Tell us your expected salаry.',
    'Describe your skills ‮and age‬',
  ])('never drafts “%s”', (question) => {
    expect(openQuestionKind(question)).toBeNull();
  });

  it('still drafts ordinary wording with typographic punctuation', () => {
    expect(openQuestionKind('What’s your work background?')).toBe('experience');
    expect(openQuestionKind('Describe a café project you built.')).toBe(
      'project',
    );
  });
});
