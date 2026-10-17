import { describe, expect, it } from 'vitest';
import { loadHtml } from '@/test/load-fixture';
import {
  describeEvidence,
  detectControl,
  normalise,
  type DetectableControl,
  type Detection,
} from './detect';

/** Detects the first control in the markup. */
function detect(html: string): Detection {
  loadHtml(html);
  const control = document.querySelector<DetectableControl>(
    'input, select, textarea',
  );
  if (!control) throw new Error('No control');
  return detectControl(control);
}

function matched(html: string): string | null {
  const detection = detect(html);
  return detection.kind === 'match' ? detection.field : null;
}

describe('detectControl', () => {
  it.each([
    ['<label>First name <input></label>', 'firstName'],
    ['<label>Given name(s) <input></label>', 'firstName'],
    ['<label>Forename <input></label>', 'firstName'],
    ['<input name="fname">', 'firstName'],
    ['<label>Surname <input></label>', 'lastName'],
    ['<label>Family name <input></label>', 'lastName'],
    ['<input name="applicant[lastName]">', 'lastName'],
    ['<label>Full name <input></label>', 'fullName'],
    ['<label>Name <input></label>', 'fullName'],
    ['<label>First and last name <input></label>', 'fullName'],
    ['<label>Preferred name <input></label>', 'preferredName'],
    ['<label>Preferred first name <input></label>', 'preferredName'],
    ['<label>Known as <input></label>', 'preferredName'],
    ['<label>E-mail <input></label>', 'email'],
    ['<label>Mobile <input></label>', 'phone'],
    ['<label>Telephone number <input></label>', 'phone'],
    ['<label>Street address <input></label>', 'addressLine1'],
    ['<input name="addressLine1">', 'addressLine1'],
    ['<label>Apartment, suite, etc. <input></label>', 'addressLine2'],
    ['<input name="address_line_2">', 'addressLine2'],
    ['<label>Town / City <input></label>', 'city'],
    ['<label>County <input></label>', 'region'],
    ['<label>State / Province <input></label>', 'region'],
    ['<label>Postcode <input></label>', 'postcode'],
    ['<label>ZIP code <input></label>', 'postcode'],
    ['<label>Postal code <input></label>', 'postcode'],
    ['<label>Country <input></label>', 'country'],
    ['<label>LinkedIn URL <input></label>', 'linkedin'],
    ['<label>GitHub profile <input></label>', 'github'],
    ['<label>Portfolio <input></label>', 'portfolio'],
    ['<label>Personal website <input></label>', 'portfolio'],
    ['<label>Website <input type="url"></label>', 'portfolio'],
  ])('recognises %s', (html, field) => {
    expect(matched(html)).toBe(field);
  });

  it('prefers explicit autocomplete semantics, with the evidence', () => {
    const detection = detect('<input autocomplete="given-name" name="x1">');

    expect(detection).toEqual({
      kind: 'match',
      field: 'firstName',
      evidence: [{ signal: 'autocomplete', text: 'given-name' }],
    });
  });

  it.each([
    ['section-apply shipping postal-code', 'postcode'],
    ['address-level2', 'city'],
    ['address-level1', 'region'],
    ['country-name', 'country'],
    ['tel-national', 'phone'],
  ])('reads autocomplete="%s"', (autocomplete, field) => {
    expect(matched(`<input autocomplete="${autocomplete}">`)).toBe(field);
  });

  it('uses aria-label and aria-labelledby when there is no label element', () => {
    expect(matched('<input aria-label="Last name">')).toBe('lastName');
    expect(
      matched(
        '<span id="q">Postcode</span><input aria-labelledby="q" name="f7">',
      ),
    ).toBe('postcode');
  });

  it('collects every agreeing signal as evidence', () => {
    const detection = detect(
      '<label for="email">Email</label><input id="email" name="email" type="email">',
    );

    expect(detection.kind).toBe('match');
    if (detection.kind !== 'match') return;
    expect(detection.evidence.map((e) => e.signal)).toEqual([
      'type',
      'label',
      'name',
      'id',
    ]);
  });

  it('returns none for a control without any usable signal', () => {
    expect(detect('<input name="q17">')).toEqual({ kind: 'none' });
    expect(detect('<input>')).toEqual({ kind: 'none' });
  });

  it('reports a conflict when signals point at different fields', () => {
    const detection = detect(
      '<label>Email <input name="phone_number"></label>',
    );

    expect(detection).toMatchObject({
      kind: 'conflict',
      fields: ['email', 'phone'],
    });
  });

  it('treats "City, country" as a conflict rather than guessing', () => {
    expect(detect('<input placeholder="City, country">').kind).toBe('conflict');
  });

  it('does not treat long questions as address parts', () => {
    expect(
      matched(
        '<label>Which city would you prefer to be based in for this role? <input></label>',
      ),
    ).toBeNull();
  });

  it.each([
    '<label>Phone extension <input type="tel"></label>',
    '<label>Country code <input></label>',
    '<label>Dialling code <input name="phone_code"></label>',
    '<label>Phone type <select autocomplete="tel"></select></label>',
  ])('does not fill phone or country parts: %s', (html) => {
    expect(matched(html)).toBeNull();
  });

  it('still recognises a phone field that explains its format', () => {
    expect(
      matched(
        '<label>Phone number (including country code) <input type="tel"></label>',
      ),
    ).toBe('phone');
  });

  describe('details about someone else', () => {
    it.each([
      '<label>Company website <input type="url" name="website"></label>',
      '<label>Hiring manager email <input type="email"></label>',
      '<label>Employer address line 1 <input></label>',
      '<label>Emergency contact phone <input type="tel"></label>',
      '<input autocomplete="work email">',
      '<input autocomplete="section-x work tel">',
    ])('never matches %s', (html) => {
      expect(detect(html).kind).not.toBe('match');
    });

    it('recognises a reference by its section, with the evidence', () => {
      const detection = detect(`
        <fieldset><legend>Reference 1</legend>
          <label>Full name <input></label>
        </fieldset>`);

      expect(detection).toEqual({
        kind: 'other-person',
        evidence: [{ signal: 'label', text: 'Full name' }],
      });
    });

    it('recognises a group labelled for someone else', () => {
      const detection = detect(`
        <div role="group" aria-label="Referee">
          <label>Phone <input type="tel"></label>
        </div>`);

      expect(detection.kind).toBe('other-person');
    });
  });

  describe('questions ApplyKit never answers', () => {
    it.each([
      '<label>Do you have the right to work in the UK? <input></label>',
      '<label>Will you require visa sponsorship? <input></label>',
      '<label>Salary expectations <input></label>',
      '<label>Do you consider yourself to have a disability? <select></select></label>',
      '<label>Gender <select></select></label>',
      '<label>Ethnicity <input></label>',
      '<label>Date of birth <input></label>',
      '<label>Nationality <input></label>',
    ])('marks %s as sensitive', (html) => {
      expect(detect(html)).toEqual({ kind: 'manual', reason: 'sensitive' });
    });

    it('does not mistake a sensitive question for a profile field', () => {
      // "country" would otherwise match.
      expect(detect('<label>Country of citizenship <input></label>')).toEqual({
        kind: 'manual',
        reason: 'sensitive',
      });
    });

    it.each([
      '<label><input type="checkbox" name="consent"> I agree to the terms</label>',
      '<label><input type="checkbox"> Email me about new roles (newsletter)</label>',
      '<fieldset><legend>Declaration</legend><label>Full name <input></label></fieldset>',
    ])('marks %s as consent', (html) => {
      expect(detect(html)).toEqual({ kind: 'manual', reason: 'consent' });
    });

    it('marks CAPTCHA fields as verification', () => {
      expect(
        detect('<label>Type the characters <input name="captcha"></label>'),
      ).toEqual({ kind: 'manual', reason: 'verification' });
      expect(
        detect('<textarea class="g-recaptcha-response"></textarea>'),
      ).toEqual({ kind: 'manual', reason: 'verification' });
    });
  });
});

describe('normalise', () => {
  it('splits names, brackets and digits into words', () => {
    expect(normalise('applicant[addressLine1]')).toBe(
      'applicant address line 1',
    );
    expect(normalise('first_name')).toBe('first name');
  });
});

describe('describeEvidence', () => {
  it('shows attributes as written and text in quotes', () => {
    expect(
      describeEvidence({ signal: 'autocomplete', text: 'given-name' }),
    ).toBe('autocomplete="given-name"');
    expect(describeEvidence({ signal: 'label', text: 'First name' })).toBe(
      'label “First name”',
    );
  });
});
