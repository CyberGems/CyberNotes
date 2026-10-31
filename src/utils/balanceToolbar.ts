/** Find the most even split when the natural layout needs exactly two rows. */
export function balancedToolbarBreak(widths: readonly number[], available: number, gap: number): number | null {
  if (available <= 0 || widths.length < 2 || widths.some(width => width <= 0 || width > available)) return null;
  let rows = 1, used = 0;
  for (const width of widths) {
    if (used && used + gap + width > available + 0.5) { rows++; used = width; }
    else used += (used ? gap : 0) + width;
  }
  if (rows !== 2) return null;
  const rowWidth = (start: number, end: number) => widths.slice(start, end).reduce((sum, width) => sum + width, 0) + Math.max(0, end - start - 1) * gap;
  let best: number | null = null, difference = Infinity;
  for (let index = 1; index < widths.length; index++) {
    const first = rowWidth(0, index), second = rowWidth(index, widths.length);
    if (first > available + 0.5 || second > available + 0.5) continue;
    if (Math.abs(first - second) < difference) { best = index; difference = Math.abs(first - second); }
  }
  return best;
}
