// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyThemeVars, DEFAULT_THEME, getPreviewColor, getThemeVars, normalizeThemeId, THEMES } from './themes';

describe('suite themes', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('style');
    delete document.documentElement.dataset.theme;
  });

  it('offers exactly CyberNotes, Gray and Light with matching Spanish names', () => {
    expect(THEMES.map(theme => [theme.id, theme.nameEs, theme.nameEn])).toEqual([
      ['cyber-dark', 'CyberNotes', 'CyberNotes'], ['graphite', 'Gris', 'Gray'], ['light', 'Claro', 'Light'],
    ]);
    expect(DEFAULT_THEME).toBe('cyber-dark');
  });

  it.each(['midnight', 'forest', 'neon', 'unknown', '', null, undefined])('normalizes retired or missing preference %s to the default', value => {
    expect(normalizeThemeId(value)).toBe(DEFAULT_THEME);
  });

  it.each(['cyber-dark', 'graphite', 'light'])('preserves the supported preference %s', id => {
    expect(normalizeThemeId(id)).toBe(id);
  });

  it.each([0, 50, 100])('keeps Gray neutral at color intensity %s', intensity => {
    applyThemeVars('graphite', intensity);
    const vars = THEMES.find(theme => theme.id === 'graphite')!.vars;
    for (const key of Object.keys(vars)) {
      const value = document.documentElement.style.getPropertyValue(key);
      if (/^#[0-9a-f]{6}$/i.test(value)) {
        expect(value.slice(1, 3), key).toBe(value.slice(3, 5));
        expect(value.slice(3, 5), key).toBe(value.slice(5, 7));
      } else if (/^(?:rgba?\()?\d+,\d+,\d+/.test(value)) {
        const channels = value.match(/\d+/g)!;
        expect(channels[0], key).toBe(channels[1]);
        expect(channels[1], key).toBe(channels[2]);
      }
    }
    expect(getPreviewColor('graphite', intensity)).toBe('#a8a8a8');
  });

  it('resets every theme token and native color scheme when switching themes', () => {
    const keys = Object.keys(THEMES[0].vars).sort();
    for (const theme of THEMES) expect(Object.keys(theme.vars).sort()).toEqual(keys);
    for (const id of ['light', 'graphite', 'cyber-dark', 'light']) {
      applyThemeVars(id);
      const theme = THEMES.find(theme => theme.id === id)!;
      expect(document.documentElement.dataset.theme).toBe(id);
      expect(document.documentElement.style.colorScheme).toBe(theme.colorScheme);
      expect(document.documentElement.style.getPropertyValue('--update-rgb')).toBe(theme.vars['--update-rgb']);
      expect(document.documentElement.style.getPropertyValue('--badge-color-share')).toBe(theme.vars['--badge-color-share']);
    }
    applyThemeVars('forest');
    expect(document.documentElement.dataset.theme).toBe(DEFAULT_THEME);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  it('provides the same palette to independent windows without changing the renderer theme', () => {
    applyThemeVars('light');
    for (const theme of THEMES) {
      for (const intensity of [0, 50, 100]) {
        const vars = getThemeVars(theme.id, intensity);
        expect(document.documentElement.dataset.theme).toBe('light');
        applyThemeVars(theme.id, intensity);
        for (const [key, value] of Object.entries(vars)) {
          expect(document.documentElement.style.getPropertyValue(key), key).toBe(value);
        }
        applyThemeVars('light');
      }
    }
  });
});
