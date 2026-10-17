import { useCallback, useMemo, useState } from 'react';
import { autofill, type FillResult } from '@/autofill/fill';
import {
  attentionQueue,
  planFill,
  reportFill,
  summarise,
  type FieldReport,
  type ReportSummary,
} from '@/autofill/report';
import { scanFields, type ScannedField } from '@/autofill/scan';
import {
  PROFILE_FIELDS,
  SAMPLE_PROFILE,
  type Profile,
  type ProfileField,
} from '@/domain/profile';
import { readPageContext, type PageContext } from '@/page/page-context';

export type SessionPhase = 'ready' | 'done';

interface SessionState {
  phase: SessionPhase;
  fields: ScannedField[];
  result: FillResult | null;
}

export interface AutofillSession {
  phase: SessionPhase;
  page: PageContext;
  /** One report per field, in page order. */
  reports: FieldReport[];
  summary: ReportSummary;
  /** Fields the user must complete, most urgent first. */
  queue: FieldReport[];
  /** Profile fields this form does not ask for. */
  missing: ProfileField[];
  /** Screen-reader text describing the latest outcome. */
  announcement: string;
  autofill: () => void;
  rescan: () => void;
}

/**
 * The shared panel workflow: scan the page, plan, autofill, report.
 * Both design concepts use this unchanged; they differ only in presentation.
 */
export function useAutofillSession(
  profile: Profile = SAMPLE_PROFILE,
  root: ParentNode = document,
): AutofillSession {
  const [state, setState] = useState<SessionState>(() => ({
    phase: 'ready',
    fields: scanFields(root),
    result: null,
  }));
  const [page] = useState(readPageContext);

  // Every scan produces a new `fields` array, so the plan re-reads values the
  // user typed since the last one.
  const reports = useMemo(
    () =>
      state.result
        ? reportFill(state.fields, state.result)
        : planFill(state.fields, profile),
    [state.fields, state.result, profile],
  );
  const summary = useMemo(() => summarise(reports), [reports]);
  const queue = useMemo(() => attentionQueue(reports), [reports]);
  const missing = useMemo(() => {
    const present = new Set(
      state.fields.flatMap((field) =>
        field.support.status === 'fillable' ? [field.support.field] : [],
      ),
    );
    return PROFILE_FIELDS.filter((field) => !present.has(field));
  }, [state.fields]);

  const runAutofill = useCallback(() => {
    const result = autofill(root, profile);
    setState({ phase: 'done', fields: scanFields(root), result });
  }, [root, profile]);

  const rescan = useCallback(() => {
    setState({ phase: 'ready', fields: scanFields(root), result: null });
  }, [root]);

  return {
    phase: state.phase,
    page,
    reports,
    summary,
    queue,
    missing,
    announcement: state.phase === 'done' ? describeOutcome(summary) : '',
    autofill: runAutofill,
    rescan,
  };
}

function describeOutcome(summary: ReportSummary): string {
  const parts = [
    `Autofill complete. Filled ${plural(summary.filled, 'field')}`,
  ];
  if (summary.kept)
    parts.push(
      `kept ${plural(summary.kept, 'existing entry', 'existing entries')}`,
    );
  parts.push(`${plural(summary.needsYou, 'field')} need you`);
  return `${parts.join(', ')}.`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}
