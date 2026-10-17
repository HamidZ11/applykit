import { describe, expect, it } from 'vitest';
import { validProfile } from '@/test/profile-fixtures';
import {
  canVisit,
  firstRecordWithError,
  firstStepWithError,
  initialOnboardingState,
  onboardingReducer,
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
