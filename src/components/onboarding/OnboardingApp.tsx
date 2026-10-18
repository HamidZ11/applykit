import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  CircleAlert,
  FileUp,
  History,
  Info,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import {
  savedProfileIssues,
  validateDraft,
  validateSection,
} from '@/domain/profile-schema';
import { profileFromDraft, type UserProfile } from '@/domain/user-profile';
import {
  browserProfileStore,
  type LoadResult,
  type ProfileStore,
} from '@/storage/profile-store';
import {
  browserAnswersStore,
  type AnswersStore,
} from '@/storage/answers-store';
import { BrandMark, Icon } from '@/components/ui/icons';
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/primitives';
import { readCv, type CvFile, type CvReadResult } from '@/cv/read';
import type { SettingsStore } from '@/storage/settings-store';
import type { AiSettingsClient } from '@/ai/settings-client';
import { AiSettingsView } from './AiSettingsView';
import { AnswersView, type AnswerDrafts } from './AnswersView';
import { CvImport } from './CvImport';
import { DiagnosticsSetting } from './DiagnosticsSetting';
import { DiversityView } from './DiversityView';
import type { DiversityAnswers } from '@/domain/diversity';
import type { DiversityStore } from '@/storage/diversity-store';
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
  planDraftRestore,
  stepIndex,
  type OnboardingState,
  type Step,
} from './onboarding-state';
import { PersonalStep } from './PersonalStep';
import { EducationStep, ExperienceStep } from './RecordSteps';
import { ReviewStep } from './ReviewStep';
import { useDraftAutosave, type DraftStatus } from './useDraftAutosave';
import { WelcomeScreen } from './WelcomeScreen';

const STEP_COPY: Record<Step, { label: string; title: string; intro: string }> =
  {
    personal: {
      label: 'Personal details',
      title: 'Personal details',
      intro:
        'The details ApplyKit can reuse when applications ask for your contact information.',
    },
    education: {
      label: 'Education',
      title: 'Education',
      intro:
        "Add your qualifications once, so you don't need to enter them on every application.",
    },
    experience: {
      label: 'Experience',
      title: 'Experience',
      intro:
        'Keep your work history ready for applications that ask about previous roles.',
    },
    links: {
      label: 'Links',
      title: 'Professional links',
      intro:
        'Optional. Save your portfolio and professional profiles so they are ready to fill.',
    },
    review: {
      label: 'Review',
      title: 'Review your profile',
      intro: 'Check everything before saving. You can change any of it later.',
    },
  };

const systemClock = () => new Date();

/**
 * Sections of the page saved apart from the profile, each with its own
 * address so the panel can link straight to it.
 */
type Section = 'answers' | 'diversity' | 'ai';

const SECTIONS: readonly {
  section: Section;
  label: string;
  short: string;
  icon: LucideIcon;
}[] = [
  {
    section: 'answers',
    label: 'Application answers',
    short: 'Answers',
    icon: MessageSquareText,
  },
  {
    section: 'diversity',
    label: 'Diversity & Inclusion',
    short: 'Diversity',
    icon: UsersRound,
  },
  { section: 'ai', label: 'AI Assistant', short: 'AI', icon: Sparkles },
];

function sectionFromHash(hash: string): Section | null {
  return SECTIONS.find((s) => `#${s.section}` === hash)?.section ?? null;
}

interface OnboardingAppProps {
  store?: ProfileStore;
  answersStore?: AnswersStore;
  /** ApplyKit's own preferences; injectable for tests. */
  settingsStore?: SettingsStore;
  /** Saved diversity preferences; injectable for tests. */
  diversityStore?: DiversityStore;
  /** The AI settings' connection to the background; injectable for tests. */
  aiClient?: AiSettingsClient;
  /** Reads a CV file; injectable for tests. */
  readCvFile?: (file: CvFile) => Promise<CvReadResult>;
  /** Clock for save timestamps; injectable for tests. */
  now?: () => Date;
}

/**
 * First-run onboarding and, once a profile is saved, profile management.
 * Runs in the extension's options page, opened in a full tab.
 *
 * First run: welcome, then the five steps. Saved profile: straight to its
 * overview. Unsaved work is autosaved as a separate draft and restored when
 * the page reopens.
 */
export function OnboardingApp({
  store = browserProfileStore,
  answersStore = browserAnswersStore,
  settingsStore,
  diversityStore,
  aiClient,
  readCvFile = readCv,
  now = systemClock,
}: OnboardingAppProps) {
  const [state, dispatch] = useReducer(
    onboardingReducer,
    undefined,
    initialOnboardingState,
  );
  const [load, setLoad] = useState<LoadResult | null>(null);
  /** Bumped by "Try again" to read stored data again. */
  const [attempt, setAttempt] = useState(0);
  /** Showing the CV import screen instead of a step. */
  const [importing, setImporting] = useState(false);
  /**
   * Showing a section saved apart from the profile instead of the profile;
   * the panel links straight to one with its address ("#answers").
   */
  const [section, setSection] = useState<Section | null>(() =>
    sectionFromHash(window.location.hash),
  );
  /** Unsaved diversity answers, kept while the user moves around the page. */
  const [diversityDraft, setDiversityDraft] = useState<DiversityAnswers | null>(
    null,
  );
  /** Unsaved answer edits, kept while the user moves around the page. */
  const [answerDrafts, setAnswerDrafts] = useState<AnswerDrafts>({});
  const answersDirty =
    Object.keys(answerDrafts).length > 0 || diversityDraft !== null;
  useEffect(() => {
    if (!answersDirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [answersDirty]);
  /** How many CV details were just added, until the user moves on. */
  const [imported, setImported] = useState<number | null>(null);
  const main = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<'error' | 'heading' | null>(null);
  const autosave = useDraftAutosave({
    state,
    store,
    now,
    // Never write a draft before stored data has been read successfully:
    // it could replace unsaved work that is still there.
    enabled: load !== null && load.status !== 'error',
  });

  useEffect(() => {
    let active = true;
    void Promise.all([store.load(), store.loadDraft()]).then(
      ([profile, draft]) => {
        if (!active) return;
        const saved = profile.status === 'loaded' ? profile.profile : null;
        if (saved) dispatch({ type: 'loaded', profile: saved });
        if (draft.status === 'loaded') {
          const decision = planDraftRestore(profile);
          if (decision === 'restore') {
            dispatch({
              type: 'restored',
              stored: draft.draft,
              saved,
              basedOn: draft.draft.basedOn,
            });
          }
        }
        setLoad(
          draft.status === 'error' && profile.status !== 'error'
            ? { status: 'error', message: DRAFT_READ_ERROR }
            : profile,
        );
      },
    );
    return () => {
      active = false;
    };
  }, [store, attempt]);

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

  // Warn before leaving only when changes are not yet in the draft.
  const { unpersisted } = autosave;
  useEffect(() => {
    if (!state.dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (unpersisted()) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [state.dirty, unpersisted]);

  const editing = state.saved !== null;
  useEffect(() => {
    document.title = editing
      ? 'Your profile · ApplyKit'
      : 'Set up your profile · ApplyKit';
  }, [editing]);

  const go = (step: Step) => {
    pendingFocus.current = 'heading';
    setImporting(false);
    setSection(null);
    setImported(null);
    dispatch({ type: 'go', step });
  };

  const applyImport = (draft: typeof state.draft, changes: number) => {
    pendingFocus.current = 'heading';
    dispatch({ type: 'import-cv', draft });
    setImporting(false);
    setImported(changes);
  };

  const discard = () => {
    pendingFocus.current = 'heading';
    dispatch({ type: 'discard' });
    void store.clearDraft();
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

  /**
   * Saves the draft over the version the edits started from, or, when the
   * user chose to keep their version after a conflict, over `replacing`.
   */
  const save = async (replacing?: UserProfile) => {
    const result = validateDraft(state.draft);
    if (!result.ok) {
      showErrors(result.errors);
      return;
    }
    dispatch({ type: 'save-started' });
    const previous = replacing ?? state.saved;
    const profile = profileFromDraft(
      result.draft,
      previous?.metadata ?? null,
      now(),
    );
    // The version this edit started from, so a newer save made in another
    // tab is never overwritten silently.
    const outcome = await store.save(
      profile,
      replacing ? replacing.metadata.updatedAt : state.basedOn,
    );
    if (outcome.status === 'saved') {
      dispatch({ type: 'save-succeeded', profile: outcome.profile });
    } else if (outcome.status === 'conflict') {
      dispatch({ type: 'save-conflict', current: outcome.current });
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
    setImported(null);
    dispatch({ type: 'advance' });
  };

  // Local storage answers almost at once; show the page only when it has.
  if (load === null) return <div className="min-h-screen bg-canvas" />;

  if (load.status === 'error') {
    return (
      <LoadFailed
        message={load.message}
        onRetry={() => {
          setLoad(null);
          setAttempt((count) => count + 1);
        }}
      />
    );
  }

  const showSection = (next: Section) => {
    pendingFocus.current = 'heading';
    setImporting(false);
    setImported(null);
    setSection(next);
  };
  const rail = (
    <StepRail
      state={state}
      editing={editing}
      importing={importing}
      section={section}
      settingsStore={settingsStore}
      onGo={go}
      onImport={() => {
        setImported(null);
        setSection(null);
        setImporting(true);
      }}
      onSection={showSection}
    />
  );

  if (section === 'ai') {
    return (
      <div className="min-h-screen bg-canvas text-ink md:grid md:grid-cols-[248px_minmax(0,1fr)]">
        {rail}
        <main ref={main} className="flex min-h-screen flex-col">
          <AiSettingsView
            {...(aiClient ? { client: aiClient } : {})}
            heading={heading}
          />
        </main>
      </div>
    );
  }

  if (section === 'diversity') {
    return (
      <div className="min-h-screen bg-canvas text-ink md:grid md:grid-cols-[248px_minmax(0,1fr)]">
        {rail}
        <main ref={main} className="flex min-h-screen flex-col">
          <DiversityView
            {...(diversityStore ? { store: diversityStore } : {})}
            now={now}
            heading={heading}
            draft={diversityDraft}
            onDraftChange={setDiversityDraft}
          />
        </main>
      </div>
    );
  }

  // Answers are saved apart from the profile, so they can be edited
  // before a profile exists.
  if (section === 'answers') {
    return (
      <div className="min-h-screen bg-canvas text-ink md:grid md:grid-cols-[248px_minmax(0,1fr)]">
        {rail}
        <main ref={main} className="flex min-h-screen flex-col">
          <AnswersView
            store={answersStore}
            now={now}
            heading={heading}
            drafts={answerDrafts}
            onDraftsChange={setAnswerDrafts}
          />
        </main>
      </div>
    );
  }

  if (!state.started) {
    return (
      <WelcomeScreen
        notice={load.status === 'invalid' ? <InvalidNotice /> : undefined}
        onStart={() => {
          pendingFocus.current = 'heading';
          dispatch({ type: 'start' });
        }}
        onImport={() => {
          dispatch({ type: 'start' });
          setImporting(true);
        }}
      />
    );
  }

  const copy = STEP_COPY[state.step];
  const index = stepIndex(state.step);
  // A saved profile stays readable when today's rules are stricter than
  // the ones it was saved under; say so rather than hiding it.
  const savedIssues =
    state.saved && !state.dirty
      ? Object.keys(savedProfileIssues(state.saved)).length
      : 0;
  const unmatchedCountry =
    load.status === 'loaded' && state.saved?.personal.address.country === ''
      ? load.unmatchedCountry
      : null;

  return (
    <div className="min-h-screen bg-canvas text-ink md:grid md:grid-cols-[248px_minmax(0,1fr)]">
      {rail}

      <main ref={main} className="flex min-h-screen flex-col">
        {importing ? (
          <CvImport
            draft={state.draft}
            editing={editing}
            read={readCvFile}
            onApply={applyImport}
            onCancel={() => {
              pendingFocus.current = 'heading';
              setImporting(false);
            }}
          />
        ) : (
          <>
            <div className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-8 pb-16 md:px-10 md:pt-[clamp(32px,6vh,56px)]">
              <p className="mb-2 text-xs text-ink-3 md:hidden">
                Step {index + 1} of {STEPS.length}
              </p>
              <h1
                ref={heading}
                tabIndex={-1}
                className="text-xl font-medium tracking-[-0.01em] outline-none"
              >
                {editing && state.step === 'review'
                  ? 'Your profile'
                  : copy.title}
              </h1>
              <p className="mt-1 max-w-[56ch] text-ink-2">
                {editing && state.step === 'review' && state.saved
                  ? `Last saved ${formatSavedAt(state.saved.metadata.updatedAt)}. Edit any section, then save your changes.`
                  : copy.intro}
              </p>

              <div className="mt-6 space-y-3 empty:hidden">
                {imported !== null && (
                  <Banner tone="info">
                    Added{' '}
                    {imported === 1
                      ? '1 detail'
                      : `${String(imported)} details`}{' '}
                    from your CV. Check each step, then{' '}
                    {editing ? 'save your changes' : 'save your profile'}.
                  </Banner>
                )}
                {state.saved &&
                  state.dirty &&
                  state.basedOn !== state.saved.metadata.updatedAt && (
                    <Banner tone="warning">
                      These unsaved changes were started before your profile was
                      last saved (
                      {formatSavedAt(state.saved.metadata.updatedAt)}
                      ). When you save, ApplyKit asks which version to keep.
                    </Banner>
                  )}
                {state.restoredFrom && (
                  <RestoredNotice
                    at={state.restoredFrom}
                    editing={editing}
                    onStartOver={discard}
                  />
                )}
                {savedIssues > 0 && unmatchedCountry === null && (
                  <Banner tone="warning">
                    Some saved details no longer pass ApplyKit’s checks (
                    {savedIssues === 1
                      ? '1 detail'
                      : `${String(savedIssues)} details`}
                    ). Autofill still uses them. Review your profile, then save
                    to see what to change.
                  </Banner>
                )}
                {unmatchedCountry !== null && (
                  <Banner tone="warning">
                    ApplyKit now uses a standard country list and could not
                    match “{unmatchedCountry}”. Choose your country in Personal
                    details, then save.
                  </Banner>
                )}
                {state.save.state === 'error' && (
                  <Banner tone="danger">{state.save.message}</Banner>
                )}
                {state.save.state === 'conflict' && (
                  <SaveConflict
                    current={state.save.current}
                    onLoadSaved={(current) => {
                      void store.clearDraft();
                      dispatch({ type: 'loaded', profile: current });
                    }}
                    onSaveMine={(current) => {
                      void save(current);
                    }}
                  />
                )}
              </div>

              <div className="mt-8">
                <StepBody state={state} dispatch={dispatch} />
              </div>
            </div>

            <ActionBar
              state={state}
              editing={editing}
              draftStatus={autosave.status}
              onBack={() => {
                const previous = STEPS[index - 1];
                if (previous) go(previous);
              }}
              onProceed={proceed}
              onDiscard={discard}
            />
          </>
        )}
      </main>
    </div>
  );
}

const DRAFT_READ_ERROR =
  'ApplyKit could not read your unsaved changes from this browser.';

/**
 * Stored data could not be read. Nothing is offered that could overwrite
 * it: no onboarding, no autosave, until a retry succeeds.
 */
function LoadFailed({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-ink">
      <div className="w-full max-w-[480px]">
        <Banner tone="danger">{message}</Banner>
        <p className="mt-4 text-ink-2">
          Nothing has been changed. Try again, or close this tab and reopen it
          later.
        </p>
        <PrimaryButton className="mt-6" onClick={onRetry}>
          Try again
        </PrimaryButton>
      </div>
    </main>
  );
}

/** A stored profile that could not be read, shown on the welcome screen. */
function InvalidNotice() {
  return (
    <Banner tone="warning">
      ApplyKit found a saved profile it could not read, so you are starting
      fresh. The unreadable data is kept as a backup when you save.
    </Banner>
  );
}

/**
 * Explains that unsaved work came back. During first run it also offers to
 * start over; when editing, discarding lives in the action bar instead.
 */
function RestoredNotice({
  at,
  editing,
  onStartOver,
}: {
  at: string;
  editing: boolean;
  onStartOver: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md bg-sunken px-3.5 py-2.5 text-sm text-ink-2"
    >
      <Icon icon={History} size={16} className="shrink-0 text-ink-3" />
      <p className="min-w-0 flex-1">
        {editing
          ? `Restored changes you had not saved, from ${formatSavedAt(at)}.`
          : `Welcome back. Your progress from ${formatSavedAt(at)} is restored.`}
      </p>
      {!editing &&
        (confirming ? (
          <span className="flex items-center gap-1 text-xs">
            Clear everything entered?
            <GhostButton
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </GhostButton>
            <GhostButton tone="danger" onClick={onStartOver}>
              Start over
            </GhostButton>
          </span>
        ) : (
          <GhostButton
            onClick={() => {
              setConfirming(true);
            }}
          >
            Start over
          </GhostButton>
        ))}
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
  importing,
  section,
  settingsStore,
  onGo,
  onImport,
  onSection,
}: {
  state: OnboardingState;
  editing: boolean;
  importing: boolean;
  section: Section | null;
  settingsStore: SettingsStore | undefined;
  onGo: (step: Step) => void;
  onImport: () => void;
  onSection: (section: Section) => void;
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
            const current =
              !importing && section === null && step === state.step;
            const reachable = canVisit(state, step);
            const errorKey = step === 'review' ? null : STEP_SECTION[step];
            const invalid =
              errorKey !== null && sectionsWithErrors.has(errorKey);
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

      <div className="hidden md:mt-3 md:block md:border-t md:border-line md:pt-3">
        <button
          type="button"
          onClick={onImport}
          aria-current={importing ? 'page' : undefined}
          className={`flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left transition-colors duration-100 ${
            importing
              ? 'bg-hover font-medium text-ink'
              : 'text-ink-2 hover:bg-hover/70 hover:text-ink'
          }`}
        >
          <Icon icon={FileUp} size={14} className="shrink-0" />
          Import from CV
        </button>
        {SECTIONS.map((link) => (
          <button
            key={link.section}
            type="button"
            onClick={() => {
              onSection(link.section);
            }}
            aria-current={section === link.section ? 'page' : undefined}
            className={`mt-0.5 flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left transition-colors duration-100 ${
              section === link.section
                ? 'bg-hover font-medium text-ink'
                : 'text-ink-2 hover:bg-hover/70 hover:text-ink'
            }`}
          >
            <Icon icon={link.icon} size={14} className="shrink-0" />
            {link.label}
          </button>
        ))}
      </div>

      <p className="ml-auto text-xs text-ink-3 md:hidden">
        {section
          ? SECTIONS.find((link) => link.section === section)?.label
          : importing
            ? 'Import from CV'
            : STEP_COPY[state.step].label}
      </p>
      {!importing && section === null && (
        <button
          type="button"
          onClick={onImport}
          className="text-xs font-medium text-accent md:hidden"
        >
          Import CV
        </button>
      )}
      {SECTIONS.filter((link) => link.section !== section).map((link) => (
        <button
          key={link.section}
          type="button"
          onClick={() => {
            onSection(link.section);
          }}
          className="text-xs font-medium text-accent md:hidden"
        >
          {link.short}
        </button>
      ))}

      <div className="hidden md:mt-auto md:block md:space-y-4">
        <DiagnosticsSetting
          {...(settingsStore ? { store: settingsStore } : {})}
        />
        <p className="flex items-start gap-2 px-2 text-xs text-ink-3">
          <Icon icon={ShieldCheck} size={14} className="mt-px shrink-0" />
          Stored only in this browser. Nothing is sent anywhere unless you
          choose to draft with AI.
        </p>
      </div>
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
  draftStatus,
  onBack,
  onProceed,
  onDiscard,
}: {
  state: OnboardingState;
  editing: boolean;
  draftStatus: DraftStatus;
  onBack: () => void;
  onProceed: () => void;
  onDiscard: () => void;
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
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
        {editing && state.dirty && !saving && (
          <span className="flex items-center gap-1 text-xs text-ink-2">
            {confirmingDiscard ? (
              <>
                Discard unsaved changes?
                <GhostButton
                  onClick={() => {
                    setConfirmingDiscard(false);
                  }}
                >
                  Keep editing
                </GhostButton>
                <GhostButton
                  tone="danger"
                  onClick={() => {
                    setConfirmingDiscard(false);
                    onDiscard();
                  }}
                >
                  Discard
                </GhostButton>
              </>
            ) : (
              <GhostButton
                onClick={() => {
                  setConfirmingDiscard(true);
                }}
              >
                Discard changes
              </GhostButton>
            )}
          </span>
        )}
        {!confirmingDiscard && (
          <SaveStatus state={state} draftStatus={draftStatus} />
        )}
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

function SaveStatus({
  state,
  draftStatus,
}: {
  state: OnboardingState;
  draftStatus: DraftStatus;
}) {
  if (state.dirty && draftStatus === 'failed') {
    return (
      <span role="status" className="text-xs text-danger">
        Could not keep a draft
      </span>
    );
  }
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
  if (state.dirty && draftStatus === 'saved') {
    return (
      <span role="status" className="text-xs text-ink-3">
        Progress saved in this browser
      </span>
    );
  }
  return <span role="status" className="sr-only" />;
}

/**
 * Another tab saved the profile after this one loaded it. This tab's edits
 * stay on the page; replacing them with the saved version is the user's
 * explicit choice, never automatic, and nothing is merged.
 */
function SaveConflict({
  current,
  onLoadSaved,
  onSaveMine,
}: {
  current: UserProfile;
  onLoadSaved: (current: UserProfile) => void;
  onSaveMine: (current: UserProfile) => void;
}) {
  return (
    <Banner tone="warning">
      <span className="block">
        Your profile was saved in another tab (
        {formatSavedAt(current.metadata.updatedAt)}) after you opened it here,
        so these changes were not saved. Your edits on this page are kept.
      </span>
      <span className="mt-2 block">
        <button
          type="button"
          onClick={() => {
            onLoadSaved(current);
          }}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          Discard my edits and load the saved version
        </button>
        <span aria-hidden> · </span>
        <button
          type="button"
          onClick={() => {
            onSaveMine(current);
          }}
          className="font-medium underline underline-offset-2 hover:no-underline"
        >
          Save my version instead
        </button>
      </span>
    </Banner>
  );
}

function Banner({
  tone,
  children,
}: {
  tone: 'warning' | 'danger' | 'info';
  children: ReactNode;
}) {
  const style = {
    danger: 'bg-danger-soft text-danger',
    warning: 'bg-warning-soft text-warning',
    info: 'bg-sunken text-ink-2',
  }[tone];
  return (
    <div
      role={tone === 'info' ? 'status' : 'alert'}
      className={`flex items-start gap-2.5 rounded-md px-3.5 py-3 text-sm ${style}`}
    >
      <Icon
        icon={tone === 'info' ? Info : CircleAlert}
        size={16}
        className="mt-px shrink-0"
      />
      <p>{children}</p>
    </div>
  );
}
