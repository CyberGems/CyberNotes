import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, session, screen, clipboard, nativeImage, net, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { exec, spawn } from 'child_process';
import { initUpdater, setAutoUpdate, setCanInstallChecker } from './updater';

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
  `);

  // Migración: DBs antiguas sin columnas nuevas o sticky_notes
  ensureColumn('notes', 'thumb', "TEXT DEFAULT ''");
  ensureColumn('notes', 'deleted_at', 'TEXT');
  ensureColumn('sticky_notes', 'pinned_top', "INTEGER DEFAULT 1");
  ensureColumn('sticky_notes', 'color', "TEXT DEFAULT 'cyber-yellow'");
  ensureColumn('sticky_notes', 'opacity', "REAL DEFAULT 0.9");
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
  const isEs = langVal?.value === 'es' || (!langVal && sysLocale.toLowerCase().startsWith('es'));

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
    ? `<h1>👋 ¡Bienvenido a CyberNotes!</h1><p><strong>CyberNotes</strong> es tu espacio de notas rápido, moderno y con estética cyberpunk. Todo lo que escribes se almacena localmente en tu equipo con total privacidad, utilizando <strong>SQL.js (SQLite WASM)</strong>: tus notas nunca salen de tu dispositivo.</p><h2>✨ Características principales</h2><ul><li><strong>📁 Carpetas y Colores:</strong> Organiza tus notas en carpetas personalizadas con iconos y colores vibrantes desde la barra lateral.</li><li><strong>⭐ Favoritos y Pestañas:</strong> Fija tus notas más importantes y trabaja en múltiples documentos simultáneamente mediante pestañas.</li><li><strong>⚡ Atajo global de ventana:</strong> Muestra u oculta CyberNotes desde cualquier aplicación con el atajo de teclado personalizable (por defecto <code>Alt+Shift+N</code>).</li><li><strong>🗺️ Minimapa de navegación:</strong> Visualiza la estructura completa de tu documento para desplazarte ágilmente en notas extensas.</li><li><strong>🔒 Seguridad y Bloqueo:</strong> Protege tus notas con contraseña maestra (cifrado bcrypt), bloqueo automático por inactividad y escudo de privacidad al minimizar.</li><li><strong>⇪ Auto-desbloqueo de Mayúsculas:</strong> Sistema inteligente que desactiva el Bloq Mayús tras inactividad para evitar errores de tipeo accidentales.</li></ul><h2>💡 Atajos de teclado clave</h2><ul><li><code>Ctrl + N</code>: Crear una nueva nota al instante.</li><li><code>Ctrl + F</code>: Búsqueda instantánea de texto completo en todas las notas.</li><li><code>Ctrl + B</code> / <code>Ctrl + I</code> / <code>Ctrl + U</code>: Formato rápido en negrita, cursiva o subrayado.</li><li><code>Ctrl + P</code>: Imprimir o exportar la nota actual a PDF.</li><li><code>Alt + Shift + N</code>: Invocar u ocultar CyberNotes desde cualquier lugar de Windows.</li></ul><blockquote><p><em>"Tus ideas, notas y código organizados a la velocidad de la luz."</em> (CyberGems Suite)</p></blockquote>`
    : `<h1>👋 Welcome to CyberNotes!</h1><p><strong>CyberNotes</strong> is your fast, modern, cyberpunk-styled note-taking desktop application. Everything you write is stored locally on your machine with complete privacy, powered by <strong>SQL.js (SQLite WASM)</strong>: your notes never leave your device.</p><h2>✨ Key Features</h2><ul><li><strong>📁 Folders &amp; Colors:</strong> Organize your notes into custom folders with vibrant icons and colors from the sidebar.</li><li><strong>⭐ Favorites &amp; Multi-Tabs:</strong> Pin important notes and work with multiple open documents at once using tabs.</li><li><strong>⚡ Global Window Shortcut:</strong> Quickly summon or hide CyberNotes from anywhere with the customizable hotkey (default: <code>Alt+Shift+N</code>).</li><li><strong>🗺️ Document Minimap:</strong> View a real-time overview of your document to navigate long notes seamlessly.</li><li><strong>🔒 Privacy &amp; Lock:</strong> Protect your notes with master password bcrypt encryption, auto-lock timer, and privacy shield on minimize.</li><li><strong>⇪ Auto-Unlock Caps Lock:</strong> Intelligent system that releases Caps Lock after typing inactivity to prevent unintended uppercase text.</li></ul><h2>💡 Essential Keyboard Shortcuts</h2><ul><li><code>Ctrl + N</code>: Create a new note instantly.</li><li><code>Ctrl + F</code>: Search across all your notes in real time.</li><li><code>Ctrl + B</code> / <code>Ctrl + I</code> / <code>Ctrl + U</code>: Quick bold, italic, or underline formatting.</li><li><code>Ctrl + P</code>: Print or export the current note to PDF.</li><li><code>Alt + Shift + N</code>: Summon or hide CyberNotes from anywhere on Windows.</li></ul><blockquote><p><em>"Your thoughts, notes, and code organized at the speed of light."</em> (CyberGems Suite)</p></blockquote>`;

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

  // 5. Abrir pestañas iniciales y seleccionar la nota principal
  runQuery(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, ['open_note_ids', JSON.stringify([welcomeId, suiteId])]);
  runQuery(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, ['last_note_id', welcomeId]);
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

function purgeOldTrash(): void {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const expired = queryAll('SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?', [cutoff]);
  if (expired.length === 0) return;

  const ops = expired.flatMap((row: any) => [
    { sql: 'DELETE FROM sticky_notes WHERE note_id = ?', params: [row.id] },
    { sql: 'DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL', params: [row.id] },
  ]);
  runQueryBatch(ops);
  console.log(`[CyberNotes] Purged ${expired.length} expired trash note(s)`);
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
const STICKY_DEFAULT_WIDTH = 320;
const STICKY_DEFAULT_HEIGHT = 360;
const STICKY_MAX_WIDTH = 720;
const STICKY_MAX_HEIGHT = 640;

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
  let width = (row && typeof row.width === 'number' && row.width >= 240) ? row.width : STICKY_DEFAULT_WIDTH;
  let height = (row && typeof row.height === 'number' && row.height >= 200) ? row.height : STICKY_DEFAULT_HEIGHT;
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
  const maxWidth = Math.min(STICKY_MAX_WIDTH, Math.max(240, wa.width - 32));
  const maxHeight = Math.min(STICKY_MAX_HEIGHT, Math.max(200, wa.height - 32));
  width = Math.min(width, maxWidth);
  height = Math.min(height, maxHeight);

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

  const win = new BrowserWindow({
    width,
    height,
    x: winX,
    y: winY,
    minWidth: 240,
    minHeight: 200,
    maxWidth,
    maxHeight,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
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
    const b = win.getBounds();
    runQuery(
      `UPDATE sticky_notes SET x = ?, y = ?, width = ?, height = ? WHERE note_id = ?`,
      [b.x, b.y, b.width, b.height, noteId],
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
    win.show();
    notifyStickyListChanged();
    updateTrayMenu();
  };

  // Reveal as soon as the document is available. ready-to-show can wait for
  // the renderer's first fully painted frame, which makes creation feel slow.
  win.webContents.once('dom-ready', revealStickyWindow);
  win.once('ready-to-show', revealStickyWindow);

  if (isDev) {
    win.loadURL(`http://localhost:5173/?sticky=${encodeURIComponent(noteId)}`);
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

function toggleStickyAlwaysOnTop(noteId: string): boolean {
  const win = stickyWindows.get(noteId);
  if (!win || win.isDestroyed()) return false;
  const nextVal = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(nextVal, nextVal ? 'floating' : 'normal');
  runQuery('UPDATE sticky_notes SET pinned_top = ? WHERE note_id = ?', [nextVal ? 1 : 0, noteId]);
  return nextVal;
}

function getStickyConfig(noteId: string) {
  const row = queryGet('SELECT color, opacity, pinned_top FROM sticky_notes WHERE note_id = ?', [noteId]);
  return {
    color: row?.color || 'cyber-yellow',
    opacity: typeof row?.opacity === 'number' ? row.opacity : 0.9,
    pinned_top: row ? row.pinned_top !== 0 : true,
  };
}

function saveStickyConfig(noteId: string, config: { color?: string; opacity?: number; pinned_top?: boolean }) {
  const current = getStickyConfig(noteId);
  const color = config.color !== undefined ? config.color : current.color;
  const opacity = config.opacity !== undefined ? config.opacity : current.opacity;
  const pinnedTop = config.pinned_top !== undefined ? (config.pinned_top ? 1 : 0) : (current.pinned_top ? 1 : 0);

  runQuery(
    `INSERT INTO sticky_notes (note_id, color, opacity, pinned_top, is_open)
     VALUES (?, ?, ?, ?, 1)
     ON CONFLICT(note_id) DO UPDATE SET color = excluded.color, opacity = excluded.opacity, pinned_top = excluded.pinned_top`,
    [noteId, color, opacity, pinnedTop]
  );

  const win = stickyWindows.get(noteId);
  if (win && !win.isDestroyed()) {
    if (config.pinned_top !== undefined) {
      win.setAlwaysOnTop(config.pinned_top, config.pinned_top ? 'floating' : 'normal');
    }
    win.webContents.send('sticky:config-updated', { color, opacity, pinned_top: pinnedTop !== 0 });
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
  stickyWindows.forEach((win) => {
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
  const isEs = langVal?.value === 'es';
  const newId = uuidv4();
  const now = new Date().toISOString();
  const defaultTitle = isEs ? 'Nota adhesiva' : 'Sticky note';

  runQuery(
    'INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId, null, defaultTitle, '', '', '', 0, now, now]
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
    visible,
    canLock,
    stickyCount,
    anyStickyVisible,
    showLabel: visible ? (isEs ? 'Ocultar CyberNotes' : 'Hide CyberNotes') : (isEs ? 'Abrir CyberNotes' : 'Open CyberNotes'),
    newStickyLabel: isEs ? 'Nueva nota adhesiva' : 'New sticky note',
    toggleStickyLabel: anyStickyVisible
      ? (isEs ? 'Ocultar notas adhesivas' : 'Mostrar notas adhesivas')
      : (isEs ? 'Mostrar notas adhesivas' : 'Ocultar notas adhesivas'),
    lockLabel: isEs ? 'Bloquear' : 'Lock',
    settingsLabel: isEs ? 'Configuración' : 'Settings',
    aboutLabel: isEs ? 'Acerca de...' : 'About...',
    exitLabel: isEs ? 'Salir' : 'Exit',
    shortcut: activeHotkey,
    help: {
      label: isEs ? 'Ayuda' : 'Help',
      backLabel: isEs ? 'Volver' : 'Back',
      setPasswordLabel: hasPwd
        ? (isEs ? 'Cambiar contraseña...' : 'Change password...')
        : (isEs ? 'Configurar contraseña...' : 'Set password...'),
      pinLabel: isEs ? 'Mantener visible en la bandeja del sistema' : 'Keep visible in the system tray',
      docsLabel: isEs ? 'Documentación / Wiki' : 'Documentation / Wiki',
      faqLabel: isEs ? 'Preguntas frecuentes' : 'FAQ',
      changelogLabel: isEs ? 'Registro de cambios' : 'Changelog',
      websiteLabel: isEs ? 'Sitio web' : 'Website',
      donateLabel: isEs ? 'Donar' : 'Donate',
      aboutLabel: isEs ? 'Acerca de...' : 'About...',
      updatesLabel: isEs ? 'Buscar actualizaciones' : 'Check for updates',
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
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('open-about');
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

ipcMain.handle('auth:setPassword', async (_e: any, password: string) => {
  const hash = await bcrypt.hash(password, 10);
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['password_hash', hash]);
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
  handleSessionUnlocked();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setting-changed', { key: 'password_hash', value: 'removed' });
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

ipcMain.handle('notes:save', (_e: any, note: any) => {
  const thumb = typeof note.thumb === 'string' ? note.thumb : '';
  const exists = queryGet('SELECT id, deleted_at FROM notes WHERE id = ?', [note.id]);
  if (exists?.deleted_at) return note;
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

ipcMain.handle('notes:delete', (_e: any, id: string) => {
  const deletedAt = new Date().toISOString();
  const active = queryGet('SELECT id FROM notes WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!active) return false;
  runQueryBatch([
    { sql: 'UPDATE notes SET deleted_at = ? WHERE id = ?', params: [deletedAt, id] },
    { sql: 'UPDATE sticky_notes SET is_open = 0 WHERE note_id = ?', params: [id] },
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
    { sql: 'DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL', params: [id] },
  ]);
  return true;
});

ipcMain.handle('notes:emptyTrash', () => {
  const row = queryGet('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NOT NULL');
  runQueryBatch([
    { sql: 'DELETE FROM sticky_notes WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL)' },
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
ipcMain.on('sticky:move', (_e: any, noteId: string, x: number, y: number) => {
  const win = stickyWindows.get(noteId);
  if (!win || win.isDestroyed() || !Number.isFinite(x) || !Number.isFinite(y)) return;
  // Keep the dimensions owned by the native window. Reapplying them here
  // avoids Chromium/Electron changing the transparent window size mid-drag.
  const current = win.getBounds();
  win.setBounds({
    x: Math.round(x),
    y: Math.round(y),
    width: current.width,
    height: current.height,
  }, false);
});
ipcMain.handle('sticky:getOpenList', () => Array.from(stickyWindows.keys()));
ipcMain.handle('sticky:focusMain', (_e: any, noteId: string) => focusMainWindowWithNote(noteId));
ipcMain.handle('sticky:toggleAll', (_e: any, show?: boolean) => toggleAllStickyNotes(show));
ipcMain.handle('sticky:createAndOpen', (event) => createAndOpenStickyNote(event.sender === mainWindow?.webContents));

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
        sql: 'INSERT OR REPLACE INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [n.id, n.folder_id, n.title, n.content, n.preview, n.thumb || '', n.pinned, n.created_at, n.updated_at, n.deleted_at || null],
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
