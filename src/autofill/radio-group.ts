import { RADIO_CONTAINERS, radioQuestionText } from './detect';
import { comparable } from './options';

/**
 * Native radio groups ApplyKit may answer (ADR 0020). A group qualifies
 * only when its boundary and options are certain: its radios share a name
 * and form, sit in one fieldset or ARIA group that holds no other radios,
 * the group asks a question (a legend or accessible name), and every
 * option has its own visible label, different from the others. Anything
 * less (radios with no name, a container shared with another question,
 * an unlabelled option, two options reading the same) is left to the
 * user. Raw values ("1", "M", "true") are never read as answers.
 */

export interface RadioOption {
  radio: HTMLInputElement;
  /** The visible label, as people read it. */
  label: string;
}

export interface RadioGroup {
  container: Element;
  question: string;
  /** Every radio of the group, in page order. */
  radios: HTMLInputElement[];
  /** The radios a user could choose: enabled and shown. */
  options: RadioOption[];
}

export function isRadio(element: Element): element is HTMLInputElement {
  return element instanceof HTMLInputElement && element.type === 'radio';
}

/**
 * The radios that belong together for the browser: the same name in the
 * same form (or, outside any form, in the same document). Used to protect
 * an existing choice even where ApplyKit would not answer the group.
 */
export function groupMembers(radio: HTMLInputElement): HTMLInputElement[] {
  if (!radio.name) return [radio];
  const scope: Iterable<Element> = radio.form
    ? radio.form.elements
    : (radio.getRootNode() as Document | ShadowRoot).querySelectorAll(
        'input[type="radio"]',
      );
  return [...scope].filter(
    (element): element is HTMLInputElement =>
      isRadio(element) &&
      element.name === radio.name &&
      element.form === radio.form,
  );
}

/** The checked radio of the group, whoever chose it. */
export function checkedRadio(radio: HTMLInputElement): HTMLInputElement | null {
  return groupMembers(radio).find((member) => member.checked) ?? null;
}

/**
 * A radio's own visible label: its <label> elements' text without the
 * controls inside them, else its accessible name. Never its value.
 */
export function radioLabel(radio: HTMLInputElement): string {
  const fromLabels = [...(radio.labels ?? [])]
    .map((label) => {
      const copy = label.cloneNode(true) as HTMLElement;
      for (const control of copy.querySelectorAll(
        'input, select, textarea, button',
      )) {
        control.remove();
      }
      return copy.textContent;
    })
    .join(' ');
  const ariaLabel = (radio.getAttribute('aria-label') ?? '').trim();
  const named =
    fromLabels.trim() ||
    ariaLabel ||
    (radio.getAttribute('aria-labelledby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => radio.ownerDocument.getElementById(id)?.textContent ?? '')
      .join(' ');
  return named.replace(/\s+/g, ' ').trim();
}

/** The browser's own check, for a radio read outside a scan. */
function shown(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  const view = element.ownerDocument.defaultView;
  if (!view) return true;
  const style = view.getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden';
}

/**
 * The group `radio` belongs to, if ApplyKit can answer it with certainty;
 * null otherwise.
 */
export function radioGroupOf(
  radio: HTMLInputElement,
  isVisible: (element: Element) => boolean = shown,
): RadioGroup | null {
  if (!radio.name) return null;
  const radios = groupMembers(radio);
  const container = radio.closest(RADIO_CONTAINERS);
  if (!container) return null;
  // One question per container: every member inside it, and nothing else.
  if (radios.some((member) => !container.contains(member))) return null;
  const inside = [
    ...container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ];
  if (inside.length !== radios.length) return null;
  const question = radioQuestionText(radio);
  if (question === '') return null;
  const labelled = radios.map((member) => ({
    radio: member,
    label: radioLabel(member),
  }));
  if (labelled.some((option) => option.label === '')) return null;
  const keys = labelled.map((option) => comparable(option.label));
  if (keys.includes('') || new Set(keys).size !== keys.length) return null;
  return {
    container,
    question,
    radios,
    options: labelled.filter(
      (option) => !option.radio.matches(':disabled') && isVisible(option.radio),
    ),
  };
}

/**
 * The one option of `radio`'s group whose label is `label`, read again
 * from the page, or why there is none: the group must still be one
 * ApplyKit can answer, with exactly one enabled option saying `label`.
 */
export function optionToChoose(
  radio: HTMLInputElement,
  label: string,
): { radio: HTMLInputElement } | { reason: string } {
  const group = radioGroupOf(radio);
  if (!group) {
    return {
      reason:
        'The choices changed before ApplyKit could choose. Choose it yourself.',
    };
  }
  const matching = group.options.filter(
    (option) => comparable(option.label) === comparable(label),
  );
  const [only] = matching;
  return matching.length === 1 && only
    ? { radio: only.radio }
    : {
        reason:
          'That choice is no longer offered here, so ApplyKit chose nothing.',
      };
}
