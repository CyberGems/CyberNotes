import { createGlyphSupportDetector, filterSupportedGlyphs } from './glyphSupport';

export const EMOJI_FONT_FAMILY = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", "Noto Emoji", sans-serif';

export function createEmojiSupportDetector(context: CanvasRenderingContext2D) {
  return createGlyphSupportDetector(context, EMOJI_FONT_FAMILY);
}

// Bump the schema when the support detector changes its compatibility rules.
const SUPPORT_CACHE_KEY = 'cybernotes-emoji-support-v1';
const FONT_SAMPLES = ['AΩ中', '😀', '❤️', '⚫', '👩‍💻', '👨‍👩‍👧‍👦', '🏳️‍🌈', '🇨🇷', '1️⃣', '👍🏽', '🏴', '🫠', '🫨', '🙂‍↔️', '🙂‍↕️', '\u{10ffff}'];

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

function fontFingerprint(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 48;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is unavailable for native emoji detection');
  context.font = `400 32px ${EMOJI_FONT_FAMILY}`;
  context.textBaseline = 'alphabetic';
  context.fillStyle = '#000000';
  let hash = 2166136261;
  const widths: number[] = [];
  for (const sample of FONT_SAMPLES) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillText(sample, 4, 36);
    widths.push(context.measureText(sample).width);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < data.length; index++) hash = Math.imul(hash ^ data[index], 16777619);
  }
  return `${hash >>> 0}:${widths.join(',')}`;
}

export async function filterSupportedEmojis(values: readonly string[]): Promise<ReadonlySet<string>> {
  await document.fonts.ready;
  // Native rendering samples catch font/fallback changes without scanning the
  // complete catalog again. Theme, language and zoom do not affect this probe.
  const key = `${navigator.userAgent}|${EMOJI_FONT_FAMILY}|${hashText(values.join('\0'))}|${fontFingerprint()}`;
  const candidates = new Set(values);
  try {
    const cached = JSON.parse(localStorage.getItem(SUPPORT_CACHE_KEY) || 'null');
    if (cached?.key === key && Array.isArray(cached.supported)
      && cached.supported.every((value: unknown) => typeof value === 'string' && candidates.has(value))) {
      return new Set<string>(cached.supported);
    }
  } catch { /* Storage may be unavailable or contain an interrupted write. */ }

  const supported = await filterSupportedGlyphs(values, EMOJI_FONT_FAMILY);
  try {
    localStorage.setItem(SUPPORT_CACHE_KEY, JSON.stringify({ key, supported: [...supported] }));
  } catch { /* Compatibility remains usable when optional storage is unavailable. */ }
  return supported;
}
