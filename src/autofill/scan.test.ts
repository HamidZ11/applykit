import { describe, expect, it } from 'vitest';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { scanFields } from './scan';

describe('scanFields', () => {
  it('lists every control an applicant completes on the job application', () => {
    const document = loadFixture('job-application.html');

    const rows = scanFields(document).map(
      ({ label, section, kind, required, support }) => [
        label,
        section,
        kind,
        required,
        support.status === 'fillable' ? support.field : support.status,
      ],
    );

    expect(rows).toEqual([
      ['First name', 'Personal information', 'text', true, 'firstName'],
      ['Last name', 'Personal information', 'text', true, 'lastName'],
      ['Preferred name', 'Personal information', 'text', false, 'unrecognised'],
      ['Email', 'Personal information', 'email', true, 'email'],
      ['Phone', 'Personal information', 'tel', true, 'unrecognised'],
      [
        'Current location',
        'Personal information',
        'text',
        true,
        'unrecognised',
      ],
      ['Résumé / CV', 'Experience', 'file', true, 'unsupported'],
      ['Portfolio URL', 'Experience', 'url', true, 'unsupported'],
      ['LinkedIn profile', 'Experience', 'url', false, 'unsupported'],
      ['Cover letter', 'Experience', 'textarea', false, 'unsupported'],
      [
        'Do you have the right to work in the UK?',
        'Application questions',
        'radio',
        true,
        'unsupported',
      ],
      ['Notice period', 'Application questions', 'select', true, 'unsupported'],
      [
        'Salary expectation (GBP)',
        'Application questions',
        'text',
        false,
        'unrecognised',
      ],
      [
        'How did you hear about this role?',
        'Application questions',
        'select',
        false,
        'unsupported',
      ],
      [
        'I have read the candidate privacy notice',
        'Privacy',
        'checkbox',
        true,
        'unsupported',
      ],
    ]);
  });

  it('agrees with the detector on which fields are fillable', () => {
    loadFixture('basic-application.html');

    const fillable = scanFields(document).filter(
      (field) => field.support.status === 'fillable',
    );

    expect(fillable.map((field) => field.element.id)).toEqual([
      'first-name',
      'last-name',
      'email',
    ]);
  });

  it('skips controls an applicant never completes', () => {
    loadHtml(`
      <input type="hidden" name="a">
      <input type="password" name="b">
      <input type="submit">
      <button>Go</button>
      <input name="c" disabled>
      <input name="d" readonly>
      <textarea name="e" readonly></textarea>
    `);

    expect(scanFields(document)).toEqual([]);
  });

  it('falls back to placeholder, then name, then a neutral label', () => {
    loadHtml(`
      <input placeholder="Your city">
      <input name="team_size">
      <input>
    `);

    expect(scanFields(document).map((field) => field.label)).toEqual([
      'Your city',
      'team_size',
      'Unlabelled field',
    ]);
  });

  it('never changes the page', () => {
    const document = loadFixture('job-application.html');
    const before = document.body.innerHTML;

    scanFields(document);

    expect(document.body.innerHTML).toBe(before);
  });
});
