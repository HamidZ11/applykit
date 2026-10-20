import { labelText } from './detect';
import { comparable, isPlaceholderText } from './options';
import { isShown } from './visibility';

/**
 * Custom dropdowns ApplyKit may choose in, on the user's request (ADR
 * 0021): a select-only ARIA combobox, or a button with
 * `aria-haspopup="listbox"`, opening a single-select listbox it names
 * with `aria-controls`. Everything here only reads the page; the writer
 * is `chooseCustomOption` (fill.ts).
 *
 * The rules prefer leaving a field to the user over choosing from a list
 * that might not be its own: ownership comes only from `aria-controls`,
 * never from position or from being the only list open, and anything
 * editable, multi-select, nested in a shadow root, sharing an id or named
 * by two controls is left alone.
 */

export interface CustomOption {
  element: HTMLElement;
  /** The option's accessible name, as people read it. */
  label: string;
  disabled: boolean;
}

/** Why a dropdown is guided rather than chosen in. */
export type TriggerProblem =
  | 'pattern'
  | 'shadow'
  | 'action'
  | 'editable'
  | 'unavailable'
  | 'expanded'
  | 'ownership'
  | 'ids'
  | 'multiple';

/** The same, as Developer diagnostics shows it. */
export const TRIGGER_PROBLEM_TEXT: Record<TriggerProblem, string> = {
  pattern: 'not a select-only combobox or a button opening a listbox',
  shadow: 'inside a shadow root',
  action: 'a link, form control or submit button, or inside one',
  editable: 'editable or searchable',
  unavailable: 'disabled, read-only or hidden',
  expanded: 'aria-expanded is missing or not "false"',
  ownership: 'its list is not named by aria-controls alone',
  ids: 'an id it uses is not unique',
  multiple: 'its list allows several choices',
};

/** Elements whose own behaviour a click could set off. */
const ACTING =
  'a, area, input, select, textarea, summary, label, details, iframe';
/** Ancestors that would make a click on something inside them an action. */
const ACTING_ANCESTORS =
  'a[href], area, button, summary, [role="link"], [role="button"], [role="menuitem"], [role="tab"]';
const EDITABLE =
  'input:not([type="hidden"]), select, textarea, [contenteditable]:not([contenteditable="false"])';

/**
 * Whether one plain click on `element` can do no more than its page
 * scripts make of it: not a link, form control or submit button, not
 * inside one, not a button that opens a popover or runs a command.
 */
export function isSafeToClick(element: HTMLElement): boolean {
  if (element.matches(ACTING) || element.isContentEditable) return false;
  if (element instanceof HTMLButtonElement) {
    if (
      element.type !== 'button' ||
      ['popovertarget', 'commandfor', 'command', 'formaction'].some((name) =>
        element.hasAttribute(name),
      )
    ) {
      return false;
    }
  }
  return element.parentElement?.closest(ACTING_ANCESTORS) == null;
}

/** Every element of the document or shadow root with this exact id. */
function withId(element: Element, id: string): Element[] {
  const root = element.getRootNode() as Document | ShadowRoot;
  return [...root.querySelectorAll(`[id="${CSS.escape(id)}"]`)];
}

function tokens(element: Element, attribute: string): string[] {
  return (element.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean);
}

/** Elements other than `except` that name `id` as their popup or child. */
function otherOwners(id: string, except: Element): Element[] {
  const root = except.getRootNode() as Document | ShadowRoot;
  return [...root.querySelectorAll('[aria-controls], [aria-owns]')].filter(
    (owner) =>
      owner !== except &&
      (tokens(owner, 'aria-controls').includes(id) ||
        tokens(owner, 'aria-owns').includes(id)),
  );
}

function isDisabled(element: Element): boolean {
  return (
    element.getAttribute('aria-disabled') === 'true' ||
    element.hasAttribute('disabled') ||
    element.closest('fieldset[disabled]') !== null
  );
}

/**
 * Why `trigger` is not a dropdown ApplyKit may choose in right now, or
 * null when it is: one of the two supported patterns, collapsed, enabled,
 * shown, safe to click, not editable, in the page's own document, with
 * unique ids and a popup no other control names.
 */
export function triggerProblem(
  trigger: HTMLElement,
  isVisible: (element: Element) => boolean = isShown,
): TriggerProblem | null {
  const role = trigger.getAttribute('role');
  const popup = trigger.getAttribute('aria-haspopup');
  const combobox =
    role === 'combobox' && (popup === null || popup === 'listbox');
  const popupButton =
    popup === 'listbox' &&
    (trigger instanceof HTMLButtonElement || role === 'button');
  if (!combobox && !popupButton) return 'pattern';
  if (!(trigger.getRootNode() instanceof Document)) return 'shadow';
  if (!isSafeToClick(trigger)) return 'action';
  const autocomplete = trigger.getAttribute('aria-autocomplete');
  if (
    (autocomplete !== null && autocomplete !== 'none') ||
    trigger.isContentEditable ||
    trigger.querySelector(EDITABLE)
  ) {
    return 'editable';
  }
  if (
    isDisabled(trigger) ||
    trigger.getAttribute('aria-readonly') === 'true' ||
    !isVisible(trigger)
  ) {
    return 'unavailable';
  }
  if (trigger.getAttribute('aria-expanded') !== 'false') return 'expanded';
  if (trigger.hasAttribute('aria-owns')) return 'ownership';
  // Ids must name one element each, or the question and the list are
  // not certain.
  for (const id of [
    ...(trigger.id ? [trigger.id] : []),
    ...tokens(trigger, 'aria-labelledby'),
  ]) {
    if (withId(trigger, id).length > 1) return 'ids';
  }
  const controls = tokens(trigger, 'aria-controls');
  if (controls.length > 1) return 'ownership';
  const [id] = controls;
  if (id !== undefined) {
    const named = withId(trigger, id);
    if (named.length > 1) return 'ids';
    if (otherOwners(id, trigger).length > 0) return 'ownership';
    const [popupElement] = named;
    // Many libraries render the list only while it is open; a list kept
    // in the page must be one ApplyKit can choose in, and closed.
    if (popupElement) {
      const problem = listProblem(popupElement);
      if (problem) return problem;
      if (isVisible(popupElement)) return 'expanded';
    }
  }
  return null;
}

/**
 * Why `list` is not a list ApplyKit may choose in: not a listbox, multi-
 * select, searchable, or with options of its own elsewhere.
 */
function listProblem(list: Element): TriggerProblem | null {
  if (list.getAttribute('role') !== 'listbox') return 'ownership';
  // A list inside another widget is that widget's.
  if (list.parentElement?.closest('[role="combobox"], [aria-haspopup]')) {
    return 'ownership';
  }
  if (list.getAttribute('aria-multiselectable') === 'true') return 'multiple';
  if (list.hasAttribute('aria-owns')) return 'ownership';
  if (list.querySelector(EDITABLE)) return 'editable';
  return null;
}

/**
 * The open list `trigger` names with `aria-controls`, when it is one
 * ApplyKit may choose in and has finished loading; null otherwise. Never
 * a list found any other way.
 */
export function openList(
  trigger: HTMLElement,
  isVisible: (element: Element) => boolean = isShown,
): HTMLElement | null {
  if (!trigger.isConnected) return null;
  if (trigger.getAttribute('aria-expanded') !== 'true') return null;
  const controls = tokens(trigger, 'aria-controls');
  const [id] = controls;
  if (id === undefined || controls.length > 1) return null;
  const named = withId(trigger, id);
  const [list] = named;
  if (
    named.length !== 1 ||
    !(list instanceof HTMLElement) ||
    !(list.getRootNode() instanceof Document) ||
    listProblem(list) !== null ||
    otherOwners(id, trigger).length > 0 ||
    list.getAttribute('aria-busy') === 'true' ||
    !isVisible(list)
  ) {
    return null;
  }
  return list;
}

/** Why an open list cannot be chosen in, or null when it can. */
export function openListProblem(list: HTMLElement): TriggerProblem | null {
  return listProblem(list);
}

/** Listboxes shown on the page, to notice a second list opening. */
export function shownLists(
  document: Document,
  isVisible: (element: Element) => boolean = isShown,
): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="listbox"]')].filter(
    (list) => isVisible(list),
  );
}

/**
 * The options of `list` a user could see, in page order: its own, not
 * those of a list nested inside it. Null when the list says it holds
 * more options than the page shows (a virtual list), so choosing from
 * what is shown could miss the answer.
 */
export function listOptions(
  list: HTMLElement,
  isVisible: (element: Element) => boolean = isShown,
): CustomOption[] | null {
  const own = ownOptions(list);
  const total = own.length;
  if (
    own.some((option) => {
      const size = Number(option.getAttribute('aria-setsize') ?? total);
      const position = Number(option.getAttribute('aria-posinset') ?? 1);
      // -1 means the total is unknown: the list is not all there.
      return (
        !Number.isInteger(size) ||
        size < 0 ||
        size > total ||
        !Number.isInteger(position) ||
        position > total
      );
    })
  ) {
    return null;
  }
  return own
    .filter((option) => isVisible(option))
    .map((option) => ({
      element: option,
      label: accessibleName(option),
      disabled:
        isDisabled(option) ||
        option.parentElement?.closest('[aria-disabled="true"]') != null,
    }));
}

/** Whether two readings of a list are the same options, in the same state. */
export function sameOptions(
  a: readonly CustomOption[],
  b: readonly CustomOption[],
): boolean {
  return (
    a.length === b.length &&
    a.every((option, index) => {
      const other = b[index];
      return (
        other?.element === option.element &&
        other.label === option.label &&
        other.disabled === option.disabled
      );
    })
  );
}

/**
 * What the dropdown shows as its answer, or null when it shows none: its
 * own text without its label and decorations, or the option a list kept
 * in the page marks as selected. A placeholder ("Select…", "Choose a
 * country"), `data-placeholder`, `aria-placeholder` or the question
 * itself is no answer.
 */
export function shownValue(trigger: HTMLElement): string | null {
  const selected = keptSelection(trigger);
  if (selected !== null) return selected;
  return shownText(trigger);
}

/** The trigger's own text when it is an answer, else null. */
export function shownText(trigger: HTMLElement): string | null {
  // Everything inside the trigger counts, also text its `aria-labelledby`
  // names: widgets name their own value that way, and missing an answer
  // would let ApplyKit overwrite it.
  const text = ownText(trigger).replace(/\s+/g, ' ').trim();
  const placeholder = trigger.getAttribute('aria-placeholder') ?? '';
  // Radix marks an empty trigger with an empty `data-placeholder`; a
  // non-empty one may be configuration kept after a choice.
  const marked = trigger.getAttribute('data-placeholder');
  if (
    marked === '' ||
    (marked !== null && comparable(text) === comparable(marked)) ||
    text === '' ||
    isPlaceholderText(text) ||
    comparable(text) === comparable(labelText(trigger)) ||
    (placeholder !== '' && comparable(text) === comparable(placeholder))
  ) {
    return null;
  }
  return text;
}

/** The selected option of a closed list the page keeps, if any. */
function keptSelection(trigger: HTMLElement): string | null {
  const [id] = tokens(trigger, 'aria-controls');
  if (id === undefined || !trigger.isConnected) return null;
  const [list] = withId(trigger, id);
  if (
    !(list instanceof HTMLElement) ||
    list.getAttribute('role') !== 'listbox'
  ) {
    return null;
  }
  const selected = ownOptions(list).find(
    (option) => option.getAttribute('aria-selected') === 'true',
  );
  return selected ? accessibleName(selected) || 'Selected' : null;
}

/**
 * Whether the page committed `label`: the dropdown closed and shows it,
 * and, where its list stays in the page and marks a selection, exactly
 * the chosen option is marked. A changed label alone is not enough when
 * the list says otherwise.
 */
export function committed(
  trigger: HTMLElement,
  list: HTMLElement,
  label: string,
): boolean {
  if (!trigger.isConnected) return false;
  if (trigger.getAttribute('aria-expanded') === 'true') return false;
  const text = shownText(trigger);
  if (text === null || comparable(text) !== comparable(label)) return false;
  if (!list.isConnected) return true;
  const options = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
  if (!options.some((option) => option.hasAttribute('aria-selected'))) {
    return true;
  }
  const selected = options.filter(
    (option) => option.getAttribute('aria-selected') === 'true',
  );
  const [only] = selected;
  return (
    selected.length === 1 &&
    only !== undefined &&
    comparable(accessibleName(only)) === comparable(label)
  );
}

/**
 * The detached, never-shown native list standing for a custom dropdown's
 * options, so the planners choose among them by exactly the rules they
 * use for a native list. Each option's value is its label: a dropdown is
 * answered by what it says, never by attributes. The first option is a
 * placeholder, so nothing counts as chosen.
 */
export function optionList(
  document: Document,
  options: readonly CustomOption[],
): HTMLSelectElement {
  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.text = 'Select';
  select.append(placeholder);
  for (const option of options) {
    if (option.label === '') continue;
    const item = document.createElement('option');
    item.value = option.label;
    item.text = option.label;
    item.disabled = option.disabled;
    select.append(item);
  }
  select.selectedIndex = 0;
  return select;
}

/** An element's accessible name, roughly: its ARIA label, else its text. */
function accessibleName(element: HTMLElement): string {
  const label = (element.getAttribute('aria-label') ?? '').trim();
  if (label) return label;
  const labelledBy = tokens(element, 'aria-labelledby')
    .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
  if (labelledBy) return labelledBy.replace(/\s+/g, ' ');
  return ownText(element).replace(/\s+/g, ' ').trim();
}

/** The options of `list` itself, not of a list nested inside it. */
function ownOptions(list: HTMLElement): HTMLElement[] {
  return [...list.querySelectorAll<HTMLElement>('[role="option"]')].filter(
    (option) => option.parentElement?.closest('[role="listbox"]') === list,
  );
}

/**
 * Text people read in `node`: without hidden decorations (icons, check
 * marks), labels or nested lists.
 */
function ownText(node: Node): string {
  let text = '';
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? '';
    } else if (
      child instanceof Element &&
      !child.matches(
        '[aria-hidden="true"], [hidden], label, [role="listbox"], script, style, template',
      )
    ) {
      text += ` ${ownText(child)} `;
    }
  }
  return text;
}
