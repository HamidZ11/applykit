import { z } from 'zod';
import { EMPLOYMENT_TYPES, type ProfileDraft } from './user-profile';

/**
 * Unfinished onboarding or unsaved profile edits, kept so closing the page
 * does not lose them. Stored separately from the confirmed profile and never
 * used for autofill.
 *
 * A draft is unconfirmed input, so only its shape is checked when read back,
 * not its content: half-typed values are expected.
 */

export const DRAFT_SCHEMA_VERSION = 1;

export interface StoredDraft {
  schemaVersion: typeof DRAFT_SCHEMA_VERSION;
  /** ISO 8601 time of the last autosave. */
  savedAt: string;
  /**
   * `metadata.updatedAt` of the saved profile these edits started from, or
   * null for first-run onboarding. A draft based on an older profile is
   * obsolete and is discarded.
   */
  basedOn: string | null;
  /** Where the user was, so they can carry on from the same place. */
  step: string;
  furthest: number;
  draft: ProfileDraft;
}

const text = z.string().max(5000);

const draftShape = z.object({
  personal: z.object({
    firstName: text,
    lastName: text,
    preferredName: text,
    email: text,
    phone: text,
    address: z.object({
      line1: text,
      line2: text,
      city: text,
      region: text,
      postcode: text,
      country: text,
    }),
  }),
  education: z
    .array(
      z.object({
        id: z.string().min(1),
        institution: text,
        qualification: text,
        fieldOfStudy: text,
        startDate: text,
        endDate: text,
        grade: text,
      }),
    )
    .max(100),
  employment: z
    .array(
      z.object({
        id: z.string().min(1),
        employer: text,
        title: text,
        employmentType: z.enum([...EMPLOYMENT_TYPES, '']).catch(''),
        startDate: text,
        endDate: text,
        current: z.boolean(),
        description: text,
      }),
    )
    .max(100),
  links: z.object({
    linkedin: text,
    github: text,
    portfolio: text,
    other: z
      .array(z.object({ id: z.string().min(1), label: text, url: text }))
      .max(100),
  }),
}) satisfies z.ZodType<ProfileDraft>;

const storedDraftSchema = z.object({
  schemaVersion: z.literal(DRAFT_SCHEMA_VERSION),
  savedAt: z.iso.datetime(),
  basedOn: z.iso.datetime().nullable(),
  step: z.string(),
  furthest: z.number().int().min(0).max(10),
  draft: draftShape,
}) satisfies z.ZodType<StoredDraft>;

/** Parses untrusted stored data; null unless it is a usable draft. */
export function parseStoredDraft(value: unknown): StoredDraft | null {
  const result = storedDraftSchema.safeParse(value);
  return result.success ? result.data : null;
}
