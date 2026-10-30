import { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, session, screen, clipboard, nativeImage, net, globalShortcut } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { exec, spawn } from 'child_process';
import { initUpdater, setAutoUpdate } from './updater';
import { initLogger, writeLog, logRendererError } from './logger';
import { STICKY_BACKGROUNDS, STICKY_COLOR_IDS, asStickyColorId, normalizeStickyOpacity } from '../shared/sticky';
import { extractThumbFromContent } from '../shared/notes';
import { isSpanish } from '../shared/lang';
import { getThemeVars, normalizeThemeId } from '../src/themes';
import { parseBackupHours, parseBackupKeep, isBackupDue, backupEntryName, isBackupEntry, isBackupFile, selectBackupsToPrune } from '../shared/backup';
import { DATA_FOLDER_NAME, LEGACY_DATA_FOLDER_NAME, DATA_MIGRATION_MARKER, isPristineSeedProfile, buildFileUrlRewrite } from '../shared/dataFolder';
import { fitWindowToWorkArea, isVisiblyMaximized, needsPlacementCorrection } from './windowState';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// ─── Nombre de la aplicación (carpeta de datos en AppData) ────────────────
// El directorio userData se deriva del nombre de la app. package.json ya
// declara name/productName = "CyberNotes", pero lo fijamos aquí de forma
// explícita para que la carpeta de datos no dependa de cómo empaquete el
// builder ni de qué campo lea cada versión de Electron.
app.setName('CyberNotes');

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
// Gancho de pruebas/CI: redirige el perfil completo (BD, imágenes, backups)
// para correr la app aislada del perfil real. También permite fumar la app
// junto a una instalación de producción sin pelear por el single-instance.
if (process.env.CYBERNOTES_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.CYBERNOTES_USER_DATA_DIR));
}
const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'cybernotes.db');
const imagesPath = path.join(userDataPath, 'images');
const DEFAULT_BACKUPS_DIR = path.join(userDataPath, 'backups');

// ─── Migración de la carpeta de datos (cyber-notes → CyberNotes) ──────────
// El directorio userData venía del package.json#name = "cyber-notes". Al
// cambiarlo a "CyberNotes" la carpeta antigua queda huérfana; su contenido se
// traslada a la nueva para que los usuarios conserven notas, imágenes y
// respaldos. Se ejecuta una vez por perfil: si el destino ya tiene datos de
// usuario no se toca nada, y si solo tiene contenido demo recién sembrado
// (arranque previo con la migración fallida) es descartado y reemplazado.
// La carpeta antigua nunca se borra: queda como respaldo si algo falla.

/** Mueve una carpeta; si está en uso (app vieja abierta), la copia. */
function moveOrCopyDir(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  try {
    if (!fs.existsSync(dest)) {
      fs.renameSync(src, dest);
      return;
    }
    // Destino existente y vacío: renombrar encima es seguro e instantáneo.
    if (fs.readdirSync(dest).length === 0) {
      fs.rmdirSync(dest);
      fs.renameSync(src, dest);
      return;
    }
  } catch { /* en uso o multi-volumen: copiar */ }
  fs.cpSync(src, dest, { recursive: true, force: true });
}

function copyDirMerge(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  try {
    fs.cpSync(src, dest, { recursive: true, force: true });
  } catch { /* la continuidad de estos archivos no es crítica */ }
}

/** Snapshot consistente de la BD legacy (tolera la app antigua abierta en WAL). */
async function backupLegacyDatabase(legacyDb: string, targetDb: string): Promise<void> {
  const Database = require('better-sqlite3');
  let src: any = null;
  try {
    src = new Database(legacyDb);
    src.pragma('busy_timeout = 5000');
    await src.backup(targetDb);
    return;
  } catch (err) {
    writeLog('warn', `[migration] db.backup() falló, se copia el archivo directamente: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    try { src?.close(); } catch { /* ignore */ }
  }
  // Último recurso: copia directa de db+wal+shm (unidad de un solo bloque).
  for (const suffix of ['', '-wal', '-shm']) {
    const from = legacyDb + suffix;
    if (fs.existsSync(from)) fs.copyFileSync(from, targetDb + suffix);
  }
}

/** Reescribe las URLs file:/// que apuntaban a la carpeta antigua. */
function rewriteLegacyFileUrls(legacyDir: string): void {
  const { from, to } = buildFileUrlRewrite(legacyDir, userDataPath);
  const targets: Array<[string, string]> = [
    ['notes', 'content'],
    ['notes', 'thumb'],
    ['note_revisions', 'content'],
    ['note_drafts', 'content'],
  ];
  const Database = require('better-sqlite3');
  const migratedDb = new Database(dbPath);
  try {
    migratedDb.pragma('busy_timeout = 5000');
    let rows = 0;
    for (const [table, col] of targets) {
      const row = migratedDb.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${col} LIKE ?`).get(`%${from}%`);
      if (!row?.c) continue;
      migratedDb.prepare(`UPDATE ${table} SET ${col} = REPLACE(${col}, ?, ?) WHERE ${col} LIKE ?`).run(from, to, `%${from}%`);
      rows += row.c;
    }
    // Respaldo personalizado apuntando a la carpeta vieja: vuelve al default.
    const legacyBackupsPosix = path.join(legacyDir, 'backups').replace(/\\/g, '/').toLowerCase();
    migratedDb.prepare("DELETE FROM settings WHERE key = 'backup_folder' AND LOWER(REPLACE(value, '\\', '/')) = ?").run(legacyBackupsPosix);
    if (rows > 0) {
      writeLog('info', `[migration] Reescritas ${rows} fila(s) con URLs de la carpeta antigua`);
    }
  } finally {
    migratedDb.close();
  }
}

async function migrateLegacyDataFolder(): Promise<void> {
  // Solo aplica con el perfil predeterminado: con CYBERNOTES_USER_DATA_DIR
  // (pruebas/CI) la ruta vieja sería la del usuario real y no se toca.
  if (process.env.CYBERNOTES_USER_DATA_DIR) return;
  if (userDataPath !== path.join(app.getPath('appData'), DATA_FOLDER_NAME)) return;
  const legacyDir = path.join(app.getPath('appData'), LEGACY_DATA_FOLDER_NAME);
  if (!fs.existsSync(legacyDir) || fs.existsSync(path.join(userDataPath, DATA_MIGRATION_MARKER))) return;
  const legacyDb = path.join(legacyDir, 'cybernotes.db');
  if (!fs.existsSync(legacyDb)) return;

  try {
    // El destino puede existir vacío (renombre fallido en un arranque previo)
    // o con contenido demo recién sembrado. En ambos casos los datos reales
    // están en la carpeta legacy y deben ganar; si el destino ya guarda notas
    // de usuario, no se toca nada y se avisa dónde quedó la carpeta antigua.
    let replaceTarget = false;
    if (fs.existsSync(dbPath)) {
      const Database = require('better-sqlite3');
      let probe: any = null;
      try {
        probe = new Database(dbPath);
        const ids: string[] = probe.prepare('SELECT id FROM notes').all().map((r: any) => r.id);
        replaceTarget = isPristineSeedProfile(ids);
      } catch (probeErr) {
        // BD ilegible en destino: no se arriesga nada; el aviso queda en el log.
        writeLog('warn', `[migration] No se pudo leer el perfil destino para decidir la migración: ${probeErr instanceof Error ? probeErr.message : String(probeErr)}`);
      } finally {
        try { probe?.close(); } catch { /* ignore */ }
      }
      if (!replaceTarget) {
        writeLog('warn', `[migration] ${LEGACY_DATA_FOLDER_NAME} tiene datos pero ${DATA_FOLDER_NAME} ya guarda un perfil con notas; nada se movió. Carpeta antigua conservada en: ${legacyDir}`);
        return;
      }
    }

    if (replaceTarget) {
      // Perfil demo: descartar su BD y sus imágenes/respaldos vacíos para
      // que la migración entre en una carpeta limpia.
      for (const suffix of ['', '-wal', '-shm']) {
        try { fs.rmSync(dbPath + suffix, { force: true }); } catch { /* ignore */ }
      }
      try { fs.rmSync(imagesPath, { recursive: true, force: true }); } catch { /* ignore */ }
      try { fs.rmSync(DEFAULT_BACKUPS_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
    }

    // Imágenes y respaldos: renombrar (instantáneo, mismo volumen) y, si la
    // carpeta está en uso, copiar. Logs y diccionarios: solo continuidad.
    moveOrCopyDir(path.join(legacyDir, 'images'), imagesPath);
    moveOrCopyDir(path.join(legacyDir, 'backups'), DEFAULT_BACKUPS_DIR);
    copyDirMerge(path.join(legacyDir, 'logs'), path.join(userDataPath, 'logs'));
    copyDirMerge(path.join(legacyDir, 'Dictionaries'), path.join(userDataPath, 'Dictionaries'));
    for (const name of ['.updaterId', 'Custom Dictionary.txt', 'Custom Dictionary.txt.backup']) {
      const src = path.join(legacyDir, name);
      const dest = path.join(userDataPath, name);
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        try { fs.copyFileSync(src, dest); } catch { /* ignore */ }
      }
    }

    await backupLegacyDatabase(legacyDb, dbPath);
    rewriteLegacyFileUrls(legacyDir);
    fs.writeFileSync(path.join(userDataPath, DATA_MIGRATION_MARKER), new Date().toISOString());
    writeLog('info', `[migration] Datos migrados de ${legacyDir} a ${userDataPath}`);
  } catch (err) {
    // La migración jamás impide el arranque: si falla, el perfil nuevo queda
    // como esté y los datos siguen intactos en la carpeta antigua.
    writeLog('error', `[migration] Falló la migración de datos: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  }
}

/**
 * Carpeta destino de los respaldos automáticos. Por defecto userData/backups,
 * personalizable con el ajuste backup_folder (ruta absoluta). Se lee en cada
 * uso: cambiar el ajuste en Ajustes aplica al siguiente respaldo sin reinicio.
 */
function getBackupsDir(): string {
  try {
    const row = queryGet("SELECT value FROM settings WHERE key = 'backup_folder'");
    const custom = typeof row?.value === 'string' ? row.value.trim() : '';
    if (custom && path.isAbsolute(custom)) return custom;
  } catch {
    /* BD no lista (arranque temprano): usar el default */
  }
  return DEFAULT_BACKUPS_DIR;
}
initLogger(userDataPath);

// ─── uuid ─────────────────────────────────────────────────────────────────
const { v4: uuidv4 } = require('uuid');

// ─── SQLite (better-sqlite3, archivo nativo con WAL) ─────────────────────
// Persistencia incremental: cada transacción escribe solo las páginas sucias
// al archivo. Sustituye a sql.js, que re-serializaba la base completa en cada
// guardado y bloqueaba el proceso principal mientras trabajaba el editor.
let db: any = null;

/** Columnas ligeras para listados (sin content HTML completo). */
const NOTE_META_COLS = 'id, folder_id, title, preview, thumb, pinned, created_at, updated_at, deleted_at';
const TRASH_RETENTION_DAYS = 30;

function ensureColumn(table: string, column: string, typeSql: string) {
  const cols = queryAll(`PRAGMA table_info(${table})`);
  if (!cols.some((c: any) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeSql}`);
  }
}

// ─── Migración única: imágenes base64 → archivos en images/ ──────────────
// El HTML de notas y revisiones podía incrustar imágenes como data:URL
// base64 (pegado directo en el editor). Eso inflaba la base: cada imagen se
// duplicaba en cada snapshot de revisión. Esta pasada extrae cada imagen a
// images/ (deduplicada por hash SHA-1 del binario) y deja solo la URL file:.
const BASE64_IMAGE_RE = /data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g;

function sniffImageExt(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  const head = buf.slice(0, 200).toString('utf8').trim().toLowerCase();
  if (head.startsWith('<svg') || head.startsWith('<?xml')) return 'svg';
  return null;
}

function migrateBase64ImagesToFiles(): void {
  if (!db) return;
  const flag = queryGet("SELECT value FROM settings WHERE key = 'base64_images_migrated'");
  if (flag?.value === 'true') return;
  if (!fs.existsSync(imagesPath)) fs.mkdirSync(imagesPath, { recursive: true });

  const fileUrlFor = new Map<string, string>();
  const REJECTED = '\u0000rejected';
  let filesWritten = 0;

  const toFileUrl = (dataUrl: string): string | null => {
    const cached = fileUrlFor.get(dataUrl);
    if (cached !== undefined) return cached === REJECTED ? null : cached;
    const m = /^data:image\/([a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
    if (!m) {
      fileUrlFor.set(dataUrl, REJECTED);
      return null;
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(m[2], 'base64');
    } catch {
      fileUrlFor.set(dataUrl, REJECTED);
      return null;
    }
    const ext = sniffImageExt(buf);
    if (!ext || buf.length === 0 || buf.length > IMAGE_MAX_BYTES) {
      fileUrlFor.set(dataUrl, REJECTED);
      return null;
    }
    const hash = crypto.createHash('sha1').update(buf).digest('hex');
    const dest = path.join(imagesPath, `${hash}.${ext}`);
    if (!fs.existsSync(dest)) {
      fs.writeFileSync(dest, buf);
      filesWritten++;
    }
    const url = `file:///${dest.replace(/\\/g, '/')}`;
    fileUrlFor.set(dataUrl, url);
    return url;
  };

  const migrateColumn = (table: string, pkCol: string, col: string): number => {
    const rows = queryAll(`SELECT ${pkCol} AS pk, ${col} AS val FROM ${table} WHERE ${col} LIKE '%data:image/%'`);
    const updates: Array<{ pk: any; next: string }> = [];
    for (const row of rows) {
      const val: string = row.val ?? '';
      if (!val.includes('data:image/')) continue;
      const next = val.replace(BASE64_IMAGE_RE, (full: string) => toFileUrl(full) ?? full);
      if (next !== val) updates.push({ pk: row.pk, next });
    }
    if (updates.length > 0) {
      const tx = db.transaction((batch: Array<{ pk: any; next: string }>) => {
        for (const u of batch) {
          db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${pkCol} = ?`).run(u.next, u.pk);
        }
      });
      tx(updates);
    }
    return updates.length;
  };

  const notesUpdated = migrateColumn('notes', 'id', 'content');
  const notesThumbs = migrateColumn('notes', 'id', 'thumb');
  const revisionsUpdated = migrateColumn('note_revisions', 'id', 'content');
  const draftsUpdated = migrateColumn('note_drafts', 'note_id', 'content');

  runQuery("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ['base64_images_migrated', 'true']);
  if (notesUpdated + notesThumbs + revisionsUpdated + draftsUpdated > 0) {
    // Reclama el espacio liberado por los blobs embebidos (una sola vez).
    db.exec('VACUUM');
  }
  writeLog('info', `[images] base64 migration: notes=${notesUpdated} thumbs=${notesThumbs} revisions=${revisionsUpdated} drafts=${draftsUpdated}, files=${filesWritten}`);
}

async function initDatabase() {
  // better-sqlite3 abre (o crea) el archivo directamente; el esquema y las
  // migraciones de columnas se ejecutan igual que antes.
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  // NORMAL en WAL: durable ante caída de la app; el único riesgo de pérdida
  // es un corte de luz en el preciso instante de un checkpoint (aceptable,
  // el auto-backup cubre el resto).
  db.pragma('synchronous = NORMAL');
  db.pragma('busy_timeout = 3000');
  db.pragma('cache_size = -8000');

  // Crear tablas si no existen
  db.exec(`
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

    CREATE TABLE IF NOT EXISTS note_revisions (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id    TEXT NOT NULL,
      title      TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_note_revisions_note ON note_revisions (note_id, id DESC);

    CREATE TABLE IF NOT EXISTS access_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      event      TEXT NOT NULL,
      detail     TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_access_log_created ON access_log (created_at DESC);
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

  // Migración única: imágenes base64 embebidas → archivos en images/
  try {
    migrateBase64ImagesToFiles();
  } catch (err) {
    writeLog('error', `base64 image migration failed: ${err instanceof Error ? err.message : String(err)}`);
  }

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
    db.prepare('UPDATE notes SET thumb = ? WHERE id = ?').run(thumb, row.id);
    updated++;
  }
  if (updated > 0) {
    console.log(`[CyberNotes] Backfilled thumbs for ${updated} note(s)`);
  }
}

// ─── Helper: query → array de objetos ─────────────────────────────────────
// Caché de prepared statements: better-sqlite3 reutiliza el compilado, lo que
// abarata los handlers calientes (settings, autosave, drafts).
const stmtCache = new Map<string, any>();
function cachedStmt(sql: string): any {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = db.prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

function queryAll(sql: string, params: any[] = []): any[] {
  if (!db) throw new Error('Base de datos no inicializada');
  return cachedStmt(sql).all(...params);
}

function queryGet(sql: string, params: any[] = []): any | null {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

/** Ejecuta SQL en el archivo (WAL persiste automáticamente; no hay flush manual). */
function runQuery(sql: string, params: any[] = []) {
  if (!db) throw new Error('Base de datos no inicializada');
  cachedStmt(sql).run(...params);
}

/** Varias mutaciones en una sola transacción atómica. */
const runQueryBatchTx = (ops: Array<{ sql: string; params?: any[] }>) => {
  for (const op of ops) {
    cachedStmt(op.sql).run(...(op.params ?? []));
  }
};
function runQueryBatch(ops: Array<{ sql: string; params?: any[] }>) {
  if (!db) throw new Error('Base de datos no inicializada');
  db.transaction(runQueryBatchTx)(ops);
}

function purgeOldTrash(): void {
  const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const expired = queryAll('SELECT id FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < ?', [cutoff]);
  if (expired.length === 0) return;

  const ops = expired.flatMap((row: any) => [
    { sql: 'DELETE FROM sticky_notes WHERE note_id = ?', params: [row.id] },
    { sql: 'DELETE FROM note_drafts WHERE note_id = ?', params: [row.id] },
    { sql: 'DELETE FROM note_revisions WHERE note_id = ?', params: [row.id] },
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

function recordUnlock(): void {
  try {
    if (!db || !isUsageStatsEnabled()) return;
    const row = queryGet('SELECT value FROM settings WHERE key = ?', ['unlock_count']);
    const next = (row ? parseInt(row.value, 10) : 0) || 0;
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['unlock_count', String(next + 1)]);
  } catch {
    /* nunca romper el desbloqueo por estadísticas */
  }
}

// ─── Registro de accesos (mínimo: últimos 50 eventos de bloqueo) ────────────
// Desbloqueos OK/fallidos, bloqueos automáticos y cambios de clave. Solo
// metadatos (sin secretos); un fallo de log jamás rompe el flujo de auth.
const ACCESS_LOG_KEEP = 50;

function isAccessLogEnabled(): boolean {
  try {
    if (!db) return true;
    const row = queryGet('SELECT value FROM settings WHERE key = ?', ['access_log_enabled']);
    return !row || row.value !== 'false';
  } catch {
    return true;
  }
}

function recordAccessEvent(event: string, detail = ''): void {
  try {
    if (!db || !isAccessLogEnabled()) return;
    runQuery('INSERT INTO access_log (event, detail, created_at) VALUES (?, ?, ?)', [
      event,
      detail.slice(0, 120),
      new Date().toISOString(),
    ]);
    runQuery('DELETE FROM access_log WHERE id NOT IN (SELECT id FROM access_log ORDER BY id DESC LIMIT ?)', [
      ACCESS_LOG_KEEP,
    ]);
  } catch {
    /* logging must never break auth */
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
  let newWeek = 0;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const n of notes) {
    const w = stripHtmlToWords(n.content).length;
    words += w;
    const imgs = typeof n.content === 'string' ? n.content.match(/<img\b/gi) : null;
    if (imgs) images += imgs.length;
    if (Number(n.pinned) === 1) favorites++;
    const created = Date.parse(n.created_at);
    if (Number.isFinite(created) && created >= weekAgo) newWeek++;
  }
  const folderRows = queryAll('SELECT COUNT(*) as count FROM folders') as { count: number }[];
  const unlockRow = queryGet('SELECT value FROM settings WHERE key = ?', ['unlock_count']);
  const createdRow = queryGet('SELECT value FROM settings WHERE key = ?', ['notes_created_total']);
  const stickiesRow = queryGet('SELECT value FROM settings WHERE key = ?', ['stickies_created_total']);

  return {
    firstOpen: days.length > 0 ? days[0] : null,
    totalOpens,
    activeDays: days.length,
    currentStreak,
    longestStreak,
    totalUnlocks: unlockRow ? Number(unlockRow.value) || 0 : 0,
    createdTotal: createdRow ? Number(createdRow.value) || 0 : 0,
    stickiesTotal: stickiesRow ? Number(stickiesRow.value) || 0 : 0,
    avgWords: notes.length > 0 ? Math.round((words / notes.length) * 10) / 10 : 0,
    newWeek,
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
    recordAccessEvent('auto_lock');
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

async function runAutoBackup(reason: 'schedule' | 'startup' | 'manual'): Promise<{ ok: boolean; file?: string }> {
  if (autoBackupRunning) return { ok: false };
  if (!db) return { ok: false };
  autoBackupRunning = true;
  // Respaldo unificado: un archivo JSON v2 autocontenido (notas, carpetas,
  // uso e imágenes embebidas). Mismo formato que el export manual: portable
  // entre equipos y restaurable desde Ajustes.
  let dest: string | null = null;
  try {
    const backupsDir = getBackupsDir();
    fs.mkdirSync(backupsDir, { recursive: true });
    const baseName = `${backupEntryName(new Date())}.json`;
    // Dos respaldos en el mismo segundo: sufijo -2, -3, ... en vez de fallar.
    for (let attempt = 1; attempt < 100; attempt++) {
      const candidate = path.join(backupsDir, attempt === 1 ? baseName : `${backupEntryName(new Date())}-${attempt}.json`);
      if (fs.existsSync(candidate)) continue;
      dest = candidate;
      break;
    }
    if (!dest) throw new Error('no usable backup file name');
    // Escritura en dos pasos: nunca dejar un .json a medias tras un fallo.
    const tmpDest = path.join(backupsDir, `.${path.basename(dest)}.part`);
    fs.writeFileSync(tmpDest, JSON.stringify(buildExportPayload(), null, 2));
    fs.renameSync(tmpDest, dest);

    const keep = getAutoBackupConfig().keep;
    const entries = fs.readdirSync(backupsDir);
    for (const old of selectBackupsToPrune(entries, keep)) {
      try {
        const oldPath = path.join(backupsDir, old);
        if (fs.statSync(oldPath).isDirectory()) {
          fs.rmSync(oldPath, { recursive: true, force: true });
        } else {
          fs.unlinkSync(oldPath);
        }
      } catch {
        /* conserva las demas */
      }
    }

    const now = new Date().toISOString();
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['auto_backup_last', now]);
    const entryName = path.basename(dest);
    writeLog('info', `Auto backup (${reason}) saved as ${entryName}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('backup:completed', { at: now, file: entryName });
    }
    return { ok: true, file: entryName };
  } catch (err) {
    // No dejar respaldos a medio formar (disco lleno, carpeta perdida, etc.).
    if (dest) {
      try { fs.rmSync(dest, { force: true }); } catch { /* ignore */ }
    }
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

function applyStickyWindowChrome(win: BrowserWindow, color?: string, opacity?: number): void {
  if (win.isDestroyed()) return;
  if (color) {
    win.setBackgroundColor(STICKY_BACKGROUNDS[asStickyColorId(color)]);
  }
  if (typeof opacity === 'number' && Number.isFinite(opacity)) {
    win.setOpacity(normalizeStickyOpacity(opacity));
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
      [position.x, position.y, contentWidth, contentHeight, noteId]
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
      [isQuitting ? 1 : 0, noteId]
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

  // Mismo menú contextual del título que la ventana principal: se reenvían
  // los datos (sugerencias de ortografía) al renderer de la flotante. El
  // cuerpo conserva su propio menú (lo pinta el renderer al recibir esto).
  win.webContents.on('context-menu', (event, params) => {
    if (win.isDestroyed()) return;
    event.preventDefault();
    win.webContents.send('context-menu-data', {
      x: params.x,
      y: params.y,
      suggestions: params.dictionarySuggestions,
      misspelledWord: params.misspelledWord,
      linkURL: params.linkURL,
      imageSrc: null,
    });
  });

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
    opacity: normalizeStickyOpacity(readNumericSetting(row?.opacity, 0.9)),
    pinned_top: row ? row.pinned_top !== 0 : true,
    zoom: clampStickyZoom(row?.zoom ?? 1.0),
  };
}

function saveStickyConfig(noteId: string, config: { color?: string; opacity?: number; pinned_top?: boolean; zoom?: number }) {
  const current = getStickyConfig(noteId);
  const color = config.color !== undefined ? config.color : current.color;
  const opacity = normalizeStickyOpacity(config.opacity !== undefined ? config.opacity : current.opacity);
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
let trayMenuShowPending = false;
let trayMenuShowFallback: NodeJS.Timeout | null = null;
let trayMenuRevealTimer: NodeJS.Timeout | null = null;
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

function readAppearanceSettings() {
  const theme = normalizeThemeId(queryGet('SELECT value FROM settings WHERE key = ?', ['theme'])?.value);
  const savedIntensity = Number(queryGet('SELECT value FROM settings WHERE key = ?', ['colorIntensity'])?.value ?? 50);
  const intensity = Number.isFinite(savedIntensity) ? Math.max(0, Math.min(100, savedIntensity)) : 50;
  const language = isSpanish(queryGet('SELECT value FROM settings WHERE key = ?', ['language'])?.value || 'en') ? 'es' : 'en';
  return { theme, vars: getThemeVars(theme, intensity), colorScheme: theme === 'light' ? 'light' as const : 'dark' as const, language };
}

function buildTrayMenuState() {
  const appearance = readAppearanceSettings();
  const isEs = appearance.language === 'es';
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
    theme: appearance.theme,
    themeVars: appearance.vars,
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
      backgroundThrottling: false,
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
  });
  return trayMenuWin;
}

function revealTrayMenuWin() {
  if (!trayMenuWin || trayMenuWin.isDestroyed()) return;
  if (trayMenuShowFallback) { clearTimeout(trayMenuShowFallback); trayMenuShowFallback = null; }
  trayMenuShowPending = false;
  if (!trayMenuWin.isVisible()) {
    try { trayMenuWin.setOpacity(0); } catch { /* ignore */ }
    trayMenuWin.show();
    if (trayMenuRevealTimer) clearTimeout(trayMenuRevealTimer);
    trayMenuRevealTimer = setTimeout(() => {
      trayMenuRevealTimer = null;
      if (trayMenuWin && !trayMenuWin.isDestroyed()) {
        try { trayMenuWin.setOpacity(1); } catch { /* ignore */ }
      }
    }, 40);
  } else {
    try { trayMenuWin.setOpacity(1); } catch { /* ignore */ }
  }
  trayMenuWin.focus();
  trayMenuLastShown = Date.now();
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
  const current = w.getBounds();
  if (current.x !== geo.x || current.y !== geo.y || current.width !== geo.width || current.height !== geo.height) {
    w.setBounds(geo);
  }

  trayMenuShowPending = true;
  if (trayMenuShowFallback) { clearTimeout(trayMenuShowFallback); trayMenuShowFallback = null; }
  trayMenuShowFallback = setTimeout(() => {
    trayMenuShowFallback = null;
    if (trayMenuShowPending) revealTrayMenuWin();
  }, 500);

  if (!w.webContents.isLoading()) {
    w.webContents.send('tray-menu-state', { ...buildTrayMenuState(), resetView: true });
  }
}

function hideTrayMenu() {
  if (trayMenuHideTimer) { clearTimeout(trayMenuHideTimer); trayMenuHideTimer = null; }
  if (trayMenuShowFallback) { clearTimeout(trayMenuShowFallback); trayMenuShowFallback = null; }
  if (trayMenuRevealTimer) { clearTimeout(trayMenuRevealTimer); trayMenuRevealTimer = null; }
  trayMenuShowPending = false;
  if (trayMenuWin && !trayMenuWin.isDestroyed()) {
    try { trayMenuWin.setOpacity(1); } catch { /* ignore */ }
    if (trayMenuWin.isVisible()) {
      trayMenuWin.hide();
    }
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
    } else if (slug === 'home') {
      void shell.openExternal('https://cybergems.org');
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
  const current = trayMenuWin.getBounds();
  if (current.x !== geo.x || current.y !== geo.y || current.width !== geo.width || current.height !== geo.height) {
    trayMenuWin.setBounds(geo);
  }
  if (trayMenuShowPending) revealTrayMenuWin();
});

const MAIN_WINDOW_MIN_WIDTH = 840;
const MAIN_WINDOW_MIN_HEIGHT = 560;
const MAIN_WINDOW_HORIZONTAL_MARGIN = 48;
const MAIN_WINDOW_VERTICAL_MARGIN = 16;

function getValidWindowBounds(savedBoundsJson: string | null | undefined) {
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
  if (!parsed || typeof parsed !== 'object') parsed = {};

  const width = typeof parsed.width === 'number' && parsed.width >= 320 ? parsed.width : defaultWidth;
  const height = typeof parsed.height === 'number' && parsed.height >= 240 ? parsed.height : defaultHeight;
  const x = typeof parsed.x === 'number' ? parsed.x : undefined;
  const y = typeof parsed.y === 'number' ? parsed.y : undefined;

  const allDisplays = screen.getAllDisplays();
  const savedDisplayId = typeof (parsed as any).displayId === 'number' ? (parsed as any).displayId as number : undefined;

  // Pantalla guardada primero (estable entre DPIs distintos); si ya no
  // existe, la que más solape; si no, la primaria.
  let target = savedDisplayId !== undefined
    ? allDisplays.find((d) => d.id === savedDisplayId)
    : undefined;
  if (!target && x !== undefined && y !== undefined) {
    target = allDisplays.find((d) => {
      const wa = d.workArea;
      return (
        x + 150 > wa.x &&
        x < wa.x + wa.width &&
        y + 40 > wa.y &&
        y < wa.y + wa.height
      );
    });
  }
  if (!target) target = primaryDisplay;

  // El mínimo preferido se reduce si no cabe en el área útil del monitor.
  return fitWindowToWorkArea(
    { width, height },
    target.workArea,
    { width: MAIN_WINDOW_MIN_WIDTH, height: MAIN_WINDOW_MIN_HEIGHT },
    { width: MAIN_WINDOW_HORIZONTAL_MARGIN, height: MAIN_WINDOW_VERTICAL_MARGIN },
  );
}

function createWindow() {
  // Recuperar estado de ventana guardado con validación de pantalla
  const boundsJson = queryGet('SELECT value FROM settings WHERE key = ?', ['window_bounds']);
  const isMaximizedVal = queryGet('SELECT value FROM settings WHERE key = ?', ['is_maximized']);

  const { bounds: winBounds, minimum: winMinimum } = getValidWindowBounds(boundsJson?.value);

  const appearance = readAppearanceSettings();
  mainWindow = new BrowserWindow({
    width: winBounds.width,
    height: winBounds.height,
    x: winBounds.x,
    y: winBounds.y,
    center: false,
    minWidth: winMinimum.width,
    minHeight: winMinimum.height,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: appearance.vars['--loader-edge'],
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
    show: false,
  });

  // On Windows with mixed display scales, BrowserWindow's constructor can
  // enlarge the requested size when placing the window on a secondary display.
  // setBounds uses the correct display scale once the native window exists.
  mainWindow.setBounds(winBounds);

  // Guardar estado al cambiar (debounce: evitar N flushes durante resize/drag)
  let windowStateTimer: ReturnType<typeof setTimeout> | null = null;
  let initialPlacementActive = isMaximizedVal?.value !== 'true';
  let placementTimer: ReturnType<typeof setTimeout> | null = null;
  let placementEndTimer: ReturnType<typeof setTimeout> | null = null;
  const correctInitialPlacement = () => {
    if (!initialPlacementActive || !mainWindow || mainWindow.isDestroyed()
      || !mainWindow.isVisible() || mainWindow.isMaximized()) return;
    if (needsPlacementCorrection(mainWindow.getBounds(), winBounds)) {
      mainWindow.setBounds(winBounds);
    }
  };
  const schedulePlacementCorrection = () => {
    if (!initialPlacementActive || placementTimer) return;
    placementTimer = setTimeout(() => {
      placementTimer = null;
      correctInitialPlacement();
    }, 0);
  };
  const saveWindowState = (immediate = false) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const doSave = () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const bounds = mainWindow.getBounds();
      const display = screen.getDisplayMatching(bounds);
      const isMax = isVisiblyMaximized(mainWindow.isMaximized(), bounds, display.workArea);
      const isMin = mainWindow.isMinimized();
      const isFull = mainWindow.isFullScreen();

      if (!isMin) {
        runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['is_maximized', isMax ? 'true' : 'false']);
      }

      if (!isMax && !isMin && !isFull) {
        if (bounds.width >= 320 && bounds.height >= 240) {
          runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['window_bounds', JSON.stringify({ ...bounds, displayId: display.id })]);
        }
      } else {
        try {
          const nb = mainWindow.getNormalBounds();
          if (nb && nb.width >= 320 && nb.height >= 240) {
            const disp = screen.getDisplayMatching(nb);
            runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['window_bounds', JSON.stringify({ ...nb, displayId: disp.id })]);
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

  mainWindow.on('resize', () => { schedulePlacementCorrection(); saveWindowState(false); });
  mainWindow.on('move', () => { schedulePlacementCorrection(); saveWindowState(false); });
  // These events are emitted for manual moves/resizes, not setBounds. Once the
  // user changes the window, its position and size take precedence.
  mainWindow.on('will-move', () => { initialPlacementActive = false; });
  mainWindow.on('will-resize', () => { initialPlacementActive = false; });
  mainWindow.on('close', () => saveWindowState(true));
  mainWindow.on('maximize', () => {
    initialPlacementActive = false;
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
  // Windows can move a restored window again after its first show on a monitor
  // with a different scale. Correct those native move/resize events until the
  // user interacts with the window or startup placement has settled.
  mainWindow.once('show', () => {
    correctInitialPlacement();
    placementEndTimer = setTimeout(() => { initialPlacementActive = false; }, 10_000);
  });
  mainWindow.on('closed', () => {
    if (placementTimer) clearTimeout(placementTimer);
    if (placementEndTimer) clearTimeout(placementEndTimer);
    screen.removeListener('display-metrics-changed', onDisplayMetricsChanged);
    screen.removeListener('display-removed', onDisplayRemoved);
  });

  // A window moved onto a smaller display needs a smaller native minimum too.
  // Otherwise Windows can keep it larger than the destination work area.
  const fitToCurrentDisplay = (repositionIfOutside: boolean) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isMax = mainWindow.isMaximized();
    const isMin = mainWindow.isMinimized();
    const isFull = mainWindow.isFullScreen();
    const current = isMax || isMin || isFull ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    const workArea = screen.getDisplayMatching(current).workArea;
    const fitted = fitWindowToWorkArea(
      current,
      workArea,
      { width: MAIN_WINDOW_MIN_WIDTH, height: MAIN_WINDOW_MIN_HEIGHT },
      { width: MAIN_WINDOW_HORIZONTAL_MARGIN, height: MAIN_WINDOW_VERTICAL_MARGIN },
    );
    const [minWidth, minHeight] = mainWindow.getMinimumSize();
    if (minWidth !== fitted.minimum.width || minHeight !== fitted.minimum.height) {
      mainWindow.setMinimumSize(fitted.minimum.width, fitted.minimum.height);
    }
    if (isMax || isMin || isFull) return;
    const tooLarge = current.width > fitted.bounds.width + 3 || current.height > fitted.bounds.height + 3;
    const outside = current.x < workArea.x || current.y < workArea.y
      || current.x + current.width > workArea.x + workArea.width
      || current.y + current.height > workArea.y + workArea.height;
    if (tooLarge || (repositionIfOutside && outside)) {
      mainWindow.setBounds(fitted.bounds);
    }
  };
  const onDisplayMetricsChanged = () => fitToCurrentDisplay(true);
  const onDisplayRemoved = () => fitToCurrentDisplay(true);
  mainWindow.on('moved', () => fitToCurrentDisplay(false));
  screen.on('display-metrics-changed', onDisplayMetricsChanged);
  screen.on('display-removed', onDisplayRemoved);

  // Manejar cierre (Bandeja de sistema)
  // Primera vez: preguntar qué hacer (estilo CyberPaste) salvo elección recordada.
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      const remembered = queryGet('SELECT value FROM settings WHERE key = ?', ['close_choice_remembered']);
      if (remembered?.value !== 'true') {
        event.preventDefault();
        // Restore window so the user can see the custom dialog
        restoreWindow();
        mainWindow?.webContents.send('confirm-first-close');
        return false;
      }
    }

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
  

  const showOnReady = !process.argv.includes('--hidden');
  if (showOnReady && isMaximizedVal?.value === 'true') {
    // maximize() also shows the native window. Keep it transparent until its
    // first frame is painted at the final size, preserving the normal bounds.
    mainWindow.setOpacity(0);
    mainWindow.maximize();
  }

  mainWindow.once('ready-to-show', () => {
    if (!showOnReady) return;
    mainWindow!.setOpacity(1);
    mainWindow!.show();
    mainWindow!.focus();
  });

  if (isDev) {
    mainWindow.loadURL(getDevRendererUrl());
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
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
ipcMain.handle('replace-misspelling', (e: any, word: string) =>
  // En la ventana que lo pide (principal o flotante), no siempre la principal.
  (e.sender as any)?.replaceMisspelling?.(word));
ipcMain.handle('add-to-dictionary', (_e: any, word: string) => {
  if (typeof word !== 'string') return false;
  const clean = word.trim().slice(0, 100);
  if (!clean) return false;
  session.defaultSession.addWordToSpellCheckerDictionary(clean);
  return true;
});
ipcMain.handle('spell:listWords', async () => {
  try {
    const ses: any = mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.webContents.session
      : session.defaultSession;
    const words: unknown = await ses.listWordsInSpellCheckerDictionary();
    return { ok: true, words: Array.isArray(words) ? words.filter((w): w is string => typeof w === 'string') : [] };
  } catch (err) {
    return { ok: false, words: [], error: String((err as Error)?.message || err) };
  }
});
ipcMain.handle('spell:removeWord', (_e: any, word: string) => {
  try {
    if (typeof word !== 'string') return { ok: false };
    const clean = word.trim().slice(0, 100);
    if (!clean) return { ok: false };
    const ses: any = mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.webContents.session
      : session.defaultSession;
    ses.removeWordFromSpellCheckerDictionary(clean);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
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

function sendSyntheticLockKey(key: 'CAPSLOCK' | 'NUMLOCK'): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false);
  return new Promise((resolve) => {
    const psScript = `Add-Type -AssemblyName System.Windows.Forms; (New-Object -ComObject WScript.Shell).SendKeys('{${key}}'); Write-Host 'sent'`;
    exec(`powershell -Command "${psScript}"`, (err, stdout) => {
      if (err) {
        console.error(`Failed to send synthetic ${key} key:`, err);
        resolve(false);
      } else {
        resolve(stdout.trim() === 'sent');
      }
    });
  });
}

ipcMain.handle('toggle-caps-lock', () => sendSyntheticLockKey('CAPSLOCK'));
ipcMain.handle('toggle-num-lock', () => sendSyntheticLockKey('NUMLOCK'));

// ─── Corrector ortográfico (diccionarios) ────────────────────────────────
// Chromium expone los diccionarios disponibles; la app permite varios a la
// vez (ideal bilingüe) más un interruptor maestro. Todo 100% local.
const SPELL_DEFAULT_LANGS = ['es-ES', 'en-US'];

function getAvailableSpellLangs(): string[] {
  try {
    const ses: any = mainWindow && !mainWindow.isDestroyed()
      ? mainWindow.webContents.session
      : session.defaultSession;
    const list: unknown = ses.availableSpellCheckerLanguages;
    if (Array.isArray(list)) {
      const clean = list.filter((c): c is string => typeof c === 'string' && c.length >= 2 && c.length <= 12);
      if (clean.length > 0) return clean;
    }
  } catch {
    /* sin lista: respaldo curado */
  }
  return [...SPELL_DEFAULT_LANGS];
}

function readSpellState(): { available: string[]; enabled: boolean; languages: string[] } {
  const available = getAvailableSpellLangs();
  const enabledRow = queryGet('SELECT value FROM settings WHERE key = ?', ['spellcheck_enabled']);
  const enabled = !enabledRow || enabledRow.value !== 'false';
  const langsRow = queryGet('SELECT value FROM settings WHERE key = ?', ['spellcheck_languages']);
  let languages: string[] = [...SPELL_DEFAULT_LANGS];
  if (langsRow) {
    try {
      const parsed: unknown = JSON.parse(langsRow.value);
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((c): c is string => typeof c === 'string' && available.includes(c));
        if (valid.length > 0) languages = [...new Set(valid)];
      }
    } catch {
      /* JSON corrupto: defaults */
    }
  } else {
    languages = SPELL_DEFAULT_LANGS.filter((c) => available.includes(c));
    if (languages.length === 0) languages = available.slice(0, 1);
  }
  return { available, enabled, languages };
}

function applySpellSettings(): { available: string[]; enabled: boolean; languages: string[] } {
  const state = readSpellState();
  try {
    const sessions = new Set<any>([session.defaultSession]);
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) sessions.add(win.webContents.session);
    }
    for (const ses of sessions) {
      try {
        ses.setSpellCheckerEnabled(state.enabled);
        if (state.enabled && state.languages.length > 0) {
          ses.setSpellCheckerLanguages(state.languages);
        }
      } catch {
        /* una sesión no debe tumbar a las demás */
      }
    }
  } catch (err) {
    console.error('[spell] apply failed:', err);
  }
  return state;
}

ipcMain.handle('spell:getState', () => {
  try {
    return { ok: true, ...readSpellState() };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
});

ipcMain.handle('spell:setState', (_e: any, patch: { enabled?: boolean; languages?: string[] }) => {
  try {
    const available = getAvailableSpellLangs();
    if (typeof patch.enabled === 'boolean') {
      runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        'spellcheck_enabled',
        patch.enabled ? 'true' : 'false',
      ]);
    }
    if (Array.isArray(patch.languages)) {
      const valid = [...new Set(patch.languages.filter((c) => typeof c === 'string' && available.includes(c)))];
      if (valid.length > 0) {
        runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
          'spellcheck_languages',
          JSON.stringify(valid),
        ]);
      }
    }
    return { ok: true, ...applySpellSettings() };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
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
    // Solo cuenta cuando había bloqueo real: es un desbloqueo del usuario.
    if (sessionLocked) {
      recordUnlock();
      recordAccessEvent('unlock_ok');
    }
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
  recordAccessEvent('password_changed', mode);
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
  const ok = await bcrypt.compare(password, row.value);
  // Solo los fallos: el OK se registra al desbloquear de verdad
  // (session:set-locked), para no duplicar ni contar verificaciones internas.
  if (!ok) recordAccessEvent('unlock_fail');
  return ok;
});

ipcMain.handle('auth:removePassword', () => {
  runQuery('DELETE FROM settings WHERE key = ?', ['password_hash']);
  // Sin contraseña no hay nada que recuperar: limpiar código y pista también.
  runQuery('DELETE FROM settings WHERE key = ?', ['recovery_code_hash']);
  runQuery('DELETE FROM settings WHERE key = ?', ['password_hint']);
  recordAccessEvent('password_removed');
  handleSessionUnlocked();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('setting-changed', { key: 'password_hash', value: 'removed' });
  }
  return true;
});

// -- Registro de accesos (lectura y limpieza para Ajustes) --
ipcMain.handle('security:listAccessLog', () => {
  try {
    const rows = queryAll(
      'SELECT id, event, detail, created_at FROM access_log ORDER BY id DESC LIMIT ?',
      [ACCESS_LOG_KEEP],
    );
    return { ok: true, events: rows };
  } catch (err) {
    return { ok: false, events: [], error: String((err as Error)?.message || err) };
  }
});

ipcMain.handle('security:clearAccessLog', () => {
  try {
    runQuery('DELETE FROM access_log');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
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
    runQuery('DELETE FROM settings WHERE key = ?', ['unlock_count']);
    runQuery('DELETE FROM settings WHERE key = ?', ['notes_created_total']);
    runQuery('DELETE FROM settings WHERE key = ?', ['stickies_created_total']);
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
  'remember_last_note', 'minimize_to_tray', 'close_to_tray', 'close_choice_remembered',
  'show_line_counter', 'show_line_gutter', 'show_word_counter', 'show_minimap', 'show_keyboard_indicators',
  'autosave_enabled', 'confirm_leave_note_dismissed', 'confirm_move_note_to_trash_dismissed',
  'auto_unlock_caps_lock', 'auto_unlock_caps_lock_timeout',
  'caps_lock_sound', 'caps_lock_sound_scope',
  'tabs_width_mode', 'note_list_group_by_date', 'note_list_view_mode',
  'note_list_collapsed_groups', 'note_list_floating_group_ready',
  'sticky_restore_on_startup', 'sticky_skip_taskbar', 'sticky_lock_action',
  'toggle_hotkey', 'toggle_hotkey_enabled',
  'auth_method', 'show_suite_promo', 'usage_stats_enabled', 'usage_stats_expanded',
  'auto_backup_enabled', 'auto_backup_hours', 'auto_backup_keep', 'backup_folder',
  'notes_created_total', 'stickies_created_total',
]);

const SETTINGS_RESERVED_KEYS: ReadonlySet<string> = new Set([
  'password_hash', 'recovery_code_hash', 'auto_start', 'is_maximized', 'window_bounds',
]);

/** Max value size accepted from the renderer (opened_history JSON can be large). */
const SETTINGS_MAX_VALUE_LENGTH = 100_000;

// Only the small saved appearance is read synchronously, before the HTML loader paints.
ipcMain.on('appearance:get-startup', (event) => {
  event.returnValue = readAppearanceSettings();
});

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

// -- Borrado total de datos (Danger Zone) --
// A diferencia de settings:reset, aquí nada sobrevive: notas, carpetas,
// borradores, stickies, revisiones, estadísticas, registro de acceso,
// ajustes (incluidas contraseña y código de recuperación) e imágenes.
// Los archivos de respaldo automático se conservan: son la única vía
// de recuperación si el usuario se arrepiente.
const WIPE_TABLES = [
  'notes', 'folders', 'note_drafts', 'sticky_notes',
  'note_revisions', 'usage_days', 'access_log', 'settings',
] as const;

function wipeDataTables(): void {
  for (const table of WIPE_TABLES) runQuery(`DELETE FROM ${table}`);
  try {
    fs.rmSync(imagesPath, { recursive: true, force: true });
  } catch { /* se recrea bajo demanda */ }
  fs.mkdirSync(imagesPath, { recursive: true });
}

ipcMain.handle('data:wipe-all', async () => {
  try {
    // Cerrar todas las stickies primero: referencian notas que van a
    // desaparecer y su autoguardado podría reinsertarlas tras el borrado.
    Array.from(stickyWindows.keys()).forEach(noteId => closeStickyNote(noteId));
    // Segunda pasada tras un margen: cualquier save en vuelo de un renderer
    // de sticky recién destruido caería después del primer DELETE.
    wipeDataTables();
    await new Promise(resolve => setTimeout(resolve, 500));
    wipeDataTables();

    registerToggleHotkey();
    startAutoBackupWatcher();
    updateTrayMenu();
    writeLog('warn', '[data] Borrado total de fábrica: notas, carpetas, imágenes y ajustes eliminados');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
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
  // backup_folder: solo rutas absolutas saneadas; cadena vacía = volver al
  // default. Debe poder crearse la carpeta antes de aceptarla.
  let normalizedValue = value;
  if (key === 'backup_folder' && value !== '') {
    const trimmed = value.trim();
    if (!path.isAbsolute(trimmed) || trimmed.length > 500 || /[\u0000-\u001f]/.test(trimmed)) {
      console.warn('[settings] rejected invalid backup_folder path');
      return false;
    }
    try {
      fs.mkdirSync(trimmed, { recursive: true });
    } catch {
      console.warn('[settings] rejected backup_folder (not creatable):', trimmed);
      return false;
    }
    normalizedValue = trimmed;
  }
  runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, normalizedValue]);
  const openWindows = [mainWindow, ...stickyWindows.values()];
  openWindows.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('setting-changed', { key, value: normalizedValue });
    }
  });
  if (key === 'auto_unlock_caps_lock' || key === 'language' || key === 'toggle_hotkey_enabled' || key === 'theme' || key === 'colorIntensity') {
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

// ─── Historial de versiones (fase 1: snapshots + restaurar) ──────────────
// Una revisión guarda el contenido ANTERIOR en cada guardado con cambios.
// Topes anti-crecimiento: 1 snapshot cada 5 min por nota, 50 por nota (FIFO)
// y 1 MB por revisión (las notas con imágenes pesadas no versionan).
// Todo 100% local; no viaja en el backup JSON de fase 1.
const REVISION_THROTTLE_MS = 5 * 60 * 1000;
const REVISION_MAX_PER_NOTE = 50;
const REVISION_MAX_BYTES = 1_000_000;

function pruneRevisions(noteId: string): void {
  try {
    runQuery(
      `DELETE FROM note_revisions WHERE note_id = ? AND id NOT IN (
        SELECT id FROM note_revisions WHERE note_id = ? ORDER BY id DESC LIMIT ?
      )`,
      [noteId, noteId, REVISION_MAX_PER_NOTE],
    );
  } catch (err) {
    console.error('[revisions] prune failed:', err);
  }
}

function maybeSnapshotRevision(
  noteId: string,
  oldTitle: string,
  oldContent: string,
  opts: { force: boolean },
  newContent?: string,
): boolean {
  try {
    if (typeof noteId !== 'string' || !noteId) return false;
    if (!oldContent || !oldContent.trim()) return false;
    if (oldContent.length > REVISION_MAX_BYTES) return false;
    if (typeof newContent === 'string' && newContent === oldContent) return false;
    if (!opts.force) {
      const latest = queryGet(
        'SELECT content, created_at FROM note_revisions WHERE note_id = ? ORDER BY id DESC LIMIT 1',
        [noteId],
      );
      if (latest) {
        if (latest.content === oldContent) return false;
        const latestTime = Date.parse(latest.created_at);
        if (Number.isFinite(latestTime) && Date.now() - latestTime < REVISION_THROTTLE_MS) return false;
      }
    }
    runQuery(
      'INSERT INTO note_revisions (note_id, title, content, created_at) VALUES (?, ?, ?, ?)',
      [noteId, (oldTitle || '').slice(0, NOTE_TITLE_MAX_CHARS), oldContent, new Date().toISOString()],
    );
    pruneRevisions(noteId);
    return true;
  } catch (err) {
    console.error('[revisions] snapshot failed:', err);
    return false;
  }
}

ipcMain.handle('revisions:list', (_e: any, noteId: string) => {
  try {
    if (typeof noteId !== 'string' || !noteId) return { ok: false, error: 'bad-id' };
    const rows = queryAll(
      'SELECT id, note_id, title, content, created_at FROM note_revisions WHERE note_id = ? ORDER BY id DESC',
      [noteId],
    ) as { id: number; note_id: string; title: string; content: string; created_at: string }[];
    return {
      ok: true,
      revisions: rows.map((r) => ({
        id: r.id,
        title: r.title || '',
        created_at: r.created_at,
        words: stripHtmlToWords(r.content).length,
      })),
    };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
});

ipcMain.handle('revisions:get', (_e: any, id: number) => {
  try {
    if (typeof id !== 'number' || !Number.isFinite(id)) return { ok: false, error: 'bad-id' };
    const row = queryGet('SELECT id, note_id, title, content, created_at FROM note_revisions WHERE id = ?', [id]);
    if (!row) return { ok: false, error: 'not-found' };
    return { ok: true, revision: row };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
});

ipcMain.handle('revisions:restore', (_e: any, noteId: string, revisionId: number) => {
  try {
    if (typeof noteId !== 'string' || !noteId || typeof revisionId !== 'number') return { ok: false, error: 'bad-args' };
    const rev = queryGet('SELECT title, content FROM note_revisions WHERE id = ? AND note_id = ?', [revisionId, noteId]);
    if (!rev) return { ok: false, error: 'not-found' };
    const current = queryGet('SELECT title, content FROM notes WHERE id = ? AND deleted_at IS NULL', [noteId]);
    if (!current) return { ok: false, error: 'note-gone' };
    // La versión actual queda a salvo antes de sobrescribir (forzado, sin throttle).
    maybeSnapshotRevision(noteId, current.title || '', current.content || '', { force: true });
    const now = new Date().toISOString();
    runQueryBatch([
      {
        sql: 'UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?',
        params: [(rev.title || '').slice(0, NOTE_TITLE_MAX_CHARS), rev.content || '', now, noteId],
      },
      { sql: 'DELETE FROM note_drafts WHERE note_id = ?', params: [noteId] },
    ]);
    const updated = queryGet('SELECT * FROM notes WHERE id = ?', [noteId]);
    return { ok: true, note: updated };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
});

ipcMain.handle('notes:save', (_e: any, note: any) => {
  if (!note || typeof note.id !== 'string' || !note.id || note.id.length > 100) return false;
  if (typeof note.content === 'string' && note.content.length > NOTE_CONTENT_MAX_CHARS) return false;
  const title = typeof note.title === 'string' ? note.title.slice(0, NOTE_TITLE_MAX_CHARS) : '';
  const content = typeof note.content === 'string' ? note.content : '';
  const preview = typeof note.preview === 'string' ? note.preview.slice(0, NOTE_PREVIEW_MAX_CHARS) : '';
  const thumb = isThumbUrl(note.thumb) ? note.thumb.slice(0, THUMB_MAX_CHARS) : '';
  const folderId = typeof note.folder_id === 'string' || note.folder_id === null ? note.folder_id : null;
  const pinned = note.pinned ? 1 : 0;
  const exists = queryGet('SELECT id, deleted_at, title, content FROM notes WHERE id = ?', [note.id]);
  if (exists?.deleted_at) return note;
  if (exists) {
    maybeSnapshotRevision(note.id, exists.title || '', exists.content || '', { force: false }, content);
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

ipcMain.handle('drafts:save', (_e: any, draft: any, _flushNow = false) => {
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
    { sql: 'DELETE FROM note_revisions WHERE note_id = ?', params: [id] },
    { sql: 'DELETE FROM notes WHERE id = ? AND deleted_at IS NOT NULL', params: [id] },
  ]);
  return true;
});

ipcMain.handle('notes:emptyTrash', () => {
  const row = queryGet('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NOT NULL');
  runQueryBatch([
    { sql: 'DELETE FROM sticky_notes WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL)' },
    { sql: 'DELETE FROM note_drafts WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL)' },
    { sql: 'DELETE FROM note_revisions WHERE note_id IN (SELECT id FROM notes WHERE deleted_at IS NOT NULL)' },
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

/**
 * Guarda una imagen recibida como binario (pegar / arrastrar al editor) en
 * images/ y devuelve su URL file:. Evita que el HTML de la nota lleve la
 * imagen embebida en base64: la nota pesa menos y la base no crece con cada
 * copia. El tipo real se verifica por magic bytes, no se confía en el MIME.
 */
ipcMain.handle('images:saveBinary', (_e: any, data: unknown, _mime: string) => {
  try {
    if (!db) return null;
    if (!(data instanceof ArrayBuffer) && !(ArrayBuffer.isView(data as any))) return null;
    const buf = Buffer.from(data as ArrayBuffer | Uint8Array);
    if (buf.length <= 0 || buf.length > CLIPBOARD_IMAGE_MAX_BYTES) return null;
    const ext = sniffImageExt(buf);
    if (!ext) return null;
    fs.mkdirSync(imagesPath, { recursive: true });
    const destPath = path.join(imagesPath, `${uuidv4()}.${ext}`);
    fs.writeFileSync(destPath, buf);
    return `file:///${destPath.replace(/\\/g, '/')}`;
  } catch (err) {
    console.error('[CyberNotes] images:saveBinary failed:', err);
    return null;
  }
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

// -- Import/Export / Respaldo unificado en JSON v2 --
// Un mismo formato para todo: notas, carpetas, días de uso y las imágenes
// embebidas en base64 en el mapa "images". Los refs file:///.../images/x se
// reescriben a la forma relativa images/x para que el archivo sea portable
// entre equipos y carpetas. Sirve para el export manual, los respaldos
// automáticos y la restauración desde Ajustes.

type ExportPayload = {
  folders: any[];
  notes: any[];
  usage_days: any[];
  images: Record<string, string>;
  version: number;
};

function buildExportPayload(): ExportPayload {
  const folders = queryAll('SELECT * FROM folders');
  const notes = queryAll('SELECT * FROM notes');
  const usageDays = queryAll('SELECT day, opens FROM usage_days ORDER BY day ASC');

  const images: Record<string, string> = {};
  const portablizeImageRefs = (text: string): string => {
    if (typeof text !== 'string' || !text) return text;
    return text.replace(/file:\/\/\/[^"'\\\s()<>]+/g, (url) => {
      let filePath = '';
      try {
        filePath = decodeURIComponent(url.slice('file:///'.length));
      } catch {
        return url;
      }
      const resolved = path.normalize(filePath);
      const rel = path.relative(imagesPath, resolved);
      if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return url;
      try {
        images[path.basename(resolved)] = fs.readFileSync(resolved).toString('base64');
      } catch {
        return url; // imagen ausente: se deja el ref tal cual
      }
      return `images/${path.basename(resolved)}`;
    });
  };
  for (const n of notes) {
    n.content = portablizeImageRefs(n.content);
    n.preview = portablizeImageRefs(n.preview);
    n.thumb = portablizeImageRefs(n.thumb);
  }

  return { folders, notes, usage_days: usageDays, images, version: 2 };
}

/** Decodifica el mapa "images" a archivos reales en imagesPath: nombre -> file URL. */
function materializeEmbeddedImages(data: any): Map<string, string> {
  const imageUrls = new Map<string, string>();
  const embedded = data?.images;
  if (embedded && typeof embedded === 'object' && !Array.isArray(embedded)) {
    fs.mkdirSync(imagesPath, { recursive: true });
    for (const [name, b64] of Object.entries(embedded)) {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(name) || typeof b64 !== 'string') continue;
      let buf: Buffer;
      try {
        buf = Buffer.from(b64, 'base64');
      } catch {
        continue;
      }
      if (buf.length === 0 || buf.length > 64 * 1024 * 1024 || !sniffImageExt(buf)) continue;
      const dest = path.join(imagesPath, name);
      try {
        fs.writeFileSync(dest, buf);
      } catch {
        continue;
      }
      imageUrls.set(name, `file:///${dest.replace(/\\/g, '/')}`);
    }
  }
  return imageUrls;
}

function localizeImageRefs(text: string, imageUrls: Map<string, string>): string {
  if (typeof text !== 'string' || !text) return text;
  return text.replace(/(?<![\w/-])images\/([A-Za-z0-9][A-Za-z0-9._-]*)/g, (m, name) => imageUrls.get(name) || m);
}

/**
 * Aplica un payload JSON a la base de datos.
 * merge: inserta/actualiza sin borrar lo actual (Importar).
 * replace: deja notas, carpetas, borradores y uso tal cual el respaldo
 * (Restaurar); ajustes, contraseña e historial de versiones no se tocan.
 */
function applyImportedData(data: any, mode: 'merge' | 'replace'): { ok: boolean; error?: string } {
  try {
    if (!data || !Array.isArray(data.folders) || !Array.isArray(data.notes)) return { ok: false, error: 'invalid backup file' };
    if (data.folders.length + data.notes.length > IMPORT_MAX_ROWS) return { ok: false, error: 'backup too large' };
    if (!db) return { ok: false, error: 'database not ready' };

    const imageUrls = materializeEmbeddedImages(data);

    const str = (v: unknown, max: number): string =>
      typeof v === 'string' ? v.slice(0, max) : '';
    const idStr = (v: unknown): string | null =>
      typeof v === 'string' && v && v.length <= 100 ? v : null;

    const ops: Array<{ sql: string; params?: any[] }> = [];
    if (mode === 'replace') {
      ops.push(
        { sql: 'DELETE FROM notes' },
        { sql: 'DELETE FROM folders' },
        { sql: 'DELETE FROM usage_days' },
      );
    }
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
      const content = localizeImageRefs(typeof n?.content === 'string' ? n.content : '', imageUrls);
      if (content.length > NOTE_CONTENT_MAX_CHARS) continue;
      const thumb = localizeImageRefs(typeof n?.thumb === 'string' ? n.thumb : '', imageUrls);
      ops.push({
        sql: 'INSERT OR REPLACE INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [
          id,
          typeof n?.folder_id === 'string' ? n.folder_id : null,
          str(n?.title, NOTE_TITLE_MAX_CHARS),
          content,
          localizeImageRefs(str(n?.preview, NOTE_PREVIEW_MAX_CHARS), imageUrls),
          isThumbUrl(thumb) ? thumb.slice(0, THUMB_MAX_CHARS) : '',
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
    runQueryBatch(ops);

    if (mode === 'replace') {
      // La carpeta de imágenes debe quedar como en el respaldo: fuera las
      // sobrantes que ya nada referencia (quedaron huérfanas).
      const embedded = data?.images;
      const keptNames = new Set(
        embedded && typeof embedded === 'object' && !Array.isArray(embedded)
          ? Object.keys(embedded).filter(n => /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/.test(n))
          : []
      );
      if (fs.existsSync(imagesPath)) {
        for (const name of fs.readdirSync(imagesPath)) {
          if (keptNames.has(name)) continue;
          try {
            fs.rmSync(path.join(imagesPath, name), { force: true });
          } catch { /* conserva el archivo */ }
        }
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  }
}

ipcMain.handle('data:export', async () => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    title: dialogTitle('Exportar datos de CyberNotes', 'Export CyberNotes data'),
    defaultPath: 'cybernotes-export.json',
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return false;

  fs.writeFileSync(result.filePath, JSON.stringify(buildExportPayload(), null, 2));
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

    // Backup current DB (snapshot consistente con WAL)
    const backupPath = dbPath + '.backup-' + Date.now();
    if (db) await db.backup(backupPath);

    return applyImportedData(data, 'merge').ok;
  } catch (e) {
    console.error('Import error:', e);
    return false;
  }
});

// -- Respaldo automatico: control manual y consulta --
ipcMain.handle('backup:now', () => runAutoBackup('manual'));

ipcMain.handle('backup:list', () => {
  try {
    const backupsDir = getBackupsDir();
    if (!fs.existsSync(backupsDir)) return [];
    // Tamano real: en carpetas autocontenidas incluye la copia de images/.
    const entrySize = (p: string, isDir: boolean): number => {
      try {
        if (!isDir) return fs.statSync(p).size;
        let total = 0;
        const stack = [p];
        while (stack.length) {
          const dir = stack.pop()!;
          for (const name of fs.readdirSync(dir)) {
            const child = path.join(dir, name);
            const st = fs.statSync(child);
            if (st.isDirectory()) stack.push(child);
            else total += st.size;
          }
        }
        return total;
      } catch {
        return 0;
      }
    };
    return fs
      .readdirSync(backupsDir)
      .filter(isBackupEntry)
      .sort()
      .reverse()
      .map((file) => {
        try {
          const full = path.join(backupsDir, file);
          const stat = fs.statSync(full);
          return { file, size: entrySize(full, stat.isDirectory()), mtime: stat.mtime.toISOString() };
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
  const backupsDir = getBackupsDir();
  try {
    fs.mkdirSync(backupsDir, { recursive: true });
  } catch {
    /* openPath informa el error */
  }
  return shell.openPath(backupsDir);
});

/** Selector nativo de carpeta para personalizar el destino de los respaldos. */
ipcMain.handle('backup:pickFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: dialogTitle('Elegir carpeta de respaldos', 'Choose backups folder'),
    defaultPath: getBackupsDir(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// -- Restaurar desde respaldo --
// Reemplaza BD (y fotos cuando el respaldo las trae) por el contenido de una
// entrada de la carpeta de respaldos y reinicia la app. La entrada se copia
// antes a una carpeta temporal: el respaldo de seguridad que se crea a
// continuación podaría la fuente si retención = 1.
const RESTORE_ENTRY_MAX_LENGTH = 120;

ipcMain.handle('backup:restore', async (_e: any, entryName: string) => {
  let stagingDir: string | null = null;
  try {
    if (
      typeof entryName !== 'string' || !isBackupEntry(entryName)
      || entryName.includes('/') || entryName.includes('\\') || entryName.includes('..')
      || entryName.length > RESTORE_ENTRY_MAX_LENGTH
    ) {
      return { ok: false, error: 'invalid backup name' };
    }
    const backupsDir = getBackupsDir();
    const entryPath = path.join(backupsDir, entryName);
    if (!fs.existsSync(entryPath)) return { ok: false, error: 'backup not found' };
    const entryStat = fs.statSync(entryPath);

    // Formato unificado v2 (archivo .json): reemplazo de datos con la BD
    // abierta. No hace falta reiniciar el proceso: el renderer recarga al
    // recibir ok. Ajustes, contraseña e historial de versiones se conservan.
    if (entryStat.isFile() && entryName.endsWith('.json')) {
      if (entryStat.size > IMPORT_FILE_MAX_BYTES) return { ok: false, error: 'backup file too large' };
      let data: any;
      try {
        data = JSON.parse(fs.readFileSync(entryPath, 'utf-8'));
      } catch {
        return { ok: false, error: 'invalid backup file' };
      }
      const safety = await runAutoBackup('manual');
      if (!safety.ok) return { ok: false, error: 'safety backup failed; nothing was changed' };
      Array.from(stickyWindows.keys()).forEach(noteId => closeStickyNote(noteId));
      const applied = applyImportedData(data, 'replace');
      if (!applied.ok) return applied;
      writeLog('warn', `[backup] Restored data from ${entryName}`);
      return { ok: true };
    }

    let backupDb: string | null = null;
    let backupImages: string | null = null;
    if (entryStat.isDirectory()) {
      const candidate = path.join(entryPath, 'cybernotes.db');
      if (!fs.existsSync(candidate)) return { ok: false, error: 'backup folder has no database' };
      backupDb = candidate;
      const images = path.join(entryPath, 'images');
      if (fs.existsSync(images)) backupImages = images;
    } else if (isBackupFile(entryName)) {
      // Legado: solo contiene la BD, sin imágenes.
      backupDb = entryPath;
    } else {
      return { ok: false, error: 'unsupported backup entry' };
    }

    // 1) Llevar la entrada a staging: inmutable frente a la poda posterior.
    stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cybernotes-restore-'));
    fs.copyFileSync(backupDb, path.join(stagingDir, 'cybernotes.db'));
    if (backupImages) {
      fs.cpSync(backupImages, path.join(stagingDir, 'images'), { recursive: true, force: true });
    }

    // 2) Respaldo de seguridad del estado actual antes de pisar nada.
    const safety = await runAutoBackup('manual');
    if (!safety.ok) {
      return { ok: false, error: 'safety backup failed; nothing was changed' };
    }

    // 3) Cerrar stickies y la base de datos: los archivos quedan libres.
    Array.from(stickyWindows.keys()).forEach(noteId => closeStickyNote(noteId));
    if (autoBackupTimer) {
      clearInterval(autoBackupTimer);
      autoBackupTimer = null;
    }
    try {
      db?.close();
    } catch (err) {
      writeLog('warn', `[backup] close before restore: ${err instanceof Error ? err.message : String(err)}`);
    }
    db = null;

    // 4) Reemplazar la BD (WAL/SHM fuera primero) y las imágenes.
    for (const suffix of ['-wal', '-shm']) {
      try { fs.rmSync(dbPath + suffix, { force: true }); } catch { /* ignore */ }
    }
    fs.copyFileSync(path.join(stagingDir, 'cybernotes.db'), dbPath);
    if (fs.existsSync(path.join(stagingDir, 'images'))) {
      try {
        fs.rmSync(imagesPath, { recursive: true, force: true });
      } catch (err) {
        writeLog('warn', `[backup] old images removal during restore: ${err instanceof Error ? err.message : String(err)}`);
      }
      fs.cpSync(path.join(stagingDir, 'images'), imagesPath, { recursive: true, force: true });
    }

    try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ }
    stagingDir = null;
    writeLog('warn', `[backup] Restored from ${entryName}; restarting app`);

    // 5) Reinicio limpio: el nuevo proceso abre la BD ya restaurada.
    app.relaunch();
    app.exit(0);
    return { ok: true, restarting: true };
  } catch (err) {
    return { ok: false, error: String((err as Error)?.message || err) };
  } finally {
    if (stagingDir) {
      try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch { /* ignore */ }
    }
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
    writeLog('info', `CyberNotes ${app.getVersion()} started (packaged: ${app.isPackaged})`);
    await migrateLegacyDataFolder();
    await initDatabase();
    recordAppOpen();
    // Diccionarios del corrector según preferencia guardada (bilingüe por
    // defecto). Requiere la BD iniciada (lee spellcheck_* de settings), por
    // eso va después de initDatabase: antes tumbaba el arranque y nunca se
    // creaba la ventana. Protegido para que un fallo del corrector jamás
    // impida abrir la app.
    try {
      applySpellSettings();
    } catch (err) {
      writeLog('error', `spell init failed: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    }
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
    // WAL ya persistió todo; cerrar limpio hace checkpoint final.
    try { db?.close(); } catch { /* no bloquear la salida */ }
    db = null;
  });
}

// ─── Force Close / Unsaved Exit ────────────────────────────────────────
/**
 * Salida real de la app: marca quit (salta pregunta y bandeja), cierra las
 * flotantes (conservan is_open para restaurar) y cierra la principal. El
 * diálogo de cambios sin guardar sigue apareciendo si hay cambios.
 */
function quitAppFromMain(): void {
  isQuitting = true;
  for (const win of Array.from(stickyWindows.values())) {
    try {
      if (!win.isDestroyed()) win.close();
    } catch {
      /* una flotante no debe impedir salir */
    }
  }
  mainWindow?.close();
}

ipcMain.handle('window-force-close', () => {
  quitAppFromMain();
});

// ─── First-close choice (estilo CyberPaste) ────────────────────────────
ipcMain.handle('first-close-choice', (_e: any, action: string, remember: boolean) => {
  if (action !== 'tray' && action !== 'quit') return false;
  if (remember) {
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['close_choice_remembered', 'true']);
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['close_to_tray', action === 'tray' ? 'true' : 'false']);
  }
  if (action === 'tray') {
    runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['close_to_tray', 'true']);
    if (hasPasswordHash()) {
      mainWindow?.webContents.send('session:shield-enable');
    }
    mainWindow?.hide();
    return true;
  }
  // Salir: equivale a salida real; el flujo existente (cambios sin
  // guardar / salir) sigue su curso y las flotantes no retienen el proceso.
  quitAppFromMain();
  return true;
});

ipcMain.handle('confirm-unsaved-exit-response', (_e: any, discard: boolean) => {
  if (discard) {
    hasUnsavedChanges = false;
    quitAppFromMain();
  }
});
