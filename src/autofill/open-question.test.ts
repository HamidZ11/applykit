import { describe, expect, it } from 'vitest';
import { loadFixture } from '@/test/load-fixture';
import { openQuestionKind, readLimits } from './open-question';
import { planFill } from './report';
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

describe('readLimits', () => {
  it.each([
    ['Describe your skills in two sentences.', null, { sentences: 2 }],
    ['In one or two sentences, why this role?', null, { sentences: 2 }],
    ['Tell us about a project (max 150 words)', null, { words: 150 }],
    ['Answer in 150-200 words', null, { words: 200 }],
    ['Word limit: 300', null, { words: 300 }],
    ['No more than 500 characters', null, { characters: 500 }],
    ['A 400-character summary', null, { characters: 400 }],
    ['Why this role? (1000 characters)', 600, { characters: 600 }],
    ['Why this role?', 500, { characters: 500 }],
  ])('reads “%s”', (text, maxLength, expected) => {
    expect(readLimits(text, maxLength)).toEqual({
      words: null,
      characters: null,
      sentences: null,
      ...expected,
    });
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
    ['q-skills', 'skills', { sentences: 2 }],
    ['q-project', 'project', { words: 150 }],
    ['q-motivation', 'motivation', { characters: 500 }],
    ['q-experience', 'experience', {}],
    ['q-problem', 'problem', { words: 200 }],
    ['q-bring', 'skills', { sentences: 1, characters: 200 }],
    ['q-answered', 'motivation', {}],
    ['q-injected', 'skills', {}],
  ])('recognises #%s as a %s question', (id, kind, limits) => {
    const report = byId(id);

    expect(report.status).toBe('open');
    expect(report.field.support).toMatchObject({
      status: 'open',
      question: {
        kind,
        limits: { words: null, characters: null, sentences: null, ...limits },
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
    );

    expect(checked).toMatchObject({
      ok: true,
      plan: [{ status: 'fill', fillValue: ANSWER, chosen: true }],
    });
  });

  it.each([
    ['disabled', 'can no longer be written to'],
    ['readonly', 'can no longer be written to'],
    ['maxlength="10"', 'longer than this question allows'],
  ])('writes nothing to a %s field', (attributes, message) => {
    const report = setUp();
    const element = document.getElementById('q') as HTMLTextAreaElement;
    if (attributes === 'disabled') element.disabled = true;
    if (attributes === 'readonly') element.readOnly = true;
    if (attributes.startsWith('maxlength')) element.maxLength = 10;

    const checked = confirmDraft(
      [...scanFields(document, visible), report.field],
      report,
      ANSWER,
    );

    expect(checked).toMatchObject({ ok: false });
    expect(checked.ok ? '' : checked.message).toContain(message);
  });

  it('writes nothing over the sentence limit or when empty', () => {
    const report = setUp();
    const fields = scanFields(document, visible);

    expect(confirmDraft(fields, report, 'One. Two. Three.')).toMatchObject({
      ok: false,
    });
    expect(confirmDraft(fields, report, '   ')).toMatchObject({ ok: false });
  });

  it('writes nothing to a field that left the page', () => {
    const report = setUp();
    document.getElementById('q')?.remove();

    expect(
      confirmDraft(scanFields(document, visible), report, ANSWER),
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

    expect(confirmDraft(fields, report, ANSWER)).toMatchObject({ ok: false });
  });
});
