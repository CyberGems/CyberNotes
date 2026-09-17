// Paleta de notas flotantes compartida entre main y renderer.
// Unica fuente de verdad para ids y fondos: el renderer anade accent/borde/header.

export type StickyColorId =
  | 'cyber-yellow'
  | 'neon-cyan'
  | 'matrix-green'
  | 'midnight-purple'
  | 'cyber-pink'
  | 'graphite'
  | 'electric-blue'
  | 'cyber-orange'
  | 'acid-lime';

export const STICKY_COLOR_IDS: readonly StickyColorId[] = [
  'cyber-yellow',
  'neon-cyan',
  'matrix-green',
  'midnight-purple',
  'cyber-pink',
  'graphite',
  'electric-blue',
  'cyber-orange',
  'acid-lime',
];

export const DEFAULT_STICKY_COLOR: StickyColorId = 'cyber-yellow';

export const STICKY_BACKGROUNDS: Record<StickyColorId, string> = {
  'cyber-yellow': '#1c160c',
  'neon-cyan': '#0a1820',
  'matrix-green': '#0a1c12',
  'midnight-purple': '#180c22',
  'cyber-pink': '#1e0c14',
  graphite: '#121218',
  'electric-blue': '#0a1226',
  'cyber-orange': '#24120a',
  'acid-lime': '#141e0a',
};

/** Normaliza un color desconocido al color por defecto (nunca undefined). */
export function asStickyColorId(value: unknown): StickyColorId {
  return (STICKY_COLOR_IDS as readonly string[]).includes(value as string)
    ? (value as StickyColorId)
    : DEFAULT_STICKY_COLOR;
}
