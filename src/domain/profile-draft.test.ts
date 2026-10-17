import { describe, expect, it } from 'vitest';
import { validDraft } from '@/test/profile-fixtures';
import { DRAFT_SCHEMA_VERSION, parseStoredDraft } from './profile-draft';
import { emptyDraft, newEmploymentRecord } from './user-profile';

function stored(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    savedAt: '2026-10-17T12:00:00.000Z',
    basedOn: null,
    step: 'education',
    furthest: 1,
    draft: validDraft(),
    ...overrides,
  };
}

describe('parseStoredDraft', () => {
  it('accepts a draft with half-entered values', () => {
    const draft = emptyDraft();
    draft.personal.email = 'alex@';
    draft.employment.push({ ...newEmploymentRecord(), startDate: '20' });

    expect(parseStoredDraft(stored({ draft }))?.draft).toEqual(draft);
  });

  it('accepts a draft based on a saved profile', () => {
    const value = stored({ basedOn: '2026-10-01T09:00:00.000Z' });

    expect(parseStoredDraft(value)?.basedOn).toBe('2026-10-01T09:00:00.000Z');
  });

  it('falls back to no employment type for an unknown one', () => {
    const draft = validDraft();
    draft.employment.push(newEmploymentRecord());
    const value = stored({ draft });
    (
      value.draft.employment[0] as unknown as { employmentType: string }
    ).employmentType = 'gig';

    expect(parseStoredDraft(value)?.draft.employment[0]?.employmentType).toBe(
      '',
    );
  });

  it.each([
    ['nothing', null],
    ['text', 'draft'],
    ['an unknown version', stored({ schemaVersion: 99 })],
    ['a missing draft', stored({ draft: undefined })],
    [
      'a malformed record list',
      stored({ draft: { ...validDraft(), education: 'x' } }),
    ],
    ['a bad timestamp', stored({ savedAt: 'yesterday' })],
  ])('rejects %s', (_case, value) => {
    expect(parseStoredDraft(value)).toBeNull();
  });
});
