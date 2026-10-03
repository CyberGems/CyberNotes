import { describe, expect, it } from 'vitest';
import { STICKY_OPACITY_OPTIONS, normalizeStickyOpacity } from './sticky';

describe('floating note opacity limit', () => {
  it('keeps both the menu choices and previously saved values at least 60% opaque', () => {
    expect(Math.min(...STICKY_OPACITY_OPTIONS)).toBe(0.6);
    expect(normalizeStickyOpacity(0.1)).toBe(0.6);
    expect(normalizeStickyOpacity(0.4)).toBe(0.6);
    expect(normalizeStickyOpacity(0.8)).toBe(0.8);
    expect(normalizeStickyOpacity(Number.NaN)).toBe(0.9);
  });
});
