import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { CountryField } from './CountryField';

let root: Root;
let host: HTMLElement;
let onChange: ReturnType<typeof vi.fn<(code: string) => void>>;

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <CountryField
      label="Country"
      value={value}
      onValueChange={(code) => {
        onChange(code);
        setValue(code);
      }}
    />
  );
}

function render(initial = '') {
  act(() => {
    root.render(<Harness initial={initial} />);
  });
}

function combobox(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('[role="combobox"]');
  if (!input) throw new Error('No combobox');
  return input;
}

function options(): string[] {
  return [...host.querySelectorAll('[role="option"]')].map(
    (option) => option.textContent,
  );
}

function typeInto(text: string) {
  act(() => {
    combobox().focus();
    Reflect.set(HTMLInputElement.prototype, 'value', text, combobox());
    combobox().dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function press(key: string) {
  act(() => {
    combobox().dispatchEvent(
      new KeyboardEvent('keydown', { key, bubbles: true }),
    );
  });
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  onChange = vi.fn<(code: string) => void>();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

describe('CountryField', () => {
  it('shows the selected country by name', () => {
    render('GB');

    expect(combobox().value).toBe('United Kingdom');
    expect(combobox().getAttribute('aria-expanded')).toBe('false');
  });

  it('filters countries as the user types', () => {
    render();
    typeInto('germ');

    expect(combobox().getAttribute('aria-expanded')).toBe('true');
    expect(options()).toEqual(['Germany']);
  });

  it('chooses with the keyboard and reports the ISO code', () => {
    render();
    typeInto('united');
    press('ArrowDown');

    const active = combobox().getAttribute('aria-activedescendant');
    expect(active && document.getElementById(active)?.textContent).toBe(
      'United Kingdom',
    );

    press('Enter');

    expect(onChange).toHaveBeenLastCalledWith('GB');
    expect(combobox().value).toBe('United Kingdom');
    expect(host.querySelector('[role="listbox"]')).toBeNull();
  });

  it('chooses with the pointer', () => {
    render();
    typeInto('fra');
    const france = [
      ...host.querySelectorAll<HTMLElement>('[role="option"]'),
    ].find((option) => option.textContent === 'France');

    act(() => {
      france?.click();
    });

    expect(onChange).toHaveBeenLastCalledWith('FR');
  });

  it('finds countries by alias', () => {
    render();
    typeInto('great britain');

    expect(options()[0]).toBe('United Kingdom');
  });

  it('restores the previous choice on Escape', () => {
    render('DE');
    typeInto('fra');
    press('Escape');

    expect(combobox().value).toBe('Germany');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('accepts an exact name or alias typed without choosing', () => {
    render();
    typeInto('uk');

    act(() => {
      combobox().blur();
    });

    expect(onChange).toHaveBeenLastCalledWith('GB');
    expect(combobox().value).toBe('United Kingdom');
  });

  it('does not guess from partial text when leaving the field', () => {
    render('DE');
    typeInto('unit');

    act(() => {
      combobox().blur();
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(combobox().value).toBe('Germany');
  });

  it('says when nothing matches', () => {
    render();
    typeInto('atlantis');

    expect(options()).toEqual([]);
    expect(host.textContent).toContain('No countries match “atlantis”');
  });
});
