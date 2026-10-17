import { useEffect, useRef } from 'react';

const PADDING = 4;

/**
 * Draws a ring around a field on the page while it is selected, and scrolls
 * it into view if it is off-screen.
 *
 * Rendered inside ApplyKit's own shadow root and positioned over the page, so
 * the page's DOM and styles are never touched. Key it by target so the ring
 * fades in again when the selection moves.
 */
export function Locator({ target }: { target: Element }) {
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    revealIfHidden(target);

    let frame = 0;
    const follow = () => {
      const node = ring.current;
      if (node) {
        const rect = target.getBoundingClientRect();
        const empty = rect.width === 0 && rect.height === 0;
        node.style.display = empty ? 'none' : 'block';
        node.style.transform = `translate(${px(rect.left - PADDING)}, ${px(rect.top - PADDING)})`;
        node.style.width = px(rect.width + PADDING * 2);
        node.style.height = px(rect.height + PADDING * 2);
      }
      frame = requestAnimationFrame(follow);
    };
    follow();
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [target]);

  return (
    <div
      ref={ring}
      aria-hidden
      data-testid="applykit-locator"
      className="ak-locator pointer-events-none fixed top-0 left-0 animate-[ak-fade-in_120ms_var(--ease-out)] rounded-md border-2 border-accent shadow-[0_0_0_4px_rgb(45_83_212/0.14)]"
    />
  );
}

function px(value: number): string {
  return `${String(value)}px`;
}

/** Scrolls the element to the centre of the viewport unless it is fully visible. */
function revealIfHidden(element: Element) {
  const rect = element.getBoundingClientRect();
  const margin = 24;
  const visible =
    rect.top >= margin && rect.bottom <= window.innerHeight - margin;
  if (visible) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  element.scrollIntoView({
    block: 'center',
    behavior: reduce ? 'instant' : 'smooth',
  });
}
