import { app, ipcMain, shell, session, dialog, BrowserWindow, Tray, Menu } from "electron";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { exec, spawn } from "child_process";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const require$1 = createRequire(import.meta.url);
const isDev = !app.isPackaged;
let iconPath = path.join(__dirname$1, "..", "public", "icon.png");
if (!isDev) {
  iconPath = path.join(app.getAppPath(), "dist", "icon.png");
}
if (!fs.existsSync(iconPath)) {
  const fallbackIcon = path.join(isDev ? path.join(__dirname$1, "..", "public") : path.join(app.getAppPath(), "dist"), "icon.ico");
  if (fs.existsSync(fallbackIcon)) iconPath = fallbackIcon;
}
const bcrypt = require$1("bcryptjs");
const userDataPath = app.getPath("userData");
const dbPath = path.join(userDataPath, "cybernotes.db");
const imagesPath = path.join(userDataPath, "images");
const { v4: uuidv4 } = require$1("uuid");
let db = null;
let SQL = null;
function saveDbToDisk() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(dbPath, Buffer.from(data));
}
async function initDatabase() {
  const sqlWasmPath = isDev ? path.join(__dirname$1, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm") : path.join(process.resourcesPath, "sql-wasm.wasm");
  const initSqlJs = require$1("sql.js");
  SQL = await initSqlJs({
    locateFile: () => sqlWasmPath
  });
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }
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
  saveDbToDisk();
  if (!fs.existsSync(imagesPath)) {
    fs.mkdirSync(imagesPath, { recursive: true });
  }
}
function queryAll(sql, params = []) {
  if (!db) throw new Error("Base de datos no inicializada");
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}
function queryGet(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
function runQuery(sql, params = []) {
  if (!db) throw new Error("Base de datos no inicializada");
  db.run(sql, params);
  saveDbToDisk();
}
let mainWindow = null;
let tray = null;
let isQuitting = false;
let hasUnsavedChanges = false;
let capsLockWorker = null;
function startCapsLockWorker() {
  if (capsLockWorker) return;
  if (process.platform !== "win32") return;
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
    capsLockWorker = spawn("powershell", ["-Command", psScript]);
    capsLockWorker.stdout.on("data", (data) => {
      const output = data.toString();
      const lines = output.split("\n");
      for (const line of lines) {
        if (line.trim().startsWith("STATE:")) {
          const state = line.trim().substring(6).toLowerCase() === "true";
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("global-caps-lock-changed", state);
          }
        }
      }
    });
    capsLockWorker.on("exit", () => {
      capsLockWorker = null;
    });
  } catch (err) {
    console.error("Failed to start caps lock worker:", err);
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
  const maxVal = queryGet("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  if ((maxVal == null ? void 0 : maxVal.value) === "true") mainWindow.maximize();
  mainWindow.show();
  mainWindow.focus();
}
function getTrayMenuTemplate() {
  const capsLockVal = queryGet("SELECT value FROM settings WHERE key = ?", ["auto_unlock_caps_lock"]);
  const isCapsUnlockEnabled = (capsLockVal == null ? void 0 : capsLockVal.value) === "true";
  const langVal = queryGet("SELECT value FROM settings WHERE key = ?", ["language"]);
  const lang = (langVal == null ? void 0 : langVal.value) || "en";
  const isEs = lang === "es";
  return [
    { label: `CyberNotes  ·  v${app.getVersion()}`, enabled: false },
    { type: "separator" },
    { label: isEs ? "Abrir CyberNotes" : "Open CyberNotes", click: restoreWindow },
    {
      label: isEs ? "Configuración" : "Settings",
      click: () => {
        restoreWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("open-settings");
        }
      }
    },
    { type: "separator" },
    {
      label: isEs ? "Desactivar CapsLock por inactividad" : "Disable Caps Lock on inactivity",
      type: "checkbox",
      checked: isCapsUnlockEnabled,
      click: (menuItem) => {
        const newVal = menuItem.checked;
        runQuery("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_unlock_caps_lock", newVal ? "true" : "false"]);
        updateTrayMenu();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("setting-changed", { key: "auto_unlock_caps_lock", value: newVal ? "true" : "false" });
        }
      }
    },
    { type: "separator" },
    {
      label: isEs ? "Salir" : "Quit",
      click: () => {
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
    console.error("Failed to update tray menu:", err);
  }
}
function createTray() {
  try {
    tray = new Tray(iconPath);
    updateTrayMenu();
    tray.setToolTip("CyberNotes");
    tray.on("click", () => {
      if (mainWindow == null ? void 0 : mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        restoreWindow();
      }
    });
  } catch (err) {
    console.error("Failed to create tray:", err);
  }
}
function createWindow() {
  const boundsJson = queryGet("SELECT value FROM settings WHERE key = ?", ["window_bounds"]);
  const isMaximizedVal = queryGet("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  let bounds = { width: 1100, height: 700, x: void 0, y: void 0 };
  if (boundsJson) {
    try {
      const savedBounds = JSON.parse(boundsJson.value);
      if (savedBounds.width > 400 && savedBounds.height > 400) {
        bounds = savedBounds;
      }
    } catch (e) {
    }
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
    titleBarStyle: "hidden",
    backgroundColor: "#0d0d14",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false
    },
    show: false
  });
  const saveWindowState = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isMax = mainWindow.isMaximized();
    runQuery("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["is_maximized", isMax ? "true" : "false"]);
    const b = mainWindow.getBounds();
    if (b.width > 100 && b.height > 100) {
      runQuery("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["window_bounds", JSON.stringify(b)]);
    }
  };
  mainWindow.on("resize", saveWindowState);
  mainWindow.on("move", saveWindowState);
  mainWindow.on("close", saveWindowState);
  mainWindow.on("maximize", saveWindowState);
  mainWindow.on("unmaximize", saveWindowState);
  mainWindow.on("hide", saveWindowState);
  mainWindow.on("minimize", () => {
    const minimizeToTray = queryGet("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
    if ((minimizeToTray == null ? void 0 : minimizeToTray.value) === "true") {
      mainWindow == null ? void 0 : mainWindow.hide();
    }
  });
  mainWindow.on("close", (event) => {
    const closeToTray = queryGet("SELECT value FROM settings WHERE key = ?", ["close_to_tray"]);
    if ((closeToTray == null ? void 0 : closeToTray.value) === "true" && !isQuitting) {
      event.preventDefault();
      mainWindow == null ? void 0 : mainWindow.hide();
      return false;
    }
    if (hasUnsavedChanges) {
      event.preventDefault();
      restoreWindow();
      mainWindow == null ? void 0 : mainWindow.webContents.send("confirm-unsaved-exit");
      return false;
    }
    if (tray && !tray.isDestroyed()) {
      tray.destroy();
      tray = null;
    }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("context-menu", (event, params) => {
    event.preventDefault();
    mainWindow == null ? void 0 : mainWindow.webContents.send("context-menu-data", {
      x: params.x,
      y: params.y,
      suggestions: params.dictionarySuggestions,
      misspelledWord: params.misspelledWord,
      linkURL: params.linkURL
    });
  });
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadFile(path.join(__dirname$1, "../dist/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    if (process.argv.includes("--hidden")) return;
    if ((isMaximizedVal == null ? void 0 : isMaximizedVal.value) === "true") {
      mainWindow == null ? void 0 : mainWindow.maximize();
    }
    mainWindow.show();
    mainWindow.focus();
  });
}
ipcMain.handle("window-minimize", () => {
  const minimizeToTray = queryGet("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
  if ((minimizeToTray == null ? void 0 : minimizeToTray.value) === "true") {
    mainWindow == null ? void 0 : mainWindow.hide();
  } else {
    mainWindow == null ? void 0 : mainWindow.minimize();
  }
});
ipcMain.handle("window-maximize-toggle", () => {
  if (mainWindow == null ? void 0 : mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow == null ? void 0 : mainWindow.maximize();
});
ipcMain.handle("window-close", () => mainWindow == null ? void 0 : mainWindow.close());
ipcMain.handle("window:unsavedChanges:set", (_e, val) => {
  hasUnsavedChanges = val;
});
ipcMain.handle("open-dev-tools", () => mainWindow == null ? void 0 : mainWindow.webContents.openDevTools({ mode: "detach" }));
ipcMain.handle("open-data-folder", () => shell.openPath(userDataPath));
ipcMain.handle("replace-misspelling", (_e, word) => mainWindow == null ? void 0 : mainWindow.webContents.replaceMisspelling(word));
ipcMain.handle("add-to-dictionary", (_e, word) => {
  session.defaultSession.addWordToSpellCheckerDictionary(word);
});
ipcMain.handle("unlock-caps-lock", async () => {
  if (process.platform !== "win32") return false;
  return new Promise((resolve) => {
    const psScript = "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Control]::IsKeyLocked('CapsLock')) { (New-Object -ComObject WScript.Shell).SendKeys('{CAPSLOCK}'); Write-Host 'unlocked' } else { Write-Host 'already-off' }";
    exec(`powershell -Command "${psScript}"`, (err, stdout) => {
      if (err) {
        console.error("Failed to unlock caps lock:", err);
        resolve(false);
      } else {
        const out = stdout.trim();
        resolve(out === "unlocked" || out === "already-off");
      }
    });
  });
});
ipcMain.handle("check-caps-lock", async () => {
  if (process.platform !== "win32") return false;
  return new Promise((resolve) => {
    const psScript = "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')";
    exec(`powershell -Command "${psScript}"`, (err, stdout) => {
      if (err) {
        resolve(false);
      } else {
        resolve(stdout.trim().toLowerCase() === "true");
      }
    });
  });
});
ipcMain.handle("check-for-updates", async () => {
  var _a;
  try {
    const { autoUpdater } = require$1("electron-updater");
    const result = await autoUpdater.checkForUpdates();
    return !!((_a = result == null ? void 0 : result.updateInfo) == null ? void 0 : _a.version);
  } catch {
    console.log("[CyberNotes] Update check: electron-updater not installed.");
    return false;
  }
});
ipcMain.handle("auth:hasPassword", () => {
  const row = queryGet("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
  return !!row;
});
ipcMain.handle("auth:setPassword", async (_e, password) => {
  const hash = await bcrypt.hash(password, 10);
  runQuery("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["password_hash", hash]);
  return true;
});
ipcMain.handle("auth:verifyPassword", async (_e, password) => {
  const row = queryGet("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
  if (!row) return true;
  return bcrypt.compare(password, row.value);
});
ipcMain.handle("auth:removePassword", () => {
  runQuery("DELETE FROM settings WHERE key = ?", ["password_hash"]);
  return true;
});
ipcMain.handle("settings:get", (_e, key) => {
  const row = queryGet("SELECT value FROM settings WHERE key = ?", [key]);
  return row ? row.value : null;
});
ipcMain.handle("settings:set", (_e, key, value) => {
  runQuery("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  if (key === "auto_unlock_caps_lock" || key === "language") {
    updateTrayMenu();
  }
  if (key === "caps_lock_sound_scope") {
    if (value === "global") startCapsLockWorker();
    else stopCapsLockWorker();
  }
  return true;
});
ipcMain.handle("settings:setAutoStart", (_e, enable) => {
  app.setLoginItemSettings({
    openAtLogin: enable,
    openAsHidden: true,
    // macOS
    args: enable ? ["--hidden"] : []
    // Windows / Linux
  });
  runQuery("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_start", enable ? "true" : "false"]);
  return true;
});
ipcMain.handle("settings:getAutoStart", () => {
  const settings = app.getLoginItemSettings();
  return settings.openAtLogin;
});
ipcMain.handle("folders:getAll", () => {
  return queryAll("SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC");
});
ipcMain.handle("folders:create", (_e, folder) => {
  runQuery(
    "INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    [folder.id, folder.name, folder.icon, folder.color, folder.sort_order, folder.created_at]
  );
  return folder;
});
ipcMain.handle("folders:update", (_e, folder) => {
  runQuery(
    "UPDATE folders SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?",
    [folder.name, folder.icon, folder.color, folder.sort_order, folder.id]
  );
  return true;
});
ipcMain.handle("folders:delete", (_e, id) => {
  runQuery("DELETE FROM notes WHERE folder_id = ?", [id]);
  runQuery("DELETE FROM folders WHERE id = ?", [id]);
  return true;
});
ipcMain.handle("notes:getAll", () => {
  return queryAll("SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC");
});
ipcMain.handle("notes:getByFolder", (_e, folderId) => {
  if (folderId === "floating") {
    return queryAll('SELECT * FROM notes WHERE folder_id IS NULL OR folder_id = "" ORDER BY pinned DESC, updated_at DESC');
  }
  if (!folderId) {
    return queryAll("SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC");
  }
  return queryAll("SELECT * FROM notes WHERE folder_id = ? ORDER BY pinned DESC, updated_at DESC", [folderId]);
});
ipcMain.handle("notes:save", (_e, note) => {
  const exists = queryGet("SELECT id FROM notes WHERE id = ?", [note.id]);
  if (exists) {
    runQuery(
      "UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, pinned = ?, updated_at = ? WHERE id = ?",
      [note.folder_id, note.title, note.content, note.preview, note.pinned, note.updated_at, note.id]
    );
  } else {
    runQuery(
      "INSERT INTO notes (id, folder_id, title, content, preview, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [note.id, note.folder_id, note.title, note.content, note.preview, note.pinned, note.created_at, note.updated_at]
    );
  }
  return note;
});
ipcMain.handle("notes:delete", (_e, id) => {
  runQuery("DELETE FROM notes WHERE id = ?", [id]);
  return true;
});
ipcMain.handle("notes:search", (_e, query) => {
  const q = `%${query}%`;
  return queryAll(
    "SELECT * FROM notes WHERE title LIKE ? OR preview LIKE ? OR content LIKE ? ORDER BY pinned DESC, updated_at DESC",
    [q, q, q]
  );
});
ipcMain.handle("images:selectAndSave", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Seleccionar imagen",
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const sourcePath = result.filePaths[0];
  const ext = path.extname(sourcePath);
  const filename = `${uuidv4()}${ext}`;
  const destPath = path.join(imagesPath, filename);
  fs.copyFileSync(sourcePath, destPath);
  return `file:///${destPath.replace(/\\/g, "/")}`;
});
ipcMain.handle("data:export", async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: "Exportar datos de CyberNotes",
    defaultPath: "cybernotes-export.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (result.canceled || !result.filePath) return false;
  const folders = queryAll("SELECT * FROM folders");
  const notes = queryAll("SELECT * FROM notes");
  const exportData = { folders, notes, version: 1 };
  fs.writeFileSync(result.filePath, JSON.stringify(exportData, null, 2));
  return true;
});
ipcMain.handle("data:import", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Importar datos a CyberNotes",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (result.canceled || !result.filePaths.length) return false;
  try {
    const data = JSON.parse(fs.readFileSync(result.filePaths[0], "utf-8"));
    if (!data.folders || !data.notes) return false;
    const backupPath = dbPath + ".backup-" + Date.now();
    if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, backupPath);
    for (const f of data.folders) {
      runQuery(
        "INSERT OR REPLACE INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [f.id, f.name, f.icon, f.color, f.sort_order, f.created_at]
      );
    }
    for (const n of data.notes) {
      runQuery(
        "INSERT OR REPLACE INTO notes (id, folder_id, title, content, preview, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [n.id, n.folder_id, n.title, n.content, n.preview, n.pinned, n.created_at, n.updated_at]
      );
    }
    return true;
  } catch (e) {
    console.error("Import error:", e);
    return false;
  }
});
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    restoreWindow();
  });
  app.whenReady().then(async () => {
    session.defaultSession.setSpellCheckerLanguages(["es-ES", "en-US"]);
    await initDatabase();
    createWindow();
    createTray();
    const scopeVal = queryGet("SELECT value FROM settings WHERE key = ?", ["caps_lock_sound_scope"]);
    if ((scopeVal == null ? void 0 : scopeVal.value) === "global") {
      startCapsLockWorker();
    }
    const autoCheck = queryGet("SELECT value FROM settings WHERE key = ?", ["auto_check_updates"]);
    if ((autoCheck == null ? void 0 : autoCheck.value) === "true") {
      try {
        const { autoUpdater } = require$1("electron-updater");
        autoUpdater.checkForUpdates().catch(() => {
        });
      } catch {
      }
    }
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else restoreWindow();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      if (!tray) app.quit();
    }
  });
}
ipcMain.handle("window-force-close", () => {
  isQuitting = true;
  mainWindow == null ? void 0 : mainWindow.close();
});
ipcMain.handle("confirm-unsaved-exit-response", (_e, discard) => {
  if (discard) {
    hasUnsavedChanges = false;
    isQuitting = true;
    mainWindow == null ? void 0 : mainWindow.close();
  }
});
