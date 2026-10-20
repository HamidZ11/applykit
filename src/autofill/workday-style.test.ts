import { beforeEach, describe, expect, it } from 'vitest';
import type { EducationRecord } from '@/domain/user-profile';
import { savedAnswers } from '@/test/answer-fixtures';
import { educationRecords, fullProfile } from '@/test/autofill-fixtures';
import { loadFixture, loadHtml, runFixtureScripts } from '@/test/load-fixture';
import { describeEvidence } from './detect';
import { afterPageScripts, fillFields } from './fill';
import { autofillValuesFrom } from './profile-values';
import { isBatchEligible, planFill, type FieldReport } from './report';
import { chooseSuggestedOption } from './resolve';
import { scanFields } from './scan';

/**
 * fixtures/workday-style.html: a fictional form shaped like the parts of a
 * Workday application observed in use. Not Workday's markup, which was not
 * available: what passes here is not yet known to work on Workday.
 */

const NOW = new Date('2026-10-20T12:00:00Z');

function values(education: EducationRecord[] = educationRecords()) {
  const profile = fullProfile();
  profile.education = education;
  return autofillValuesFrom(profile, savedAnswers(), {
    reuse: true,
    saved: ['gender'],
  });
}

function plan(v = values()): FieldReport[] {
  return planFill(scanFields(document), v, NOW);
}

function byId(reports: FieldReport[], id: string): FieldReport {
  const found = reports.find((r) => r.field.element.id === id);
  if (!found) throw new Error(`No field #${id}`);
  return found;
}

const input = (id: string) => document.getElementById(id) as HTMLInputElement;

beforeEach(() => {
  loadFixture('workday-style.html');
});

describe('questions named only "Select One Required"', () => {
  it('shows each real question, once, apart from its neighbours', () => {
    const labels = Object.fromEntries(
      plan().map((r) => [r.field.element.id, r.field.label]),
    );

    expect(labels).toMatchObject({
      'q-authorised':
        'Are you authorised to work in the country where this job is available?',
      'q-sponsorship':
        'Will you need sponsorship for an employment visa or renewal of an existing visa?',
      'q-related': 'Are you related to a current employee?',
      'q-start':
        'When will you be available to start a full-time role after your studies?',
      'q-period':
        'Are you available to work during the time period stated in the job description?',
      language: 'Language',
      proficiency: 'Overall proficiency',
      degree: 'Degree',
      // Too long to be one question: the control's own name stays.
      'q-long': 'Select One Required',
    });
  });

  it('keeps work authorisation and visas for the user, saying why', () => {
    const reports = plan();

    for (const id of ['q-authorised', 'q-sponsorship']) {
      const report = byId(reports, id);
      expect(report.status, id).toBe('manual');
      expect(report.reason, id).toContain('Work authorisation');
      expect(isBatchEligible(report), id).toBe(false);
      expect(report.suggestion, id).toBeNull();
    }
  });

  it('answers none of the application questions', () => {
    const reports = plan();

    for (const id of [
      'q-authorised',
      'q-sponsorship',
      'q-related',
      'q-start',
      'q-period',
      'q-long',
      'language',
      'proficiency',
    ]) {
      expect(['manual', 'unsupported'], id).toContain(byId(reports, id).status);
    }
  });
});

describe('education years', () => {
  it('fills From and To with the one saved degree’s years', async () => {
    const reports = plan();

    expect(byId(reports, 'edu-from')).toMatchObject({
      status: 'fill',
      value: '2024',
    });
    expect(byId(reports, 'edu-to')).toMatchObject({
      status: 'fill',
      value: '2027',
      note: expect.stringContaining('expected graduation') as string,
    });

    await fillFields(reports);
    expect(input('edu-from').value).toBe('2024');
    expect(input('edu-to').value).toBe('2027');
  });

  it('keeps a year already entered', () => {
    input('edu-from').value = '2023';

    expect(byId(plan(), 'edu-from').status).toBe('keep');
  });

  it('fills nothing the saved record does not have', () => {
    const [degree, ...rest] = educationRecords();
    if (!degree) throw new Error('No degree');

    const reports = plan(values([{ ...degree, startDate: '' }, ...rest]));

    expect(byId(reports, 'edu-from').status).toBe('no-value');
    expect(byId(reports, 'edu-to').status).toBe('fill');
  });

  it('never mixes records: several fitting degrees leave both years', () => {
    const [degree] = educationRecords();
    if (!degree) throw new Error('No degree');
    const second = {
      ...degree,
      id: 'masters',
      qualification: 'MSc Data Science',
      institution: 'Example Northfield University',
      startDate: '2027-09',
      endDate: '2028-09',
    };

    const reports = plan(values([degree, second]));

    expect(byId(reports, 'edu-from').status).toBe('ambiguous');
    expect(byId(reports, 'edu-to').status).toBe('ambiguous');
  });

  it('leaves a year field too short for a four-digit year', () => {
    input('edu-from').maxLength = 2;

    expect(byId(plan(), 'edu-from').status).toBe('manual');
  });

  it('never takes a bare "Year" for a date when the container holds two', () => {
    loadHtml(
      '<form><fieldset><legend>Education</legend><input id="y" aria-label="Year" placeholder="YYYY" /><input id="z" aria-label="Year" placeholder="YYYY" /></fieldset></form>',
    );

    const reports = plan();
    expect(byId(reports, 'y').status).not.toBe('fill');
    expect(byId(reports, 'z').status).not.toBe('fill');
  });
});

describe('dropdowns', () => {
  it('chooses the saved degree level in the Degree dropdown, on request', async () => {
    runFixtureScripts(document);
    const fields = scanFields(document);
    const reports = planFill(fields, values(), NOW);
    expect(byId(reports, 'degree')).toMatchObject({
      status: 'suggest',
      target: 'qualification',
    });

    const result = await chooseSuggestedOption(
      fields,
      values(),
      byId(reports, 'degree'),
      () => Promise.resolve(null),
      { now: NOW, timing: { step: afterPageScripts } },
    );

    expect(result).toMatchObject({
      ok: true,
      report: { status: 'filled', value: "Bachelor's Degree" },
    });
    expect(document.getElementById('degree')?.textContent.trim()).toBe(
      "Bachelor's Degree",
    );
    expect(document.getElementById('status')?.textContent).toContain(
      'submitted: 0',
    );
  });

  it('says in diagnostics why a recognised dropdown is only guided', () => {
    loadHtml(
      '<form><button id="d" type="button" aria-haspopup="listbox" aria-label="Degree Select One Required">Select One</button></form>',
    );

    const report = byId(plan(), 'd');

    expect(report.status).toBe('unsupported');
    expect(report.evidence.map(describeEvidence)).toContain(
      'dropdown not chosen in: aria-expanded is missing or not "false"',
    );
  });

  it('never suggests a monitoring answer’s value, and needs reuse on', () => {
    expect(byId(plan(), 'gender')).toMatchObject({
      status: 'suggest',
      value: null,
    });

    const off = values();
    off.diversity = { reuse: false, saved: [] };
    expect(byId(plan(off), 'gender').status).toBe('manual');
  });
});
