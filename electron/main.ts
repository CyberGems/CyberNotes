import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, session, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { exec, spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─── Detectar si estamos en dev o producción ───────────────────────────────
const isDev = !app.isPackaged;

// Icon path resolution
let iconPath = path.join(__dirname, '..', 'public', 'icon.png');
if (!isDev) {
  // En producción, buscamos en el dist dentro del asar o carpeta app
  iconPath = path.join(app.getAppPath(), 'dist', 'icon.png');
}

// Fallback por seguridad (si no existe el png, usar el .ico o nada)
if (!fs.existsSync(iconPath)) {
  const fallbackIcon = path.join(isDev ? path.join(__dirname, '..', 'public') : path.join(app.getAppPath(), 'dist'), 'icon.ico');
  if (fs.existsSync(fallbackIcon)) iconPath = fallbackIcon;
}

// ─── bcrypt (pure JS, no nativo) ──────────────────────────────────────────
const bcrypt = require('bcryptjs');

// ─── Paths de datos ────────────────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'cybernotes.db');
const imagesPath = path.join(userDataPath, 'images');

// ─── uuid ─────────────────────────────────────────────────────────────────
const { v4: uuidv4 } = require('uuid');

// ─── SQL.js DB ────────────────────────────────────────────────────────────
let db: any = null;
let SQL: any = null;

function saveDbToDisk() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}

async function initDatabase() {
  // Resolver path del WASM de sql.js
  const sqlWasmPath = isDev 
    ? path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
    : path.join(process.resourcesPath, 'sql-wasm.wasm');
  
  // Inicializar sql.js con el archivo WASM
  const initSqlJs = require('sql.js');
  SQL = await initSqlJs({
    locateFile: () => sqlWasmPath,
  });

  // Cargar DB desde disco si existe, o crear nueva
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Crear tablas si no existen
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS folders (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      icon       TEXT DEFAULT '📁',
      color      TEXT DEFAULT '#7c3aed',
      sort_order INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         TEXT PRIMARY KEY,
      folder_id  TEXT,
      title      TEXT NOT NULL DEFAULT 'Nueva nota',
      content    TEXT NOT NULL DEFAULT '',
      preview    TEXT DEFAULT '',
      pinned     INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Guardar schema inicial
  saveDbToDisk();

  // Carpeta de imágenes
  if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
  }
}

// ─── Helper: query → array de objetos ─────────────────────────────────────
function queryAll(sql: string, params: any[] = []): any[] {
  if (!db) throw new Error('Base de datos no inicializada');
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryGet(sql: string, params: any[] = []): any | null {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function runQuery(sql: string, params: any[] = []) {
  if (!db) throw new Error('Base de datos no inicializada');
  db.run(sql, params);
  saveDbToDisk();
}

// ─── Ventana y Tray ────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let hasUnsavedChanges = false;
let capsLockWorker: any = null;

function startCapsLockWorker() {
  if (capsLockWorker) return;
  if (process.platform !== 'win32') return;

  const psScript = `
    Add-Type -AssemblyName System.Windows.Forms;
    $lastState = [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')
    Write-Host "STATE:$lastState"
    while ($true) {
      $state = [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')
      if ($state -ne $lastState) {
        Write-Host "STATE:$state"
        $lastState = $state
      }
      Start-Sleep -Milliseconds 500
    }
  `;

  try {
    capsLockWorker = spawn('powershell', ['-Command', psScript]);

    capsLockWorker.stdout.on('data', (data: Buffer) => {
      const output = data.toString();
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('STATE:')) {
          const state = line.trim().substring(6).toLowerCase() === 'true';
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('global-caps-lock-changed', state);
          }
        }
      }
    });

    capsLockWorker.on('exit', () => {
      capsLockWorker = null;
    });
  } catch (err) {
    console.error('Failed to start caps lock worker:', err);
  }
}

function stopCapsLockWorker() {
  if (capsLockWorker) {
    capsLockWorker.kill();
    capsLockWorker = null;
  }
}

function restoreWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  const maxVal = queryGet('SELECT value FROM settings WHERE key = ?', ['is_maximized']);
  if (maxVal?.value === 'true') mainWindow.maximize();
  mainWindow.show();
  mainWindow.focus();
}

function getTrayMenuTemplate(): any[] {
  const capsLockVal = queryGet('SELECT value FROM settings WHERE key = ?', ['auto_unlock_caps_lock']);
  const isCapsUnlockEnabled = capsLockVal?.value === 'true';

  const langVal = queryGet('SELECT value FROM settings WHERE key = ?', ['language']);
  const lang = langVal?.value || 'en';
  const isEs = lang === 'es';

  return [
    { label: `CyberNotes  ·  v${app.getVersion()}`, enabled: false },
    { type: 'separator' },
    { label: isEs ? 'Abrir CyberNotes' : 'Open CyberNotes', click: restoreWindow },
    { 
      label: isEs ? 'Configuración' : 'Settings', 
      click: () => {
        restoreWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('open-settings');
        }
      } 
    },
    { type: 'separator' },
    { 
      label: isEs ? 'Desactivar CapsLock por inactividad' : 'Disable Caps Lock on inactivity', 
      type: 'checkbox', 
      checked: isCapsUnlockEnabled, 
      click: (menuItem: any) => {
        const newVal = menuItem.checked;
        runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['auto_unlock_caps_lock', newVal ? 'true' : 'false']);
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('setting-changed', { key: 'auto_unlock_caps_lock', value: newVal ? 'true' : 'false' });
        }
      } 
    },
    { type: 'separator' },
    { label: isEs ? 'Salir' : 'Quit', click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ];
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return;
  try {
    const contextMenu = Menu.buildFromTemplate(getTrayMenuTemplate());
    tray.setContextMenu(contextMenu);
  } catch (err) {
    console.error('Failed to update tray menu:', err);
  }
}

function createTray() {
  try {
    tray = new Tray(iconPath);
    updateTrayMenu();
    tray.setToolTip('CyberNotes');

    tray.on('click', () => {
      if (mainWindow?.isVisible()) {
        mainWindow.hide();
      } else {
        restoreWindow();
      }
    });
  } catch (err) {
    console.error('Failed to create tray:', err);
  }
}

function createWindow() {
  // Recuperar estado de ventana guardado
  const boundsJson = queryGet('SELECT value FROM settings WHERE key = ?', ['window_bounds']);
  const isMaximizedVal = queryGet('SELECT value FROM settings WHERE key = ?', ['is_maximized']);

  let bounds = { width: 1100, height: 700, x: undefined as number | undefined, y: undefined as number | undefined };

  if (boundsJson) {
    try {
      const savedBounds = JSON.parse(boundsJson.value);
      if (savedBounds.width > 400 && savedBounds.height > 400) {
        bounds = savedBounds;
      }
    } catch (e) {}
  }

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    center: !bounds.x,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#0d0d14',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    show: false,
  });

  // Guardar estado al cambiar
  const saveWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const isMax = mainWindow.isMaximized();
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['is_maximized', isMax ? 'true' : 'false']);

    const b = mainWindow.getBounds();
    if (b.width > 100 && b.height > 100) {
      runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['window_bounds', JSON.stringify(b)]);
    }
  };

  mainWindow.on('resize', saveWindowState);
  mainWindow.on('move', saveWindowState);
  mainWindow.on('close', saveWindowState);
  mainWindow.on('maximize', saveWindowState);
  mainWindow.on('unmaximize', saveWindowState);
  mainWindow.on('hide', saveWindowState);

  // Manejar minimizar (Bandeja de sistema)
  mainWindow.on('minimize', () => {
    const minimizeToTray = queryGet('SELECT value FROM settings WHERE key = ?', ['minimize_to_tray']);
    if (minimizeToTray?.value === 'true') {
      mainWindow?.hide();
    }
  });

  // Manejar cierre (Bandeja de sistema)
  mainWindow.on('close', (event) => {
    const closeToTray = queryGet('SELECT value FROM settings WHERE key = ?', ['close_to_tray']);
    if (closeToTray?.value === 'true' && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      return false;
    }
    
    if (hasUnsavedChanges) {
      event.preventDefault();
      // Restore window so the user can see the custom dialog
      restoreWindow();
      // Send confirmation request to renderer — CyberNotes styled dialog
      mainWindow?.webContents.send('confirm-unsaved-exit');
      return false;
    }
    
    // Destruir tray si la ventana se cierra completamente para evitar crash
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
  });

  // Interceptar links para abrir en el navegador por defecto
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Interceptar click derecho para enviar sugerencias de ortografía al frontend
  mainWindow.webContents.on('context-menu', (event, params) => {
    event.preventDefault();
    mainWindow?.webContents.send('context-menu-data', {
      x: params.x,
      y: params.y,
      suggestions: params.dictionarySuggestions,
      misspelledWord: params.misspelledWord,
      linkURL: params.linkURL
    });
  });
  

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    // Si se inicia con auto-start, no mostrar la ventana
    if (process.argv.includes('--hidden')) return;

    if (isMaximizedVal?.value === 'true') {
      mainWindow?.maximize();
    }
    mainWindow!.show();
    mainWindow!.focus();
  });
}

// ─── IPC Handlers ──────────────────────────────────────────────────────────

// -- Ventana --
ipcMain.handle('window-minimize', () => {
  const minimizeToTray = queryGet('SELECT value FROM settings WHERE key = ?', ['minimize_to_tray']);
  if (minimizeToTray?.value === 'true') {
    mainWindow?.hide();
  } else {
    mainWindow?.minimize();
  }
});
ipcMain.handle('window-maximize-toggle', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.handle('window-close', () => mainWindow?.close());
ipcMain.handle('window:unsavedChanges:set', (_e: any, val: boolean) => {
  hasUnsavedChanges = val;
});
ipcMain.handle('open-dev-tools', () => mainWindow?.webContents.openDevTools({ mode: 'detach' }));
ipcMain.handle('open-data-folder', () => shell.openPath(userDataPath));
ipcMain.handle('replace-misspelling', (_e: any, word: string) => mainWindow?.webContents.replaceMisspelling(word));
ipcMain.handle('add-to-dictionary', (_e: any, word: string) => {
  session.defaultSession.addWordToSpellCheckerDictionary(word);
});
ipcMain.handle('unlock-caps-lock', async () => {
  if (process.platform !== 'win32') return false;
  return new Promise((resolve) => {
    const psScript = "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Control]::IsKeyLocked('CapsLock')) { (New-Object -ComObject WScript.Shell).SendKeys('{CAPSLOCK}'); Write-Host 'unlocked' } else { Write-Host 'already-off' }";
    exec(`powershell -Command "${psScript}"`, (err, stdout) => {
      if (err) {
        console.error('Failed to unlock caps lock:', err);
        resolve(false);
      } else {
        const out = stdout.trim();
        resolve(out === 'unlocked' || out === 'already-off');
      }
    });
  });
});

ipcMain.handle('check-caps-lock', async () => {
  if (process.platform !== 'win32') return false;
  return new Promise((resolve) => {
    const psScript = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')";
    exec(`powershell -Command "${psScript}"`, (err, stdout) => {
      if (err) {
        resolve(false);
      } else {
        resolve(stdout.trim().toLowerCase() === 'true');
      }
    });
  });
});

// -- Updates --
ipcMain.handle('check-for-updates', async () => {
  // Requires: npm install electron-updater
  try {
    const { autoUpdater } = require('electron-updater');
    const result = await autoUpdater.checkForUpdates();
    return !!result?.updateInfo?.version;
  } catch {
    console.log('[CyberNotes] Update check: electron-updater not installed.');
    return false;
  }
});

// -- Auth --
ipcMain.handle('auth:hasPassword', () => {
  const row = queryGet('SELECT value FROM settings WHERE key = ?', ['password_hash']);
  return !!row;
});

ipcMain.handle('auth:setPassword', async (_e: any, password: string) => {
  const hash = await bcrypt.hash(password, 10);
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['password_hash', hash]);
  return true;
});

ipcMain.handle('auth:verifyPassword', async (_e: any, password: string) => {
  const row = queryGet('SELECT value FROM settings WHERE key = ?', ['password_hash']);
  if (!row) return true;
  return bcrypt.compare(password, row.value);
});

ipcMain.handle('auth:removePassword', () => {
  runQuery('DELETE FROM settings WHERE key = ?', ['password_hash']);
  return true;
});

// -- Settings --
ipcMain.handle('settings:get', (_e: any, key: string) => {
  const row = queryGet('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
});

ipcMain.handle('settings:set', (_e: any, key: string, value: string) => {
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  if (key === 'auto_unlock_caps_lock' || key === 'language') {
    updateTrayMenu();
  }
  if (key === 'caps_lock_sound_scope') {
    if (value === 'global') startCapsLockWorker();
    else stopCapsLockWorker();
  }
  return true;
});

ipcMain.handle('settings:setAutoStart', (_e: any, enable: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true, // macOS
    args: enable ? ['--hidden'] : [] // Windows / Linux
  });
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['auto_start', enable ? 'true' : 'false']);
  return true;
});

ipcMain.handle('settings:getAutoStart', () => {
  const settings = app.getLoginItemSettings();
  return settings.openAtLogin;
});

// -- Folders --
ipcMain.handle('folders:getAll', () => {
  return queryAll('SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC');
});

ipcMain.handle('folders:create', (_e: any, folder: any) => {
  runQuery(
    'INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [folder.id, folder.name, folder.icon, folder.color, folder.sort_order, folder.created_at]
  );
  return folder;
});

ipcMain.handle('folders:update', (_e: any, folder: any) => {
  runQuery(
    'UPDATE folders SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?',
    [folder.name, folder.icon, folder.color, folder.sort_order, folder.id]
  );
  return true;
});

ipcMain.handle('folders:delete', (_e: any, id: string) => {
  runQuery('DELETE FROM notes WHERE folder_id = ?', [id]);
  runQuery('DELETE FROM folders WHERE id = ?', [id]);
  return true;
});

// -- Notes --
ipcMain.handle('notes:getAll', () => {
  return queryAll('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC');
});

ipcMain.handle('notes:getByFolder', (_e: any, folderId: string | null) => {
  if (folderId === 'floating') {
    return queryAll('SELECT * FROM notes WHERE folder_id IS NULL OR folder_id = "" ORDER BY pinned DESC, updated_at DESC');
  }
  if (!folderId) {
    return queryAll('SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC');
  }
  return queryAll('SELECT * FROM notes WHERE folder_id = ? ORDER BY pinned DESC, updated_at DESC', [folderId]);
});

ipcMain.handle('notes:save', (_e: any, note: any) => {
  const exists = queryGet('SELECT id FROM notes WHERE id = ?', [note.id]);
  if (exists) {
    runQuery(
      'UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, pinned = ?, updated_at = ? WHERE id = ?',
      [note.folder_id, note.title, note.content, note.preview, note.pinned, note.updated_at, note.id]
    );
  } else {
    runQuery(
      'INSERT INTO notes (id, folder_id, title, content, preview, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [note.id, note.folder_id, note.title, note.content, note.preview, note.pinned, note.created_at, note.updated_at]
    );
  }
  return note;
});

ipcMain.handle('notes:delete', (_e: any, id: string) => {
  runQuery('DELETE FROM notes WHERE id = ?', [id]);
  return true;
});

ipcMain.handle('notes:search', (_e: any, query: string) => {
  const q = `%${query}%`;
  return queryAll(
    'SELECT * FROM notes WHERE title LIKE ? OR preview LIKE ? OR content LIKE ? ORDER BY pinned DESC, updated_at DESC',
    [q, q, q]
  );
});

// -- Images --
ipcMain.handle('images:selectAndSave', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Seleccionar imagen',
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;

  const sourcePath = result.filePaths[0];
  const ext = path.extname(sourcePath);
  const filename = `${uuidv4()}${ext}`;
  const destPath = path.join(imagesPath, filename);
  fs.copyFileSync(sourcePath, destPath);
  return `file:///${destPath.replace(/\\/g, '/')}`;
});

// -- Import/Export --
ipcMain.handle('data:export', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: 'Exportar datos de CyberNotes',
    defaultPath: 'cybernotes-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return false;

  const folders = queryAll('SELECT * FROM folders');
  const notes = queryAll('SELECT * FROM notes');
  const exportData = { folders, notes, version: 1 };
  
  fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2));
  return true;
});

ipcMain.handle('data:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Importar datos a CyberNotes',
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return false;

  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
    if (!data.folders || !data.notes) return false;

    // Backup current DB
    const backupPath = dbPath + '.backup-' + Date.now();
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);

    // Insert imported (replace on conflict)
    for (const f of data.folders) {
      runQuery('INSERT OR REPLACE INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [f.id, f.name, f.icon, f.color, f.sort_order, f.created_at]);
    }
    for (const n of data.notes) {
      runQuery('INSERT OR REPLACE INTO notes (id, folder_id, title, content, preview, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [n.id, n.folder_id, n.title, n.content, n.preview, n.pinned, n.created_at, n.updated_at]);
    }
    return true;
  } catch (e) {
    console.error('Import error:', e);
    return false;
  }
});

// ─── App lifecycle ─────────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    restoreWindow();
  });

  app.whenReady().then(async () => {
    // Habilitar diccionarios bilingües simultáneos (Español e Inglés)
    session.defaultSession.setSpellCheckerLanguages(['es-ES', 'en-US']);

    await initDatabase();
    createWindow();
    createTray();

    const scopeVal = queryGet('SELECT value FROM settings WHERE key = ?', ['caps_lock_sound_scope']);
    if (scopeVal?.value === 'global') {
      startCapsLockWorker();
    }

    // Auto-check for updates on startup
    const autoCheck = queryGet('SELECT value FROM settings WHERE key = ?', ['auto_check_updates']);
    if (autoCheck?.value === 'true') {
      try {
        const { autoUpdater } = require('electron-updater');
        autoUpdater.checkForUpdates().catch(() => {});
      } catch { /* electron-updater not installed */ }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else restoreWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (!tray) app.quit();
    }
  });
}

// ─── Force Close / Unsaved Exit ────────────────────────────────────────
ipcMain.handle('window-force-close', () => {
  isQuitting = true;
  mainWindow?.close();
});

ipcMain.handle('confirm-unsaved-exit-response', (_e: any, discard: boolean) => {
  if (discard) {
    hasUnsavedChanges = false;
    isQuitting = true;
    mainWindow?.close();
  }
});
