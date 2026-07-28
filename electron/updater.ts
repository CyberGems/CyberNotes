import { ipcMain, BrowserWindow } from 'electron';
import { createRequire } from 'module';

// electron-updater is CommonJS; named ESM imports fail at runtime in this project.
const require = createRequire(import.meta.url);
const { autoUpdater } = require('electron-updater') as typeof import('electron-updater');

/**
 * Update lifecycle via electron-updater, broadcast to the renderer as
 * `update:status`. Auto-download is gated on the auto_check_updates setting.
 */

let autoUpdateEnabled = false;
let manualCheck = false;

type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

function broadcast(status: UpdateStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('update:status', status);
  }
}

export function initUpdater(autoUpdate: boolean): void {
  autoUpdateEnabled = autoUpdate;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => broadcast({ state: 'checking' }));

  autoUpdater.on('update-available', (info) => {
    broadcast({ state: 'available', version: info.version });
    if (autoUpdateEnabled) {
      autoUpdater.downloadUpdate().catch((err) => {
        broadcast({ state: 'error', message: String(err?.message || err) });
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    broadcast({ state: 'not-available', version: info.version });
  });

  autoUpdater.on('download-progress', (p) => {
    broadcast({ state: 'downloading', percent: Math.round(p.percent) });
  });

  autoUpdater.on('update-downloaded', (info) => {
    broadcast({ state: 'downloaded', version: info.version });
  });

  autoUpdater.on('error', (err) => {
    broadcast({ state: 'error', message: String(err?.message || err) });
  });

  registerUpdateIpc();

  if (autoUpdateEnabled) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => { /* offline: ignore */ });
    }, 8000);
  }
}

export function setAutoUpdate(enabled: boolean): void {
  autoUpdateEnabled = enabled;
}

function registerUpdateIpc(): void {
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
      console.error('[Updater] Check failed:', err);
      return { ok: false, error: String((err as Error)?.message || err) };
    } finally {
      manualCheck = false;
    }
  });

  ipcMain.handle('update:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String((err as Error)?.message || err) };
    }
  });

  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });
}

export function isManualCheck(): boolean {
  return manualCheck;
}
