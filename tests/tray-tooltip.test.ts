import { describe, expect, it } from 'vitest';
import { TRAY_TOOLTIP_MAX_LENGTH, formatTrayTooltip } from '../electron/tray-tooltip';

describe('formatTrayTooltip', () => {
  it('uses the suite format with a single shortcut segment', () => {
    expect(formatTrayTooltip('Alt+Shift+N')).toBe('CyberNotes · Alt+Shift+N');
  });

  it('falls back to the bare app name without a shortcut', () => {
    expect(formatTrayTooltip(undefined)).toBe('CyberNotes');
    expect(formatTrayTooltip('')).toBe('CyberNotes');
    expect(formatTrayTooltip('   ')).toBe('CyberNotes');
    expect(formatTrayTooltip(null)).toBe('CyberNotes');
  });

  it('trims the segment before formatting', () => {
    expect(formatTrayTooltip('  Alt+Shift+N  ')).toBe('CyberNotes · Alt+Shift+N');
  });

  it('caps the tooltip at 63 characters with an ellipsis', () => {
    const tooltip = formatTrayTooltip('X'.repeat(80));
    expect(tooltip).toHaveLength(TRAY_TOOLTIP_MAX_LENGTH);
    expect(tooltip.endsWith('…')).toBe(true);
    expect(tooltip.startsWith('CyberNotes · ')).toBe(true);
  });
});
