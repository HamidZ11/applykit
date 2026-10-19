import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { BatchResult } from '@/autofill/batch';
import { isBatchEligible, type FieldReport } from '@/autofill/report';
import { GhostButton, PrimaryButton } from '@/components/ui/primitives';
import type { PanelModel } from './usePanel';
import { plural } from './vocabulary';

/**
 * The suggested answers that can be applied together (ADR 0022), each
 * with its question, value and why it was suggested, ticked unless the
 * user unticks it. Nothing is written until "Apply"; the list is a
 * snapshot, and if the form's suggestions change while it is open the
 * review must be refreshed before anything can be applied.
 */
export function AnswerReview({ model }: { model: PanelModel }) {
  const current = model.reports.filter(isBatchEligible);
  const [snapshot, setSnapshot] = useState(current);
  const [chosen, setChosen] = useState(() => new Set(current));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    batch: BatchResult;
    total: number;
  } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    first.current?.focus({ preventScroll: true });
  }, [snapshot]);
  useEffect(() => {
    if (result) heading.current?.focus({ preventScroll: true });
  }, [result]);

  const stale = !result && !sameAnswers(snapshot, current);
  const selected = snapshot.filter((report) => chosen.has(report));
  const allChosen = selected.length === snapshot.length;
  // Dropdown answers and record choices stay one at a time, in the list.
  const oneByOne = model.reports.filter(
    (r) =>
      (r.status === 'suggest' && !isBatchEligible(r)) ||
      (r.status === 'ambiguous' && r.candidates.length > 1),
  ).length;

  // A fresh review starts from a fresh scan: the page may have replaced
  // or added questions since.
  const [refreshing, setRefreshing] = useState(false);
  if (refreshing) {
    setRefreshing(false);
    setSnapshot(current);
    setChosen(new Set(current));
  }
  const restart = () => {
    setResult(null);
    setError(null);
    setRefreshing(true);
    model.rescan();
  };

  const apply = async () => {
    setBusy(true);
    setError(null);
    const outcome = await model.applyAnswers(selected);
    setBusy(false);
    if (outcome.ok)
      setResult({ batch: outcome.result, total: selected.length });
    else setError(outcome.message);
  };

  // Escape closes the review before it closes the panel, and does
  // nothing while answers are being applied.
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    if (!busy) model.closeReview();
  };

  if (result) {
    return (
      <div
        ref={root}
        onKeyDown={onKeyDown}
        className="flex min-h-0 flex-1 flex-col border-t border-line"
      >
        <BatchSummary
          result={result.batch}
          total={result.total}
          headingRef={heading}
          remaining={current.length}
          onRestart={restart}
          onClose={model.closeReview}
        />
      </div>
    );
  }

  return (
    <div
      ref={root}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-1 flex-col border-t border-line"
    >
      <div className="flex h-9 shrink-0 items-center gap-2 px-3.5">
        <p className="font-medium">Ready to apply</p>
        <span className="font-mono text-2xs text-ink-3 tabular-nums">
          {selected.length}/{snapshot.length}
        </span>
        <span className="flex-1" />
        {snapshot.length > 1 && (
          <GhostButton
            disabled={busy}
            onClick={() => {
              setChosen(allChosen ? new Set() : new Set(snapshot));
            }}
          >
            {allChosen ? 'Deselect all' : 'Select all'}
          </GhostButton>
        )}
      </div>

      <div
        role="region"
        aria-label="Answers to apply"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line"
      >
        {snapshot.length === 0 ? (
          <p className="px-3.5 py-4 text-xs text-ink-2">
            No answers can be applied together on this form.
          </p>
        ) : (
          <ul>
            {snapshot.map((report, index) => (
              <li key={index}>
                <label className="flex cursor-default items-start gap-2.5 border-b border-line px-3.5 py-2 transition-colors duration-100 last:border-b-0 hover:bg-hover">
                  <input
                    ref={index === 0 ? first : undefined}
                    type="checkbox"
                    checked={chosen.has(report)}
                    disabled={busy}
                    onChange={(event) => {
                      const next = new Set(chosen);
                      if (event.target.checked) next.add(report);
                      else next.delete(report);
                      setChosen(next);
                    }}
                    className="mt-0.5 size-3.5 shrink-0 accent-accent"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-ink-2">
                      {report.field.label}
                    </span>
                    <span className="block font-medium break-words text-ink">
                      {report.value}
                    </span>
                    {report.note && (
                      <span className="block text-2xs text-ink-3">
                        {report.note}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-line px-3 py-2.5">
        {stale && (
          <p role="alert" className="mb-2 text-xs text-ink-2">
            The answers on this form have changed.{' '}
            <button
              type="button"
              onClick={restart}
              className="font-medium text-accent-hover underline-offset-2 hover:underline"
            >
              Refresh the review
            </button>
          </p>
        )}
        {error && (
          <p role="alert" className="mb-2 text-xs text-danger">
            {error}
          </p>
        )}
        {oneByOne > 0 && (
          <p className="mb-2 text-2xs text-ink-3">
            {plural(oneByOne, 'other answer')} (dropdowns and saved records){' '}
            {oneByOne === 1 ? 'is' : 'are'} confirmed one at a time in the list.
          </p>
        )}
        <div className="flex items-center gap-1.5">
          <PrimaryButton
            disabled={busy || stale || selected.length === 0}
            onClick={() => {
              void apply();
            }}
          >
            {busy
              ? 'Applying…'
              : `Apply ${plural(selected.length, 'selected answer')}`}
          </PrimaryButton>
          <GhostButton disabled={busy} onClick={model.closeReview}>
            Cancel
          </GhostButton>
        </div>
      </div>
    </div>
  );
}

/** What applying did: applied, where and why it stopped, what is left. */
function BatchSummary({
  result,
  total,
  headingRef,
  remaining,
  onRestart,
  onClose,
}: {
  result: BatchResult;
  /** How many answers the user chose to apply. */
  total: number;
  headingRef: RefObject<HTMLParagraphElement | null>;
  remaining: number;
  onRestart: () => void;
  onClose: () => void;
}) {
  const { applied, stopped, skipped } = result;
  return (
    <div className="px-3.5 py-3">
      <p ref={headingRef} tabIndex={-1} className="font-medium outline-none">
        {stopped
          ? `Applied ${String(applied.length)} of ${plural(total, 'answer')}`
          : `Applied ${plural(applied.length, 'answer')}`}
      </p>
      {stopped ? (
        <div role="alert" className="mt-1 text-xs text-ink-2">
          <p>
            Stopped at “{stopped.report.field.label}”: {stopped.reason}
          </p>
          {skipped.length > 0 && (
            <p className="mt-1 text-ink-3">
              {plural(skipped.length, 'answer')} not attempted.
            </p>
          )}
        </div>
      ) : (
        <p className="mt-1 text-xs text-ink-2">
          Each was checked on the page. Nothing was submitted.
        </p>
      )}
      <div className="mt-2.5 flex items-center gap-1.5">
        {remaining > 0 && (
          <PrimaryButton onClick={onRestart}>
            Review {plural(remaining, 'remaining answer')}
          </PrimaryButton>
        )}
        <GhostButton onClick={onClose}>Back to fields</GhostButton>
      </div>
    </div>
  );
}

/** The same answers, for the same fields, as the review shows. */
function sameAnswers(
  shown: readonly FieldReport[],
  now: readonly FieldReport[],
): boolean {
  return (
    shown.length === now.length &&
    shown.every((report, index) => {
      const other = now[index];
      return (
        other?.field.element === report.field.element &&
        other.field.label === report.field.label &&
        other.value === report.value &&
        other.fillValue === report.fillValue
      );
    })
  );
}
