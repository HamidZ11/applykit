import { describe, expect, it } from 'vitest';
import { clampOffset } from './usePanelPosition';

/** Where the panel may go: always wholly inside the viewport. */

const VIEWPORT = { width: 1000, height: 800 };
// A 380 × 300 panel anchored 16 px from the bottom-right corner.
const RECT = { left: 604, top: 484, right: 984, bottom: 784 };
const ZERO = { x: 0, y: 0 };

describe('clampOffset', () => {
  it('lets the panel move anywhere inside the viewport', () => {
    expect(clampOffset({ x: -300, y: -200 }, ZERO, RECT, VIEWPORT)).toEqual({
      x: -300,
      y: -200,
    });
  });

  it('stops at every edge, keeping a margin', () => {
    expect(clampOffset({ x: 500, y: 500 }, ZERO, RECT, VIEWPORT)).toEqual({
      x: 8,
      y: 8,
    });
    expect(clampOffset({ x: -2000, y: -2000 }, ZERO, RECT, VIEWPORT)).toEqual({
      x: -596,
      y: -476,
    });
  });

  it('measures from where the panel is now', () => {
    const moved = { left: 304, top: 284, right: 684, bottom: 584 };

    expect(
      clampOffset({ x: -300, y: -200 }, { x: -300, y: -200 }, moved, VIEWPORT),
    ).toEqual({ x: -300, y: -200 });
  });

  it('keeps the header reachable when the viewport is smaller than the panel', () => {
    const tiny = { width: 300, height: 200 };
    const rect = { left: -96, top: -116, right: 284, bottom: 184 };

    expect(clampOffset(ZERO, ZERO, rect, tiny)).toEqual({ x: 104, y: 124 });
  });
});
