import type { ThemeId } from './types';

export interface ThemeColors {
  id: ThemeId;
  name: string;
  nameEs?: string;
  nameEn?: string;
  emoji: string;
  preview: string;
  /** Esquema nativo de controles (popups de select, checkboxes). */
  colorScheme: 'dark' | 'light';
  vars: Record<string, string>;
}

export const THEMES: ThemeColors[] = [
  {
    id: 'cyber-dark',
    name: 'CyberNotes',
    nameEs: 'CyberNotes',
    nameEn: 'CyberNotes',
    emoji: '🌌',
    preview: '#6c63e6',
    colorScheme: 'dark',
    vars: {
      '--bg-app': '#0c0c12',
      '--bg-sidebar': '#0e0e18',
      '--bg-notelist': '#10101e',
      '--bg-editor': '#121220',
      '--bg-surface': '#181828',
      '--bg-hover': 'rgba(255,255,255,0.04)',
      '--bg-active': 'rgba(115,104,230,0.18)',
      '--bg-input': '#10101e',
      '--bg-modal': '#121220',
      '--border': '#282838',
      '--border-focus': '#6c63e6',
      '--accent': '#6c63e6',
      '--accent-light': '#968fff',
      '--accent-dim': 'rgba(108,99,230,0.14)',
      '--accent-glow': 'rgba(108,99,230,0.22)',
      '--text-primary': '#eeeef5',
      '--text-secondary': '#a8a8c0',
      '--text-muted': '#9090a8',
      '--text-accent': '#968fff',
      '--text-on-accent': '#ffffff',
      '--scrollbar-track': '#0e0e18',
      '--scrollbar-thumb': '#282838',
      '--bg-sidebar-glass': 'rgba(14,14,24,0.8)',
      '--bg-notelist-glass': 'rgba(16,16,30,0.7)',
      '--bg-editor-glass': 'rgba(18,18,32,0.6)',
      '--update-rgb': '0,255,255',
      '--update-pulse-min-opacity': '0.5',
      '--tooltip-rgb': '15,15,20',
      '--editor-menu-rgb': '10,10,18',
      '--menu-hover-bg': 'rgba(255,255,255,0.07)',
      '--menu-hover-text': '#ffffff',
      '--folder-count-text': '#ffffff',
      '--badge-glow-size': '6px',
      '--badge-color-share': '100%',
      '--dialog-rgb': '15,15,22',
      // CSS-wide initial keeps each surface's original dark fallback.
      '--overlay-bg': 'initial',
      '--inset-bg': 'initial',
      '--shadow-elevated': 'initial',
      '--switch-off-bg': '#5e6672',
      '--switch-off-thumb': '#12161e',
      '--switch-off-border': 'transparent',
      '--minimap-rgb': '8,8,16',
      '--minimap-viewport-bg': 'var(--accent)',
      '--minimap-viewport-opacity': '0.15',
      '--minimap-viewport-border': 'var(--accent)',
      '--status-color-share': '100%',
      '--danger': '#ef4444',
      '--danger-dim': 'rgba(239,68,68,0.15)',
      '--danger-text': '#fca5a5',
      '--danger-hover-text': '#ffffff',
      '--danger-fill-text': '#ffffff',
      '--pulse-1': '#6477d9',
      '--pulse-2': '#8c70d8',
      '--pulse-3': '#7064d8',
    },
  },
  {
    id: 'graphite',
    name: 'Gris',
    nameEs: 'Gris',
    nameEn: 'Gray',
    emoji: '📽️',
    preview: '#a8a8a8',
    colorScheme: 'dark',
    vars: {
      '--bg-app': '#1a1a1a',
      '--bg-sidebar': '#121212',
      '--bg-notelist': '#161616',
      '--bg-editor': '#1a1a1a',
      '--bg-surface': '#242424',
      '--bg-hover': '#2c2c2c',
      '--bg-active': '#333333',
      '--bg-input': '#121212',
      '--bg-modal': '#1e1e1e',
      '--border': '#2d2d2d',
      '--border-focus': '#a8a8a8',
      '--accent': '#a8a8a8',
      '--accent-light': '#d4d4d4',
      '--accent-dim': 'rgba(168,168,168,0.12)',
      '--accent-glow': 'rgba(168,168,168,0.08)',
      '--text-primary': '#f2f2f2',
      '--text-secondary': '#c7c7c7',
      '--text-muted': '#a0a0a0',
      '--text-accent': '#c7c7c7',
      '--text-on-accent': '#000000',
      '--scrollbar-track': '#121212',
      '--scrollbar-thumb': '#484848',
      '--bg-sidebar-glass': 'rgba(18,18,18,0.85)',
      '--bg-notelist-glass': 'rgba(22,22,22,0.75)',
      '--bg-editor-glass': 'rgba(26,26,26,0.65)',
      '--update-rgb': '168,168,168',
      '--update-pulse-min-opacity': '0.7',
      '--tooltip-rgb': '20,20,20',
      '--editor-menu-rgb': '20,20,20',
      '--menu-hover-bg': '#303030',
      '--menu-hover-text': '#ffffff',
      '--folder-count-text': '#e5e5e5',
      '--badge-glow-size': '0px',
      '--badge-color-share': '0%',
      '--dialog-rgb': '30,30,30',
      // CSS-wide initial keeps each surface's original dark fallback.
      '--overlay-bg': 'initial',
      '--inset-bg': 'initial',
      '--shadow-elevated': 'initial',
      '--switch-off-bg': '#666666',
      '--switch-off-thumb': '#161616',
      '--switch-off-border': 'transparent',
      '--minimap-rgb': '24,24,24',
      '--minimap-viewport-bg': 'var(--accent)',
      '--minimap-viewport-opacity': '0.15',
      '--minimap-viewport-border': 'var(--accent)',
      '--status-color-share': '100%',
      '--danger': '#b3b3b3',
      '--danger-dim': 'rgba(179,179,179,0.15)',
      '--danger-text': '#ededed',
      '--danger-hover-text': '#ffffff',
      '--danger-fill-text': '#111111',
      '--pulse-1': '#8a8a8a',
      '--pulse-2': '#a0a0a0',
      '--pulse-3': '#909090',
    },
  },
  {
    id: 'light',
    name: 'Claro',
    nameEs: 'Claro',
    nameEn: 'Light',
    emoji: '☀️',
    preview: '#6a60a0',
    colorScheme: 'light',
    vars: {
      '--bg-app': '#f4f5f9',
      '--bg-sidebar': '#e8eaf2',
      '--bg-notelist': '#ffffff',
      '--bg-editor': '#ffffff',
      '--bg-surface': '#ffffff',
      '--bg-hover': '#f0f2f6',
      '--bg-active': '#e2e4ea',
      '--bg-input': '#f0f2f6',
      '--bg-modal': '#ffffff',
      '--border': '#d8dae0',
      '--border-focus': '#6a60a0',
      '--accent': '#6a60a0',
      '--accent-light': '#5f548e',
      '--accent-dim': 'rgba(106,96,160,0.08)',
      '--accent-glow': 'rgba(106,96,160,0.10)',
      '--text-primary': '#1a1a2e',
      '--text-secondary': '#5a5a72',
      '--text-muted': '#626277',
      '--text-accent': '#6a60a0',
      '--text-on-accent': '#ffffff',
      '--scrollbar-track': '#e8eaf2',
      '--scrollbar-thumb': '#838793',
      '--bg-sidebar-glass': 'rgba(232,234,242,0.8)',
      '--bg-notelist-glass': 'rgba(255,255,255,0.7)',
      '--bg-editor-glass': 'rgba(255,255,255,0.6)',
      '--update-rgb': '0,102,112',
      '--update-pulse-min-opacity': '0.85',
      '--tooltip-rgb': '30,30,36',
      '--editor-menu-rgb': '255,255,255',
      '--menu-hover-bg': '#eceef4',
      '--menu-hover-text': '#1a1a2e',
      '--folder-count-text': '#24243a',
      '--badge-glow-size': '0px',
      '--badge-color-share': '55%',
      '--dialog-rgb': '255,255,255',
      '--overlay-bg': 'rgba(32,36,48,0.28)',
      '--inset-bg': '#f3f4f8',
      '--shadow-elevated': '0 16px 40px rgba(30,34,48,0.16)',
      '--switch-off-bg': '#d1d5de',
      '--switch-off-thumb': '#5a6270',
      '--switch-off-border': '#939ba8',
      '--minimap-rgb': '241,243,248',
      '--minimap-viewport-bg': 'rgba(106,96,160,0.12)',
      '--minimap-viewport-opacity': '1',
      '--minimap-viewport-border': '#6a60a0',
      '--status-color-share': '75%',
      '--danger': '#b42318',
      '--danger-dim': 'rgba(180,35,24,0.10)',
      '--danger-text': '#a91f27',
      '--danger-hover-text': '#a91f27',
      '--danger-fill-text': '#ffffff',
      '--pulse-1': '#5a8a8a',
      '--pulse-2': '#8a6a8a',
      '--pulse-3': '#7a5a9a',
    },
  },
];

export const DEFAULT_THEME: ThemeId = 'cyber-dark';

export function normalizeThemeId(value: unknown): ThemeId {
  return THEMES.some(theme => theme.id === value) ? value as ThemeId : DEFAULT_THEME;
}

export function isColorfulTheme(themeId: string): boolean {
  return themeId === 'cyber-dark';
}

function hexToHsl(hex: string) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  let max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    let d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  let c = (1 - Math.abs(2 * l - 1)) * s;
  let x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  let m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  let toHex = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function parseRgba(rgba: string) {
  let m = rgba.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) return null;
  return { r: parseInt(m[1]), g: parseInt(m[2]), b: parseInt(m[3]), a: parseFloat(m[4]) };
}

function scaleColor(value: string, multiplier: number): string {
  if (/^#[0-9a-fA-F]{6}$/.test(value)) {
    let hsl = hexToHsl(value);
    let newS = Math.max(5, Math.min(100, Math.round(hsl.s * multiplier)));
    return hslToHex(hsl.h, newS, hsl.l);
  }
  if (value.startsWith('rgba')) {
    let p = parseRgba(value);
    if (!p) return value;
    let hex = `#${p.r.toString(16).padStart(2, '0')}${p.g.toString(16).padStart(2, '0')}${p.b.toString(16).padStart(2, '0')}`;
    let hsl = hexToHsl(hex);
    let newS = Math.max(5, Math.min(100, Math.round(hsl.s * multiplier)));
    let newHex = hslToHex(hsl.h, newS, hsl.l);
    return `rgba(${parseInt(newHex.slice(1, 3), 16)},${parseInt(newHex.slice(3, 5), 16)},${parseInt(newHex.slice(5, 7), 16)},${p.a})`;
  }
  return value;
}

export function getPreviewColor(themeId: string, intensity: number = 50): string {
  const theme = THEMES.find(t => t.id === normalizeThemeId(themeId))!;
  return isColorfulTheme(theme.id) ? scaleColor(theme.preview, 0.35 + (intensity / 100) * 1.3) : theme.preview;
}

/** Shared palette for renderer surfaces and the independent tray window. */
export function getThemeVars(themeId: string, intensity: number = 50): Record<string, string> {
  const theme = THEMES.find(t => t.id === normalizeThemeId(themeId))!;
  const mult = 0.35 + (intensity / 100) * 1.3;
  return Object.fromEntries(Object.entries(theme.vars).map(([key, value]) => [
    key, isColorfulTheme(theme.id) ? scaleColor(value, mult) : value,
  ]));
}

export function applyThemeVars(themeId: string, intensity: number = 50) {
  const theme = THEMES.find(t => t.id === normalizeThemeId(themeId))!;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(getThemeVars(theme.id, intensity))) {
    root.style.setProperty(key, value);
  }
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.colorScheme;
}
