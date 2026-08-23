import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, session, screen, clipboard, nativeImage, net, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { exec, spawn } from 'child_process';
import { initUpdater, setAutoUpdate } from './updater';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─── Detectar si estamos en dev o producción ───────────────────────────────
const isDev = !app.isPackaged;

// Icon path resolution (window icon)
let iconPath = path.join(__dirname, '..', 'public', 'icon.png');
if (!isDev) {
  iconPath = path.join(app.getAppPath(), 'dist', 'icon.png');
}
if (!fs.existsSync(iconPath)) {
  const fallbackIcon = path.join(isDev ? path.join(__dirname, '..', 'public') : path.join(app.getAppPath(), 'dist'), 'icon.ico');
  if (fs.existsSync(fallbackIcon)) iconPath = fallbackIcon;
}

// Tray icon path (uses .ico for native multi-res crisp rendering on Windows)
let trayIconPath = path.join(isDev ? path.join(__dirname, '..', 'public') : path.join(app.getAppPath(), 'dist'), 'icon.ico');
if (!fs.existsSync(trayIconPath)) {
  trayIconPath = iconPath;
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

/** Columnas ligeras para listados (sin content HTML completo). */
const NOTE_META_COLS = 'id, folder_id, title, preview, thumb, pinned, created_at, updated_at';

const DB_FLUSH_MS = 1500;
let dbDirty = false;
let dbFlushTimer: ReturnType<typeof setTimeout> | null = null;

function saveDbToDisk() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
  dbDirty = false;
}

/** Programa un flush diferido; coalescea muchas escrituras (autosave, settings, etc.). */
function scheduleDbFlush(delayMs = DB_FLUSH_MS) {
  dbDirty = true;
  if (dbFlushTimer) clearTimeout(dbFlushTimer);
  dbFlushTimer = setTimeout(() => {
    dbFlushTimer = null;
    if (dbDirty) saveDbToDisk();
  }, delayMs);
}

/** Fuerza escritura inmediata (quit, export, import, operaciones críticas). */
function flushDbNow() {
  if (dbFlushTimer) {
    clearTimeout(dbFlushTimer);
    dbFlushTimer = null;
  }
  if (dbDirty || db) {
    // Siempre exportar si hay dirty; si no dirty y solo se pide flush, no-op salvo dirty
    if (dbDirty) saveDbToDisk();
  }
}

function ensureColumn(table: string, column: string, typeSql: string) {
  const cols = queryAll(`PRAGMA table_info(${table})`);
  if (!cols.some((c: any) => c.name === column)) {
    db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
  }
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
      thumb      TEXT DEFAULT '',
      pinned     INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Migración: DBs antiguas sin columna thumb
  ensureColumn('notes', 'thumb', "TEXT DEFAULT ''");

  // Rellenar miniaturas de notas existentes (una sola vez / solo filas vacías)
  backfillNoteThumbs();

  // Si es una instalación nueva sin notas, crear nota de bienvenida
  const noteCountRow = queryGet('SELECT count(*) as count FROM notes');
  if (!noteCountRow || noteCountRow.count === 0) {
    seedInitialWelcomeNote();
  }

  // Guardar schema inicial
  saveDbToDisk();

  // Carpeta de imágenes
  if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
  }
}

function seedInitialWelcomeNote() {
  const langVal = queryGet('SELECT value FROM settings WHERE key = ?', ['language']);
  const sysLocale = app.getLocale() || '';
  const isEs = langVal?.value === 'es' || (!langVal && sysLocale.toLowerCase().startsWith('es'));

  const now = new Date().toISOString();
  const noteId = 'welcome-note';
  const title = isEs ? '👋 ¡Bienvenido a CyberNotes!' : '👋 Welcome to CyberNotes!';
  
  const content = isEs
    ? `<h1>👋 ¡Bienvenido a CyberNotes!</h1><p><strong>CyberNotes</strong> es tu espacio de notas rápido, moderno y con estética cyberpunk. Todo lo que escribes se almacena localmente en tu equipo con total privacidad.</p><h2>✨ Características principales</h2><ul><li><strong>📁 Carpetas y Colores:</strong> Organiza tus notas en carpetas personalizadas con iconos y colores vibrantes.</li><li><strong>⭐ Favoritos y Pestañas:</strong> Marca tus notas más importantes y trabaja en múltiples documentos simultáneamente.</li><li><strong>⚡ Atajo global de ventana:</strong> Muestra u oculta CyberNotes desde cualquier aplicación con el atajo de teclado personalizable (por defecto <code>Alt+Shift+N</code>).</li><li><strong>🗺️ Minimapa de navegación:</strong> Visualiza la estructura completa de tu documento para desplazarte ágilmente.</li><li><strong>🔒 Seguridad y Bloqueo:</strong> Protege tus notas con contraseña y bloqueo automático por inactividad.</li><li><strong>⇪ Auto-desbloqueo de Mayúsculas:</strong> Sistema inteligente que desactiva el Bloq Mayús tras inactividad para evitar errores de tipeo.</li></ul><h2>💡 Consejos de inicio rápido</h2><ul><li>Usa <code>Ctrl + N</code> para crear una nueva nota al instante.</li><li>Haz clic derecho en cualquier parte del editor para acceder a opciones de formato, enlaces e imágenes.</li><li>Ajusta la escala de la interfaz o la densidad de la lista desde los controles de la barra inferior.</li></ul><blockquote><p><em>"Tus ideas, notas y código organizados a la velocidad de la luz."</em> — CyberGems Suite</p></blockquote>`
    : `<h1>👋 Welcome to CyberNotes!</h1><p><strong>CyberNotes</strong> is your fast, modern, cyberpunk-styled note-taking app. Everything you write is stored locally on your machine with complete privacy.</p><h2>✨ Key Features</h2><ul><li><strong>📁 Folders &amp; Colors:</strong> Organize your notes into custom folders with vibrant icons and colors.</li><li><strong>⭐ Favorites &amp; Multi-Tabs:</strong> Pin important notes and work with multiple open documents at once.</li><li><strong>⚡ Global Window Shortcut:</strong> Quickly summon or hide CyberNotes from any app with customizable hotkeys (default: <code>Alt+Shift+N</code>).</li><li><strong>🗺️ Document Minimap:</strong> View a real-time overview of your document to navigate long notes seamlessly.</li><li><strong>🔒 Privacy &amp; Lock:</strong> Protect your notes with password encryption and inactivity auto-lock.</li><li><strong>⇪ Auto-Unlock Caps Lock:</strong> Intelligent system that releases Caps Lock after typing inactivity to prevent unintended uppercase text.</li></ul><h2>💡 Quick Tips</h2><ul><li>Press <code>Ctrl + N</code> to create a new note instantly.</li><li>Right-click anywhere in the editor to access rich formatting, links, and image controls.</li><li>Adjust list density and UI scaling from the bottom status bar controls.</li></ul><blockquote><p><em>"Your thoughts, notes, and code organized at the speed of light."</em> — CyberGems Suite</p></blockquote>`;

  const preview = isEs
    ? 'CyberNotes es tu espacio de notas rápido, moderno y con estética cyberpunk. Todo lo que escribes se almacena localmente en tu equipo con total privacidad.'
    : 'CyberNotes is your fast, modern, cyberpunk-styled note-taking app. Everything you write is stored locally on your machine with complete privacy.';

  runQuery(
    `INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [noteId, null, title, content, preview, '', 1, now, now]
  );
  runQuery(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, ['open_note_ids', JSON.stringify([noteId])]);
  runQuery(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, ['last_note_id', noteId]);
}

/** Extrae la primera imagen del content (HTML o JSON TipTap) en el main process. */
function extractThumbFromContent(content: string | null | undefined): string {
  if (!content || typeof content !== 'string') return '';

  if (content.trim().startsWith('{')) {
    try {
      const doc = JSON.parse(content);
      let foundSrc = '';
      const walk = (node: any) => {
        if (foundSrc) return;
        if (node?.type === 'image' && node.attrs?.src) {
          foundSrc = String(node.attrs.src);
          return;
        }
        if (Array.isArray(node?.content)) node.content.forEach(walk);
      };
      if (Array.isArray(doc?.content)) doc.content.forEach(walk);
      if (foundSrc) return foundSrc;
    } catch {
      /* fallback HTML */
    }
  }

  const match = content.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return match?.[1] || '';
}

/** Backfill de thumb sin re-guardar cada nota en el editor. */
function backfillNoteThumbs() {
  if (!db) return;
  const rows = queryAll(
    `SELECT id, content FROM notes
     WHERE (thumb IS NULL OR thumb = '')
       AND content IS NOT NULL AND content != ''
       AND (content LIKE '%<img%' OR content LIKE '%"type":"image"%' OR content LIKE '%"type": "image"%')`
  );
  if (rows.length === 0) return;

  let updated = 0;
  for (const row of rows) {
    const thumb = extractThumbFromContent(row.content);
    if (!thumb) continue;
    db.run('UPDATE notes SET thumb = ? WHERE id = ?', [thumb, row.id]);
    updated++;
  }
  if (updated > 0) {
    dbDirty = true;
    console.log(`[CyberNotes] Backfilled thumbs for ${updated} note(s)`);
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

/** Ejecuta SQL y programa flush diferido (no bloquea el main en cada UPDATE). */
function runQuery(sql: string, params: any[] = [], opts?: { flushNow?: boolean }) {
  if (!db) throw new Error('Base de datos no inicializada');
  db.run(sql, params);
  if (opts?.flushNow) {
    dbDirty = true;
    flushDbNow();
  } else {
    scheduleDbFlush();
  }
}

/** Varias mutaciones sin flush intermedio; un solo schedule al final. */
function runQueryBatch(ops: Array<{ sql: string; params?: any[] }>, opts?: { flushNow?: boolean }) {
  if (!db) throw new Error('Base de datos no inicializada');
  for (const op of ops) {
    db.run(op.sql, op.params ?? []);
  }
  if (opts?.flushNow) {
    dbDirty = true;
    flushDbNow();
  } else {
    scheduleDbFlush();
  }
}

// ─── Ventana y Tray ────────────────────────────────────────────────────────
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
/** True while the UI should show LockScreen (password session). */
let sessionLocked = false;
/** Wall-clock last user activity — survives Chromium timer throttling while hidden. */
let lastActivityAt = Date.now();
let idleLockInterval: ReturnType<typeof setInterval> | null = null;

function hasPasswordHash(): boolean {
  return !!queryGet('SELECT value FROM settings WHERE key = ?', ['password_hash']);
}

function getAutoLockMs(): number {
  const row = queryGet('SELECT value FROM settings WHERE key = ?', ['auto_lock_minutes']);
  const mins = row ? parseInt(row.value, 10) : 0;
  return Number.isFinite(mins) && mins > 0 ? mins * 60 * 1000 : 0;
}

function idleExceeded(): boolean {
  const ms = getAutoLockMs();
  if (ms <= 0) return false;
  return Date.now() - lastActivityAt >= ms;
}

function shouldLockBeforeShow(): boolean {
  if (!hasPasswordHash()) return false;
  return sessionLocked || idleExceeded();
}

function requestRendererLock(): void {
  sessionLocked = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('session:force-lock');
  }
}

function startIdleLockWatcher(): void {
  if (idleLockInterval) clearInterval(idleLockInterval);
  // While in tray, Chromium often freezes renderer timers — enforce lock on wall clock.
  idleLockInterval = setInterval(() => {
    if (sessionLocked) return;
    if (!hasPasswordHash()) return;
    if (!idleExceeded()) return;
    requestRendererLock();
  }, 5_000);
}
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
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const mustLock = shouldLockBeforeShow();
  if (mustLock) {
    sessionLocked = true;
    mainWindow.webContents.send('session:force-lock');
  } else {
    mainWindow.webContents.send('session:shield-disable');
  }

  if (mainWindow.isMinimized()) mainWindow.restore();
  const maxVal = queryGet('SELECT value FROM settings WHERE key = ?', ['is_maximized']);
  if (maxVal?.value === 'true') {
    mainWindow.maximize();
  }
  mainWindow.show();
  mainWindow.setOpacity(1);
  mainWindow.focus();
}

const TRAY_MENU_SHADOW_PAD = 26;
const TRAY_MENU_WIDTH = 268;
const TRAY_MENU_EST_HEIGHT = 220;
let trayMenuWin: BrowserWindow | null = null;
let trayMenuAnchor: any = null;
let trayMenuHideTimer: NodeJS.Timeout | null = null;
let trayMenuLastShown = 0;

function isWindowShown(): boolean {
  return !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible());
}

const DEFAULT_TOGGLE_HOTKEY = 'Alt+Shift+N';

function resolveToggleHotkey(value?: string | null): string {
  if (value === 'disabled') return '';
  const s = value == null ? '' : String(value).trim();
  return s || DEFAULT_TOGGLE_HOTKEY;
}

function getActiveToggleHotkey(): string {
  const row = queryGet('SELECT value FROM settings WHERE key = ?', ['toggle_hotkey']);
  if (!row) {
    const legacy = queryGet('SELECT value FROM settings WHERE key = ?', ['toggle_hotkey_enabled']);
    if (legacy && legacy.value === 'false') return '';
    return DEFAULT_TOGGLE_HOTKEY;
  }
  return resolveToggleHotkey(row.value);
}

function buildTrayMenuState() {
  const langVal = queryGet('SELECT value FROM settings WHERE key = ?', ['language']);
  const lang = langVal?.value || 'en';
  const isEs = lang === 'es';
  const visible = isWindowShown();
  const activeHotkey = getActiveToggleHotkey();
  return {
    version: app.getVersion(),
    head: 'CyberNotes v' + app.getVersion(),
    visible,
    showLabel: visible ? (isEs ? 'Ocultar CyberNotes' : 'Hide CyberNotes') : (isEs ? 'Abrir CyberNotes' : 'Open CyberNotes'),
    settingsLabel: isEs ? 'Configuración' : 'Settings',
    aboutLabel: isEs ? 'Acerca de...' : 'About...',
    exitLabel: isEs ? 'Salir' : 'Quit',
    shortcut: activeHotkey,
  };
}

function registerToggleHotkey() {
  try {
    globalShortcut.unregisterAll();
    const acc = getActiveToggleHotkey();
    if (!acc) return;
    globalShortcut.register(acc, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (isWindowShown()) {
        if (hasPasswordHash()) {
          mainWindow.webContents.send('session:shield-enable');
        }
        mainWindow.hide();
      } else {
        restoreWindow();
      }
    });
  } catch (err) {
    console.error('Failed to register global hotkey:', err);
  }
}

function trayMenuGeometry(iconBounds: any, windowW: number, windowH: number) {
  let b = (iconBounds && typeof iconBounds.x === 'number' && (iconBounds.width || iconBounds.height))
    ? { x: iconBounds.x, y: iconBounds.y, width: iconBounds.width || 0, height: iconBounds.height || 0 }
    : null;
  if (!b) {
    let p: any = null;
    try { p = screen.getCursorScreenPoint(); } catch (_) { p = { x: 0, y: 0 }; }
    b = { x: p.x, y: p.y, width: 0, height: 0 };
  }
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  let display: any;
  try { display = screen.getDisplayNearestPoint({ x: cx, y: cy }); }
  catch (_) { display = screen.getPrimaryDisplay(); }
  const work = (display && display.workArea) || { x: 0, y: 0, width: windowW, height: windowH };

  const gap = 4;
  const pad = TRAY_MENU_SHADOW_PAD;
  const cardW = windowW - 2 * pad;
  const cardH = windowH - 2 * pad;

  let cardX: number, cardY: number;
  const dLeft = cx - work.x;
  const dRight = (work.x + work.width) - cx;
  const dTop = cy - work.y;
  const dBottom = (work.y + work.height) - cy;

  if (dBottom <= dLeft && dBottom <= dRight && dBottom <= dTop) {
    cardX = cx - cardW / 2;
    cardY = b.y - gap - cardH;
  } else if (dTop <= dLeft && dTop <= dRight) {
    cardX = cx - cardW / 2;
    cardY = b.y + b.height + gap;
  } else if (dLeft <= dRight) {
    cardX = b.x + b.width + gap;
    cardY = cy - cardH / 2;
  } else {
    cardX = b.x - gap - cardW;
    cardY = cy - cardH / 2;
  }

  cardX = Math.min(Math.max(cardX, work.x + 4), work.x + work.width - cardW - 4);
  cardY = Math.min(Math.max(cardY, work.y + 4), work.y + work.height - cardH - 4);
  return { x: Math.round(cardX - pad), y: Math.round(cardY - pad), width: windowW, height: windowH };
}

function ensureTrayMenuWin() {
  if (trayMenuWin && !trayMenuWin.isDestroyed()) return trayMenuWin;

  const trayHtml = isDev
    ? path.join(__dirname, '..', 'public', 'tray-menu.html')
    : path.join(app.getAppPath(), 'dist', 'tray-menu.html');
  const trayPreload = isDev
    ? path.join(__dirname, '..', 'public', 'tray-preload.js')
    : path.join(app.getAppPath(), 'dist', 'tray-preload.js');

  trayMenuWin = new BrowserWindow({
    width: TRAY_MENU_WIDTH + 2 * TRAY_MENU_SHADOW_PAD,
    height: TRAY_MENU_EST_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: trayPreload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    }
  });
  trayMenuWin.setAlwaysOnTop(true, 'pop-up-menu');
  trayMenuWin.loadFile(trayHtml);
  trayMenuWin.on('blur', () => {
    if (trayMenuHideTimer) return;
    if (Date.now() - trayMenuLastShown < 250) return;
    trayMenuHideTimer = setTimeout(() => {
      trayMenuHideTimer = null;
      hideTrayMenu();
    }, 120);
  });
  trayMenuWin.on('closed', () => { trayMenuWin = null; });
  trayMenuWin.webContents.once('did-finish-load', () => {
    if (!trayMenuWin || trayMenuWin.isDestroyed()) return;
    trayMenuWin.webContents.send('tray-menu-state', buildTrayMenuState());
    trayMenuWin.webContents.send('tray-menu-show');
  });
  return trayMenuWin;
}

function showTrayMenu(eventBounds?: any) {
  if (!tray) return;
  let b = (eventBounds && typeof eventBounds.x === 'number' && (eventBounds.width || eventBounds.height))
    ? eventBounds : null;
  if (!b) { try { b = tray.getBounds(); } catch (_) { b = null; } }
  if (!b || (!b.width && !b.height)) {
    let p = null; try { p = screen.getCursorScreenPoint(); } catch (_) { p = null; }
    b = p ? { x: p.x, y: p.y, width: 0, height: 0 } : { x: 0, y: 0, width: 0, height: 0 };
  }
  trayMenuAnchor = b;
  if (trayMenuHideTimer) { clearTimeout(trayMenuHideTimer); trayMenuHideTimer = null; }
  const w = ensureTrayMenuWin();
  if (!w || w.isDestroyed()) return;
  const geo = trayMenuGeometry(trayMenuAnchor, TRAY_MENU_WIDTH + 2 * TRAY_MENU_SHADOW_PAD, TRAY_MENU_EST_HEIGHT);
  w.setBounds(geo);
  if (!w.isVisible()) w.show();
  w.focus();
  trayMenuLastShown = Date.now();
  if (!w.webContents.isLoading()) {
    w.webContents.send('tray-menu-state', buildTrayMenuState());
    w.webContents.send('tray-menu-show');
  }
}

function hideTrayMenu() {
  if (trayMenuHideTimer) { clearTimeout(trayMenuHideTimer); trayMenuHideTimer = null; }
  if (trayMenuWin && !trayMenuWin.isDestroyed() && trayMenuWin.isVisible()) {
    trayMenuWin.hide();
  }
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setToolTip(`CyberNotes v${app.getVersion()}`);
  if (trayMenuWin && !trayMenuWin.isDestroyed() && !trayMenuWin.webContents.isLoading()) {
    trayMenuWin.webContents.send('tray-menu-state', buildTrayMenuState());
  }
}

function createTray() {
  try {
    tray = new Tray(trayIconPath);
    tray.setToolTip(`CyberNotes v${app.getVersion()}`);

    tray.on('click', () => {
      hideTrayMenu();
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) {
        if (hasPasswordHash()) {
          mainWindow.webContents.send('session:shield-enable');
        }
        mainWindow.hide();
      } else {
        restoreWindow();
      }
    });

    tray.on('right-click', (_event, bounds) => {
      showTrayMenu(bounds);
    });
  } catch (err) {
    console.error('Failed to create tray:', err);
  }
}

ipcMain.on('tray-menu-action', (_event, action) => {
  hideTrayMenu();
  switch (action) {
    case 'toggle':
      if (isWindowShown()) {
        if (hasPasswordHash()) {
          mainWindow?.webContents.send('session:shield-enable');
        }
        mainWindow?.hide();
      } else {
        restoreWindow();
      }
      break;
    case 'settings':
      restoreWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-settings');
      break;
    case 'about':
      restoreWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-about');
      break;
    case 'quit':
      isQuitting = true;
      app.quit();
      break;
  }
});

ipcMain.on('tray-menu-hide', () => hideTrayMenu());
ipcMain.on('tray-menu-ready', (_event, rect) => {
  if (!trayMenuWin || trayMenuWin.isDestroyed() || !rect) return;
  const pad = TRAY_MENU_SHADOW_PAD;
  const targetW = Math.round((rect.width || TRAY_MENU_WIDTH) + 2 * pad);
  const targetH = Math.round((rect.height || (TRAY_MENU_EST_HEIGHT - 2 * pad)) + 2 * pad);
  const geo = trayMenuGeometry(trayMenuAnchor, targetW, targetH);
  trayMenuWin.setBounds(geo);
});

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

  // Guardar estado al cambiar (debounce: evitar N flushes durante resize/drag)
  let windowStateTimer: ReturnType<typeof setTimeout> | null = null;
  const saveWindowState = (immediate = false) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const doSave = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const isMax = mainWindow.isMaximized();
      runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['is_maximized', isMax ? 'true' : 'false']);

      const b = mainWindow.getBounds();
      if (b.width > 100 && b.height > 100) {
        runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['window_bounds', JSON.stringify(b)]);
      }
    };

    if (immediate) {
      if (windowStateTimer) clearTimeout(windowStateTimer);
      windowStateTimer = null;
      doSave();
      return;
    }
    if (windowStateTimer) clearTimeout(windowStateTimer);
    windowStateTimer = setTimeout(doSave, 500);
  };

  mainWindow.on('resize', () => saveWindowState(false));
  mainWindow.on('move', () => saveWindowState(false));
  mainWindow.on('close', () => saveWindowState(true));
  mainWindow.on('maximize', () => {
    saveWindowState(true);
    mainWindow?.webContents.send('window:maximized-state', true);
  });
  mainWindow.on('unmaximize', () => {
    saveWindowState(true);
    mainWindow?.webContents.send('window:maximized-state', false);
  });
  mainWindow.on('hide', () => {
    saveWindowState(true);
    updateTrayMenu();
  });

  // Manejar minimizar (Bandeja de sistema)
  mainWindow.on('minimize', () => {
    if (hasPasswordHash()) {
      mainWindow?.webContents.send('session:shield-enable');
    }
    const minimizeToTray = queryGet('SELECT value FROM settings WHERE key = ?', ['minimize_to_tray']);
    if (minimizeToTray?.value === 'true') {
      mainWindow?.hide();
    }
  });

  mainWindow.on('restore', () => {
    if (shouldLockBeforeShow()) {
      sessionLocked = true;
      mainWindow?.webContents.send('session:force-lock');
    } else {
      mainWindow?.webContents.send('session:shield-disable');
    }
  });

  mainWindow.on('show', () => {
    if (shouldLockBeforeShow()) {
      sessionLocked = true;
      mainWindow?.webContents.send('session:force-lock');
    }
    updateTrayMenu();
  });

  // Manejar cierre (Bandeja de sistema)
  mainWindow.on('close', (event) => {
    const closeToTray = queryGet('SELECT value FROM settings WHERE key = ?', ['close_to_tray']);
    if (closeToTray?.value === 'true' && !isQuitting) {
      event.preventDefault();
      if (hasPasswordHash()) {
        mainWindow?.webContents.send('session:shield-enable');
      }
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
    const imageSrc =
      params.mediaType === 'image' && params.srcURL
        ? params.srcURL
        : (params.hasImageContents && params.srcURL ? params.srcURL : null);
    mainWindow?.webContents.send('context-menu-data', {
      x: params.x,
      y: params.y,
      suggestions: params.dictionarySuggestions,
      misspelledWord: params.misspelledWord,
      linkURL: params.linkURL,
      imageSrc,
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
  if (hasPasswordHash()) {
    mainWindow?.webContents.send('session:shield-enable');
  }
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
ipcMain.handle('window:is-maximized', () => {
  return !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
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
ipcMain.handle('clipboard:writeImage', async (_e: any, url: string) => {
  try {
    if (!url || typeof url !== 'string') return false;
    let img = nativeImage.createEmpty();

    if (url.startsWith('data:')) {
      img = nativeImage.createFromDataURL(url);
    } else if (url.startsWith('file:')) {
      let filePath: string;
      try {
        filePath = fileURLToPath(url);
      } catch {
        filePath = decodeURIComponent(url.replace(/^file:\/\//i, '').replace(/^\//, ''));
      }
      if (!fs.existsSync(filePath)) return false;
      img = nativeImage.createFromPath(filePath);
    } else {
      const response = await net.fetch(url);
      if (!response.ok) return false;
      const buf = Buffer.from(await response.arrayBuffer());
      img = nativeImage.createFromBuffer(buf);
    }

    if (img.isEmpty()) return false;
    clipboard.writeImage(img);
    return true;
  } catch (err) {
    console.error('[CyberNotes] clipboard:writeImage failed:', err);
    return false;
  }
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

// -- Updates (handled by electron/updater.ts via update:check|download|install) --
ipcMain.handle('app:getVersions', () => ({
  app: app.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  osRelease: os.release(),
  osType: os.type(),
}));

ipcMain.handle('shell:openExternal', (_e: any, url: string) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
  return false;
});

// -- Auth --
ipcMain.handle('auth:hasPassword', () => {
  const row = queryGet('SELECT value FROM settings WHERE key = ?', ['password_hash']);
  return !!row;
});

ipcMain.handle('session:activity', () => {
  lastActivityAt = Date.now();
  return true;
});

ipcMain.handle('session:set-locked', (_e: any, locked: boolean) => {
  sessionLocked = !!locked;
  if (!locked) lastActivityAt = Date.now();
  return true;
});

ipcMain.on('session:locked', () => {
  sessionLocked = true;
});

ipcMain.handle('auth:setPassword', async (_e: any, password: string) => {
  const hash = await bcrypt.hash(password, 10);
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['password_hash', hash]);
  sessionLocked = false;
  lastActivityAt = Date.now();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setting-changed', { key: 'password_hash', value: 'set' });
  }
  return true;
});

ipcMain.handle('auth:verifyPassword', async (_e: any, password: string) => {
  const row = queryGet('SELECT value FROM settings WHERE key = ?', ['password_hash']);
  if (!row) return true;
  return bcrypt.compare(password, row.value);
});

ipcMain.handle('auth:removePassword', () => {
  runQuery('DELETE FROM settings WHERE key = ?', ['password_hash']);
  sessionLocked = false;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setting-changed', { key: 'password_hash', value: 'removed' });
    mainWindow.webContents.send('session:shield-disable');
  }
  return true;
});

// -- Settings --
ipcMain.handle('settings:get', (_e: any, key: string) => {
  const row = queryGet('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
});

ipcMain.handle('settings:getMany', (_e: any, keys: string[]) => {
  const result: Record<string, string | null> = {};
  if (!Array.isArray(keys)) return result;
  for (const key of keys) {
    const row = queryGet('SELECT value FROM settings WHERE key = ?', [key]);
    result[key] = row ? row.value : null;
  }
  return result;
});

ipcMain.handle('settings:reset', () => {
  runQuery('DELETE FROM settings');
  registerToggleHotkey();
  updateTrayMenu();
  return true;
});

ipcMain.handle('settings:set', (_e: any, key: string, value: string) => {
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  if (key === 'auto_unlock_caps_lock' || key === 'language' || key === 'toggle_hotkey_enabled') {
    if (key === 'toggle_hotkey_enabled') {
      registerToggleHotkey();
    }
    updateTrayMenu();
  }
  if (key === 'caps_lock_sound_scope') {
    if (value === 'global') startCapsLockWorker();
    else stopCapsLockWorker();
  }
  if (key === 'auto_check_updates') {
    setAutoUpdate(value === 'true');
  }
  return true;
});

/** Must match on set + get — Windows openAtLogin is false if args differ (Electron docs). */
const AUTO_START_ARGS = ['--hidden'] as const;

function readAutoStartEnabled(): boolean {
  // Primary: entry registered with --hidden (our current set path)
  if (app.getLoginItemSettings({ args: [...AUTO_START_ARGS] }).openAtLogin) return true;
  // Legacy: entry without args
  const plain = app.getLoginItemSettings();
  if (plain.openAtLogin) return true;
  // Windows: any Run key for this exe (ignores args mismatch)
  if (process.platform === 'win32' && plain.executableWillLaunchAtLogin) return true;
  return false;
}

function writeAutoStartEnabled(enable: boolean): void {
  if (enable) {
    // Prefer a single canonical entry with --hidden (tray on login).
    app.setLoginItemSettings({ openAtLogin: false, args: [] });
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true, // macOS only; ignored on Windows
      args: [...AUTO_START_ARGS],
    });
  } else {
    // Clear both possible registrations so the toggle and OS stay in sync.
    app.setLoginItemSettings({ openAtLogin: false, args: [...AUTO_START_ARGS] });
    app.setLoginItemSettings({ openAtLogin: false, args: [] });
  }
}

ipcMain.handle('settings:setAutoStart', (_e: any, enable: boolean) => {
  writeAutoStartEnabled(!!enable);
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['auto_start', enable ? 'true' : 'false']);
  return true;
});

ipcMain.handle('settings:getAutoStart', () => {
  return readAutoStartEnabled();
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
  runQueryBatch([
    { sql: 'DELETE FROM notes WHERE folder_id = ?', params: [id] },
    { sql: 'DELETE FROM folders WHERE id = ?', params: [id] },
  ]);
  return true;
});

// -- Notes --
// Listados sin `content` (HTML TipTap puede ser muy grande).
ipcMain.handle('notes:getAll', () => {
  return queryAll(`SELECT ${NOTE_META_COLS} FROM notes ORDER BY pinned DESC, updated_at DESC`);
});

ipcMain.handle('notes:getByFolder', (_e: any, folderId: string | null) => {
  if (folderId === 'floating') {
    return queryAll(`SELECT ${NOTE_META_COLS} FROM notes WHERE folder_id IS NULL OR folder_id = "" ORDER BY pinned DESC, updated_at DESC`);
  }
  if (folderId === 'favorites') {
    return queryAll(`SELECT ${NOTE_META_COLS} FROM notes WHERE pinned = 1 ORDER BY updated_at DESC`);
  }
  if (!folderId) {
    return queryAll(`SELECT ${NOTE_META_COLS} FROM notes ORDER BY pinned DESC, updated_at DESC`);
  }
  return queryAll(`SELECT ${NOTE_META_COLS} FROM notes WHERE folder_id = ? ORDER BY pinned DESC, updated_at DESC`, [folderId]);
});

ipcMain.handle('notes:getById', (_e: any, id: string) => {
  return queryGet('SELECT * FROM notes WHERE id = ?', [id]);
});

ipcMain.handle('notes:save', (_e: any, note: any) => {
  const thumb = typeof note.thumb === 'string' ? note.thumb : '';
  const exists = queryGet('SELECT id FROM notes WHERE id = ?', [note.id]);
  if (exists) {
    runQuery(
      'UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, thumb = ?, pinned = ?, updated_at = ? WHERE id = ?',
      [note.folder_id, note.title, note.content, note.preview, thumb, note.pinned, note.updated_at, note.id]
    );
  } else {
    runQuery(
      'INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [note.id, note.folder_id, note.title, note.content, note.preview, thumb, note.pinned, note.created_at, note.updated_at]
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
  // title + preview primero (rápido). content solo si la query tiene ≥2 chars.
  if (!query || query.trim().length < 2) {
    return queryAll(
      `SELECT ${NOTE_META_COLS} FROM notes WHERE title LIKE ? OR preview LIKE ? ORDER BY pinned DESC, updated_at DESC`,
      [q, q]
    );
  }
  return queryAll(
    `SELECT ${NOTE_META_COLS} FROM notes WHERE title LIKE ? OR preview LIKE ? OR content LIKE ? ORDER BY pinned DESC, updated_at DESC`,
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

  flushDbNow();
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
    flushDbNow();
    const backupPath = dbPath + '.backup-' + Date.now();
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);

    // Insert imported en un solo batch + un flush (evita N exports a disco)
    const ops: Array<{ sql: string; params?: any[] }> = [];
    for (const f of data.folders) {
      ops.push({
        sql: 'INSERT OR REPLACE INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [f.id, f.name, f.icon, f.color, f.sort_order, f.created_at],
      });
    }
    for (const n of data.notes) {
      ops.push({
        sql: 'INSERT OR REPLACE INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [n.id, n.folder_id, n.title, n.content, n.preview, n.thumb || '', n.pinned, n.created_at, n.updated_at],
      });
    }
    runQueryBatch(ops, { flushNow: true });
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
    // Start locked whenever a password exists so tray restore never assumes an open session.
    sessionLocked = hasPasswordHash();
    lastActivityAt = Date.now();
    startIdleLockWatcher();
    createWindow();
    createTray();
    registerToggleHotkey();

    const scopeVal = queryGet('SELECT value FROM settings WHERE key = ?', ['caps_lock_sound_scope']);
    if (scopeVal?.value === 'global') {
      startCapsLockWorker();
    }

    // Auto-check for updates on startup (default on when unset)
    const autoCheck = queryGet('SELECT value FROM settings WHERE key = ?', ['auto_check_updates']);
    initUpdater(autoCheck ? autoCheck.value === 'true' : true);

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

  app.on('before-quit', () => {
    isQuitting = true;
    try { globalShortcut.unregisterAll(); } catch (_) {}
    if (idleLockInterval) {
      clearInterval(idleLockInterval);
      idleLockInterval = null;
    }
    stopCapsLockWorker();
    flushDbNow();
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
