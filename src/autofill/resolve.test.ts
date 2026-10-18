import { describe, expect, it, vi } from 'vitest';
import type { EmploymentRecord } from '@/domain/user-profile';
import {
  educationRecords,
  employmentRecords,
  fullProfile,
  gcseRecord,
} from '@/test/autofill-fixtures';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import type { AutofillValues } from './fields';
import { fillFields } from './fill';
import { autofillValuesFrom } from './profile-values';
import { planFill, type FieldReport } from './report';
import { confirmChoice, previewChoice, type SectionChoice } from './resolve';
import { scanFields, type FormControl, type ScannedField } from './scan';

const NOW = new Date('2026-10-17T12:00:00Z');

/** A degree, A levels and GCSEs, as the background would send them. */
function values(
  records = [...educationRecords(), gcseRecord()],
): AutofillValues {
  const profile = fullProfile();
  profile.education = records;
  return autofillValuesFrom(profile);
}

function field(fields: ScannedField[], id: string): ScannedField {
  const found = fields.find((f) => f.element.id === id);
  if (!found) throw new Error(`No field #${id}`);
  return found;
}

function input(id: string): FormControl {
  const element = document.getElementById(id);
  if (!element) throw new Error(`No #${id}`);
  return element as FormControl;
}

/** The choice of a record for the section containing `id`. */
function choiceFor(
  fields: ScannedField[],
  id: string,
  recordId: string,
): SectionChoice {
  return { group: field(fields, id).group, recordId };
}

function byElement(reports: FieldReport[]) {
  return Object.fromEntries(
    reports.map((r) => [r.field.element.id, [r.status, r.fillValue]]),
  );
}

describe('ambiguous education', () => {
  it('lists the saved records a school section could mean', () => {
    loadFixture('interactive-education.html');

    const reports = planFill(scanFields(document), values(), NOW);
    const school = reports.find((r) => r.field.element.id === 'sec-school');

    expect(school).toMatchObject({
      status: 'ambiguous',
      candidates: ['a-levels', 'gcses'],
      fillValue: null,
    });
  });

  it('offers nothing to choose when no saved record fits', () => {
    loadFixture('interactive-education.html');

    const reports = planFill(
      scanFields(document),
      values(educationRecords().slice(0, 1)),
      NOW,
    );

    expect(
      reports.find((r) => r.field.element.id === 'sec-school'),
    ).toMatchObject({
      status: 'no-value',
      candidates: [],
    });
  });

  it('lists several university records for a university field', () => {
    const [degree] = educationRecords();
    if (!degree) throw new Error('No degree');
    loadHtml('<label>University <input id="u"></label>');

    const reports = planFill(
      scanFields(document),
      values([
        degree,
        { ...degree, id: 'masters', qualification: 'MSc Statistics' },
      ]),
      NOW,
    );

    expect(reports[0]).toMatchObject({
      status: 'ambiguous',
      candidates: ['degree', 'masters'],
    });
  });
});

describe('previewChoice', () => {
  it('shows what the chosen record fills in its section only', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);

    const preview = previewChoice(
      fields,
      values(),
      choiceFor(fields, 'sec-school', 'a-levels'),
      NOW,
    );

    expect(preview?.record).toMatchObject({
      institution: 'Example Sixth Form College',
    });
    expect(byElement(preview?.reports ?? [])).toEqual({
      'sec-school': ['fill', 'Example Sixth Form College'],
      'sec-qual': ['fill', 'al'],
      'sec-grades': ['fill', 'A*AA'],
      'sec-year': ['fill', '2024'],
    });
    expect(preview?.reports.every((r) => r.chosen)).toBe(true);
  });

  it('says which fields the record cannot fill, and why', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);

    const preview = previewChoice(
      fields,
      values(),
      choiceFor(fields, 'sec-school', 'gcses'),
      NOW,
    );

    expect(byElement(preview?.reports ?? [])).toMatchObject({
      'sec-school': ['fill', 'Example Grammar School'],
      'sec-qual': ['fill', 'gc'],
      'sec-grades': ['no-value', null],
      'sec-year': ['fill', '2022'],
    });
  });

  it('lists fields that already have a value as kept', () => {
    loadFixture('interactive-education.html');
    (input('sec-grades') as HTMLInputElement).value = 'AAB';
    const fields = scanFields(document);

    const preview = previewChoice(
      fields,
      values(),
      choiceFor(fields, 'sec-school', 'a-levels'),
      NOW,
    );

    expect(byElement(preview?.reports ?? [])['sec-grades']).toEqual([
      'keep',
      null,
    ]);
  });

  it('refuses a record that does not fit the section', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);

    expect(
      previewChoice(
        fields,
        values(),
        choiceFor(fields, 'sec-school', 'degree'),
        NOW,
      ),
    ).toBeNull();
    expect(
      previewChoice(
        fields,
        values(),
        choiceFor(fields, 'sec-school', 'made-up'),
        NOW,
      ),
    ).toBeNull();
  });

  it('keeps choices for numbered sections apart', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);

    const first = previewChoice(
      fields,
      values(),
      choiceFor(fields, 'e1-inst', 'degree'),
      NOW,
    );

    expect(Object.keys(byElement(first?.reports ?? []))).toEqual([
      'e1-inst',
      'e1-start',
      'e1-end',
    ]);
  });
});

describe('confirmChoice and filling', () => {
  function previewed(fields: ScannedField[], choice: SectionChoice) {
    return previewChoice(fields, values(), choice, NOW)?.reports ?? [];
  }

  it('fills only the chosen section and verifies what the page kept', async () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);
    const choice = choiceFor(fields, 'sec-school', 'a-levels');
    const seen = previewed(fields, choice);
    const events: string[] = [];
    document.addEventListener('change', (e) => {
      events.push((e.target as HTMLElement).id);
    });

    const check = confirmChoice(
      scanFields(document),
      values(),
      choice,
      seen,
      NOW,
    );
    if (!check.ok) throw new Error(check.message);
    const outcomes = await fillFields(check.plan);

    expect(
      outcomes.map((r) => [r.field.element.id, r.status, r.chosen]),
    ).toEqual([
      ['sec-school', 'filled', true],
      ['sec-qual', 'filled', true],
      ['sec-grades', 'filled', true],
      ['sec-year', 'filled', true],
    ]);
    expect(events).toEqual([
      'sec-school',
      'sec-qual',
      'sec-grades',
      'sec-year',
    ]);
    for (const id of ['e1-inst', 'e2-inst', 'first', 'employer', 'office']) {
      expect(input(id).value, id).toBe('');
    }
    expect(input('email').value).toBe('already.typed@example.org');
  });

  it('applies separate choices to separate sections', async () => {
    loadFixture('interactive-education.html');
    for (const [id, record] of [
      ['e1-inst', 'gcses'],
      ['e2-inst', 'a-levels'],
    ] as const) {
      const fields = scanFields(document);
      const choice = choiceFor(fields, id, record);
      const check = confirmChoice(
        fields,
        values(),
        choice,
        previewed(fields, choice),
        NOW,
      );
      if (!check.ok) throw new Error(check.message);
      await fillFields(check.plan);
    }

    expect(input('e1-inst').value).toBe('Example Grammar School');
    expect(input('e1-end').value).toBe('06/2022');
    expect(input('e2-inst').value).toBe('Example Sixth Form College');
    expect(input('sec-school').value).toBe('');
  });

  it('fills nothing when a field was added to the section since the preview', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);
    const choice = choiceFor(fields, 'e1-inst', 'degree');
    const seen = previewed(fields, choice);
    document
      .querySelector('[aria-labelledby="edu-1"]')
      ?.insertAdjacentHTML(
        'beforeend',
        '<label>Grade <input id="e1-grade"></label>',
      );

    const check = confirmChoice(
      scanFields(document),
      values(),
      choice,
      seen,
      NOW,
    );

    expect(check).toEqual({
      ok: false,
      message:
        'This section has changed since you chose. Nothing was filled; review it again.',
    });
  });

  it('is not affected by sections added elsewhere', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);
    const choice = choiceFor(fields, 'e1-inst', 'degree');
    const seen = previewed(fields, choice);
    document
      .getElementById('education-list')
      ?.insertAdjacentHTML(
        'beforeend',
        '<section aria-labelledby="edu-3"><h3 id="edu-3">Education 3</h3><label>Institution <input id="e3-inst"></label></section>',
      );

    expect(
      confirmChoice(scanFields(document), values(), choice, seen, NOW).ok,
    ).toBe(true);
  });

  it('fills nothing when the section was removed', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);
    const choice = choiceFor(fields, 'e1-inst', 'degree');
    const seen = previewed(fields, choice);
    document.querySelector('[aria-labelledby="edu-1"]')?.remove();

    expect(
      confirmChoice(scanFields(document), values(), choice, seen, NOW),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining('no longer on the page') as string,
    });
  });

  it('rejects a record that is no longer saved', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);
    const choice = choiceFor(fields, 'sec-school', 'gcses');
    const seen = previewed(fields, choice);

    expect(
      confirmChoice(fields, values(educationRecords()), choice, seen, NOW),
    ).toMatchObject({
      ok: false,
      message: expect.stringContaining(
        'no longer in your saved profile',
      ) as string,
    });
  });

  it('fills nothing when the user typed into a field after the preview', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);
    const choice = choiceFor(fields, 'sec-school', 'a-levels');
    const seen = previewed(fields, choice);
    (input('sec-grades') as HTMLInputElement).value = 'ABB';

    const check = confirmChoice(
      scanFields(document),
      values(),
      choice,
      seen,
      NOW,
    );

    expect(check.ok).toBe(false);
    expect(input('sec-grades').value).toBe('ABB');
  });

  it('fills nothing when the record changed after the preview', () => {
    loadFixture('interactive-education.html');
    const fields = scanFields(document);
    const choice = choiceFor(fields, 'sec-school', 'a-levels');
    const seen = previewed(fields, choice);
    const edited = values();
    const record = edited.education.find((r) => r.id === 'a-levels');
    if (!record) throw new Error('No record');
    record.institution = 'Another Sixth Form';

    expect(
      confirmChoice(scanFields(document), edited, choice, seen, NOW),
    ).toEqual({
      ok: false,
      message:
        'This section has changed since you chose. Nothing was filled; review it again.',
    });
  });

  it('reports a value the page rejects instead of counting it as filled', async () => {
    loadFixture('interactive-education.html');
    input('sec-year').addEventListener('change', (e) => {
      (e.target as HTMLInputElement).value = '';
    });
    const fields = scanFields(document);
    const choice = choiceFor(fields, 'sec-school', 'a-levels');

    const check = confirmChoice(
      fields,
      values(),
      choice,
      previewed(fields, choice),
      NOW,
    );
    if (!check.ok) throw new Error(check.message);
    const outcomes = await fillFields(check.plan);

    expect(
      outcomes.find((r) => r.field.element.id === 'sec-year')?.status,
    ).toBe('rejected');
  });

  it('never submits or clicks', async () => {
    loadFixture('interactive-education.html');
    const form = document.getElementById('application') as HTMLFormElement;
    const onSubmit = vi.fn((e: Event) => {
      e.preventDefault();
    });
    const onClick = vi.fn();
    form.addEventListener('submit', onSubmit);
    document.addEventListener('click', onClick, true);
    const fields = scanFields(document);
    const choice = choiceFor(fields, 'sec-school', 'a-levels');

    const check = confirmChoice(
      fields,
      values(),
      choice,
      previewed(fields, choice),
      NOW,
    );
    if (!check.ok) throw new Error(check.message);
    await fillFields(check.plan);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('choosing a saved job', () => {
  /** The employment fixture's two jobs, as the background would send them. */
  function jobs(records: EmploymentRecord[] = employmentRecords()) {
    const profile = fullProfile();
    profile.employment = records;
    return autofillValuesFrom(profile);
  }

  const visible = { isVisible: (e: Element) => !e.closest('[hidden]') };
  const scan = () => scanFields(document, visible);

  it('previews what the chosen job fills in its section only', () => {
    loadFixture('employment-application.html');
    const fields = scan();

    const preview = previewChoice(
      fields,
      jobs(),
      choiceFor(fields, 'j1-company', 'logistics'),
      NOW,
    );

    expect(preview?.record).toMatchObject({ employer: 'Example Logistics' });
    expect(byElement(preview?.reports ?? [])).toEqual({
      'j1-company': ['fill', 'Example Logistics'],
      'j1-title': ['fill', 'Warehouse Operative'],
      'j1-from': ['fill', '2024-01'],
      'j1-to': ['fill', '2025-01'],
      'j1-duties': [
        'fill',
        'Picked and packed orders, ran stock counts and kept the loading bay safe.',
      ],
    });
    expect(preview?.reports.every((r) => r.chosen)).toBe(true);
  });

  it('says what the chosen job leaves to the user, and why', () => {
    loadFixture('employment-application.html');
    const fields = scan();

    const preview = previewChoice(
      fields,
      jobs(),
      choiceFor(fields, 'j2-employer', 'testing'),
      NOW,
    );

    expect(byElement(preview?.reports ?? [])).toEqual({
      'j2-employer': ['fill', 'Example Testing Services'],
      // Date inputs need a day the profile does not have.
      'j2-start': ['unusable', null],
      // A current role has no end date.
      'j2-end': ['manual', null],
      // A custom dropdown is guided, now from the chosen job.
      'j2-type': ['unsupported', null],
      // The user's own entry is kept.
      'j2-title': ['keep', null],
    });
    expect(
      preview?.reports.find((r) => r.field.element.id === 'j2-type')
        ?.suggestion,
    ).toMatchObject({ kind: 'value', value: 'Part-time' });
  });

  it('lists the section’s own questions as left to the user', () => {
    loadHtml(`<form>
      <fieldset><legend>Employment 1</legend>
        <label>Employer <input id="employer"></label>
        <label>Reason for leaving <textarea id="reason"></textarea></label>
      </fieldset></form>`);
    const fields = scanFields(document);

    const preview = previewChoice(
      fields,
      jobs(),
      choiceFor(fields, 'employer', 'logistics'),
      NOW,
    );

    expect(byElement(preview?.reports ?? [])).toEqual({
      employer: ['fill', 'Example Logistics'],
      reason: ['manual', null],
    });
  });

  it('says when the chosen job lacks a saved value', () => {
    loadFixture('employment-application.html');
    const fields = scan();
    const [current, earlier] = employmentRecords();
    if (!current || !earlier) throw new Error('No jobs');

    const preview = previewChoice(
      fields,
      jobs([current, { ...earlier, description: '' }]),
      choiceFor(fields, 'j1-company', 'logistics'),
      NOW,
    );

    expect(
      preview?.reports.find((r) => r.field.element.id === 'j1-duties'),
    ).toMatchObject({
      status: 'no-value',
      reason: 'Your saved job has no description.',
    });
  });

  it('fills only the chosen section and counts what the page kept', async () => {
    loadFixture('employment-application.html');
    const fields = scan();
    const choice = choiceFor(fields, 'j1-company', 'logistics');
    const preview = previewChoice(fields, jobs(), choice, NOW);
    const changed: string[] = [];
    document.addEventListener('input', (event) => {
      changed.push((event.target as HTMLElement).id);
    });

    const check = confirmChoice(
      scan(),
      jobs(),
      choice,
      preview?.reports ?? [],
      NOW,
    );
    if (!check.ok) throw new Error(check.message);
    const outcomes = await fillFields(check.plan);

    expect(outcomes.map((r) => [r.field.element.id, r.status])).toEqual([
      ['j1-company', 'filled'],
      ['j1-title', 'filled'],
      ['j1-from', 'filled'],
      ['j1-to', 'filled'],
      ['j1-duties', 'filled'],
    ]);
    expect(changed).toEqual([
      'j1-company',
      'j1-title',
      'j1-from',
      'j1-to',
      'j1-duties',
    ]);
    for (const id of ['cur-employer', 'prev-employer', 'j2-employer']) {
      expect(input(id).value, id).toBe('');
    }
  });

  it('fills nothing when the job was removed from the profile', () => {
    loadFixture('employment-application.html');
    const fields = scan();
    const choice = choiceFor(fields, 'j1-company', 'logistics');
    const preview = previewChoice(fields, jobs(), choice, NOW);

    const check = confirmChoice(
      scan(),
      jobs(employmentRecords().slice(0, 1)),
      choice,
      preview?.reports ?? [],
      NOW,
    );

    expect(check).toEqual({
      ok: false,
      message: 'That record is no longer in your saved profile. Choose again.',
    });
  });

  it('fills nothing when the job was edited after the preview', () => {
    loadFixture('employment-application.html');
    const fields = scan();
    const choice = choiceFor(fields, 'j1-company', 'logistics');
    const preview = previewChoice(fields, jobs(), choice, NOW);
    const [current, earlier] = employmentRecords();
    if (!current || !earlier) throw new Error('No jobs');

    const check = confirmChoice(
      scan(),
      jobs([current, { ...earlier, title: 'Shift Lead' }]),
      choice,
      preview?.reports ?? [],
      NOW,
    );

    expect(check.ok).toBe(false);
  });

  it('fills nothing when the section changed after the preview', () => {
    loadFixture('employment-application.html');
    const fields = scan();
    const choice = choiceFor(fields, 'j1-company', 'logistics');
    const preview = previewChoice(fields, jobs(), choice, NOW);
    document
      .querySelector('[aria-labelledby="job-1"]')
      ?.insertAdjacentHTML(
        'beforeend',
        '<label>Job title <input id="j1-extra"></label>',
      );

    const check = confirmChoice(
      scan(),
      jobs(),
      choice,
      preview?.reports ?? [],
      NOW,
    );

    expect(check).toEqual({
      ok: false,
      message:
        'This section has changed since you chose. Nothing was filled; review it again.',
    });
  });

  it('writes nothing more when the same choice is confirmed twice', async () => {
    loadFixture('employment-application.html');
    const fields = scan();
    const choice = choiceFor(fields, 'j1-company', 'logistics');
    const preview = previewChoice(fields, jobs(), choice, NOW);
    const first = confirmChoice(
      scan(),
      jobs(),
      choice,
      preview?.reports ?? [],
      NOW,
    );
    if (!first.ok) throw new Error(first.message);
    await fillFields(first.plan);
    input('j1-title').value = 'Edited by me';

    const second = confirmChoice(
      scan(),
      jobs(),
      choice,
      preview?.reports ?? [],
      NOW,
    );

    expect(second.ok).toBe(false);
    expect(input('j1-title').value).toBe('Edited by me');
  });
});
