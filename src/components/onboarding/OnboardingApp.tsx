import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, ShieldCheck } from 'lucide-react';
import { validateDraft, validateSection } from '@/domain/profile-schema';
import { profileFromDraft } from '@/domain/user-profile';
import {
  browserProfileStore,
  type LoadResult,
  type ProfileStore,
} from '@/storage/profile-store';
import { BrandMark, Icon } from '@/components/ui/icons';
import { PrimaryButton, SecondaryButton } from '@/components/ui/primitives';
import { formatSavedAt } from './format';
import { LinksStep } from './LinksStep';
import {
  STEPS,
  STEP_SECTION,
  canVisit,
  firstRecordWithError,
  firstStepWithError,
  initialOnboardingState,
  onboardingReducer,
  stepIndex,
  type OnboardingState,
  type Step,
} from './onboarding-state';
import { PersonalStep } from './PersonalStep';
import { EducationStep, ExperienceStep } from './RecordSteps';
import { ReviewStep } from './ReviewStep';

const STEP_COPY: Record<Step, { label: string; title: string; intro: string }> =
  {
    personal: {
      label: 'Personal details',
      title: 'Personal details',
      intro:
        'Your name, contact details and address, as you give them on applications.',
    },
    education: {
      label: 'Education',
      title: 'Education',
      intro:
        'Qualifications you want employers to see. Add as many as you need.',
    },
    experience: {
      label: 'Experience',
      title: 'Experience',
      intro: 'Jobs, internships and volunteering, in any order.',
    },
    links: {
      label: 'Links',
      title: 'Professional links',
      intro:
        'All optional. Places where employers can see more of you and your work.',
    },
    review: {
      label: 'Review',
      title: 'Review your profile',
      intro: 'Check everything before saving. You can change any of it later.',
    },
  };

interface OnboardingAppProps {
  store?: ProfileStore;
  /** Clock for save timestamps; injectable for tests. */
  now?: () => Date;
}

/**
 * First-run onboarding and, once a profile is saved, profile management.
 * Runs in the extension's options page, opened in a full tab.
 */
export function OnboardingApp({
  store = browserProfileStore,
  now = () => new Date(),
}: OnboardingAppProps) {
  const [state, dispatch] = useReducer(
    onboardingReducer,
    undefined,
    initialOnboardingState,
  );
  const [load, setLoad] = useState<LoadResult | null>(null);
  const main = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<'error' | 'heading' | null>(null);

  useEffect(() => {
    let active = true;
    void store.load().then((result) => {
      if (!active) return;
      setLoad(result);
      if (result.status === 'loaded') {
        dispatch({ type: 'loaded', profile: result.profile });
      }
    });
    return () => {
      active = false;
    };
  }, [store]);

  // Move focus after the render that follows navigation or validation.
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === 'heading') {
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    } else if (target === 'error') {
      main.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    }
  });

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!state.dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [state.dirty]);

  const editing = state.saved !== null;
  useEffect(() => {
    document.title = editing
      ? 'Your profile · ApplyKit'
      : 'Set up your profile · ApplyKit';
  }, [editing]);

  const go = (step: Step) => {
    pendingFocus.current = 'heading';
    dispatch({ type: 'go', step });
  };

  const showErrors = (errors: Record<string, string>) => {
    const step = firstStepWithError(errors);
    if (step && step !== state.step) dispatch({ type: 'go', step });
    dispatch({ type: 'set-errors', errors });
    for (const list of ['education', 'employment'] as const) {
      const id = firstRecordWithError(errors, list);
      if (id) dispatch({ type: 'open-record', list, id });
    }
    pendingFocus.current = 'error';
  };

  const save = async () => {
    const result = validateDraft(state.draft);
    if (!result.ok) {
      showErrors(result.errors);
      return;
    }
    dispatch({ type: 'save-started' });
    const profile = profileFromDraft(
      result.draft,
      state.saved?.metadata ?? null,
      now(),
    );
    const outcome = await store.save(profile);
    if (outcome.status === 'saved') {
      dispatch({ type: 'save-succeeded', profile: outcome.profile });
    } else {
      dispatch({ type: 'save-failed', message: outcome.message });
    }
  };

  const proceed = () => {
    if (state.step === 'review') {
      void save();
      return;
    }
    const errors = validateSection(STEP_SECTION[state.step], state.draft);
    if (Object.keys(errors).length > 0) {
      showErrors(errors);
      return;
    }
    pendingFocus.current = 'heading';
    dispatch({ type: 'advance' });
  };

  const copy = STEP_COPY[state.step];
  const index = stepIndex(state.step);

  return (
    <div className="min-h-screen bg-canvas text-ink md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      <StepRail state={state} editing={editing} onGo={go} />

      <main ref={main} className="flex min-h-screen flex-col">
        <div className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-8 pb-10 md:px-10 md:pt-14">
          <p className="mb-2 text-xs text-ink-3 md:hidden">
            Step {index + 1} of {STEPS.length}
          </p>
          <h1
            ref={heading}
            tabIndex={-1}
            className="text-xl font-medium tracking-[-0.01em] outline-none"
          >
            {editing && state.step === 'review' ? 'Your profile' : copy.title}
          </h1>
          <p className="mt-1 max-w-[56ch] text-ink-2">
            {editing && state.step === 'review' && state.saved
              ? `Last saved ${formatSavedAt(state.saved.metadata.updatedAt)}. Edit any section, then save your changes.`
              : copy.intro}
          </p>

          <div className="mt-6 space-y-3 empty:hidden">
            {load?.status === 'invalid' && (
              <Banner tone="warning">
                ApplyKit found a saved profile it could not read, so you are
                starting fresh. The unreadable data is kept as a backup when you
                save.
              </Banner>
            )}
            {load?.status === 'error' && (
              <Banner tone="danger">{load.message}</Banner>
            )}
            {state.save.state === 'error' && (
              <Banner tone="danger">{state.save.message}</Banner>
            )}
          </div>

          <div className="mt-8">
            {load === null ? (
              <p className="text-ink-3">Loading your profile…</p>
            ) : (
              <StepBody state={state} dispatch={dispatch} />
            )}
          </div>
        </div>

        {load !== null && (
          <ActionBar
            state={state}
            editing={editing}
            onBack={() => {
              const previous = STEPS[index - 1];
              if (previous) go(previous);
            }}
            onProceed={proceed}
          />
        )}
      </main>
    </div>
  );
}

function StepBody({
  state,
  dispatch,
}: {
  state: OnboardingState;
  dispatch: React.Dispatch<Parameters<typeof onboardingReducer>[1]>;
}) {
  switch (state.step) {
    case 'personal':
      return <PersonalStep state={state} dispatch={dispatch} />;
    case 'education':
      return <EducationStep state={state} dispatch={dispatch} />;
    case 'experience':
      return <ExperienceStep state={state} dispatch={dispatch} />;
    case 'links':
      return <LinksStep state={state} dispatch={dispatch} />;
    case 'review':
      return <ReviewStep state={state} dispatch={dispatch} />;
  }
}

function StepRail({
  state,
  editing,
  onGo,
}: {
  state: OnboardingState;
  editing: boolean;
  onGo: (step: Step) => void;
}) {
  const sectionsWithErrors = new Set(
    Object.keys(state.errors).map((key) => key.split('.')[0]),
  );

  return (
    <aside className="flex items-center gap-2 border-b border-line px-5 py-3 md:sticky md:top-0 md:h-screen md:flex-col md:items-stretch md:gap-0 md:border-r md:border-b-0 md:bg-sunken/40 md:px-4 md:py-5">
      <div className="flex items-center gap-2 md:px-2">
        <BrandMark />
        <span className="font-medium">ApplyKit</span>
      </div>

      <div className="hidden md:mt-7 md:block md:px-2">
        <p className="text-base font-medium tracking-[-0.01em]">
          {editing ? 'Your profile' : 'Set up your profile'}
        </p>
        <p className="mt-0.5 text-xs text-ink-3">
          {editing
            ? 'Saved in this browser'
            : `Step ${String(stepIndex(state.step) + 1)} of ${String(STEPS.length)}`}
        </p>
      </div>

      <nav aria-label="Profile sections" className="hidden md:mt-4 md:block">
        <ol className="space-y-0.5">
          {STEPS.map((step, i) => {
            const current = step === state.step;
            const reachable = canVisit(state, step);
            const section = step === 'review' ? null : STEP_SECTION[step];
            const invalid = section !== null && sectionsWithErrors.has(section);
            const complete =
              !current && (editing || i < state.furthest) && step !== 'review';
            return (
              <li key={step}>
                <button
                  type="button"
                  disabled={!reachable}
                  aria-current={current ? 'step' : undefined}
                  onClick={() => {
                    onGo(step);
                  }}
                  className={`flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left transition-colors duration-100 disabled:text-ink-3 ${
                    current
                      ? 'bg-hover font-medium text-ink'
                      : 'text-ink-2 enabled:hover:bg-hover/70 enabled:hover:text-ink'
                  }`}
                >
                  <StepMarker
                    state={
                      invalid
                        ? 'error'
                        : current
                          ? 'current'
                          : complete
                            ? 'complete'
                            : 'upcoming'
                    }
                  />
                  {STEP_COPY[step].label}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <p className="ml-auto text-xs text-ink-3 md:hidden">
        {STEP_COPY[state.step].label}
      </p>

      <p className="hidden md:mt-auto md:flex md:items-start md:gap-2 md:px-2 md:text-xs md:text-ink-3">
        <Icon icon={ShieldCheck} size={14} className="mt-px shrink-0" />
        Stored only in this browser. ApplyKit never uploads your profile.
      </p>
    </aside>
  );
}

function StepMarker({
  state,
}: {
  state: 'current' | 'complete' | 'upcoming' | 'error';
}) {
  if (state === 'complete') {
    return <Icon icon={Check} size={14} className="shrink-0 text-ink-2" />;
  }
  if (state === 'error') {
    return (
      <Icon icon={CircleAlert} size={14} className="shrink-0 text-danger" />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex size-3.5 shrink-0 items-center justify-center rounded-full border ${
        state === 'current' ? 'border-accent' : 'border-line-strong'
      }`}
    >
      {state === 'current' && (
        <span className="size-1.5 rounded-full bg-accent" />
      )}
    </span>
  );
}

function ActionBar({
  state,
  editing,
  onBack,
  onProceed,
}: {
  state: OnboardingState;
  editing: boolean;
  onBack: () => void;
  onProceed: () => void;
}) {
  const reviewing = state.step === 'review';
  const saving = state.save.state === 'saving';
  const upToDate = editing && !state.dirty;

  let primary = 'Continue';
  if (reviewing) {
    primary = saving
      ? 'Saving…'
      : editing
        ? upToDate
          ? 'Saved'
          : 'Save changes'
        : 'Save profile';
  }

  return (
    <div className="sticky bottom-0 border-t border-line bg-canvas/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-14 w-full max-w-[640px] items-center gap-3 px-5 md:px-10">
        {stepIndex(state.step) > 0 && (
          <SecondaryButton onClick={onBack}>Back</SecondaryButton>
        )}
        <span className="flex-1" />
        <SaveStatus state={state} />
        <PrimaryButton
          onClick={onProceed}
          disabled={saving || (reviewing && upToDate)}
          className="min-w-[96px]"
        >
          {primary}
        </PrimaryButton>
      </div>
    </div>
  );
}

function SaveStatus({ state }: { state: OnboardingState }) {
  if (state.save.state === 'saved' && !state.dirty) {
    return (
      <span
        role="status"
        className="flex items-center gap-1.5 text-xs text-ink-2"
      >
        <Icon icon={Check} size={14} className="text-success" />
        Profile saved
      </span>
    );
  }
  if (state.dirty && state.saved) {
    return (
      <span role="status" className="text-xs text-ink-3">
        Unsaved changes
      </span>
    );
  }
  return <span role="status" className="sr-only" />;
}

function Banner({
  tone,
  children,
}: {
  tone: 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-md px-3.5 py-3 text-sm ${
        tone === 'danger'
          ? 'bg-danger-soft text-danger'
          : 'bg-warning-soft text-warning'
      }`}
    >
      <Icon icon={CircleAlert} size={16} className="mt-px shrink-0" />
      <p>{children}</p>
    </div>
  );
}
