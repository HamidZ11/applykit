/**
 * Taking the user to a field on the page: scroll it into view and, for
 * plain native controls, focus it. Never clicks, presses keys, focuses a
 * custom control, opens a dropdown or changes a value; the user does the
 * rest.
 */

export type GoToResult =
  { ok: true; focused: boolean } | { ok: false; message: string };

/**
 * `known` is the set of fields from the current scan: an element that is
 * not one of them, or no longer on the page, is refused rather than
 * guessed at.
 */
export function goToField(
  element: HTMLElement,
  known: ReadonlySet<Element>,
): GoToResult {
  if (!element.isConnected || !known.has(element)) {
    return {
      ok: false,
      message:
        'This field is no longer on the page. Rescan to update the list.',
    };
  }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({
    block: 'center',
    behavior: reduce ? 'instant' : 'smooth',
  });
  const focusable = isSafelyFocusable(element);
  if (focusable) element.focus({ preventScroll: true });
  return { ok: true, focused: focusable };
}

/**
 * Only plain native controls are focused. Custom controls, including text
 * inputs acting as comboboxes, are never focused: some open their popup or
 * load options when they receive focus. The user clicks them on the page.
 */
function isSafelyFocusable(element: HTMLElement): boolean {
  const native =
    element instanceof HTMLInputElement ||
    element instanceof HTMLSelectElement ||
    element instanceof HTMLTextAreaElement;
  if (!native || element.disabled) return false;
  return !(
    element.getAttribute('role') === 'combobox' ||
    element.hasAttribute('aria-haspopup') ||
    element.hasAttribute('aria-autocomplete') ||
    element.parentElement?.closest('[role="combobox"]')
  );
}
