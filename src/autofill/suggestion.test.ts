import { describe, expect, it } from 'vitest';
import { educationRecords, fullProfile } from '@/test/autofill-fixtures';
import { loadFixture } from '@/test/load-fixture';
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
    expect(report('gender')).toMatchObject({
      status: 'manual',
      suggestion: null,
      target: null,
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
