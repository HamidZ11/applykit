import { describe, expect, it } from 'vitest';
import { fullProfile } from '@/test/autofill-fixtures';
import { validProfile } from '@/test/profile-fixtures';
import { autofillValuesFrom } from './profile-values';

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
    });
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
    ]);
  });
});
