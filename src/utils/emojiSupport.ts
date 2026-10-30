export const EMOJI_FONT_FAMILY = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", "Noto Emoji", sans-serif';

interface GlyphSignature {
  width: number;
  inkWidth: number;
  inkHeight: number;
  hash: number;
}

/** Probe the same native font stack used by the picker, including complete sequences. */
export function createEmojiSupportDetector(context: CanvasRenderingContext2D) {
  const canvas = context.canvas;
  canvas.width = 256;
  canvas.height = 64;
  context.font = `32px ${EMOJI_FONT_FAMILY}`;
  context.textBaseline = 'top';
  context.fillStyle = '#000000';
  const signatures = new Map<string, GlyphSignature>();
  const widths = new Map<string, number>();
  const results = new Map<string, boolean>();
  const measure = (value: string) => {
    let width = widths.get(value);
    if (width === undefined) { width = context.measureText(value).width; widths.set(value, width); }
    return width;
  };

  const render = (value: string): GlyphSignature => {
    const cached = signatures.get(value);
    if (cached) return cached;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillText(value, 4, 4);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (!data[(y * canvas.width + x) * 4 + 3]) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    let hash = 2166136261;
    for (let y = top; y <= bottom; y++) {
      for (let x = left; x <= right; x++) {
        for (let channel = 0; channel < 4; channel++) {
          hash = Math.imul(hash ^ data[(y * canvas.width + x) * 4 + channel], 16777619);
        }
      }
    }
    const signature = {
      width: measure(value),
      inkWidth: right < left ? 0 : right - left + 1,
      inkHeight: bottom < top ? 0 : bottom - top + 1,
      hash: hash >>> 0,
    };
    signatures.set(value, signature);
    return signature;
  };
  const sameImage = (a: GlyphSignature, b: GlyphSignature) =>
    a.inkWidth === b.inkWidth && a.inkHeight === b.inkHeight && a.hash === b.hash;
  const missingGlyphs = [render('\u{10ffff}'), render('\uffff')];

  return (value: string): boolean => {
    const cached = results.get(value);
    if (cached !== undefined) return cached;
    let supported = measure(value) > 0;
    for (const character of Array.from(value)) {
      const code = character.codePointAt(0)!;
      if (code === 0x200d || code === 0xfe0f || code === 0xfe0e || (code >= 0xe0020 && code <= 0xe007f)) continue;
      // Only glyphs with the missing-glyph advance need a bitmap comparison.
      // Most supported characters and ligatures can be decided from metrics.
      if (missingGlyphs.some(missing => measure(character) === missing.width && sameImage(render(character), missing))) supported = false;
    }
    // An ignored joiner means the font draws separate images, even when every
    // individual character exists. Check each join so partial fallbacks fail too.
    for (let index = value.indexOf('\u200d'); supported && index !== -1; index = value.indexOf('\u200d', index + 1)) {
      const unjoined = value.slice(0, index) + value.slice(index + 1);
      if (measure(value) === measure(unjoined) && sameImage(render(value), render(unjoined))) supported = false;
    }
    if (supported && (/^[\u{1f1e6}-\u{1f1ff}]{2}$/u.test(value) ||
      (Array.from(value).length > 1 && /[\u{1f3fb}-\u{1f3ff}\u20e3]/u.test(value)))) {
      const separated = Array.from(value).join('\u200b');
      if (measure(value) === measure(separated) && sameImage(render(value), render(separated))) supported = false;
    }
    if (supported && /[\u{e0020}-\u{e007f}]/u.test(value)) {
      const withoutTags = value.replace(/[\u{e0020}-\u{e007f}]/gu, '');
      if (measure(value) === measure(withoutTags) && sameImage(render(value), render(withoutTags))) supported = false;
    }
    results.set(value, supported);
    return supported;
  };
}

export async function filterSupportedEmojis(values: readonly string[]): Promise<ReadonlySet<string>> {
  await document.fonts.ready;
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable for native emoji detection');
  const isSupported = createEmojiSupportDetector(context);
  const supported = new Set<string>();
  let index = 0;
  while (index < values.length) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const start = performance.now();
    do {
      const value = values[index++];
      if (isSupported(value)) supported.add(value);
    } while (index < values.length && performance.now() - start < 8);
  }
  return supported;
}
