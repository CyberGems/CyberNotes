export interface ThemeColors {
  id: string;
  name: string;
  nameEs?: string;
  nameEn?: string;
  emoji: string;
  preview: string;
  vars: Record<string, string>;
}

export const THEMES: ThemeColors[] = [
  {
    id: 'cyber-dark',
    name: 'CyberNotes',
    nameEs: 'CyberNotes',
    nameEn: 'CyberNotes',
    emoji: '🌌',
    preview: '#7a6a9a',
    vars: {
      '--bg-app': '#0c0c12',
      '--bg-sidebar': '#0e0e18',
      '--bg-notelist': '#10101e',
      '--bg-editor': '#121220',
      '--bg-surface': '#181828',
      '--bg-hover': 'rgba(255,255,255,0.04)',
      '--bg-active': 'rgba(160,130,200,0.15)',
      '--bg-input': '#10101e',
      '--bg-modal': '#121220',
      '--border': '#282838',
      '--border-focus': '#7a6a9a',
      '--accent': '#7a6a9a',
      '--accent-light': '#9a8ab8',
      '--accent-dim': 'rgba(122,106,154,0.12)',
      '--accent-glow': 'rgba(122,106,154,0.15)',
      '--text-primary': '#eeeef5',
      '--text-secondary': '#a8a8c0',
      '--text-muted': '#9090a8',
      '--text-accent': '#9a8ab8',
      '--text-on-accent': '#ffffff',
      '--scrollbar-track': '#0e0e18',
      '--scrollbar-thumb': '#282838',
      '--bg-sidebar-glass': 'rgba(14,14,24,0.8)',
      '--bg-notelist-glass': 'rgba(16,16,30,0.7)',
      '--bg-editor-glass': 'rgba(18,18,32,0.6)',
      '--pulse-1': '#6a8a9a',
      '--pulse-2': '#9a7a8a',
      '--pulse-3': '#8a6a9a',
    },
  },
  {
    id: 'midnight',
    name: 'Cian Medianoche',
    nameEs: 'Cian Medianoche',
    nameEn: 'Midnight Cyan',
    emoji: '🌃',
    preview: '#5a8a98',
    vars: {
      '--bg-app': '#0a0f18',
      '--bg-sidebar': '#0c111e',
      '--bg-notelist': '#0e1322',
      '--bg-editor': '#101528',
      '--bg-surface': '#161e30',
      '--bg-hover': 'rgba(255,255,255,0.03)',
      '--bg-active': 'rgba(100,160,170,0.15)',
      '--bg-input': '#0e1322',
      '--bg-modal': '#101528',
      '--border': '#1e2840',
      '--border-focus': '#5a8a98',
      '--accent': '#5a8a98',
      '--accent-light': '#7aa8b8',
      '--accent-dim': 'rgba(90,138,152,0.12)',
      '--accent-glow': 'rgba(90,138,152,0.15)',
      '--text-primary': '#dde8f0',
      '--text-secondary': '#889aa8',
      '--text-muted': '#708090',
      '--text-accent': '#7aa8b8',
      '--text-on-accent': '#ffffff',
      '--scrollbar-track': '#0c111e',
      '--scrollbar-thumb': '#1e2840',
      '--bg-sidebar-glass': 'rgba(12,17,30,0.8)',
      '--bg-notelist-glass': 'rgba(14,19,34,0.7)',
      '--bg-editor-glass': 'rgba(16,21,40,0.6)',
      '--pulse-1': '#6a8a7a',
      '--pulse-2': '#8a7a8a',
      '--pulse-3': '#7a6a8a',
    },
  },
  {
    id: 'forest',
    name: 'Verde Bosque',
    nameEs: 'Verde Bosque',
    nameEn: 'Forest Green',
    emoji: '🌿',
    preview: '#5a6d5a',
    vars: {
      '--bg-app': '#0c0c0c',
      '--bg-sidebar': '#0e0e0e',
      '--bg-notelist': '#101010',
      '--bg-editor': '#121212',
      '--bg-surface': '#181818',
      '--bg-hover': 'rgba(255,255,255,0.03)',
      '--bg-active': 'rgba(90,130,100,0.12)',
      '--bg-input': '#101010',
      '--bg-modal': '#121212',
      '--border': '#202020',
      '--border-focus': '#5a6d5a',
      '--accent': '#5a6d5a',
      '--accent-light': '#7a8d7a',
      '--accent-dim': 'rgba(90,109,90,0.12)',
      '--accent-glow': 'rgba(90,109,90,0.15)',
      '--text-primary': '#e0ece2',
      '--text-secondary': '#90a098',
      '--text-muted': '#708070',
      '--text-accent': '#7a8d7a',
      '--text-on-accent': '#ffffff',
      '--scrollbar-track': '#0e0e0e',
      '--scrollbar-thumb': '#202020',
      '--bg-sidebar-glass': 'rgba(14,14,14,0.85)',
      '--bg-notelist-glass': 'rgba(16,16,16,0.75)',
      '--bg-editor-glass': 'rgba(18,18,18,0.65)',
      '--pulse-1': '#6a7a6a',
      '--pulse-2': '#7a7a5a',
      '--pulse-3': '#7a6a7a',
    },
  },
  {
    id: 'neon',
    name: 'Magenta Neón',
    nameEs: 'Magenta Neón',
    nameEn: 'Neon Magenta',
    emoji: '🎆',
    preview: '#8a7a8a',
    vars: {
      '--bg-app': '#0c0a0c',
      '--bg-sidebar': '#0e0c0e',
      '--bg-notelist': '#100e10',
      '--bg-editor': '#121012',
      '--bg-surface': '#181618',
      '--bg-hover': 'rgba(255,255,255,0.03)',
      '--bg-active': 'rgba(160,120,140,0.15)',
      '--bg-input': '#100e10',
      '--bg-modal': '#121012',
      '--border': '#222022',
      '--border-focus': '#8a7a8a',
      '--accent': '#8a7a8a',
      '--accent-light': '#aa9aaa',
      '--accent-dim': 'rgba(138,122,138,0.12)',
      '--accent-glow': 'rgba(138,122,138,0.15)',
      '--text-primary': '#eeeaf5',
      '--text-secondary': '#a89aa8',
      '--text-muted': '#887888',
      '--text-accent': '#aa9aaa',
      '--text-on-accent': '#ffffff',
      '--scrollbar-track': '#0e0c0e',
      '--scrollbar-thumb': '#222022',
      '--bg-sidebar-glass': 'rgba(14,12,14,0.75)',
      '--bg-notelist-glass': 'rgba(16,14,16,0.65)',
      '--bg-editor-glass': 'rgba(18,16,18,0.55)',
      '--pulse-1': '#6a8a8a',
      '--pulse-2': '#9a7a7a',
      '--pulse-3': '#7a6a9a',
    },
  },
  {
    id: 'light',
    name: 'Blanco Claro',
    nameEs: 'Blanco Claro',
    nameEn: 'Pure Light',
    emoji: '☀️',
    preview: '#6a60a0',
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
      '--accent-light': '#8a80b8',
      '--accent-dim': 'rgba(106,96,160,0.08)',
      '--accent-glow': 'rgba(106,96,160,0.10)',
      '--text-primary': '#1a1a2e',
      '--text-secondary': '#5a5a72',
      '--text-muted': '#7a7a90',
      '--text-accent': '#6a60a0',
      '--text-on-accent': '#ffffff',
      '--scrollbar-track': '#e8eaf2',
      '--scrollbar-thumb': '#c8cad0',
      '--bg-sidebar-glass': 'rgba(232,234,242,0.8)',
      '--bg-notelist-glass': 'rgba(255,255,255,0.7)',
      '--bg-editor-glass': 'rgba(255,255,255,0.6)',
      '--pulse-1': '#5a8a8a',
      '--pulse-2': '#8a6a8a',
      '--pulse-3': '#7a5a9a',
    },
  },
  {
    id: 'graphite',
    name: 'Gris Grafito',
    nameEs: 'Gris Grafito',
    nameEn: 'Graphite Gray',
    emoji: '📽️',
    preview: '#9ca3af',
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
      '--border-focus': '#9ca3af',
      '--accent': '#9ca3af',
      '--accent-light': '#d1d5db',
      '--accent-dim': 'rgba(156,163,175,0.15)',
      '--accent-glow': 'rgba(156,163,175,0.20)',
      '--text-primary': '#f9fafb',
      '--text-secondary': '#c9d1d9',
      '--text-muted': '#9aa3ad',
      '--text-accent': '#c9d1d9',
      '--text-on-accent': '#000000',
      '--scrollbar-track': '#121212',
      '--scrollbar-thumb': '#2d2d2d',
      '--bg-sidebar-glass': 'rgba(18,18,18,0.85)',
      '--bg-notelist-glass': 'rgba(22,22,22,0.75)',
      '--bg-editor-glass': 'rgba(26,26,26,0.65)',
      '--pulse-1': '#8aa0a0',
      '--pulse-2': '#a09090',
      '--pulse-3': '#9090a8',
    },
  },
];

const COLORFUL_THEMES = new Set(['cyber-dark', 'midnight', 'forest', 'neon']);

export function isColorfulTheme(themeId: string): boolean {
  return COLORFUL_THEMES.has(themeId);
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
  let theme = THEMES.find(t => t.id === themeId);
  if (!theme) return '#888';
  let mult = isColorfulTheme(themeId) ? 0.35 + (intensity / 100) * 1.3 : 1.0;
  return scaleColor(theme.preview, mult);
}

export function applyThemeVars(themeId: string, intensity: number = 50) {
  let theme = THEMES.find(t => t.id === themeId);
  if (!theme) return;
  let root = document.documentElement;
  let mult = isColorfulTheme(themeId) ? 0.35 + (intensity / 100) * 1.3 : 1.0;
  for (let [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, scaleColor(value, mult));
  }
}
