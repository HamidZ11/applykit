import type { AutofillValues } from './fields';
import { afterPageScripts, fillFields, guardPage } from './fill';
import { isBatchEligible, type FieldReport } from './report';
import { confirmAnswer } from './resolve';
import type { ScannedField } from './scan';

/**
 * Applying several suggested answers after one review (ADR 0022). Each
 * answer goes through exactly what "Use this answer" does: a fresh scan,
 * `confirmAnswer`, then `fillFields`, which verifies it. Answers are
 * applied one at a time in the order reviewed, and the batch stops at the
 * first answer that cannot be applied as reviewed, without retrying,
 * skipping ahead or undoing what was already applied.
 */

export interface BatchResult {
  /** Verified outcomes of the answers applied, in order. */
  applied: FieldReport[];
  /** Why the batch stopped early, at which answer, and its outcome if written. */
  stopped: {
    report: FieldReport;
    reason: string;
    outcome: FieldReport | null;
  } | null;
  /** Reviewed answers not attempted because the batch stopped. */
  skipped: FieldReport[];
}

const STOP = {
  ineligible:
    'This answer can no longer be applied with others. Review it again.',
  interrupted:
    'You used the page or left the tab while answers were applied, so ApplyKit stopped.',
  moved:
    'The page changed address while answers were applied, so ApplyKit stopped.',
  guarded:
    'The page tried to submit the form or leave it after this answer. ApplyKit stopped that, and stopped applying answers; check the form.',
} as const;

export async function applyReviewed(
  reviewed: readonly FieldReport[],
  {
    scan,
    values,
    now = new Date(),
    settle = afterPageScripts,
  }: {
    /** A fresh scan of the page, taken before each answer. */
    scan: () => ScannedField[];
    /** The saved values, read when the user confirmed the review. */
    values: AutofillValues;
    now?: Date;
    settle?: () => Promise<void>;
  },
): Promise<BatchResult> {
  const applied: FieldReport[] = [];
  const [first] = reviewed;
  const view = first?.field.element.ownerDocument.defaultView;
  if (!first || !view) return { applied, stopped: null, skipped: [] };
  const address = view.location.href;
  const guard = guardPage(view);
  try {
    for (const [index, report] of reviewed.entries()) {
      const stop = (
        reason: string,
        outcome: FieldReport | null = null,
      ): BatchResult => ({
        applied,
        stopped: { report, reason, outcome },
        skipped: reviewed.slice(index + 1),
      });
      if (guard.interrupted() || view.document.hidden) {
        return stop(STOP.interrupted);
      }
      if (view.location.href !== address) return stop(STOP.moved);
      if (!isBatchEligible(report)) return stop(STOP.ineligible);
      const check = confirmAnswer(scan(), values, report, now);
      if (!check.ok) return stop(check.message);
      const [outcome] = await fillFields(check.plan, settle);
      const kept =
        outcome?.status === 'filled' || outcome?.status === 'reformatted';
      if (kept) applied.push(outcome);
      if (guard.tripped()) return stop(STOP.guarded, outcome ?? null);
      if (!kept) {
        return stop(
          outcome?.reason ?? 'The page did not accept this answer.',
          outcome ?? null,
        );
      }
    }
    return { applied, stopped: null, skipped: [] };
  } finally {
    guard.remove();
  }
}
