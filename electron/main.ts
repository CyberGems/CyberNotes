import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, session, screen, clipboard, nativeImage, net, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { exec, spawn } from 'child_process';
import { initUpdater, setAutoUpdate, setCanInstallChecker } from './updater';
import { initLogger, writeLog, logRendererError } from './logger';
import { STICKY_BACKGROUNDS, STICKY_COLOR_IDS, asStickyColorId } from '../shared/sticky';
import { extractThumbFromContent } from '../shared/notes';
import { isSpanish } from '../shared/lang';
import { parseBackupHours, parseBackupKeep, isBackupDue, backupFileName, isBackupFile, selectBackupsToPrune } from '../shared/backup';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─── Detectar si estamos en dev o producción ───────────────────────────────
const isDev = !app.isPackaged;

function getDevRendererUrl(query?: Record<string, string>): string {
  const raw = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5273';
  const match = raw.match(/^(https?):\/\/([^:/]+)(?::(\d+))?/i);
  const url = new URL(`${match?.[1] || 'http'}://${match?.[2] || 'localhost'}:${match?.[3] || '5273'}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

// Icon path resolution (window icon)
let iconPath = path.join(__dirname, '..', 'public', 'icon.png');
if (!isDev) {
  iconPath = path.join(app.getAppPath(), 'dist', 'icon.png');
}
if (!fs.existsSync(iconPath)) {
  const fallbackIcon = path.join(isDev ? path.join(__dirname, '..', 'public') : path.join(app.getAppPath(), 'dist'), 'icon.ico');
  if (fs.existsSync(fallbackIcon)) iconPath = fallbackIcon;
}

// Tray icon path — ICO kept for fallback, but crisp rendering uses PNG resized to tray DPI (see getTrayIcon)
let trayIconPath = path.join(isDev ? path.join(__dirname, '..', 'public') : path.join(app.getAppPath(), 'dist'), 'icon.ico');
if (!fs.existsSync(trayIconPath)) {
  trayIconPath = iconPath;
}

function getTrayIcon(): string | Electron.NativeImage {
  try {
    const pngPath = isDev
      ? path.join(__dirname, '..', 'public', 'icon.png')
      : path.join(app.getAppPath(), 'dist', 'icon.png');
    if (fs.existsSync(pngPath)) {
      let scale = 1;
      try { scale = screen.getPrimaryDisplay()?.scaleFactor || 1; } catch { scale = 1; }
      let size = 16;
      if (scale >= 2) size = 32;
      else if (scale >= 1.5) size = 24;
      else if (scale >= 1.25) size = 20;
      else size = 16;
      const img = nativeImage.createFromPath(pngPath);
      if (!img.isEmpty()) {
        const resized = img.resize({ width: size, height: size, quality: 'best' });
        if (!resized.isEmpty()) return resized;
      }
    }
  } catch { /* fallback to ICO */ }
  return trayIconPath;
}

// ─── bcrypt (pure JS, no nativo) ──────────────────────────────────────────
const bcrypt = require('bcryptjs');

// ─── Paths de datos ────────────────────────────────────────────────────────
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'cybernotes.db');
const imagesPath = path.join(userDataPath, 'images');
const backupsDir = path.join(userDataPath, 'backups');
initLogger(userDataPath);

// ─── uuid ─────────────────────────────────────────────────────────────────
const { v4: uuidv4 } = require('uuid');

// ─── SQL.js DB ────────────────────────────────────────────────────────────
let db: any = null;
let SQL: any = null;

/** Columnas ligeras para listados (sin content HTML completo). */
const NOTE_META_COLS = 'id, folder_id, title, preview, thumb, pinned, created_at, updated_at, deleted_at';
const TRASH_RETENTION_DAYS = 30;

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
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS note_drafts (
      note_id         TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      content         TEXT NOT NULL,
      base_updated_at TEXT NOT NULL,
      updated_at      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sticky_notes (
      note_id     TEXT PRIMARY KEY,
      x           INTEGER,
      y           INTEGER,
      width       INTEGER DEFAULT 320,
      height      INTEGER DEFAULT 360,
      pinned_top  INTEGER DEFAULT 1,
      color       TEXT DEFAULT 'cyber-yellow',
      opacity     REAL DEFAULT 0.9,
      is_open     INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS usage_days (
      day   TEXT PRIMARY KEY,
      opens INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Migración: DBs antiguas sin columnas nuevas o sticky_notes
  ensureColumn('notes', 'thumb', "TEXT DEFAULT ''");
  ensureColumn('notes', 'deleted_at', 'TEXT');
  ensureColumn('sticky_notes', 'pinned_top', "INTEGER DEFAULT 1");
  ensureColumn('sticky_notes', 'color', "TEXT DEFAULT 'cyber-yellow'");
  ensureColumn('sticky_notes', 'opacity', "REAL DEFAULT 0.9");
  ensureColumn('sticky_notes', 'zoom', 'REAL DEFAULT 1.0');
  ensureColumn('sticky_notes', 'is_open', "INTEGER DEFAULT 1");
  purgeOldTrash();

  // Rellenar miniaturas de notas existentes (una sola vez / solo filas vacías)
  backfillNoteThumbs();

  // Si es una instalación nueva sin notas, crear contenido inicial de demostración
  const noteCountRow = queryGet('SELECT count(*) as count FROM notes');
  if (!noteCountRow || noteCountRow.count === 0) {
    seedInitialDemoContent();
  }

  // Guardar schema inicial
  saveDbToDisk();

  // Carpeta de imágenes
  if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
  }
}

function seedInitialDemoContent() {
  const langVal = queryGet('SELECT value FROM settings WHERE key = ?', ['language']);
  const sysLocale = app.getLocale() || '';
  const isEs = isSpanish(langVal?.value) || (!langVal && isSpanish(sysLocale));

  const now = new Date().toISOString();

  // 1. Carpetas iniciales
  const folderCountRow = queryGet('SELECT count(*) as count FROM folders');
  const folderGettingStartedId = 'folder-getting-started';
  const folderCyberGemsId = 'folder-cybergems';

  if (!folderCountRow || folderCountRow.count === 0) {
    runQuery(
      `INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [folderGettingStartedId, isEs ? 'Primeros Pasos' : 'Getting Started', 'rocket', '#7c3aed', 0, now]
    );
    runQuery(
      `INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [folderCyberGemsId, 'CyberGems Suite', 'layers', '#06b6d4', 1, now]
    );
  }

  // 2. Nota 1: Bienvenida principal (Fijada)
  const welcomeId = 'welcome-note';
  const welcomeTitle = isEs ? '👋 ¡Bienvenido a CyberNotes!' : '👋 Welcome to CyberNotes!';
  const welcomeContent = isEs
    ? `<h1>👋 ¡Bienvenido a CyberNotes!</h1><p><strong>CyberNotes</strong> es tu espacio de notas rápido, moderno y con estética cyberpunk. Todo lo que escribes se almacena localmente en tu equipo con total privacidad, utilizando <strong>SQL.js (SQLite WASM)</strong>: tus notas nunca salen de tu dispositivo.</p><h2>✨ Características principales</h2><ul><li><strong>📁 Carpetas y Colores:</strong> Organiza tus notas en carpetas personalizadas con iconos y colores vibrantes desde la barra lateral.</li><li><strong>⭐ Favoritos y Pestañas:</strong> Fija tus notas más importantes y trabaja en múltiples documentos simultáneamente mediante pestañas.</li><li><strong>⚡ Atajo global de ventana:</strong> Muestra u oculta CyberNotes desde cualquier aplicación con el atajo de teclado personalizable (por defecto <code>Alt+Shift+N</code>).</li><li><strong>🗺️ Minimapa de navegación:</strong> Visualiza la estructura completa de tu documento para desplazarte ágilmente en notas extensas.</li><li><strong>🔒 Seguridad y Bloqueo:</strong> Protege el acceso con contraseña maestra (hash bcrypt para el bloqueo, las notas se guardan sin cifrar), bloqueo automático por inactividad y escudo de privacidad al minimizar.</li><li><strong>⇪ Auto-desbloqueo de Mayúsculas:</strong> Sistema inteligente que desactiva el Bloq Mayús tras inactividad para evitar errores de tipeo accidentales.</li></ul><h2>💡 Atajos de teclado clave</h2><ul><li><code>Ctrl + N</code>: Crear una nueva nota al instante.</li><li><code>Ctrl + F</code>: Búsqueda instantánea de texto completo en todas las notas.</li><li><code>Ctrl + B</code> / <code>Ctrl + I</code> / <code>Ctrl + U</code>: Formato rápido en negrita, cursiva o subrayado.</li><li><code>Ctrl + P</code>: Imprimir o exportar la nota actual a PDF.</li><li><code>Alt + Shift + N</code>: Invocar u ocultar CyberNotes desde cualquier lugar de Windows.</li></ul><blockquote><p><em>"Tus ideas, notas y código organizados a la velocidad de la luz."</em> (CyberGems Suite)</p></blockquote>`
    : `<h1>👋 Welcome to CyberNotes!</h1><p><strong>CyberNotes</strong> is your fast, modern, cyberpunk-styled note-taking desktop application. Everything you write is stored locally on your machine with complete privacy, powered by <strong>SQL.js (SQLite WASM)</strong>: your notes never leave your device.</p><h2>✨ Key Features</h2><ul><li><strong>📁 Folders &amp; Colors:</strong> Organize your notes into custom folders with vibrant icons and colors from the sidebar.</li><li><strong>⭐ Favorites &amp; Multi-Tabs:</strong> Pin important notes and work with multiple open documents at once using tabs.</li><li><strong>⚡ Global Window Shortcut:</strong> Quickly summon or hide CyberNotes from anywhere with the customizable hotkey (default: <code>Alt+Shift+N</code>).</li><li><strong>🗺️ Document Minimap:</strong> View a real-time overview of your document to navigate long notes seamlessly.</li><li><strong>🔒 Privacy &amp; Lock:</strong> Protect access with a master password (bcrypt hash for the lock, notes are stored unencrypted), auto-lock timer, and privacy shield on minimize.</li><li><strong>⇪ Auto-Unlock Caps Lock:</strong> Intelligent system that releases Caps Lock after typing inactivity to prevent unintended uppercase text.</li></ul><h2>💡 Essential Keyboard Shortcuts</h2><ul><li><code>Ctrl + N</code>: Create a new note instantly.</li><li><code>Ctrl + F</code>: Search across all your notes in real time.</li><li><code>Ctrl + B</code> / <code>Ctrl + I</code> / <code>Ctrl + U</code>: Quick bold, italic, or underline formatting.</li><li><code>Ctrl + P</code>: Print or export the current note to PDF.</li><li><code>Alt + Shift + N</code>: Summon or hide CyberNotes from anywhere on Windows.</li></ul><blockquote><p><em>"Your thoughts, notes, and code organized at the speed of light."</em> (CyberGems Suite)</p></blockquote>`;

  const welcomePreview = isEs
    ? 'CyberNotes es tu espacio de notas rápido, moderno y con estética cyberpunk. Todo lo que escribes se almacena localmente en tu equipo con total privacidad.'
    : 'CyberNotes is your fast, modern, cyberpunk-styled note-taking app. Everything you write is stored locally on your machine with complete privacy.';

  runQuery(
    `INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [welcomeId, folderGettingStartedId, welcomeTitle, welcomeContent, welcomePreview, '', 1, now, now]
  );

  // 3. Nota 2: Ecosistema CyberGems y Sitio Web Oficial
  const suiteId = 'cybergems-suite-note';
  const suiteTitle = isEs ? '💎 Suite CyberGems: Aplicaciones y Ecosistema' : '💎 CyberGems Suite: Apps & Ecosystem';
  const suiteContent = isEs
    ? `<h1>💎 Suite CyberGems: Aplicaciones y Ecosistema</h1><p><strong>CyberGems</strong> es un ecosistema de aplicaciones de escritorio gratuitas y de código abierto (GPLv3) diseñadas para Windows. Todas nuestras herramientas son 100% locales, respetan tu privacidad, y no contienen anuncios, suscripciones ni telemetría.</p><p>🌐 <strong>Sitio web oficial:</strong> <a href="https://cybergems.org" target="_blank" rel="noopener noreferrer">cybergems.org</a> (visítanos para explorar novedades, changelogs y descargas directas).</p><h2>✨ Otras aplicaciones de la Suite</h2><ul><li>🕐 <strong>CyberClock:</strong> Reloj de escritorio con modos analógico y digital, calendario, alarmas, temporizadores y módulo de relajación.</li><li>📢 <strong>CyberFeeds:</strong> Lector RSS y Atom local-first de alto rendimiento para una lectura limpia y sin distracciones.</li><li>🚀 <strong>CyberLauncher:</strong> Lanzador de aplicaciones para Windows con esquinas activas (hot corners), monitor del sistema y terminal integrada.</li><li>💻 <strong>CyberManager:</strong> Administrador de tareas ultra-ligero y nativo de alto rendimiento para Windows NT.</li><li>⚡ <strong>CyberPaste:</strong> Gestor de portapapeles enfocado en privacidad para texto, código, imágenes, HTML y archivos.</li><li>📸 <strong>CyberSnap:</strong> Suite de captura de pantalla y anotación vectorial con OCR de alta velocidad y selector de color.</li><li>⭐ <strong>CyberTray:</strong> Lanzador en la bandeja del sistema con hotspots, monitor de procesos y bóveda protegida por PIN.</li><li>💫 <strong>CyberViewer:</strong> Visor y editor de imágenes completo, ligero y veloz para todo tipo de formatos.</li><li>🛡️ <strong>CyberWall:</strong> Cortafuegos amigable para Windows con reglas por aplicación en tiempo real impulsado por el motor kernel WFP.</li></ul><h2>🔗 Enlaces oficiales</h2><ul><li><strong>Sitio Web Oficial:</strong> <a href="https://cybergems.org" target="_blank" rel="noopener noreferrer">https://cybergems.org</a></li><li><strong>Organización en GitHub:</strong> <a href="https://github.com/CyberGems" target="_blank" rel="noopener noreferrer">https://github.com/CyberGems</a></li><li><strong>Repositorio de CyberNotes:</strong> <a href="https://github.com/CyberGems/CyberNotes" target="_blank" rel="noopener noreferrer">https://github.com/CyberGems/CyberNotes</a></li></ul><blockquote><p><em>"Software libre, transparente y centrado en el usuario."</em> (CyberGems Team)</p></blockquote>`
    : `<h1>💎 CyberGems Suite: Apps &amp; Ecosystem</h1><p><strong>CyberGems</strong> is a suite of free, open-source (GPLv3) desktop applications engineered for Windows. Every app is 100% local, privacy-first, and completely free of ads, tracking, and subscriptions.</p><p>🌐 <strong>Official Website:</strong> <a href="https://cybergems.org" target="_blank" rel="noopener noreferrer">cybergems.org</a> (visit to browse releases, changelogs, and direct downloads).</p><h2>✨ Explore the Suite Apps</h2><ul><li>🕐 <strong>CyberClock:</strong> Desktop clock with analog and digital displays, calendar, timer, stopwatch, and relaxation module.</li><li>📢 <strong>CyberFeeds:</strong> High-performance, local-first RSS and Atom reader built for clean and distraction-free reading.</li><li>🚀 <strong>CyberLauncher:</strong> Application launcher for Windows with hot corners, scheduler, system monitor, and integrated terminal.</li><li>💻 <strong>CyberManager:</strong> Ultra-lightweight and NT-native task manager alternative.</li><li>⚡ <strong>CyberPaste:</strong> Privacy-first clipboard manager for text, code snippets, images, HTML, and files.</li><li>📸 <strong>CyberSnap:</strong> Screen capture and vector annotation suite with high-speed OCR and color picker.</li><li>⭐ <strong>CyberTray:</strong> System tray launcher with hotspots, performance monitor, and PIN-protected file vault.</li><li>💫 <strong>CyberViewer:</strong> Full-featured and high-speed image viewer and editor for casual and power users.</li><li>🛡️ <strong>CyberWall:</strong> User-friendly Windows firewall with real-time per-app rules powered by the WFP kernel engine.</li></ul><h2>🔗 Official Links</h2><ul><li><strong>Official Website:</strong> <a href="https://cybergems.org" target="_blank" rel="noopener noreferrer">https://cybergems.org</a></li><li><strong>GitHub Organization:</strong> <a href="https://github.com/CyberGems" target="_blank" rel="noopener noreferrer">https://github.com/CyberGems</a></li><li><strong>CyberNotes Repository:</strong> <a href="https://github.com/CyberGems/CyberNotes" target="_blank" rel="noopener noreferrer">https://github.com/CyberGems/CyberNotes</a></li></ul><blockquote><p><em>"Free, transparent, and user-centric software."</em> (CyberGems Team)</p></blockquote>`;

  const suitePreview = isEs
    ? 'Descubre la suite CyberGems: herramientas gratuitas, de código abierto y sin publicidad para Windows en cybergems.org.'
    : 'Discover the CyberGems suite: free, open-source, privacy-first tools for Windows at cybergems.org.';

  runQuery(
    `INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [suiteId, folderCyberGemsId, suiteTitle, suiteContent, suitePreview, '', 0, now, now]
  );

  // 4. Nota 3: Guía de Inicio Rápido y Checklist
  const quickstartId = 'quickstart-note';
  const quickstartTitle = isEs ? '🎯 Lista de Inicio Rápido y Consejos' : '🎯 Quick Start Checklist & Tips';
  const quickstartContent = isEs
    ? `<h1>🎯 Lista de Inicio Rápido y Consejos</h1><p>Aquí tienes una guía con los primeros pasos recomendados para dominar <strong>CyberNotes</strong>:</p><h2>✅ Tareas recomendadas</h2><ul><li><strong>Abrir CyberNotes:</strong> ¡Ya estás aquí! Explora la interfaz cyberpunk.</li><li><strong>Crear tu primera nota:</strong> Presiona <code>Ctrl + N</code> o haz clic en el botón <code>+</code> de la barra lateral.</li><li><strong>Organizar con carpetas:</strong> Crea una carpeta en la barra lateral con tu icono y color favorito.</li><li><strong>Probar el atajo global:</strong> Presiona <code>Alt + Shift + N</code> para ocultar la ventana y vuelve a presionarlo para invocarla.</li><li><strong>Personalizar la apariencia:</strong> Abre <em>Configuración</em> desde el menú superior para cambiar el tema, la intensidad del color o añadir un fondo con efecto glass.</li><li><strong>Configurar seguridad:</strong> Si deseas proteger tus notas privadas, activa la contraseña maestra en <em>Configuración &gt; Seguridad</em>.</li><li><strong>Explorar el ecosistema:</strong> Visita <a href="https://cybergems.org" target="_blank" rel="noopener noreferrer">cybergems.org</a> para descubrir las demás herramientas de la suite.</li></ul><h2>💻 Demostración de bloque de código</h2><pre><code>// CyberNotes almacena todo en SQLite local (SQL.js)
const note = {
  encrypted: true,
  privacy: '100% offline',
  speed: 'lightning-fast'
};
console.log('¡Bienvenido a CyberNotes!', note);</code></pre><p>¡Disfruta escribiendo con total privacidad y estilo!</p>`
    : `<h1>🎯 Quick Start Checklist &amp; Tips</h1><p>Here is a guide with recommended steps to get the most out of <strong>CyberNotes</strong>:</p><h2>✅ Onboarding Checklist</h2><ul><li><strong>Launch CyberNotes:</strong> You are already here! Take a look at the cyberpunk UI.</li><li><strong>Create your first note:</strong> Press <code>Ctrl + N</code> or click the <code>+</code> button on the sidebar.</li><li><strong>Organize with folders:</strong> Create a folder in the sidebar with your favorite icon and color.</li><li><strong>Test the global shortcut:</strong> Press <code>Alt + Shift + N</code> to hide the window and press it again to summon it.</li><li><strong>Customize appearance:</strong> Open <em>Settings</em> from the top menu to change the theme, accent color, or set a background with glass blur.</li><li><strong>Setup security:</strong> To lock sensitive notes, configure a master password in <em>Settings &gt; Security</em>.</li><li><strong>Explore the ecosystem:</strong> Visit <a href="https://cybergems.org" target="_blank" rel="noopener noreferrer">cybergems.org</a> to discover the other tools in the suite.</li></ul><h2>💻 Code Block Demo</h2><pre><code>// CyberNotes stores everything in local SQLite (SQL.js)
const note = {
  encrypted: true,
  privacy: '100% offline',
  speed: 'lightning-fast'
};
console.log('Welcome to CyberNotes!', note);</code></pre><p>Enjoy writing with total privacy and speed!</p>`;

  const quickstartPreview = isEs
    ? 'Primeros pasos para sacar el máximo provecho a CyberNotes: atajos, carpetas, personalización y seguridad.'
    : 'Get the most out of CyberNotes: shortcuts, folder organization, customization, and security.';

  runQuery(
    `INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [quickstartId, folderGettingStartedId, quickstartTitle, quickstartContent, quickstartPreview, '', 0, now, now]
  );

  // 5. Nota flotante de demostración con referencias prácticas
  const floatingDemoId = 'floating-demo-note';
  const floatingDemoTitle = isEs ? '⚡ Atajos rápidos' : '⚡ Quick shortcuts';
  const floatingDemoContent = isEs
    ? '<h2>⚡ Atajos rápidos</h2><p>Una pequeña referencia para tener CyberNotes siempre a mano.</p><ul><li><strong>Ctrl + N:</strong> crear una nota normal.</li><li><strong>Ctrl + S:</strong> guardar la nota actual.</li><li><strong>Ctrl + F:</strong> buscar entre tus notas.</li><li><strong>Ctrl + Shift + N:</strong> crear una carpeta.</li><li><strong>Alt + Shift + N:</strong> mostrar u ocultar la aplicación.</li></ul><p><em>Esta nota flotante es solo una demostración. Puedes editarla o cerrarla cuando quieras.</em></p>'
    : '<h2>⚡ Quick shortcuts</h2><p>A small reference to keep CyberNotes close at hand.</p><ul><li><strong>Ctrl + N:</strong> create a regular note.</li><li><strong>Ctrl + S:</strong> save the current note.</li><li><strong>Ctrl + F:</strong> search your notes.</li><li><strong>Ctrl + Shift + N:</strong> create a folder.</li><li><strong>Alt + Shift + N:</strong> show or hide the app.</li></ul><p><em>This floating note is only a demonstration. Edit or close it whenever you want.</em></p>';
  const floatingDemoPreview = isEs
    ? 'Referencia rápida de atajos de teclado de CyberNotes.'
    : 'Quick reference for CyberNotes keyboard shortcuts.';

  runQuery(
    `INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [floatingDemoId, null, floatingDemoTitle, floatingDemoContent, floatingDemoPreview, '', 0, now, now]
  );
  runQuery(
    `INSERT INTO sticky_notes (note_id, x, y, width, height, pinned_top, color, opacity, is_open)
     VALUES (?, NULL, NULL, 340, 320, 1, 'neon-cyan', 0.9, 1)`,
    [floatingDemoId]
  );

  // 6. Abrir pestañas iniciales y seleccionar la nota principal
  runQuery(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, ['open_note_ids', JSON.stringify([welcomeId, suiteId])]);
  runQuery(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, ['last_note_id', welcomeId]);
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
function runQueryBatch(ops: Array<{ sql: string; params?: any[] }>, opts?: { flushNow?: boolean }) {  if (!db) throw new Error('Base de datos no inicializada');
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

function purgeOldTrash(): void {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const expired = queryAll('SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?', [cutoff]);
  if (expired.length === 0) return;

  const ops = expired.flatMap((row: any) => [
    { sql: 'DELETE FROM sticky_notes WHERE note_id = ?', params: [row.id] },
    { sql: 'DELETE FROM note_drafts WHERE note_id = ?', params: [row.id] },
    { sql: 'DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL', params: [row.id] },
  ]);
  runQueryBatch(ops);
  console.log(`[CyberNotes] Purged ${expired.length} expired trash note(s)`);
}

// ─── Estadísticas de uso (100% locales, opcionales) ─────────────────────────
// Un renglón por día con aperturas. Todo lo demás (rachas, totales, palabras)
// se deriva al consultar. Si el usuario lo desactiva, no se registra nada.
function localDayString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function isUsageStatsEnabled(): boolean {
  try {
    const row = queryGet('SELECT value FROM settings WHERE key = ?', ['usage_stats_enabled']);
    return !row || row.value !== 'false';
  } catch {
    return true;
  }
}

function recordAppOpen(): void {
  try {
    if (!db || !isUsageStatsEnabled()) return;
    const day = localDayString(new Date());
    // INSERT + UPDATE separados (compatible con cualquier SQLite, sin UPSERT).
    runQuery('INSERT OR IGNORE INTO usage_days (day, opens) VALUES (?, 0)', [day]);
    runQuery('UPDATE usage_days SET opens = opens + 1 WHERE day = ?', [day]);
  } catch {
    /* nunca romper el arranque por estadísticas */
  }
}

function stripHtmlToWords(html: unknown): string[] {
  if (typeof html !== 'string' || !html) return [];
  const noImages = html.replace(/<img\b[^>]*>/gi, ' ');
  const text = noImages.replace(/<[^>]*>/g, ' ');
  return text.split(/\s+/).filter(Boolean);
}

function computeUsageStats() {
  const dayRows = queryAll('SELECT day, opens FROM usage_days ORDER BY day ASC') as { day: string; opens: number }[];
  const days = dayRows.map((r) => r.day);
  const daySet = new Set(days);
  const totalOpens = dayRows.reduce((acc, r) => acc + (Number(r.opens) || 0), 0);

  const toDate = (dayStr: string) => {
    const [y, m, d] = dayStr.split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  };
  const todayStr = localDayString(new Date());
  const stepBack = (dayStr: string) => {
    const d = toDate(dayStr);
    d.setDate(d.getDate() - 1);
    return localDayString(d);
  };

  let currentStreak = 0;
  let cursor = daySet.has(todayStr) ? todayStr : stepBack(todayStr);
  while (daySet.has(cursor)) {
    currentStreak++;
    cursor = stepBack(cursor);
  }

  let longestStreak = 0;
  let run = 0;
  let prev = '';
  for (const day of days) {
    if (prev) {
      const expected = toDate(prev);
      expected.setDate(expected.getDate() + 1);
      run = localDayString(expected) === day ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > longestStreak) longestStreak = run;
    prev = day;
  }

  const notes = queryAll(
    'SELECT content, folder_id, pinned, created_at FROM notes WHERE deleted_at IS NULL',
  ) as { content: string; folder_id: string | null; pinned: number; created_at: string }[];
  let words = 0;
  let images = 0;
  let favorites = 0;
  for (const n of notes) {
    words += stripHtmlToWords(n.content).length;
    const imgs = typeof n.content === 'string' ? n.content.match(/<img\b/gi) : null;
    if (imgs) images += imgs.length;
    if (Number(n.pinned) === 1) favorites++;
  }
  const folderRows = queryAll('SELECT COUNT(*) as count FROM folders') as { count: number }[];

  return {
    firstOpen: days.length > 0 ? days[0] : null,
    totalOpens,
    activeDays: days.length,
    currentStreak,
    longestStreak,
    totals: {
      notes: notes.length,
      words,
      folders: folderRows.length > 0 ? Number(folderRows[0].count) || 0 : 0,
      favorites,
      images,
    },
  };
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

function getStickyLockAction(): 'hide' | 'shield' {
  const value = queryGet('SELECT value FROM settings WHERE key = ?', ['sticky_lock_action'])?.value;
  return value === 'shield' ? 'shield' : 'hide';
}

function requestRendererLock(): void {
  sessionLocked = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('session:force-lock');
  }
  lockStickyWindows();
  updateTrayMenu();
}

function handleSessionUnlocked(): void {
  sessionLocked = false;
  for (const noteId of stickyNotesHiddenByLock) {
    const win = stickyWindows.get(noteId);
    if (win && !win.isDestroyed()) {
      if (win.isMinimized()) win.restore();
      win.show();
    }
  }
  stickyNotesHiddenByLock.clear();
  stickyWindows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('session:shield-disable');
    }
  });
  updateTrayMenu();
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

// ─── Respaldo automatico programado ─────────────────────────────────────
// Copia cybernotes.db a userData/backups cada N horas y conserva las M
// mas recientes. Activado por defecto: un backup que no existe no protege.
let autoBackupTimer: ReturnType<typeof setInterval> | null = null;
let autoBackupRunning = false;

function getAutoBackupConfig(): { enabled: boolean; hours: number; keep: number } {
  const enabledRow = queryGet('SELECT value FROM settings WHERE key = ?', ['auto_backup_enabled']);
  const hoursRow = queryGet('SELECT value FROM settings WHERE key = ?', ['auto_backup_hours']);
  const keepRow = queryGet('SELECT value FROM settings WHERE key = ?', ['auto_backup_keep']);
  return {
    enabled: enabledRow ? enabledRow.value === 'true' : true,
    hours: parseBackupHours(hoursRow?.value),
    keep: parseBackupKeep(keepRow?.value),
  };
}

function runAutoBackup(reason: 'schedule' | 'startup' | 'manual'): { ok: boolean; file?: string } {
  if (autoBackupRunning) return { ok: false };
  autoBackupRunning = true;
  try {
    flushDbNow();
    if (!fs.existsSync(dbPath)) return { ok: false };
    fs.mkdirSync(backupsDir, { recursive: true });
    const file = backupFileName(new Date());
    fs.copyFileSync(dbPath, path.join(backupsDir, file));

    const keep = getAutoBackupConfig().keep;
    const files = fs.readdirSync(backupsDir);
    for (const old of selectBackupsToPrune(files, keep)) {
      try {
        fs.unlinkSync(path.join(backupsDir, old));
      } catch {
        /* conserva las demas */
      }
    }

    const now = new Date().toISOString();
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['auto_backup_last', now]);
    writeLog('info', `Auto backup (${reason}) saved as ${file}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backup:completed', { at: now, file });
    }
    return { ok: true, file };
  } catch (err) {
    writeLog('error', `Auto backup (${reason}) failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ok: false };
  } finally {
    autoBackupRunning = false;
  }
}

function startAutoBackupWatcher(): void {
  if (autoBackupTimer) clearInterval(autoBackupTimer);
  const check = (reason: 'schedule' | 'startup') => {
    const cfg = getAutoBackupConfig();
    if (!cfg.enabled) return;
    const last = queryGet('SELECT value FROM settings WHERE key = ?', ['auto_backup_last'])?.value || null;
    if (isBackupDue(last, Date.now(), cfg.hours)) runAutoBackup(reason);
  };
  // Primera revision tras el arranque: cubre equipos que estuvieron apagados.
  setTimeout(() => check('startup'), 30_000);
  autoBackupTimer = setInterval(() => check('schedule'), 60_000);
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
    requestRendererLock();
  } else {
    mainWindow.webContents.send('session:shield-disable');
    handleSessionUnlocked();
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

// ─── Sticky Notes Manager ──────────────────────────────────────────────────
const stickyWindows = new Map<string, BrowserWindow>();
const stickyNotesHiddenByLock = new Set<string>();
const stickyDragOffsets = new Map<string, {
  x: number;
  y: number;
  width: number;
  height: number;
  lastX: number;
  lastY: number;
}>();
const stickyRevealTimers = new Map<string, ReturnType<typeof setTimeout>>();
const STICKY_DEFAULT_WIDTH = 320;
const STICKY_DEFAULT_HEIGHT = 360;
const STICKY_MIN_WIDTH = 240;
const STICKY_MIN_HEIGHT = 200;
const STICKY_MAX_WIDTH = 720;
const STICKY_MAX_HEIGHT = 640;
function readNumericSetting(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampStickySize(width: number, height: number, maxWidth: number, maxHeight: number) {
  return {
    width: Math.min(maxWidth, Math.max(STICKY_MIN_WIDTH, Math.round(width))),
    height: Math.min(maxHeight, Math.max(STICKY_MIN_HEIGHT, Math.round(height))),
  };
}

function clampStickyWindowOpacity(value: number): number {
  const bounded = Math.min(1, Math.max(0.1, value));
  return [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1].reduce((closest, option) => (
    Math.abs(option - bounded) <= Math.abs(closest - bounded) ? option : closest
  ), 0.9);
}

function applyStickyWindowChrome(win: BrowserWindow, color?: string, opacity?: number): void {
  if (win.isDestroyed()) return;
  if (color) {
    win.setBackgroundColor(STICKY_BACKGROUNDS[asStickyColorId(color)]);
  }
  if (typeof opacity === 'number' && Number.isFinite(opacity)) {
    win.setOpacity(clampStickyWindowOpacity(opacity));
  }
}

function lockStickyWindows(): void {
  if (getStickyLockAction() === 'hide') {
    stickyWindows.forEach((win, noteId) => {
      if (!win.isDestroyed() && win.isVisible()) {
        win.hide();
        stickyNotesHiddenByLock.add(noteId);
      }
    });
    return;
  }

  stickyWindows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('session:force-lock');
    }
  });
}

function notifyStickyListChanged() {
  const openIds = Array.from(stickyWindows.keys());
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sticky:list-changed', openIds);
  }
  stickyWindows.forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send('sticky:list-changed', openIds);
    }
  });
  updateTrayMenu();
}

function openStickyNote(noteId: string, centerOnMainWindow = false): boolean {
  if (stickyWindows.has(noteId)) {
    const existing = stickyWindows.get(noteId);
    if (existing && !existing.isDestroyed()) {
      if (shouldLockBeforeShow()) {
        lockStickyWindows();
        return true;
      }
      if (existing.isMinimized()) existing.restore();
      existing.show();
      existing.focus();
      return true;
    }
  }

  const noteRow = queryGet('SELECT id, title FROM notes WHERE id = ? AND deleted_at IS NULL', [noteId]);
  if (!noteRow) return false;

  const row = queryGet('SELECT * FROM sticky_notes WHERE note_id = ?', [noteId]);
  const hasSavedSize = !!row;
  let width = hasSavedSize
    ? readNumericSetting(row.width, STICKY_DEFAULT_WIDTH)
    : STICKY_DEFAULT_WIDTH;
  let height = hasSavedSize
    ? readNumericSetting(row.height, STICKY_DEFAULT_HEIGHT)
    : STICKY_DEFAULT_HEIGHT;
  const pinnedTop = row ? row.pinned_top !== 0 : true;

  let winX: number | undefined = row && typeof row.x === 'number' ? row.x : undefined;
  let winY: number | undefined = row && typeof row.y === 'number' ? row.y : undefined;

  let validPos = false;
  let savedDisplay: Electron.Display | undefined;
  let targetDisplay: Electron.Display | undefined;
  if (winX !== undefined && winY !== undefined) {
    const matched = screen.getDisplayMatching({ x: winX, y: winY, width, height });
    savedDisplay = matched;
    const wa = matched.workArea;
    validPos = (
      winX >= wa.x &&
      winY >= wa.y &&
      winX + width <= wa.x + wa.width &&
      winY + height <= wa.y + wa.height
    );
    if (validPos) targetDisplay = matched;
  }

  if (centerOnMainWindow && mainWindow && !mainWindow.isDestroyed()) {
    // Explicit opens from CyberNotes should be rehomed to the app's monitor,
    // even when an older saved position was valid on another display.
    targetDisplay = screen.getDisplayMatching(mainWindow.getBounds());
    validPos = false;
  } else if (!targetDisplay) {
    if (savedDisplay) {
      targetDisplay = savedDisplay;
    } else {
      let cursorPos = { x: 0, y: 0 };
      try { cursorPos = screen.getCursorScreenPoint(); } catch (_) {}
      targetDisplay = screen.getDisplayNearestPoint(cursorPos) || screen.getPrimaryDisplay();
    }
  }

  const wa = targetDisplay.workArea;
  // Keep corrupted or stale bounds from expanding across the virtual desktop.
  // The native maximum also prevents a later manual resize from turning a
  // sticky note into a full-screen window.
  const maxWidth = Math.min(STICKY_MAX_WIDTH, Math.max(STICKY_MIN_WIDTH, wa.width - 32));
  const maxHeight = Math.min(STICKY_MAX_HEIGHT, Math.max(STICKY_MIN_HEIGHT, wa.height - 32));
  ({ width, height } = clampStickySize(width, height, maxWidth, maxHeight));

  const maxX = wa.x + wa.width - width - 16;
  const maxY = wa.y + wa.height - height - 16;
  if (validPos) {
    winX = Math.min(Math.max(winX!, wa.x + 16), maxX);
    winY = Math.min(Math.max(winY!, wa.y + 16), maxY);
  } else if (centerOnMainWindow) {
    winX = Math.round(wa.x + (wa.width - width) / 2);
    winY = Math.round(wa.y + (wa.height - height) / 2);
  } else if (savedDisplay === targetDisplay && winX !== undefined && winY !== undefined) {
    // Repair an old position that was partly outside its saved monitor without
    // moving it to whichever monitor currently contains the mouse pointer.
    winX = Math.min(Math.max(winX, wa.x + 16), maxX);
    winY = Math.min(Math.max(winY, wa.y + 16), maxY);
  } else {
    const offset = (stickyWindows.size * 32) % 160;
    winX = Math.min(Math.max(wa.x + wa.width - width - 40 - offset, wa.x + 20), wa.x + wa.width - width);
    winY = Math.min(Math.max(wa.y + 60 + offset, wa.y + 20), wa.y + wa.height - height);
  }

  const skipTaskbarVal = queryGet('SELECT value FROM settings WHERE key = ?', ['sticky_skip_taskbar']);
  const skipTaskbar = skipTaskbarVal ? skipTaskbarVal.value === 'true' : true;
  const stickyConfig = getStickyConfig(noteId);

  const win = new BrowserWindow({
    width,
    height,
    x: winX,
    y: winY,
    useContentSize: true,
    minWidth: STICKY_MIN_WIDTH,
    minHeight: STICKY_MIN_HEIGHT,
    frame: false,
    transparent: false,
    backgroundColor: STICKY_BACKGROUNDS[asStickyColorId(stickyConfig.color)],
    hasShadow: false,
    roundedCorners: false,
    maximizable: false,
    fullscreenable: false,
    alwaysOnTop: pinnedTop,
    skipTaskbar,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    show: false,
  });

  win.setHasShadow(false);
  // Setting maxWidth in the constructor can make Windows ignore the requested
  // size and open the sticky near the monitor cap. Apply limits after the
  // intended content size is set.
  win.setContentSize(width, height);
  win.setMinimumSize(STICKY_MIN_WIDTH, STICKY_MIN_HEIGHT);
  win.setMaximumSize(maxWidth, maxHeight);
  applyStickyWindowChrome(win, stickyConfig.color, stickyConfig.opacity);

  if (pinnedTop) {
    win.setAlwaysOnTop(true, 'floating');
  }

  stickyWindows.set(noteId, win);
  runQuery(
    `INSERT INTO sticky_notes (note_id, x, y, width, height, opacity, is_open)
     VALUES (?, ?, ?, ?, ?, 0.9, 1)
     ON CONFLICT(note_id) DO UPDATE SET x = excluded.x, y = excluded.y,
       width = excluded.width, height = excluded.height, is_open = 1`,
    [noteId, winX, winY, width, height]
  );

  let boundsTimer: ReturnType<typeof setTimeout> | null = null;

  const persistBounds = () => {
    if (win.isDestroyed()) return;
    const position = win.getBounds();
    const [contentWidth, contentHeight] = win.getContentSize();
    runQuery(
      `UPDATE sticky_notes SET x = ?, y = ?, width = ?, height = ? WHERE note_id = ?`,
      [position.x, position.y, contentWidth, contentHeight, noteId],
      { flushNow: isQuitting }
    );
  };
  const saveBounds = () => {
    if (win.isDestroyed()) return;
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(() => {
      boundsTimer = null;
      persistBounds();
    }, 250);
  };

  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.on('close', () => {
    if (boundsTimer) {
      clearTimeout(boundsTimer);
      boundsTimer = null;
      persistBounds();
    }
    stickyWindows.delete(noteId);
    stickyNotesHiddenByLock.delete(noteId);
    stickyDragOffsets.delete(noteId);
    const revealTimer = stickyRevealTimers.get(noteId);
    if (revealTimer) {
      clearTimeout(revealTimer);
      stickyRevealTimers.delete(noteId);
    }
    // Preserve the open state across an application quit. A user clicking the
    // sticky's X still dismisses it until they explicitly open it again.
    runQuery(
      'UPDATE sticky_notes SET is_open = ? WHERE note_id = ?',
      [isQuitting ? 1 : 0, noteId],
      { flushNow: isQuitting }
    );
    notifyStickyListChanged();
    updateTrayMenu();
  });

  let stickyWindowRevealed = false;
  const revealStickyWindow = () => {
    if (stickyWindowRevealed || win.isDestroyed()) return;
    stickyWindowRevealed = true;
    if (shouldLockBeforeShow()) {
      if (getStickyLockAction() === 'hide') {
        stickyNotesHiddenByLock.add(noteId);
        win.hide();
        notifyStickyListChanged();
        updateTrayMenu();
        return;
      }
      // The renderer also checks the initial session state, but this event keeps
      // already-loaded sticky windows in sync with a lock that happened during startup.
      win.webContents.send('session:force-lock');
    }
    win.setContentSize(width, height);
    win.show();
    notifyStickyListChanged();
    updateTrayMenu();
  };

  // Reveal as soon as the document is available. ready-to-show can wait for
  // the renderer's first fully painted frame, which makes creation feel slow.
  win.webContents.once('dom-ready', revealStickyWindow);
  win.once('ready-to-show', revealStickyWindow);

  if (isDev) {
    win.loadURL(getDevRendererUrl({ sticky: noteId }));
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'), {
      search: `sticky=${encodeURIComponent(noteId)}`
    });
  }

  return true;
}

function closeStickyNote(noteId: string): boolean {
  const win = stickyWindows.get(noteId);
  if (win && !win.isDestroyed()) {
    win.close();
    return true;
  }
  return false;
}

function revealStickyNote(noteId: string): boolean {
  if (shouldLockBeforeShow()) {
    lockStickyWindows();
    return stickyWindows.has(noteId);
  }

  const win = stickyWindows.get(noteId);
  if (!win || win.isDestroyed()) {
    return openStickyNote(noteId);
  }

  if (win.isMinimized()) win.restore();
  win.show();
  win.moveTop();

  const wasPinned = getStickyConfig(noteId).pinned_top;
  if (!wasPinned) {
    win.setAlwaysOnTop(true, 'pop-up-menu');
    const previous = stickyRevealTimers.get(noteId);
    if (previous) clearTimeout(previous);
    stickyRevealTimers.set(noteId, setTimeout(() => {
      stickyRevealTimers.delete(noteId);
      if (win.isDestroyed()) return;
      if (!getStickyConfig(noteId).pinned_top) {
        win.setAlwaysOnTop(false, 'normal');
      }
    }, 2200));
  }

  win.focus();
  if (!win.webContents.isDestroyed()) {
    win.webContents.send('sticky:attention');
  }
  return true;
}

function toggleStickyAlwaysOnTop(noteId: string): boolean {
  const win = stickyWindows.get(noteId);
  if (!win || win.isDestroyed()) return false;
  const nextVal = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(nextVal, nextVal ? 'floating' : 'normal');
  runQuery('UPDATE sticky_notes SET pinned_top = ? WHERE note_id = ?', [nextVal ? 1 : 0, noteId]);
  return nextVal;
}

/** Zoom del contenido: mismo rango que la escala del editor principal. */
function clampStickyZoom(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 1.0;
  return Math.min(1.5, Math.max(0.8, Math.round(n * 100) / 100));
}

function getStickyConfig(noteId: string) {
  const row = queryGet('SELECT color, opacity, pinned_top, zoom FROM sticky_notes WHERE note_id = ?', [noteId]);
  return {
    color: row?.color || 'cyber-yellow',
    opacity: clampStickyWindowOpacity(readNumericSetting(row?.opacity, 0.9)),
    pinned_top: row ? row.pinned_top !== 0 : true,
    zoom: clampStickyZoom(row?.zoom ?? 1.0),
  };
}

function saveStickyConfig(noteId: string, config: { color?: string; opacity?: number; pinned_top?: boolean; zoom?: number }) {
  const current = getStickyConfig(noteId);
  const color = config.color !== undefined ? config.color : current.color;
  const opacity = config.opacity !== undefined ? config.opacity : current.opacity;
  const pinnedTop = config.pinned_top !== undefined ? (config.pinned_top ? 1 : 0) : (current.pinned_top ? 1 : 0);
  const zoom = config.zoom !== undefined ? clampStickyZoom(config.zoom) : current.zoom;

  runQuery(
    `INSERT INTO sticky_notes (note_id, color, opacity, pinned_top, zoom, is_open)
     VALUES (?, ?, ?, ?, ?, 1)
     ON CONFLICT(note_id) DO UPDATE SET color = excluded.color, opacity = excluded.opacity, pinned_top = excluded.pinned_top, zoom = excluded.zoom`,
    [noteId, color, opacity, pinnedTop, zoom]
  );

  const win = stickyWindows.get(noteId);
  if (win && !win.isDestroyed()) {
    if (config.pinned_top !== undefined) {
      win.setAlwaysOnTop(config.pinned_top, config.pinned_top ? 'floating' : 'normal');
    }
    applyStickyWindowChrome(win, color, opacity);
    win.webContents.send('sticky:config-updated', { color, opacity, pinned_top: pinnedTop !== 0, zoom });
  }
  return true;
}

function toggleAllStickyNotes(forceShow?: boolean): boolean {
  if (stickyWindows.size === 0) return false;
  if (sessionLocked && getStickyLockAction() === 'hide') {
    lockStickyWindows();
    return false;
  }
  let anyVisible = false;
  stickyWindows.forEach((win) => {
    if (!win.isDestroyed() && win.isVisible()) anyVisible = true;
  });

  const shouldShow = forceShow !== undefined ? forceShow : !anyVisible;
  stickyWindows.forEach((win, noteId) => {
    if (!win.isDestroyed()) {
      if (shouldShow) {
        if (win.isMinimized()) win.restore();
        win.show();
      } else {
        win.hide();
      }
    }
  });
  updateTrayMenu();
  return shouldShow;
}

function createAndOpenStickyNote(centerOnMainWindow = false): string {
  const langVal = queryGet('SELECT value FROM settings WHERE key = ?', ['language']);
  const isEs = isSpanish(langVal?.value);
  const newId = uuidv4();
  const now = new Date().toISOString();
  const defaultTitle = isEs ? 'Nota flotante' : 'Floating note';

  runQuery(
    'INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId, null, defaultTitle, '', '', '', 0, now, now]
  );

  const randomColor = STICKY_COLOR_IDS[Math.floor(Math.random() * STICKY_COLOR_IDS.length)] || 'cyber-yellow';
  runQuery(
    `INSERT INTO sticky_notes (note_id, color, opacity, pinned_top, is_open)
     VALUES (?, ?, 0.9, 1, 1)`,
    [newId, randomColor]
  );

  openStickyNote(newId, centerOnMainWindow);

  const newNote = {
    id: newId,
    folder_id: null,
    title: defaultTitle,
    preview: '',
    thumb: '',
    pinned: 0,
    created_at: now,
    updated_at: now,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('note:updated', newNote);
  }

  return newId;
}

function focusMainWindowWithNote(noteId: string): void {
  restoreWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sticky:focus-note', noteId);
  }
}

const TRAY_MENU_SHADOW_PAD = 26;
const TRAY_MENU_WIDTH = 300;
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

type SuiteApp = { slug: string; name: string; site: string };
// Slug de esta app: se excluye del submenú (promociona hermanas, no a sí misma).
const SELF_SLUG = 'cybernotes';

// Submenú "Más de CyberGems": se lee de public/suite/suite.json (copia local
// generada con _Website/scripts/build-suite-json.mjs; sin red en runtime).
// Si el archivo falta, se usan estas 4 hermanas como respaldo.
let suiteAppsCache: SuiteApp[] | null = null;
function loadSuiteApps(): SuiteApp[] {
  if (suiteAppsCache) return suiteAppsCache;
  const fallback: SuiteApp[] = [
    { slug: 'cyberpaste', name: 'CyberPaste', site: 'https://cybergems.org/apps/cyberpaste/' },
    { slug: 'cyberfeeds', name: 'CyberFeeds', site: 'https://cybergems.org/apps/cyberfeeds/' },
    { slug: 'cybersnap', name: 'CyberSnap', site: 'https://cybergems.org/apps/cybersnap/' },
    { slug: 'cyberviewer', name: 'CyberViewer', site: 'https://cybergems.org/apps/cyberviewer/' },
  ];
  try {
    const candidates = [
      path.join(app.getAppPath(), 'dist', 'suite', 'suite.json'),
      path.join(__dirname, '..', 'public', 'suite', 'suite.json'),
    ];
    for (const candidate of candidates) {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      if (Array.isArray(parsed?.apps) && parsed.apps.length > 0) {
        suiteAppsCache = (parsed.apps as any[])
          .filter((a) => a && typeof a.slug === 'string' && typeof a.name === 'string')
          .map((a) => ({
            slug: a.slug as string,
            name: String(a.name),
            site: typeof a.site === 'string' && a.site ? a.site : `https://cybergems.org/apps/${a.slug}/`,
          }));
        return suiteAppsCache;
      }
    }
  } catch { /* respaldo */ }
  suiteAppsCache = fallback;
  return suiteAppsCache;
}

function suiteIconFile(slug: string): string | undefined {
  try {
    const candidates = [
      path.join(app.getAppPath(), 'dist', 'suite', `${slug}.png`),
      path.join(__dirname, '..', 'public', 'suite', `${slug}.png`),
    ];
    if (candidates.some((c) => { try { return fs.existsSync(c); } catch { return false; } })) {
      return `suite/${slug}.png`;
    }
  } catch { /* sin icono */ }
  return undefined;
}

// Descripciones cortas del submenú "Más de CyberGems" (bilingües aquí porque
// el tray las pide ya resueltas según el idioma).
const SUITE_SHORT: Record<string, { es: string; en: string }> = {
  cyberclock: { es: 'Reloj de escritorio', en: 'Desktop Clock' },
  cyberfeeds: { es: 'Lector RSS', en: 'RSS Reader' },
  cyberlauncher: { es: 'Lanzador de apps', en: 'App Launcher' },
  cybermanager: { es: 'Administrador de tareas', en: 'Task Manager' },
  cybernotes: { es: 'Notas', en: 'Note Taking' },
  cyberpaste: { es: 'Portapapeles', en: 'Clipboard Manager' },
  cybersnap: { es: 'Captura de pantalla', en: 'Screen Capture' },
  cybertray: { es: 'Accesos directos', en: 'Shortcut Manager' },
  cyberviewer: { es: 'Visor de imágenes', en: 'Image Viewer' },
  cyberwall: { es: 'Firewall', en: 'Firewall' },
};

function buildTrayMenuState() {
  const langVal = queryGet('SELECT value FROM settings WHERE key = ?', ['language']);
  const lang = langVal?.value || 'en';
  const isEs = isSpanish(lang);
  const visible = isWindowShown();
  const activeHotkey = getActiveToggleHotkey();
  const hasPwd = hasPasswordHash();
  const canLock = hasPwd && !sessionLocked;

  const stickyCount = stickyWindows.size;
  let anyStickyVisible = false;
  stickyWindows.forEach((win) => {
    if (!win.isDestroyed() && win.isVisible()) anyStickyVisible = true;
  });

  return {
    version: app.getVersion(),
    head: 'CyberNotes v' + app.getVersion(),
    lang: isEs ? 'es' : 'en',
    visible,
    canLock,
    stickyCount,
    anyStickyVisible,
    showLabel: visible ? (isEs ? 'Ocultar CyberNotes' : 'Hide CyberNotes') : (isEs ? 'Mostrar CyberNotes' : 'Show CyberNotes'),
    newStickyLabel: isEs ? 'Nueva nota flotante' : 'New floating note',
    toggleStickyLabel: anyStickyVisible
      ? (isEs ? 'Ocultar notas flotantes' : 'Hide floating notes')
      : (isEs ? 'Mostrar notas flotantes' : 'Show floating notes'),
    lockLabel: isEs ? 'Bloquear' : 'Lock',
    settingsLabel: isEs ? 'Configuración...' : 'Settings...',
    aboutLabel: isEs ? 'Acerca de CyberNotes...' : 'About CyberNotes...',
    exitLabel: isEs ? 'Salir' : 'Exit',
    shortcut: activeHotkey,
    ...(queryGet('SELECT value FROM settings WHERE key = ?', ['show_suite_promo'])?.value !== 'false'
      ? {
          suite: {
            label: isEs ? 'Más de CyberGems' : 'More from CyberGems',
            viewAllLabel: isEs ? 'Más detalles online…' : 'More details online…',
            apps: loadSuiteApps()
              .filter((a) => a.slug !== SELF_SLUG)
              .map((a) => ({
              name: a.name,
              action: `suite-${a.slug}`,
              img: suiteIconFile(a.slug),
              desc: (SUITE_SHORT[a.slug] || { es: '', en: '' })[isEs ? 'es' : 'en'],
            })),
          },
        }
      : {}),
    help: {
      label: isEs ? 'Ayuda' : 'Help',
      backLabel: isEs ? 'Volver' : 'Back',
      setPasswordLabel: hasPwd
        ? (isEs ? 'Cambiar contraseña...' : 'Change password...')
        : (isEs ? 'Configurar contraseña...' : 'Set password...'),
      pinLabel: isEs ? 'Mantener visible en la bandeja del sistema' : 'Keep visible in the system tray',
      docsLabel: isEs ? 'Documentación online' : 'Online documentation',
      faqLabel: isEs ? 'Preguntas frecuentes' : 'FAQ',
      changelogLabel: isEs ? 'Registro de cambios' : 'Changelog',
      websiteLabel: isEs ? 'Sitio web' : 'Website',
      donateLabel: isEs ? 'Donar' : 'Donate',
      aboutLabel: isEs ? 'Acerca de CyberNotes...' : 'About CyberNotes...',
      updatesLabel: isEs ? 'Buscar actualizaciones...' : 'Check for updates...',
    },
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
    trayMenuWin.webContents.send('tray-menu-state', { ...buildTrayMenuState(), resetView: true });
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
    w.webContents.send('tray-menu-state', { ...buildTrayMenuState(), resetView: true });
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
    tray = new Tray(getTrayIcon());
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
  if (typeof action === 'string' && action.startsWith('suite-')) {
    const slug = action.slice('suite-'.length);
    if (slug === 'view-all') {
      void shell.openExternal('https://cybergems.org/#apps');
    } else {
      const app = loadSuiteApps().find((a) => a.slug === slug);
      if (app) void shell.openExternal(app.site);
    }
    return;
  }
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
    case 'lock':
      requestRendererLock();
      restoreWindow();
      updateTrayMenu();
      break;
    case 'settings':
      restoreWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-settings');
      break;
    case 'about':
      restoreWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-about');
      break;
    case 'help-set-password':
      restoreWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-settings', 'security');
      break;
    case 'help-pin':
      restoreWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-tray-pin');
      break;
    case 'help-docs':
      shell.openExternal('https://github.com/CyberGems/CyberNotes/wiki');
      break;
    case 'help-faq':
      shell.openExternal('https://github.com/CyberGems/CyberNotes/wiki/FAQ');
      break;
    case 'help-changelog':
      shell.openExternal('https://github.com/CyberGems/CyberNotes/releases');
      break;
    case 'help-website':
      shell.openExternal('https://cybergems.org');
      break;
    case 'help-donate':
      shell.openExternal('https://github.com/CyberGems/CyberNotes#%EF%B8%8F-donate');
      break;
    case 'help-about':
      restoreWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-about');
      break;
    case 'help-check-updates':
      restoreWindow();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-about', { checkUpdates: true });
      break;
    case 'toggle-sticky':
      toggleAllStickyNotes();
      break;
    case 'new-sticky':
      createAndOpenStickyNote();
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

function getValidWindowBounds(savedBoundsJson: string | null | undefined): {
  width: number;
  height: number;
  x?: number;
  y?: number;
  center: boolean;
} {
  const primaryDisplay = screen.getPrimaryDisplay();
  const primaryWorkArea = primaryDisplay.workArea;

  const defaultWidth = Math.min(1100, Math.max(900, Math.round(primaryWorkArea.width * 0.75)));
  const defaultHeight = Math.min(700, Math.max(600, Math.round(primaryWorkArea.height * 0.75)));

  let parsed: any = null;
  if (savedBoundsJson) {
    try {
      parsed = JSON.parse(savedBoundsJson);
    } catch (_) {}
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      width: defaultWidth,
      height: defaultHeight,
      x: undefined,
      y: undefined,
      center: true,
    };
  }

  let width = typeof parsed.width === 'number' && parsed.width >= 500 ? parsed.width : defaultWidth;
  let height = typeof parsed.height === 'number' && parsed.height >= 400 ? parsed.height : defaultHeight;
  let x = typeof parsed.x === 'number' ? parsed.x : undefined;
  let y = typeof parsed.y === 'number' ? parsed.y : undefined;

  const allDisplays = screen.getAllDisplays();

  let matchingDisplay: Electron.Display | undefined;
  if (x !== undefined && y !== undefined) {
    matchingDisplay = allDisplays.find((d) => {
      const wa = d.workArea;
      return (
        x! + 150 > wa.x &&
        x! < wa.x + wa.width &&
        y! + 40 > wa.y &&
        y! < wa.y + wa.height
      );
    });
  }

  if (!matchingDisplay) {
    width = Math.min(width, primaryWorkArea.width);
    height = Math.min(height, primaryWorkArea.height);
    return {
      width,
      height,
      x: undefined,
      y: undefined,
      center: true,
    };
  }

  const wa = matchingDisplay.workArea;

  // A restored (non-maximized) window must not equal or exceed screen dimensions
  if (width >= wa.width) {
    width = Math.min(defaultWidth, Math.round(wa.width * 0.85));
  }
  if (height >= wa.height) {
    height = Math.min(defaultHeight, Math.round(wa.height * 0.85));
  }

  // Ensure window is fully accessible within display workArea
  if (x !== undefined && y !== undefined) {
    if (x + width > wa.x + wa.width) {
      x = wa.x + wa.width - width;
    }
    if (x < wa.x) {
      x = wa.x;
    }
    if (y + height > wa.y + wa.height) {
      y = wa.y + wa.height - height;
    }
    if (y < wa.y) {
      y = wa.y;
    }
  }

  return {
    width,
    height,
    x,
    y,
    center: x === undefined || y === undefined,
  };
}

function createWindow() {
  // Recuperar estado de ventana guardado con validación de pantalla
  const boundsJson = queryGet('SELECT value FROM settings WHERE key = ?', ['window_bounds']);
  const isMaximizedVal = queryGet('SELECT value FROM settings WHERE key = ?', ['is_maximized']);

  const winBounds = getValidWindowBounds(boundsJson?.value);

  mainWindow = new BrowserWindow({
    width: winBounds.width,
    height: winBounds.height,
    x: winBounds.x,
    y: winBounds.y,
    center: winBounds.center,
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
      const isMin = mainWindow.isMinimized();
      const isFull = mainWindow.isFullScreen();

      if (!isMin) {
        runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['is_maximized', isMax ? 'true' : 'false'], { flushNow: immediate });
      }

      if (!isMax && !isMin && !isFull) {
        const b = mainWindow.getBounds();
        if (b.width >= 500 && b.height >= 400) {
          runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['window_bounds', JSON.stringify(b)], { flushNow: immediate });
        }
      } else {
        try {
          const nb = mainWindow.getNormalBounds();
          if (nb && nb.width >= 500 && nb.height >= 400) {
            runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['window_bounds', JSON.stringify(nb)], { flushNow: immediate });
          }
        } catch (_) {}
      }
    };

    if (immediate) {
      if (windowStateTimer) clearTimeout(windowStateTimer);
      windowStateTimer = null;
      doSave();
      return;
    }
    if (windowStateTimer) clearTimeout(windowStateTimer);
    windowStateTimer = setTimeout(doSave, 300);
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
    
    // Destruir tray si la ventana se cierra completamente y no hay notas flotantes abiertas
    if (stickyWindows.size === 0 && tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
  });

  // Interceptar links para abrir en el navegador por defecto.
  // Misma validacion estricta que shell:openExternal (solo http/https).
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isSafeExternalUrl(url)) {
      void shell.openExternal(url);
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
    mainWindow.loadURL(getDevRendererUrl());
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
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    const b = mainWindow.getBounds();
    const currentDisplay = screen.getDisplayMatching(b);
    const wa = currentDisplay.workArea;
    if (b.width >= wa.width || b.height >= wa.height) {
      const targetW = Math.min(1100, Math.round(wa.width * 0.85));
      const targetH = Math.min(700, Math.round(wa.height * 0.85));
      mainWindow.setBounds({
        width: targetW,
        height: targetH,
        x: Math.round(wa.x + (wa.width - targetW) / 2),
        y: Math.round(wa.y + (wa.height - targetH) / 2),
      });
    }
  } else {
    mainWindow.maximize();
  }
});
ipcMain.handle('window:is-maximized', () => {
  return !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isMaximized());
});
ipcMain.handle('window-close', () => mainWindow?.close());
ipcMain.handle('window:unsavedChanges:set', (_e: any, val: boolean) => {
  hasUnsavedChanges = val;
});
/** URLs que el renderer puede pedir abrir en el navegador (solo http/https). */
function isSafeExternalUrl(url: unknown): url is string {
  return typeof url === 'string' && /^https?:\/\/[^\s]+$/i.test(url);
}

/** DevTools solo en desarrollo o con flag --debug: un renderer comprometido no debe abrirlas en prod. */
ipcMain.handle('open-dev-tools', () => {
  if (!isDev && !process.argv.includes('--debug')) return false;
  mainWindow?.webContents.openDevTools({ mode: 'detach' });
  return true;
});
ipcMain.handle('open-data-folder', () => shell.openPath(userDataPath));
ipcMain.handle('open-logs-folder', () => shell.openPath(path.join(userDataPath, 'logs')));
ipcMain.handle('log:renderer-error', (_e: any, message: string) => logRendererError(message));
ipcMain.handle('replace-misspelling', (_e: any, word: string) => mainWindow?.webContents.replaceMisspelling(word));
ipcMain.handle('add-to-dictionary', (_e: any, word: string) => {
  if (typeof word !== 'string') return false;
  const clean = word.trim().slice(0, 100);
  if (!clean) return false;
  session.defaultSession.addWordToSpellCheckerDictionary(clean);
  return true;
});
/** Limites para imagenes copiadas al portapapeles desde el renderer. */
const CLIPBOARD_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const CLIPBOARD_DATA_URL_MAX_CHARS = 15 * 1024 * 1024;
ipcMain.handle('clipboard:writeImage', async (_e: any, url: string) => {
  try {
    if (!url || typeof url !== 'string') return false;
    let img = nativeImage.createEmpty();

    if (url.startsWith('data:')) {
      if (url.length > CLIPBOARD_DATA_URL_MAX_CHARS) return false;
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
      // Solo http/https remotos: sin file:, sin protocolos exoticos, con tope de tamano.
      if (!isSafeExternalUrl(url)) return false;
      const response = await net.fetch(url);
      if (!response.ok) return false;
      const buf = Buffer.from(await response.arrayBuffer());
      if (buf.length > CLIPBOARD_IMAGE_MAX_BYTES) return false;
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

ipcMain.handle('check-num-lock', async () => {
  if (process.platform !== 'win32') return false;
  return new Promise((resolve) => {
    const psScript = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Control]::IsKeyLocked('NumLock')";
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

ipcMain.handle('app:getUserName', () => {
  try {
    return os.userInfo().username || process.env.USERNAME || process.env.USER || null;
  } catch {
    return process.env.USERNAME || process.env.USER || null;
  }
});

ipcMain.handle('shell:openExternal', (_e: any, url: string) => {
  if (isSafeExternalUrl(url)) {
    return shell.openExternal(url);
  }
  return false;
});

function resolveOpenTaskbarSettingsExe(): string | null {
  const candidates = [
    path.join(process.resourcesPath || '', 'open-taskbar-settings.exe'),
    path.join(__dirname, '..', 'electron', 'open-taskbar-settings.exe'),
    path.join(app.getAppPath(), 'electron', 'open-taskbar-settings.exe'),
    path.join(__dirname, 'open-taskbar-settings.exe')
  ];
  return candidates.find((c) => {
    try {
      return fs.existsSync(c);
    } catch (_) {
      return false;
    }
  }) || null;
}

async function openTaskbarIconSettings(): Promise<{ success: boolean; method: 'native' | 'uri' }> {
  const helperPath = resolveOpenTaskbarSettingsExe();
  if (process.platform === 'win32' && helperPath) {
    try {
      const child = spawn(helperPath, [], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.once('error', (error) => {
        console.warn('Taskbar settings helper failed; opening Windows Settings:', error.message);
        void shell.openExternal('ms-settings:taskbar');
      });
      child.unref();
      return { success: true, method: 'native' };
    } catch (error) {
      console.warn('Taskbar settings helper unavailable; using Windows Settings:', error);
    }
  }

  await shell.openExternal('ms-settings:taskbar');
  return { success: true, method: 'uri' };
}

ipcMain.handle('open-taskbar-settings', async () => {
  return await openTaskbarIconSettings();
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
  if (locked) {
    if (!sessionLocked) {
      requestRendererLock();
    } else {
      sessionLocked = true;
      lockStickyWindows();
      updateTrayMenu();
    }
  } else {
    lastActivityAt = Date.now();
    handleSessionUnlocked();
  }
  return true;
});

ipcMain.handle('session:is-locked', () => sessionLocked);

ipcMain.on('session:locked', () => {
  sessionLocked = true;
  lockStickyWindows();
  updateTrayMenu();
});

ipcMain.handle('auth:setPassword', async (_e: any, password: string, method?: string) => {
  // El PIN es solo una contraseña corta numérica por la misma puerta bcrypt.
  // Se valida aquí (el renderer no es de fiar) y se guarda el método junto al
  // hash para que nunca queden desincronizados.
  const mode = method === 'pin' ? 'pin' : 'password';
  const secret = typeof password === 'string' ? password : '';
  if (mode === 'pin') {
    if (!/^\d{4,8}$/.test(secret.trim())) return false;
  } else if (secret.length < 4) {
    return false;
  }
  const hash = await bcrypt.hash(mode === 'pin' ? secret.trim() : password, 10);
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['password_hash', hash]);
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['auth_method', mode]);
  sessionLocked = false;
  lastActivityAt = Date.now();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setting-changed', { key: 'password_hash', value: 'set' });
  }
  updateTrayMenu();
  return true;
});

ipcMain.handle('auth:verifyPassword', async (_e: any, password: string) => {
  const row = queryGet('SELECT value FROM settings WHERE key = ?', ['password_hash']);
  if (!row) return true;
  return bcrypt.compare(password, row.value);
});

ipcMain.handle('auth:removePassword', () => {
  runQuery('DELETE FROM settings WHERE key = ?', ['password_hash']);
  // Sin contraseña no hay nada que recuperar: limpiar código y pista también.
  runQuery('DELETE FROM settings WHERE key = ?', ['recovery_code_hash']);
  runQuery('DELETE FROM settings WHERE key = ?', ['password_hint']);
  handleSessionUnlocked();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setting-changed', { key: 'password_hash', value: 'removed' });
  }
  return true;
});

// -- Códigos de recuperación --
// Solo vive el hash bcrypt en disco, nunca el código. verify con rate limit
// local (fuerza bruta tecleando en el equipo).
const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_CODE_GROUPS = 4;
const RECOVERY_CODE_GROUP_LEN = 4;
const RECOVERY_MAX_ATTEMPTS = 5;
const RECOVERY_WINDOW_MS = 10 * 60 * 1000;
const RECOVERY_LOCK_MS = 30 * 1000;
let recoveryAttempts: number[] = [];
let recoveryLockedUntil = 0;

function normalizeRecoveryCode(code: unknown): string {
  if (typeof code !== 'string') return '';
  return code.trim().toUpperCase().replace(/[^A-Z2-9]/g, '');
}

function formatRecoveryCode(randomBytes: Buffer): string {
  const groups: string[] = [];
  let i = 0;
  for (let g = 0; g < RECOVERY_CODE_GROUPS; g++) {
    let part = '';
    for (let k = 0; k < RECOVERY_CODE_GROUP_LEN; k++, i++) {
      part += RECOVERY_CODE_ALPHABET[randomBytes[i % randomBytes.length] % RECOVERY_CODE_ALPHABET.length];
    }
    groups.push(part);
  }
  return groups.join('-');
}

ipcMain.handle('auth:generateRecoveryCode', () => {
  const crypto = require('crypto');
  return formatRecoveryCode(crypto.randomBytes(32));
});

ipcMain.handle('auth:hasRecoveryCode', () => {
  return !!queryGet('SELECT value FROM settings WHERE key = ?', ['recovery_code_hash']);
});

ipcMain.handle('auth:setRecoveryCode', async (_e: any, code: string) => {
  const clean = normalizeRecoveryCode(code);
  if (clean.length < 16) return false;
  const hash = await bcrypt.hash(clean, 10);
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['recovery_code_hash', hash]);
  recoveryAttempts = [];
  recoveryLockedUntil = 0;
  return true;
});

ipcMain.handle('auth:verifyRecoveryCode', async (_e: any, code: string) => {
  const now = Date.now();
  if (now < recoveryLockedUntil) {
    return { ok: false, retryAfterMs: recoveryLockedUntil - now };
  }
  recoveryAttempts = recoveryAttempts.filter((t) => now - t < RECOVERY_WINDOW_MS);
  const row = queryGet('SELECT value FROM settings WHERE key = ?', ['recovery_code_hash']);
  const clean = normalizeRecoveryCode(code);
  const ok = !!row && clean.length >= 16 && (await bcrypt.compare(clean, row.value));
  if (ok) {
    recoveryAttempts = [];
    recoveryLockedUntil = 0;
    return { ok: true, retryAfterMs: 0 };
  }
  recoveryAttempts.push(now);
  if (recoveryAttempts.length >= RECOVERY_MAX_ATTEMPTS) {
    recoveryLockedUntil = now + RECOVERY_LOCK_MS;
    recoveryAttempts = [];
    return { ok: false, retryAfterMs: RECOVERY_LOCK_MS };
  }
  return { ok: false, retryAfterMs: 0 };
});

// -- Estadísticas de uso (solo lectura agregada + purga; ver helpers arriba) --
ipcMain.handle('stats:getUsage', () => {
  try {
    return { ok: true, stats: computeUsageStats() };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
});

ipcMain.handle('stats:purgeUsage', () => {
  try {
    runQuery('DELETE FROM usage_days');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
});

// -- Settings --
// Keys the renderer may read/write through the generic settings channel.
// Security-critical keys (password_hash) and main-process-only keys
// (auto_start, is_maximized, window_bounds) are excluded: they have
// dedicated IPC channels and must never be reachable from the renderer.
const RENDERER_WRITABLE_SETTINGS: ReadonlySet<string> = new Set([
  'theme', 'colorIntensity', 'language', 'editor_font',
  'welcome_name', 'welcome_name_prompt_dismissed',
  'auto_lock_minutes', 'auto_check_updates',
  'last_note_id', 'open_note_ids', 'opened_history', 'recent_cleared_at',
  'ui_scale', 'bg_image', 'glass_blur', 'bg_opacity',
  'remember_last_note', 'minimize_to_tray', 'close_to_tray',
  'show_line_counter', 'show_line_gutter', 'show_word_counter', 'show_minimap',
  'autosave_enabled', 'confirm_leave_note_dismissed', 'confirm_move_note_to_trash_dismissed',
  'auto_unlock_caps_lock', 'auto_unlock_caps_lock_timeout',
  'caps_lock_sound', 'caps_lock_sound_scope',
  'tabs_width_mode', 'note_list_group_by_date', 'note_list_view_mode',
  'note_list_collapsed_groups', 'note_list_floating_group_ready',
  'sticky_restore_on_startup', 'sticky_skip_taskbar', 'sticky_lock_action',
  'toggle_hotkey', 'toggle_hotkey_enabled',
  'auth_method', 'show_suite_promo', 'usage_stats_enabled', 'usage_stats_expanded',
  'auto_backup_enabled', 'auto_backup_hours', 'auto_backup_keep',
]);

const SETTINGS_RESERVED_KEYS: ReadonlySet<string> = new Set([
  'password_hash', 'recovery_code_hash', 'auto_start', 'is_maximized', 'window_bounds',
]);

/** Max value size accepted from the renderer (opened_history JSON can be large). */
const SETTINGS_MAX_VALUE_LENGTH = 100_000;

ipcMain.handle('settings:get', (_e: any, key: string) => {
  if (typeof key !== 'string' || SETTINGS_RESERVED_KEYS.has(key)) return null;
  const row = queryGet('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
});

ipcMain.handle('settings:getMany', (_e: any, keys: string[]) => {
  const result: Record<string, string | null> = {};
  if (!Array.isArray(keys)) return result;
  for (const key of keys) {
    if (typeof key !== 'string' || SETTINGS_RESERVED_KEYS.has(key)) {
      result[key] = null;
      continue;
    }
    const row = queryGet('SELECT value FROM settings WHERE key = ?', [key]);
    result[key] = row ? row.value : null;
  }
  return result;
});

ipcMain.handle('settings:reset', () => {
  // Preserve the access password and recovery code: resetting preferences
  // must never unlock the app or destroy the recovery path.
  // usage_stats_enabled también sobrevive: el reset no debe reactivar
  // algo que el usuario apagó a propósito (la tabla usage_days ni se toca).
  const hashRow = queryGet('SELECT value FROM settings WHERE key = ?', ['password_hash']);
  const recRow = queryGet('SELECT value FROM settings WHERE key = ?', ['recovery_code_hash']);
  const usageRow = queryGet('SELECT value FROM settings WHERE key = ?', ['usage_stats_enabled']);
  runQuery('DELETE FROM settings');
  if (hashRow) {
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['password_hash', hashRow.value]);
  }
  if (recRow) {
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['recovery_code_hash', recRow.value]);
  }
  if (usageRow) {
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['usage_stats_enabled', usageRow.value]);
  }
  registerToggleHotkey();
  startAutoBackupWatcher();
  updateTrayMenu();
  return true;
});

ipcMain.handle('settings:set', (_e: any, key: string, value: string) => {
  if (typeof key !== 'string' || typeof value !== 'string') return false;
  if (SETTINGS_RESERVED_KEYS.has(key) || !RENDERER_WRITABLE_SETTINGS.has(key)) {
    console.warn(`[settings] rejected write for key "${key}"`);
    return false;
  }
  if (value.length > SETTINGS_MAX_VALUE_LENGTH) {
    console.warn(`[settings] rejected oversized value for key "${key}" (${value.length} chars)`);
    return false;
  }
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  const openWindows = [mainWindow, ...stickyWindows.values()];
  openWindows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('setting-changed', { key, value });
    }
  });
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
  if (key === 'auto_backup_enabled' || key === 'auto_backup_hours' || key === 'auto_backup_keep') {
    startAutoBackupWatcher();
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
  const deletedAt = new Date().toISOString();
  const affected = queryAll('SELECT id FROM notes WHERE folder_id = ? AND deleted_at IS NULL', [id]);
  runQueryBatch([
    { sql: 'DELETE FROM note_drafts WHERE note_id IN (SELECT id FROM notes WHERE folder_id = ? AND deleted_at IS NULL)', params: [id] },
    { sql: 'UPDATE notes SET folder_id = NULL, deleted_at = ? WHERE folder_id = ? AND deleted_at IS NULL', params: [deletedAt, id] },
    { sql: 'UPDATE sticky_notes SET is_open = 0 WHERE note_id IN (SELECT id FROM notes WHERE folder_id IS NULL AND deleted_at = ?)', params: [deletedAt] },
    { sql: 'DELETE FROM folders WHERE id = ?', params: [id] },
  ]);
  affected.forEach((note) => {
    const sw = stickyWindows.get(note.id);
    if (sw && !sw.isDestroyed()) sw.close();
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== _e.sender) {
      mainWindow.webContents.send('note:deleted', note.id);
    }
    stickyWindows.forEach((win) => {
      if (!win.isDestroyed() && win.webContents !== _e.sender) {
        win.webContents.send('note:deleted', note.id);
      }
    });
  });
  return affected.length;
});

// -- Notes --
// Listados sin `content` (HTML TipTap puede ser muy grande).
ipcMain.handle('notes:getAll', () => {
  return queryAll(`SELECT ${NOTE_META_COLS} FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC`);
});

ipcMain.handle('notes:getByFolder', (_e: any, folderId: string | null) => {
  if (folderId === 'floating') {
    return queryAll(`SELECT ${NOTE_META_COLS} FROM notes WHERE deleted_at IS NULL AND (folder_id IS NULL OR folder_id = "") ORDER BY pinned DESC, updated_at DESC`);
  }
  if (folderId === 'favorites') {
    return queryAll(`SELECT ${NOTE_META_COLS} FROM notes WHERE deleted_at IS NULL AND pinned = 1 ORDER BY updated_at DESC`);
  }
  if (!folderId) {
    return queryAll(`SELECT ${NOTE_META_COLS} FROM notes WHERE deleted_at IS NULL ORDER BY pinned DESC, updated_at DESC`);
  }
  return queryAll(`SELECT ${NOTE_META_COLS} FROM notes WHERE deleted_at IS NULL AND folder_id = ? ORDER BY pinned DESC, updated_at DESC`, [folderId]);
});

ipcMain.handle('notes:getById', (_e: any, id: string) => {
  return queryGet('SELECT * FROM notes WHERE id = ?', [id]);
});

/** Topes de tamano para datos que llegan del renderer o de archivos (A6). */
const NOTE_CONTENT_MAX_CHARS = 10_000_000;
const NOTE_TITLE_MAX_CHARS = 500;
const NOTE_PREVIEW_MAX_CHARS = 200_000;
const THUMB_MAX_CHARS = 500_000;
const IMPORT_FILE_MAX_BYTES = 100 * 1024 * 1024;
const IMPORT_MAX_ROWS = 50_000;
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const PDF_HTML_MAX_CHARS = 5_000_000;

function isThumbUrl(value: unknown): value is string {
  return typeof value === 'string' && (
    value === '' ||
    value.startsWith('file:') ||
    value.startsWith('data:image/') ||
    /^https?:\/\//i.test(value)
  );
}

ipcMain.handle('notes:save', (_e: any, note: any) => {
  if (!note || typeof note.id !== 'string' || !note.id || note.id.length > 100) return false;
  if (typeof note.content === 'string' && note.content.length > NOTE_CONTENT_MAX_CHARS) return false;
  const title = typeof note.title === 'string' ? note.title.slice(0, NOTE_TITLE_MAX_CHARS) : '';
  const content = typeof note.content === 'string' ? note.content : '';
  const preview = typeof note.preview === 'string' ? note.preview.slice(0, NOTE_PREVIEW_MAX_CHARS) : '';
  const thumb = isThumbUrl(note.thumb) ? note.thumb.slice(0, THUMB_MAX_CHARS) : '';
  const folderId = typeof note.folder_id === 'string' || note.folder_id === null ? note.folder_id : null;
  const pinned = note.pinned ? 1 : 0;
  const exists = queryGet('SELECT id, deleted_at FROM notes WHERE id = ?', [note.id]);
  if (exists?.deleted_at) return note;
  if (exists) {
    runQueryBatch([
      {
        sql: 'UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, thumb = ?, pinned = ?, updated_at = ? WHERE id = ?',
        params: [folderId, title, content, preview, thumb, pinned, note.updated_at, note.id],
      },
      { sql: 'DELETE FROM note_drafts WHERE note_id = ?', params: [note.id] },
    ]);
  } else {
    runQueryBatch([
      {
        sql: 'INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [note.id, folderId, title, content, preview, thumb, pinned, note.created_at, note.updated_at],
      },
      { sql: 'DELETE FROM note_drafts WHERE note_id = ?', params: [note.id] },
    ]);
  }

  // Sincronización en tiempo real
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== _e.sender) {
    mainWindow.webContents.send('note:updated', note);
  }
  stickyWindows.forEach((win) => {
    if (!win.isDestroyed() && win.webContents !== _e.sender) {
      win.webContents.send('note:updated', note);
    }
  });
  return note;
});

ipcMain.handle('drafts:getAll', () => {
  return queryAll(
    'SELECT note_id, title, content, base_updated_at, updated_at FROM note_drafts ORDER BY updated_at DESC'
  );
});

ipcMain.handle('drafts:save', (_e: any, draft: any, flushNow = false) => {
  const noteId = typeof draft?.note_id === 'string' ? draft.note_id : '';
  const title = typeof draft?.title === 'string' ? draft.title : '';
  const content = typeof draft?.content === 'string' ? draft.content : '';
  const baseUpdatedAt = typeof draft?.base_updated_at === 'string' ? draft.base_updated_at : '';
  const updatedAt = typeof draft?.updated_at === 'string' ? draft.updated_at : '';
  if (!noteId || !baseUpdatedAt || !updatedAt) return false;
  if (content.length > NOTE_CONTENT_MAX_CHARS || title.length > NOTE_TITLE_MAX_CHARS) return false;

  const note = queryGet('SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL', [noteId]);
  if (!note) return false;

  runQuery(
    `INSERT OR REPLACE INTO note_drafts
      (note_id, title, content, base_updated_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [noteId, title, content, baseUpdatedAt, updatedAt],
    { flushNow: Boolean(flushNow) }
  );
  return true;
});

ipcMain.handle('drafts:delete', (_e: any, noteId: string) => {
  if (typeof noteId !== 'string' || !noteId) return false;
  runQuery('DELETE FROM note_drafts WHERE note_id = ?', [noteId]);
  return true;
});

ipcMain.handle('notes:delete', (_e: any, id: string) => {
  const deletedAt = new Date().toISOString();
  const active = queryGet('SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!active) return false;
  runQueryBatch([
    { sql: 'UPDATE notes SET deleted_at = ? WHERE id = ?', params: [deletedAt, id] },
    { sql: 'UPDATE sticky_notes SET is_open = 0 WHERE note_id = ?', params: [id] },
    { sql: 'DELETE FROM note_drafts WHERE note_id = ?', params: [id] },
  ]);
  const sw = stickyWindows.get(id);
  if (sw && !sw.isDestroyed()) {
    sw.close();
  }
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents !== _e.sender) {
    mainWindow.webContents.send('note:deleted', id);
  }
  stickyWindows.forEach((win) => {
    if (!win.isDestroyed() && win.webContents !== _e.sender) {
      win.webContents.send('note:deleted', id);
    }
  });
  notifyStickyListChanged();
  return true;
});

ipcMain.handle('notes:getTrash', () => {
  return queryAll(`SELECT ${NOTE_META_COLS} FROM notes WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC`);
});

ipcMain.handle('notes:searchTrash', (_e: any, query: string) => {
  const q = `%${query}%`;
  const contentClause = !query || query.trim().length < 2 ? '' : ' OR content LIKE ?';
  const params = contentClause ? [q, q, q] : [q, q];
  return queryAll(
    `SELECT ${NOTE_META_COLS} FROM notes WHERE deleted_at IS NOT NULL AND (title LIKE ? OR preview LIKE ?${contentClause}) ORDER BY deleted_at DESC`,
    params
  );
});

ipcMain.handle('notes:getTrashCount', () => {
  const row = queryGet('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NOT NULL');
  return Number(row?.count || 0);
});

ipcMain.handle('notes:restore', (_e: any, id: string) => {
  const trashed = queryGet('SELECT id FROM notes WHERE id = ? AND deleted_at IS NOT NULL', [id]);
  if (!trashed) return null;
  runQuery('UPDATE notes SET deleted_at = NULL WHERE id = ?', [id]);
  const restored = queryGet('SELECT * FROM notes WHERE id = ?', [id]);
  if (restored) {
    mainWindow?.webContents.send('note:updated', restored);
    stickyWindows.forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('note:updated', restored);
    });
  }
  return restored;
});

ipcMain.handle('notes:restoreAll', () => {
  const trashed = queryAll('SELECT * FROM notes WHERE deleted_at IS NOT NULL');
  if (trashed.length === 0) return [];
  runQuery('UPDATE notes SET deleted_at = NULL WHERE deleted_at IS NOT NULL');
  trashed.forEach((restored) => {
    restored.deleted_at = null;
    mainWindow?.webContents.send('note:updated', restored);
    stickyWindows.forEach((win) => {
      if (!win.isDestroyed()) win.webContents.send('note:updated', restored);
    });
  });
  return trashed;
});

ipcMain.handle('notes:purge', (_e: any, id: string) => {
  const trashed = queryGet('SELECT id FROM notes WHERE id = ? AND deleted_at IS NOT NULL', [id]);
  if (!trashed) return false;
  runQueryBatch([
    { sql: 'DELETE FROM sticky_notes WHERE note_id = ?', params: [id] },
    { sql: 'DELETE FROM note_drafts WHERE note_id = ?', params: [id] },
    { sql: 'DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL', params: [id] },
  ]);
  return true;
});

ipcMain.handle('notes:emptyTrash', () => {
  const row = queryGet('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NOT NULL');
  runQueryBatch([
    { sql: 'DELETE FROM sticky_notes WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL)' },
    { sql: 'DELETE FROM note_drafts WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL)' },
    { sql: 'DELETE FROM notes WHERE deleted_at IS NOT NULL' },
  ]);
  return Number(row?.count || 0);
});

// -- Sticky Notes IPC --
ipcMain.handle('sticky:open', (event, noteId: string) =>
  openStickyNote(noteId, event.sender === mainWindow?.webContents)
);
ipcMain.handle('sticky:close', (_e: any, noteId: string) => closeStickyNote(noteId));
ipcMain.handle('sticky:toggleAlwaysOnTop', (_e: any, noteId: string) => toggleStickyAlwaysOnTop(noteId));
ipcMain.handle('sticky:getConfig', (_e: any, noteId: string) => getStickyConfig(noteId));
ipcMain.handle('sticky:saveConfig', (_e: any, noteId: string, config: any) => saveStickyConfig(noteId, config));
ipcMain.on('sticky:setChrome', (_e: any, noteId: string, color?: string, opacity?: number) => {
  const win = stickyWindows.get(noteId);
  if (!win || win.isDestroyed()) return;
  applyStickyWindowChrome(win, color, opacity);
});
ipcMain.on('sticky:dragBegin', (_e: any, noteId: string) => {
  const win = stickyWindows.get(noteId);
  if (!win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const [wx, wy] = win.getPosition();
  const [width, height] = win.getSize();
  stickyDragOffsets.set(noteId, {
    x: cursor.x - wx,
    y: cursor.y - wy,
    width,
    height,
    lastX: wx,
    lastY: wy,
  });
});
ipcMain.on('sticky:dragToCursor', (_e: any, noteId: string) => {
  const win = stickyWindows.get(noteId);
  const drag = stickyDragOffsets.get(noteId);
  if (!win || win.isDestroyed() || !drag) return;
  const cursor = screen.getCursorScreenPoint();
  const nextX = Math.round(cursor.x - drag.x);
  const nextY = Math.round(cursor.y - drag.y);
  if (nextX === drag.lastX && nextY === drag.lastY) return;
  drag.lastX = nextX;
  drag.lastY = nextY;
  // Reuse the size captured at drag start. setPosition() re-reads the HWND
  // each frame and Windows DPI rounding inflates it until the monitor cap.
  win.setBounds({ x: nextX, y: nextY, width: drag.width, height: drag.height }, false);
});
ipcMain.on('sticky:dragEnd', (_e: any, noteId: string) => {
  stickyDragOffsets.delete(noteId);
});
ipcMain.handle('sticky:getOpenList', () => Array.from(stickyWindows.keys()));
ipcMain.handle('sticky:focusMain', (_e: any, noteId: string) => focusMainWindowWithNote(noteId));
ipcMain.handle('sticky:toggleAll', (_e: any, show?: boolean) => toggleAllStickyNotes(show));
ipcMain.handle('sticky:createAndOpen', (event) => createAndOpenStickyNote(event.sender === mainWindow?.webContents));
ipcMain.handle('sticky:reveal', (_e: any, noteId: string) => revealStickyNote(noteId));

ipcMain.handle('notes:search', (_e: any, query: string) => {
  const q = `%${query}%`;
  // title + preview primero (rápido). content solo si la query tiene ≥2 chars.
  if (!query || query.trim().length < 2) {
    return queryAll(
      `SELECT ${NOTE_META_COLS} FROM notes WHERE deleted_at IS NULL AND (title LIKE ? OR preview LIKE ?) ORDER BY pinned DESC, updated_at DESC`,
      [q, q]
    );
  }
  return queryAll(
    `SELECT ${NOTE_META_COLS} FROM notes WHERE deleted_at IS NULL AND (title LIKE ? OR preview LIKE ? OR content LIKE ?) ORDER BY pinned DESC, updated_at DESC`,
    [q, q, q]
  );
});

// -- Images --
/** Titulo de dialogo nativo segun el idioma guardado (por defecto ingles). */
function dialogTitle(es: string, en: string): string {
  const langVal = queryGet('SELECT value FROM settings WHERE key = ?', ['language']);
  return isSpanish(langVal?.value) ? es : en;
}

ipcMain.handle('images:selectAndSave', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: dialogTitle('Seleccionar imagen', 'Select image'),
    filters: [{ name: dialogTitle('Imágenes', 'Images'), extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;

  const sourcePath = result.filePaths[0];
  const ext = path.extname(sourcePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'].includes(ext)) return null;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(sourcePath);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size <= 0 || stat.size > IMAGE_MAX_BYTES) return null;
  const filename = `${uuidv4()}${ext}`;
  const destPath = path.join(imagesPath, filename);
  fs.copyFileSync(sourcePath, destPath);
  return `file:///${destPath.replace(/\\/g, '/')}`;
});

// -- Note document export / print --
ipcMain.handle('document:export-pdf', async (_e: any, payload: { title?: string; html?: string }) => {
  const title = String(payload?.title || 'cybernotes-note')
    .replace(/[<>:"/\\|?*]/g, '-')
    .trim() || 'cybernotes-note';
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: dialogTitle('Exportar nota como PDF', 'Export note as PDF'),
    defaultPath: `${title}.pdf`,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return false;
  if (typeof payload?.html === 'string' && payload.html.length > PDF_HTML_MAX_CHARS) return false;

  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true },
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(payload?.html || ''))}`);
    const pdf = await printWindow.webContents.printToPDF({ printBackground: true });
    fs.writeFileSync(result.filePath, pdf);
    return true;
  } catch (error) {
    console.error('[Export PDF] Error:', error);
    return false;
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }
});

ipcMain.handle('document:print', async (_e: any, payload: { title?: string; html?: string }) => {
  if (typeof payload?.html === 'string' && payload.html.length > PDF_HTML_MAX_CHARS) return false;
  const printWindow = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { sandbox: true },
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(String(payload?.html || ''))}`);
    return await new Promise<boolean>((resolve) => {
      printWindow.webContents.print(
        { silent: false, printBackground: true },
        (success) => resolve(success),
      );
    });
  } catch (error) {
    console.error('[Print document] Error:', error);
    return false;
  } finally {
    if (!printWindow.isDestroyed()) printWindow.close();
  }
});

// -- Import/Export --
ipcMain.handle('data:export', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: dialogTitle('Exportar datos de CyberNotes', 'Export CyberNotes data'),
    defaultPath: 'cybernotes-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return false;

  flushDbNow();
  const folders = queryAll('SELECT * FROM folders');
  const notes = queryAll('SELECT * FROM notes');
  const usageDays = queryAll('SELECT day, opens FROM usage_days ORDER BY day ASC');
  const exportData = { folders, notes, usage_days: usageDays, version: 1 };
  
  fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2));
  return true;
});

ipcMain.handle('data:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: dialogTitle('Importar datos a CyberNotes', 'Import CyberNotes data'),
    filters: [{ name: 'JSON', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return false;

  try {
    const stat = fs.statSync(result.filePaths[0]);
    if (!stat.isFile() || stat.size > IMPORT_FILE_MAX_BYTES) return false;
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf-8'));
    if (!data || !Array.isArray(data.folders) || !Array.isArray(data.notes)) return false;
    if (data.folders.length + data.notes.length > IMPORT_MAX_ROWS) return false;

    // Backup current DB
    flushDbNow();
    const backupPath = dbPath + '.backup-' + Date.now();
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);

    const str = (v: unknown, max: number): string =>
      typeof v === 'string' ? v.slice(0, max) : '';
    const idStr = (v: unknown): string | null =>
      typeof v === 'string' && v && v.length <= 100 ? v : null;

    // Insert imported en un solo batch + un flush (evita N exports a disco).
    // Filas invalidas se omiten en lugar de abortar todo el import.
    const ops: Array<{ sql: string; params?: any[] }> = [];
    for (const f of data.folders) {
      const id = idStr(f?.id);
      if (!id) continue;
      ops.push({
        sql: 'INSERT OR REPLACE INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        params: [id, str(f?.name, 200), str(f?.icon, 100), str(f?.color, 100), Number(f?.sort_order) || 0, str(f?.created_at, 100)],
      });
    }
    for (const n of data.notes) {
      const id = idStr(n?.id);
      if (!id) continue;
      if (typeof n?.content === 'string' && n.content.length > NOTE_CONTENT_MAX_CHARS) continue;
      ops.push({
        sql: 'INSERT OR REPLACE INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [
          id,
          typeof n?.folder_id === 'string' ? n.folder_id : null,
          str(n?.title, NOTE_TITLE_MAX_CHARS),
          str(n?.content, NOTE_CONTENT_MAX_CHARS),
          str(n?.preview, NOTE_PREVIEW_MAX_CHARS),
          isThumbUrl(n?.thumb) ? (n.thumb as string).slice(0, THUMB_MAX_CHARS) : '',
          n?.pinned ? 1 : 0,
          str(n?.created_at, 100),
          str(n?.updated_at, 100),
          typeof n?.deleted_at === 'string' ? n.deleted_at : null,
        ],
      });
    }
    // Imported data replaces the saved baseline, so existing drafts could no longer
    // be safely associated with their original versions.
    ops.push({ sql: 'DELETE FROM note_drafts' });
    // Uso: fusionar días válidos (fecha real + aperturas sanas, con tope).
    // Si el usuario lo tiene desactivado, no resucitar historial importado.
    const usageEnabledRow = queryGet('SELECT value FROM settings WHERE key = ?', ['usage_stats_enabled']);
    if ((!usageEnabledRow || usageEnabledRow.value !== 'false') && Array.isArray((data as any)?.usage_days)) {
      const usageRows = (data as any).usage_days.slice(0, 4000);
      for (const u of usageRows) {
        if (typeof u?.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(u.day)) continue;
        const d = new Date(`${u.day}T12:00:00`);
        if (Number.isNaN(d.getTime())) continue;
        const opens = Math.max(0, Math.min(100000, Math.floor(Number(u?.opens) || 0)));
        ops.push({
          sql: 'INSERT OR REPLACE INTO usage_days (day, opens) VALUES (?, ?)',
          params: [u.day, opens],
        });
      }
    }
    runQueryBatch(ops, { flushNow: true });
    return true;
  } catch (e) {
    console.error('Import error:', e);
    return false;
  }
});

// -- Respaldo automatico: control manual y consulta --
ipcMain.handle('backup:now', () => runAutoBackup('manual'));

ipcMain.handle('backup:list', () => {
  try {
    if (!fs.existsSync(backupsDir)) return [];
    return fs
      .readdirSync(backupsDir)
      .filter(isBackupFile)
      .sort()
      .reverse()
      .map((file) => {
        try {
          const stat = fs.statSync(path.join(backupsDir, file));
          return { file, size: stat.size, mtime: stat.mtime.toISOString() };
        } catch {
          return null;
        }
      })
      .filter((entry): entry is { file: string; size: number; mtime: string } => entry !== null);
  } catch {
    return [];
  }
});

ipcMain.handle('backup:openFolder', () => {
  try {
    fs.mkdirSync(backupsDir, { recursive: true });
  } catch {
    /* openPath informa el error */
  }
  return shell.openPath(backupsDir);
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

    writeLog('info', `CyberNotes ${app.getVersion()} started (packaged: ${app.isPackaged})`);
    await initDatabase();
    recordAppOpen();
    // Start locked whenever a password exists so tray restore never assumes an open session.
    sessionLocked = hasPasswordHash();
    lastActivityAt = Date.now();
    startIdleLockWatcher();
    startAutoBackupWatcher();
    createWindow();
    createTray();
    registerToggleHotkey();

    const scopeVal = queryGet('SELECT value FROM settings WHERE key = ?', ['caps_lock_sound_scope']);
    if (scopeVal?.value === 'global') {
      startCapsLockWorker();
    }

    // Auto-check for updates on startup (default on when unset)
    const autoCheck = queryGet('SELECT value FROM settings WHERE key = ?', ['auto_check_updates']);
    setCanInstallChecker(() => !hasUnsavedChanges);
    initUpdater(autoCheck ? autoCheck.value === 'true' : true);

    // Restaurar notas flotantes al iniciar si está habilitado (por defecto sí)
    const restoreSticky = queryGet('SELECT value FROM settings WHERE key = ?', ['sticky_restore_on_startup']);
    if (!restoreSticky || restoreSticky.value === 'true') {
      const openStickies = queryAll('SELECT note_id FROM sticky_notes WHERE is_open = 1');
      for (const row of openStickies) {
        const noteExists = queryGet('SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL', [row.note_id]);
        if (noteExists) {
          openStickyNote(row.note_id);
        } else {
          runQuery('DELETE FROM sticky_notes WHERE note_id = ?', [row.note_id]);
        }
      }
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else restoreWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      if (!tray && stickyWindows.size === 0) app.quit();
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
    try { globalShortcut.unregisterAll(); } catch (_) {}
    if (idleLockInterval) {
      clearInterval(idleLockInterval);
      idleLockInterval = null;
    }
    if (autoBackupTimer) {
      clearInterval(autoBackupTimer);
      autoBackupTimer = null;
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
