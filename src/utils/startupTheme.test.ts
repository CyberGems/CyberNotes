/// <reference types="vite/client" />
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import script from '../../public/startup-theme.js?raw';
import { getThemeVars, THEMES } from '../themes';

afterEach(() => {
  document.documentElement.removeAttribute('style');
  document.documentElement.removeAttribute('lang');
  delete document.documentElement.dataset.theme;
  vi.restoreAllMocks();
});

it.each(THEMES)('applies the saved $name palette before React starts, including after a reload', theme => {
  const getStartupAppearance = vi.fn();
  Object.assign(window, { cyberNotesAPI: { getStartupAppearance } });
  for (const language of ['es', 'en'] as const) {
    const vars = getThemeVars(theme.id, 75);
    getStartupAppearance.mockReturnValue({ theme: theme.id, vars, language, colorScheme: theme.colorScheme });
    new Function('window', 'document', script)(window, document);
    expect(document.documentElement.dataset.theme).toBe(theme.id);
    expect(document.documentElement.lang).toBe(language);
    expect(document.documentElement.style.colorScheme).toBe(theme.colorScheme);
    for (const [key, value] of Object.entries(vars)) {
      expect(document.documentElement.style.getPropertyValue(key), key).toBe(value);
    }
  }
  expect(getStartupAppearance).toHaveBeenCalledTimes(2);
});

it('reports a failed preference read instead of silently hiding it', () => {
  const error = new Error('Startup IPC unavailable');
  Object.assign(window, { cyberNotesAPI: { getStartupAppearance: () => { throw error; } } });
  const report = vi.spyOn(console, 'error').mockImplementation(() => {});
  new Function('window', 'document', script)(window, document);
  expect(report).toHaveBeenCalledExactlyOnceWith('Could not read the startup appearance:', error);
});
