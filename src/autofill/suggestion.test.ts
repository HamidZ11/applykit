import { describe, expect, it } from 'vitest';
import {
  educationRecords,
  employmentRecords,
  fullProfile,
} from '@/test/autofill-fixtures';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import type { AutofillValues } from './fields';
import { autofillValuesFrom, phoneParts } from './profile-values';
import { planFill, type FieldReport } from './report';
import { scanFields } from './scan';

const NOW = new Date('2026-10-17T12:00:00Z');

function values(edit?: (values: AutofillValues) => void): AutofillValues {
  const profile = fullProfile();
  profile.education = educationRecords();
  const result = autofillValuesFrom(profile);
  edit?.(result);
  return result;
}

function report(id: string, v = values()): FieldReport {
  loadFixture('custom-controls.html');
  const found = planFill(scanFields(document), v, NOW).find(
    (r) => r.field.element.id === id,
  );
  if (!found) throw new Error(`No report for #${id}`);
  return found;
}

describe('guidance for custom dropdowns', () => {
  it('suggests the saved country and calling code', () => {
    expect(report('residence')).toMatchObject({
      status: 'unsupported',
      fillValue: null,
      suggestion: { kind: 'value', value: 'United Kingdom', note: null },
    });
    expect(report('calling-code').suggestion).toEqual({
      kind: 'value',
      value: '+44',
      note: null,
    });
  });

  it('suggests from the one record a university section asks about', () => {
    expect(report('qual-button').suggestion).toMatchObject({
      kind: 'value',
      value: 'BSc Computer Science',
      note: 'From your saved BSc Computer Science at University of Example.',
    });
    expect(report('grad-year').suggestion).toMatchObject({
      kind: 'value',
      value: '2027',
      note: expect.stringContaining('expected graduation') as string,
    });
  });

  it('says a choice is needed when several records could fit', () => {
    expect(report('edu-1-inst').suggestion).toEqual({
      kind: 'ambiguous',
      reason:
        'Several of your saved education records could fit. Check which one this asks about.',
    });
  });

  it('does not suggest a record already used by an earlier section', () => {
    const one = values((v) => {
      v.education = v.education.slice(0, 1);
    });

    // The university section above already takes the only degree.
    expect(report('nativeSelect', one).status).toBe('fill');
    expect(report('edu-2-inst', one).suggestion).toMatchObject({
      kind: 'missing',
      reason: expect.stringContaining('already fills an earlier') as string,
    });
  });

  it('says when the profile has nothing to suggest', () => {
    const none = values((v) => {
      v.country = null;
      v.text.phone = '07700 900123';
      v.phone = phoneParts('07700 900123', '');
    });

    expect(report('residence', none).suggestion).toEqual({
      kind: 'missing',
      reason: 'Your profile has no country.',
    });
    expect(report('calling-code', none).suggestion).toMatchObject({
      kind: 'missing',
      reason: expect.stringContaining('could not be split') as string,
    });
  });

  it('never offers guidance for sensitive or unrecognised questions', () => {
    // A monitoring question in a custom dropdown: guided without its value.
    expect(report('gender')).toMatchObject({
      status: 'unsupported',
      suggestion: null,
      target: 'diversityGender',
      fillValue: null,
    });
    expect(report('start-month').suggestion).toBeNull();
  });

  it('fills the native select whose id only looks sensitive', () => {
    expect(report('nativeSelect')).toMatchObject({
      status: 'fill',
      fillValue: '2',
      value: 'University of Example',
    });
  });

  it('suggests nothing without a confirmed profile', () => {
    loadFixture('custom-controls.html');
    const found = planFill(scanFields(document), null, NOW).find(
      (r) => r.field.element.id === 'residence',
    );

    expect(found?.suggestion).toBeNull();
  });
});

describe('guidance for employment fields ApplyKit cannot fill', () => {
  function jobs(records = employmentRecords()): AutofillValues {
    const profile = fullProfile();
    profile.employment = records;
    return autofillValuesFrom(profile);
  }

  /** A custom employment-type dropdown and a current-role box. */
  function guided(legend: string, v: AutofillValues) {
    loadHtml(`<form><fieldset><legend>${legend}</legend>
      <label>Employer <input id="employer"></label>
      <span id="type-label">Employment type</span>
      <div id="type" role="combobox" aria-labelledby="type-label" tabindex="0"></div>
      <span id="end-label">End date</span>
      <div id="end" role="combobox" aria-labelledby="end-label" tabindex="0"></div>
      <label><input id="current" type="checkbox"> I currently work here</label>
    </fieldset></form>`);
    const reports = planFill(scanFields(document), v, NOW);
    return (id: string) => reports.find((r) => r.field.element.id === id);
  }

  it('suggests the one job a section asks about', () => {
    const report = guided('Previous employment', jobs());

    expect(report('type')?.suggestion).toMatchObject({
      kind: 'value',
      value: 'Full-time',
    });
    expect(report('end')?.suggestion).toMatchObject({
      kind: 'value',
      value: 'January 2025',
    });
    expect(report('current')).toMatchObject({
      status: 'unsupported',
      reason:
        'ApplyKit never ticks boxes: many sites only notice a real click. Tick it yourself if it applies.',
      suggestion: { kind: 'value', value: 'Leave it unticked' },
    });
  });

  it('says a current role has no end date', () => {
    const report = guided('Current employment', jobs());

    expect(report('end')?.suggestion).toMatchObject({
      kind: 'value',
      value: 'No end date',
    });
    expect(report('current')?.suggestion).toMatchObject({
      kind: 'value',
      value: 'Tick it',
    });
  });

  it('never shows an arbitrary job when several fit', () => {
    const report = guided('Employment 1', jobs());

    for (const id of ['type', 'end', 'current']) {
      expect(report(id)?.suggestion, id).toEqual({
        kind: 'ambiguous',
        reason:
          'Several of your saved jobs could fit, so ApplyKit does not suggest one. Check which job this asks about.',
      });
    }
  });

  it('says what is missing from the saved job', () => {
    const [current] = employmentRecords();
    if (!current) throw new Error('No job');

    const report = guided(
      'Current employment',
      jobs([{ ...current, employmentType: '' }]),
    );

    expect(report('type')?.suggestion).toEqual({
      kind: 'missing',
      reason: 'Your saved job has no value for this.',
    });
  });

  it('gives no date for an expected end, as autofill does', () => {
    loadHtml(`<form><fieldset><legend>Previous employment</legend>
      <label>Employer <input id="employer"></label>
      <span id="end-label">Expected employment end date</span>
      <div id="end" role="combobox" aria-labelledby="end-label" tabindex="0"></div>
    </fieldset></form>`);

    const report = planFill(scanFields(document), jobs(), NOW).find(
      (r) => r.field.element.id === 'end',
    );

    expect(report?.suggestion).toEqual({
      kind: 'unsuitable',
      reason:
        'This asks when you expect to leave. Your profile saves only when a job ended.',
    });
  });

  it('never suggests from a job for a reference’s employer', () => {
    loadHtml(`<form><fieldset><legend>Reference</legend>
      <span id="ref-label">Referee's employer</span>
      <div id="ref" role="combobox" aria-labelledby="ref-label" tabindex="0"></div>
    </fieldset></form>`);

    const [report] = planFill(scanFields(document), jobs(), NOW);

    expect(report?.suggestion).toBeNull();
  });
});
