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
