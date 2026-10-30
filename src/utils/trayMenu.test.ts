/// <reference types="vite/client" />
// @vitest-environment jsdom
import markup from '../../public/tray-menu.html?raw';
import script from '../../public/tray-menu.js?raw';
import { expect, it, vi } from 'vitest';
import { getThemeVars } from '../themes';

it('applies live theme updates in every tray view and keeps bilingual navigation and actions', () => {
  document.body.innerHTML = markup.match(/<body>([\s\S]*?)<\/body>/)![1];
  let receiveState: (state: unknown) => void = () => { throw new Error('Missing state subscription'); };
  const action = vi.fn();
  Object.assign(window, {
    trayMenu: { onState: (callback: typeof receiveState) => { receiveState = callback; }, onShow: vi.fn(), ready: vi.fn(), action },
  });
  new Function('window', 'document', script)(window, document);

  const open = (label: string) => {
    const button = [...document.querySelectorAll('button')].find(el => el.textContent === label);
    expect(button, label).toBeTruthy();
    button!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  };
  for (const lang of ['es', 'en']) {
    const state = {
      lang, head: 'CyberNotes', showLabel: 'CyberNotes', settingsLabel: 'Settings', exitLabel: 'Exit',
      suite: { apps: [{ name: 'CyberPaste', desc: lang === 'es' ? 'Portapapeles' : 'Clipboard', action: 'suite-cyberpaste' }] },
    };
    receiveState({ ...state, theme: 'light', themeVars: getThemeVars('light'), resetView: true });
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--bg-modal')).toBe('#ffffff');
    open(lang === 'es' ? 'Ayuda' : 'Help');
    expect(document.querySelector('.shell.help-view')).toBeTruthy();

    receiveState({ ...state, theme: 'graphite', themeVars: getThemeVars('graphite') });
    expect(document.querySelector('.shell.help-view')).toBeTruthy();
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--bg-modal')).toBe('#1e1e1e');
    document.querySelector('.head-suite-back')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    open(lang === 'es' ? 'Más de CyberGems' : 'More from CyberGems');
    expect(document.querySelector('.shell.suite-view')).toBeTruthy();

    receiveState({ ...state, theme: 'light', themeVars: getThemeVars('light') });
    expect(document.querySelector('.shell.suite-view')).toBeTruthy();
    expect(document.documentElement.style.getPropertyValue('--text-primary')).toBe('#1a1a2e');
    const app = document.querySelector('.stacked-label')!.closest('button')!;
    app.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(action).toHaveBeenLastCalledWith('suite-cyberpaste');
  }
  document.body.innerHTML = '';
  document.documentElement.removeAttribute('style');
  delete document.documentElement.dataset.theme;
});
