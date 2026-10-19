import { useState, type MouseEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { savedAnswers } from '@/test/answer-fixtures';
import { fullProfile } from '@/test/autofill-fixtures';
import { loadHtml } from '@/test/load-fixture';
import { afterPageScripts, chooseCustomOption } from './fill';
import { autofillValuesFrom } from './profile-values';
import { planFill } from './report';
import { chooseSuggestedOption } from './resolve';
import { scanFields } from './scan';

/**
 * Custom dropdowns as React components build them (ADR 0021): state kept
 * by the component, a list portalled to the end of the page and named by
 * `aria-controls` only while open. ApplyKit's choice counts only when the
 * component's own state took it.
 */

const NOW = new Date('2026-10-19T12:00:00Z');
const FAST = { step: afterPageScripts, steps: 10 };
const OPTIONS = ['Office-based', 'Hybrid', 'Fully remote'];

let root: Root | null = null;

beforeAll(() => {
  // The operation runs as a page would see it, outside act().
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = false;
});

afterEach(() => {
  root?.unmount();
  root = null;
});

type Opening = 'click' | 'mousedown';

/**
 * A listbox in the shape of Headless UI's: a button opening a portalled
 * list on `opening`, options choosing on click. With `mouseOnly`, the
 * options ignore clicks without a main mouse button, as some components
 * do; their state then never changes.
 */
function Listbox({
  opening = 'click',
  mouseOnly = false,
}: {
  opening?: Opening;
  mouseOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string | null>(null);
  const toggle = () => {
    setOpen((was) => !was);
  };
  return (
    <form>
      <span id="arrangement-label">Preferred working arrangement</span>
      <button
        id="arrangement"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby="arrangement-label"
        {...(open ? { 'aria-controls': 'arrangement-options' } : {})}
        {...(opening === 'click'
          ? { onClick: toggle }
          : { onMouseDown: toggle })}
      >
        {value ?? 'Select…'}
      </button>
      <output id="state">{value ?? 'none'}</output>
      <label htmlFor="email">Email</label>
      <input id="email" type="email" />
      {open &&
        createPortal(
          <ul id="arrangement-options" role="listbox">
            {OPTIONS.map((option) => (
              <li
                key={option}
                role="option"
                aria-selected={option === value}
                onClick={(event: MouseEvent) => {
                  if (mouseOnly && event.button !== 0) return;
                  setValue(option);
                  setOpen(false);
                }}
              >
                {option}
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </form>
  );
}

function render(element: React.ReactElement) {
  const container = loadHtml('<div id="root"></div>').getElementById('root');
  if (!container) throw new Error('No root');
  const created = createRoot(container);
  root = created;
  flushSync(() => {
    created.render(element);
  });
}

const trigger = () => {
  const found = document.getElementById('arrangement');
  if (!found) throw new Error('No trigger');
  return found;
};
const state = () => document.getElementById('state')?.textContent;

describe('React listboxes', () => {
  it('updates the component’s own state, through its portalled list', async () => {
    render(<Listbox />);
    const values = autofillValuesFrom(fullProfile(), savedAnswers());
    const fields = scanFields(document);
    const previewed = planFill(fields, values, NOW).find(
      (report) => report.field.element === trigger(),
    );
    expect(previewed).toMatchObject({ status: 'suggest', value: 'Hybrid' });
    if (!previewed) return;

    const result = await chooseSuggestedOption(
      fields,
      values,
      previewed,
      () => Promise.resolve(null),
      { now: NOW, timing: FAST },
    );

    expect(result).toMatchObject({ ok: true, report: { status: 'filled' } });
    expect(state()).toBe('Hybrid');
    expect(trigger().textContent).toBe('Hybrid');
    expect(document.getElementById('arrangement-options')).toBeNull();
  });

  it('reports a component opening only on a mouse press as manual', async () => {
    render(<Listbox opening="mousedown" />);

    const outcome = await chooseCustomOption(
      trigger(),
      () => Promise.resolve({ label: 'Hybrid' }),
      FAST,
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('needs manual selection') as string,
    });
    expect(state()).toBe('none');
    expect(document.getElementById('arrangement-options')).toBeNull();
  });

  it('never reports success when the component ignores the choice', async () => {
    render(<Listbox mouseOnly />);

    const outcome = await chooseCustomOption(
      trigger(),
      () => Promise.resolve({ label: 'Hybrid' }),
      FAST,
    );

    expect(outcome).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('could not verify') as string,
    });
    expect(state()).toBe('none');
    // Closed again by ApplyKit, as it opened it.
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });
});
