import { describe, expect, it } from 'vitest';
import type { EmploymentRecord } from '@/domain/user-profile';
import { employmentRecords, fullProfile } from '@/test/autofill-fixtures';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { autofillValuesFrom } from './profile-values';
import { planFill, type FieldReport } from './report';
import { scanFields } from './scan';

const NOW = new Date('2026-10-17T12:00:00Z');

/** A current part-time job and the full-time job before it. */
function plan(
  records: EmploymentRecord[] = employmentRecords(),
): FieldReport[] {
  const profile = fullProfile();
  profile.employment = records;
  return planFill(scanFields(document), autofillValuesFrom(profile), NOW);
}

function byId(reports: FieldReport[], id: string): FieldReport {
  const found = reports.find((r) => r.field.element.id === id);
  if (!found) throw new Error(`No field #${id}`);
  return found;
}

const [current, earlier] = employmentRecords() as [
  EmploymentRecord,
  EmploymentRecord,
];

/** A third, older job, for most-recent and repeated-section cases. */
const oldest: EmploymentRecord = {
  id: 'bakery',
  employer: 'Example Bakery',
  title: 'Sales Assistant',
  employmentType: '',
  startDate: '2022-06',
  endDate: '2023-08',
  current: false,
  description: '',
};

/** One job section with the given heading and fields. */
function section(heading: string, fields: string): string {
  return `<form><fieldset><legend>${heading}</legend>${fields}</fieldset></form>`;
}

const EMPLOYER = '<label>Employer <input id="employer"></label>';
const TITLE = '<label>Job title <input id="title"></label>';

describe('choosing a saved job', () => {
  it('uses the only saved job for a clear job section', () => {
    loadHtml(section('Employment history', EMPLOYER + TITLE));

    const reports = plan([earlier]);

    expect(byId(reports, 'employer')).toMatchObject({
      status: 'fill',
      fillValue: 'Example Logistics',
      note: null,
    });
    expect(byId(reports, 'title').fillValue).toBe('Warehouse Operative');
  });

  it('asks the user when several saved jobs fit', () => {
    loadHtml(section('Employment 1', EMPLOYER + TITLE));

    const reports = plan();

    for (const id of ['employer', 'title']) {
      expect(byId(reports, id)).toMatchObject({
        status: 'ambiguous',
        candidates: ['testing', 'logistics'],
        fillValue: null,
      });
    }
    expect(byId(reports, 'employer').reason).toContain(
      'Several employment records fit',
    );
  });

  it('uses the one current job for a current-employment section', () => {
    loadHtml(section('Current employment', EMPLOYER));

    expect(byId(plan(), 'employer')).toMatchObject({
      status: 'fill',
      fillValue: 'Example Testing Services',
      note: 'From your saved role as Test Centre Associate at Example Testing Services.',
    });
  });

  it('says so when no saved job is current', () => {
    loadHtml(section('Current employment', EMPLOYER));

    expect(byId(plan([earlier, oldest]), 'employer')).toMatchObject({
      status: 'no-value',
      reason: 'None of your saved jobs is marked as your current role.',
    });
  });

  it('uses the one earlier job for a previous-employer field', () => {
    loadHtml(
      '<form><label>Previous employer <input id="employer"></label></form>',
    );

    expect(byId(plan(), 'employer').fillValue).toBe('Example Logistics');
  });

  it('asks when several earlier jobs could be the previous one', () => {
    loadHtml(section('Previous employment', EMPLOYER));

    expect(byId(plan([current, earlier, oldest]), 'employer')).toMatchObject({
      status: 'ambiguous',
      candidates: ['logistics', 'bakery'],
    });
  });

  it('picks the most recent job only when the dates make it certain', () => {
    loadHtml(section('Most recent previous employment', EMPLOYER));
    expect(byId(plan([oldest, earlier, current]), 'employer').fillValue).toBe(
      'Example Logistics',
    );

    loadHtml(section('Most recent employment', EMPLOYER));
    expect(byId(plan([oldest, current]), 'employer').fillValue).toBe(
      'Example Testing Services',
    );
  });

  it('asks about the most recent job when dates are missing or overlap', () => {
    loadHtml(section('Most recent employment', EMPLOYER));

    // A job without an end date cannot be ordered.
    expect(
      byId(plan([oldest, { ...earlier, endDate: '' }]), 'employer').status,
    ).toBe('ambiguous');
    // A current job that started before another ended overlaps it.
    expect(
      byId(plan([earlier, { ...current, startDate: '2023-05' }]), 'employer')
        .status,
    ).toBe('ambiguous');
    // Two jobs that ended in the same month.
    expect(
      byId(plan([earlier, { ...oldest, endDate: '2025-01' }]), 'employer')
        .status,
    ).toBe('ambiguous');
  });

  it('never reads an order into numbered sections', () => {
    loadHtml(
      `<form>${['1', '2']
        .map(
          (n) =>
            `<fieldset><legend>Employment ${n}</legend><label>Employer <input id="e${n}"></label></fieldset>`,
        )
        .join('')}</form>`,
    );

    const reports = plan([oldest, earlier]);

    expect(byId(reports, 'e1').status).toBe('ambiguous');
    expect(byId(reports, 'e2').status).toBe('ambiguous');
  });

  it('fills a repeated section from one saved job only once', () => {
    loadHtml(
      `<form>${['1', '2']
        .map(
          (n) =>
            `<fieldset><legend>Employment ${n}</legend><label>Employer <input id="e${n}"></label></fieldset>`,
        )
        .join('')}</form>`,
    );

    const reports = plan([earlier]);

    expect(byId(reports, 'e1').fillValue).toBe('Example Logistics');
    expect(byId(reports, 'e2')).toMatchObject({
      status: 'no-value',
      fillValue: null,
      reason:
        'Your saved role as Warehouse Operative at Example Logistics already fills an earlier employment section of this form, so ApplyKit does not repeat it here.',
    });
  });

  it('uses the job a section names by its entered employer', () => {
    loadHtml(
      section(
        'Employment 1',
        '<label>Employer <input id="employer" value="example logistics"></label>' +
          TITLE,
      ),
    );

    const reports = plan();

    expect(byId(reports, 'employer').status).toBe('keep');
    expect(byId(reports, 'title').fillValue).toBe('Warehouse Operative');
  });

  it('uses the job a section names in its own heading, not the page’s', () => {
    loadHtml(section('Employment at Example Logistics', TITLE));
    expect(byId(plan(), 'title').fillValue).toBe('Warehouse Operative');

    // A page-wide region naming a saved employer names no section.
    loadHtml(
      `<section aria-label="Apply to Example Logistics"><form>${section(
        'Employment 1',
        TITLE,
      )}</form></section>`,
    );
    expect(byId(plan(), 'title').status).toBe('ambiguous');
  });

  it('asks when two saved jobs are the same', () => {
    loadHtml(section('Employment history', EMPLOYER));

    expect(
      byId(plan([earlier, { ...earlier, id: 'copy' }]), 'employer'),
    ).toMatchObject({ status: 'ambiguous', candidates: ['logistics', 'copy'] });
  });

  it('says when no jobs are saved', () => {
    loadHtml(section('Employment history', EMPLOYER));

    expect(byId(plan([]), 'employer')).toMatchObject({
      status: 'no-value',
      reason: 'Your profile has no jobs saved.',
    });
  });
});

describe('job values', () => {
  it('fills the employment fixture’s current and previous jobs', () => {
    loadFixture('employment-application.html');

    const reports = plan();
    const value = (id: string) => byId(reports, id).fillValue;

    expect(value('cur-employer')).toBe('Example Testing Services');
    expect(value('cur-title')).toBe('Test Centre Associate');
    expect(value('cur-type')).toBe('pt');
    expect(value('cur-start-month')).toBe('2');
    expect(value('cur-start-year')).toBe('2025');
    expect(value('cur-duties')).toBe(current.description);
    expect(value('prev-employer')).toBe('Example Logistics');
    expect(value('prev-title')).toBe('Warehouse Operative');
    expect(value('prev-start')).toBe('01/2024');
    expect(value('prev-end')).toBe('01/2025');
  });

  it('chooses only an equivalent employment-type option', () => {
    loadHtml(
      section(
        'Employment history',
        '<label>Employment type <select id="type"><option value="">Select…</option><option value="t">Temporary or seasonal</option><option value="c">Contractor</option></select></label>',
      ),
    );

    expect(
      byId(plan([{ ...earlier, employmentType: 'contract' }]), 'type')
        .fillValue,
    ).toBe('c');
    expect(
      byId(plan([{ ...earlier, employmentType: 'temporary' }]), 'type'),
    ).toMatchObject({
      status: 'no-option',
      reason: 'None of the options matches “Temporary”.',
    });
    expect(
      byId(plan([{ ...earlier, employmentType: '' }]), 'type'),
    ).toMatchObject({
      status: 'no-value',
      reason: 'Your saved job has no employment type.',
    });
  });

  describe('dates', () => {
    const dates = (start: string, end: string) =>
      section(
        'Employment history',
        `<label>${start}</label><label>${end}</label>`,
      );

    it('fills month and year text in the stated format', () => {
      loadHtml(
        dates(
          'Start date (MM/YYYY) <input id="s">',
          'End date <input id="e" placeholder="YYYY-MM">',
        ),
      );

      const reports = plan([earlier]);

      expect(byId(reports, 's').fillValue).toBe('01/2024');
      expect(byId(reports, 'e').fillValue).toBe('2025-01');
    });

    it('fills year-only fields and month inputs', () => {
      loadHtml(
        dates(
          'Start year <input id="s">',
          'End date <input id="e" type="month">',
        ),
      );

      const reports = plan([earlier]);

      expect(byId(reports, 's').fillValue).toBe('2024');
      expect(byId(reports, 'e').fillValue).toBe('2025-01');
    });

    it('fills separate month and year selects', () => {
      loadHtml(
        dates(
          'Start month <select id="m"><option value="">Month</option><option value="jan">Jan</option><option value="feb">Feb</option></select>',
          'Start year <select id="y"><option value="">Year</option><option>2025</option><option>2024</option></select>',
        ),
      );

      const reports = plan([earlier]);

      expect(byId(reports, 'm').fillValue).toBe('jan');
      expect(byId(reports, 'y').fillValue).toBe('2024');
    });

    it('never invents a day', () => {
      loadHtml(
        dates(
          'Start date <input id="s" type="date">',
          'End date (DD/MM/YYYY) <input id="e">',
        ),
      );

      const reports = plan([earlier]);

      for (const id of ['s', 'e']) {
        expect(byId(reports, id)).toMatchObject({
          status: 'unusable',
          fillValue: null,
          reason:
            'This asks for a full date, but your profile saves only the month and year. ApplyKit does not invent a day.',
        });
      }
    });

    it('leaves a date whose format the field does not state', () => {
      loadHtml(dates('Start date <input id="s">', 'End date <input id="e">'));

      expect(byId(plan([earlier]), 's').status).toBe('unusable');
    });

    it('never gives a current role an end date', () => {
      loadHtml(
        dates(
          'Start date <input id="s" type="month">',
          'End date <input id="e" type="month">',
        ),
      );

      const reports = plan([current]);

      expect(byId(reports, 's').fillValue).toBe('2025-02');
      expect(byId(reports, 'e')).toMatchObject({
        status: 'manual',
        fillValue: null,
      });
      expect(byId(reports, 'e').reason).toContain('current role');
    });

    it('trusts the current flag over an end date left in an older save', () => {
      // Stored profiles are read by shape (ADR 0014), so this can exist.
      loadHtml(
        dates(
          'Start date <input id="s" type="month">',
          'End date <input id="e" type="month">',
        ),
      );

      expect(
        byId(plan([{ ...current, endDate: '2025-06' }]), 'e'),
      ).toMatchObject({ status: 'manual', fillValue: null });
    });

    it('never gives a planned leaving date as the date the job ended', () => {
      loadHtml(
        dates(
          'Start date <input id="s" type="month">',
          'End date <input id="e" type="month">',
        ),
      );
      expect(
        byId(plan([{ ...earlier, endDate: '2027-03' }]), 'e'),
      ).toMatchObject({ status: 'unusable', fillValue: null });

      loadHtml(
        dates(
          'Start date <input id="s" type="month">',
          'End date (expected) <input id="e" type="month">',
        ),
      );
      expect(byId(plan([earlier]), 'e')).toMatchObject({
        status: 'manual',
        fillValue: null,
        reason:
          'This asks when you expect to leave. Your profile saves only when a job ended, so answer it yourself.',
      });
    });

    it('says when a saved date is missing or not a month', () => {
      loadHtml(
        dates(
          'Start date <input id="s" type="month">',
          'End date <input id="e" type="month">',
        ),
      );

      const reports = plan([{ ...earlier, startDate: '2024', endDate: '' }]);

      expect(byId(reports, 's')).toMatchObject({
        status: 'no-value',
        reason: 'Your saved job has no start date.',
      });
      expect(byId(reports, 'e')).toMatchObject({
        status: 'no-value',
        reason: 'Your saved job has no end date.',
      });
    });
  });

  describe('descriptions', () => {
    const duties = (attributes = '', value = '') =>
      section(
        'Employment history',
        `<label>Main duties <textarea id="d" ${attributes}>${value}</textarea></label>`,
      );

    it('fills the saved description of the job', () => {
      loadHtml(duties());

      expect(byId(plan([earlier]), 'd')).toMatchObject({
        status: 'fill',
        fillValue: earlier.description,
      });
    });

    it('says when the job has no saved description', () => {
      loadHtml(duties());

      expect(byId(plan([oldest]), 'd')).toMatchObject({
        status: 'no-value',
        reason: 'Your saved job has no description.',
      });
    });

    it('never shortens a description to fit', () => {
      loadHtml(duties('maxlength="40"'));

      expect(byId(plan([earlier]), 'd')).toMatchObject({
        status: 'manual',
        fillValue: null,
        reason: `Your saved description has ${String(earlier.description.length)} characters, but this field allows 40. ApplyKit does not shorten it: write a shorter version yourself.`,
      });
    });

    it('keeps text the user already wrote', () => {
      loadHtml(duties('', 'My own words'));

      expect(byId(plan([earlier]), 'd')).toMatchObject({
        status: 'keep',
        value: 'My own words',
      });
    });

    it('never writes into motivation or other open questions', () => {
      loadFixture('employment-application.html');

      const reports = plan();

      for (const id of ['motivation', 'gaps', 'prev-reason']) {
        expect(byId(reports, id).fillValue, id).toBeNull();
      }
      expect(byId(reports, 'prev-reason').status).toBe('manual');
    });
  });
});

describe('employment safety', () => {
  it('leaves other people, declarations and hidden fields alone', () => {
    loadFixture('employment-application.html');

    const reports = plan();
    const ids = reports.map((r) => r.field.element.id);

    for (const id of [
      'cur-contact',
      'cur-rep',
      'prev-manager',
      'ref-name',
      'ref-title',
      'ref-employer',
      'ref-email',
      'ec-name',
      'ec-employer',
      'ec-phone',
      'signature',
    ]) {
      expect(byId(reports, id).fillValue, id).toBeNull();
    }
    // Disabled and hidden controls are never even listed.
    expect(ids).not.toContain('cur-payroll');
    expect(ids).not.toContain('hp');
  });

  it('only guides the "I currently work here" box', () => {
    loadFixture('employment-application.html');

    expect(byId(plan(), 'cur-current')).toMatchObject({
      status: 'unsupported',
      target: 'currentlyEmployed',
      fillValue: null,
      suggestion: {
        kind: 'value',
        value: 'Tick it',
      },
    });
  });
});

describe('section wording found in review', () => {
  it.each([
    'Employment history for the last 10 years',
    'Employment in the past 5 years',
  ])('reads no order or status into “%s”', (legend) => {
    loadHtml(section(legend, EMPLOYER));

    expect(byId(plan(), 'employer').status).toBe('ambiguous');
  });

  it('ignores wording outside the section itself', () => {
    loadHtml(
      `<section aria-label="Present your current work history"><form>${section(
        'Employment 1',
        EMPLOYER,
      )}</form></section>`,
    );

    expect(byId(plan(), 'employer').status).toBe('ambiguous');
  });
});
