// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsModal from './SettingsModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('settings search', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let props: ComponentProps<typeof SettingsModal>;
  const setSetting = vi.fn();

  beforeEach(() => {
    setSetting.mockClear();
    vi.stubGlobal('cyberNotesAPI', {
      hasPassword: vi.fn().mockResolvedValue(false), hasRecoveryCode: vi.fn().mockResolvedValue(false),
      getSetting: vi.fn().mockResolvedValue(null), getSettings: vi.fn().mockResolvedValue({}),
      getVersions: vi.fn().mockResolvedValue({ app: '1.17.0' }), getAutoStart: vi.fn().mockResolvedValue(false),
      listDictionaryWords: vi.fn().mockResolvedValue({ ok: true, words: [] }),
      listAccessLog: vi.fn().mockResolvedValue({ ok: true, events: [] }), setSetting,
    });
    const noop = vi.fn();
    props = {
      language: 'es', onLanguageChange: noop, currentTheme: 'cyber-dark', onThemeChange: noop,
      colorIntensity: 1, onIntensityChange: noop, bgImage: null, onBgImageChange: noop,
      glassBlur: 10, onBlurChange: noop, bgOpacity: 0.5, onOpacityChange: noop,
      autoLockMinutes: 0, onAutoLockChange: noop, rememberLastNote: true, onRememberLastNoteChange: noop,
      showLineCounter: true, onShowLineCounterChange: noop, showLineGutter: false, onShowLineGutterChange: noop,
      showWrapGuides: true, onShowWrapGuidesChange: noop, autosaveEnabled: true, onAutosaveEnabledChange: noop,
      autoUnlockCapsLock: false, onAutoUnlockCapsLockChange: noop, autoUnlockCapsLockTimeout: 10, onAutoUnlockCapsLockTimeoutChange: noop,
      capsLockSound: 'cyber-beep', onCapsLockSoundChange: noop, capsLockSoundScope: 'app', onCapsLockSoundScopeChange: noop,
      onClose: vi.fn(), onLock: noop, tabsWidthMode: 'normal', onTabsWidthModeChange: noop,
      showMinimap: false, onShowMinimapChange: noop, showWordCounter: true, onShowWordCounterChange: noop,
      showKeyboardIndicators: true, onShowKeyboardIndicatorsChange: noop,
      showFloatingToolbar: true, onShowFloatingToolbarChange: vi.fn(),
      showImageToolbar: true, onShowImageToolbarChange: vi.fn(), hiddenToolbarIds: [], onHiddenToolbarIdsChange: noop,
      showTableToolbar: true, onShowTableToolbarChange: vi.fn(),
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function render() {
    await act(async () => root.render(<SettingsModal {...props} />));
  }

  it.each(['es', 'en'] as const)('lists only the three suite themes in appearance (%s)', async language => {
    props.language = language;
    props.initialTab = 'appearance';
    await render();
    const themeNames = language === 'es' ? ['CyberNotes', 'Gris', 'Claro'] : ['CyberNotes', 'Gray', 'Light'];
    for (const name of themeNames) {
      expect([...container.querySelectorAll('button')].filter(button => button.textContent?.includes(name)).length).toBeGreaterThan(0);
    }
    for (const retired of ['Cian Medianoche', 'Midnight Cyan', 'Verde Bosque', 'Forest Green', 'Magenta Neón', 'Neon Magenta', 'Gris Grafito', 'Pure Light']) {
      expect(container.textContent).not.toContain(retired);
    }
  });

  const input = () => container.querySelector<HTMLInputElement>('.settings-search input')!;
  const content = () => container.querySelector<HTMLElement>('.settings-content')!;

  async function search(query: string) {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input(), query);
      input().dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('finds all three actionable toolbar preferences across tabs without changing settings', async () => {
    await render();
    expect(content().textContent).not.toContain('Barra de imagen');
    await search('BARRA');
    expect(content().querySelector('section[aria-label="Apariencia"]')).not.toBeNull();
    const switches = Array.from(content().querySelectorAll<HTMLButtonElement>('[role="switch"]'));
    const image = switches.find(button => button.textContent?.includes('Barra de imagen'))!;
    const text = switches.find(button => button.textContent?.includes('Barra flotante de texto'))!;
    const table = switches.find(button => button.textContent?.includes('Barra de tablas'))!;
    expect(image.getAttribute('aria-checked')).toBe('true');
    expect(text.getAttribute('aria-checked')).toBe('true');
    expect(table.getAttribute('aria-checked')).toBe('true');
    expect(content().textContent).not.toContain('Tema visual');
    expect(setSetting).not.toHaveBeenCalled();
    await act(async () => { image.click(); text.click(); table.click(); });
    expect(props.onShowImageToolbarChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(props.onShowFloatingToolbarChange).toHaveBeenCalledExactlyOnceWith(false);
    expect(props.onShowTableToolbarChange).toHaveBeenCalledExactlyOnceWith(false);
    await search('BARRA IMAGEN');
    expect(content().textContent).toContain('Barra de imagen');
    expect(content().textContent).not.toContain('Barra flotante de texto');
    expect(content().textContent).not.toContain('Ancho de pestañas');
    await search('BARRA TABLAS');
    expect(content().querySelector('[role="switch"]')?.textContent).toContain('Barra de tablas');
    expect(content().textContent).not.toContain('Barra de imagen');
    expect(content().textContent).not.toContain('Barra flotante de texto');
  });

  it('ignores accents and searches security, statistics, and component-rendered cards', async () => {
    await render();
    await search('codigo recuperacion');
    expect(content().textContent).toContain('Código de recuperación');
    expect(content().textContent).not.toContain('Tema visual');
    await search('estadisticas');
    expect(content().textContent).toContain('Estadísticas de uso');
    await search('ortografico');
    expect(content().textContent).toContain('Corrector ortográfico');
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('shows an empty result and clears with Escape while keeping settings open', async () => {
    await render();
    await search('zz-no-such-setting');
    expect(content().querySelector('[role="status"]')?.textContent).toBe('No se encontraron ajustes.');
    await act(async () => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
    expect(input().value).toBe('');
    expect(content().textContent).toContain('Preferencias');
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => { input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('clears the filter when choosing a category and supports Ctrl+F', async () => {
    await render();
    await search('zz-no-such-setting');
    const appearance = Array.from(container.querySelectorAll<HTMLButtonElement>('.settings-nav-btn')).find(button => button.textContent === 'Apariencia')!;
    await act(async () => appearance.click());
    expect(input().value).toBe('');
    expect(content().textContent).toContain('Barra de imagen');
    await act(async () => {
      appearance.focus();
      appearance.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(input());
  });

  it('provides English search, results, and toolbar controls', async () => {
    props = { ...props, language: 'en' };
    await render();
    expect(input().getAttribute('aria-label')).toBe('Search all settings');
    await search('toolbar');
    expect(content().querySelector('h2')?.textContent).toBe('Appearance');
    expect(content().textContent).toContain('Floating text toolbar');
    expect(content().textContent).toContain('Image toolbar');
    expect(content().textContent).toContain('Table toolbar');
    await search('table toolbar');
    expect(content().querySelector('[role="switch"]')?.textContent).toContain('Table toolbar');
    await search('zz-no-such-setting');
    expect(content().querySelector('[role="status"]')?.textContent).toBe('No matching settings found.');
  });
});
