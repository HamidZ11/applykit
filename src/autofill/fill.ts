import { isDiversityField } from './fields';
import { groupMembers, isRadio, optionToChoose } from './radio-group';
import { comparable } from './options';
import { isFormControl } from './scan';
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
  /** The radio chosen for each radio group written, to verify. */
  const chosen = new Map<FieldReport, HTMLInputElement>();
  const reports = plan.map((report): FieldReport => {
    if (report.status !== 'fill' || report.fillValue === null) return report;
    const { element } = report.field;
    // Only native controls are ever written; custom controls are reported.
    if (!isFormControl(element)) return report;

    // The page may have changed since the plan was made.
    if (!element.isConnected) return detached(report);
    if (
      element.matches(':disabled') ||
      ('readOnly' in element && element.readOnly)
    ) {
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
        value:
          report.target !== null && isDiversityField(report.target)
            ? null
            : existing,
        reason: 'You entered something here first, so ApplyKit left it.',
      };
    }

    if (isRadio(element)) {
      const choice = optionToChoose(element, report.fillValue);
      if ('reason' in choice) {
        return { ...report, status: 'rejected', reason: choice.reason };
      }
      selectRadio(choice.radio);
      chosen.set(report, choice.radio);
    } else if (element instanceof HTMLSelectElement) {
      setSelectValue(element, report.fillValue);
    } else {
      setInputValue(element, report.fillValue);
    }
    written.add(report);
    return report;
  });

  if (written.size === 0) return reports;
  await settle();
  return reports.map((report) => {
    if (!written.has(report)) return report;
    const radio = chosen.get(report);
    return radio ? verifyRadio(report, radio) : verify(report);
  });
}

/** Whether the page kept the one radio ApplyKit chose, and only it. */
function verifyRadio(
  report: FieldReport,
  radio: HTMLInputElement,
): FieldReport {
  if (!radio.isConnected) return detached(report);
  const checked = groupMembers(radio).filter((member) => member.checked);
  return checked.length === 1 && checked[0] === radio
    ? { ...report, status: 'filled' }
    : {
        ...report,
        status: 'rejected',
        reason: 'The site did not keep this choice. Choose it yourself.',
      };
}

/** Whether the page kept the value ApplyKit wrote. */
function verify(report: FieldReport): FieldReport {
  const { element } = report.field;
  if (!isFormControl(element)) return report;
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

export type ReplaceOutcome =
  'replaced' | 'changed' | 'unavailable' | 'rejected';

/**
 * Replaces the applicant's own answer with an improved one they reviewed
 * and confirmed (ADR 0019). Separate from `fillFields`, which never
 * overwrites: this writes only when the field still holds exactly
 * `expected`, the text the applicant chose to improve, so nothing typed
 * since is lost. Never clicks, presses keys or submits.
 */
export async function replaceText(
  element: HTMLInputElement | HTMLTextAreaElement,
  expected: string,
  value: string,
  settle: () => Promise<void> = afterPageScripts,
): Promise<ReplaceOutcome> {
  if (!element.isConnected || element.disabled || element.readOnly) {
    return 'unavailable';
  }
  if (element.value !== expected) return 'changed';
  setInputValue(element, value);
  await settle();
  // The page may have removed the field while it handled the input.
  if (!element.ownerDocument.contains(element)) return 'unavailable';
  return element.value === value ? 'replaced' : 'rejected';
}

/**
 * Checks one radio button the way a user's choice is reported, without a
 * mouse event (ADR 0020). The prototype's `checked` setter bypasses the
 * override React uses to track the last state it saw, so React notices
 * the change; React reports a radio's change on the `click` event, so a
 * plain `click` Event (not a MouseEvent, which would also run the
 * browser's activation behaviour) follows, then `input` and `change`, as
 * a click produces, for other frameworks and plain scripts. Nothing is
 * focused, pressed or submitted, and the caller verifies the result.
 */
export function selectRadio(radio: HTMLInputElement): void {
  Reflect.set(HTMLInputElement.prototype, 'checked', true, radio);
  radio.dispatchEvent(new Event('click', { bubbles: true, composed: true }));
  radio.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  radio.dispatchEvent(new Event('change', { bubbles: true }));
}
