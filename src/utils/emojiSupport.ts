import { createGlyphSupportDetector, filterSupportedGlyphs } from './glyphSupport';

export const EMOJI_FONT_FAMILY = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", "Noto Emoji", sans-serif';

export function createEmojiSupportDetector(context: CanvasRenderingContext2D) {
  return createGlyphSupportDetector(context, EMOJI_FONT_FAMILY);
}

export function filterSupportedEmojis(values: readonly string[]): Promise<ReadonlySet<string>> {
  return filterSupportedGlyphs(values, EMOJI_FONT_FAMILY);
}
