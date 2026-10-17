import { describe, expect, it } from 'vitest';
import {
  normaliseDraft,
  parseStoredProfile,
  savedProfileIssues,
  validateDraft,
  validateSection,
} from './profile-schema';
import { validDraft } from '@/test/profile-fixtures';
import {
  emptyDraft,
  newEducationRecord,
  newEmploymentRecord,
  newOtherLink,
  profileFromDraft,
} from './user-profile';

describe('personal details', () => {
  it('accepts a complete draft with optional fields left empty', () => {
    expect(validateSection('personal', validDraft())).toEqual({});
  });

  it('requires every required field and nothing optional', () => {
    const errors = validateSection('personal', emptyDraft());

    expect(Object.keys(errors).sort()).toEqual([
      'personal.address.city',
      'personal.address.country',
      'personal.address.line1',
      'personal.address.postcode',
      'personal.email',
      'personal.firstName',
      'personal.lastName',
      'personal.phone',
    ]);
    expect(errors['personal.firstName']).toBe('Enter your first name');
  });

  it('treats whitespace-only values as missing', () => {
    const draft = validDraft();
    draft.personal.firstName = '   ';

    expect(validateSection('personal', draft)['personal.firstName']).toBe(
      'Enter your first name',
    );
  });

  it.each([
    ['not-an-email', 'personal.email'],
    ['alex@', 'personal.email'],
  ])('rejects the email %j', (email, key) => {
    const draft = validDraft();
    draft.personal.email = email;

    expect(validateSection('personal', draft)[key]).toMatch(/email address/);
  });

  it.each(['123', 'call me', '+44 (0)20 7946 0000 ext 99999999'])(
    'rejects the phone number %j',
    (phone) => {
      const draft = validDraft();
      draft.personal.phone = phone;

      expect(validateSection('personal', draft)['personal.phone']).toBeTruthy();
    },
  );

  it.each(['+1 (555) 010-0199', '020 7946 0000', '07700900123'])(
    'accepts the phone number %j',
    (phone) => {
      const draft = validDraft();
      draft.personal.phone = phone;

      expect(validateSection('personal', draft)).toEqual({});
    },
  );

  it('rejects an implausible postcode', () => {
    const draft = validDraft();
    draft.personal.address.postcode = '!!';

    expect(
      validateSection('personal', draft)['personal.address.postcode'],
    ).toBe('Enter a valid postcode');
  });
});

describe('education', () => {
  it('accepts no records at all', () => {
    expect(validateSection('education', validDraft())).toEqual({});
  });

  it('reports errors by record id, not position', () => {
    const draft = validDraft();
    const record = newEducationRecord();
    draft.education.push(record);

    const errors = validateSection('education', draft);

    expect(errors[`education.${record.id}.institution`]).toBe(
      'Enter the institution',
    );
    expect(errors[`education.${record.id}.grade`]).toBeUndefined();
  });

  it('rejects an end date before the start date', () => {
    const draft = validDraft();
    draft.education.push({
      ...newEducationRecord(),
      institution: 'Example University',
      qualification: 'BA',
      fieldOfStudy: 'History',
      startDate: '2022-09',
      endDate: '2021-06',
    });
    const id = draft.education[0]?.id ?? '';

    expect(validateSection('education', draft)).toEqual({
      [`education.${id}.endDate`]: 'The end date must be after the start date',
    });
  });
});

describe('employment', () => {
  function role(overrides: Partial<ReturnType<typeof newEmploymentRecord>>) {
    return {
      ...newEmploymentRecord(),
      employer: 'Example Ltd',
      title: 'Designer',
      startDate: '2020-01',
      ...overrides,
    };
  }

  it('needs an end date unless the role is current', () => {
    const past = role({ endDate: '' });
    const current = role({ current: true });
    const draft = validDraft();
    draft.employment.push(past, current);

    expect(validateSection('employment', draft)).toEqual({
      [`employment.${past.id}.endDate`]:
        'Enter when you left, or mark this as your current role',
    });
  });

  it('ignores a leftover end date on a current role when normalising', () => {
    const draft = validDraft();
    draft.employment.push(role({ current: true, endDate: '2021-01' }));

    const result = validateDraft(draft);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft.employment[0]?.endDate).toBe('');
  });

  it('limits the description length', () => {
    const draft = validDraft();
    const long = role({ endDate: '2021-01', description: 'x'.repeat(2001) });
    draft.employment.push(long);

    expect(
      validateSection('employment', draft)[`employment.${long.id}.description`],
    ).toMatch(/2,000/);
  });
});

describe('links', () => {
  it('accepts all links empty', () => {
    expect(validateSection('links', validDraft())).toEqual({});
  });

  it('adds https:// to addresses typed without it', () => {
    const draft = validDraft();
    draft.links.linkedin = 'linkedin.com/in/alex-sample';
    draft.links.portfolio = '  example.com  ';

    const links = normaliseDraft(draft).links;

    expect(links.linkedin).toBe('https://linkedin.com/in/alex-sample');
    expect(links.portfolio).toBe('https://example.com');
    expect(validateSection('links', draft)).toEqual({});
  });

  it.each([
    [
      'linkedin',
      'https://example.com/alex',
      'Enter a LinkedIn address on linkedin.com',
    ],
    [
      'github',
      'https://gitlab.com/alex',
      'Enter a GitHub address on github.com',
    ],
    [
      'portfolio',
      'not a url',
      'Enter a full web address, like https://example.com',
    ],
    [
      'portfolio',
      'ftp://example.com',
      'Enter a full web address, like https://example.com',
    ],
  ] as const)('rejects %s %j', (field, value, message) => {
    const draft = validDraft();
    draft.links[field] = value;

    expect(validateSection('links', draft)[`links.${field}`]).toBe(message);
  });

  it('accepts subdomains of the expected site', () => {
    const draft = validDraft();
    draft.links.linkedin = 'https://uk.linkedin.com/in/alex';

    expect(validateSection('links', draft)).toEqual({});
  });

  it('requires both a name and an address for other links', () => {
    const draft = validDraft();
    const link = newOtherLink();
    draft.links.other.push(link);

    expect(validateSection('links', draft)).toEqual({
      [`links.other.${link.id}.label`]: 'Name this link, for example "Blog"',
      [`links.other.${link.id}.url`]: 'Enter the web address',
    });
  });
});

describe('country', () => {
  it('requires a country', () => {
    const draft = validDraft();
    draft.personal.address.country = '';

    expect(validateSection('personal', draft)['personal.address.country']).toBe(
      'Choose your country',
    );
  });

  it('only accepts ISO country codes', () => {
    const draft = validDraft();
    draft.personal.address.country = 'United Kingdom';

    expect(validateSection('personal', draft)['personal.address.country']).toBe(
      'Choose a country from the list',
    );
  });
});

/** Personal details as saved before the first-name preference existed. */
function withoutPreference(personal: object): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...personal };
  Reflect.deleteProperty(copy, 'useFirstNameAsPreferred');
  return copy;
}

describe('parseStoredProfile', () => {
  const stored = () =>
    profileFromDraft(validDraft(), null, new Date('2026-10-17T12:00:00Z'));

  /** A version 1 profile, as saved before countries became codes. */
  const version1 = (country: string) => {
    const profile = stored();
    return {
      ...profile,
      personal: {
        ...profile.personal,
        address: { ...profile.personal.address, country },
      },
      metadata: { ...profile.metadata, schemaVersion: 1 },
    };
  };

  it('accepts a valid stored profile', () => {
    const profile = stored();

    expect(parseStoredProfile(JSON.parse(JSON.stringify(profile)))).toEqual({
      profile,
      unmatchedCountry: null,
    });
  });

  it.each([
    ['United Kingdom', 'GB'],
    ['uk', 'GB'],
    ['GBR', 'GB'],
    ['Germany', 'DE'],
  ])('migrates a version 1 country %j to %s', (text, code) => {
    const result = parseStoredProfile(version1(text));

    expect(result?.profile.personal.address.country).toBe(code);
    expect(result?.profile.metadata.schemaVersion).toBe(3);
    expect(result?.unmatchedCountry).toBeNull();
    // Everything else is kept as it was.
    expect(result?.profile.personal.email).toBe('alex.sample@example.com');
  });

  it('migrates a version 2 profile with the first-name preference off', () => {
    const personal = withoutPreference(stored().personal);
    const version2 = {
      ...stored(),
      personal: { ...personal, preferredName: '' },
      metadata: { ...stored().metadata, schemaVersion: 2 },
    };

    const result = parseStoredProfile(version2);

    expect(result?.profile.personal.useFirstNameAsPreferred).toBe(false);
    expect(result?.profile.metadata.schemaVersion).toBe(3);
    expect(result?.profile.personal.firstName).toBe('Alex');
  });

  it('migrates a version 1 profile through every version', () => {
    const personal = withoutPreference(version1('United Kingdom').personal);
    const result = parseStoredProfile({
      ...version1('United Kingdom'),
      personal,
    });

    expect(result?.profile.personal).toMatchObject({
      address: { country: 'GB' },
      useFirstNameAsPreferred: false,
    });
    expect(result?.profile.metadata.schemaVersion).toBe(3);
  });

  it('keeps a version 1 profile whose country cannot be matched', () => {
    const result = parseStoredProfile(version1('England'));

    expect(result?.profile.personal.address.country).toBe('');
    expect(result?.unmatchedCountry).toBe('England');
    expect(result?.profile.personal.firstName).toBe('Alex');
  });

  it.each([
    ['null', null],
    ['a string', 'profile'],
    ['an empty object', {}],
    [
      'a future schema version',
      { ...stored(), metadata: { ...stored().metadata, schemaVersion: 4 } },
    ],
    ['a missing section', { ...stored(), education: undefined }],
    [
      'a record without an id',
      { ...stored(), education: [{ institution: 'X' }] },
    ],
  ])('rejects %s', (_case, value) => {
    expect(parseStoredProfile(value)).toBeNull();
  });
});

describe('profileFromDraft', () => {
  it('keeps the creation time when updating a profile', () => {
    const first = profileFromDraft(
      validDraft(),
      null,
      new Date('2026-01-01T00:00:00Z'),
    );
    const updated = profileFromDraft(
      validDraft(),
      first.metadata,
      new Date('2026-02-01T00:00:00Z'),
    );

    expect(updated.metadata).toEqual({
      schemaVersion: 3,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-02-01T00:00:00.000Z',
    });
  });
});

describe('saved profiles from earlier versions and rules', () => {
  /** Profiles as each schema version stored them (fictional data). */
  const personal = {
    firstName: 'Alex',
    lastName: 'Sample',
    preferredName: '',
    email: 'alex.sample@example.com',
    phone: '+44 20 7946 0000',
  };
  const rest = {
    education: [
      {
        id: 'e1',
        institution: 'University of Example',
        qualification: 'BSc Computer Science',
        fieldOfStudy: 'Computer Science',
        startDate: '2021-09',
        endDate: '2024-06',
        grade: 'First',
      },
    ],
    employment: [],
    links: { linkedin: '', github: '', portfolio: '', other: [] },
  };
  const meta = (schemaVersion: number) => ({
    schemaVersion,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const address = {
    line1: '1 Example Street',
    line2: '',
    city: 'London',
    region: '',
    postcode: 'N1 9GU',
  };

  it.each([
    [
      'version 1',
      {
        personal: {
          ...personal,
          address: { ...address, country: 'United Kingdom' },
        },
        ...rest,
        metadata: meta(1),
      },
    ],
    [
      'version 2',
      {
        personal: { ...personal, address: { ...address, country: 'GB' } },
        ...rest,
        metadata: meta(2),
      },
    ],
    [
      'version 3',
      {
        personal: {
          ...personal,
          useFirstNameAsPreferred: true,
          address: { ...address, country: 'GB' },
        },
        ...rest,
        metadata: meta(3),
      },
    ],
  ])('reads a %s profile', (_version, stored) => {
    const result = parseStoredProfile(JSON.parse(JSON.stringify(stored)));

    expect(result?.profile).toMatchObject({
      personal: {
        email: 'alex.sample@example.com',
        address: { country: 'GB' },
      },
      education: [{ institution: 'University of Example' }],
      metadata: { schemaVersion: 3, updatedAt: '2026-01-01T00:00:00.000Z' },
    });
    expect(result && savedProfileIssues(result.profile)).toEqual({});
  });

  it('keeps a profile readable when it no longer passes today’s rules', () => {
    const profile = profileFromDraft(
      validDraft(),
      null,
      new Date('2026-01-01T00:00:00Z'),
    );
    // Values a later rule change could reject, saved when they were valid.
    const older = {
      ...profile,
      personal: {
        ...profile.personal,
        email: 'not-an-address',
        address: { ...profile.personal.address, country: 'United Kingdom' },
      },
    };

    const result = parseStoredProfile(JSON.parse(JSON.stringify(older)));

    expect(result?.profile.personal.firstName).toBe('Alex');
    expect(savedProfileIssues(older)).toMatchObject({
      'personal.email': expect.any(String) as string,
      'personal.address.country': expect.any(String) as string,
    });
  });

  it('keeps settings missing from an older save at their safe default', () => {
    const profile = profileFromDraft(
      validDraft(),
      null,
      new Date('2026-01-01T00:00:00Z'),
    );
    const personal: Record<string, unknown> = { ...profile.personal };
    Reflect.deleteProperty(personal, 'useFirstNameAsPreferred');

    const result = parseStoredProfile({ ...profile, personal });

    expect(result?.profile.personal.useFirstNameAsPreferred).toBe(false);
  });
});
