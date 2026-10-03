import { describe, expect, it } from 'vitest';
import { fitWindowToWorkArea, isVisiblyMaximized, needsPlacementCorrection } from './windowState';

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

describe('main window on smaller displays', () => {
  const preferredMinimum = { width: 840, height: 560 };
  const margins = { width: 48, height: 16 };

  it('preserves the usual minimum and saved size on the current display', () => {
    expect(fitWindowToWorkArea({ width: 1010, height: 688 }, leftWorkArea, preferredMinimum, margins)).toEqual({
      bounds: { x: -1109, y: 160, width: 1010, height: 688 },
      minimum: preferredMinimum,
    });
  });

  it('reduces the native minimum to fit a compact work area', () => {
    const workArea = { x: 0, y: 0, width: 853, height: 500 };
    expect(fitWindowToWorkArea({ width: 1010, height: 688 }, workArea, preferredMinimum, margins)).toEqual({
      bounds: { x: 48, y: 16, width: 757, height: 468 },
      minimum: { width: 757, height: 468 },
    });
  });
});
