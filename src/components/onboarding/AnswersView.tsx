import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CircleAlert, Info } from 'lucide-react';
import {
  answerProblem,
  CURRENCIES,
  type AnswerCategory,
  type ApplicationAnswers,
  type NoticeUnit,
  type SalaryPeriod,
  type Currency,
  type Willingness,
} from '@/domain/application-answers';
import {
  ARRANGEMENT_TEXT,
  WILLINGNESS_TEXT,
  longDate,
  noticeText,
  salaryText,
} from '@/autofill/answers';
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

export function AnswersView({
  store = browserAnswersStore,
  now = systemClock,
  heading,
}: {
  store?: AnswersStore;
  now?: () => Date;
  /** Receives focus when the view opens. */
  heading?: React.Ref<HTMLHeadingElement>;
}) {
  const [load, setLoad] = useState<AnswersLoadResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState<AnswerCategory | null>(null);
  const [notice, setNotice] = useState<string>('');

  useEffect(() => {
    let active = true;
    void store.load().then((result) => {
      if (active) setLoad(result);
    });
    return () => {
      active = false;
    };
  }, [store, attempt]);

  // The heading is there at once, so focus can move to it on opening.
  if (load === null) return <Shell heading={heading}>{null}</Shell>;
  if (load.status === 'error') {
    return (
      <Shell heading={heading}>
        <Banner tone="danger">
          ApplyKit could not read your saved answers from this browser. Nothing
          was changed.{' '}
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
      </Shell>
    );
  }

  const { answers, updatedAt, damaged } = load;

  /**
   * Saves one category over the latest saved answers. A save made in
   * another tab since this page loaded is never overwritten: the page
   * shows it, and the user saves again if they still want their change.
   */
  const save = async (
    category: AnswerCategory,
    value: ApplicationAnswers[AnswerCategory],
  ): Promise<string | null> => {
    const next = { ...answers, [category]: value };
    const result = await store.save(next, updatedAt, now());
    if (result.status === 'saved') {
      setLoad({
        status: 'loaded',
        answers: result.saved.answers,
        updatedAt: result.saved.updatedAt,
        damaged: [],
      });
      setNotice(
        value === null
          ? `${CATEGORY_COPY[category].title} removed.`
          : `${CATEGORY_COPY[category].title} saved.`,
      );
      return null;
    }
    if (result.status === 'conflict') {
      setLoad({
        status: 'loaded',
        answers: result.current.answers,
        updatedAt: result.current.updatedAt,
        damaged: [],
      });
      return 'Your answers were changed in another tab, so this was not saved. The list now shows that version; save again to keep your change.';
    }
    return 'ApplyKit could not save this answer. Your change is still here; try again.';
  };

  return (
    <Shell heading={heading}>
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
            onOpen={(value) => {
              // Opening an editor clears the last confirmation; closing
              // one after a save keeps it.
              if (value) setNotice('');
              setOpen(value ? category : null);
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
  onOpen,
  onSave,
}: {
  category: AnswerCategory;
  answers: ApplicationAnswers;
  open: boolean;
  onOpen: (open: boolean) => void;
  onSave: (
    category: AnswerCategory,
    value: ApplicationAnswers[AnswerCategory],
  ) => Promise<string | null>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const editButton = useRef<HTMLDivElement>(null);
  /** Return focus to the row's action once the editor has closed. */
  const refocus = useRef(false);
  const { title, hint } = CATEGORY_COPY[category];
  const saved = summary(category, answers);

  useEffect(() => {
    if (refocus.current && !open) {
      refocus.current = false;
      editButton.current?.querySelector('button')?.focus();
    }
  });

  const close = () => {
    refocus.current = true;
    onOpen(false);
  };

  const commit = async (value: ApplicationAnswers[AnswerCategory]) => {
    setBusy(true);
    const failure = await onSave(category, value);
    setBusy(false);
    setProblem(failure);
    if (failure === null) {
      setConfirming(false);
      // Back to the row's own action, which now says Edit or Add.
      close();
    }
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
        </div>
        {confirming ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-ink-2">
            Remove this answer?
            <GhostButton
              onClick={() => {
                setConfirming(false);
              }}
            >
              Cancel
            </GhostButton>
            <GhostButton
              tone="danger"
              disabled={busy}
              onClick={() => {
                void commit(null);
              }}
            >
              Remove
            </GhostButton>
          </span>
        ) : (
          !open && (
            <div ref={editButton} className="flex shrink-0 items-center gap-1">
              <SecondaryButton
                size="sm"
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
                  aria-label={`Remove ${title.toLowerCase()}`}
                  onClick={() => {
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
          answers={answers}
          hint={hint}
          busy={busy}
          problem={problem}
          onCancel={() => {
            setProblem(null);
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
interface Draft {
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
function valueFrom(category: AnswerCategory, draft: Draft): unknown {
  const number = (text: string) =>
    text.trim() === '' ? Number.NaN : Number(text);
  const willing = (text: string) => (text === '' ? null : text);
  switch (category) {
    case 'noticePeriod':
      return { amount: number(draft.amount), unit: draft.unit };
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
        amount: number(draft.salary.replace(/[,\s]/g, '')),
        currency: draft.currency,
        period: draft.period,
      };
  }
}

function AnswerEditor({
  category,
  answers,
  hint,
  busy,
  problem,
  onCancel,
  onSave,
}: {
  category: AnswerCategory;
  answers: ApplicationAnswers;
  hint: string;
  busy: boolean;
  problem: string | null;
  onCancel: () => void;
  onSave: (value: ApplicationAnswers[AnswerCategory]) => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(answers));
  const [error, setError] = useState<string | null>(null);
  const first = useRef<HTMLDivElement>(null);
  const set = (patch: Partial<Draft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setError(null);
  };

  // Opening moves focus into the editor.
  useEffect(() => {
    first.current
      ?.querySelector<HTMLElement>('input, select')
      ?.focus({ preventScroll: true });
  }, []);

  const submit = () => {
    const value = valueFrom(category, draft);
    const invalid = answerProblem(category, value);
    if (invalid) {
      setError(
        Number.isNaN((value as { amount?: number } | null)?.amount)
          ? 'Enter a number'
          : invalid,
      );
      return;
    }
    onSave(value as ApplicationAnswers[AnswerCategory]);
  };

  return (
    <form
      className="animate-[ak-fade-in_140ms_var(--ease-out)] px-3 pt-1 pb-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <p className="mb-4 max-w-[52ch] text-xs text-ink-3">{hint}</p>
      <div ref={first}>
        <FieldGrid>{fields(category, draft, set, error)}</FieldGrid>
      </div>
      {problem && (
        <p role="alert" className="mt-4 text-xs text-danger">
          {problem}
        </p>
      )}
      <div className="mt-5 flex items-center justify-end gap-2">
        <GhostButton onClick={onCancel} disabled={busy}>
          Cancel
        </GhostButton>
        <PrimaryButton type="submit" disabled={busy}>
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
