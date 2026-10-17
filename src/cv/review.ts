import {
  newEducationRecord,
  newEmploymentRecord,
  type EducationRecord,
  type EmploymentRecord,
  type ProfileDraft,
} from '@/domain/user-profile';
import { fold } from './normalise';
import type { Candidate, Certainty, CvExtraction } from './types';

/**
 * Turns an extraction into proposals the user reviews against their current
 * draft, and applies only what they accept. Pure: the draft passed in is
 * never modified, and nothing here touches storage.
 */

export type FieldTarget =
  | 'firstName'
  | 'lastName'
  | 'email'
  | 'phone'
  | 'city'
  | 'linkedin'
  | 'github'
  | 'portfolio';

export const FIELD_LABEL: Record<FieldTarget, string> = {
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email address',
  phone: 'Phone number',
  city: 'Town or city',
  linkedin: 'LinkedIn',
  github: 'GitHub',
  portfolio: 'Portfolio or website',
};

export const PERSONAL_TARGETS: FieldTarget[] = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'city',
];
export const LINK_TARGETS: FieldTarget[] = ['linkedin', 'github', 'portfolio'];

/** How a proposed value relates to what the draft already holds. */
export type Relation = 'new' | 'same' | 'conflict';

export interface FieldProposal {
  target: FieldTarget;
  proposed: string;
  current: string;
  certainty: Certainty;
  source: string;
  relation: Relation;
}

export interface RecordProposal<T> {
  key: string;
  record: T;
  certainty: Certainty;
  source: string;
  notes: string[];
  /** Matches a record already in the draft or earlier in the CV. */
  duplicate: boolean;
}

export type EducationProposal = RecordProposal<Omit<EducationRecord, 'id'>>;
export type EmploymentProposal = RecordProposal<Omit<EmploymentRecord, 'id'>>;

export interface ImportReview {
  fields: FieldProposal[];
  /** Fields the CV did not provide. */
  missing: FieldTarget[];
  education: EducationProposal[];
  employment: EmploymentProposal[];
  warnings: string[];
}

export interface ImportChoices {
  fields: Partial<Record<FieldTarget, { accept: boolean; value: string }>>;
  records: Record<string, boolean>;
}

function currentValue(draft: ProfileDraft, target: FieldTarget): string {
  switch (target) {
    case 'city':
      return draft.personal.address.city;
    case 'linkedin':
    case 'github':
    case 'portfolio':
      return draft.links[target];
    default:
      return draft.personal[target];
  }
}

function setValue(
  draft: ProfileDraft,
  target: FieldTarget,
  value: string,
): ProfileDraft {
  switch (target) {
    case 'city':
      return {
        ...draft,
        personal: {
          ...draft.personal,
          address: { ...draft.personal.address, city: value },
        },
      };
    case 'linkedin':
    case 'github':
    case 'portfolio':
      return { ...draft, links: { ...draft.links, [target]: value } };
    default:
      return { ...draft, personal: { ...draft.personal, [target]: value } };
  }
}

/** Compares values the way a person would: case, spacing and URL form aside. */
function comparable(target: FieldTarget, value: string): string {
  const trimmed = value.trim();
  if (target === 'phone') return trimmed.replace(/\D/g, '').replace(/^44/, '0');
  if (target === 'email') return trimmed.toLowerCase();
  if (LINK_TARGETS.includes(target)) {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/\/+$/, '');
  }
  return fold(trimmed);
}

export function buildReview(
  extraction: CvExtraction,
  draft: ProfileDraft,
): ImportReview {
  const candidates: Record<FieldTarget, Candidate | null> = {
    ...extraction.personal,
    ...extraction.links,
  };
  const fields: FieldProposal[] = [];
  const missing: FieldTarget[] = [];
  for (const target of [...PERSONAL_TARGETS, ...LINK_TARGETS]) {
    const candidate = candidates[target];
    if (!candidate) {
      missing.push(target);
      continue;
    }
    const current = currentValue(draft, target);
    const relation: Relation =
      current.trim() === ''
        ? 'new'
        : comparable(target, current) === comparable(target, candidate.value)
          ? 'same'
          : 'conflict';
    fields.push({
      target,
      proposed: candidate.value,
      current,
      certainty: candidate.certainty,
      source: candidate.source,
      relation,
    });
  }

  return {
    fields,
    missing,
    education: proposeRecords(
      'education',
      extraction.education,
      draft.education,
      (record) => [record.institution, record.qualification, record.startDate],
    ),
    employment: proposeRecords(
      'employment',
      extraction.employment,
      draft.employment,
      (record) => [record.employer, record.title, record.startDate],
    ),
    warnings: extraction.warnings,
  };
}

/**
 * Records become proposals; one that matches an existing record (same
 * organisation, and the same title/qualification or start date) is marked as
 * a duplicate rather than merged.
 */
function proposeRecords<T extends object>(
  prefix: string,
  candidates: readonly {
    record: T;
    certainty: Certainty;
    source: string;
    notes: string[];
  }[],
  existing: readonly T[],
  identity: (record: T) => [string, string, string],
): RecordProposal<T>[] {
  const seen: [string, string, string][] = existing.map(
    (record) => identity(record).map(fold) as [string, string, string],
  );
  return candidates.map((candidate, index) => {
    const [organisation, role, start] = identity(candidate.record).map(
      fold,
    ) as [string, string, string];
    const duplicate = seen.some(
      ([otherOrganisation, otherRole, otherStart]) =>
        organisation !== '' &&
        organisation === otherOrganisation &&
        ((role !== '' && role === otherRole) ||
          (start !== '' && start === otherStart)),
    );
    seen.push([organisation, role, start]);
    return {
      key: `${prefix}-${String(index)}`,
      record: candidate.record,
      certainty: candidate.certainty,
      source: candidate.source,
      notes: candidate.notes,
      duplicate,
    };
  });
}

/**
 * The starting choices: confident new values and records are selected;
 * anything uncertain, conflicting with what the user already has, or
 * duplicated is left for the user to opt into.
 */
export function defaultChoices(review: ImportReview): ImportChoices {
  const fields: ImportChoices['fields'] = {};
  for (const field of review.fields) {
    if (field.relation === 'same') continue;
    fields[field.target] = {
      accept: field.relation === 'new' && field.certainty === 'confident',
      value: field.proposed,
    };
  }
  const records: Record<string, boolean> = {};
  for (const proposal of [...review.education, ...review.employment]) {
    records[proposal.key] =
      !proposal.duplicate && proposal.certainty === 'confident';
  }
  return { fields, records };
}

/** How many changes the current choices would make. */
export function countChanges(
  review: ImportReview,
  choices: ImportChoices,
): number {
  const fields = Object.values(choices.fields).filter(
    (choice) => choice.accept && choice.value.trim() !== '',
  ).length;
  const records = [...review.education, ...review.employment].filter(
    (proposal) => !proposal.duplicate && choices.records[proposal.key],
  ).length;
  return fields + records;
}

/**
 * Applies the accepted choices to a copy of the draft: accepted (and possibly
 * corrected) values replace the draft's, accepted records are appended with
 * new ids. Nothing else changes.
 */
export function applyChoices(
  draft: ProfileDraft,
  review: ImportReview,
  choices: ImportChoices,
): ProfileDraft {
  let next = draft;
  for (const field of review.fields) {
    const choice = choices.fields[field.target];
    const value = choice?.value.trim() ?? '';
    if (choice?.accept && value !== '') {
      next = setValue(next, field.target, value);
    }
  }
  const accepted = <T extends { duplicate: boolean; key: string }>(
    proposals: T[],
  ) => proposals.filter((p) => !p.duplicate && choices.records[p.key]);

  const education = accepted(review.education).map((proposal) => ({
    ...newEducationRecord(),
    ...proposal.record,
  }));
  const employment = accepted(review.employment).map((proposal) => ({
    ...newEmploymentRecord(),
    ...proposal.record,
  }));
  if (education.length > 0) {
    next = { ...next, education: [...next.education, ...education] };
  }
  if (employment.length > 0) {
    next = { ...next, employment: [...next.employment, ...employment] };
  }
  return next;
}
