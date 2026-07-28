import { BrowserWindow as x, ipcMain as a, app as c, shell as M, session as X, nativeImage as O, net as ee, clipboard as te, dialog as P, Tray as se, Menu as ne } from "electron";
import f from "path";
import p from "fs";
import q from "os";
import { fileURLToPath as K } from "url";
import { createRequire as oe } from "module";
import { exec as Y, spawn as re } from "child_process";
import { autoUpdater as E } from "electron-updater";
let v = !1;
function S(t) {
  for (const e of x.getAllWindows())
    e.webContents.send("update:status", t);
}
function ae(t) {
  v = t, E.autoDownload = !1, E.autoInstallOnAppQuit = !0, E.on("checking-for-update", () => S({ state: "checking" })), E.on("update-available", (e) => {
    S({ state: "available", version: e.version }), v && E.downloadUpdate().catch((s) => {
      S({ state: "error", message: String((s == null ? void 0 : s.message) || s) });
    });
  }), E.on("update-not-available", (e) => {
    S({ state: "not-available", version: e.version });
  }), E.on("download-progress", (e) => {
    S({ state: "downloading", percent: Math.round(e.percent) });
  }), E.on("update-downloaded", (e) => {
    S({ state: "downloaded", version: e.version });
  }), E.on("error", (e) => {
    S({ state: "error", message: String((e == null ? void 0 : e.message) || e) });
  }), le(), v && setTimeout(() => {
    E.checkForUpdates().catch(() => {
    });
  }, 8e3);
}
function ie(t) {
  v = t;
}
function le() {
  a.handle("update:check", async () => {
    var t;
    try {
      const e = new Promise((r, o) => {
        setTimeout(() => o(new Error("Update check timed out")), 2e4);
      }), s = await Promise.race([
        E.checkForUpdates(),
        e
      ]);
      return { ok: !0, version: (t = s == null ? void 0 : s.updateInfo) == null ? void 0 : t.version };
    } catch (e) {
      return console.error("[Updater] Check failed:", e), { ok: !1, error: String((e == null ? void 0 : e.message) || e) };
    } finally {
    }
  }), a.handle("update:download", async () => {
    try {
      return await E.downloadUpdate(), { ok: !0 };
    } catch (t) {
      return { ok: !1, error: String((t == null ? void 0 : t.message) || t) };
    }
  }), a.handle("update:install", () => {
    E.quitAndInstall(!1, !0);
  });
}
const C = f.dirname(K(import.meta.url)), H = oe(import.meta.url), A = !c.isPackaged;
let b = f.join(C, "..", "public", "icon.png");
A || (b = f.join(c.getAppPath(), "dist", "icon.png"));
if (!p.existsSync(b)) {
  const t = f.join(A ? f.join(C, "..", "public") : f.join(c.getAppPath(), "dist"), "icon.ico");
  p.existsSync(t) && (b = t);
}
const J = H("bcryptjs"), W = c.getPath("userData"), L = f.join(W, "cybernotes.db"), U = f.join(W, "images"), { v4: ce } = H("uuid");
let u = null, I = null;
const w = "id, folder_id, title, preview, thumb, pinned, created_at, updated_at", de = 1500;
let R = !1, y = null;
function $() {
  if (!u) return;
  const t = u.export();
  p.writeFileSync(L, Buffer.from(t)), R = !1;
}
function V(t = de) {
  R = !0, y && clearTimeout(y), y = setTimeout(() => {
    y = null, R && $();
  }, t);
}
function D() {
  y && (clearTimeout(y), y = null), (R || u) && R && $();
}
function ue(t, e, s) {
  h(`PRAGMA table_info(${t})`).some((o) => o.name === e) || u.run(`ALTER TABLE ${t} ADD COLUMN ${e} ${s}`);
}
async function fe() {
  const t = A ? f.join(C, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm") : f.join(process.resourcesPath, "sql-wasm.wasm");
  if (I = await H("sql.js")({
    locateFile: () => t
  }), p.existsSync(L)) {
    const s = p.readFileSync(L);
    u = new I.Database(s);
  } else
    u = new I.Database();
  u.run(`
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
  `), ue("notes", "thumb", "TEXT DEFAULT ''"), pe(), $(), p.existsSync(U) || p.mkdirSync(U, { recursive: !0 });
}
function Ee(t) {
  if (!t || typeof t != "string") return "";
  if (t.trim().startsWith("{"))
    try {
      const s = JSON.parse(t);
      let r = "";
      const o = (i) => {
        var l;
        if (!r) {
          if ((i == null ? void 0 : i.type) === "image" && ((l = i.attrs) != null && l.src)) {
            r = String(i.attrs.src);
            return;
          }
          Array.isArray(i == null ? void 0 : i.content) && i.content.forEach(o);
        }
      };
      if (Array.isArray(s == null ? void 0 : s.content) && s.content.forEach(o), r) return r;
    } catch {
    }
  const e = t.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return (e == null ? void 0 : e[1]) || "";
}
function pe() {
  if (!u) return;
  const t = h(
    `SELECT id, content FROM notes
     WHERE (thumb IS NULL OR thumb = '')
       AND content IS NOT NULL AND content != ''
       AND (content LIKE '%<img%' OR content LIKE '%"type":"image"%' OR content LIKE '%"type": "image"%')`
  );
  if (t.length === 0) return;
  let e = 0;
  for (const s of t) {
    const r = Ee(s.content);
    r && (u.run("UPDATE notes SET thumb = ? WHERE id = ?", [r, s.id]), e++);
  }
  e > 0 && (R = !0, console.log(`[CyberNotes] Backfilled thumbs for ${e} note(s)`));
}
function h(t, e = []) {
  if (!u) throw new Error("Base de datos no inicializada");
  const s = u.prepare(t);
  s.bind(e);
  const r = [];
  for (; s.step(); )
    r.push(s.getAsObject());
  return s.free(), r;
}
function d(t, e = []) {
  const s = h(t, e);
  return s.length > 0 ? s[0] : null;
}
function m(t, e = [], s) {
  if (!u) throw new Error("Base de datos no inicializada");
  u.run(t, e), V();
}
function Q(t, e) {
  if (!u) throw new Error("Base de datos no inicializada");
  for (const s of t)
    u.run(s.sql, s.params ?? []);
  e != null && e.flushNow ? (R = !0, D()) : V();
}
let n = null, g = null, k = !1, B = !1, T = null;
function G() {
  if (T || process.platform !== "win32") return;
  const t = `
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
    T = re("powershell", ["-Command", t]), T.stdout.on("data", (e) => {
      const r = e.toString().split(`
`);
      for (const o of r)
        if (o.trim().startsWith("STATE:")) {
          const i = o.trim().substring(6).toLowerCase() === "true";
          n && !n.isDestroyed() && n.webContents.send("global-caps-lock-changed", i);
        }
    }), T.on("exit", () => {
      T = null;
    });
  } catch (e) {
    console.error("Failed to start caps lock worker:", e);
  }
}
function Z() {
  T && (T.kill(), T = null);
}
function _() {
  if (!n) return;
  n.isMinimized() && n.restore();
  const t = d("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  (t == null ? void 0 : t.value) === "true" && n.maximize(), n.show(), n.focus();
}
function he() {
  const t = d("SELECT value FROM settings WHERE key = ?", ["auto_unlock_caps_lock"]), e = (t == null ? void 0 : t.value) === "true", s = d("SELECT value FROM settings WHERE key = ?", ["language"]), o = ((s == null ? void 0 : s.value) || "en") === "es";
  return [
    { label: `CyberNotes  ·  v${c.getVersion()}`, enabled: !1 },
    { type: "separator" },
    { label: o ? "Abrir CyberNotes" : "Open CyberNotes", click: _ },
    {
      label: o ? "Configuración" : "Settings",
      click: () => {
        _(), n && !n.isDestroyed() && n.webContents.send("open-settings");
      }
    },
    { type: "separator" },
    {
      label: o ? "Desactivar CapsLock por inactividad" : "Disable Caps Lock on inactivity",
      type: "checkbox",
      checked: e,
      click: (i) => {
        const l = i.checked;
        m("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_unlock_caps_lock", l ? "true" : "false"]), j(), n && !n.isDestroyed() && n.webContents.send("setting-changed", { key: "auto_unlock_caps_lock", value: l ? "true" : "false" });
      }
    },
    { type: "separator" },
    {
      label: o ? "Salir" : "Quit",
      click: () => {
        k = !0, c.quit();
      }
    }
  ];
}
function j() {
  if (!(!g || g.isDestroyed()))
    try {
      const t = ne.buildFromTemplate(he());
      g.setContextMenu(t);
    } catch (t) {
      console.error("Failed to update tray menu:", t);
    }
}
function me() {
  try {
    g = new se(b), j(), g.setToolTip("CyberNotes"), g.on("click", () => {
      n != null && n.isVisible() ? n.hide() : _();
    });
  } catch (t) {
    console.error("Failed to create tray:", t);
  }
}
function z() {
  const t = d("SELECT value FROM settings WHERE key = ?", ["window_bounds"]), e = d("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  let s = { width: 1100, height: 700, x: void 0, y: void 0 };
  if (t)
    try {
      const i = JSON.parse(t.value);
      i.width > 400 && i.height > 400 && (s = i);
    } catch {
    }
  n = new x({
    width: s.width,
    height: s.height,
    x: s.x,
    y: s.y,
    center: !s.x,
    minWidth: 900,
    minHeight: 600,
    frame: !1,
    titleBarStyle: "hidden",
    backgroundColor: "#0d0d14",
    icon: b,
    webPreferences: {
      preload: f.join(C, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      webSecurity: !1
    },
    show: !1
  });
  let r = null;
  const o = (i = !1) => {
    if (!n || n.isDestroyed()) return;
    const l = () => {
      if (!n || n.isDestroyed()) return;
      const F = n.isMaximized();
      m("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["is_maximized", F ? "true" : "false"]);
      const N = n.getBounds();
      N.width > 100 && N.height > 100 && m("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["window_bounds", JSON.stringify(N)]);
    };
    if (i) {
      r && clearTimeout(r), r = null, l();
      return;
    }
    r && clearTimeout(r), r = setTimeout(l, 500);
  };
  n.on("resize", () => o(!1)), n.on("move", () => o(!1)), n.on("close", () => o(!0)), n.on("maximize", () => o(!0)), n.on("unmaximize", () => o(!0)), n.on("hide", () => o(!0)), n.on("minimize", () => {
    const i = d("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
    (i == null ? void 0 : i.value) === "true" && (n == null || n.hide());
  }), n.on("close", (i) => {
    const l = d("SELECT value FROM settings WHERE key = ?", ["close_to_tray"]);
    if ((l == null ? void 0 : l.value) === "true" && !k)
      return i.preventDefault(), n == null || n.hide(), !1;
    if (B)
      return i.preventDefault(), _(), n == null || n.webContents.send("confirm-unsaved-exit"), !1;
    g && !g.isDestroyed() && (g.destroy(), g = null);
  }), n.webContents.setWindowOpenHandler(({ url: i }) => (i.startsWith("http") && M.openExternal(i), { action: "deny" })), n.webContents.on("context-menu", (i, l) => {
    i.preventDefault();
    const F = l.mediaType === "image" && l.srcURL || l.hasImageContents && l.srcURL ? l.srcURL : null;
    n == null || n.webContents.send("context-menu-data", {
      x: l.x,
      y: l.y,
      suggestions: l.dictionarySuggestions,
      misspelledWord: l.misspelledWord,
      linkURL: l.linkURL,
      imageSrc: F
    });
  }), A ? n.loadURL("http://localhost:5173") : n.loadFile(f.join(C, "../dist/index.html")), n.once("ready-to-show", () => {
    process.argv.includes("--hidden") || ((e == null ? void 0 : e.value) === "true" && (n == null || n.maximize()), n.show(), n.focus());
  });
}
a.handle("window-minimize", () => {
  const t = d("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
  (t == null ? void 0 : t.value) === "true" ? n == null || n.hide() : n == null || n.minimize();
});
a.handle("window-maximize-toggle", () => {
  n != null && n.isMaximized() ? n.unmaximize() : n == null || n.maximize();
});
a.handle("window-close", () => n == null ? void 0 : n.close());
a.handle("window:unsavedChanges:set", (t, e) => {
  B = e;
});
a.handle("open-dev-tools", () => n == null ? void 0 : n.webContents.openDevTools({ mode: "detach" }));
a.handle("open-data-folder", () => M.openPath(W));
a.handle("replace-misspelling", (t, e) => n == null ? void 0 : n.webContents.replaceMisspelling(e));
a.handle("add-to-dictionary", (t, e) => {
  X.defaultSession.addWordToSpellCheckerDictionary(e);
});
a.handle("clipboard:writeImage", async (t, e) => {
  try {
    if (!e || typeof e != "string") return !1;
    let s = O.createEmpty();
    if (e.startsWith("data:"))
      s = O.createFromDataURL(e);
    else if (e.startsWith("file:")) {
      let r;
      try {
        r = K(e);
      } catch {
        r = decodeURIComponent(e.replace(/^file:\/\//i, "").replace(/^\//, ""));
      }
      if (!p.existsSync(r)) return !1;
      s = O.createFromPath(r);
    } else {
      const r = await ee.fetch(e);
      if (!r.ok) return !1;
      const o = Buffer.from(await r.arrayBuffer());
      s = O.createFromBuffer(o);
    }
    return s.isEmpty() ? !1 : (te.writeImage(s), !0);
  } catch (s) {
    return console.error("[CyberNotes] clipboard:writeImage failed:", s), !1;
  }
});
a.handle("unlock-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((t) => {
  Y(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Control]::IsKeyLocked('CapsLock')) { (New-Object -ComObject WScript.Shell).SendKeys('{CAPSLOCK}'); Write-Host 'unlocked' } else { Write-Host 'already-off' }"`, (s, r) => {
    if (s)
      console.error("Failed to unlock caps lock:", s), t(!1);
    else {
      const o = r.trim();
      t(o === "unlocked" || o === "already-off");
    }
  });
}));
a.handle("check-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((t) => {
  Y(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')"`, (s, r) => {
    t(s ? !1 : r.trim().toLowerCase() === "true");
  });
}));
a.handle("app:getVersions", () => ({
  app: c.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  osRelease: q.release(),
  osType: q.type()
}));
a.handle("shell:openExternal", (t, e) => typeof e == "string" && /^https?:\/\//i.test(e) ? M.openExternal(e) : !1);
a.handle("auth:hasPassword", () => !!d("SELECT value FROM settings WHERE key = ?", ["password_hash"]));
a.handle("auth:setPassword", async (t, e) => {
  const s = await J.hash(e, 10);
  return m("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["password_hash", s]), !0;
});
a.handle("auth:verifyPassword", async (t, e) => {
  const s = d("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
  return s ? J.compare(e, s.value) : !0;
});
a.handle("auth:removePassword", () => (m("DELETE FROM settings WHERE key = ?", ["password_hash"]), !0));
a.handle("settings:get", (t, e) => {
  const s = d("SELECT value FROM settings WHERE key = ?", [e]);
  return s ? s.value : null;
});
a.handle("settings:getMany", (t, e) => {
  const s = {};
  if (!Array.isArray(e)) return s;
  for (const r of e) {
    const o = d("SELECT value FROM settings WHERE key = ?", [r]);
    s[r] = o ? o.value : null;
  }
  return s;
});
a.handle("settings:set", (t, e, s) => (m("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [e, s]), (e === "auto_unlock_caps_lock" || e === "language") && j(), e === "caps_lock_sound_scope" && (s === "global" ? G() : Z()), e === "auto_check_updates" && ie(s === "true"), !0));
a.handle("settings:setAutoStart", (t, e) => (c.setLoginItemSettings({
  openAtLogin: e,
  openAsHidden: !0,
  // macOS
  args: e ? ["--hidden"] : []
  // Windows / Linux
}), m("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_start", e ? "true" : "false"]), !0));
a.handle("settings:getAutoStart", () => c.getLoginItemSettings().openAtLogin);
a.handle("folders:getAll", () => h("SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC"));
a.handle("folders:create", (t, e) => (m(
  "INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  [e.id, e.name, e.icon, e.color, e.sort_order, e.created_at]
), e));
a.handle("folders:update", (t, e) => (m(
  "UPDATE folders SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?",
  [e.name, e.icon, e.color, e.sort_order, e.id]
), !0));
a.handle("folders:delete", (t, e) => (Q([
  { sql: "DELETE FROM notes WHERE folder_id = ?", params: [e] },
  { sql: "DELETE FROM folders WHERE id = ?", params: [e] }
]), !0));
a.handle("notes:getAll", () => h(`SELECT ${w} FROM notes ORDER BY pinned DESC, updated_at DESC`));
a.handle("notes:getByFolder", (t, e) => e === "floating" ? h(`SELECT ${w} FROM notes WHERE folder_id IS NULL OR folder_id = "" ORDER BY pinned DESC, updated_at DESC`) : e ? h(`SELECT ${w} FROM notes WHERE folder_id = ? ORDER BY pinned DESC, updated_at DESC`, [e]) : h(`SELECT ${w} FROM notes ORDER BY pinned DESC, updated_at DESC`));
a.handle("notes:getById", (t, e) => d("SELECT * FROM notes WHERE id = ?", [e]));
a.handle("notes:save", (t, e) => {
  const s = typeof e.thumb == "string" ? e.thumb : "";
  return d("SELECT id FROM notes WHERE id = ?", [e.id]) ? m(
    "UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, thumb = ?, pinned = ?, updated_at = ? WHERE id = ?",
    [e.folder_id, e.title, e.content, e.preview, s, e.pinned, e.updated_at, e.id]
  ) : m(
    "INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [e.id, e.folder_id, e.title, e.content, e.preview, s, e.pinned, e.created_at, e.updated_at]
  ), e;
});
a.handle("notes:delete", (t, e) => (m("DELETE FROM notes WHERE id = ?", [e]), !0));
a.handle("notes:search", (t, e) => {
  const s = `%${e}%`;
  return !e || e.trim().length < 2 ? h(
    `SELECT ${w} FROM notes WHERE title LIKE ? OR preview LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [s, s]
  ) : h(
    `SELECT ${w} FROM notes WHERE title LIKE ? OR preview LIKE ? OR content LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [s, s, s]
  );
});
a.handle("images:selectAndSave", async () => {
  const t = await P.showOpenDialog(n, {
    title: "Seleccionar imagen",
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
    properties: ["openFile"]
  });
  if (t.canceled || !t.filePaths.length) return null;
  const e = t.filePaths[0], s = f.extname(e), r = `${ce()}${s}`, o = f.join(U, r);
  return p.copyFileSync(e, o), `file:///${o.replace(/\\/g, "/")}`;
});
a.handle("data:export", async () => {
  const t = await P.showSaveDialog(n, {
    title: "Exportar datos de CyberNotes",
    defaultPath: "cybernotes-export.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (t.canceled || !t.filePath) return !1;
  D();
  const e = h("SELECT * FROM folders"), s = h("SELECT * FROM notes"), r = { folders: e, notes: s, version: 1 };
  return p.writeFileSync(t.filePath, JSON.stringify(r, null, 2)), !0;
});
a.handle("data:import", async () => {
  const t = await P.showOpenDialog(n, {
    title: "Importar datos a CyberNotes",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (t.canceled || !t.filePaths.length) return !1;
  try {
    const e = JSON.parse(p.readFileSync(t.filePaths[0], "utf-8"));
    if (!e.folders || !e.notes) return !1;
    D();
    const s = L + ".backup-" + Date.now();
    p.existsSync(L) && p.copyFileSync(L, s);
    const r = [];
    for (const o of e.folders)
      r.push({
        sql: "INSERT OR REPLACE INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: [o.id, o.name, o.icon, o.color, o.sort_order, o.created_at]
      });
    for (const o of e.notes)
      r.push({
        sql: "INSERT OR REPLACE INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [o.id, o.folder_id, o.title, o.content, o.preview, o.thumb || "", o.pinned, o.created_at, o.updated_at]
      });
    return Q(r, { flushNow: !0 }), !0;
  } catch (e) {
    return console.error("Import error:", e), !1;
  }
});
const ge = c.requestSingleInstanceLock();
ge ? (c.on("second-instance", (t, e, s) => {
  _();
}), c.whenReady().then(async () => {
  X.defaultSession.setSpellCheckerLanguages(["es-ES", "en-US"]), await fe(), z(), me();
  const t = d("SELECT value FROM settings WHERE key = ?", ["caps_lock_sound_scope"]);
  (t == null ? void 0 : t.value) === "global" && G();
  const e = d("SELECT value FROM settings WHERE key = ?", ["auto_check_updates"]);
  ae(e ? e.value === "true" : !0), c.on("activate", () => {
    x.getAllWindows().length === 0 ? z() : _();
  });
}), c.on("window-all-closed", () => {
  process.platform !== "darwin" && (g || c.quit());
}), c.on("before-quit", () => {
  k = !0, Z(), D();
})) : c.quit();
a.handle("window-force-close", () => {
  k = !0, n == null || n.close();
});
a.handle("confirm-unsaved-exit-response", (t, e) => {
  e && (B = !1, k = !0, n == null || n.close());
});
