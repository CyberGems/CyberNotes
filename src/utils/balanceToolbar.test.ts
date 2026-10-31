import { describe, expect, it } from 'vitest';
import { balancedToolbarBreak } from './balanceToolbar';

describe('balancedToolbarBreak', () => {
  it('balances occupied widths while respecting the available width and gaps', () => {
    expect(balancedToolbarBreak([120, 70, 30, 30, 30, 30, 30, 30], 250, 4)).toBe(2);
    expect(balancedToolbarBreak([80, 40, 40, 40, 40, 40], 180, 4)).toBe(3);
  });
  it('leaves one-row, three-row, unmeasured and oversized layouts to normal wrapping', () => {
    expect(balancedToolbarBreak([40, 40], 100, 4)).toBeNull();
    expect(balancedToolbarBreak([100, 100, 100], 150, 4)).toBeNull();
    expect(balancedToolbarBreak([0, 40], 100, 4)).toBeNull();
    expect(balancedToolbarBreak([200, 30], 100, 4)).toBeNull();
  });
});
