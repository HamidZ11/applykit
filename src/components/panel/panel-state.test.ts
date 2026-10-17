import { describe, expect, it } from 'vitest';
import { fillFields } from '@/autofill/fill';
import { attentionQueue, planFill, type FieldReport } from '@/autofill/report';
import { scanFields, type FormControl } from '@/autofill/scan';
import { sampleValues } from '@/test/autofill-fixtures';
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

/** Fills the current document from the fictional test profile. */
async function fill(): Promise<FieldReport[]> {
  return fillFields(planFill(scanFields(document), sampleValues()));
}

async function filledState(): Promise<PanelState> {
  loadFixture('job-application.html');
  const ready = initialPanelState(scanFields(document));
  return panelReducer(ready, {
    type: 'autofilled',
    outcomes: await fill(),
    fields: scanFields(document),
  });
}

/** The attention queue after autofilling the job application fixture. */
async function queueAfterFill() {
  loadFixture('job-application.html');
  return attentionQueue(await fill());
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
      values: { status: 'loading' },
      outcomes: null,
      selected: null,
    });
    expect(state.fields).toHaveLength(15);
  });

  it('stores profile values as they arrive, in any phase', async () => {
    const values = { status: 'ready', values: sampleValues() } as const;

    const state = panelReducer(await filledState(), { type: 'values', values });

    expect(state.values).toBe(values);
    expect(state.phase).toBe('done');
  });

  it('enters the filling phase once, and only from ready', async () => {
    loadFixture('job-application.html');
    const ready = initialPanelState(scanFields(document));

    const filling = panelReducer(ready, { type: 'fill-started' });

    expect(filling.phase).toBe('filling');
    expect(panelReducer(filling, { type: 'fill-started' })).toBe(filling);
    const done = await filledState();
    expect(panelReducer(done, { type: 'fill-started' })).toBe(done);
  });

  it('returns to ready when autofill cannot start', () => {
    loadFixture('job-application.html');
    const filling = panelReducer(initialPanelState(scanFields(document)), {
      type: 'fill-started',
    });

    const stopped = panelReducer(filling, {
      type: 'fill-stopped',
      values: { status: 'missing' },
    });

    expect(stopped).toMatchObject({
      phase: 'ready',
      values: { status: 'missing' },
      outcomes: null,
    });
  });

  it('switches modes without touching results, fields or selection', async () => {
    const filled = panelReducer(await filledState(), {
      type: 'select',
      element: element('phone'),
    });

    const expanded = panelReducer(filled, { type: 'expand' });
    const collapsed = panelReducer(expanded, { type: 'collapse' });

    expect(expanded.mode).toBe('expanded');
    expect(collapsed.mode).toBe('compact');
    for (const state of [expanded, collapsed]) {
      expect(state.phase).toBe('done');
      expect(state.outcomes).toBe(filled.outcomes);
      expect(state.fields).toBe(filled.fields);
      expect(state.selected).toBe(element('phone'));
      expect(state.filter).toBe(filled.filter);
    }
  });

  it('survives many expand and collapse cycles unchanged', async () => {
    const start = panelReducer(await filledState(), {
      type: 'select',
      element: element('location'),
    });
    const toggles: PanelAction[] = Array.from({ length: 20 }, (_, i) =>
      i % 2 === 0 ? { type: 'expand' } : { type: 'collapse' },
    );

    expect(apply(start, toggles)).toEqual(start);
  });

  it('opens the expanded mode on a requested filter and keeps it', async () => {
    const state = apply(await filledState(), [
      { type: 'expand', filter: 'you' },
      { type: 'collapse' },
      { type: 'expand' },
    ]);

    expect(state.filter).toBe('you');
  });

  it('keeps the mode and selection through autofill', async () => {
    loadFixture('job-application.html');
    const before = apply(initialPanelState(scanFields(document)), [
      { type: 'expand' },
      { type: 'select', element: element('given') },
    ]);

    const after = panelReducer(before, {
      type: 'autofilled',
      outcomes: await fill(),
      fields: scanFields(document),
    });

    expect(after).toMatchObject({ mode: 'expanded', phase: 'done' });
    expect(after.selected).toBe(element('given'));
  });

  it('clears results on rescan but keeps mode and selection', async () => {
    const before = apply(await filledState(), [
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
      outcomes: null,
    });
    expect(after.selected).toBe(element('phone'));
  });

  it('keeps confirmed choices until a rescan', async () => {
    const done = await filledState();
    const [first] = done.outcomes ?? [];
    if (!first) throw new Error('No outcome');
    const chosen = { ...first, status: 'filled' as const, chosen: true };

    const resolved = panelReducer(done, {
      type: 'resolved',
      outcomes: [chosen],
      notice:
        'Filled 1 field from the record you chose. Nothing was submitted.',
    });

    expect(resolved.confirmed.get(first.field.element)).toBe(chosen);
    expect(resolved.outcomes).toBe(done.outcomes);
    expect(resolved.notice).toContain('record you chose');
    const rescanned = panelReducer(resolved, {
      type: 'rescanned',
      fields: scanFields(document),
    });
    expect(rescanned.confirmed.size).toBe(0);
    expect(rescanned.notice).toBe('');
  });

  it('drops a selection whose field is gone after a rescan', async () => {
    const before = panelReducer(await filledState(), {
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
  it('starts at the most urgent field, then wraps around', async () => {
    const queue = await queueAfterFill();

    const first = nextInQueue(queue, null);
    const second = nextInQueue(queue, first);
    const last = queue.at(-1)?.field.element ?? null;

    expect(first).toBe(element('location'));
    expect(second).toBe(element('resume'));
    expect(nextInQueue(queue, last)).toBe(first);
  });

  it('starts from the top when the selection is not in the queue', async () => {
    const queue = await queueAfterFill();

    expect(nextInQueue(queue, element('given'))).toBe(element('location'));
  });

  it('returns null when nothing needs the user', () => {
    expect(nextInQueue([], null)).toBeNull();
  });
});

describe('matchesFilter', () => {
  it('splits fields into handled and needs-you without overlap', () => {
    loadFixture('job-application.html');
    const reports = planFill(scanFields(document), sampleValues());

    const handled = reports.filter((r) => matchesFilter(r, 'handled'));
    const you = reports.filter((r) => matchesFilter(r, 'you'));

    expect(handled).toHaveLength(7);
    expect(you).toHaveLength(8);
    expect(reports.filter((r) => matchesFilter(r, 'all'))).toHaveLength(15);
  });
});
