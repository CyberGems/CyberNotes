// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { createGlyphSupportDetector, measureNativeGlyph } from './glyphSupport';

it('rejects invisible characters and missing symbols, while retaining visible combining marks', () => {
  let current = '';
  const context = {
    canvas: { width: 256, height: 64 }, clearRect: vi.fn(),
    fillText: (value: string) => { current = value; },
    measureText: (value: string) => ({ width: value === '\u0301' ? 0 : 20 }),
    getImageData: () => {
      const data = new Uint8ClampedArray(256 * 64 * 4);
      data[0] = current === '\u0301' || current === 'Ω' ? 2 : 1;
      data[3] = 255;
      return { data };
    },
  };
  const supported = createGlyphSupportDetector(context as unknown as CanvasRenderingContext2D, 'Test symbols');
  expect(supported('\u0378')).toBe(false);
  for (const value of ['\u200d', '\u200b', '\ufe0f', ' ']) expect(supported(value), value).toBe(false);
  expect(supported('\u0301')).toBe(true);
  expect(supported('Ω')).toBe(true);
});

it('measures overhangs and descenders independently of the advance and reuses metrics', () => {
  const measureText = vi.fn().mockReturnValue({
    width: 20, actualBoundingBoxLeft: 3, actualBoundingBoxRight: 24,
    actualBoundingBoxAscent: 21, actualBoundingBoxDescent: 9,
  });
  const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ measureText } as unknown as CanvasRenderingContext2D);
  try {
    const metrics = measureNativeGlyph('g', 'Metric test font');
    expect(metrics.width).toBeGreaterThan(20);
    expect(metrics.height).toBe(30);
    expect(metrics.left).toBe(3);
    expect(measureNativeGlyph('g', 'Metric test font')).toBe(metrics);
    expect(measureText).toHaveBeenCalledTimes(1);
  } finally { getContext.mockRestore(); }
});
