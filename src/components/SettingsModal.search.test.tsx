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

  it.each(['es', 'en'] as const)('provides theme descriptions, previews and keyboard selection (%s)', async language => {
    props.language = language; props.initialTab = 'appearance'; props.onThemeChange = vi.fn();
    await render();
    const group = container.querySelector('[role="radiogroup"]')!;
    expect(group.getAttribute('aria-label')).toBe(language === 'es' ? 'Tema' : 'Theme');
    const cards = [...group.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(cards).toHaveLength(3);
    expect(cards.map(card => card.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    expect(cards.map(card => card.tabIndex)).toEqual([0, -1, -1]);
    expect(cards.every(card => card.querySelectorAll('.settings-theme-preview i').length === 3)).toBe(true);
    expect(cards[1].querySelector('.settings-theme-desc')?.textContent).toBe(language === 'es' ? 'Escala de grises sobria, sin color.' : 'Refined grayscale, no colour.');
    for (const card of cards) {
      expect(document.getElementById(card.getAttribute('aria-describedby')!)?.textContent).toBeTruthy();
      await act(async () => card.click());
    }
    expect(vi.mocked(props.onThemeChange).mock.calls.map(call => call[0])).toEqual(['cyber-dark', 'graphite', 'light']);
    for (const [index, key, expected] of [[0, 'ArrowLeft', 'light'], [2, 'ArrowRight', 'cyber-dark'], [0, 'End', 'light'], [2, 'Home', 'cyber-dark']] as const) {
      await act(async () => cards[index].dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })));
      expect(props.onThemeChange).toHaveBeenLastCalledWith(expected);
      expect(document.activeElement).toBe(cards[expected === 'light' ? 2 : 0]);
    }
    props.currentTheme = 'graphite'; await render();
    expect(cards.map(card => card.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    expect(cards.map(card => card.tabIndex)).toEqual([-1, 0, -1]);
    await search(language === 'es' ? 'escala de grises' : 'refined grayscale');
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(3);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it.each(['es', 'en'] as const)('keeps the backup controls functional after adapting their layout (%s)', async language => {
    props.language = language; props.initialTab = 'maintenance';
    await render();
    const frequency = container.querySelector<HTMLSelectElement>(`[aria-label="${language === 'es' ? 'Frecuencia de respaldo' : 'Backup frequency'}"]`)!;
    const kept = container.querySelector<HTMLSelectElement>(`[aria-label="${language === 'es' ? 'Copias conservadas' : 'Copies kept'}"]`)!;
    expect(frequency.disabled).toBe(false); expect(kept.disabled).toBe(false);
    await act(async () => { frequency.value = '168'; frequency.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(setSetting).toHaveBeenLastCalledWith('auto_backup_hours', '168');
    await act(async () => { kept.value = '7'; kept.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(setSetting).toHaveBeenLastCalledWith('auto_backup_keep', '7');
    const scheduled = [...container.querySelectorAll('label')].find(label => label.textContent?.includes(language === 'es' ? 'Respaldo programado' : 'Scheduled backup'))!;
    await act(async () => scheduled.click()); expect(frequency.disabled).toBe(true); expect(kept.disabled).toBe(true);
    expect(setSetting).toHaveBeenLastCalledWith('auto_backup_enabled', 'false');
    await act(async () => scheduled.click()); expect(frequency.disabled).toBe(false); expect(kept.disabled).toBe(false);
    expect(frequency.value).toBe('168'); expect(kept.value).toBe('7');
    await search(language === 'es' ? 'frecuencia' : 'frequency');
    const filteredFrequency = container.querySelector<HTMLSelectElement>('select[aria-label]')!;
    expect(filteredFrequency.value).toBe('168'); expect(filteredFrequency.disabled).toBe(false);
    await act(async () => { filteredFrequency.value = '12'; filteredFrequency.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(setSetting).toHaveBeenLastCalledWith('auto_backup_hours', '12');
  });

  it.each(['es', 'en'] as const)('keeps restore keyboard actions inside the secondary dialog (%s)', async language => {
    props.language = language; props.initialTab = 'maintenance';
    const api = window.cyberNotesAPI;
    const file = 'cybernotes-backup-' + 'long-name-'.repeat(12) + '.json';
    api.listBackups = vi.fn().mockResolvedValue([{ file, size: 12345, mtime: '2026-10-30T13:00:00Z' }]);
    let finishRestore!: (value: { ok: boolean; error: string }) => void;
    api.restoreBackup = vi.fn().mockReturnValue(new Promise(resolve => { finishRestore = resolve; }));
    await render();
    const open = () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(language === 'es' ? 'Restaurar…' : 'Restore…'))!;
    await act(async () => open().click());
    const card = () => document.querySelector<HTMLElement>('.settings-secondary-card')!;
    expect(document.activeElement).toBe(card());
    expect(document.querySelector('.settings-restore-entry')?.textContent).toContain(file);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(api.restoreBackup).not.toHaveBeenCalled();
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(card()).toBeNull(); expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => open().click());
    await act(async () => document.querySelector<HTMLButtonElement>('.settings-restore-entry')!.click());
    expect(document.activeElement).toBe(card().querySelector('.is-save'));
    await act(async () => card().querySelector<HTMLButtonElement>('.is-save')!.click());
    expect(api.restoreBackup).toHaveBeenCalledExactlyOnceWith(file);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(card()).not.toBeNull(); expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => finishRestore({ ok: false, error: 'fixture failure' }));
    expect(card()).toBeNull(); expect(document.body.textContent).toContain('fixture failure');
  });

  it.each(['first', 'regen'] as const)('requires acknowledgment before saving recovery code and keeps Escape local (%s)', async mode => {
    props.initialTab = 'security';
    window.cyberNotesAPI.hasPassword = vi.fn().mockResolvedValue(true);
    window.cyberNotesAPI.verifyPassword = vi.fn().mockResolvedValue(true);
    window.cyberNotesAPI.hasRecoveryCode = vi.fn().mockResolvedValue(mode === 'regen');
    window.cyberNotesAPI.generateRecoveryCode = vi.fn().mockResolvedValue('ABCD-EFGH-IJKL-MNOP-QRST-UVWX');
    window.cyberNotesAPI.setRecoveryCode = vi.fn().mockResolvedValue(false);
    await render();
    const password = container.querySelector<HTMLInputElement>('input[placeholder="Contraseña actual"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(password, 'demo');
      password.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const open = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes(mode === 'regen' ? 'Regenerar código' : 'Generar código de recuperación'))!;
    await act(async () => open.click());
    const card = () => document.querySelector<HTMLElement>('.settings-secondary-card');
    expect(document.activeElement).toBe(card()); expect(card()?.querySelector<HTMLButtonElement>('.is-save')?.disabled).toBe(true);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(window.cyberNotesAPI.setRecoveryCode).not.toHaveBeenCalled(); expect(props.onClose).not.toHaveBeenCalled();
    if (mode === 'regen') {
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      expect(card()).toBeNull(); expect(props.onClose).not.toHaveBeenCalled(); await act(async () => open.click());
    } else {
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
      expect(card()).not.toBeNull(); expect(props.onClose).not.toHaveBeenCalled();
    }
    await act(async () => card()!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(window.cyberNotesAPI.setRecoveryCode).toHaveBeenCalledWith('ABCD-EFGH-IJKL-MNOP-QRST-UVWX');
    expect(card()?.querySelector('[role="status"]')?.textContent).toContain('Error al guardar');
    vi.mocked(window.cyberNotesAPI.setRecoveryCode).mockResolvedValue(true);
    await act(async () => card()!.querySelector<HTMLButtonElement>('.is-save')!.click());
    expect(card()).toBeNull(); expect(props.onClose).not.toHaveBeenCalled();
  });

  it.each(['es', 'en'] as const)('keeps toolbar controls grouped and stationary when visibility changes (%s)', async language => {
    props.language = language; props.initialTab = 'appearance'; props.hiddenToolbarIds = ['h1', 'h2', 'future-item'];
    props.onHiddenToolbarIdsChange = vi.fn();
    await render();
    const card = () => container.querySelector('.settings-toolbar-card')!;
    const rows = () => [...card().querySelectorAll<HTMLLabelElement>('.settings-toolbar-item')];
    const names = rows().map(row => row.textContent);
    expect(card().querySelectorAll('fieldset')).toHaveLength(6); expect(rows()).toHaveLength(30);
    expect(card().querySelectorAll('input:checked')).toHaveLength(28); expect(card().querySelector('[role="status"]')?.textContent).toContain('28');
    const bold = rows().find(row => row.textContent === (language === 'es' ? 'Negrita' : 'Bold'))!;
    await act(async () => bold.querySelector<HTMLInputElement>('input')!.click());
    expect(props.onHiddenToolbarIdsChange).toHaveBeenLastCalledWith(['h1', 'h2', 'future-item', 'bold']);
    props.hiddenToolbarIds = ['h1', 'h2', 'future-item', 'bold']; await render();
    expect(rows().map(row => row.textContent)).toEqual(names); expect(card().querySelectorAll('input:checked')).toHaveLength(27);
    expect(bold.querySelector<HTMLInputElement>('input')!.checked).toBe(false);
    await act(async () => bold.querySelector<HTMLInputElement>('input')!.click());
    expect(props.onHiddenToolbarIdsChange).toHaveBeenLastCalledWith(['h1', 'h2', 'future-item']);
    await act(async () => card().querySelector<HTMLButtonElement>('.settings-toolbar-summary button')!.click());
    expect(props.onHiddenToolbarIdsChange).toHaveBeenLastCalledWith([]);
    await search(language === 'es' ? 'alineación' : 'alignment');
    expect(card().querySelectorAll('input[type="checkbox"]')).toHaveLength(30);
    expect(card().querySelector('[title]')).toBeNull();
  });

  it.each(['es', 'en'] as const)('clears and restores the shortcut with accessible icon buttons and app tooltips (%s)', async language => {
    props.language = language; await render();
    const controls = container.querySelector('.settings-hotkey-controls')!;
    const buttons = [...controls.querySelectorAll<HTMLButtonElement>('button')];
    expect(buttons).toHaveLength(2); expect(container.querySelector('[title]')).toBeNull();
    expect(buttons[1].textContent).toBe(''); expect(buttons[1].querySelector('svg.lucide-brush-cleaning')).not.toBeNull();
    expect(buttons[1].getAttribute('aria-label')).toBe(language === 'es' ? 'Limpiar atajo' : 'Clear shortcut');
    await act(async () => buttons[1].click());
    expect(controls.querySelector('input')?.value).toBe('');
    expect(setSetting).toHaveBeenCalledWith('toggle_hotkey', 'disabled'); expect(setSetting).toHaveBeenCalledWith('toggle_hotkey_enabled', 'false');
    await act(async () => buttons[0].click());
    expect(controls.querySelector('input')?.value).toBe('Alt+Shift+N');
    expect(setSetting).toHaveBeenCalledWith('toggle_hotkey', 'Alt+Shift+N'); expect(setSetting).toHaveBeenCalledWith('toggle_hotkey_enabled', 'true');
    await act(async () => buttons[0].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 280)); });
    expect(document.querySelector('.tooltip-shortcut-key')?.textContent).toBe('Alt+Shift+N');
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
