// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../types';
import TitleBar from './TitleBar';
import UpdaterBanner from './UpdaterBanner';

vi.mock('./WelcomeGreeting', () => ({ default: () => null }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const available: UpdateStatus = { state: 'available', version: '2.0.0', releaseNotes: '- Improved notes' };

function UpdateUI({ language }: { language: 'es' | 'en' }) {
  const [version, setVersion] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  return <>
    <TitleBar language={language} updateVersion={version} onShowUpdate={() => setNonce(value => value + 1)} />
    <UpdaterBanner language={language} onNoticeChange={setVersion} openNonce={nonce} />
  </>;
}

describe('title-bar update notice', () => {
  let root: ReturnType<typeof createRoot>;
  let host: HTMLDivElement;
  let updateListeners: Set<(status: UpdateStatus) => void>;
  let settingListeners: Set<(setting: { key: string; value: string }) => void>;
  let api: {
    getSetting: ReturnType<typeof vi.fn>;
    getUpdateStatus: ReturnType<typeof vi.fn>;
    downloadUpdate: ReturnType<typeof vi.fn>;
    installUpdate: ReturnType<typeof vi.fn>;
    cancelAutoInstall: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    updateListeners = new Set();
    settingListeners = new Set();
    api = {
      getSetting: vi.fn().mockResolvedValue(null),
      getUpdateStatus: vi.fn().mockResolvedValue(available),
      downloadUpdate: vi.fn().mockResolvedValue({ ok: true }),
      installUpdate: vi.fn().mockResolvedValue(undefined),
      cancelAutoInstall: vi.fn().mockResolvedValue(true),
    };
    vi.stubGlobal('cyberNotesAPI', {
      ...api,
      isMaximized: vi.fn().mockResolvedValue(false),
      onMaximizedState: () => () => {},
      onUpdateStatus: (listener: (status: UpdateStatus) => void) => {
        updateListeners.add(listener);
        return () => { updateListeners.delete(listener); };
      },
      onSettingChanged: (listener: (setting: { key: string; value: string }) => void) => {
        settingListeners.add(listener);
        return () => { settingListeners.delete(listener); };
      },
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    expect(updateListeners.size).toBe(0);
    expect(settingListeners.size).toBe(0);
    expect(window.__CYBERNOTES_TOGGLE_UPDATE_PREVIEW__).toBeUndefined();
    host.remove();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  const notice = () => host.querySelector<HTMLButtonElement>('.titlebar-update-button');
  const card = () => host.querySelector('[role="dialog"]');
  const render = async (language: 'es' | 'en' = 'es') => {
    await act(async () => root.render(<UpdateUI language={language} />));
  };
  const emit = async (status: UpdateStatus) => {
    await act(async () => { updateListeners.forEach(listener => listener(status)); });
  };
  const setAutoCheck = async (value: string) => {
    await act(async () => { settingListeners.forEach(listener => listener({ key: 'auto_check_updates', value })); });
  };
  const preview = async (enabled?: boolean) => {
    await act(async () => { window.__CYBERNOTES_TOGGLE_UPDATE_PREVIEW__!(enabled); });
  };
  const clickText = async (text: string) => {
    const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === text)!;
    await act(async () => button.click());
  };

  it.each(['es', 'en'] as const)('previews both controls from the console without a real update (%s)', async language => {
    api.getSetting.mockResolvedValue('false');
    api.getUpdateStatus.mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await render(language);
    expect(notice()).toBeNull();
    expect(card()).toBeNull();
    await preview(true);
    expect(notice()?.getAttribute('aria-label')).toContain('0.0.0-preview');
    expect(card()?.getAttribute('data-update-preview')).toBe('true');
    expect(card()?.textContent).toContain(language === 'es' ? 'Vista previa del aviso' : 'Update notice preview');
    await clickText(language === 'es' ? 'Ver release' : 'View release');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(api.downloadUpdate).not.toHaveBeenCalled();
    expect(api.installUpdate).not.toHaveBeenCalled();
    await preview(false);
    expect(notice()).toBeNull();
    expect(card()).toBeNull();
  });

  it('persists console preview across remounts until explicitly disabled', async () => {
    api.getUpdateStatus.mockResolvedValue(null);
    await render();
    await preview();
    expect(localStorage.getItem('cybernotes_update_preview_enabled')).toBe('true');
    await act(async () => root.render(null));
    expect(window.__CYBERNOTES_TOGGLE_UPDATE_PREVIEW__).toBeUndefined();
    await render();
    expect(card()?.getAttribute('data-update-preview')).toBe('true');
    await preview();
    expect(localStorage.getItem('cybernotes_update_preview_enabled')).toBeNull();
    await act(async () => root.render(null));
    await render();
    expect(card()).toBeNull();
    expect(notice()).toBeNull();
  });

  it('simulates download, Later and restart without calling the real updater', async () => {
    api.getUpdateStatus.mockResolvedValue(null);
    await render();
    await preview(true);
    await clickText('Descargar');
    expect(card()?.textContent).toContain('Actualización 0.0.0-preview lista');
    await clickText('Más tarde');
    expect(card()).toBeNull();
    await act(async () => notice()!.click());
    await clickText('Reiniciar ahora');
    expect(card()).toBeNull();
    expect(notice()).toBeNull();
    expect(api.downloadUpdate).not.toHaveBeenCalled();
    expect(api.installUpdate).not.toHaveBeenCalled();
    expect(api.cancelAutoInstall).not.toHaveBeenCalled();
  });

  it('skipping the preview preserves the real skipped version', async () => {
    localStorage.setItem('cybernotes_skipped_update_version', '2.0.0');
    await render();
    await preview(true);
    await clickText('Omitir esta versión');
    expect(card()).toBeNull();
    expect(notice()).toBeNull();
    expect(localStorage.getItem('cybernotes_skipped_update_version')).toBe('2.0.0');
    expect(api.cancelAutoInstall).not.toHaveBeenCalled();
  });

  it('restores the latest real update after leaving preview', async () => {
    await render();
    await preview(true);
    await emit({ state: 'downloaded', version: '2.1.0' });
    expect(notice()?.getAttribute('aria-label')).toContain('0.0.0-preview');
    await preview(false);
    expect(notice()?.getAttribute('aria-label')).toContain('2.1.0');
    expect(card()?.textContent).toContain('Actualización 2.1.0 lista');
    expect(card()?.getAttribute('data-update-preview')).toBeNull();
  });

  it.each(['es', 'en'] as const)('reopens a dismissed notice without downloading or installing (%s)', async language => {
    await render(language);
    expect(notice()?.getAttribute('aria-label')).toBe(language === 'es'
      ? 'Actualización disponible: v2.0.0' : 'Update available: v2.0.0');
    expect(notice()?.children.length).toBe(1);
    await act(async () => host.querySelector<HTMLButtonElement>(`[aria-label="${language === 'es' ? 'Descartar' : 'Dismiss'}"]`)!.click());
    expect(card()).toBeNull();
    expect(notice()).not.toBeNull();
    await act(async () => notice()!.click());
    expect(card()).not.toBeNull();
    expect(api.downloadUpdate).not.toHaveBeenCalled();
    expect(api.installUpdate).not.toHaveBeenCalled();
  });

  it('stays hidden when automatic checks are disabled, including incoming update states', async () => {
    api.getSetting.mockResolvedValue('false');
    await render();
    expect(notice()).toBeNull();
    for (const status of [available, { state: 'downloading', percent: 40 }, { state: 'downloaded', version: '2.0.0' }] as UpdateStatus[]) {
      await emit(status);
      expect(notice()).toBeNull();
    }
  });

  it('reopens a downloaded update after choosing Later without installing it', async () => {
    await render();
    await emit({ state: 'downloaded', version: '2.0.0' });
    const later = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Más tarde')!;
    await act(async () => later.click());
    expect(card()).toBeNull();
    expect(api.cancelAutoInstall).toHaveBeenCalledOnce();
    await act(async () => notice()!.click());
    expect(card()?.textContent).toContain('Actualización 2.0.0 lista');
    expect(api.installUpdate).not.toHaveBeenCalled();
  });

  it('hides immediately when disabled and remains hidden through later events', async () => {
    await render();
    expect(notice()).not.toBeNull();
    await setAutoCheck('false');
    expect(notice()).toBeNull();
    await emit(available);
    expect(notice()).toBeNull();
    await setAutoCheck('true');
    expect(notice()).not.toBeNull();
  });

  it('does not let a stale settings snapshot re-enable the notice', async () => {
    let resolveSetting!: (value: string | null) => void;
    api.getSetting.mockReturnValue(new Promise<string | null>(resolve => { resolveSetting = resolve; }));
    await render();
    expect(notice()).toBeNull();
    await setAutoCheck('false');
    await act(async () => { resolveSetting(null); });
    expect(notice()).toBeNull();
  });

  it('skipping a version removes the button and keeps it hidden after remounting', async () => {
    await render();
    const skip = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.includes('Omitir esta versión'))!;
    await act(async () => skip.click());
    expect(notice()).toBeNull();
    await emit(available);
    expect(notice()).toBeNull();
    await act(async () => root.render(null));
    await render();
    expect(notice()).toBeNull();
    expect(card()).toBeNull();
    await emit({ ...available, version: '2.1.0' } as UpdateStatus);
    expect(notice()?.getAttribute('aria-label')).toContain('2.1.0');
  });

  it('uses the latest update event instead of a stale snapshot', async () => {
    let resolveStatus!: (value: UpdateStatus | null) => void;
    api.getUpdateStatus.mockReturnValue(new Promise<UpdateStatus | null>(resolve => { resolveStatus = resolve; }));
    await render();
    await emit({ ...available, version: '2.1.0' } as UpdateStatus);
    await act(async () => { resolveStatus(available); });
    expect(notice()?.getAttribute('aria-label')).toContain('2.1.0');
    await emit({ state: 'not-available', version: '2.1.0' });
    expect(notice()).toBeNull();
  });
});
