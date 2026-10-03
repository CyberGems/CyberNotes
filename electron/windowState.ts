type WindowRect = { x: number; y: number; width: number; height: number };

/** Persist maximization only when the visible bounds also fill the display. */
export function isVisiblyMaximized(isMaximized: boolean, bounds: WindowRect, workArea: WindowRect): boolean {
  if (!isMaximized) return false;

  // A maximized window may extend a few pixels past the work area due to
  // Windows' invisible resize border, including on mixed-DPI monitors.
  const edgeTolerance = 16;
  return Math.abs(bounds.x - workArea.x) <= edgeTolerance
    && Math.abs(bounds.y - workArea.y) <= edgeTolerance
    && Math.abs(bounds.x + bounds.width - workArea.x - workArea.width) <= edgeTolerance
    && Math.abs(bounds.y + bounds.height - workArea.y - workArea.height) <= edgeTolerance;
}

/** Ignore the one or two DIP of rounding produced by mixed display scales. */
export function needsPlacementCorrection(actual: WindowRect, expected: WindowRect): boolean {
  const tolerance = 3;
  return Math.abs(actual.x - expected.x) > tolerance
    || Math.abs(actual.y - expected.y) > tolerance
    || Math.abs(actual.width - expected.width) > tolerance
    || Math.abs(actual.height - expected.height) > tolerance;
}
