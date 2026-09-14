import { ipcMain, BrowserWindow } from 'electron';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');

let autoUpdateEnabled = false;
let manualCheck = false;
let isDownloading = false;
let downloadedVersion: string | null = null;
let periodicTimer: ReturnType<typeof setInterval> | null = null;
let pendingAutoInstallTimer: ReturnType<typeof setTimeout> | null = null;
let canInstallChecker: () => boolean = () => true;
let listenersRegistered = false;

const STARTUP_CHECK_MS = 8000;
const PERIODIC_CHECK_MS = 6 * 60 * 60 * 1000;
const AUTO_INSTALL_DELAY_MS = 15000;

type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number; bytesPerSecond?: number; transferred?: number; total?: number }
  | { state: 'downloaded'; version: string }
  | { state: 'installing'; version: string }
  | { state: 'error'; message: string };

function broadcast(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('update:status', status);
  }
}

function clearAutoInstallTimer(): void {
  if (pendingAutoInstallTimer) {
    clearTimeout(pendingAutoInstallTimer);
    pendingAutoInstallTimer = null;
  }
}

export function setCanInstallChecker(fn: () => boolean): void {
  canInstallChecker = fn;
}

function schedulePeriodicChecks(): void {
  if (periodicTimer) clearInterval(periodicTimer);
  if (!autoUpdateEnabled) return;
  periodicTimer = setInterval(() => {
    if (isDownloading || downloadedVersion) return;
    doCheckSilently();
  }, PERIODIC_CHECK_MS);
}

function stopPeriodicChecks(): void {
  if (periodicTimer) {
    clearInterval(periodicTimer);
    periodicTimer = null;
  }
}

function isNetworkError(msg: string): boolean {
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes('err_internet_disconnected') ||
    lower.includes('err_connection_reset') ||
    lower.includes('err_name_not_resolved') ||
    lower.includes('err_network_changed') ||
    lower.includes('err_connection_refused') ||
    lower.includes('err_connection_timed_out') ||
    lower.includes('err_address_unreachable') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('ehostunreach') ||
    lower.includes('enetunreach') ||
    lower.includes('fetch failed') ||
    lower.includes('offline') ||
    lower.includes('network')
  );
}

async function doCheckSilently(): Promise<void> {
  try {
    await autoUpdater.checkForUpdates();
  } catch { /* offline / rate-limit: ignore */ }
}

export function initUpdater(autoUpdate: boolean): void {
  autoUpdateEnabled = autoUpdate;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  if (!listenersRegistered) {
    listenersRegistered = true;

    autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }));

    autoUpdater.on('update-available', (info) => {
      downloadedVersion = null;
      clearAutoInstallTimer();
      broadcast({ state: 'available', version: info.version });
      if (autoUpdateEnabled && !isDownloading) {
        isDownloading = true;
        autoUpdater.downloadUpdate().catch((err) => {
          isDownloading = false;
          const errMsg = String(err?.message || err);
          if (!manualCheck && isNetworkError(errMsg)) return;
          broadcast({ state: 'error', message: errMsg });
        });
      }
    });

    autoUpdater.on('update-not-available', (info) => {
      broadcast({ state: 'not-available', version: info.version });
    });

    autoUpdater.on('download-progress', (p) => {
      broadcast({ state: 'downloading', percent: Math.round(p.percent), bytesPerSecond: p.bytesPerSecond, transferred: p.transferred, total: p.total });
    });

    autoUpdater.on('update-downloaded', (info) => {
      isDownloading = false;
      downloadedVersion = info.version;
      broadcast({ state: 'downloaded', version: info.version });
      if (autoUpdateEnabled && canInstallChecker()) {
        clearAutoInstallTimer();
        pendingAutoInstallTimer = setTimeout(() => {
          pendingAutoInstallTimer = null;
          if (!canInstallChecker()) {
            broadcast({ state: 'downloaded', version: info.version });
            return;
          }
          broadcast({ state: 'installing', version: info.version });
          setTimeout(() => {
            try { autoUpdater.quitAndInstall(false, true); } catch { /* ignore */ }
          }, 400);
        }, AUTO_INSTALL_DELAY_MS);
      }
    });

    autoUpdater.on('error', (err) => {
      isDownloading = false;
      const msg = String((err as any)?.message || err);
      // Suppress network/offline errors during silent background checks
      if (!manualCheck && isNetworkError(msg)) {
        return;
      }
      broadcast({ state: 'error', message: msg });
    });
  }

  registerUpdateIpc();

  if (autoUpdateEnabled) {
    setTimeout(() => doCheckSilently(), STARTUP_CHECK_MS);
    schedulePeriodicChecks();
  }
}

export function setAutoUpdate(enabled: boolean): void {
  const was = autoUpdateEnabled;
  autoUpdateEnabled = enabled;
  if (enabled && !was) {
    downloadedVersion = null;
    clearAutoInstallTimer();
    schedulePeriodicChecks();
    setTimeout(() => doCheckSilently(), 2000);
  } else if (!enabled) {
    stopPeriodicChecks();
    clearAutoInstallTimer();
  }
}

function registerUpdateIpc(): void {
  if ((registerUpdateIpc as any)._done) return;
  (registerUpdateIpc as any)._done = true;

  ipcMain.handle('update:check', async () => {
    manualCheck = true;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Update check timed out')), 20000);
      });
      const result = await Promise.race([
        autoUpdater.checkForUpdates(),
        timeoutPromise,
      ]) as { updateInfo?: { version?: string } } | null;
      return { ok: true, version: result?.updateInfo?.version };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message || err) };
    } finally {
      manualCheck = false;
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      if (downloadedVersion) return { ok: true };
      isDownloading = true;
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      isDownloading = false;
      return { ok: false, error: String((err as Error)?.message || err) };
    }
  });

  ipcMain.handle('update:install', () => {
    clearAutoInstallTimer();
    try { autoUpdater.quitAndInstall(false, true); } catch { /* ignore */ }
  });

  ipcMain.handle('update:cancelAutoInstall', () => {
    clearAutoInstallTimer();
    if (downloadedVersion) broadcast({ state: 'downloaded', version: downloadedVersion });
    return true;
  });
}

export function isManualCheck(): boolean {
  return manualCheck;
}
