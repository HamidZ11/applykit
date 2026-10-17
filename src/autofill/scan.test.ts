import { describe, expect, it } from 'vitest';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { scanFields, type ScannedField } from './scan';

/** What the engine decided, in one readable value per field. */
function outcome({ support }: ScannedField): string {
  switch (support.status) {
    case 'match':
      return support.field;
    case 'manual':
      return `manual:${support.reason}`;
    case 'conflict':
      return `conflict:${support.fields.join('|')}`;
    default:
      return support.status;
  }
}

describe('scanFields', () => {
  it('lists every control an applicant completes on the job application', () => {
    const document = loadFixture('job-application.html');

    const rows = scanFields(document).map((field) => [
      field.label,
      field.section,
      field.kind,
      field.required,
      outcome(field),
    ]);

    expect(rows).toEqual([
      ['First name', 'Personal information', 'text', true, 'firstName'],
      ['Last name', 'Personal information', 'text', true, 'lastName'],
      [
        'Preferred name',
        'Personal information',
        'text',
        false,
        'preferredName',
      ],
      ['Email', 'Personal information', 'email', true, 'email'],
      ['Phone', 'Personal information', 'tel', true, 'phone'],
      [
        'Current location',
        'Personal information',
        'text',
        true,
        'unrecognised',
      ],
      ['Résumé / CV', 'Experience', 'file', true, 'unsupported'],
      ['Portfolio URL', 'Experience', 'url', true, 'portfolio'],
      ['LinkedIn profile', 'Experience', 'url', false, 'linkedin'],
      ['Cover letter', 'Experience', 'textarea', false, 'unsupported'],
      [
        'Do you have the right to work in the UK?',
        'Application questions',
        'radio',
        true,
        'manual:sensitive',
      ],
      ['Notice period', 'Application questions', 'select', true, 'unsupported'],
      [
        'Salary expectation (GBP)',
        'Application questions',
        'text',
        false,
        'manual:sensitive',
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
        'manual:consent',
      ],
    ]);
  });

  it('separates the applicant’s details from everything else on a full form', () => {
    loadFixture('full-application.html');

    const byId = Object.fromEntries(
      scanFields(document).map((field) => [
        field.element.id || field.element.name,
        outcome(field),
      ]),
    );

    expect(byId).toEqual({
      'full-name': 'fullName',
      preferred: 'preferredName',
      email: 'email',
      'email-confirm': 'email',
      phone: 'phone',
      address1: 'addressLine1',
      address2: 'addressLine2',
      city: 'city',
      county: 'region',
      postcode: 'postcode',
      country: 'country',
      linkedin: 'linkedin',
      github: 'github',
      website: 'portfolio',
      'company-site': 'unrecognised',
      'employer-address': 'other-person',
      'manager-email': 'other-person',
      'ref-name': 'other-person',
      'ref-phone': 'other-person',
      'ec-name': 'other-person',
      'ec-phone': 'other-person',
      salary: 'manual:sensitive',
      dob: 'manual:sensitive',
      sponsorship: 'manual:sensitive',
      motivation: 'unsupported',
      captcha: 'manual:verification',
      privacy_consent: 'manual:consent',
    });
  });

  it('ignores hidden honeypots, disabled fields and other forms', () => {
    loadFixture('full-application.html');

    const ids = scanFields(document).map((field) => field.element.id);

    expect(ids).not.toContain('trap');
    expect(ids).not.toContain('requisition');
    expect(ids).not.toContain('news-email');
  });

  it('only considers the form with the most recognised fields', () => {
    loadHtml(`
      <form id="search"><input name="email" type="email" aria-label="Email"></form>
      <form id="apply">
        <label>First name <input></label>
        <label>Last name <input></label>
      </form>
    `);

    expect(scanFields(document).map((field) => field.element.form?.id)).toEqual(
      ['apply', 'apply'],
    );
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

  it('skips controls hidden from the user', () => {
    loadHtml(`
      <div hidden><label>Email <input type="email"></label></div>
      <div aria-hidden="true"><label>Phone <input type="tel"></label></div>
      <div inert><label>City <input></label></div>
      <label>Postcode <input id="shown"></label>
      <label>Country <input id="styled-away"></label>
    `);

    const fields = scanFields(document, {
      isVisible: (element) =>
        element.id !== 'styled-away' &&
        !element.closest('[hidden], [aria-hidden="true"], [inert]'),
    });

    expect(fields.map((field) => field.element.id)).toEqual(['shown']);
  });

  it('only fills selects that ask for the country', () => {
    loadHtml(`
      <label>Country <select><option value="GB">United Kingdom</option></select></label>
      <label>Title <select><option>Mx</option></select></label>
      <label>City <select><option>London</option></select></label>
    `);

    expect(scanFields(document).map(outcome)).toEqual([
      'country',
      'unsupported',
      'unsupported',
    ]);
  });

  it('reports a radio group once, as one question', () => {
    loadHtml(`
      <fieldset><legend>Notice period</legend>
        <label><input type="radio" name="notice" value="0"> None</label>
        <label><input type="radio" name="notice" value="1"> One month</label>
      </fieldset>
    `);

    const fields = scanFields(document);

    expect(fields).toHaveLength(1);
    expect(fields[0]?.label).toBe('Notice period');
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
    const document = loadFixture('full-application.html');
    const before = document.body.innerHTML;

    scanFields(document);

    expect(document.body.innerHTML).toBe(before);
  });
});

describe('forms that do not mark sections with fieldsets', () => {
  it('does not fill a reference section introduced by a heading', () => {
    loadHtml(`<form>
      <h2>Your details</h2>
      <label>Full name <input id="me-name"></label>
      <label>Email <input id="me-email" type="email"></label>
      <h2>Reference 1</h2>
      <label>Full name <input id="ref-name"></label>
      <label>Email <input id="ref-email" type="email"></label>
    </form>`);

    const byId = Object.fromEntries(
      scanFields(document).map((f) => [f.element.id, outcome(f)]),
    );

    expect(byId).toMatchObject({
      'me-name': 'fullName',
      'me-email': 'email',
    });
    expect(byId['ref-name']).not.toBe('fullName');
    expect(byId['ref-email']).not.toBe('email');
  });

  it('reads sections and groups labelled by another element', () => {
    loadHtml(`<form>
      <label>Phone <input id="me" type="tel"></label>
      <section aria-labelledby="ec"><h3 id="ec">Emergency contact</h3>
        <div><label>Mobile <input id="ec-phone" type="tel"></label></div>
      </section>
      <div role="group" aria-labelledby="r2"><span id="r2">Referee 2</span>
        <label>Telephone <input id="ref-phone" type="tel"></label>
      </div>
    </form>`);

    const byId = Object.fromEntries(
      scanFields(document).map((f) => [f.element.id, outcome(f)]),
    );

    expect(byId).toEqual({
      me: 'phone',
      'ec-phone': 'other-person',
      'ref-phone': 'other-person',
    });
  });

  it('fills only the first of several fields asking for the same detail', () => {
    loadHtml(`<form>
      <label>Email <input id="e1" type="email"></label>
      <label>Email <input id="e2" type="email"></label>
      <label>Confirm email <input id="e3" type="email"></label>
    </form>`);

    expect(scanFields(document).map(outcome)).toEqual([
      'email',
      'duplicate',
      'email',
    ]);
  });

  it('considers an application built without a form element', () => {
    loadHtml(`
      <div id="app">
        <label>First name <input id="first"></label>
        <label>Last name <input id="last"></label>
        <label>Email <input id="email" type="email"></label>
      </div>
      <form id="newsletter"><label>Email <input id="news" type="email"></label></form>
    `);

    expect(scanFields(document).map((f) => f.element.id)).toEqual([
      'first',
      'last',
      'email',
    ]);
  });
});
