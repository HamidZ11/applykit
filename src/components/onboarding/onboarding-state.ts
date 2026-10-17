import { DRAFT_SCHEMA_VERSION, type StoredDraft } from '@/domain/profile-draft';
import type { FieldErrors, ProfileSection } from '@/domain/profile-schema';
import {
  draftFromProfile,
  emptyDraft,
  newEducationRecord,
  newEmploymentRecord,
  newOtherLink,
  type Address,
  type EducationRecord,
  type EmploymentRecord,
  type OtherLink,
  type PersonalDetails,
  type ProfessionalLinks,
  type ProfileDraft,
  type UserProfile,
} from '@/domain/user-profile';

/**
 * Onboarding and profile editing state.
 *
 * One reducer holds the whole draft, so values survive moving between steps,
 * and the review step always shows exactly what will be saved.
 */

export const STEPS = [
  'personal',
  'education',
  'experience',
  'links',
  'review',
] as const;

export type Step = (typeof STEPS)[number];

/** The profile section each form step edits. */
export const STEP_SECTION: Record<Exclude<Step, 'review'>, ProfileSection> = {
  personal: 'personal',
  education: 'education',
  experience: 'employment',
  links: 'links',
};

export type RecordList = 'education' | 'employment';

export type SaveStatus =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved'; at: string }
  /** Another tab saved a newer profile; this tab's edits were not saved. */
  | { state: 'conflict'; current: UserProfile }
  | { state: 'error'; message: string };

export interface OnboardingState {
  /** False until the user leaves the welcome screen (first run only). */
  started: boolean;
  step: Step;
  draft: ProfileDraft;
  /** Errors from the last validation, keyed by field path. */
  errors: FieldErrors;
  /** Index of the furthest step reached; steps up to it can be revisited. */
  furthest: number;
  /** The last saved profile, or null during first-run onboarding. */
  saved: UserProfile | null;
  /** Unsaved changes since loading or the last save. */
  dirty: boolean;
  /** The record whose editor is open, per list. */
  open: Record<RecordList, string | null>;
  save: SaveStatus;
  /** When a restored draft was last autosaved, until the user moves on. */
  restoredFrom: string | null;
}

type Patch<T> = Partial<Omit<T, 'id'>>;

export type OnboardingAction =
  | { type: 'loaded'; profile: UserProfile }
  | { type: 'start' }
  | { type: 'restored'; stored: StoredDraft; saved: UserProfile | null }
  /** Drops unsaved work: back to the saved profile, or a fresh start. */
  | { type: 'discard' }
  /**
   * Replaces the editable draft with one the user approved from a CV. The
   * saved profile is untouched until the user saves.
   */
  | { type: 'import-cv'; draft: ProfileDraft }
  | { type: 'go'; step: Step }
  | { type: 'advance' }
  | { type: 'set-errors'; errors: FieldErrors }
  | { type: 'patch-personal'; patch: Patch<Omit<PersonalDetails, 'address'>> }
  | { type: 'patch-address'; patch: Patch<Address> }
  | { type: 'patch-links'; patch: Patch<Omit<ProfessionalLinks, 'other'>> }
  | { type: 'add-record'; list: RecordList }
  | { type: 'patch-education'; id: string; patch: Patch<EducationRecord> }
  | { type: 'patch-employment'; id: string; patch: Patch<EmploymentRecord> }
  | { type: 'remove-record'; list: RecordList; id: string }
  | { type: 'open-record'; list: RecordList; id: string | null }
  | { type: 'add-link' }
  | { type: 'patch-link'; id: string; patch: Patch<OtherLink> }
  | { type: 'remove-link'; id: string }
  | { type: 'save-started' }
  | { type: 'save-succeeded'; profile: UserProfile }
  | { type: 'save-failed'; message: string }
  | { type: 'save-conflict'; current: UserProfile };

export function initialOnboardingState(): OnboardingState {
  return {
    started: false,
    step: 'personal',
    draft: emptyDraft(),
    errors: {},
    furthest: 0,
    saved: null,
    dirty: false,
    open: { education: null, employment: null },
    save: { state: 'idle' },
    restoredFrom: null,
  };
}

export function stepIndex(step: Step): number {
  return STEPS.indexOf(step);
}

/** Whether the user may jump straight to a step from the step list. */
export function canVisit(state: OnboardingState, step: Step): boolean {
  return state.saved !== null || stepIndex(step) <= state.furthest;
}

export function onboardingReducer(
  state: OnboardingState,
  action: OnboardingAction,
): OnboardingState {
  switch (action.type) {
    case 'loaded':
      return savedProfileState(action.profile);

    case 'start':
      return { ...state, started: true, step: 'personal' };

    case 'restored': {
      const { stored, saved } = action;
      const base = saved ? savedProfileState(saved) : initialOnboardingState();
      const furthest = saved
        ? STEPS.length - 1
        : Math.min(stored.furthest, STEPS.length - 1);
      const step = STEPS.find((name) => name === stored.step) ?? 'personal';
      return {
        ...base,
        started: true,
        draft: stored.draft,
        step: stepIndex(step) <= furthest ? step : 'personal',
        furthest,
        dirty: true,
        restoredFrom: stored.savedAt,
      };
    }

    case 'import-cv':
      return {
        ...state,
        started: true,
        draft: action.draft,
        dirty: true,
        errors: {},
        restoredFrom: null,
        open: { education: null, employment: null },
        // First run continues through the steps; editing shows the overview.
        step: state.saved ? 'review' : 'personal',
        save: { state: 'idle' },
      };

    case 'discard':
      return state.saved
        ? savedProfileState(state.saved)
        : initialOnboardingState();

    case 'go':
      if (!canVisit(state, action.step)) return state;
      return { ...state, step: action.step, errors: {}, restoredFrom: null };

    case 'advance': {
      const next = Math.min(stepIndex(state.step) + 1, STEPS.length - 1);
      return {
        ...state,
        step: STEPS[next] ?? state.step,
        furthest: Math.max(state.furthest, next),
        errors: {},
        restoredFrom: null,
      };
    }

    case 'set-errors':
      return { ...state, errors: action.errors };

    case 'patch-personal':
      return edit(state, ['personal'], action.patch, (draft) => ({
        ...draft,
        personal: { ...draft.personal, ...action.patch },
      }));

    case 'patch-address':
      return edit(state, ['personal', 'address'], action.patch, (draft) => ({
        ...draft,
        personal: {
          ...draft.personal,
          address: { ...draft.personal.address, ...action.patch },
        },
      }));

    case 'patch-links':
      return edit(state, ['links'], action.patch, (draft) => ({
        ...draft,
        links: { ...draft.links, ...action.patch },
      }));

    case 'add-record': {
      const record =
        action.list === 'education'
          ? newEducationRecord()
          : newEmploymentRecord();
      const draft: ProfileDraft =
        action.list === 'education'
          ? {
              ...state.draft,
              education: [...state.draft.education, record as EducationRecord],
            }
          : {
              ...state.draft,
              employment: [
                ...state.draft.employment,
                record as EmploymentRecord,
              ],
            };
      return {
        ...state,
        draft,
        dirty: true,
        open: { ...state.open, [action.list]: record.id },
      };
    }

    case 'patch-education':
      return edit(state, ['education', action.id], action.patch, (draft) => ({
        ...draft,
        education: draft.education.map((record) =>
          record.id === action.id ? { ...record, ...action.patch } : record,
        ),
      }));

    case 'patch-employment':
      return edit(state, ['employment', action.id], action.patch, (draft) => ({
        ...draft,
        employment: draft.employment.map((record) =>
          record.id === action.id ? { ...record, ...action.patch } : record,
        ),
      }));

    case 'remove-record': {
      const draft: ProfileDraft =
        action.list === 'education'
          ? {
              ...state.draft,
              education: state.draft.education.filter(
                (record) => record.id !== action.id,
              ),
            }
          : {
              ...state.draft,
              employment: state.draft.employment.filter(
                (record) => record.id !== action.id,
              ),
            };
      return {
        ...state,
        draft,
        dirty: true,
        errors: withoutPrefix(state.errors, `${action.list}.${action.id}.`),
        open: {
          ...state.open,
          [action.list]:
            state.open[action.list] === action.id
              ? null
              : state.open[action.list],
        },
      };
    }

    case 'open-record':
      return { ...state, open: { ...state.open, [action.list]: action.id } };

    case 'add-link':
      return {
        ...state,
        dirty: true,
        draft: {
          ...state.draft,
          links: {
            ...state.draft.links,
            other: [...state.draft.links.other, newOtherLink()],
          },
        },
      };

    case 'patch-link':
      return edit(
        state,
        ['links', 'other', action.id],
        action.patch,
        (draft) => ({
          ...draft,
          links: {
            ...draft.links,
            other: draft.links.other.map((link) =>
              link.id === action.id ? { ...link, ...action.patch } : link,
            ),
          },
        }),
      );

    case 'remove-link':
      return {
        ...state,
        dirty: true,
        errors: withoutPrefix(state.errors, `links.other.${action.id}.`),
        draft: {
          ...state.draft,
          links: {
            ...state.draft.links,
            other: state.draft.links.other.filter(
              (link) => link.id !== action.id,
            ),
          },
        },
      };

    case 'save-started':
      return { ...state, save: { state: 'saving' } };

    case 'save-succeeded':
      return {
        ...state,
        saved: action.profile,
        draft: draftFromProfile(action.profile),
        dirty: false,
        furthest: STEPS.length - 1,
        save: { state: 'saved', at: action.profile.metadata.updatedAt },
      };

    case 'save-failed':
      return { ...state, save: { state: 'error', message: action.message } };
    case 'save-conflict':
      return { ...state, save: { state: 'conflict', current: action.current } };
  }
}

/** Editing an existing profile: everything reachable, on the overview. */
function savedProfileState(profile: UserProfile): OnboardingState {
  return {
    ...initialOnboardingState(),
    started: true,
    step: 'review',
    draft: draftFromProfile(profile),
    furthest: STEPS.length - 1,
    saved: profile,
  };
}

/**
 * Applies a draft change, marks the draft dirty and clears the errors of the
 * fields that changed, so messages disappear as the user corrects them.
 */
function edit(
  state: OnboardingState,
  path: string[],
  patch: object,
  apply: (draft: ProfileDraft) => ProfileDraft,
): OnboardingState {
  const errors = { ...state.errors };
  for (const field of Object.keys(patch)) {
    Reflect.deleteProperty(errors, [...path, field].join('.'));
  }
  return {
    ...state,
    draft: apply(state.draft),
    errors,
    dirty: true,
    save: state.save.state === 'error' ? state.save : { state: 'idle' },
  };
}

function withoutPrefix(errors: FieldErrors, prefix: string): FieldErrors {
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => !key.startsWith(prefix)),
  );
}

/** The first step that has an error, for sending the user back to fix it. */
export function firstStepWithError(errors: FieldErrors): Step | null {
  const sections = new Set(Object.keys(errors).map((key) => key.split('.')[0]));
  for (const [step, section] of Object.entries(STEP_SECTION)) {
    if (sections.has(section)) return step as Step;
  }
  return null;
}

/** The first record in a list that has an error, to open its editor. */
export function firstRecordWithError(
  errors: FieldErrors,
  list: RecordList,
): string | null {
  const key = Object.keys(errors).find((k) => k.startsWith(`${list}.`));
  return key?.split('.')[1] ?? null;
}

/** The draft to autosave for the current state. */
export function toStoredDraft(
  state: Pick<OnboardingState, 'draft' | 'step' | 'furthest' | 'saved'>,
  now: Date,
): StoredDraft {
  return {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    savedAt: now.toISOString(),
    basedOn: state.saved?.metadata.updatedAt ?? null,
    step: state.step,
    furthest: state.furthest,
    draft: state.draft,
  };
}

export type DraftDecision = 'restore' | 'discard' | 'keep';

/**
 * What to do with a stored draft, given the saved profile (if any):
 * - restore first-run progress when no profile exists;
 * - restore unsaved edits made to the profile that is still saved;
 * - discard drafts made obsolete by a later save;
 * - keep it untouched when the profile could not be read, to decide later.
 */
export function planDraftRestore(
  draft: StoredDraft,
  profile:
    | { status: 'loaded'; updatedAt: string }
    | { status: 'empty' | 'invalid' | 'error' },
): DraftDecision {
  if (profile.status === 'error') return 'keep';
  if (profile.status !== 'loaded') return 'restore';
  return draft.basedOn === profile.updatedAt ? 'restore' : 'discard';
}
