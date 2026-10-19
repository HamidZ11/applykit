import { usableOptions } from './options';
import { isRadio, radioGroupOf } from './radio-group';

/**
 * The choices of a control that offers a fixed set: a native list, or a
 * native radio group ApplyKit can answer with certainty. Planners match a
 * saved answer against `text` (what people read) and plan `value`, which
 * the writer uses to choose: an option's value for a list, the option's
 * label for a radio group, so a group is answered by what it says, never
 * by its raw values. Null for any other control.
 */

export interface ChoiceOption {
  value: string;
  text: string;
}

export function choiceOptions(element: Element): ChoiceOption[] | null {
  if (element instanceof HTMLSelectElement) {
    return usableOptions(element).map((option) => ({
      value: option.value,
      text: option.text.trim(),
    }));
  }
  if (isRadio(element)) {
    const group = radioGroupOf(element);
    return group
      ? group.options.map(({ label }) => ({ value: label, text: label }))
      : null;
  }
  return null;
}
