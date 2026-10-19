import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApplicationAnswers } from '@/domain/application-answers';
import { savedAnswers } from '@/test/answer-fixtures';
import {
  educationRecords,
  employmentRecords,
  fullProfile,
} from '@/test/autofill-fixtures';
import { loadFixture, runFixtureScripts } from '@/test/load-fixture';
import { applyReviewed } from './batch';
import { afterPageScripts } from './fill';
import { autofillValuesFrom } from './profile-values';
import {
  isBatchEligible,
  planFill,
  workOf,
  type FieldReport,
  type WorkKind,
} from './report';
import { scanFields } from './scan';

/**
 * Applying reviewed answers together (ADR 0022) on
 * fixtures/batch-answers.html: only answers "Use this answer" could
 * write, each re-checked and verified in turn, stopping at the first that
 * cannot be applied as reviewed.
 */

const NOW = new Date('2026-10-19T12:00:00Z');
const ALL = [
  'gender',
  'ethnicity',
  'disability',
  'religion',
  'sexualOrientation',
] as const;

function values(answers: ApplicationAnswers = savedAnswers()) {
  const profile = fullProfile();
  profile.education = educationRecords();
  profile.employment = employmentRecords();
  return autofillValuesFrom(profile, answers, { reuse: true, saved: [...ALL] });
}

function plan(answers?: ApplicationAnswers): FieldReport[] {
  return planFill(scanFields(document), values(answers), NOW);
}

const ids = (reports: readonly FieldReport[]) =>
  reports.map((r) => r.field.element.id);

function control(id: string) {
  const found = document.getElementById(id);
  if (
    !(found instanceof HTMLInputElement) &&
    !(found instanceof HTMLSelectElement)
  ) {
    throw new Error(`No control #${id}`);
  }
  return found;
}

const checked = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)
    ?.value ?? null;

function apply(reviewed: readonly FieldReport[], answers?: ApplicationAnswers) {
  return applyReviewed(reviewed, {
    scan: () => scanFields(document),
    values: values(answers),
    now: NOW,
    settle: afterPageScripts,
  });
}

const REVIEWED = [
  'grad-before',
  'grad-radio-yes',
  'notice-weeks',
  'start-date',
  'relocate-uk',
  'relocate-abroad-yes',
  'arrangement',
];

beforeEach(() => {
  loadFixture('batch-answers.html');
});

describe('which answers can be applied together', () => {
  it('only suggested answers "Use this answer" could write', () => {
    expect(ids(plan().filter(isBatchEligible))).toEqual(REVIEWED);
  });

  it('never dropdowns, records, monitoring, drafts, declarations or answered fields', () => {
    const reports = plan();
    const excluded = reports.filter((r) => !isBatchEligible(r));

    for (const id of [
      'country',
      'office',
      'e1-inst',
      'j2-title',
      'gender',
      'motivation',
      'rtw',
      'sponsorship',
      'consent',
      'declaration',
      'salary-annual',
      'grad-in',
      'first',
    ]) {
      expect(ids(excluded), id).toContain(id);
    }
  });

  it('never a monitoring answer suggested in a custom dropdown', () => {
    loadFixture('custom-dropdowns.html');

    const gender = plan().find((r) => r.field.element.id === 'gender');

    expect(gender?.status).toBe('suggest');
    expect(gender && isBatchEligible(gender)).toBe(false);
  });
});

describe('the kinds of work in the summary', () => {
  it('gives every field exactly one kind, on every fixture', () => {
    const dir = resolve(process.cwd(), 'fixtures');
    for (const name of readdirSync(dir).filter((f) => f.endsWith('.html'))) {
      loadFixture(name);
      const reports = plan();
      const counts = new Map<WorkKind, number>();
      for (const report of reports) {
        const kind = workOf(report, true);
        counts.set(kind, (counts.get(kind) ?? 0) + 1);
      }

      expect(
        [...counts.values()].reduce((a, b) => a + b, 0),
        name,
      ).toBe(reports.length);
    }
  });

  it('separates review, one-at-a-time, drafting and manual work', () => {
    const kinds = Object.fromEntries(
      plan().map((r) => [r.field.element.id, workOf(r, true)]),
    );

    expect(kinds).toMatchObject({
      first: 'autofill',
      gender: 'autofill',
      'grad-before': 'review',
      arrangement: 'review',
      country: 'confirm',
      'e1-inst': 'confirm',
      motivation: 'draft',
      rtw: 'manual',
      consent: 'manual',
      office: 'manual',
      'grad-in': 'manual',
      'salary-annual': 'done',
    });
  });

  it('counts an open question the form forbids AI for as manual', () => {
    document
      .getElementById('motivation')
      ?.insertAdjacentHTML(
        'afterend',
        '<p>Please do not use AI tools to write your answers.</p>',
      );
    const motivation = plan().find((r) => r.field.element.id === 'motivation');
    if (!motivation) throw new Error('No motivation question');

    expect(workOf(motivation, true)).toBe('manual');
    expect(workOf(motivation, false)).toBe('draft');
  });
});

describe('applying reviewed answers', () => {
  it('applies each in order and verifies it, writing nothing else', async () => {
    const reviewed = plan().filter(isBatchEligible);

    const result = await apply(reviewed);

    expect(result.stopped).toBeNull();
    expect(ids(result.applied)).toEqual(REVIEWED);
    expect(result.applied.every((r) => r.status === 'filled')).toBe(true);
    expect(control('grad-before').value).toBe('y');
    expect(checked('gradRadio')).toBe('yes');
    expect(control('notice-weeks').value).toBe('4');
    expect(control('start-date').value).toBe('2027-01-04');
    expect(control('relocate-uk').value).toBe('y');
    expect(checked('relocateAbroad')).toBe('no');
    expect(control('arrangement').value).toBe('hybrid');
    // Nothing outside the review.
    expect(control('first').value).toBe('');
    expect(control('salary-annual').value).toBe('30000');
    expect(control('grad-in').value).toBe('');
    expect(control('rtw').value).toBe('');
    expect(control('gender').value).toBe('');
    expect(
      (document.getElementById('consent') as HTMLInputElement).checked,
    ).toBe(false);
    expect(document.getElementById('country')?.textContent).toContain(
      'Select a country',
    );
  });

  it('applies only the answers left ticked', async () => {
    const reviewed = plan()
      .filter(isBatchEligible)
      .filter((r) => r.field.element.id !== 'notice-weeks');

    const result = await apply(reviewed);

    expect(result.applied).toHaveLength(6);
    expect(control('notice-weeks').value).toBe('');
  });

  it('stops at a field the page replaced, keeping what was applied', async () => {
    runFixtureScripts(document);
    const reviewed = plan().filter(isBatchEligible);

    const result = await apply(reviewed);

    expect(ids(result.applied)).toEqual([
      'grad-before',
      'grad-radio-yes',
      'notice-weeks',
    ]);
    expect(result.stopped?.report.field.element.id).toBe('start-date');
    expect(result.stopped?.reason).toContain('no longer on the page');
    expect(ids(result.skipped)).toEqual([
      'relocate-uk',
      'relocate-abroad-yes',
      'arrangement',
    ]);
    expect(control('notice-weeks').value).toBe('4');
    expect(control('start-date').value).toBe('');
    expect(control('relocate-uk').value).toBe('');
  });

  it('never includes questions revealed meanwhile, and stops when options change', async () => {
    runFixtureScripts(document);
    // The second review, after the start date was rendered again.
    await apply(plan().filter(isBatchEligible));
    const again = plan().filter(isBatchEligible);
    expect(ids(again)).toEqual([
      'start-date',
      'relocate-uk',
      'relocate-abroad-yes',
      'arrangement',
    ]);

    const result = await apply(again);

    expect(ids(result.applied)).toEqual([
      'start-date',
      'relocate-uk',
      'relocate-abroad-yes',
    ]);
    expect(result.stopped?.report.field.element.id).toBe('arrangement');
    expect(result.stopped?.reason).toContain('has changed');
    expect(control('arrangement').value).toBe('');
    // Revealed by the relocation answer, and left to the user.
    expect(document.getElementById('regions-slot')?.hidden).toBe(false);
    expect(control('regions').value).toBe('');
  });

  it('stops when a saved answer changed after the review', async () => {
    const reviewed = plan().filter(isBatchEligible);

    const result = await apply(reviewed, {
      ...savedAnswers(),
      workArrangement: 'remote',
    });

    expect(result.stopped?.report.field.element.id).toBe('arrangement');
    expect(control('arrangement').value).toBe('');
    expect(result.applied).toHaveLength(6);
  });

  it('keeps what the user typed after the review, and stops there', async () => {
    const reviewed = plan().filter(isBatchEligible);
    control('notice-weeks').value = '6';

    const result = await apply(reviewed);

    expect(result.stopped?.report.field.element.id).toBe('notice-weeks');
    expect(result.stopped?.reason).toContain('You entered an answer here');
    expect(control('notice-weeks').value).toBe('6');
    expect(ids(result.applied)).toEqual(['grad-before', 'grad-radio-yes']);
  });

  it('stops at the first value the page does not keep, and reports it', async () => {
    const reviewed = plan().filter(isBatchEligible);
    control('grad-before').addEventListener('change', (event) => {
      (event.target as HTMLSelectElement).value = '';
    });

    const result = await apply(reviewed);

    expect(result.applied).toEqual([]);
    expect(result.stopped?.outcome?.status).toBe('rejected');
    expect(result.skipped).toHaveLength(6);
    expect(checked('gradRadio')).toBeNull();
  });

  it('never applies something the review could not include', async () => {
    const reports = plan();
    const country = reports.filter((r) => r.field.element.id === 'country');

    const result = await apply([
      ...country,
      ...reports.filter(isBatchEligible),
    ]);

    expect(result.applied).toEqual([]);
    expect(result.stopped?.reason).toContain('can no longer be applied');
    expect(control('grad-before').value).toBe('');
  });

  it('blocks a submission an answer sets off, and stops', async () => {
    runFixtureScripts(document);
    const form = document.getElementById('application') as HTMLFormElement;
    control('grad-before').addEventListener('change', () => {
      form.requestSubmit();
    });

    const result = await apply(plan().filter(isBatchEligible));

    expect(ids(result.applied)).toEqual(['grad-before']);
    expect(result.stopped?.reason).toContain('tried to submit');
    expect(document.getElementById('status')?.textContent).toContain(
      'submitted: 0',
    );
    // The guard is gone afterwards (positive control).
    form.requestSubmit();
    expect(document.getElementById('status')?.textContent).toContain(
      'submitted: 1',
    );
  });

  it('reports a submission the page tries even when it rejected the answer', async () => {
    runFixtureScripts(document);
    const form = document.getElementById('application') as HTMLFormElement;
    control('grad-before').addEventListener('change', (event) => {
      (event.target as HTMLSelectElement).value = '';
      form.requestSubmit();
    });

    const result = await apply(plan().filter(isBatchEligible));

    expect(result.applied).toEqual([]);
    expect(result.stopped?.reason).toContain('tried to submit');
    expect(result.stopped?.outcome?.status).toBe('rejected');
    expect(document.getElementById('status')?.textContent).toContain(
      'submitted: 0',
    );
  });

  it('stops before writing while the tab is hidden', async () => {
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);

    const result = await apply(plan().filter(isBatchEligible));
    hidden.mockRestore();

    expect(result.applied).toEqual([]);
    expect(result.stopped?.reason).toContain('left the tab');
    expect(control('grad-before').value).toBe('');
  });

  it('stops when the page changes address meanwhile', async () => {
    control('grad-before').addEventListener('change', () => {
      history.pushState(null, '', '#next-step');
    });

    const result = await apply(plan().filter(isBatchEligible));
    history.replaceState(null, '', location.pathname);

    expect(ids(result.applied)).toEqual(['grad-before']);
    expect(result.stopped?.report.field.element.id).toBe('grad-radio-yes');
    expect(result.stopped?.reason).toContain('changed address');
  });
});
