import { useEffect, useId, useRef, useState } from 'react';
import {
  CATEGORY_TITLE,
  CHOICES,
  DIVERSITY_CATEGORIES,
  ETHNIC_GROUPS,
  PREFER_NOT_TO_SAY,
  type DiversityAnswers,
  type DiversityCategory,
} from '@/domain/diversity';
import {
  browserDiversityStore,
  type DiversityLoadResult,
  type DiversityStore,
} from '@/storage/diversity-store';
import { GhostButton, PrimaryButton } from '@/components/ui/primitives';
import { CONTROL, CONTROL_STATE, FieldGrid } from './fields';
import { Banner, Notice, Problem, SectionShell } from './page-parts';

/**
 * Optional answers to common equal-opportunities monitoring questions
 * (ADR 0018). Every answer is optional; reuse on application forms is off
 * until the user turns it on, and saved apart from the answers. Nothing
 * here shows a saved answer anywhere but in its own list.
 */

const NEWER =
  'Your diversity preferences were saved by a newer version of ApplyKit, so this version cannot show or change them. They are kept exactly as they are. Update ApplyKit to edit them.';

const INTRO =
  'Save optional responses to common diversity questions so you don’t have to enter them repeatedly. Every answer is optional and stays in this browser. Employers offer different choices, so some questions will still need you.';

const systemClock = () => new Date();

export function DiversityView({
  store = browserDiversityStore,
  now = systemClock,
  heading,
  draft: keptDraft,
  onDraftChange,
}: {
  store?: DiversityStore;
  now?: () => Date;
  /** The page heading, which the profile page focuses on opening. */
  heading?: React.RefObject<HTMLHeadingElement | null>;
  /** Unsaved answers, when the page keeps them across views. */
  draft?: DiversityAnswers | null;
  onDraftChange?: (draft: DiversityAnswers | null) => void;
}) {
  const [load, setLoad] = useState<DiversityLoadResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [ownDraft, setOwnDraft] = useState<DiversityAnswers | null>(null);
  const draft = keptDraft === undefined ? ownDraft : keptDraft;
  const setDraft = onDraftChange ?? setOwnDraft;
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [confirmingClear, setConfirmingClear] = useState(false);
  const ownHeading = useRef<HTMLHeadingElement | null>(null);
  const headingRef = heading ?? ownHeading;

  useEffect(() => {
    let active = true;
    void store.load().then((result) => {
      if (active) setLoad(result);
    });
    return () => {
      active = false;
    };
  }, [store, attempt]);

  const clearAll = async () => {
    setBusy(true);
    setProblem(null);
    const cleared = await store.clearAll();
    setBusy(false);
    setConfirmingClear(false);
    if (!cleared) {
      setProblem(
        'ApplyKit could not delete your preferences. Nothing was changed; try again.',
      );
      return;
    }
    setDraft(null);
    setNotice('All diversity preferences deleted.');
    setLoad(null);
    setAttempt((count) => count + 1);
  };

  const clearControl = (
    <ClearAll
      confirming={confirmingClear}
      busy={busy}
      onConfirming={setConfirmingClear}
      onClear={() => {
        void clearAll();
      }}
    />
  );

  if (load === null)
    return (
      <SectionShell
        heading={headingRef}
        title="Diversity & Inclusion"
        intro={INTRO}
      >
        {null}
      </SectionShell>
    );
  if (load.status === 'unsupported') {
    // Unreadable here, but still the user's to delete.
    return (
      <SectionShell
        heading={headingRef}
        title="Diversity & Inclusion"
        intro={INTRO}
      >
        <Banner tone="warning">{NEWER}</Banner>
        <div className="mt-6 flex justify-end">{clearControl}</div>
        {problem && <Problem>{problem}</Problem>}
        <Notice>{notice}</Notice>
      </SectionShell>
    );
  }
  if (load.status === 'error') {
    return (
      <SectionShell
        heading={headingRef}
        title="Diversity & Inclusion"
        intro={INTRO}
      >
        <Banner tone="danger">
          ApplyKit could not read your diversity preferences from this browser.
          Nothing was changed.{' '}
          <button
            type="button"
            onClick={() => {
              setLoad(null);
              setAttempt((count) => count + 1);
            }}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            Try again
          </button>
        </Banner>
      </SectionShell>
    );
  }

  const { preferences, updatedAt, damaged } = load;

  /**
   * Turning reuse off always applies, over whatever another tab saved:
   * it keeps that tab's answers and only stops their use.
   */
  const turnOffReuse = async () => {
    setBusy(true);
    setProblem(null);
    setNotice('');
    let basedOn = updatedAt;
    let answersNow = preferences.answers;
    for (let attempt = 0; attempt < 3; attempt++) {
      const result = await store.save(
        { reuse: false, answers: answersNow },
        basedOn,
        now(),
      );
      if (result.status === 'conflict') {
        basedOn = result.current.updatedAt;
        answersNow = result.current.preferences.answers;
        continue;
      }
      setBusy(false);
      if (result.status === 'saved') {
        setLoad({
          status: 'loaded',
          preferences: result.saved.preferences,
          updatedAt: result.saved.updatedAt,
          damaged: [],
        });
        setNotice('Reuse turned off. Your answers are kept.');
      } else if (result.status === 'unsupported') {
        setLoad({ status: 'unsupported' });
      } else {
        setProblem(
          'ApplyKit could not turn reuse off. Nothing was changed; try again.',
        );
      }
      return;
    }
    setBusy(false);
    setProblem(
      'ApplyKit could not turn reuse off. Nothing was changed; try again.',
    );
  };
  const answers = draft ?? preferences.answers;
  const dirty = draft !== null;

  /**
   * Saves over the version this page loaded; a save from another tab is
   * never overwritten: the page shows it, keeping any unsaved answers.
   */
  const save = async (
    next: { reuse: boolean; answers: DiversityAnswers },
    done: string,
  ): Promise<boolean> => {
    setBusy(true);
    setProblem(null);
    setNotice('');
    const result = await store.save(next, updatedAt, now());
    setBusy(false);
    switch (result.status) {
      case 'saved':
        setLoad({
          status: 'loaded',
          preferences: result.saved.preferences,
          updatedAt: result.saved.updatedAt,
          damaged: [],
        });
        setNotice(done);
        return true;
      case 'conflict':
        setLoad({
          status: 'loaded',
          preferences: result.current.preferences,
          updatedAt: result.current.updatedAt,
          damaged: result.damaged,
        });
        setProblem(
          'Your preferences were changed in another tab, so this was not saved. The page now shows that version; your unsaved answers are kept. Save again to keep them.',
        );
        return false;
      case 'unsupported':
        setLoad({ status: 'unsupported' });
        return false;
      case 'error':
        setProblem(
          'ApplyKit could not save your preferences. Nothing was changed; try again.',
        );
        return false;
    }
  };

  return (
    <SectionShell
      heading={headingRef}
      title="Diversity & Inclusion"
      intro={INTRO}
    >
      {damaged === 'all' && (
        <Banner tone="warning">
          Your saved preferences could not be read and are shown as not saved. A
          copy is kept when you next save.
        </Banner>
      )}
      {damaged !== 'all' && damaged.length > 0 && (
        <Banner tone="warning">
          Some saved answers could not be read (
          {damaged.map((c) => CATEGORY_TITLE[c]).join(', ')}) and are shown as
          not saved. A copy is kept when you next save.
        </Banner>
      )}

      <form
        noValidate
        className="mt-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!dirty || busy) return;
          void save(
            { reuse: preferences.reuse, answers },
            preferences.reuse ||
              Object.values(answers).every((answer) => answer === null)
              ? 'Diversity preferences saved.'
              : 'Diversity preferences saved. They are used when autofilling only if you turn on “Use these answers when autofilling” below.',
          ).then((saved) => {
            if (saved) setDraft(null);
          });
        }}
      >
        <FieldGrid>
          {DIVERSITY_CATEGORIES.map((category) => (
            <AnswerSelect
              key={category}
              category={category}
              value={answers[category]}
              onChange={(value) => {
                setNotice('');
                setDraft({ ...answers, [category]: value });
              }}
            />
          ))}
        </FieldGrid>

        {problem && <Problem>{problem}</Problem>}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <PrimaryButton type="submit" disabled={!dirty || busy}>
            {busy ? 'Saving…' : dirty ? 'Save answers' : 'Saved'}
          </PrimaryButton>
          {dirty && !busy && (
            <GhostButton
              onClick={() => {
                setDraft(null);
                setProblem(null);
              }}
            >
              Discard changes
            </GhostButton>
          )}
          <span className="flex-1" />
          {clearControl}
        </div>
        <Notice>{notice}</Notice>
      </form>

      <div className="mt-8 rounded-md border border-line bg-white px-4 py-3.5">
        <label className="flex cursor-default items-start gap-2.5">
          <input
            type="checkbox"
            checked={preferences.reuse}
            // It applies to saved answers: unsaved changes would not be used.
            disabled={busy || dirty}
            onChange={(event) => {
              if (event.target.checked) {
                void save(
                  { reuse: true, answers: preferences.answers },
                  'Turned on. Autofill now fills matching monitoring questions.',
                );
              } else {
                void turnOffReuse();
              }
            }}
            className="mt-0.5 size-4 shrink-0 rounded-xs accent-accent"
          />
          <span>
            <span className="block font-medium">
              Use these answers when autofilling
            </span>
            <span className="mt-0.5 block text-xs text-ink-2">
              Off by default: saving answers does not turn it on. When on,
              ApplyKit fills only the monitoring questions it recognises
              exactly, when the form offers the same answer. Turn it off at any
              time; your answers are kept.
            </span>
            {dirty && (
              <span className="mt-1 block text-xs font-medium text-ink-2">
                Save your changes first.
              </span>
            )}
          </span>
        </label>
      </div>
    </SectionShell>
  );
}

/** One category's choices; "No saved answer" is not prefer not to say. */
function AnswerSelect({
  category,
  value,
  onChange,
}: {
  category: DiversityCategory;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const id = useId();
  const pnts = CHOICES[category].find((c) => c.id === PREFER_NOT_TO_SAY);
  return (
    <div className={category === 'ethnicity' ? 'sm:col-span-2' : undefined}>
      <label
        htmlFor={id}
        className="mb-1.5 flex items-baseline gap-1.5 text-xs font-medium text-ink-2"
      >
        {CATEGORY_TITLE[category]}
        <span className="font-normal text-ink-3">Optional</span>
      </label>
      <select
        id={id}
        value={value ?? ''}
        onChange={(event) => {
          onChange(event.target.value === '' ? null : event.target.value);
        }}
        className={`${CONTROL} ${CONTROL_STATE(false)} h-9 px-2.5`}
      >
        <option value="">No saved answer</option>
        {category === 'ethnicity' ? (
          <>
            {ETHNIC_GROUPS.map((group) => (
              <optgroup key={group.id} label={group.label}>
                {group.choices.map((choice) => (
                  <option key={choice.id} value={choice.id}>
                    {choice.label}
                  </option>
                ))}
              </optgroup>
            ))}
            {pnts && <option value={pnts.id}>{pnts.label}</option>}
          </>
        ) : (
          CHOICES[category].map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}

/** "Clear all", confirmed inline; deletes backups too. */
function ClearAll({
  confirming,
  busy,
  onConfirming,
  onClear,
}: {
  confirming: boolean;
  busy: boolean;
  onConfirming: (confirming: boolean) => void;
  onClear: () => void;
}) {
  return confirming ? (
    <span className="flex items-center gap-1 text-xs text-ink-2">
      Delete every answer and backup copy, and turn reuse off?
      <GhostButton
        disabled={busy}
        onClick={() => {
          onConfirming(false);
        }}
      >
        Cancel
      </GhostButton>
      <GhostButton tone="danger" disabled={busy} onClick={onClear}>
        Delete all
      </GhostButton>
    </span>
  ) : (
    <GhostButton
      tone="danger"
      disabled={busy}
      onClick={() => {
        onConfirming(true);
      }}
    >
      Clear all diversity preferences
    </GhostButton>
  );
}
