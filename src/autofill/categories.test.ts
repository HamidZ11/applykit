import { describe, expect, it } from 'vitest';
import { loadFixture, loadHtml } from '@/test/load-fixture';
import { categoryOf } from './categories';
import { nameOf } from './detect';
import { scanFields } from './scan';

function categories(): Record<string, string> {
  return Object.fromEntries(
    scanFields(document).map((field) => [
      field.element.id || nameOf(field.element),
      categoryOf(field),
    ]),
  );
}

describe('categoryOf', () => {
  it('groups a heading-based internship form by topic', () => {
    loadFixture('education-application.html');

    expect(categories()).toEqual({
      first: 'personal',
      last: 'personal',
      preferred: 'personal',
      email: 'contact',
      'calling-code': 'contact',
      phone: 'contact',
      country: 'address',
      university: 'education',
      degree: 'education',
      subject: 'education',
      'edu-start': 'education',
      graduation: 'education',
      classification: 'education',
      school: 'education',
      'school-results': 'education',
      'school-end': 'education',
      employer: 'employment',
      'job-start': 'employment',
      'ref-name': 'references',
      'ref-email': 'references',
      gender: 'sensitive',
      'school-type': 'sensitive',
      motivation: 'questions',
      privacy: 'questions',
    });
  });

  it('groups a form with fieldsets the same way', () => {
    loadFixture('job-application.html');

    expect(categories()).toMatchObject({
      given: 'personal',
      email: 'contact',
      location: 'address',
      portfolio: 'contact',
      cover: 'questions',
      right_to_work: 'questions',
      notice: 'questions',
      salary: 'questions',
      source: 'questions',
      privacy_consent: 'questions',
    });
  });

  it('keeps employer and reference details out of personal information', () => {
    loadFixture('full-application.html');

    expect(categories()).toMatchObject({
      'employer-address': 'employment',
      'manager-email': 'employment',
      'ref-name': 'references',
      'ec-phone': 'references',
      dob: 'sensitive',
    });
  });

  it('treats social-mobility questions as sensitive disclosures', () => {
    loadHtml(
      '<label>Were you eligible for free school meals? <select><option>Yes</option></select></label>',
    );

    expect(Object.values(categories())).toEqual(['sensitive']);
  });

  it('leaves fields with nothing to go on in Other fields', () => {
    loadHtml('<label>Reference code <input></label><input name="q17">');

    // A reference code is about the job, not a referee.
    expect(Object.values(categories())).toEqual(['other', 'other']);
  });
});
