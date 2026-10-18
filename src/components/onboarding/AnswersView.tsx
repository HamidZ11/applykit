import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, Info } from 'lucide-react';
import {
  ARRANGEMENT_TEXT,
  CURRENCIES,
  WILLINGNESS_TEXT,
  longDate,
  noticeText,
  salaryText,
  type AnswerCategory,
  type ApplicationAnswers,
  type NoticeUnit,
  type SalaryPeriod,
  type Currency,
  type Willingness,
} from '@/domain/application-answers';
import { answerProblem } from '@/domain/answers-schema';
import {
  browserAnswersStore,
  type AnswersLoadResult,
  type AnswersStore,
} from '@/storage/answers-store';
import { Icon } from '@/components/ui/icons';
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/primitives';
import { FieldGrid, SelectField, TextField } from './fields';

/**
 * Saved answers to common application questions, edited one category at
 * a time. Kept apart from the profile and its draft: each answer is saved
 * as soon as the user saves it, on top of the latest saved answers.
 */

const CATEGORY_COPY: Record<AnswerCategory, { title: string; hint: string }> = {
  noticePeriod: {
    title: 'Notice period',
    hint: 'For questions such as “What is your notice period?”. Enter 0 if you need to give no notice.',
  },
  relocation: {
    title: 'Relocation',
    hint: 'Answered separately for moving within your country and to another country.',
  },
  workArrangement: {
    title: 'Working arrangement',
    hint: 'For questions such as “Do you prefer remote, hybrid or office-based work?”.',
  },
  startDate: {
    title: 'Earliest start date',
    hint: 'ApplyKit stops suggesting it once the date has passed.',
  },
  salary: {
    title: 'Salary expectation',
    hint: 'Suggested only where a form asks in the same currency and pay period. Never converted.',
  },
};

const ORDER: AnswerCategory[] = [
  'noticePeriod',
  'relocation',
  'workArrangement',
  'startDate',
  'salary',
];

/** A saved answer in words, or null when nothing is saved. */
function summary(
  category: AnswerCategory,
  answers: ApplicationAnswers,
): string | null {
  switch (category) {
    case 'noticePeriod':
      return answers.noticePeriod && noticeText(answers.noticePeriod);
    case 'relocation': {
      const { relocation } = answers;
      if (!relocation) return null;
      const part = (where: string, value: Willingness | null) =>
        value ? `${where}: ${WILLINGNESS_TEXT[value]}` : null;
      return [
        part('Within your country', relocation.withinCountry),
        part('Abroad', relocation.abroad),
      ]
        .filter(Boolean)
        .join(' · ');
    }
    case 'workArrangement':
      return (
        answers.workArrangement && ARRANGEMENT_TEXT[answers.workArrangement]
      );
    case 'startDate':
      return answers.startDate && longDate(answers.startDate);
    case 'salary':
      return answers.salary && salaryText(answers.salary);
  }
}

const systemClock = () => new Date();

/**
 * Unsaved edits, by category: kept while the user moves between answers
 * or to the profile and back, until they save or cancel that answer.
 */
export type AnswerDrafts = Partial<Record<AnswerCategory, Draft>>;

const CONFLICT =
  'Your answers were changed in another tab, so this was not saved. The list now shows that version; save again to keep your change.';
const REMOVE_CONFLICT =
  'Your answers were changed in another tab, so nothing was removed. Check this answer, then remove it again if you still want to.';
const SAVE_FAILED =
  'ApplyKit could not save this answer. Your change is still here; try again.';
const REMOVE_FAILED = 'ApplyKit could not remove this answer. Try again.';
const NEWER =
  'Your saved answers were saved by a newer version of ApplyKit, so this version cannot show or change them. They are kept exactly as they are. Update ApplyKit to edit them.';

export function AnswersView({
  store = browserAnswersStore,
  now = systemClock,
  heading,
  drafts: keptDrafts,
  onDraftsChange,
}: {
  store?: AnswersStore;
  now?: () => Date;
  /** The page heading, which the profile page focuses on opening. */
  heading?: React.RefObject<HTMLHeadingElement | null>;
  /** Unsaved edits, when the page keeps them across views. */
  drafts?: AnswerDrafts;
  onDraftsChange?: (drafts: AnswerDrafts) => void;
}) {
  const [load, setLoad] = useState<AnswersLoadResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<AnswerCategory | null>(null);
  /** The answer being saved or removed; others wait for it. */
  const [saving, setSaving] = useState<AnswerCategory | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [ownDrafts, setOwnDrafts] = useState<AnswerDrafts>({});
  const drafts = keptDrafts ?? ownDrafts;
  const setDrafts = onDraftsChange ?? setOwnDrafts;
  const ownHeading = useRef<HTMLHeadingElement | null>(null);
  const headingRef = heading ?? ownHeading;
  const focusHeading = useRef(false);

  useEffect(() => {
    let active = true;
    void store.load().then((result) => {
      if (active) setLoad(result);
    });
    return () => {
      active = false;
    };
  }, [store, attempt]);

  // After "Try again", focus returns to the page rather than the body.
  useEffect(() => {
    if (focusHeading.current && load !== null) {
      focusHeading.current = false;
      headingRef.current?.focus();
    }
  });

  // The heading is there at once, so focus can move to it on opening.
  if (load === null) return <Shell heading={headingRef}>{null}</Shell>;
  if (load.status === 'unsupported') {
    return (
      <Shell heading={headingRef}>
        <Banner tone="warning">{NEWER}</Banner>
      </Shell>
    );
  }
  if (load.status === 'error') {
    return (
      <Shell heading={headingRef}>
        <Banner tone="danger">
          ApplyKit could not read your saved answers from this browser. Nothing
          was changed.{' '}
          <button
            type="button"
            onClick={() => {
              focusHeading.current = true;
              setLoad(null);
              setAttempt((count) => count + 1);
            }}
            className="font-medium underline underline-offset-2 hover:no-underline"
          >
            Try again
          </button>
        </Banner>
      </Shell>
    );
  }

  const { answers, updatedAt, damaged } = load;

  const setDraft = (category: AnswerCategory, draft: Draft | null) => {
    setDrafts(
      draft
        ? { ...drafts, [category]: draft }
        : Object.fromEntries(
            Object.entries(drafts).filter(([key]) => key !== category),
          ),
    );
  };

  /**
   * Saves one category over the latest saved answers. A save made in
   * another tab since this page loaded is never overwritten: the page
   * shows it, and the user saves again if they still want their change.
   * Returns why it failed, or null.
   */
  const save = async (
    category: AnswerCategory,
    value: ApplicationAnswers[AnswerCategory],
  ): Promise<string | null> => {
    const removing = value === null;
    setSaving(category);
    const result = await store.save(
      { ...answers, [category]: value },
      updatedAt,
      now(),
    );
    setSaving(null);
    switch (result.status) {
      case 'saved':
        setLoad({
          status: 'loaded',
          answers: result.saved.answers,
          updatedAt: result.saved.updatedAt,
          damaged: [],
        });
        setDraft(category, null);
        setNotice(
          `${CATEGORY_COPY[category].title} ${removing ? 'removed' : 'saved'}.`,
        );
        return null;
      case 'conflict':
        setLoad({
          status: 'loaded',
          answers: result.current.answers,
          updatedAt: result.current.updatedAt,
          damaged: result.damaged,
        });
        return removing ? REMOVE_CONFLICT : CONFLICT;
      case 'unsupported':
        setLoad({ status: 'unsupported' });
        return NEWER;
      case 'error':
        return removing ? REMOVE_FAILED : SAVE_FAILED;
    }
  };

  return (
    <Shell heading={headingRef}>
      <div>
        {damaged !== 'all' && damaged.length > 0 && (
          <Banner tone="warning">
            Some saved answers could not be read (
            {damaged.map((c) => CATEGORY_COPY[c].title).join(', ')}) and are
            shown as not saved. A copy is kept when you next save.
          </Banner>
        )}
        {damaged === 'all' && (
          <Banner tone="warning">
            Your saved answers could not be read and are shown as not saved. A
            copy is kept when you next save.
          </Banner>
        )}
      </div>

      <ul className="mt-6 divide-y divide-line border-y border-line">
        {ORDER.map((category) => (
          <AnswerRow
            key={category}
            category={category}
            answers={answers}
            open={open === category}
            draft={drafts[category] ?? null}
            busy={saving === category}
            waiting={saving !== null && saving !== category}
            onDraft={(draft) => {
              setDraft(category, draft);
            }}
            onOpen={(value) => {
              // Opening an editor clears the last confirmation; a row only
              // ever closes its own editor.
              if (value) {
                setNotice('');
                setOpen(category);
              } else {
                setOpen((current) => (current === category ? null : current));
              }
            }}
            onSave={save}
          />
        ))}
      </ul>
      <p role="status" className="mt-3 min-h-5 text-xs text-ink-2">
        {notice && (
          <span className="flex items-center gap-1.5">
            <Icon icon={Check} size={14} className="text-success" />
            {notice}
          </span>
        )}
      </p>
    </Shell>
  );
}

function Shell({
  heading,
  children,
}: {
  heading?: React.Ref<HTMLHeadingElement> | undefined;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[640px] flex-1 px-5 pt-8 pb-16 md:px-10 md:pt-[clamp(32px,6vh,56px)]">
      <h1
        ref={heading}
        tabIndex={-1}
        className="text-xl font-medium tracking-[-0.01em] outline-none"
      >
        Application answers
      </h1>
      <p className="mt-1 max-w-[56ch] text-ink-2">
        Answers to common questions, ready for the forms that ask them. All
        optional. ApplyKit only suggests them: nothing is filled until you
        choose “Use this answer” on the form.
      </p>
      {children}
    </div>
  );
}

function AnswerRow({
  category,
  answers,
  open,
  draft,
  busy,
  waiting,
  onDraft,
  onOpen,
  onSave,
}: {
  category: AnswerCategory;
  answers: ApplicationAnswers;
  open: boolean;
  /** Unsaved edits to this answer, or null. */
  draft: Draft | null;
  /** This answer is being saved or removed. */
  busy: boolean;
  /** Another answer is being saved: this one waits. */
  waiting: boolean;
  onDraft: (draft: Draft | null) => void;
  onOpen: (open: boolean) => void;
  onSave: (
    category: AnswerCategory,
    value: ApplicationAnswers[AnswerCategory],
  ) => Promise<string | null>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const actions = useRef<HTMLDivElement>(null);
  const confirmation = useRef<HTMLSpanElement>(null);
  /** Where focus goes after the next render, if anywhere. */
  const refocus = useRef<'edit' | 'remove' | 'cancel' | null>(null);
  const { title, hint } = CATEGORY_COPY[category];
  const saved = summary(category, answers);

  useEffect(() => {
    const target = refocus.current;
    if (!target) return;
    refocus.current = null;
    if (target === 'cancel') {
      confirmation.current?.querySelector('button')?.focus();
      return;
    }
    const buttons = actions.current?.querySelectorAll('button');
    (target === 'remove' ? buttons?.[1] : buttons?.[0])?.focus();
  });

  const close = () => {
    refocus.current = 'edit';
    setProblem(null);
    onOpen(false);
  };

  const cancelRemove = () => {
    refocus.current = 'remove';
    setConfirming(false);
    setProblem(null);
  };

  const commit = async (value: ApplicationAnswers[AnswerCategory]) => {
    const failure = await onSave(category, value);
    setProblem(failure);
    if (value === null) {
      // A removal that failed or met a newer version shows why; the
      // question is asked again only if the user chooses Remove again.
      setConfirming(false);
      refocus.current = 'edit';
      return;
    }
    if (failure === null) close();
  };

  return (
    <li aria-label={title} className={open ? 'bg-sunken/50' : undefined}>
      <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{title}</p>
          <p
            className={`truncate text-xs ${saved ? 'text-ink-2' : 'text-ink-3'}`}
          >
            {saved ?? 'Not saved'}
          </p>
          {draft && !open && (
            <p className="text-xs text-warning">Unsaved changes</p>
          )}
        </div>
        {confirming ? (
          <span
            ref={confirmation}
            className="flex shrink-0 items-center gap-1 text-xs text-ink-2"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) {
                event.preventDefault();
                cancelRemove();
              }
            }}
          >
            Remove this answer?
            <GhostButton disabled={busy} onClick={cancelRemove}>
              Cancel
            </GhostButton>
            <GhostButton
              tone="danger"
              disabled={busy}
              onClick={() => {
                void commit(null);
              }}
            >
              {busy ? 'Removing…' : 'Remove'}
            </GhostButton>
          </span>
        ) : (
          !open && (
            <div ref={actions} className="flex shrink-0 items-center gap-1">
              <SecondaryButton
                size="sm"
                disabled={waiting}
                aria-label={`${saved ? 'Edit' : 'Add'} ${title.toLowerCase()}`}
                onClick={() => {
                  setProblem(null);
                  onOpen(true);
                }}
              >
                {saved ? 'Edit' : 'Add'}
              </SecondaryButton>
              {saved && (
                <GhostButton
                  disabled={waiting}
                  aria-label={`Remove ${title.toLowerCase()}`}
                  onClick={() => {
                    refocus.current = 'cancel';
                    setProblem(null);
                    setConfirming(true);
                  }}
                >
                  Remove
                </GhostButton>
              )}
            </div>
          )
        )}
      </div>
      {problem && !open && (
        <p role="alert" className="px-3 pb-3 text-xs text-danger">
          {problem}
        </p>
      )}
      {open && (
        <AnswerEditor
          category={category}
          draft={draft ?? draftFrom(answers)}
          hint={hint}
          busy={busy}
          waiting={waiting}
          problem={problem}
          onDraft={onDraft}
          onCancel={() => {
            // Cancelling is the user's choice to discard this edit.
            onDraft(null);
            close();
          }}
          onSave={(value) => {
            void commit(value);
          }}
        />
      )}
    </li>
  );
}

const UNIT_OPTIONS: { value: NoticeUnit; label: string }[] = [
  { value: 'days', label: 'Days' },
  { value: 'weeks', label: 'Weeks' },
  { value: 'months', label: 'Months' },
];

const WILLINGNESS_OPTIONS = [
  { value: '', label: 'Not answered' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'depends', label: 'It depends' },
];

const ARRANGEMENT_OPTIONS = [
  { value: '', label: 'Choose…' },
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'on-site', label: 'On-site' },
  { value: 'flexible', label: 'Flexible, no preference' },
];

const PERIOD_OPTIONS: { value: SalaryPeriod; label: string }[] = [
  { value: 'year', label: 'Per year' },
  { value: 'month', label: 'Per month' },
  { value: 'day', label: 'Per day' },
  { value: 'hour', label: 'Per hour' },
];

/** The editor's fields as typed, before validation. */
export interface Draft {
  amount: string;
  unit: NoticeUnit;
  withinCountry: string;
  abroad: string;
  arrangement: string;
  date: string;
  salary: string;
  currency: Currency;
  period: SalaryPeriod;
}

function draftFrom(answers: ApplicationAnswers): Draft {
  return {
    amount: answers.noticePeriod ? String(answers.noticePeriod.amount) : '',
    unit: answers.noticePeriod?.unit ?? 'weeks',
    withinCountry: answers.relocation?.withinCountry ?? '',
    abroad: answers.relocation?.abroad ?? '',
    arrangement: answers.workArrangement ?? '',
    date: answers.startDate ?? '',
    salary: answers.salary ? String(answers.salary.amount) : '',
    currency: answers.salary?.currency ?? 'GBP',
    period: answers.salary?.period ?? 'year',
  };
}

/** The category's value from the draft; validated before saving. */
/**
 * A whole number of days, weeks or months, as typed; NaN otherwise. Number
 * inputs report anything unreadable as empty.
 */
function wholeNumber(text: string): number {
  const value = text.trim();
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

/**
 * An amount written as people write money: digits, thousands separated by
 * commas or spaces, at most two decimals after a full stop ("32,000",
 * "15.50"). Anything else ("1e3", "0x10", "45000,50") is NaN, never a
 * different number.
 */
function amountFrom(text: string): number {
  const value = text.trim().replace(/\s+/g, '');
  return /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(value)
    ? Number(value.replace(/,/g, ''))
    : Number.NaN;
}

function valueFrom(category: AnswerCategory, draft: Draft): unknown {
  const willing = (text: string) => (text === '' ? null : text);
  switch (category) {
    case 'noticePeriod':
      return { amount: wholeNumber(draft.amount), unit: draft.unit };
    case 'relocation':
      return {
        withinCountry: willing(draft.withinCountry),
        abroad: willing(draft.abroad),
      };
    case 'workArrangement':
      return draft.arrangement;
    case 'startDate':
      return draft.date;
    case 'salary':
      return {
        amount: amountFrom(draft.salary),
        currency: draft.currency,
        period: draft.period,
      };
  }
}

function AnswerEditor({
  category,
  draft,
  hint,
  busy,
  waiting,
  problem,
  onDraft,
  onCancel,
  onSave,
}: {
  category: AnswerCategory;
  draft: Draft;
  hint: string;
  busy: boolean;
  waiting: boolean;
  problem: string | null;
  onDraft: (draft: Draft) => void;
  onCancel: () => void;
  onSave: (value: ApplicationAnswers[AnswerCategory]) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const set = (patch: Partial<Draft>) => {
    onDraft({ ...draft, ...patch });
    setError(null);
  };

  // Opening moves focus into the editor.
  useEffect(() => {
    form.current
      ?.querySelector<HTMLElement>('input, select')
      ?.focus({ preventScroll: true });
  }, []);

  // A field the check rejected takes focus, so its message is read out.
  useEffect(() => {
    if (error) {
      form.current
        ?.querySelector<HTMLElement>('[aria-invalid="true"]')
        ?.focus();
    }
  }, [error]);

  const submit = () => {
    if (busy || waiting) return;
    const value = valueFrom(category, draft);
    const amount = (value as { amount?: number } | null)?.amount;
    if (amount !== undefined && !Number.isFinite(amount)) {
      setError(
        category === 'salary'
          ? 'Enter an amount such as 32000 or 15.50'
          : 'Enter a whole number',
      );
      return;
    }
    const invalid = answerProblem(category, value);
    if (invalid) {
      setError(invalid);
      return;
    }
    onSave(value as ApplicationAnswers[AnswerCategory]);
  };

  return (
    <form
      ref={form}
      // ApplyKit's own messages, not the browser's, explain what to fix.
      noValidate
      className="animate-[ak-fade-in_140ms_var(--ease-out)] px-3 pt-1 pb-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !busy) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <p className="mb-4 max-w-[52ch] text-xs text-ink-3">{hint}</p>
      <FieldGrid>{fields(category, draft, set, error)}</FieldGrid>
      {problem && (
        <p role="alert" className="mt-4 text-xs text-danger">
          {problem}
        </p>
      )}
      <div className="mt-5 flex items-center justify-end gap-2">
        <GhostButton onClick={onCancel} disabled={busy}>
          Cancel
        </GhostButton>
        <PrimaryButton type="submit" disabled={busy || waiting}>
          {busy ? 'Saving…' : 'Save answer'}
        </PrimaryButton>
      </div>
    </form>
  );
}

function fields(
  category: AnswerCategory,
  draft: Draft,
  set: (patch: Partial<Draft>) => void,
  error: string | null,
): ReactNode {
  const shown = error ?? undefined;
  switch (category) {
    case 'noticePeriod':
      return (
        <>
          <TextField
            label="Notice"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={draft.amount}
            error={shown}
            onValueChange={(amount) => {
              set({ amount });
            }}
          />
          <SelectField
            label="Unit"
            value={draft.unit}
            options={UNIT_OPTIONS}
            onValueChange={(unit) => {
              set({ unit: unit as NoticeUnit });
            }}
          />
        </>
      );
    case 'relocation':
      return (
        <>
          <SelectField
            label="Within your country"
            value={draft.withinCountry}
            options={WILLINGNESS_OPTIONS}
            error={shown}
            onValueChange={(withinCountry) => {
              set({ withinCountry });
            }}
          />
          <SelectField
            label="To another country"
            value={draft.abroad}
            options={WILLINGNESS_OPTIONS}
            onValueChange={(abroad) => {
              set({ abroad });
            }}
          />
        </>
      );
    case 'workArrangement':
      return (
        <SelectField
          label="Preferred arrangement"
          value={draft.arrangement}
          options={ARRANGEMENT_OPTIONS}
          error={error ? 'Choose an arrangement' : undefined}
          onValueChange={(arrangement) => {
            set({ arrangement });
          }}
        />
      );
    case 'startDate':
      return (
        <TextField
          label="Earliest start date"
          type="date"
          value={draft.date}
          error={shown}
          onValueChange={(date) => {
            set({ date });
          }}
        />
      );
    case 'salary':
      return (
        <>
          <TextField
            label="Amount"
            inputMode="decimal"
            placeholder="32000"
            value={draft.salary}
            error={shown}
            wide
            onValueChange={(salary) => {
              set({ salary });
            }}
          />
          <SelectField
            label="Currency"
            value={draft.currency}
            options={CURRENCIES.map((code) => ({ value: code, label: code }))}
            onValueChange={(currency) => {
              set({ currency: currency as Currency });
            }}
          />
          <SelectField
            label="Pay period"
            value={draft.period}
            options={PERIOD_OPTIONS}
            onValueChange={(period) => {
              set({ period: period as SalaryPeriod });
            }}
          />
        </>
      );
  }
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
      className={`mt-6 flex items-start gap-2.5 rounded-md px-3.5 py-3 text-sm ${
        tone === 'danger'
          ? 'bg-danger-soft text-danger'
          : 'bg-warning-soft text-warning'
      }`}
    >
      <Icon
        icon={tone === 'danger' ? CircleAlert : Info}
        size={16}
        className="mt-px shrink-0"
      />
      <p>{children}</p>
    </div>
  );
}
