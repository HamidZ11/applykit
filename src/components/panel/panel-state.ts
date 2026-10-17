import { needsYou, type FieldReport } from '@/autofill/report';
import type { FieldElement, ScannedField } from '@/autofill/scan';
import type { AutofillValuesResponse } from '@/messages';

/**
 * The panel's single source of truth.
 *
 * Both presentation modes render from this state. Switching modes changes
 * only `mode` (and optionally `filter`): it never rescans, refills or clears
 * results, selection or review progress.
 */

export type PanelMode = 'compact' | 'expanded';

/** Expanded-mode list filter: everything, what ApplyKit handles, what needs you. */
export type FieldFilter = 'all' | 'handled' | 'you';

/** The confirmed profile's values, as last read for this panel. */
export type ValuesState = { status: 'loading' } | AutofillValuesResponse;

export interface PanelState {
  mode: PanelMode;
  filter: FieldFilter;
  /** `filling` while values are written and checked; never runs twice. */
  phase: 'ready' | 'filling' | 'done';
  fields: ScannedField[];
  values: ValuesState;
  /** What autofill actually did, or null before autofill or after a rescan. */
  outcomes: FieldReport[] | null;
  /**
   * Fields filled from a record the user chose, with their verified
   * outcomes. They take precedence over planned or autofill reports for the
   * same element, until a rescan.
   */
  confirmed: ReadonlyMap<FieldElement, FieldReport>;
  /** Screen-reader text for the latest choice the user confirmed. */
  notice: string;
  /**
   * The field the user is reviewing, by element so it survives rescans.
   * Shared by both modes: the compact queue's current step and the expanded
   * list's selected row are the same thing.
   */
  selected: FieldElement | null;
}

export type PanelAction =
  | { type: 'expand'; filter?: FieldFilter }
  | { type: 'collapse' }
  | { type: 'set-filter'; filter: FieldFilter }
  | { type: 'select'; element: FieldElement | null }
  | { type: 'values'; values: AutofillValuesResponse }
  | { type: 'fill-started' }
  /** Autofill could not start, e.g. the profile was removed meanwhile. */
  | { type: 'fill-stopped'; values: AutofillValuesResponse }
  | { type: 'autofilled'; fields: ScannedField[]; outcomes: FieldReport[] }
  /** A chosen record was written; `outcomes` are its section's fields. */
  | { type: 'resolved'; outcomes: FieldReport[]; notice: string }
  | { type: 'rescanned'; fields: ScannedField[] };

export function initialPanelState(fields: ScannedField[]): PanelState {
  return {
    mode: 'compact',
    filter: 'all',
    phase: 'ready',
    fields,
    values: { status: 'loading' },
    outcomes: null,
    confirmed: new Map(),
    notice: '',
    selected: null,
  };
}

export function panelReducer(
  state: PanelState,
  action: PanelAction,
): PanelState {
  switch (action.type) {
    case 'expand':
      return {
        ...state,
        mode: 'expanded',
        filter: action.filter ?? state.filter,
      };
    case 'collapse':
      return { ...state, mode: 'compact' };
    case 'set-filter':
      return { ...state, filter: action.filter };
    case 'select':
      return { ...state, selected: action.element };
    case 'values':
      return { ...state, values: action.values };
    case 'fill-started':
      return state.phase === 'ready' ? { ...state, phase: 'filling' } : state;
    case 'fill-stopped':
      return { ...state, phase: 'ready', values: action.values };
    case 'resolved': {
      const confirmed = new Map(state.confirmed);
      for (const outcome of action.outcomes) {
        confirmed.set(outcome.field.element, outcome);
      }
      return { ...state, confirmed, notice: action.notice };
    }
    case 'autofilled':
      return {
        ...state,
        phase: 'done',
        notice: '',
        fields: action.fields,
        outcomes: action.outcomes,
        selected: keepIfPresent(state.selected, action.fields),
      };
    case 'rescanned':
      return {
        ...state,
        phase: 'ready',
        fields: action.fields,
        outcomes: null,
        confirmed: new Map(),
        notice: '',
        selected: keepIfPresent(state.selected, action.fields),
      };
  }
}

function keepIfPresent(
  element: FieldElement | null,
  fields: readonly ScannedField[],
): FieldElement | null {
  return element && fields.some((field) => field.element === element)
    ? element
    : null;
}

/**
 * The next field to review: the one after the current selection in the
 * attention queue, wrapping around, or the first if nothing in the queue is
 * selected.
 */
export function nextInQueue(
  queue: readonly FieldReport[],
  selected: FieldElement | null,
): FieldElement | null {
  if (queue.length === 0) return null;
  const index = queue.findIndex((report) => report.field.element === selected);
  return queue[(index + 1) % queue.length]?.field.element ?? null;
}

export function matchesFilter(
  report: FieldReport,
  filter: FieldFilter,
): boolean {
  if (filter === 'all') return true;
  return filter === 'you' ? needsYou(report) : !needsYou(report);
}
