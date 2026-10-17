import { useEffect, useRef, useState } from 'react';

interface LocatorProps {
  /** The page element to point at, or null for none. */
  target: Element | null;
  /** `pulse` shows briefly then fades; `hold` stays while the target is set. */
  mode: 'pulse' | 'hold';
}

const PADDING = 4;

/**
 * Draws a ring around a field on the page and scrolls it into view if needed.
 *
 * Rendered inside ApplyKit's own shadow root and positioned over the page, so
 * the page's DOM and styles are never touched. Remount (via `key`) to pulse
 * the same target again.
 */
export function Locator({ target, mode }: LocatorProps) {
  const ring = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!target) return;
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

  if (!target || !visible) return null;

  return (
    <div
      ref={ring}
      aria-hidden
      data-testid="applykit-locator"
      onAnimationEnd={() => {
        if (mode === 'pulse') setVisible(false);
      }}
      className={`ak-locator pointer-events-none fixed top-0 left-0 rounded-md border-2 border-accent shadow-[0_0_0_4px_rgb(45_83_212/0.14)] ${
        mode === 'pulse'
          ? 'animate-[ak-locate_1600ms_var(--ease-out)_forwards]'
          : 'animate-[ak-fade-in_120ms_var(--ease-out)]'
      }`}
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
