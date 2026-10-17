import { describe, expect, it } from 'vitest';
import { autofill } from '@/autofill/fill';
import { attentionQueue, planFill, reportFill } from '@/autofill/report';
import { scanFields, type FormControl } from '@/autofill/scan';
import { SAMPLE_PROFILE } from '@/domain/profile';
import { loadFixture } from '@/test/load-fixture';
import {
  initialPanelState,
  matchesFilter,
  nextInQueue,
  panelReducer,
  type PanelAction,
  type PanelState,
} from './panel-state';

function element(id: string): FormControl {
  const found = document.getElementById(id);
  if (!found) throw new Error(`No #${id}`);
  return found as FormControl;
}

function filledState(): PanelState {
  loadFixture('job-application.html');
  const ready = initialPanelState(scanFields(document));
  return panelReducer(ready, {
    type: 'autofilled',
    result: autofill(document, SAMPLE_PROFILE),
    fields: scanFields(document),
  });
}

/** The attention queue after autofilling the job application fixture. */
function queueAfterFill() {
  loadFixture('job-application.html');
  const result = autofill(document, SAMPLE_PROFILE);
  return attentionQueue(reportFill(scanFields(document), result));
}

function apply(state: PanelState, actions: PanelAction[]): PanelState {
  return actions.reduce(panelReducer, state);
}

describe('panelReducer', () => {
  it('starts compact, ready and unselected', () => {
    loadFixture('job-application.html');
    const state = initialPanelState(scanFields(document));

    expect(state).toMatchObject({
      mode: 'compact',
      filter: 'all',
      phase: 'ready',
      result: null,
      selected: null,
    });
    expect(state.fields).toHaveLength(15);
  });

  it('switches modes without touching results, fields or selection', () => {
    const filled = panelReducer(filledState(), {
      type: 'select',
      element: element('phone'),
    });

    const expanded = panelReducer(filled, { type: 'expand' });
    const collapsed = panelReducer(expanded, { type: 'collapse' });

    expect(expanded.mode).toBe('expanded');
    expect(collapsed.mode).toBe('compact');
    for (const state of [expanded, collapsed]) {
      expect(state.phase).toBe('done');
      expect(state.result).toBe(filled.result);
      expect(state.fields).toBe(filled.fields);
      expect(state.selected).toBe(element('phone'));
      expect(state.filter).toBe(filled.filter);
    }
  });

  it('survives many expand and collapse cycles unchanged', () => {
    const start = panelReducer(filledState(), {
      type: 'select',
      element: element('location'),
    });
    const toggles: PanelAction[] = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0 ? { type: 'expand' } : { type: 'collapse' },
    );

    expect(apply(start, toggles)).toEqual(start);
  });

  it('opens the expanded mode on a requested filter and keeps it', () => {
    const state = apply(filledState(), [
      { type: 'expand', filter: 'you' },
      { type: 'collapse' },
      { type: 'expand' },
    ]);

    expect(state.filter).toBe('you');
  });

  it('keeps the mode and selection through autofill', () => {
    loadFixture('job-application.html');
    const before = apply(initialPanelState(scanFields(document)), [
      { type: 'expand' },
      { type: 'select', element: element('given') },
    ]);

    const after = panelReducer(before, {
      type: 'autofilled',
      result: autofill(document, SAMPLE_PROFILE),
      fields: scanFields(document),
    });

    expect(after).toMatchObject({ mode: 'expanded', phase: 'done' });
    expect(after.selected).toBe(element('given'));
  });

  it('clears results on rescan but keeps mode and selection', () => {
    const before = apply(filledState(), [
      { type: 'expand', filter: 'you' },
      { type: 'select', element: element('phone') },
    ]);

    const after = panelReducer(before, {
      type: 'rescanned',
      fields: scanFields(document),
    });

    expect(after).toMatchObject({
      mode: 'expanded',
      filter: 'you',
      phase: 'ready',
      result: null,
    });
    expect(after.selected).toBe(element('phone'));
  });

  it('drops a selection whose field is gone after a rescan', () => {
    const before = panelReducer(filledState(), {
      type: 'select',
      element: element('phone'),
    });
    element('phone').remove();

    const after = panelReducer(before, {
      type: 'rescanned',
      fields: scanFields(document),
    });

    expect(after.selected).toBeNull();
  });
});

describe('nextInQueue', () => {
  it('starts at the most urgent field, then wraps around', () => {
    const queue = queueAfterFill();

    const first = nextInQueue(queue, null);
    const second = nextInQueue(queue, first);
    const last = queue.at(-1)?.field.element ?? null;

    expect(first).toBe(element('phone'));
    expect(second).toBe(element('location'));
    expect(nextInQueue(queue, last)).toBe(first);
  });

  it('starts from the top when the selection is not in the queue', () => {
    const queue = queueAfterFill();

    expect(nextInQueue(queue, element('given'))).toBe(element('phone'));
  });

  it('returns null when nothing needs the user', () => {
    expect(nextInQueue([], null)).toBeNull();
  });
});

describe('matchesFilter', () => {
  it('splits fields into handled and needs-you without overlap', () => {
    loadFixture('job-application.html');
    const reports = planFill(scanFields(document), SAMPLE_PROFILE);

    const handled = reports.filter((r) => matchesFilter(r, 'handled'));
    const you = reports.filter((r) => matchesFilter(r, 'you'));

    expect(handled).toHaveLength(3);
    expect(you).toHaveLength(12);
    expect(reports.filter((r) => matchesFilter(r, 'all'))).toHaveLength(15);
  });
});
