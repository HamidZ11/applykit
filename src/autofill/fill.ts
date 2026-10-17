import { comparable } from './options';
import { currentValue, type FieldReport } from './report';

/** Lets the page's own scripts react before results are checked. */
export const afterPageScripts = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/**
 * Fills the fields planned as `fill`, then checks what the page actually
 * kept. Never clicks, presses keys, focuses or submits anything, never
 * overwrites a value, and only reports success when the value was accepted.
 *
 * Returns a new report for every field; fields not planned for filling are
 * returned unchanged.
 */
export async function fillFields(
  plan: readonly FieldReport[],
  settle: () => Promise<void> = afterPageScripts,
): Promise<FieldReport[]> {
  const written = new Set<FieldReport>();
  const reports = plan.map((report): FieldReport => {
    if (report.status !== 'fill' || report.fillValue === null) return report;
    const { element } = report.field;

    // The page may have changed since the plan was made.
    if (!element.isConnected) return detached(report);
    if (element.disabled || ('readOnly' in element && element.readOnly)) {
      return {
        ...report,
        status: 'rejected',
        reason: 'The field became unavailable before ApplyKit could fill it.',
      };
    }
    const existing = currentValue(report.field);
    if (existing !== null) {
      return {
        ...report,
        status: 'kept',
        value: existing,
        reason: 'You entered something here first, so ApplyKit left it.',
      };
    }

    if (element instanceof HTMLSelectElement) {
      setSelectValue(element, report.fillValue);
    } else {
      setInputValue(element, report.fillValue);
    }
    written.add(report);
    return report;
  });

  if (written.size === 0) return reports;
  await settle();
  return reports.map((report) =>
    written.has(report) ? verify(report) : report,
  );
}

/** Whether the page kept the value ApplyKit wrote. */
function verify(report: FieldReport): FieldReport {
  const { element } = report.field;
  if (!element.isConnected) return detached(report);
  const expected = report.fillValue ?? '';
  const actual = element.value;
  if (actual === expected) return { ...report, status: 'filled' };
  if (
    !(element instanceof HTMLSelectElement) &&
    actual.trim() !== '' &&
    equivalent(actual, expected)
  ) {
    return {
      ...report,
      status: 'reformatted',
      value: actual,
      reason: 'Filled. The site changed its formatting.',
    };
  }
  return {
    ...report,
    status: 'rejected',
    reason:
      actual.trim() === ''
        ? 'The site cleared this value. Enter it yourself.'
        : 'The site changed this value. Check it.',
  };
}

function detached(report: FieldReport): FieldReport {
  return {
    ...report,
    status: 'detached',
    reason:
      'The field disappeared from the page. Rescan to see the current form.',
  };
}

/** The same value in different formatting: case, spacing or punctuation. */
function equivalent(actual: string, expected: string): boolean {
  const compact = (text: string) => comparable(text).replace(/ /g, '');
  if (compact(actual) === compact(expected)) return true;
  const digits = (text: string) => text.replace(/\D/g, '');
  const a = digits(actual);
  const b = digits(expected);
  // Phone numbers: the same digits, possibly with the country code changed.
  return (
    a.length >= 7 &&
    b.length >= 7 &&
    (a.endsWith(b.slice(-9)) || b.endsWith(a.slice(-9)))
  );
}

/**
 * Sets an input's value so that page scripts observe it as user input.
 *
 * Frameworks such as React track the last value they saw by overriding the
 * element's own `value` property. Calling the prototype's native setter
 * bypasses that override, so the framework sees a change when the `input`
 * event arrives and updates its state.
 */
export function setInputValue(
  element: HTMLInputElement | HTMLTextAreaElement,
  value: string,
): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  Reflect.set(prototype, 'value', value, element);
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

/** Chooses a native select option the way a user's choice is reported. */
export function setSelectValue(
  element: HTMLSelectElement,
  value: string,
): void {
  Reflect.set(HTMLSelectElement.prototype, 'value', value, element);
  element.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}
