import { describe, expect, it } from 'vitest';
import { isVisiblyMaximized, needsPlacementCorrection } from './windowState';

const leftWorkArea = { x: -1208, y: 144, width: 1208, height: 720 };

describe('saved main window maximization', () => {
  it('recognizes Windows maximization with its invisible resize border', () => {
    expect(isVisiblyMaximized(true, { x: -1214, y: 138, width: 1220, height: 732 }, leftWorkArea)).toBe(true);
  });

  it('does not maximize a resized window when Electron reports a stale maximized flag', () => {
    expect(isVisiblyMaximized(true, { x: -1090, y: 181, width: 1008, height: 675 }, leftWorkArea)).toBe(false);
  });

  it('keeps a work-area-sized restored window restored', () => {
    expect(isVisiblyMaximized(false, leftWorkArea, leftWorkArea)).toBe(false);
  });
});

describe('initial placement on mixed-DPI displays', () => {
  const centered = { x: -1109, y: 160, width: 1010, height: 688 };

  it('corrects the observed post-show drift toward the neighboring display', () => {
    expect(needsPlacementCorrection({ x: -952, y: 160, width: 1009, height: 688 }, centered)).toBe(true);
  });

  it('accepts native size and coordinate rounding', () => {
    expect(needsPlacementCorrection({ x: -1110, y: 160, width: 1012, height: 688 }, centered)).toBe(false);
  });
});
