type WindowRect = { x: number; y: number; width: number; height: number };
type WindowSize = Pick<WindowRect, 'width' | 'height'>;

export function fitWindowToWorkArea(
  desired: WindowSize,
  workArea: WindowRect,
  preferredMinimum: WindowSize,
  margins: WindowSize,
): { bounds: WindowRect; minimum: WindowSize } {
  const horizontalMargin = Math.min(margins.width, Math.floor(Math.max(0, workArea.width - 1) / 4));
  const verticalMargin = Math.min(margins.height, Math.floor(Math.max(0, workArea.height - 1) / 4));
  const maxWidth = Math.max(1, workArea.width - horizontalMargin * 2);
  const maxHeight = Math.max(1, workArea.height - verticalMargin * 2);
  const minimum = {
    width: Math.min(preferredMinimum.width, maxWidth),
    height: Math.min(preferredMinimum.height, maxHeight),
  };
  const width = Math.min(Math.max(desired.width, minimum.width), maxWidth);
  const height = Math.min(Math.max(desired.height, minimum.height), maxHeight);

  return {
    bounds: {
      x: Math.round(workArea.x + (workArea.width - width) / 2),
      y: Math.round(workArea.y + (workArea.height - height) / 2),
      width,
      height,
    },
    minimum,
  };
}

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
