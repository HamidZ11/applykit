import { isDiversityField } from './fields';
import { groupMembers, isRadio, optionToChoose } from './radio-group';
import { comparable } from './options';
import { isFormControl } from './scan';
import { currentValue, type FieldReport } from './report';
import {
  committed,
  isSafeToClick,
  listOptions,
  openList,
  openListProblem,
  sameOptions,
  shownLists,
  shownText,
  shownValue,
  triggerProblem,
  type CustomOption,
} from './custom-choice';
import { isShown } from './visibility';

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
      if (!selectRadio(choice.radio)) {
        return {
          ...report,
          status: 'rejected',
          reason:
            'The page did not let ApplyKit choose this. Choose it yourself.',
        };
      }
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
export function selectRadio(radio: HTMLInputElement): boolean {
  Reflect.set(HTMLInputElement.prototype, 'checked', true, radio);
  const kept = radio.dispatchEvent(
    new Event('click', { bubbles: true, composed: true, cancelable: true }),
  );
  if (!kept) {
    // The page cancelled the click, as a read-only group does: a real
    // click would be undone, so this one is too.
    Reflect.set(HTMLInputElement.prototype, 'checked', false, radio);
    return false;
  }
  radio.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  radio.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** What happened when ApplyKit chose in a custom dropdown. */
export type CustomChoiceOutcome =
  | { status: 'filled'; label: string }
  /** The dropdown already showed an answer, so nothing was done. */
  | { status: 'kept'; value: string }
  | { status: 'rejected'; reason: string }
  | { status: 'detached' };

/**
 * The option to choose among those the open list shows, worked out by the
 * caller with its own rules (possibly asking the background), or why none.
 */
export type OptionPicker = (
  options: readonly CustomOption[],
) => Promise<{ label: string } | { reason: string }>;

export interface ChooseTiming {
  /** One step of waiting for the page's scripts. */
  step?: () => Promise<void>;
  /** Steps to wait for the list to open, and again for the choice to show. */
  steps?: number;
  /** How long the picker may take, in milliseconds. */
  pickTimeout?: number;
  isVisible?: (element: Element) => boolean;
}

const CHOOSE_STEP_MS = 25;
const CHOOSE_STEPS = 40;
const PICK_TIMEOUT_MS = 5000;

const CHOICE_FAILURE = {
  changed:
    'This dropdown changed before ApplyKit could choose. Nothing was chosen; choose it yourself.',
  closed:
    'This dropdown needs manual selection: it did not open its list for ApplyKit. Choose it yourself.',
  ownership:
    'ApplyKit could not confirm which list belongs to this dropdown, so it chose nothing. Choose it yourself.',
  kind: 'This dropdown needs manual selection: ApplyKit does not choose in lists like this one. Choose it yourself.',
  options:
    'The available choices changed while ApplyKit was choosing. Nothing was chosen; choose it yourself.',
  same: 'Several choices here read the same, so ApplyKit chose nothing. Choose it yourself.',
  unavailable:
    'That choice is not available here, so ApplyKit chose nothing. Choose it yourself.',
  interrupted:
    'You used the page while ApplyKit was choosing, so it stopped. Choose it yourself.',
  unverified:
    'ApplyKit could not verify the selection, so it does not count as filled. Check this dropdown and choose it yourself.',
  guarded:
    'The page tried to submit the form or leave it after this choice. ApplyKit stopped that; check this dropdown and the form before you continue.',
  slow: 'Your saved answer could not be checked in time. Nothing was chosen; choose it yourself.',
  failed:
    'ApplyKit stopped choosing because something went wrong. Check this dropdown and choose it yourself.',
  stillOpen:
    'If its list is still open, press Escape or click elsewhere on the page to close it.',
} as const;

/**
 * Chooses one option in a custom dropdown the user asked ApplyKit to
 * answer (ADR 0021), and reports only what the page verifiably kept.
 *
 * One plain `click` Event (not a mouse event, so the browser runs no
 * activation behaviour) goes to the verified trigger; if the list it
 * names with `aria-controls` opens, settles and is one ApplyKit may
 * choose in, `pick` names an option, and one more plain `click` goes to
 * the single option with that label. Success needs the dropdown to close
 * and show that label, and, where its list stays in the page, to mark
 * exactly that option selected. On any failure a list ApplyKit opened is
 * closed with one more click on the trigger, if it is still open.
 *
 * While it runs (a second or two at most), a temporary guard cancels
 * form submission and navigation the page attempts, and a real pointer
 * press or key press by the user stops the operation. The guard is
 * removed when it ends, however it ends. Never focuses, presses keys or
 * waits on anything unbounded.
 */
export async function chooseCustomOption(
  trigger: HTMLElement,
  pick: OptionPicker,
  {
    step = () =>
      new Promise((resolve) => {
        setTimeout(resolve, CHOOSE_STEP_MS);
      }),
    steps = CHOOSE_STEPS,
    pickTimeout = PICK_TIMEOUT_MS,
    isVisible = isShown,
  }: ChooseTiming = {},
): Promise<CustomChoiceOutcome> {
  if (gone(trigger)) return { status: 'detached' };
  const existing = shownValue(trigger);
  if (existing !== null) return { status: 'kept', value: existing };
  if (triggerProblem(trigger, isVisible) !== null) {
    return { status: 'rejected', reason: CHOICE_FAILURE.changed };
  }
  const view = trigger.ownerDocument.defaultView;
  if (!view) return { status: 'rejected', reason: CHOICE_FAILURE.changed };

  const guard = guardPage(view);
  try {
    // Whatever goes wrong, the list ApplyKit opened is still closed.
    const outcome = await operate(
      trigger,
      pick,
      guard,
      { step, steps, pickTimeout },
      isVisible,
    ).catch((): CustomChoiceOutcome => ({
      status: 'rejected',
      reason: CHOICE_FAILURE.failed,
    }));
    if (outcome.status === 'filled' || outcome.status === 'kept') {
      return outcome;
    }
    // Close what ApplyKit opened, never anything else, and nothing once the
    // user is acting on the page. A trigger the page replaced cannot be
    // closed through.
    if (guard.interrupted()) return outcome;
    // A page that already tried to submit or leave gets no further click.
    if (gone(trigger) || guard.tripped()) return withHint(outcome);
    if (trigger.getAttribute('aria-expanded') === 'true') {
      activate(trigger);
      const closed = await until(
        () => trigger.getAttribute('aria-expanded') !== 'true' || null,
        step,
        steps,
      );
      // The guard stays for one more step, for what closing sets off.
      await step();
      if (!closed) return withHint(outcome);
    }
    return outcome;
  } finally {
    guard.remove();
  }
}

async function operate(
  trigger: HTMLElement,
  pick: OptionPicker,
  guard: PageGuard,
  { step, steps, pickTimeout }: Required<Omit<ChooseTiming, 'isVisible'>>,
  isVisible: (element: Element) => boolean,
): Promise<CustomChoiceOutcome> {
  const fail = (reason: keyof typeof CHOICE_FAILURE) => ({
    status: 'rejected' as const,
    reason: CHOICE_FAILURE[reason],
  });
  const document = trigger.ownerDocument;
  const before = new Set(shownLists(document, isVisible));

  activate(trigger);
  const list = await until(() => openList(trigger, isVisible), step, steps);
  if (guard.tripped()) return fail('guarded');
  if (guard.interrupted()) return fail('interrupted');
  if (gone(trigger)) return fail('changed');
  if (!list) {
    if (trigger.getAttribute('aria-expanded') !== 'true') return fail('closed');
    const [id] = (trigger.getAttribute('aria-controls') ?? '').split(/\s+/);
    const named = id ? document.getElementById(id) : null;
    return named && openListProblem(named) !== null
      ? fail('kind')
      : fail('ownership');
  }
  // Another list opening at the same moment makes ownership uncertain.
  if (
    shownLists(document, isVisible).some(
      (shown) => shown !== list && !before.has(shown),
    )
  ) {
    return fail('ownership');
  }

  // Options may still be arriving: they must read the same twice.
  const first = listOptions(list, isVisible);
  await step();
  const options = listOptions(list, isVisible);
  if (!first || !options) return fail('kind');
  if (!sameOptions(first, options) || options.length === 0) {
    return fail('options');
  }

  const picked = await withTimeout(pick(options), pickTimeout);
  if (!picked) return fail('slow');
  if ('reason' in picked) return { status: 'rejected', reason: picked.reason };

  // The page, or the user, may have acted while the answer was worked out.
  if (guard.tripped()) return fail('guarded');
  if (guard.interrupted()) return fail('interrupted');
  if (gone(trigger) || openList(trigger, isVisible) !== list) {
    return fail('changed');
  }
  const now = listOptions(list, isVisible);
  if (!now || !sameOptions(options, now)) return fail('options');
  // An answer chosen meanwhile, by anyone, is kept.
  if (shownText(trigger) !== null) return fail('changed');
  const matching = now.filter(
    (option) => comparable(option.label) === comparable(picked.label),
  );
  const [option] = matching;
  if (!option || picked.label.trim() === '') return fail('unavailable');
  if (matching.length > 1) return fail('same');
  if (option.disabled || !isSafeToClick(option.element)) {
    return fail('unavailable');
  }

  activate(option.element);
  const kept = await until(
    () =>
      guard.tripped() || committed(trigger, list, option.label) ? true : null,
    step,
    steps,
  );
  // Kept means still kept once the page's own scripts have run again.
  if (kept) await step();
  if (guard.tripped()) return fail('guarded');
  if (gone(trigger) || !kept || !committed(trigger, list, option.label)) {
    return fail('unverified');
  }
  return { status: 'filled', label: option.label };
}

/** A failure, with how to close a list ApplyKit may have left open. */
function withHint(outcome: CustomChoiceOutcome): CustomChoiceOutcome {
  return outcome.status === 'rejected'
    ? { ...outcome, reason: `${outcome.reason} ${CHOICE_FAILURE.stillOpen}` }
    : outcome;
}

/**
 * Whether the element has left the page. Read afresh each time: the page
 * changes while ApplyKit waits.
 */
function gone(element: Element): boolean {
  return !element.isConnected;
}

/**
 * One plain `click` Event, as ADR 0020 sends to a radio: page scripts see
 * a click, but without a MouseEvent the browser runs no activation
 * behaviour (following a link, submitting a form).
 */
function activate(element: HTMLElement): void {
  element.dispatchEvent(
    new Event('click', { bubbles: true, cancelable: true, composed: true }),
  );
}

/** Waits up to `steps` steps for `check` to return something. */
async function until<T>(
  check: () => T | null,
  step: () => Promise<void>,
  steps: number,
): Promise<T | null> {
  for (let i = 0; i <= steps; i++) {
    const found = check();
    if (found !== null) return found;
    if (i < steps) await step();
  }
  return null;
}

async function withTimeout<T>(
  promise: Promise<T>,
  milliseconds: number,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          resolve(null);
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface PageGuard {
  /** The page tried to submit a form or navigate. */
  tripped: () => boolean;
  /** The user pressed a pointer or a key, or left the tab. */
  interrupted: () => boolean;
  remove: () => void;
}

/**
 * A guard for the moments ApplyKit operates a dropdown or applies answers
 * the user reviewed: cancels any form submission and any navigation the
 * page starts (where the browser supports the Navigation API), and
 * notices the user acting or leaving the tab. Only event listeners, added
 * here and removed by `remove`; no browser API is replaced. It cannot
 * stop a script calling `form.submit()`, a network request, or navigation
 * in browsers without the Navigation API.
 */
export function guardPage(view: Window): PageGuard {
  let tripped = false;
  let interrupted = false;
  // What the user does themselves is never cancelled.
  const onSubmit = (event: Event) => {
    if (interrupted) return;
    tripped = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  const onNavigate = (event: Event) => {
    if (interrupted || (event as NavigateEvent).userInitiated) return;
    tripped = true;
    if (event.cancelable) event.preventDefault();
  };
  const onUser = (event: Event) => {
    if (event.isTrusted) interrupted = true;
  };
  const onHidden = () => {
    if (view.document.hidden) interrupted = true;
  };
  const navigation = 'navigation' in view ? view.navigation : null;
  view.addEventListener('submit', onSubmit, true);
  navigation?.addEventListener('navigate', onNavigate);
  for (const type of ['pointerdown', 'keydown']) {
    view.addEventListener(type, onUser, { capture: true, passive: true });
  }
  view.document.addEventListener('visibilitychange', onHidden);
  return {
    tripped: () => tripped,
    interrupted: () => interrupted,
    remove: () => {
      view.removeEventListener('submit', onSubmit, true);
      navigation?.removeEventListener('navigate', onNavigate);
      for (const type of ['pointerdown', 'keydown']) {
        view.removeEventListener(type, onUser, { capture: true });
      }
      view.document.removeEventListener('visibilitychange', onHidden);
    },
  };
}
