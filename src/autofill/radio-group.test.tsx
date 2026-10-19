import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadHtml } from '@/test/load-fixture';
import { fillFields, selectRadio } from './fill';
import {
  checkedRadio,
  groupMembers,
  optionToChoose,
  radioGroupOf,
  radioLabel,
} from './radio-group';
import type { FieldReport } from './report';
import { scanFields } from './scan';

const visible = { isVisible: (e: Element) => !e.closest('[hidden]') };

function radio(id: string): HTMLInputElement {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLInputElement)) throw new Error(`No #${id}`);
  return element;
}

const YES_NO = (name: string, prefix = name) => `
  <label><input type="radio" id="${prefix}-y" name="${name}" value="1"> Yes</label>
  <label><input type="radio" id="${prefix}-n" name="${name}" value="0"> No</label>`;

describe('radioGroupOf', () => {
  it('reads a fieldset group: its question and labelled options', () => {
    loadHtml(
      `<form><fieldset><legend>Will you relocate?</legend>${YES_NO('move')}</fieldset></form>`,
    );

    const group = radioGroupOf(radio('move-y'));

    expect(group?.question).toBe('Will you relocate?');
    expect(group?.options.map((o) => o.label)).toEqual(['Yes', 'No']);
  });

  it('reads an ARIA radio group named by text outside it', () => {
    loadHtml(`<form><p id="q">Do you need a visa?</p>
      <div role="radiogroup" aria-labelledby="q">${YES_NO('visa')}</div></form>`);

    expect(radioGroupOf(radio('visa-y'))?.question).toBe('Do you need a visa?');
  });

  it('reads labels by what they say, never by value', () => {
    loadHtml(`<form><fieldset><legend>Gender</legend>
      <input type="radio" id="m" name="g" value="M"><label for="m">Man</label>
      <input type="radio" id="w" name="g" value="F" aria-label="Woman">
      </fieldset></form>`);

    expect(radioGroupOf(radio('m'))?.options.map((o) => o.label)).toEqual([
      'Man',
      'Woman',
    ]);
    expect(radioLabel(radio('w'))).toBe('Woman');
  });

  it.each([
    ['no container', `<form><p>Relocate?</p>${YES_NO('move')}</form>`],
    [
      'two questions in one container',
      `<form><fieldset><legend>Questions</legend>${YES_NO('move')}${YES_NO('travel')}</fieldset></form>`,
    ],
    [
      'a member outside the container',
      `<form><fieldset><legend>Relocate?</legend>
        <label><input type="radio" id="move-y" name="move"> Yes</label></fieldset>
        <label><input type="radio" name="move"> No</label></form>`,
    ],
    [
      'an unlabelled option',
      `<form><fieldset><legend>Relocate?</legend>
        <label><input type="radio" id="move-y" name="move"> Yes</label>
        <input type="radio" name="move"></fieldset></form>`,
    ],
    [
      'two options reading the same',
      `<form><fieldset><legend>Relocate?</legend>
        <label><input type="radio" id="move-y" name="move"> Yes</label>
        <label><input type="radio" name="move"> yes!</label></fieldset></form>`,
    ],
    ['no question', `<form><fieldset>${YES_NO('move')}</fieldset></form>`],
    [
      'no name',
      `<form><fieldset><legend>Relocate?</legend>
        <label><input type="radio" id="move-y"> Yes</label>
        <label><input type="radio"> No</label></fieldset></form>`,
    ],
  ])('is uncertain with %s', (_, html) => {
    loadHtml(html);

    expect(radioGroupOf(radio('move-y'))).toBeNull();
  });

  it('keeps groups of the same name in different forms apart', () => {
    loadHtml(`
      <form><fieldset><legend>Relocate?</legend>${YES_NO('move', 'a')}</fieldset></form>
      <form><fieldset><legend>Relocate?</legend>${YES_NO('move', 'b')}</fieldset></form>`);

    expect(groupMembers(radio('a-y'))).toEqual([radio('a-y'), radio('a-n')]);
    expect(radioGroupOf(radio('b-y'))?.radios).toEqual([
      radio('b-y'),
      radio('b-n'),
    ]);
  });

  it('offers only enabled, shown options', () => {
    loadHtml(`<form><fieldset><legend>Relocate?</legend>
      <label><input type="radio" id="move-y" name="move"> Yes</label>
      <label><input type="radio" name="move" disabled> No</label>
      <label hidden><input type="radio" name="move"> Maybe</label>
      </fieldset></form>`);

    expect(
      radioGroupOf(radio('move-y'), visible.isVisible)?.options.map(
        (o) => o.label,
      ),
    ).toEqual(['Yes']);
  });

  it('ignores template copies', () => {
    loadHtml(`<form><fieldset><legend>Relocate?</legend>${YES_NO('move')}</fieldset>
      <template><fieldset><legend>Relocate?</legend>${YES_NO('move', 't')}</fieldset></template></form>`);

    expect(radioGroupOf(radio('move-y'))?.radios).toHaveLength(2);
  });
});

describe('scanning radio groups', () => {
  it('keeps a group of the application form when another form uses the same name', () => {
    // Neither form has an id; the second is the application.
    loadHtml(`
      <form><fieldset><legend>Would you relocate within the UK?</legend>${YES_NO('move', 'a')}</fieldset></form>
      <form>
        <label for="email">Email address</label><input id="email" type="email">
        <fieldset><legend>Would you relocate within the UK?</legend>${YES_NO('move', 'b')}</fieldset>
      </form>`);

    expect(scanFields(document, visible).map((f) => f.element.id)).toEqual([
      'email',
      'b-y',
    ]);
  });

  it('names the field by the group’s question', () => {
    loadHtml(`<form><p id="q">Would you relocate within the UK?</p>
      <div role="radiogroup" aria-labelledby="q">${YES_NO('move')}</div></form>`);

    expect(scanFields(document, visible)[0]?.label).toBe(
      'Would you relocate within the UK?',
    );
  });
});

describe('the radio writer', () => {
  function planned(id: string, fillValue: string): FieldReport {
    const field = scanFields(document, visible).find(
      (f) => f.element.id === id,
    );
    if (!field) throw new Error(`No field #${id}`);
    return {
      field,
      status: 'fill',
      target: 'relocation',
      value: fillValue,
      fillValue,
      reason: null,
      note: null,
      evidence: [],
      candidates: [],
      chosen: true,
      suggestion: null,
    };
  }

  const TWO = `<form id="f">
    <fieldset><legend>Would you relocate within the UK?</legend>${YES_NO('within', 'w')}</fieldset>
    <fieldset><legend>Would you relocate abroad?</legend>${YES_NO('abroad', 'a')}</fieldset>
    <button type="submit">Send</button></form>`;

  it('checks exactly the chosen option of the right group, and verifies it', async () => {
    loadHtml(TWO);

    const [outcome] = await fillFields([planned('a-y', 'No')]);

    expect(outcome?.status).toBe('filled');
    expect(checkedRadio(radio('a-y'))).toBe(radio('a-n'));
    expect(checkedRadio(radio('w-y'))).toBeNull();
  });

  it('reports a choice the way a click does, without a mouse or a submission', async () => {
    loadHtml(TWO);
    const events: string[] = [];
    for (const type of ['click', 'input', 'change', 'submit', 'keydown']) {
      document.addEventListener(
        type,
        (event) => {
          events.push(
            `${type}:${(event.target as HTMLElement).id}:${String(event instanceof MouseEvent)}`,
          );
        },
        true,
      );
    }

    await fillFields([planned('a-y', 'No')]);

    expect(events).toEqual([
      'click:a-n:false',
      'input:a-n:false',
      'change:a-n:false',
    ]);
  });

  it('never changes an existing choice', async () => {
    loadHtml(TWO);
    radio('a-y').checked = true;

    const [outcome] = await fillFields([planned('a-y', 'No')]);

    expect(outcome?.status).toBe('kept');
    expect(radio('a-y').checked).toBe(true);
    expect(radio('a-n').checked).toBe(false);
  });

  it('chooses nothing when the option became disabled or changed', async () => {
    loadHtml(TWO);
    const plan = planned('a-y', 'No');
    radio('a-n').disabled = true;

    const [disabled] = await fillFields([plan]);

    expect(disabled?.status).toBe('rejected');
    expect(checkedRadio(radio('a-y'))).toBeNull();

    loadHtml(TWO);
    const relabelled = planned('a-y', 'No');
    const text = radio('a-n').closest('label')?.lastChild;
    if (text) text.textContent = ' Not now';

    const [changed] = await fillFields([relabelled]);

    expect(changed).toMatchObject({
      status: 'rejected',
      reason:
        'That choice is no longer offered here, so ApplyKit chose nothing.',
    });
    expect(checkedRadio(radio('a-y'))).toBeNull();
  });

  it('reports a page that does not keep the choice', async () => {
    loadHtml(TWO);
    radio('a-n').addEventListener('change', () => {
      radio('a-n').checked = false;
    });

    const [outcome] = await fillFields([planned('a-y', 'No')]);

    expect(outcome).toMatchObject({
      status: 'rejected',
      reason: 'The site did not keep this choice. Choose it yourself.',
    });
  });

  it('reports a group the page replaced', async () => {
    loadHtml(TWO);
    const plan = planned('a-y', 'No');
    radio('a-n').addEventListener('change', () => {
      document
        .querySelector('fieldset:last-of-type')
        ?.replaceWith(document.createElement('fieldset'));
    });

    const [outcome] = await fillFields([plan]);

    expect(outcome?.status).toBe('detached');
  });

  it('never chooses in a group whose boundary is uncertain', () => {
    loadHtml(
      `<form><fieldset><legend>Questions</legend>${YES_NO('a')}${YES_NO('b')}</fieldset></form>`,
    );

    expect(optionToChoose(radio('a-y'), 'No')).toEqual({
      reason:
        'The choices changed before ApplyKit could choose. Choose it yourself.',
    });
  });
});

describe('React-controlled radio groups', () => {
  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });
  let unmount: (() => void) | null = null;
  afterEach(() => {
    unmount?.();
    unmount = null;
  });

  function Controlled({
    onChange,
    obey,
  }: {
    onChange: (value: string) => void;
    /** False: a component that ignores changes, so React restores it. */
    obey: boolean;
  }) {
    const [value, setValue] = useState('');
    return (
      <form>
        <fieldset>
          <legend>Would you relocate abroad?</legend>
          {['Yes', 'No'].map((label) => (
            <label key={label}>
              <input
                type="radio"
                id={`r-${label}`}
                name="abroad"
                value={label === 'Yes' ? '1' : '0'}
                checked={value === label}
                onChange={() => {
                  onChange(label);
                  if (obey) setValue(label);
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </form>
    );
  }

  function render(obey: boolean) {
    const host = document.createElement('div');
    document.body.replaceChildren(host);
    const root = createRoot(host);
    const onChange = vi.fn();
    act(() => {
      root.render(<Controlled onChange={onChange} obey={obey} />);
    });
    unmount = () => {
      act(() => {
        root.unmount();
      });
    };
    return onChange;
  }

  it('updates React state, which keeps the choice', async () => {
    const onChange = render(true);

    act(() => {
      selectRadio(radio('r-No'));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('No');
    expect(radio('r-No').checked).toBe(true);
  });

  it('reports failure when the component does not take the choice', async () => {
    render(false);
    const field = scanFields(document, visible)[0];
    if (!field) throw new Error('No field');

    let outcome: FieldReport | undefined;
    await act(async () => {
      [outcome] = await fillFields([
        {
          field,
          status: 'fill',
          target: 'relocation',
          value: 'No',
          fillValue: 'No',
          reason: null,
          note: null,
          evidence: [],
          candidates: [],
          chosen: true,
          suggestion: null,
        },
      ]);
    });

    expect(outcome?.status).toBe('rejected');
    expect(radio('r-No').checked).toBe(false);
  });
});
