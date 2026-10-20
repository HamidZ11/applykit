import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from 'react';

/**
 * Moving the panel out of the way of the page's own controls (a "Save and
 * Continue" bar, a chat button). The panel stays anchored bottom-right and
 * is offset from there; the offset is kept for this page while it is open
 * and when it is opened again, and always clamped so the whole panel stays
 * in the viewport. Only the panel's own handle moves it: the page's
 * scrolling and clicks are untouched.
 */

export interface Offset {
  x: number;
  y: number;
}

/** Space kept between the panel and the viewport's edges, in pixels. */
const MARGIN = 8;
/** Pixels an arrow key moves the panel; with Shift, four times as far. */
export const KEY_STEP = 24;

/** Kept for the page's lifetime, so reopening ApplyKit keeps its place. */
let remembered: Offset = { x: 0, y: 0 };

/** Puts the panel back in its corner the next time it opens (tests). */
export function forgetPanelPosition(): void {
  remembered = { x: 0, y: 0 };
}

/**
 * The offset that keeps a panel whose box is `rect` (at offset `current`)
 * inside a `width` × `height` viewport, moved by as little as possible.
 * The top and left edges win when the panel is larger than the viewport,
 * so its header always stays reachable.
 */
export function clampOffset(
  wanted: Offset,
  current: Offset,
  rect: { left: number; top: number; right: number; bottom: number },
  viewport: { width: number; height: number },
): Offset {
  // The box the panel would have at `wanted`.
  const left = rect.left + wanted.x - current.x;
  const right = rect.right + wanted.x - current.x;
  const top = rect.top + wanted.y - current.y;
  const bottom = rect.bottom + wanted.y - current.y;
  let x = wanted.x;
  let y = wanted.y;
  if (right > viewport.width - MARGIN) x -= right - (viewport.width - MARGIN);
  if (left + (x - wanted.x) < MARGIN) x += MARGIN - (left + (x - wanted.x));
  if (bottom > viewport.height - MARGIN) {
    y -= bottom - (viewport.height - MARGIN);
  }
  if (top + (y - wanted.y) < MARGIN) y += MARGIN - (top + (y - wanted.y));
  return { x: Math.round(x), y: Math.round(y) };
}

/** Where the panel at `current` may go towards `wanted`, inside the viewport. */
function place(
  node: HTMLElement | null,
  wanted: Offset,
  current: Offset,
): Offset {
  const next = node
    ? clampOffset(wanted, current, node.getBoundingClientRect(), {
        width: window.innerWidth,
        height: window.innerHeight,
      })
    : wanted;
  // The same place keeps the same object, so nothing re-renders.
  return next.x === current.x && next.y === current.y ? current : next;
}

export function usePanelPosition(frame: RefObject<HTMLElement | null>) {
  const [offset, setOffset] = useState<Offset>(() => remembered);
  const drag = useRef<{ pointer: number; from: Offset; start: Offset } | null>(
    null,
  );

  const moveTo = (wanted: Offset) => {
    setOffset((current) => place(frame.current, wanted, current));
  };

  useEffect(() => {
    remembered = offset;
  }, [offset]);

  // The viewport or the panel's height can change (resizing the window,
  // expanding the list): keep it inside.
  useEffect(() => {
    const keepInside = () => {
      setOffset((current) => place(frame.current, current, current));
    };
    keepInside();
    window.addEventListener('resize', keepInside);
    const node = frame.current;
    const observer =
      node && typeof ResizeObserver === 'function'
        ? new ResizeObserver(keepInside)
        : null;
    if (node) observer?.observe(node);
    return () => {
      window.removeEventListener('resize', keepInside);
      observer?.disconnect();
    };
  }, [frame]);

  const handle = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Without capture, a fast drag may lose the pointer; nothing else.
      }
      drag.current = {
        pointer: event.pointerId,
        from: { x: event.clientX, y: event.clientY },
        start: offset,
      };
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const active = drag.current;
      // Only a drag that started on the handle, by the same pointer.
      if (active === null) return;
      if (active.pointer !== event.pointerId) return;
      moveTo({
        x: active.start.x + event.clientX - active.from.x,
        y: active.start.y + event.clientY - active.from.y,
      });
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const active = drag.current;
      // Only a drag that started on the handle, by the same pointer.
      if (active === null) return;
      if (active.pointer !== event.pointerId) return;
      drag.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Already released.
      }
    },
    onPointerCancel: () => {
      drag.current = null;
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
      const { x, y } = offset;
      const moves: Record<string, Offset> = {
        ArrowLeft: { x: x - step, y },
        ArrowRight: { x: x + step, y },
        ArrowUp: { x, y: y - step },
        ArrowDown: { x, y: y + step },
        Home: { x: 0, y: 0 },
      };
      const next = moves[event.key];
      if (!next) return;
      // The panel's own arrow keys move through the field list.
      event.preventDefault();
      event.stopPropagation();
      moveTo(next);
    },
  };

  return {
    offset,
    handle,
    reset: () => {
      moveTo({ x: 0, y: 0 });
    },
  };
}
