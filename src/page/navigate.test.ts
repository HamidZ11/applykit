import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { scanFields } from '@/autofill/scan';
import { loadFixture } from '@/test/load-fixture';
import { goToField } from './navigate';

beforeAll(() => {
  window.matchMedia = (query: string) =>
    ({ matches: false, media: query }) as MediaQueryList;
});

afterEach(() => {
  vi.restoreAllMocks();
});

function setup() {
  loadFixture('custom-controls.html');
  const fields = scanFields(document);
  const known = new Set(fields.map((f) => f.element));
  const element = (id: string) => {
    const found = document.getElementById(id);
    if (!found) throw new Error(`No #${id}`);
    return found;
  };
  return { known, element };
}

describe('goToField', () => {
  it.each(['residence', 'qual-button', 'start-month', 'grad-year'])(
    'only scrolls to the custom control #%s: no focus, click or keys',
    (id) => {
      const { known, element } = setup();
      const target = element(id);
      const scroll = vi.fn();
      target.scrollIntoView = scroll;
      const events: string[] = [];
      for (const type of [
        'focus',
        'focusin',
        'click',
        'mousedown',
        'pointerdown',
        'keydown',
        'input',
        'change',
      ]) {
        document.addEventListener(type, () => events.push(type), true);
      }
      const before = target.outerHTML;

      const result = goToField(target, known);

      expect(result).toEqual({ ok: true, focused: false });
      expect(scroll).toHaveBeenCalledWith({
        block: 'center',
        behavior: 'smooth',
      });
      expect(document.activeElement).not.toBe(target);
      expect(events).toEqual([]);
      expect(target.outerHTML).toBe(before);
    },
  );

  it('scrolls to and focuses a plain native field', () => {
    const { known, element } = setup();
    const target = element('first');
    target.scrollIntoView = vi.fn();

    expect(goToField(target, known)).toEqual({ ok: true, focused: true });
    expect(document.activeElement).toBe(target);
  });

  it('refuses a field that has left the page', () => {
    const { known, element } = setup();
    const target = element('edu-1-inst');
    target.remove();

    expect(goToField(target, known)).toEqual({
      ok: false,
      message:
        'This field is no longer on the page. Rescan to update the list.',
    });
  });

  it('refuses elements that were not scanned as fields', () => {
    const { known, element } = setup();

    expect(goToField(element('office'), known).ok).toBe(false);
    expect(goToField(element('add-question'), known).ok).toBe(false);
  });

  it('never submits the form', () => {
    const { known, element } = setup();
    const form = document.getElementById('application') as HTMLFormElement;
    const submit = vi.fn((e: Event) => {
      e.preventDefault();
    });
    form.addEventListener('submit', submit);
    const target = element('qual-button');
    target.scrollIntoView = vi.fn();

    goToField(target, known);

    expect(submit).not.toHaveBeenCalled();
    expect(document.activeElement).not.toBe(target);
  });
});
