import { describe, expect, it } from 'vitest';
import { SAMPLE_PROFILE } from '@/domain/profile';
import { loadFixture } from '@/test/load-fixture';
import { autofill } from './fill';
import {
  attentionQueue,
  planFill,
  reportFill,
  summarise,
  type FieldReport,
  type FieldStatus,
} from './report';
import { scanFields } from './scan';

function statuses(reports: FieldReport[]) {
  return Object.fromEntries(
    reports.map((report) => [report.field.label, report.status]),
  );
}

function input(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`No #${id}`);
  return element;
}

describe('planFill and reportFill', () => {
  it('plans exactly what autofill then does', () => {
    loadFixture('job-application.html');
    input('email').value = 'a.sample@example.org';
    const fields = scanFields(document);

    const plan = planFill(fields, SAMPLE_PROFILE);
    const report = reportFill(fields, autofill(document, SAMPLE_PROFILE));

    expect(statuses(plan)).toMatchObject({
      'First name': 'fill',
      'Last name': 'fill',
      Email: 'keep',
    });
    expect(statuses(report)).toMatchObject({
      'First name': 'filled',
      'Last name': 'filled',
      Email: 'kept',
    });
    const expected: Record<FieldStatus, FieldStatus> = {
      fill: 'filled',
      keep: 'kept',
      'no-value': 'no-value',
      unrecognised: 'unrecognised',
      unsupported: 'unsupported',
      filled: 'filled',
      kept: 'kept',
    };
    expect(report.map((r) => r.status)).toEqual(
      plan.map((r) => expected[r.status]),
    );
  });

  it('reports the values written and the values kept', () => {
    loadFixture('job-application.html');
    input('email').value = 'a.sample@example.org';
    const fields = scanFields(document);

    const report = reportFill(fields, autofill(document, SAMPLE_PROFILE));

    const byLabel = new Map(report.map((r) => [r.field.label, r.value]));
    expect(byLabel.get('First name')).toBe('Alex');
    expect(byLabel.get('Last name')).toBe('Sample');
    expect(byLabel.get('Email')).toBe('a.sample@example.org');
    expect(byLabel.get('Phone')).toBeNull();
  });

  it('marks recognised fields without a profile value as needing the user', () => {
    loadFixture('job-application.html');
    const fields = scanFields(document);
    const profile = { ...SAMPLE_PROFILE, lastName: '' };

    expect(statuses(planFill(fields, profile))['Last name']).toBe('no-value');
    expect(
      statuses(reportFill(fields, autofill(document, profile)))['Last name'],
    ).toBe('no-value');
  });

  it('leaves unrecognised and unsupported fields to the user in both phases', () => {
    loadFixture('job-application.html');
    const fields = scanFields(document);

    const plan = statuses(planFill(fields, SAMPLE_PROFILE));
    const report = statuses(
      reportFill(fields, autofill(document, SAMPLE_PROFILE)),
    );

    for (const statusMap of [plan, report]) {
      expect(statusMap.Phone).toBe('unrecognised');
      expect(statusMap['Résumé / CV']).toBe('unsupported');
      expect(statusMap['Notice period']).toBe('unsupported');
    }
  });
});

describe('summarise and attentionQueue', () => {
  it('counts the job application honestly', () => {
    loadFixture('job-application.html');
    input('email').value = 'a.sample@example.org';
    const fields = scanFields(document);

    expect(summarise(planFill(fields, SAMPLE_PROFILE))).toEqual({
      filled: 2,
      kept: 1,
      needsYou: 12,
      requiredNeedsYou: 7,
      total: 15,
    });
  });

  it('puts required fields first, then keeps page order', () => {
    loadFixture('job-application.html');
    const queue = attentionQueue(
      planFill(scanFields(document), SAMPLE_PROFILE),
    ).map((report) => report.field.label);

    expect(queue).toEqual([
      'Phone',
      'Current location',
      'Résumé / CV',
      'Portfolio URL',
      'Do you have the right to work in the UK?',
      'Notice period',
      'I have read the candidate privacy notice',
      'Preferred name',
      'LinkedIn profile',
      'Cover letter',
      'Salary expectation (GBP)',
      'How did you hear about this role?',
    ]);
  });
});
