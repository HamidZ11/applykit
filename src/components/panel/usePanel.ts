import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { fillFields } from '@/autofill/fill';
import {
  attentionQueue,
  planFill,
  summarise,
  type FieldReport,
  type ReportSummary,
} from '@/autofill/report';
import {
  confirmChoice,
  previewChoice,
  type ChoicePreview,
  type SectionChoice,
} from '@/autofill/resolve';
import { scanFields, type FieldElement } from '@/autofill/scan';
import type { AutofillValuesResponse } from '@/messages';
import { goToField, type GoToResult } from '@/page/navigate';
import { readPageContext, type PageContext } from '@/page/page-context';
import {
  initialPanelState,
  nextInQueue,
  panelReducer,
  type FieldFilter,
  type PanelState,
} from './panel-state';
import { requestAutofillValues } from './profile-access';
import { plural } from './vocabulary';

/** Reads the confirmed profile's values; injectable for tests. */
export type LoadValues = () => Promise<AutofillValuesResponse>;

/** What happened when the user confirmed a chosen record. */
export type ChoiceResult =
  { ok: true; filled: number; total: number } | { ok: false; message: string };

export interface PanelModel extends PanelState {
  page: PageContext;
  /** One report per field, in page order. */
  reports: FieldReport[];
  summary: ReportSummary;
  /** Fields the user must complete, most urgent first. */
  queue: FieldReport[];
  /** Screen-reader text describing the latest outcome. */
  announcement: string;
  autofill: () => void;
  rescan: () => void;
  expand: (filter?: FieldFilter) => void;
  collapse: () => void;
  setFilter: (filter: FieldFilter) => void;
  /** Selects a field, or clears the selection when it is already selected. */
  toggleSelect: (element: FieldElement) => void;
  clearSelection: () => void;
  /** Moves to the next field that needs the user, in priority order. */
  next: () => void;
  /** What choosing a saved record for a section would fill; no page changes. */
  previewChoice: (choice: SectionChoice) => ChoicePreview | null;
  /**
   * Fills a section from the record the user chose, after re-checking that
   * the page and profile still match the preview (`previewed` fields).
   */
  applyChoice: (
    choice: SectionChoice,
    previewed: readonly FieldReport[],
  ) => Promise<ChoiceResult>;
  /** Scrolls to a field of the current scan and focuses it if safe. */
  goToField: (element: FieldElement) => GoToResult;
}

/**
 * The panel's state and actions, shared by the compact and expanded modes.
 *
 * Profile lifecycle: the confirmed profile's values are read when the panel
 * opens, on every explicit rescan, and again immediately before autofill
 * writes anything, so a profile edited in another tab is never filled from
 * a stale copy. Nothing listens for storage changes and nothing is filled
 * automatically when the profile changes.
 *
 * The page is scanned when the panel opens, again right before autofill and
 * on an explicit rescan. Nothing else touches the page.
 */
export function usePanel(
  loadValues: LoadValues = requestAutofillValues,
  root: ParentNode = document,
): PanelModel {
  const [state, dispatch] = useReducer(panelReducer, root, (r) =>
    initialPanelState(scanFields(r)),
  );
  const [page] = useState(readPageContext);
  // The newest read wins, so a slow earlier reply never replaces fresh values.
  const latestRequest = useRef(0);
  const filling = useRef(false);

  const refreshValues = useCallback(async () => {
    const request = ++latestRequest.current;
    const values = await loadValues();
    if (request === latestRequest.current) dispatch({ type: 'values', values });
  }, [loadValues]);

  const onOpen = useEffectEvent(() => {
    void refreshValues();
  });
  useEffect(() => {
    onOpen();
  }, []);

  const values = state.values.status === 'ready' ? state.values.values : null;
  // Every scan produces a new `fields` array, so plans re-read values the
  // user typed since the last scan.
  const reports = useMemo(
    () =>
      (state.outcomes ?? planFill(state.fields, values)).map(
        (report) => state.confirmed.get(report.field.element) ?? report,
      ),
    [state.fields, state.outcomes, state.confirmed, values],
  );
  const summary = useMemo(() => summarise(reports), [reports]);
  const queue = useMemo(() => attentionQueue(reports), [reports]);

  const runAutofill = useCallback(async () => {
    if (filling.current) return;
    filling.current = true;
    dispatch({ type: 'fill-started' });
    try {
      // Always the latest saved profile, not the copy read on open.
      const request = ++latestRequest.current;
      const latest = await loadValues();
      if (request === latestRequest.current) {
        dispatch({ type: 'values', values: latest });
      }
      if (latest.status !== 'ready') {
        dispatch({ type: 'fill-stopped', values: latest });
        return;
      }
      const fields = scanFields(root);
      const outcomes = await fillFields(planFill(fields, latest.values));
      dispatch({ type: 'autofilled', fields, outcomes });
    } catch {
      // Show the page as it is now rather than a result that is not known.
      dispatch({ type: 'rescanned', fields: scanFields(root) });
    } finally {
      filling.current = false;
    }
  }, [loadValues, root]);

  const preview = useCallback(
    (choice: SectionChoice) =>
      values ? previewChoice(state.fields, values, choice) : null,
    [state.fields, values],
  );

  const applyChoice = useCallback(
    async (
      choice: SectionChoice,
      previewed: readonly FieldReport[],
    ): Promise<ChoiceResult> => {
      if (filling.current) {
        return { ok: false, message: 'ApplyKit is still filling. Try again.' };
      }
      filling.current = true;
      try {
        // As for autofill: the latest saved profile and the page as it is now.
        const request = ++latestRequest.current;
        const latest = await loadValues();
        if (request === latestRequest.current) {
          dispatch({ type: 'values', values: latest });
        }
        if (latest.status !== 'ready') {
          return {
            ok: false,
            message:
              'Your saved profile could not be read. Nothing was filled.',
          };
        }
        const check = confirmChoice(
          scanFields(root),
          latest.values,
          choice,
          previewed,
        );
        if (!check.ok) return check;
        const outcomes = await fillFields(check.plan);
        const filled = outcomes.filter(
          (r) =>
            r.chosen && (r.status === 'filled' || r.status === 'reformatted'),
        ).length;
        const notice = `Filled ${plural(filled, 'field')} from the record you chose. Nothing was submitted.`;
        dispatch({ type: 'resolved', outcomes, notice });
        return { ok: true, filled, total: outcomes.length };
      } catch {
        return {
          ok: false,
          message: 'Something went wrong. Nothing more was filled.',
        };
      } finally {
        filling.current = false;
      }
    },
    [loadValues, root],
  );

  const goTo = useCallback(
    (element: FieldElement) =>
      goToField(element, new Set(state.fields.map((field) => field.element))),
    [state.fields],
  );

  const autofill = useCallback(() => {
    void runAutofill();
  }, [runAutofill]);

  const rescan = useCallback(() => {
    if (filling.current) return;
    dispatch({ type: 'rescanned', fields: scanFields(root) });
    void refreshValues();
  }, [root, refreshValues]);

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
    (element: FieldElement) => {
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
    announcement:
      state.notice || (state.phase === 'done' ? describeOutcome(summary) : ''),
    autofill,
    rescan,
    expand,
    collapse,
    setFilter,
    toggleSelect,
    clearSelection,
    next,
    previewChoice: preview,
    applyChoice,
    goToField: goTo,
  };
}

function describeOutcome(summary: ReportSummary): string {
  const parts = [
    `Autofill finished. Filled ${plural(summary.filled, 'field')}`,
  ];
  if (summary.kept) {
    parts.push(
      `kept ${plural(summary.kept, 'existing entry', 'existing entries')}`,
    );
  }
  if (summary.failed) {
    parts.push(`${plural(summary.failed, 'field')} not accepted`);
  }
  parts.push(`${plural(summary.needsYou, 'field')} need you`);
  return `${parts.join(', ')}. Nothing was submitted.`;
}
