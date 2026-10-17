import { useLayoutEffect, useRef, type RefObject } from 'react';

const DURATION = 200;
const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';

/**
 * Animates an element's height whenever `key` changes, between the height it
 * had before the change and the height it settles at after it.
 *
 * Both heights are measured in pixels, so the animation is a single,
 * monotonic step with no overshoot. A CSS transition from `height: auto`
 * cannot do this here: the browser resolves `auto` against the content that
 * is already swapped in, so the panel would jump to the new content's natural
 * height before settling. Once the animation ends the element's own CSS
 * height applies again, so viewport resizes keep working.
 *
 * Interruptible: a change mid-animation starts from the current animated
 * height. Skipped when the user prefers reduced motion.
 */
export function useHeightTransition(
  ref: RefObject<HTMLElement | null>,
  key: string,
): void {
  const previousKey = useRef(key);
  /** The element's resting height after the last commit. */
  const restingHeight = useRef<number | null>(null);
  const running = useRef<Animation | null>(null);

  // No dependencies: record the resting height after every commit, so the
  // starting point is right even when content changed since the last switch.
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;

    const changed = previousKey.current !== key;
    previousKey.current = key;
    const animation = running.current;

    if (!changed) {
      if (!animation) restingHeight.current = height(node);
      return;
    }

    // Mid-animation, start from where the element visibly is.
    const from = animation ? height(node) : restingHeight.current;
    animation?.cancel();
    running.current = null;
    const to = height(node);
    restingHeight.current = to;

    if (
      from === null ||
      Math.abs(to - from) < 1 ||
      typeof node.animate !== 'function' ||
      prefersReducedMotion()
    ) {
      return;
    }

    const next = node.animate(
      [{ height: `${String(from)}px` }, { height: `${String(to)}px` }],
      { duration: DURATION, easing: EASE_OUT },
    );
    running.current = next;
    next.onfinish = () => {
      if (running.current === next) running.current = null;
    };
  });
}

function height(node: HTMLElement): number {
  return node.getBoundingClientRect().height;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
