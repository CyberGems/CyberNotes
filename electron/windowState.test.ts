import { describe, expect, it } from 'vitest';
import { isVisiblyMaximized } from './windowState';

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
