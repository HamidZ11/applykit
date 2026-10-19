/** Smaller than this in either direction, a control is not meant to be seen. */
const MIN_VISIBLE_PX = 2;

/**
 * Whether a control is shown to the user, by the browser's own check, so
 * hidden controls (including honeypots) are never listed or filled. Shared
 * by the scan and by anything that reads the page again before writing.
 */
export function isShown(element: Element): boolean {
  if (element.closest('[hidden], [aria-hidden="true"], [inert]')) return false;
  if (typeof element.checkVisibility !== 'function') {
    // Older browsers: at least honour display and visibility.
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }
  if (
    !element.checkVisibility({
      visibilityProperty: true,
      opacityProperty: true,
    })
  ) {
    return false;
  }
  // Honeypots are often shrunk to nothing or moved off the page.
  const box = element.getBoundingClientRect();
  return (
    box.width >= MIN_VISIBLE_PX &&
    box.height >= MIN_VISIBLE_PX &&
    box.right + window.scrollX > 0 &&
    box.bottom + window.scrollY > 0
  );
}
