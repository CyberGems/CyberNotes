/// <reference lib="es2022.intl" />

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Keep emoji sequences, modifiers and combining accents together in recents. */
export function splitPickerText(text: string): string[] {
  return Array.from(segmenter.segment(text), entry => entry.segment);
}
