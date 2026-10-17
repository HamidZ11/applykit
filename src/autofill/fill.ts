import {
  PROFILE_FIELDS,
  type Profile,
  type ProfileField,
} from '@/domain/profile';
import { detectFields, type DetectedField } from './detect';

export type SkipReason = 'has-value' | 'no-profile-value';

export interface FillResult {
  filled: DetectedField[];
  skipped: (DetectedField & { reason: SkipReason })[];
  /** Profile fields for which no matching input was found on the page. */
  missing: ProfileField[];
}

/**
 * Detects known fields in `root` and fills them from `profile`.
 *
 * Never overwrites a value the user has already entered, and never submits,
 * clicks or presses keys: it only sets values and dispatches the events a
 * real user's input would produce.
 */
export function autofill(root: ParentNode, profile: Profile): FillResult {
  const detected = detectFields(root);
  const result: FillResult = { filled: [], skipped: [], missing: [] };

  for (const target of detected) {
    const value = profile[target.field];
    if (!value) {
      result.skipped.push({ ...target, reason: 'no-profile-value' });
    } else if (target.element.value.trim() !== '') {
      result.skipped.push({ ...target, reason: 'has-value' });
    } else {
      setInputValue(target.element, value);
      result.filled.push(target);
    }
  }

  const found = new Set(detected.map((target) => target.field));
  result.missing = PROFILE_FIELDS.filter((field) => !found.has(field));

  return result;
}

/**
 * Sets an input's value so that page scripts observe it as user input.
 *
 * Frameworks such as React track the last value they saw by overriding the
 * element's own `value` property. Calling the prototype's native setter
 * bypasses that override, so the framework sees a change when the `input`
 * event arrives and updates its state.
 */
export function setInputValue(element: HTMLInputElement, value: string): void {
  Reflect.set(HTMLInputElement.prototype, 'value', value, element);

  element.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      composed: true,
      inputType: 'insertReplacementText',
      data: value,
    }),
  );
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
