import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import {
  ListChecks,
  LocateFixed,
  MessageSquareText,
  UserRound,
} from 'lucide-react';
import { isAnswerField, type AutofillValues } from '@/autofill/fields';
import { needsYou, type FieldReport } from '@/autofill/report';
import type { FieldElement } from '@/autofill/scan';
import type { Suggestion } from '@/autofill/suggestion';
import { Icon } from '@/components/ui/icons';
import {
  GhostButton,
  PrimaryButton,
  SecondaryButton,
} from '@/components/ui/primitives';
import { fieldKey } from './FieldRow';
import { StatusGlyph } from './icons';
import type { PanelModel } from './usePanel';
import { plural } from './vocabulary';

/**
 * What the user can do about a field ApplyKit left to them, shown under its
 * explanation in the expanded list. Nothing here fills a field without the
 * user's explicit confirmation.
 */
export function FieldActions({
  report,
  model,
}: {
  report: FieldReport;
  model: PanelModel;
}) {
  const { status, suggestion } = report;
  const { values } = model;
  const records =
    status === 'ambiguous' && values.status === 'ready'
      ? recordOptions(report.candidates, values.values)
      : [];
  const profileLacksIt =
    status === 'no-value' ||
    status === 'no-profile' ||
    suggestion?.kind === 'missing';
  const [choosing, setChoosing] = useState(false);
  const canChoose = records.length > 1;
  // Saved application answers are edited apart from the profile; a
  // graduation answer is worked out from the saved education.
  const graduation = report.target === 'graduation';
  const answer =
    report.target !== null && isAnswerField(report.target) && !graduation;
  const source = answer
    ? 'From your saved answers'
    : graduation
      ? 'Based on your saved education'
      : 'From your saved profile';

  return (
    <>
      {suggestion && <Guidance suggestion={suggestion} source={source} />}
      {status === 'suggest' && report.value !== null && (
        <Guidance
          suggestion={{
            kind: 'value',
            value: report.value,
            // The fact a derived answer rests on.
            note: graduation ? report.note : null,
          }}
          source={source}
        />
      )}
      {status === 'no-option' && (
        <p className="mt-1 text-ink-2">
          Choose the right option on the page yourself. ApplyKit never picks an
          option that only looks similar.
        </p>
      )}
      {canChoose && choosing ? (
        // The chooser has its own actions; the row's return when it closes.
        <RecordChooser
          report={report}
          records={records}
          model={model}
          onClose={() => {
            setChoosing(false);
          }}
        />
      ) : (
        (canChoose || profileLacksIt || needsYou(report)) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {status === 'suggest' && (
              <UseAnswerButton report={report} model={model} />
            )}
            {canChoose && (
              <SecondaryButton
                size="sm"
                onClick={() => {
                  setChoosing(true);
                }}
              >
                <Icon icon={ListChecks} size={14} className="text-ink-3" />
                Choose a saved record
              </SecondaryButton>
            )}
            {profileLacksIt &&
              (answer && status !== 'no-profile' ? (
                <SecondaryButton size="sm" onClick={model.openAnswers}>
                  <Icon
                    icon={MessageSquareText}
                    size={14}
                    className="text-ink-3"
                  />
                  Edit application answers
                </SecondaryButton>
              ) : (
                <SecondaryButton size="sm" onClick={model.openProfile}>
                  <Icon icon={UserRound} size={14} className="text-ink-3" />
                  {status === 'no-profile'
                    ? 'Set up your profile'
                    : 'Edit your profile'}
                </SecondaryButton>
              ))}
            {needsYou(report) && (
              <GoToButton element={report.field.element} model={model} />
            )}
          </div>
        )
      )}
    </>
  );
}

/**
 * What the saved profile says for a field ApplyKit cannot fill: guidance
 * for choosing on the page, inside the panel only.
 */
function Guidance({
  suggestion,
  source,
}: {
  suggestion: Suggestion;
  source: string;
}) {
  if (suggestion.kind !== 'value') {
    return <p className="mt-1 text-ink-2">{suggestion.reason}</p>;
  }
  return (
    <div className="mt-2 rounded-md border border-line bg-white px-2.5 py-2">
      <p className="text-2xs text-ink-3">{source}</p>
      <p className="mt-0.5 font-medium break-words text-ink">
        {suggestion.value}
      </p>
      {suggestion.note && (
        <p className="mt-0.5 text-2xs text-ink-3">{suggestion.note}</p>
      )}
    </div>
  );
}

/**
 * Writes the saved answer into this one field, after the panel re-checks
 * the question and the saved answer. The only way an answer is filled.
 */
function UseAnswerButton({
  report,
  model,
}: {
  report: FieldReport;
  model: PanelModel;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <PrimaryButton
        data-use-answer
        disabled={busy}
        className="h-7 px-2.5 text-xs"
        onClick={(event) => {
          const list = event.currentTarget.closest('[role="region"]');
          const key = String(fieldKey(report.field.element));
          setBusy(true);
          setError(null);
          void model.applyAnswer(report).then((result) => {
            setBusy(false);
            if (result.ok && result.filled > 0) {
              // The filled row leaves the suggested answers: continue with
              // the next one, or stay with this field in its new place.
              setTimeout(() => {
                (
                  list?.querySelector<HTMLElement>('[data-use-answer]') ??
                  list?.querySelector<HTMLElement>(
                    `li[data-field="${key}"] > button`,
                  )
                )?.focus({ preventScroll: true });
              }, 0);
            } else {
              setError(
                result.ok
                  ? 'The page did not accept the answer. Enter it yourself.'
                  : result.message,
              );
            }
          });
        }}
      >
        {busy ? 'Filling…' : 'Use this answer'}
      </PrimaryButton>
      {error && (
        <p role="alert" className="basis-full text-danger">
          {error}
        </p>
      )}
    </>
  );
}

/** Scrolls to the field and focuses it if safe; says so if it has gone. */
function GoToButton({
  element,
  model,
}: {
  element: FieldElement;
  model: PanelModel;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const [scrolledOnly, setScrolledOnly] = useState(false);
  return (
    <>
      <SecondaryButton
        size="sm"
        onClick={() => {
          const result = model.goToField(element);
          setProblem(result.ok ? null : result.message);
          setScrolledOnly(result.ok && !result.focused);
        }}
      >
        <Icon icon={LocateFixed} size={14} className="text-ink-3" />
        Go to field
      </SecondaryButton>
      {problem && (
        <p role="alert" className="basis-full text-danger">
          {problem}
        </p>
      )}
      {scrolledOnly && (
        <p role="status" className="basis-full text-ink-3">
          Scrolled to it. Click it on the page to choose.
        </p>
      )}
    </>
  );
}

/** A saved record as the chooser shows it: enough to tell records apart. */
interface RecordOption {
  id: string;
  /** The institution or employer. */
  name: string;
  /** The qualification or job title, and the years. */
  detail: string;
}

/**
 * The records a field could be filled from, in the order they are saved.
 * Only what tells them apart is shown; descriptions and grades are not.
 */
function recordOptions(
  candidates: readonly string[],
  values: AutofillValues,
): RecordOption[] {
  const education = values.education
    .filter((r) => candidates.includes(r.id))
    .map((r) => ({
      id: r.id,
      name: r.institution,
      detail: [r.qualification, years(r.startDate, r.endDate)]
        .filter(Boolean)
        .join(' · '),
    }));
  const jobs = values.employment
    .filter((r) => candidates.includes(r.id))
    .map((r) => ({
      id: r.id,
      name: r.employer,
      detail: [r.title, years(r.startDate, r.current ? 'Present' : r.endDate)]
        .filter(Boolean)
        .join(' · '),
    }));
  return [...education, ...jobs];
}

/**
 * Lets the user pick which saved record a section is about (a
 * qualification or a job), previews what that fills, and fills only after
 * they confirm.
 */
function RecordChooser({
  report,
  records,
  model,
  onClose,
}: {
  report: FieldReport;
  records: RecordOption[];
  model: PanelModel;
  /** Called when the chooser closes: cancelled, or filled. */
  onClose: () => void;
}) {
  const [recordId, setRecordId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRadio = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const name = useId();
  const group = report.field.group;

  const preview = recordId ? model.previewChoice({ group, recordId }) : null;
  const willFill = preview?.reports.filter((r) => r.status === 'fill') ?? [];

  // Opening moves focus to the first record, so the arrow keys work at once.
  useEffect(() => {
    firstRadio.current?.focus({ preventScroll: true });
  }, []);

  // The field's own row button, where focus returns when the chooser closes
  // or is replaced by the filled result.
  const rowButton = () =>
    root.current
      ?.closest('li')
      ?.querySelector<HTMLButtonElement>(':scope > button') ?? null;

  const close = () => {
    const button = rowButton();
    onClose();
    button?.focus({ preventScroll: true });
  };

  const confirm = async () => {
    if (!recordId || !preview) return;
    const button = rowButton();
    setBusy(true);
    setError(null);
    const result = await model.applyChoice(
      { group, recordId },
      preview.reports,
    );
    setBusy(false);
    if (result.ok) {
      onClose();
      button?.focus({ preventScroll: true });
    } else {
      setError(result.message);
    }
  };

  // Escape closes the chooser before it closes the panel.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  return (
    <div
      ref={root}
      onKeyDown={onKeyDown}
      className="mt-2 animate-[ak-fade-in_140ms_var(--ease-out)]"
    >
      <fieldset className="overflow-hidden rounded-md border border-line bg-white">
        <legend className="sr-only">Saved record for this section</legend>
        {records.map((record, index) => (
          <label
            key={record.id}
            className={`flex cursor-default items-start gap-2.5 border-b border-line px-2.5 py-2 transition-colors duration-100 last:border-b-0 ${
              recordId === record.id
                ? 'bg-accent-soft shadow-[inset_2px_0_0_var(--color-accent)]'
                : 'hover:bg-hover'
            }`}
          >
            <input
              ref={index === 0 ? firstRadio : undefined}
              type="radio"
              name={name}
              value={record.id}
              checked={recordId === record.id}
              onChange={() => {
                setRecordId(record.id);
                setError(null);
              }}
              className="mt-0.5 size-3.5 shrink-0 accent-accent"
            />
            <span className="min-w-0">
              <span
                className={`block truncate font-medium ${
                  recordId === record.id ? 'text-accent-hover' : 'text-ink'
                }`}
              >
                {record.name}
              </span>
              <span className="block truncate text-2xs text-ink-3">
                {record.detail}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {preview && (
        <div className="mt-2.5" aria-live="polite">
          <p className="text-2xs font-medium text-ink-3">In this section</p>
          <ul aria-label="What this record fills" className="mt-1 space-y-0.5">
            {preview.reports.map((planned) => (
              <li
                key={fieldKey(planned.field.element)}
                className="grid grid-cols-[14px_minmax(0,1fr)_auto] items-center gap-2"
              >
                <StatusGlyph status={planned.status} />
                <span className="truncate text-ink">{planned.field.label}</span>
                <span className="max-w-[140px] truncate text-2xs text-ink-3">
                  {outcomeOf(planned)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-1.5">
        <PrimaryButton
          disabled={willFill.length === 0 || busy}
          onClick={() => {
            void confirm();
          }}
        >
          {busy
            ? 'Filling…'
            : recordId
              ? `Fill ${plural(willFill.length, 'field')}`
              : 'Fill fields'}
        </PrimaryButton>
        <GhostButton onClick={close} disabled={busy}>
          Cancel
        </GhostButton>
      </div>
    </div>
  );
}

/** "2022–2024", "2025–Present": years only, enough to tell records apart. */
function years(startDate: string, endDate: string): string {
  const start = startDate.slice(0, 4);
  const end = endDate === 'Present' ? endDate : endDate.slice(0, 4);
  // A missing year is left out rather than shown as an open range.
  if (!start || !end) return start || end;
  return start === end ? start : `${start}–${end}`;
}

/** A short outcome for the preview: what happens to this field. */
function outcomeOf(report: FieldReport): string {
  switch (report.status) {
    case 'fill':
      return 'Will fill';
    case 'keep':
      return 'Already filled';
    case 'no-value':
      return 'Not in this record';
    case 'no-option':
      return 'No matching option';
    case 'unusable':
      return 'Saved value does not fit';
    case 'manual':
      return 'Answer yourself';
    case 'unsupported':
      return report.field.kind === 'checkbox'
        ? 'Tick it yourself'
        : 'Choose on the page';
    default:
      return 'Left to you';
  }
}
