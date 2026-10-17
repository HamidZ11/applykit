import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { useHeightTransition } from './useHeightTransition';

/** Resting heights per mode; jsdom has no layout, so geometry is stubbed. */
const HEIGHTS: Record<string, number> = { compact: 300, expanded: 600 };

let root: Root;
let host: HTMLElement;
/**
 * When set, the element reports this height, as if mid-animation; cancelling
 * an animation clears it, as cancelling a real one restores the CSS height.
 */
let animatedHeight: number | null;
let reducedMotion: boolean;
let animations: {
  keyframes: Keyframe[];
  options: KeyframeAnimationOptions;
  cancel: ReturnType<typeof vi.fn>;
}[];

function Box({ mode }: { mode: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useHeightTransition(ref, mode);
  return <div ref={ref} data-mode={mode} />;
}

function render(mode: string) {
  act(() => {
    root.render(<Box mode={mode} />);
  });
}

beforeAll(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  animatedHeight = null;
  reducedMotion = false;
  animations = [];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      const height = animatedHeight ?? HEIGHTS[this.dataset.mode ?? ''] ?? 0;
      return new DOMRect(0, 0, 380, height);
    },
  );
  Element.prototype.animate = function (keyframes, options) {
    const cancel = vi.fn(() => {
      animatedHeight = null;
    });
    animations.push({
      keyframes: keyframes as Keyframe[],
      options: options as KeyframeAnimationOptions,
      cancel,
    });
    return { cancel, onfinish: null } as unknown as Animation;
  };
  window.matchMedia = (query: string) =>
    ({ matches: reducedMotion, media: query }) as MediaQueryList;

  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

describe('useHeightTransition', () => {
  it('does not animate on first render or on re-renders in the same mode', () => {
    render('compact');
    render('compact');

    expect(animations).toEqual([]);
  });

  it('expands from the measured compact height straight to the expanded height', () => {
    render('compact');
    render('expanded');

    expect(animations).toHaveLength(1);
    expect(animations[0]?.keyframes).toEqual([
      { height: '300px' },
      { height: '600px' },
    ]);
    expect(animations[0]?.options).toEqual({
      duration: 200,
      easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
    });
  });

  it('collapses from the expanded height straight to the compact height', () => {
    render('expanded');
    render('compact');

    expect(animations[0]?.keyframes).toEqual([
      { height: '600px' },
      { height: '300px' },
    ]);
  });

  it('never passes beyond the target: two keyframes, start and end only', () => {
    render('compact');
    render('expanded');
    render('compact');

    for (const { keyframes } of animations) {
      expect(keyframes).toHaveLength(2);
      const values = keyframes.map((frame) => parseFloat(String(frame.height)));
      expect(Math.max(...values)).toBeLessThanOrEqual(600);
      expect(Math.min(...values)).toBeGreaterThanOrEqual(300);
    }
  });

  it('continues from the current height when interrupted', () => {
    render('compact');
    render('expanded');
    const first = animations[0];

    animatedHeight = 450; // part-way through expanding
    render('compact');

    expect(first?.cancel).toHaveBeenCalledTimes(1);
    expect(animations[1]?.keyframes).toEqual([
      { height: '450px' },
      { height: '300px' },
    ]);
  });

  it('switches instantly when the user prefers reduced motion', () => {
    reducedMotion = true;
    render('compact');
    render('expanded');

    expect(animations).toEqual([]);
  });

  it('switches instantly where the Web Animations API is unavailable', () => {
    Reflect.deleteProperty(Element.prototype, 'animate');
    render('compact');

    expect(() => {
      render('expanded');
    }).not.toThrow();
  });
});
