import { z } from 'zod';
import { findCountryCode, isCountryCode } from './countries';
import { profileShape } from './profile-draft';
import {
  EMPLOYMENT_TYPES,
  PROFILE_SCHEMA_VERSION,
  type EducationRecord,
  type EmploymentRecord,
  type PersonalDetails,
  type ProfessionalLinks,
  type ProfileDraft,
  type UserProfile,
} from './user-profile';

/**
 * Validation for the profile, used in three places: each onboarding step,
 * the whole draft before saving, and data read back from storage (which is
 * treated as untrusted). One schema keeps the three consistent.
 */

const SHORT = 200;
const LONG = 2000;

const required = (message: string) =>
  z.string().trim().min(1, message).max(SHORT, 'This is too long');
const optional = z.string().trim().max(SHORT, 'This is too long');

const yearMonth = (missing: string) =>
  z
    .string()
    .min(1, missing)
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Enter a month and year');

function digitCount(value: string): number {
  return value.replace(/\D/g, '').length;
}

const phone = z
  .string()
  .trim()
  .min(1, 'Enter your phone number')
  .refine(
    (value) =>
      /^\+?[\d\s().-]+$/.test(value) &&
      digitCount(value) >= 7 &&
      digitCount(value) <= 15,
    'Enter a phone number using digits, spaces and an optional +',
  );

// Optional: some countries have no postcodes, and a made-up one would be
// filled into applications.
const postcode = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || /^[A-Za-z0-9][A-Za-z0-9 -]{1,9}$/.test(value),
    'Enter a valid postcode',
  );

const email = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .pipe(z.email('Enter an email address like name@example.com'));

/** An optional web address; when given, it must be http(s) on a real host. */
function link(host?: { domain: string; name: string }) {
  return z
    .string()
    .trim()
    .max(SHORT, 'This is too long')
    .superRefine((value, ctx) => {
      if (value === '') return;
      const url = parseWebUrl(value);
      if (!url) {
        ctx.addIssue({
          code: 'custom',
          message: 'Enter a full web address, like https://example.com',
        });
      } else if (host && !isOnDomain(url, host.domain)) {
        ctx.addIssue({
          code: 'custom',
          message: `Enter a ${host.name} address on ${host.domain}`,
        });
      }
    });
}

const country = z
  .string()
  .min(1, 'Choose your country')
  .refine(isCountryCode, 'Choose a country from the list');

function personalWith(countryField: z.ZodType<string>) {
  return z.object({
    firstName: required('Enter your first name'),
    lastName: required('Enter your last name'),
    preferredName: optional,
    useFirstNameAsPreferred: z.boolean(),
    email,
    phone,
    address: z.object({
      line1: required('Enter the first line of your address'),
      line2: optional,
      city: required('Enter your town or city'),
      region: optional,
      postcode,
      country: countryField,
    }),
  }) satisfies z.ZodType<PersonalDetails>;
}

export const personalSchema = personalWith(country);

export const educationSchema = z
  .object({
    id: z.string().min(1),
    institution: required('Enter the institution'),
    qualification: required('Enter the degree or qualification'),
    fieldOfStudy: required('Enter the field of study'),
    startDate: yearMonth('Enter when you started'),
    endDate: yearMonth('Enter when you finished, or expect to'),
    grade: optional,
  })
  .superRefine((record, ctx) => {
    if (record.startDate && record.endDate < record.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'The end date must be after the start date',
      });
    }
  }) satisfies z.ZodType<EducationRecord>;

export const employmentSchema = z
  .object({
    id: z.string().min(1),
    employer: required('Enter the employer'),
    title: required('Enter your job title'),
    employmentType: z.enum([...EMPLOYMENT_TYPES, '']),
    startDate: yearMonth('Enter when you started'),
    endDate: z.string(),
    current: z.boolean(),
    description: z
      .string()
      .trim()
      .max(LONG, 'Keep this under 2,000 characters'),
  })
  .superRefine((record, ctx) => {
    if (record.current) {
      if (record.endDate !== '') {
        ctx.addIssue({
          code: 'custom',
          path: ['endDate'],
          message: 'A current role has no end date',
        });
      }
      return;
    }
    const end = yearMonth(
      'Enter when you left, or mark this as your current role',
    ).safeParse(record.endDate);
    if (!end.success) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: end.error.issues[0]?.message ?? 'Enter a month and year',
      });
    } else if (record.startDate && record.endDate < record.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'The end date must be after the start date',
      });
    }
  }) satisfies z.ZodType<EmploymentRecord>;

export const linksSchema = z.object({
  linkedin: link({ domain: 'linkedin.com', name: 'LinkedIn' }),
  github: link({ domain: 'github.com', name: 'GitHub' }),
  portfolio: link(),
  other: z.array(
    z.object({
      id: z.string().min(1),
      label: required('Name this link, for example "Blog"'),
      url: link().refine((value) => value !== '', 'Enter the web address'),
    }),
  ),
}) satisfies z.ZodType<ProfessionalLinks>;

const draftSchema = z.object({
  personal: personalSchema,
  education: z.array(educationSchema),
  employment: z.array(employmentSchema),
  links: linksSchema,
});

const metadataSchema = z.object({
  schemaVersion: z.literal(PROFILE_SCHEMA_VERSION),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const userProfileSchema = draftSchema.extend({
  metadata: metadataSchema,
}) satisfies z.ZodType<UserProfile>;

/**
 * Saved profiles are read back by shape, not by today's form rules. Those
 * rules applied when the profile was saved; if they later change (a code
 * change, a new country list, a library update), a profile that was valid
 * stays readable and usable for autofill, and the profile page asks the
 * user to review what no longer passes (`savedProfileIssues`). Only data
 * that is not a profile at all, or from an unknown version, is rejected.
 */
const storedProfileSchema = profileShape.extend({
  metadata: metadataSchema,
}) satisfies z.ZodType<UserProfile>;

/**
 * What a saved profile no longer passes under today's form rules, keyed
 * like form errors. Empty when it can be saved again as it is.
 */
export function savedProfileIssues(profile: UserProfile): FieldErrors {
  const result = validateDraft({
    personal: profile.personal,
    education: profile.education,
    employment: profile.employment,
    links: profile.links,
  });
  return result.ok ? {} : result.errors;
}

/** The parts of a profile that are validated independently, one per step. */
export type ProfileSection = 'personal' | 'education' | 'employment' | 'links';

/**
 * Field errors keyed by path. Records use their id rather than their index,
 * e.g. `education.<id>.endDate`, so errors stay attached to the right record
 * when others are added or removed.
 */
export type FieldErrors = Record<string, string>;

const SECTION_SCHEMAS: Record<ProfileSection, z.ZodType> = {
  personal: personalSchema,
  education: z.array(educationSchema),
  employment: z.array(employmentSchema),
  links: linksSchema,
};

/** Validates one section of the draft. Empty record lists are valid. */
export function validateSection(
  section: ProfileSection,
  draft: ProfileDraft,
): FieldErrors {
  const value = normaliseDraft(draft)[section];
  const result = SECTION_SCHEMAS[section].safeParse(value);
  return result.success ? {} : toFieldErrors(result.error, [section], draft);
}

export type DraftValidation =
  { ok: true; draft: ProfileDraft } | { ok: false; errors: FieldErrors };

/** Validates the whole draft, returning the normalised draft when valid. */
export function validateDraft(draft: ProfileDraft): DraftValidation {
  const result = draftSchema.safeParse(normaliseDraft(draft));
  return result.success
    ? { ok: true, draft: result.data }
    : { ok: false, errors: toFieldErrors(result.error, [], draft) };
}

/** Parses untrusted stored data, returning null unless it is a valid profile. */
export interface StoredProfile {
  profile: UserProfile;
  /** Free-text country from a version 1 profile that matched no country. */
  unmatchedCountry: string | null;
}

/**
 * Parses untrusted stored data, migrating older schema versions first.
 * Returns null unless the result is a valid profile.
 */
export function parseStoredProfile(value: unknown): StoredProfile | null {
  const { migrated, unmatchedCountry } = migrateStoredProfile(value);
  const result = storedProfileSchema.safeParse(migrated);
  return result.success ? { profile: result.data, unmatchedCountry } : null;
}

/** Brings older stored profiles up to the current version, step by step. */
function migrateStoredProfile(value: unknown): {
  migrated: unknown;
  unmatchedCountry: string | null;
} {
  const fromV1 = migrateVersion1(value);
  return {
    migrated: migrateVersion2(fromV1.migrated),
    unmatchedCountry: fromV1.unmatchedCountry,
  };
}

/** Version 2 → 3: the first-name preference, off unless the user opts in. */
function migrateVersion2(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.metadata)) return value;
  if (value.metadata.schemaVersion !== 2) return value;
  const personal = isRecord(value.personal) ? value.personal : {};
  return {
    ...value,
    personal: { ...personal, useFirstNameAsPreferred: false },
    metadata: { ...value.metadata, schemaVersion: 3 },
  };
}

/** Version 1 → 2: free-text country to an ISO 3166-1 alpha-2 code. */
function migrateVersion1(value: unknown): {
  migrated: unknown;
  unmatchedCountry: string | null;
} {
  if (!isRecord(value) || !isRecord(value.metadata)) {
    return { migrated: value, unmatchedCountry: null };
  }
  if (value.metadata.schemaVersion !== 1) {
    return { migrated: value, unmatchedCountry: null };
  }
  const personal = isRecord(value.personal) ? value.personal : {};
  const address = isRecord(personal.address) ? personal.address : {};
  const text = typeof address.country === 'string' ? address.country : '';
  const code = findCountryCode(text);
  return {
    migrated: {
      ...value,
      personal: { ...personal, address: { ...address, country: code ?? '' } },
      metadata: { ...value.metadata, schemaVersion: 2 },
    },
    unmatchedCountry: code === null && text.trim() !== '' ? text.trim() : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Tidies a draft before validation and saving: trims text, adds `https://`
 * to web addresses typed without it, and clears the end date of a current
 * role.
 */
export function normaliseDraft(draft: ProfileDraft): ProfileDraft {
  return {
    personal: trimStrings(draft.personal),
    education: draft.education.map((record) => trimStrings(record)),
    employment: draft.employment.map((record) => {
      const trimmed = trimStrings(record);
      return trimmed.current ? { ...trimmed, endDate: '' } : trimmed;
    }),
    links: {
      linkedin: withScheme(draft.links.linkedin),
      github: withScheme(draft.links.github),
      portfolio: withScheme(draft.links.portfolio),
      other: draft.links.other.map((other) => ({
        id: other.id,
        label: other.label.trim(),
        url: withScheme(other.url),
      })),
    },
  };
}

function toFieldErrors(
  error: z.ZodError,
  prefix: (string | number)[],
  draft: ProfileDraft,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const key = fieldKey([...prefix, ...issue.path], draft);
    errors[key] ??= issue.message;
  }
  return errors;
}

/** Turns a schema path into an error key, replacing record indexes with ids. */
function fieldKey(path: PropertyKey[], draft: ProfileDraft): string {
  const [section, index, ...rest] = path;
  const list =
    section === 'education'
      ? draft.education
      : section === 'employment'
        ? draft.employment
        : null;
  if (list && typeof index === 'number') {
    const id = list[index]?.id ?? String(index);
    return [section, id, ...rest].map(String).join('.');
  }
  if (section === 'links' && index === 'other' && typeof rest[0] === 'number') {
    const id = draft.links.other[rest[0]]?.id ?? String(rest[0]);
    return ['links', 'other', id, ...rest.slice(1)].map(String).join('.');
  }
  return path.map(String).join('.');
}

function trimStrings<T extends object>(value: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    result[key] =
      typeof field === 'string'
        ? field.trim()
        : field !== null && typeof field === 'object' && !Array.isArray(field)
          ? trimStrings(field)
          : field;
  }
  return result as T;
}

function withScheme(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function parseWebUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const hasHost = url.hostname.includes('.') && !url.hostname.endsWith('.');
    return (url.protocol === 'https:' || url.protocol === 'http:') && hasHost
      ? url
      : null;
  } catch {
    return null;
  }
}

function isOnDomain(url: URL, domain: string): boolean {
  const host = url.hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}
