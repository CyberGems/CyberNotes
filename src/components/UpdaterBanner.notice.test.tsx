// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UpdateStatus } from '../types';
import AboutModal from './AboutModal';
import TitleBar from './TitleBar';
import UpdaterBanner, { type UpdateNoticeRequest } from './UpdaterBanner';

vi.mock('./WelcomeGreeting', () => ({ default: () => null }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const available: UpdateStatus = { state: 'available', version: '2.0.0', releaseNotes: '- Improved notes' };

function UpdateUI({ language, about }: { language: 'es' | 'en'; about: boolean }) {
  const [version, setVersion] = useState<string | null>(null);
  const [request, setRequest] = useState<UpdateNoticeRequest | null>(null);
  return <>
    <TitleBar language={language} updateVersion={version} onShowUpdate={() => setRequest({})} />
    {about && <AboutModal language={language} onClose={() => {}} onUpdateAvailable={version => setRequest({ version })} />}
    <UpdaterBanner language={language} onNoticeChange={setVersion} openRequest={request} />
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
    cancelUpdateDownload: ReturnType<typeof vi.fn>;
    checkForUpdates: ReturnType<typeof vi.fn>;
    openExternal: ReturnType<typeof vi.fn>;
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
      cancelUpdateDownload: vi.fn().mockResolvedValue(undefined),
      checkForUpdates: vi.fn().mockResolvedValue({ ok: true, available: true, version: available.version }),
      openExternal: vi.fn().mockResolvedValue(true),
    };
    vi.stubGlobal('cyberNotesAPI', {
      ...api,
      getVersions: vi.fn().mockResolvedValue({ app: '1.0.0' }),
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
    vi.useRealTimers();
    localStorage.clear();
  });

  const notice = () => host.querySelector<HTMLButtonElement>('.titlebar-update-button');
  const card = () => host.querySelector('.update-notice');
  const aboutPanel = () => host.querySelector('.about-modal');
  const render = async (language: 'es' | 'en' = 'es', about = false) => {
    await act(async () => root.render(<UpdateUI language={language} about={about} />));
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
    await clickText(language === 'es' ? 'Ver en GitHub' : 'View on GitHub');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(api.openExternal).not.toHaveBeenCalled();
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
    vi.useFakeTimers();
    api.getUpdateStatus.mockResolvedValue(null);
    await render();
    await preview(true);
    await clickText('Actualizar ahora');
    expect(card()?.querySelector('progress')).not.toBeNull();
    await act(async () => vi.advanceTimersByTime(2000));
    expect(card()?.textContent).toContain('Actualización lista v0.0.0-preview');
    await clickText('Más tarde');
    expect(card()).toBeNull();
    await act(async () => notice()!.click());
    await clickText('Reiniciar para actualizar');
    expect(card()).toBeNull();
    expect(notice()).toBeNull();
    expect(api.downloadUpdate).not.toHaveBeenCalled();
    expect(api.installUpdate).not.toHaveBeenCalled();
    expect(api.cancelUpdateDownload).not.toHaveBeenCalled();
  });

  it('skipping the preview preserves the real skipped version', async () => {
    localStorage.setItem('cybernotes_skipped_update_version', '2.0.0');
    await render();
    await preview(true);
    await clickText('Omitir versión');
    expect(card()).toBeNull();
    expect(notice()).toBeNull();
    expect(localStorage.getItem('cybernotes_skipped_update_version')).toBe('2.0.0');
    expect(api.cancelUpdateDownload).not.toHaveBeenCalled();
  });

  it('restores the latest real update after leaving preview', async () => {
    await render();
    await preview(true);
    await emit({ state: 'downloaded', version: '2.1.0' });
    expect(notice()?.getAttribute('aria-label')).toContain('0.0.0-preview');
    await preview(false);
    expect(notice()?.getAttribute('aria-label')).toContain('2.1.0');
    expect(card()?.textContent).toContain('Actualización lista v2.1.0');
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
    for (const status of [available, { state: 'downloading', version: '2.0.0', percent: 40 }, { state: 'downloaded', version: '2.0.0' }] as UpdateStatus[]) {
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
    expect(api.cancelUpdateDownload).not.toHaveBeenCalled();
    await act(async () => notice()!.click());
    expect(card()?.textContent).toContain('Actualización lista v2.0.0');
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
    await clickText('Omitir versión');
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

  it('keeps the notes through download, background, cancellation, retry and installation', async () => {
    const downloading = { ...available, state: 'downloading', percent: 13, transferred: 2_000_000, total: 15_000_000 } as const;
    await render('en');
    expect([...card()!.querySelectorAll('.update-notice-actions button')].map(button => button.textContent))
      .toEqual(['View on GitHub', 'Skip version', 'Later', 'Update now']);
    await clickText('View on GitHub');
    expect(api.openExternal).toHaveBeenCalledWith('https://github.com/CyberGems/CyberNotes/releases/tag/v2.0.0');
    await clickText('Update now');
    expect(api.downloadUpdate).toHaveBeenCalledWith('2.0.0');
    expect(api.installUpdate).not.toHaveBeenCalled();
    await emit(downloading);
    expect(card()?.textContent).toContain('2 MB / 15 MB');
    expect(card()?.textContent).toContain('Improved notes');
    await clickText('Download in background');
    await emit({ ...downloading, percent: 21, transferred: 3_200_000 });
    expect(card()).toBeNull();
    await act(async () => notice()!.click());
    await clickText('Cancel download');
    expect(api.cancelUpdateDownload).toHaveBeenCalledWith('2.0.0');
    await emit({ ...downloading, cancelling: true });
    expect(card()?.textContent).toContain('Canceling download');
    await emit(available);
    expect(card()?.textContent).toContain('Update now');
    await clickText('Update now');
    await emit(downloading);
    await clickText('Download in background');
    await emit({ ...available, state: 'downloaded' });
    expect(card()?.textContent).toContain('Improved notes');
    await clickText('Restart to update');
    expect(api.installUpdate).toHaveBeenCalledExactlyOnceWith('2.0.0');
  });

  it('opens the existing step from About even when automatic notices are off', async () => {
    api.getSetting.mockResolvedValue('false');
    localStorage.setItem('cybernotes_skipped_update_version', '2.0.0');
    await render('en', true);
    expect(card()).toBeNull();
    expect(aboutPanel()?.querySelector('[role="switch"]')).toBeNull();
    await clickText('Check for updates');
    expect(aboutPanel()?.querySelector('[role="status"]')?.textContent).toBe('An update is available.');
    expect(card()?.textContent).toContain('Update now');
    await clickText('Update now');
    await emit({ ...available, state: 'downloading', percent: 37 });
    await clickText('Download in background');
    await clickText('Check for updates');
    expect(card()?.querySelector('progress')?.value).toBe(37);
    await emit({ ...available, state: 'downloaded' });
    await clickText('Later');
    await clickText('Check for updates');
    expect(card()?.textContent).toContain('Restart to update');
    expect(aboutPanel()?.querySelector('[role="status"]')?.textContent).toBe('An update is available.');
    expect(aboutPanel()?.textContent).not.toMatch(/download|restart to update/i);
    expect(api.installUpdate).not.toHaveBeenCalled();
  });

  it('reports a completed check with no update in About', async () => {
    api.getUpdateStatus.mockResolvedValue(null);
    api.checkForUpdates.mockResolvedValue({ ok: true, available: false });
    await render('es', true);
    await clickText('Buscar actualizaciones');
    expect(aboutPanel()?.querySelector('[role="status"]')?.textContent).toBe('Estás en la última versión.');
    expect(card()).toBeNull();
  });
});
