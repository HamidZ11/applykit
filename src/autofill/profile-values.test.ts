import { describe, expect, it } from 'vitest';
import {
  educationRecords,
  employmentRecords,
  fullProfile,
} from '@/test/autofill-fixtures';
import { validProfile } from '@/test/profile-fixtures';
import { autofillValuesFrom, phoneParts } from './profile-values';

describe('autofillValuesFrom', () => {
  it('maps the confirmed profile to the values autofill may use', () => {
    expect(autofillValuesFrom(fullProfile())).toEqual({
      text: {
        fullName: 'Alex Sample',
        firstName: 'Alex',
        lastName: 'Sample',
        preferredName: 'Al',
        email: 'alex.sample@example.com',
        phone: '+44 20 7946 0000',
        addressLine1: '1 Example Street',
        addressLine2: 'Flat 2',
        city: 'London',
        region: 'Greater London',
        postcode: 'N1 9GU',
        linkedin: 'https://www.linkedin.com/in/alex-sample',
        github: 'https://github.com/alex-sample',
        portfolio: 'https://alex-sample.example.com',
      },
      preferredNameIsFirstName: false,
      country: {
        code: 'GB',
        alpha3: 'GBR',
        name: 'United Kingdom',
        aliases: ['UK', 'Great Britain'],
      },
      phone: {
        callingCode: '44',
        nationalNumber: '2079460000',
        regionNames: ['GB', 'GBR', 'United Kingdom', 'UK', 'Great Britain'],
      },
      education: [],
      employment: [],
      answers: {
        noticePeriod: null,
        relocation: null,
        workArrangement: null,
        startDate: null,
        salary: null,
      },
      diversity: { reuse: false, saved: [] },
    });
  });

  it('passes on saved jobs with only what autofill uses', () => {
    const profile = fullProfile();
    profile.employment = employmentRecords();

    expect(autofillValuesFrom(profile).employment).toEqual([
      {
        id: 'testing',
        employer: 'Example Testing Services',
        title: 'Test Centre Associate',
        employmentType: 'part-time',
        startDate: '2025-02',
        endDate: '',
        current: true,
        description:
          'Welcomed candidates, checked identification and invigilated computer-based exams.',
      },
      expect.objectContaining({ id: 'logistics', current: false }),
    ]);
  });

  it('passes on education records with their level', () => {
    const profile = fullProfile();
    profile.education = educationRecords();

    expect(autofillValuesFrom(profile).education).toEqual([
      expect.objectContaining({
        institution: 'University of Example',
        qualification: 'BSc Computer Science',
        level: 'higher',
      }),
      expect.objectContaining({
        institution: 'Example Sixth Form College',
        qualification: 'A levels',
        level: 'school',
      }),
    ]);
  });

  it('leaves values the profile does not have empty, never invented', () => {
    const values = autofillValuesFrom(validProfile());

    expect(values.text.preferredName).toBe('');
    expect(values.text.github).toBe('');
    expect(values.text.region).toBe('');
  });

  describe('preferred name', () => {
    it('uses a saved preferred name', () => {
      const profile = fullProfile();
      profile.personal.useFirstNameAsPreferred = true;

      expect(autofillValuesFrom(profile)).toMatchObject({
        text: { preferredName: 'Al' },
        preferredNameIsFirstName: false,
      });
    });

    it('never assumes the first name when the user has not chosen it', () => {
      const profile = validProfile();

      expect(autofillValuesFrom(profile)).toMatchObject({
        text: { preferredName: '' },
        preferredNameIsFirstName: false,
      });
    });

    it('uses the first name when the user chose that', () => {
      const profile = validProfile();
      profile.personal.useFirstNameAsPreferred = true;

      expect(autofillValuesFrom(profile)).toMatchObject({
        text: { preferredName: 'Alex' },
        preferredNameIsFirstName: true,
      });
    });
  });

  it('has no country when the saved country is not a known code', () => {
    const profile = validProfile();
    profile.personal.address.country = '';

    expect(autofillValuesFrom(profile).country).toBeNull();
  });

  it('builds the full name only from the saved name parts', () => {
    const profile = validProfile();
    profile.personal.lastName = '  ';

    expect(autofillValuesFrom(profile).text.fullName).toBe('Alex');
  });

  it('carries nothing beyond the fields autofill supports', () => {
    const profile = fullProfile();
    const values = autofillValuesFrom(profile);

    expect(JSON.stringify(values)).not.toContain('metadata');
    expect(Object.keys(values)).toEqual([
      'text',
      'preferredNameIsFirstName',
      'country',
      'phone',
      'education',
      'employment',
      'answers',
      'diversity',
    ]);
  });
});

describe('phoneParts', () => {
  it('reads the calling code from an international number', () => {
    expect(phoneParts('+44 7700 900123', 'GB')).toEqual({
      callingCode: '44',
      nationalNumber: '7700900123',
      regionNames: ['GB', 'GBR', 'United Kingdom', 'UK', 'Great Britain'],
    });
  });

  it('reads a national number using the saved country', () => {
    expect(phoneParts('07700 900123', 'GB')).toMatchObject({
      callingCode: '44',
      // The trunk "0" is not part of the number after the code.
      nationalNumber: '7700900123',
    });
  });

  it('accepts the international prefix written as 00', () => {
    expect(phoneParts('0044 7700 900123', 'GB')).toMatchObject({
      callingCode: '44',
      nationalNumber: '7700900123',
    });
  });

  it('follows the number, not the saved country, when they disagree', () => {
    expect(phoneParts('+1 202 555 0123', 'GB')).toEqual({
      callingCode: '1',
      nationalNumber: '2025550123',
      regionNames: expect.arrayContaining(['US', 'United States']) as string[],
    });
  });

  it('names the territory the number belongs to', () => {
    expect(phoneParts('+44 7797 712345', 'GB')?.regionNames).toContain(
      'Jersey',
    );
  });

  it('skips a national number when there is no country to read it with', () => {
    expect(phoneParts('07700 900123', '')).toBeNull();
  });

  it.each(['12345', '+44 12', '+999 1234567', ''])(
    'skips the unusable number %j',
    (phone) => {
      expect(phoneParts(phone, 'GB')).toBeNull();
    },
  );
});
