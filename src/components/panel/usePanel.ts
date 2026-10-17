import { useCallback, useMemo, useReducer, useState } from 'react';
import { autofill as runAutofill } from '@/autofill/fill';
import {
  attentionQueue,
  planFill,
  reportFill,
  summarise,
  type FieldReport,
  type ReportSummary,
} from '@/autofill/report';
import { scanFields, type FormControl } from '@/autofill/scan';
import {
  PROFILE_FIELDS,
  SAMPLE_PROFILE,
  type Profile,
  type ProfileField,
} from '@/domain/profile';
import { readPageContext, type PageContext } from '@/page/page-context';
import {
  initialPanelState,
  nextInQueue,
  panelReducer,
  type FieldFilter,
  type PanelState,
} from './panel-state';
import { plural } from './vocabulary';

export interface PanelModel extends PanelState {
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
  expand: (filter?: FieldFilter) => void;
  collapse: () => void;
  setFilter: (filter: FieldFilter) => void;
  /** Selects a field, or clears the selection when it is already selected. */
  toggleSelect: (element: FormControl) => void;
  clearSelection: () => void;
  /** Moves to the next field that needs the user, in priority order. */
  next: () => void;
}

/**
 * The panel's state and actions, shared by the compact and expanded modes.
 *
 * The page is scanned once on open, again after autofill (to read the values
 * actually written) and on an explicit rescan. Nothing else touches the page.
 */
export function usePanel(
  profile: Profile = SAMPLE_PROFILE,
  root: ParentNode = document,
): PanelModel {
  const [state, dispatch] = useReducer(panelReducer, root, (r) =>
    initialPanelState(scanFields(r)),
  );
  const [page] = useState(readPageContext);

  // Every scan produces a new `fields` array, so plans re-read values the
  // user typed since the last scan.
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

  const autofill = useCallback(() => {
    const result = runAutofill(root, profile);
    dispatch({ type: 'autofilled', fields: scanFields(root), result });
  }, [root, profile]);

  const rescan = useCallback(() => {
    dispatch({ type: 'rescanned', fields: scanFields(root) });
  }, [root]);

  const expand = useCallback((filter?: FieldFilter) => {
    dispatch(filter ? { type: 'expand', filter } : { type: 'expand' });
  }, []);
  const collapse = useCallback(() => {
    dispatch({ type: 'collapse' });
  }, []);
  const setFilter = useCallback((filter: FieldFilter) => {
    dispatch({ type: 'set-filter', filter });
  }, []);
  const clearSelection = useCallback(() => {
    dispatch({ type: 'select', element: null });
  }, []);
  const toggleSelect = useCallback(
    (element: FormControl) => {
      dispatch({
        type: 'select',
        element: state.selected === element ? null : element,
      });
    },
    [state.selected],
  );
  const next = useCallback(() => {
    const element = nextInQueue(queue, state.selected);
    if (!element) return;
    dispatch({ type: 'select', element });
    // Keep the newly selected field visible in the expanded list.
    if (state.mode === 'expanded' && state.filter === 'handled') {
      dispatch({ type: 'set-filter', filter: 'you' });
    }
  }, [queue, state.selected, state.mode, state.filter]);

  return {
    ...state,
    page,
    reports,
    summary,
    queue,
    missing,
    announcement: state.phase === 'done' ? describeOutcome(summary) : '',
    autofill,
    rescan,
    expand,
    collapse,
    setFilter,
    toggleSelect,
    clearSelection,
    next,
  };
}

function describeOutcome(summary: ReportSummary): string {
  const parts = [
    `Autofill complete. Filled ${plural(summary.filled, 'field')}`,
  ];
  if (summary.kept) {
    parts.push(
      `kept ${plural(summary.kept, 'existing entry', 'existing entries')}`,
    );
  }
  parts.push(`${plural(summary.needsYou, 'field')} need you`);
  return `${parts.join(', ')}.`;
}
