import { describe, expect, it } from 'vitest';
import { asStickyColorId, DEFAULT_STICKY_COLOR, STICKY_COLOR_IDS, STICKY_OPACITY_OPTIONS, normalizeStickyOpacity } from './sticky';

describe('floating note opacity limit', () => {
  it('keeps both the menu choices and previously saved values at least 60% opaque', () => {
    expect(Math.min(...STICKY_OPACITY_OPTIONS)).toBe(0.6);
    expect(normalizeStickyOpacity(0.1)).toBe(0.6);
    expect(normalizeStickyOpacity(0.4)).toBe(0.6);
    expect(normalizeStickyOpacity(0.8)).toBe(0.8);
    expect(normalizeStickyOpacity(Number.NaN)).toBe(1);
  });
});

describe('sticky note default color', () => {
  it('uses the seventh palette color and preserves saved colors', () => {
    expect(DEFAULT_STICKY_COLOR).toBe('electric-blue');
    expect(STICKY_COLOR_IDS[6]).toBe(DEFAULT_STICKY_COLOR);
    for (const color of STICKY_COLOR_IDS) expect(asStickyColorId(color)).toBe(color);
    expect(asStickyColorId(null)).toBe(DEFAULT_STICKY_COLOR);
  });
});
