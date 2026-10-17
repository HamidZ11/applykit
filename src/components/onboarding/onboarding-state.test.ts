import { describe, expect, it } from 'vitest';
import { DRAFT_SCHEMA_VERSION, type StoredDraft } from '@/domain/profile-draft';
import { validDraft, validProfile } from '@/test/profile-fixtures';
import {
  canVisit,
  firstRecordWithError,
  firstStepWithError,
  initialOnboardingState,
  onboardingReducer,
  planDraftRestore,
  toStoredDraft,
  type OnboardingAction,
  type OnboardingState,
} from './onboarding-state';

function apply(
  actions: OnboardingAction[],
  state: OnboardingState = initialOnboardingState(),
): OnboardingState {
  return actions.reduce(onboardingReducer, state);
}

describe('onboardingReducer', () => {
  it('starts on personal details with an empty, clean draft', () => {
    const state = initialOnboardingState();

    expect(state).toMatchObject({
      step: 'personal',
      furthest: 0,
      saved: null,
      dirty: false,
    });
    expect(state.draft.education).toEqual([]);
  });

  it('keeps entered values when moving between steps', () => {
    const state = apply([
      { type: 'patch-personal', patch: { firstName: 'Alex' } },
      { type: 'patch-address', patch: { city: 'London' } },
      { type: 'advance' },
      { type: 'add-record', list: 'education' },
      { type: 'advance' },
      { type: 'go', step: 'personal' },
    ]);

    expect(state.step).toBe('personal');
    expect(state.draft.personal.firstName).toBe('Alex');
    expect(state.draft.personal.address.city).toBe('London');
    expect(state.draft.education).toHaveLength(1);
    expect(state.furthest).toBe(2);
  });

  it('only allows jumping to steps already reached during first run', () => {
    const state = apply([{ type: 'advance' }]);

    expect(canVisit(state, 'education')).toBe(true);
    expect(canVisit(state, 'links')).toBe(false);
    expect(onboardingReducer(state, { type: 'go', step: 'links' })).toBe(state);
  });

  it('adds an education record and opens it for editing', () => {
    const state = apply([{ type: 'add-record', list: 'education' }]);
    const record = state.draft.education[0];

    expect(record).toMatchObject({ institution: '', qualification: '' });
    expect(state.open.education).toBe(record?.id);
    expect(state.dirty).toBe(true);
  });

  it('edits only the targeted record', () => {
    const added = apply([
      { type: 'add-record', list: 'employment' },
      { type: 'add-record', list: 'employment' },
    ]);
    const [first, second] = added.draft.employment;

    const state = onboardingReducer(added, {
      type: 'patch-employment',
      id: second?.id ?? '',
      patch: { employer: 'Example Ltd', current: true },
    });

    expect(state.draft.employment[0]).toEqual(first);
    expect(state.draft.employment[1]).toMatchObject({
      employer: 'Example Ltd',
      current: true,
    });
  });

  it('removes a record, its errors and its open editor', () => {
    const added = apply([
      { type: 'add-record', list: 'education' },
      { type: 'add-record', list: 'education' },
    ]);
    const [keep, remove] = added.draft.education;
    const withErrors = onboardingReducer(added, {
      type: 'set-errors',
      errors: {
        [`education.${remove?.id ?? ''}.institution`]: 'Enter the institution',
        [`education.${keep?.id ?? ''}.institution`]: 'Enter the institution',
      },
    });

    const state = onboardingReducer(withErrors, {
      type: 'remove-record',
      list: 'education',
      id: remove?.id ?? '',
    });

    expect(state.draft.education).toEqual([keep]);
    expect(Object.keys(state.errors)).toEqual([
      `education.${keep?.id ?? ''}.institution`,
    ]);
    expect(state.open.education).toBeNull();
  });

  it('clears a field error as soon as the field changes', () => {
    const state = apply([
      {
        type: 'set-errors',
        errors: {
          'personal.firstName': 'Enter your first name',
          'personal.lastName': 'Enter your last name',
        },
      },
      { type: 'patch-personal', patch: { firstName: 'Alex' } },
    ]);

    expect(state.errors).toEqual({
      'personal.lastName': 'Enter your last name',
    });
  });

  it('adds, edits and removes other links', () => {
    const added = apply([{ type: 'add-link' }, { type: 'add-link' }]);
    const [first, second] = added.draft.links.other;

    const state = apply(
      [
        { type: 'patch-link', id: first?.id ?? '', patch: { label: 'Blog' } },
        { type: 'remove-link', id: second?.id ?? '' },
      ],
      added,
    );

    expect(state.draft.links.other).toEqual([{ ...first, label: 'Blog' }]);
  });

  it('opens an existing profile on the review step with every step reachable', () => {
    const profile = validProfile();
    const state = apply([{ type: 'loaded', profile }]);

    expect(state).toMatchObject({
      step: 'review',
      saved: profile,
      dirty: false,
    });
    expect(state.draft.personal).toEqual(profile.personal);
    expect(canVisit(state, 'personal')).toBe(true);
  });

  it('records a successful save and clears the dirty flag', () => {
    const profile = validProfile();
    const state = apply([
      { type: 'patch-personal', patch: { firstName: 'Alex' } },
      { type: 'save-started' },
      { type: 'save-succeeded', profile },
    ]);

    expect(state).toMatchObject({
      saved: profile,
      dirty: false,
      save: { state: 'saved', at: profile.metadata.updatedAt },
    });
  });

  it('keeps the draft and dirty flag when a save fails', () => {
    const state = apply([
      { type: 'patch-personal', patch: { firstName: 'Alex' } },
      { type: 'save-started' },
      { type: 'save-failed', message: 'Could not save' },
    ]);

    expect(state.draft.personal.firstName).toBe('Alex');
    expect(state.dirty).toBe(true);
    expect(state.save).toEqual({ state: 'error', message: 'Could not save' });
  });
});

describe('error navigation', () => {
  it('finds the first step and record with an error', () => {
    const errors = {
      'links.github': 'Enter a GitHub address on github.com',
      'employment.abc.title': 'Enter your job title',
    };

    expect(firstStepWithError(errors)).toBe('experience');
    expect(firstRecordWithError(errors, 'employment')).toBe('abc');
    expect(firstRecordWithError(errors, 'education')).toBeNull();
  });
});

function storedDraft(overrides: Partial<StoredDraft> = {}): StoredDraft {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    savedAt: '2026-10-17T12:00:00.000Z',
    basedOn: null,
    step: 'experience',
    furthest: 2,
    draft: validDraft(),
    ...overrides,
  };
}

describe('welcome and drafts', () => {
  it('starts on the welcome screen until the user begins', () => {
    const initial = initialOnboardingState();
    const started = onboardingReducer(initial, { type: 'start' });

    expect(initial.started).toBe(false);
    expect(started).toMatchObject({ started: true, step: 'personal' });
  });

  it('skips the welcome screen for a saved profile', () => {
    expect(apply([{ type: 'loaded', profile: validProfile() }]).started).toBe(
      true,
    );
  });

  it('restores first-run progress where the user left off', () => {
    const stored = storedDraft();
    const state = apply([{ type: 'restored', stored, saved: null }]);

    expect(state).toMatchObject({
      started: true,
      step: 'experience',
      furthest: 2,
      saved: null,
      dirty: true,
      restoredFrom: stored.savedAt,
    });
    expect(state.draft).toEqual(stored.draft);
    expect(canVisit(state, 'links')).toBe(false);
  });

  it('falls back to the first step for an unknown or unreachable step', () => {
    const unknown = apply([
      { type: 'restored', stored: storedDraft({ step: 'cv' }), saved: null },
    ]);
    const ahead = apply([
      {
        type: 'restored',
        stored: storedDraft({ step: 'review', furthest: 1 }),
        saved: null,
      },
    ]);

    expect(unknown.step).toBe('personal');
    expect(ahead.step).toBe('personal');
  });

  it('restores unsaved edits on top of the saved profile', () => {
    const saved = validProfile();
    const edited = validDraft();
    edited.personal.phone = '020 7946 0001';

    const state = apply([
      { type: 'loaded', profile: saved },
      {
        type: 'restored',
        stored: storedDraft({
          basedOn: saved.metadata.updatedAt,
          step: 'personal',
          draft: edited,
        }),
        saved,
      },
    ]);

    expect(state.saved).toBe(saved);
    expect(state.draft.personal.phone).toBe('020 7946 0001');
    expect(state.dirty).toBe(true);
    expect(canVisit(state, 'review')).toBe(true);
  });

  it('discards edits back to the saved profile', () => {
    const saved = validProfile();
    const state = apply([
      { type: 'loaded', profile: saved },
      { type: 'patch-personal', patch: { phone: '020 7946 0001' } },
      { type: 'discard' },
    ]);

    expect(state.draft.personal).toEqual(saved.personal);
    expect(state).toMatchObject({ dirty: false, step: 'review', saved });
  });

  it('discards first-run progress back to the welcome screen', () => {
    const state = apply([
      { type: 'start' },
      { type: 'patch-personal', patch: { firstName: 'Alex' } },
      { type: 'discard' },
    ]);

    expect(state).toEqual(initialOnboardingState());
  });

  it('clears the restored notice once the user moves on', () => {
    const state = apply([
      { type: 'restored', stored: storedDraft(), saved: null },
      { type: 'go', step: 'personal' },
    ]);

    expect(state.restoredFrom).toBeNull();
  });

  it('records which saved profile a draft is based on', () => {
    const saved = validProfile();
    const state = apply([{ type: 'loaded', profile: saved }]);

    expect(
      toStoredDraft(state, new Date('2026-10-18T08:00:00Z')),
    ).toMatchObject({
      basedOn: saved.metadata.updatedAt,
      savedAt: '2026-10-18T08:00:00.000Z',
      step: 'review',
    });
  });
});

describe('planDraftRestore', () => {
  const at = '2026-10-17T12:00:00.000Z';

  it.each([
    ['first-run draft, no profile', null, { status: 'empty' }, 'restore'],
    [
      'first-run draft, unreadable profile',
      null,
      { status: 'invalid' },
      'restore',
    ],
    [
      'edits to the saved profile',
      at,
      { status: 'loaded', updatedAt: at },
      'restore',
    ],
    [
      'edits to an older profile',
      at,
      { status: 'loaded', updatedAt: '2026-10-18T00:00:00.000Z' },
      'discard',
    ],
    [
      'first-run draft, profile saved since',
      null,
      { status: 'loaded', updatedAt: at },
      'discard',
    ],
    ['profile could not be read', null, { status: 'error' }, 'keep'],
  ] as const)('%s → %s', (_case, basedOn, profile, decision) => {
    expect(planDraftRestore(storedDraft({ basedOn }), profile)).toBe(decision);
  });
});
