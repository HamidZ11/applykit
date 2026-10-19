import { describe, expect, it } from 'vitest';
import { loadHtml } from '@/test/load-fixture';
import {
  committed,
  isSafeToClick,
  listOptions,
  openList,
  optionList,
  shownValue,
  triggerProblem,
} from './custom-choice';

/**
 * Which custom dropdowns ApplyKit may choose in (ADR 0021), how it reads
 * what they show, and how it proves which list is theirs.
 */

function element(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`No #${id}`);
  return found;
}

const LIST = `<ul id="list" role="listbox" hidden>
  <li role="option">Ireland</li><li role="option">United Kingdom</li></ul>`;

function combobox(attributes = '', content = 'Select…'): string {
  return `<span id="label">Country</span>
    <div id="trigger" role="combobox" tabindex="0" aria-labelledby="label"
      aria-controls="list" aria-expanded="false" ${attributes}>${content}</div>`;
}

describe('supported dropdowns', () => {
  it('accepts a select-only combobox naming its list', () => {
    loadHtml(combobox() + LIST);

    expect(triggerProblem(element('trigger'))).toBeNull();
  });

  it('accepts a popup button whose list exists only while open', () => {
    loadHtml(`<form><span id="label">Country</span>
      <button id="trigger" type="button" aria-haspopup="listbox"
        aria-expanded="false" aria-labelledby="label">Select…</button></form>`);

    expect(triggerProblem(element('trigger'))).toBeNull();
  });

  it('accepts a list named in advance but rendered only when open', () => {
    loadHtml(combobox());

    expect(triggerProblem(element('trigger'))).toBeNull();
  });

  it.each([
    ['without aria-expanded', combobox().replace('aria-expanded="false"', '')],
    ['already open', combobox().replace('"false"', '"true"')],
    ['an editable combobox', combobox('aria-autocomplete="list"')],
    ['a searchable one', combobox('', '<input aria-label="Search" />')],
    ['a disabled one', combobox('aria-disabled="true"')],
    ['a read-only one', combobox('aria-readonly="true"')],
    ['a combobox opening a dialog', combobox('aria-haspopup="dialog"')],
    ['one owning its list the ARIA 1.0 way', combobox('aria-owns="list"')],
    ['one naming two lists', combobox().replace('"list"', '"list other"')],
  ])('refuses %s', (_name, html) => {
    loadHtml(html + LIST);

    expect(triggerProblem(element('trigger'))).not.toBeNull();
  });

  it('refuses a hidden trigger', () => {
    loadHtml(`<div hidden>${combobox()}</div>${LIST}`);

    expect(triggerProblem(element('trigger'))).not.toBeNull();
  });

  it('refuses a list that is multi-select, searchable or not a listbox', () => {
    for (const list of [
      LIST.replace(
        'role="listbox"',
        'role="listbox" aria-multiselectable="true"',
      ),
      LIST.replace('<li', '<li><input aria-label="Filter" /></li><li'),
      LIST.replace('role="listbox"', 'role="menu"'),
    ]) {
      loadHtml(combobox() + list);

      expect(triggerProblem(element('trigger')), list).not.toBeNull();
    }
  });

  it('refuses a list two controls name', () => {
    loadHtml(
      combobox() +
        LIST +
        '<div role="combobox" aria-label="Other" aria-controls="list" aria-expanded="false"></div>',
    );

    expect(triggerProblem(element('trigger'))).toBe('ownership');
  });

  it('refuses ids used twice: the list, the trigger or its label', () => {
    loadHtml(combobox() + LIST + '<ul id="list" role="listbox" hidden></ul>');
    expect(triggerProblem(element('trigger'))).toBe('ids');

    loadHtml(combobox() + LIST + '<span id="label">Nationality</span>');
    expect(triggerProblem(element('trigger'))).toBe('ids');

    loadHtml(combobox() + LIST + '<div id="trigger"></div>');
    expect(triggerProblem(element('trigger'))).toBe('ids');
  });

  it('refuses a closed trigger whose list is shown', () => {
    loadHtml(combobox() + LIST.replace(' hidden', ''));

    expect(triggerProblem(element('trigger'))).toBe('expanded');
  });

  it('refuses buttons that submit, open popovers or run commands', () => {
    for (const button of [
      '<button id="trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="Country">Select…</button>',
      '<button id="trigger" type="submit" aria-haspopup="listbox" aria-expanded="false" aria-label="Country">Select…</button>',
      '<button id="trigger" type="button" popovertarget="p" aria-haspopup="listbox" aria-expanded="false" aria-label="Country">Select…</button>',
      '<button id="trigger" type="button" commandfor="d" command="show-modal" aria-haspopup="listbox" aria-expanded="false" aria-label="Country">Select…</button>',
    ]) {
      loadHtml(`<form>${button}</form>`);

      expect(triggerProblem(element('trigger')), button).toBe('action');
    }
  });

  it('refuses a trigger inside a link or another button', () => {
    loadHtml(`<a href="https://example.com/">${combobox()}</a>${LIST}`);
    expect(triggerProblem(element('trigger'))).toBe('action');

    loadHtml(`<div role="button">${combobox()}</div>${LIST}`);
    expect(triggerProblem(element('trigger'))).toBe('action');
  });

  it('refuses a dropdown in a shadow root', () => {
    loadHtml('<div id="host"></div>');
    const shadow = element('host').attachShadow({ mode: 'open' });
    shadow.innerHTML = combobox() + LIST;
    const trigger = shadow.getElementById('trigger');
    if (!trigger) throw new Error('No trigger');

    expect(triggerProblem(trigger)).toBe('shadow');
  });
});

describe('what a dropdown shows', () => {
  it('reads no answer from placeholders, decorations or the question', () => {
    for (const content of [
      '',
      'Select…',
      'Please choose',
      '--',
      '<span aria-hidden="true">▾</span>',
      'Country',
    ]) {
      loadHtml(combobox('', content) + LIST);

      expect(shownValue(element('trigger')), content).toBeNull();
    }
  });

  it('reads no answer while a library marks the placeholder', () => {
    loadHtml(combobox('data-placeholder=""', 'Where do you live?') + LIST);

    expect(shownValue(element('trigger'))).toBeNull();
  });

  it('reads the chosen value, without the label the widget names itself by', () => {
    loadHtml(`<span id="label">Country</span>
      <button id="trigger" type="button" aria-haspopup="listbox"
        aria-expanded="false" aria-labelledby="label trigger">
        <span>United Kingdom</span><svg aria-hidden="true"></svg></button>`);

    expect(shownValue(element('trigger'))).toBe('United Kingdom');
  });

  it('reads a value the trigger names as part of its own name', () => {
    loadHtml(`<span id="label">Country</span>
      <div id="trigger" role="combobox" tabindex="0" aria-expanded="false"
        aria-controls="list" aria-labelledby="label value">
        <span id="value">United Kingdom</span></div>`);

    expect(shownValue(element('trigger'))).toBe('United Kingdom');
  });

  it('reads a value next to a placeholder kept as configuration', () => {
    loadHtml(combobox('data-placeholder="Choose a country"', 'France') + LIST);
    expect(shownValue(element('trigger'))).toBe('France');

    loadHtml(
      combobox('data-placeholder="Choose a country"', 'Choose a country') +
        LIST,
    );
    expect(shownValue(element('trigger'))).toBeNull();
  });

  it('ignores selections outside the named listbox’s own options', () => {
    loadHtml(
      combobox() +
        `<div id="list" role="listbox" hidden><div role="option">Ireland</div>
          <div role="listbox" aria-label="Nested"><div role="option" aria-selected="true">France</div></div></div>`,
    );
    expect(shownValue(element('trigger'))).toBeNull();

    loadHtml(
      combobox() +
        '<div id="list" role="menu" hidden><div role="option" aria-selected="true">France</div></div>',
    );
    expect(shownValue(element('trigger'))).toBeNull();
  });

  it('reads an answer from a kept list marking its selection', () => {
    loadHtml(
      combobox() +
        LIST.replace(
          '<li role="option">Ireland',
          '<li role="option" aria-selected="true">Ireland',
        ),
    );

    expect(shownValue(element('trigger'))).toBe('Ireland');
  });
});

describe('the open list', () => {
  function opened(listHtml = LIST.replace(' hidden', '')) {
    loadHtml(combobox() + listHtml);
    const trigger = element('trigger');
    trigger.setAttribute('aria-expanded', 'true');
    return trigger;
  }

  it('is the one list the trigger names, and only once it is open', () => {
    loadHtml(combobox() + LIST);
    const trigger = element('trigger');
    expect(openList(trigger)).toBeNull();

    trigger.setAttribute('aria-expanded', 'true');
    element('list').hidden = false;

    expect(openList(trigger)).toBe(element('list'));
  });

  it('is never another list, even the only one open', () => {
    loadHtml(
      combobox().replace('aria-controls="list"', '') +
        LIST.replace(' hidden', ''),
    );
    const trigger = element('trigger');
    trigger.setAttribute('aria-expanded', 'true');

    expect(openList(trigger)).toBeNull();
  });

  it('waits while the list says it is loading', () => {
    const trigger = opened(
      LIST.replace(' hidden', '').replace(
        'role="listbox"',
        'role="listbox" aria-busy="true"',
      ),
    );

    expect(openList(trigger)).toBeNull();
  });

  it('lists shown options with their names and states, not nested ones', () => {
    opened(`<div id="list" role="listbox">
      <div role="option" aria-label="United Kingdom"><span aria-hidden="true">✓</span> UK</div>
      <div role="option" aria-disabled="true">Ireland</div>
      <div role="group" aria-disabled="true"><div role="option">France</div></div>
      <div role="option" hidden>Hidden</div>
      <div role="listbox" aria-label="Nested"><div role="option">Nested option</div></div>
    </div>`);

    expect(
      listOptions(element('list'))?.map(({ label, disabled }) => [
        label,
        disabled,
      ]),
    ).toEqual([
      ['United Kingdom', false],
      ['Ireland', true],
      ['France', true],
    ]);
  });

  it('refuses a virtual list whose size is unknown', () => {
    opened(`<div id="list" role="listbox">
      <div role="option" aria-setsize="-1" aria-posinset="1">Afghanistan</div>
    </div>`);

    expect(listOptions(element('list'))).toBeNull();
  });

  it('refuses a list inside another widget, even when named', () => {
    loadHtml(
      combobox() +
        `<div role="combobox" aria-label="Nationality"><ul id="list" role="listbox" hidden><li role="option">Irish</li></ul></div>`,
    );

    expect(triggerProblem(element('trigger'))).toBe('ownership');
  });

  it('refuses a virtual list showing only part of its options', () => {
    opened(`<div id="list" role="listbox">
      <div role="option" aria-setsize="250" aria-posinset="1">Afghanistan</div>
      <div role="option" aria-setsize="250" aria-posinset="2">Albania</div>
    </div>`);

    expect(listOptions(element('list'))).toBeNull();
  });
});

describe('verifying a choice', () => {
  function chosen(label: string, selected: string | null) {
    loadHtml(
      combobox('', label) +
        `<ul id="list" role="listbox" hidden>
          <li role="option" ${selected === 'Ireland' ? 'aria-selected="true"' : selected ? 'aria-selected="false"' : ''}>Ireland</li>
          <li role="option" ${selected === 'United Kingdom' ? 'aria-selected="true"' : selected ? 'aria-selected="false"' : ''}>United Kingdom</li>
        </ul>`,
    );
    return { trigger: element('trigger'), list: element('list') };
  }

  it('needs the dropdown closed, showing the label', () => {
    const { trigger, list } = chosen('United Kingdom', null);
    expect(committed(trigger, list, 'United Kingdom')).toBe(true);

    trigger.setAttribute('aria-expanded', 'true');
    expect(committed(trigger, list, 'United Kingdom')).toBe(false);
  });

  it('is not fooled by a label when the list marks another option', () => {
    const { trigger, list } = chosen('United Kingdom', 'Ireland');

    expect(committed(trigger, list, 'United Kingdom')).toBe(false);
  });

  it('accepts the label and the marked option agreeing', () => {
    const { trigger, list } = chosen('United Kingdom', 'United Kingdom');

    expect(committed(trigger, list, 'United Kingdom')).toBe(true);
  });

  it('accepts the label alone once a removed list leaves nothing else', () => {
    const { trigger, list } = chosen('United Kingdom', 'Ireland');
    list.remove();

    expect(committed(trigger, list, 'United Kingdom')).toBe(true);
  });

  it('refuses a placeholder or another label', () => {
    expect(committed(...args(chosen('Select…', null)), 'United Kingdom')).toBe(
      false,
    );
    expect(committed(...args(chosen('Ireland', null)), 'United Kingdom')).toBe(
      false,
    );
  });

  function args({
    trigger,
    list,
  }: {
    trigger: HTMLElement;
    list: HTMLElement;
  }) {
    return [trigger, list] as const;
  }
});

describe('what a click may reach', () => {
  it('never a link, form control, label or summary, or anything inside a link', () => {
    loadHtml(`<a id="a" href="https://example.com/">A</a>
      <a href="https://example.com/"><span id="in-link">B</span></a>
      <label id="label">C</label><summary id="summary">D</summary>
      <input id="input" /><div role="link"><span id="in-role-link">E</span></div>
      <div id="option" role="option">F</div>`);

    for (const id of [
      'a',
      'in-link',
      'label',
      'summary',
      'input',
      'in-role-link',
    ]) {
      expect(isSafeToClick(element(id)), id).toBe(false);
    }
    expect(isSafeToClick(element('option'))).toBe(true);
  });
});

describe('the stand-in list', () => {
  it('offers the options by label, disabled ones disabled, nothing chosen', () => {
    loadHtml(`<div id="list" role="listbox">
      <div role="option">United Kingdom</div>
      <div role="option" aria-disabled="true">Ireland</div></div>`);
    const options = listOptions(element('list')) ?? [];

    const select = optionList(document, options);

    expect(select.isConnected).toBe(false);
    expect(
      [...select.options].map((o) => [o.value, o.text, o.disabled]),
    ).toEqual([
      ['', 'Select', false],
      ['United Kingdom', 'United Kingdom', false],
      ['Ireland', 'Ireland', true],
    ]);
    expect(select.selectedIndex).toBe(0);
  });
});
