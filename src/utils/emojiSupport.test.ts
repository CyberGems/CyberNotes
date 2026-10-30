// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createEmojiSupportDetector, filterSupportedEmojis } from './emojiSupport';

function probe() {
  const shapes: Record<string, [number, number]> = {
    '\u{10ffff}': [1, 20], '\uffff': [1, 20], '🫠': [1, 20],
    '😀': [2, 40], '⚫': [0, 40], '👩‍💻': [3, 40], '👩💻': [4, 80],
    '🙂‍↔️': [5, 80], '🙂↔️': [5, 80],
    '👩‍👩‍👧': [6, 80], '👩👩‍👧': [6, 80], '👩👩👧': [7, 120],
    '🇨🇷': [8, 30], '🇨\u200b🇷': [8, 30],
    '🏳️‍🌈': [9, 40], '🏳️🌈': [10, 80],
    '🏴': [11, 40], '🏴\u{e0067}\u{e0062}\u{e007f}': [11, 40],
    '👍🏻': [13, 80], '👍\u200b🏻': [13, 80],
    '👍🏽': [14, 40], '👍\u200b🏽': [15, 80],
    '1️⃣': [16, 40], '1\u200b️\u200b⃣': [17, 80],
    '🇯🇵': [18, 40], '🇯\u200b🇵': [19, 80],
  };
  let current = '';
  const canvas = { width: 256, height: 64 };
  const context = {
    canvas, clearRect: vi.fn(), fillText: vi.fn((value: string) => { current = value; }),
    measureText: (value: string) => ({ width: shapes[value]?.[1] || 40 }),
    getImageData: () => {
      const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
      data[0] = shapes[current]?.[0] ?? 12;
      data[3] = 255;
      return { data };
    },
  };
  return { context, isSupported: createEmojiSupportDetector(context as unknown as CanvasRenderingContext2D) };
}

describe('native emoji support', () => {
  it('rejects missing glyphs while keeping valid black emojis and complete ligatures', () => {
    const { isSupported } = probe();
    expect(isSupported('🫠')).toBe(false);
    for (const value of ['😀', '⚫', '👩‍💻', '🏳️‍🌈']) expect(isSupported(value), value).toBe(true);
  });

  it('rejects ignored joiners, partial sequences, letter flags and ignored flag tags', () => {
    const { isSupported } = probe();
    for (const value of ['🙂‍↔️', '👩‍👩‍👧', '🇨🇷', '🏴\u{e0067}\u{e0062}\u{e007f}']) {
      expect(isSupported(value), value).toBe(false);
    }
  });

  it('reuses glyph and compatibility results instead of repainting on each search', () => {
    const { context, isSupported } = probe();
    isSupported('👩‍💻');
    const paints = context.fillText.mock.calls.length;
    isSupported('👩‍💻');
    expect(context.fillText).toHaveBeenCalledTimes(paints);
  });

  it('keeps composed flags, modifiers and keycaps, while rejecting detached modifiers', () => {
    const { isSupported } = probe();
    expect(isSupported('👍🏻')).toBe(false);
    for (const value of ['👍🏽', '1️⃣', '🇯🇵']) expect(isSupported(value), value).toBe(true);
  });

  it('reports an unavailable canvas instead of advertising unchecked emojis', async () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    try {
      await expect(filterSupportedEmojis(['😀'])).rejects.toThrow('Canvas is unavailable');
    } finally { getContext.mockRestore(); }
  });
});
