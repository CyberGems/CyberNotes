import { ipcMain, BrowserWindow } from 'electron';
import { createRequire } from 'module';
import type { CancellationToken as DownloadToken } from 'builder-util-runtime';
import type { ElectronHttpExecutor } from 'electron-updater/out/electronHttpExecutor';
import type { PendingUpdate, UpdateRelease, UpdateStatus } from '../src/types';

const require = createRequire(import.meta.url);
const { CancellationToken } = require('builder-util-runtime') as typeof import('builder-util-runtime');
const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');

const STARTUP_CHECK_MS = 8000;
const PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000;
const CHECK_TIMEOUT_MS = 20000;

type CheckResult = { ok: true; available: boolean; version?: string } | { ok: false; error: string };

let autoCheckEnabled = false;
let periodicTimer: ReturnType<typeof setInterval> | undefined;
let currentStatus: PendingUpdate | null = null;
let release: (UpdateRelease & { releaseUrl: string }) | null = null;
let activeCheck: Promise<CheckResult> | null = null;
let activeDownload: { token: DownloadToken; requests: Set<Electron.ClientRequest> } | null = null;

const RELEASES_REPO = 'CyberGems/CyberNotes';

function releaseDetailsFromFeed(
  version: string,
  rawNotes?: string | null | Array<{ version: string; note: string | null }>,
): { notes?: string; url: string } {
  const defaultUrl = `https://github.com/${RELEASES_REPO}/releases/tag/v${version}`;
  let existingNotes: string | undefined;
  if (typeof rawNotes === 'string' && rawNotes.trim().length > 0) {
    existingNotes = rawNotes.trim();
  } else if (Array.isArray(rawNotes)) {
    existingNotes = rawNotes
      .map((r) => r.note)
      .filter((n): n is string => Boolean(n))
      .join('\n\n');
  }

  return { notes: existingNotes, url: defaultUrl };
}

async function fetchReleaseDetails(
  version: string,
  fallback: { notes?: string; url: string },
): Promise<{ notes?: string; url: string }> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${RELEASES_REPO}/releases/tags/v${version}`,
      {
        signal: AbortSignal.timeout(10000),
        headers: {
          'User-Agent': 'CyberNotes',
          Accept: 'application/vnd.github.v3+json',
        },
      },
    );
    if (res.ok) {
      const data = await res.json();
      return {
        notes: typeof data?.body === 'string' && data.body.trim() ? data.body : fallback.notes,
        url: typeof data?.html_url === 'string' ? data.html_url : fallback.url,
      };
    }
  } catch (err) {
    console.warn('[Updater] Could not fetch release notes from GitHub API:', err);
  }

  return fallback;
}

function broadcast(status: UpdateStatus): void {
  currentStatus = status.state === 'not-available' ? null : status;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:status', status);
  }
}

function checkForUpdates(): Promise<CheckResult> {
  if (currentStatus && currentStatus.state !== 'available') {
    return Promise.resolve({ ok: true, available: true, version: currentStatus.version });
  }
  if (activeCheck) return activeCheck;

  activeCheck = autoUpdater.checkForUpdates()
    .then<CheckResult>(result => {
      const version = result?.updateInfo.version;
      if (result?.isUpdateAvailable) {
        const info = result.updateInfo;
        if (release?.version !== info.version) {
          const details = releaseDetailsFromFeed(info.version, info.releaseNotes);
          release = {
            version: info.version,
            releaseNotes: details.notes,
            releaseUrl: details.url,
            notesLoading: !details.notes,
          };
          broadcast({ ...release, state: 'available' });
          if (!details.notes) fetchMissingNotes(release);
        }
        return { ok: true, available: true, version: info.version };
      }
      const checkedVersion = version ?? release?.version;
      release = null;
      if (checkedVersion) {
        broadcast({ state: 'not-available', version: checkedVersion });
      }
      return { ok: true, available: false, version };
    }).catch<CheckResult>(error => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })).finally(() => { activeCheck = null; });
  return activeCheck;
}

function fetchMissingNotes(update: UpdateRelease & { releaseUrl: string }): void {
  void fetchReleaseDetails(update.version, { url: update.releaseUrl }).then(details => {
    if (release !== update || !currentStatus) return;
    update.notesLoading = false;
    update.releaseNotes = details.notes;
    update.releaseUrl = details.url;
    broadcast({ ...currentStatus, ...update });
  });
}

function runAutomaticCheck(): void {
  if (autoCheckEnabled && (!currentStatus || currentStatus.state === 'available')) {
    void checkForUpdates();
  }
}

function schedulePeriodicChecks(): void {
  clearInterval(periodicTimer);
  periodicTimer = autoCheckEnabled ? setInterval(runAutomaticCheck, PERIODIC_CHECK_MS) : undefined;
}

function connectDownloadCancellation(): void {
  const { httpExecutor } = autoUpdater as typeof autoUpdater & { httpExecutor: ElectronHttpExecutor };
  const createRequest = httpExecutor.createRequest.bind(httpExecutor);
  httpExecutor.createRequest = (options, onResponse) => {
    const download = activeDownload;
    if (!download) return createRequest(options, onResponse);

    // ClientRequest closes its writable side before the response has arrived.
    // Keep tracking it until the response finishes or the request is aborted.
    const request = createRequest(options, (response: Electron.IncomingMessage) => {
      response.once('end', forgetRequest);
      response.once('error', forgetRequest);
      onResponse(response);
    });
    function forgetRequest() { download?.requests.delete(request); }

    download.requests.add(request);
    request.once('abort', forgetRequest);
    request.once('error', forgetRequest);
    if (download.token.cancelled) request.abort();
    return request;
  };
}

export function initUpdater(autoCheck: boolean, hasUnsavedChanges: () => boolean): void {
  autoCheckEnabled = autoCheck;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  connectDownloadCancellation();

  autoUpdater.on('download-progress', ({ percent, transferred, total }) => {
    if (currentStatus?.state === 'downloading' && !currentStatus.cancelling) {
      broadcast({ ...currentStatus, percent: Math.round(percent), transferred, total });
    }
  });

  autoUpdater.on('error', () => {
    if (currentStatus?.state === 'installing') {
      broadcast({ ...currentStatus, state: 'downloaded', installError: 'failed' });
    }
  });

  ipcMain.handle('update:get-status', () => currentStatus);
  ipcMain.handle('update:check', async () => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        checkForUpdates(),
        new Promise<CheckResult>(resolve => {
          timeout = setTimeout(() => resolve({ ok: false, error: 'Update check timed out' }), CHECK_TIMEOUT_MS);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  });

  ipcMain.handle('update:download', async (_event, version: string) => {
    // The updater's feed may change while a check is running. Validate the
    // requested version before allowing it to select an installer.
    await activeCheck;
    if (currentStatus?.state !== 'available' || !release || release.version !== version) return;

    const update = release;
    const token = new CancellationToken();
    activeDownload = { token, requests: new Set() };
    broadcast({ ...update, state: 'downloading', percent: 0 });
    try {
      await autoUpdater.downloadUpdate(token);
      broadcast({ ...update, state: 'downloaded' });
    } catch (error) {
      if (!token.cancelled) console.error('[Updater] Download failed:', error);
      broadcast({ ...update, state: 'available', downloadFailed: !token.cancelled });
    } finally {
      activeDownload = null;
      token.dispose();
    }
  });

  ipcMain.handle('update:cancel-download', (_event, version: string) => {
    if (currentStatus?.state !== 'downloading' || currentStatus.version !== version || !activeDownload) return;
    broadcast({ ...currentStatus, cancelling: true });
    // The updater rejects the promise without aborting the HTTP response.
    activeDownload.token.cancel();
    for (const request of activeDownload.requests) request.abort();
  });

  ipcMain.handle('update:install', (_event, version: string) => {
    if (currentStatus?.state !== 'downloaded' || !release || release.version !== version) return;
    if (hasUnsavedChanges()) {
      broadcast({ ...release, state: 'downloaded', installError: 'unsaved' });
      return;
    }
    broadcast({ ...release, state: 'installing' });
    try {
      // The assisted NSIS installer only relaunches the app in silent mode.
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      console.error('[Updater] Installation failed:', error);
      broadcast({ ...release, state: 'downloaded', installError: 'failed' });
    }
  });

  if (autoCheckEnabled) {
    setTimeout(runAutomaticCheck, STARTUP_CHECK_MS);
    schedulePeriodicChecks();
  }
}

export function setAutoUpdate(enabled: boolean): void {
  if (enabled === autoCheckEnabled) return;
  autoCheckEnabled = enabled;
  schedulePeriodicChecks();
  if (enabled) setTimeout(runAutomaticCheck, 2000);
}
