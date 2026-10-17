/**
 * Taking the user to a field on the page: scroll it into view and, where
 * that is safe, focus it. Never clicks, presses keys, opens a dropdown or
 * changes a value; the user does the rest.
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
 * Focusable by keyboard already (a native control, or `tabindex` 0 or
 * more) and not disabled. Focus alone selects nothing.
 */
function isSafelyFocusable(element: HTMLElement): boolean {
  if (element.tabIndex < 0) return false;
  if (element.getAttribute('aria-disabled') === 'true') return false;
  return !(
    'disabled' in element &&
    typeof element.disabled === 'boolean' &&
    element.disabled
  );
}
