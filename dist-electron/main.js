import { BrowserWindow as j, ipcMain as a, app as c, shell as W, session as G, nativeImage as F, net as le, clipboard as ce, dialog as q, Tray as ue, Menu as de } from "electron";
import f from "path";
import p from "fs";
import V from "os";
import { fileURLToPath as Z } from "url";
import { createRequire as ee } from "module";
import { exec as te, spawn as fe } from "child_process";
const Ee = ee(import.meta.url), { autoUpdater: E } = Ee("electron-updater");
let N = !1;
function T(s) {
  for (const e of j.getAllWindows())
    e.webContents.send("update:status", s);
}
function pe(s) {
  N = s, E.autoDownload = !1, E.autoInstallOnAppQuit = !0, E.on("checking-for-update", () => T({ state: "checking" })), E.on("update-available", (e) => {
    T({ state: "available", version: e.version }), N && E.downloadUpdate().catch((n) => {
      T({ state: "error", message: String((n == null ? void 0 : n.message) || n) });
    });
  }), E.on("update-not-available", (e) => {
    T({ state: "not-available", version: e.version });
  }), E.on("download-progress", (e) => {
    T({ state: "downloading", percent: Math.round(e.percent) });
  }), E.on("update-downloaded", (e) => {
    T({ state: "downloaded", version: e.version });
  }), E.on("error", (e) => {
    T({ state: "error", message: String((e == null ? void 0 : e.message) || e) });
  }), ge(), N && setTimeout(() => {
    E.checkForUpdates().catch(() => {
    });
  }, 8e3);
}
function he(s) {
  N = s;
}
function ge() {
  a.handle("update:check", async () => {
    var s;
    try {
      const e = new Promise((r, o) => {
        setTimeout(() => o(new Error("Update check timed out")), 2e4);
      }), n = await Promise.race([
        E.checkForUpdates(),
        e
      ]);
      return { ok: !0, version: (s = n == null ? void 0 : n.updateInfo) == null ? void 0 : s.version };
    } catch (e) {
      return console.error("[Updater] Check failed:", e), { ok: !1, error: String((e == null ? void 0 : e.message) || e) };
    } finally {
    }
  }), a.handle("update:download", async () => {
    try {
      return await E.downloadUpdate(), { ok: !0 };
    } catch (s) {
      return { ok: !1, error: String((s == null ? void 0 : s.message) || s) };
    }
  }), a.handle("update:install", () => {
    E.quitAndInstall(!1, !0);
  });
}
const v = f.dirname(Z(import.meta.url)), z = ee(import.meta.url), I = !c.isPackaged;
let O = f.join(v, "..", "public", "icon.png");
I || (O = f.join(c.getAppPath(), "dist", "icon.png"));
if (!p.existsSync(O)) {
  const s = f.join(I ? f.join(v, "..", "public") : f.join(c.getAppPath(), "dist"), "icon.ico");
  p.existsSync(s) && (O = s);
}
const se = z("bcryptjs"), X = c.getPath("userData"), C = f.join(X, "cybernotes.db"), H = f.join(X, "images"), { v4: me } = z("uuid");
let d = null, P = null;
const L = "id, folder_id, title, preview, thumb, pinned, created_at, updated_at", Se = 1500;
let w = !1, R = null;
function K() {
  if (!d) return;
  const s = d.export();
  p.writeFileSync(C, Buffer.from(s)), w = !1;
}
function ne(s = Se) {
  w = !0, R && clearTimeout(R), R = setTimeout(() => {
    R = null, w && K();
  }, s);
}
function U() {
  R && (clearTimeout(R), R = null), (w || d) && w && K();
}
function ye(s, e, n) {
  h(`PRAGMA table_info(${s})`).some((o) => o.name === e) || d.run(`ALTER TABLE ${s} ADD COLUMN ${e} ${n}`);
}
async function Te() {
  const s = I ? f.join(v, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm") : f.join(process.resourcesPath, "sql-wasm.wasm");
  if (P = await z("sql.js")({
    locateFile: () => s
  }), p.existsSync(C)) {
    const n = p.readFileSync(C);
    d = new P.Database(n);
  } else
    d = new P.Database();
  d.run(`
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
  `), ye("notes", "thumb", "TEXT DEFAULT ''"), Re(), K(), p.existsSync(H) || p.mkdirSync(H, { recursive: !0 });
}
function Le(s) {
  if (!s || typeof s != "string") return "";
  if (s.trim().startsWith("{"))
    try {
      const n = JSON.parse(s);
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
      if (Array.isArray(n == null ? void 0 : n.content) && n.content.forEach(o), r) return r;
    } catch {
    }
  const e = s.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return (e == null ? void 0 : e[1]) || "";
}
function Re() {
  if (!d) return;
  const s = h(
    `SELECT id, content FROM notes
     WHERE (thumb IS NULL OR thumb = '')
       AND content IS NOT NULL AND content != ''
       AND (content LIKE '%<img%' OR content LIKE '%"type":"image"%' OR content LIKE '%"type": "image"%')`
  );
  if (s.length === 0) return;
  let e = 0;
  for (const n of s) {
    const r = Le(n.content);
    r && (d.run("UPDATE notes SET thumb = ? WHERE id = ?", [r, n.id]), e++);
  }
  e > 0 && (w = !0, console.log(`[CyberNotes] Backfilled thumbs for ${e} note(s)`));
}
function h(s, e = []) {
  if (!d) throw new Error("Base de datos no inicializada");
  const n = d.prepare(s);
  n.bind(e);
  const r = [];
  for (; n.step(); )
    r.push(n.getAsObject());
  return n.free(), r;
}
function u(s, e = []) {
  const n = h(s, e);
  return n.length > 0 ? n[0] : null;
}
function g(s, e = [], n) {
  if (!d) throw new Error("Base de datos no inicializada");
  d.run(s, e), ne();
}
function oe(s, e) {
  if (!d) throw new Error("Base de datos no inicializada");
  for (const n of s)
    d.run(n.sql, n.params ?? []);
  e != null && e.flushNow ? (w = !0, U()) : ne();
}
let t = null, m = null, A = !1, S = !1, D = Date.now(), _ = null;
function b() {
  return !!u("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
}
function we() {
  const s = u("SELECT value FROM settings WHERE key = ?", ["auto_lock_minutes"]), e = s ? parseInt(s.value, 10) : 0;
  return Number.isFinite(e) && e > 0 ? e * 60 * 1e3 : 0;
}
function re() {
  const s = we();
  return s <= 0 ? !1 : Date.now() - D >= s;
}
function $() {
  return b() ? S || re() : !1;
}
function be() {
  S = !0, t && !t.isDestroyed() && t.webContents.send("session:force-lock");
}
function Ce() {
  _ && clearInterval(_), _ = setInterval(() => {
    S || b() && re() && be();
  }, 5e3);
}
let Y = !1, y = null;
function ae() {
  if (y || process.platform !== "win32") return;
  const s = `
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
    y = fe("powershell", ["-Command", s]), y.stdout.on("data", (e) => {
      const r = e.toString().split(`
`);
      for (const o of r)
        if (o.trim().startsWith("STATE:")) {
          const i = o.trim().substring(6).toLowerCase() === "true";
          t && !t.isDestroyed() && t.webContents.send("global-caps-lock-changed", i);
        }
    }), y.on("exit", () => {
      y = null;
    });
  } catch (e) {
    console.error("Failed to start caps lock worker:", e);
  }
}
function ie() {
  y && (y.kill(), y = null);
}
function k() {
  if (!t || t.isDestroyed()) return;
  $() ? (S = !0, t.webContents.send("session:force-lock")) : t.webContents.send("session:shield-disable"), t.isMinimized() && t.restore();
  const e = u("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  (e == null ? void 0 : e.value) === "true" && t.maximize(), t.show(), t.setOpacity(1), t.focus();
}
function _e() {
  const s = u("SELECT value FROM settings WHERE key = ?", ["auto_unlock_caps_lock"]), e = (s == null ? void 0 : s.value) === "true", n = u("SELECT value FROM settings WHERE key = ?", ["language"]), o = ((n == null ? void 0 : n.value) || "en") === "es";
  return [
    { label: `CyberNotes  ·  v${c.getVersion()}`, enabled: !1 },
    { type: "separator" },
    { label: o ? "Abrir CyberNotes" : "Open CyberNotes", click: k },
    {
      label: o ? "Configuración" : "Settings",
      click: () => {
        k(), t && !t.isDestroyed() && t.webContents.send("open-settings");
      }
    },
    { type: "separator" },
    {
      label: o ? "Desactivar CapsLock por inactividad" : "Disable Caps Lock on inactivity",
      type: "checkbox",
      checked: e,
      click: (i) => {
        const l = i.checked;
        g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_unlock_caps_lock", l ? "true" : "false"]), J(), t && !t.isDestroyed() && t.webContents.send("setting-changed", { key: "auto_unlock_caps_lock", value: l ? "true" : "false" });
      }
    },
    { type: "separator" },
    {
      label: o ? "Salir" : "Quit",
      click: () => {
        A = !0, c.quit();
      }
    }
  ];
}
function J() {
  if (!(!m || m.isDestroyed()))
    try {
      const s = de.buildFromTemplate(_e());
      m.setContextMenu(s);
    } catch (s) {
      console.error("Failed to update tray menu:", s);
    }
}
function ke() {
  try {
    m = new ue(O), J(), m.setToolTip("CyberNotes"), m.on("click", () => {
      t != null && t.isVisible() ? (b() && t.webContents.send("session:shield-enable"), t.hide()) : k();
    });
  } catch (s) {
    console.error("Failed to create tray:", s);
  }
}
function Q() {
  const s = u("SELECT value FROM settings WHERE key = ?", ["window_bounds"]), e = u("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  let n = { width: 1100, height: 700, x: void 0, y: void 0 };
  if (s)
    try {
      const i = JSON.parse(s.value);
      i.width > 400 && i.height > 400 && (n = i);
    } catch {
    }
  t = new j({
    width: n.width,
    height: n.height,
    x: n.x,
    y: n.y,
    center: !n.x,
    minWidth: 900,
    minHeight: 600,
    frame: !1,
    titleBarStyle: "hidden",
    backgroundColor: "#0d0d14",
    icon: O,
    webPreferences: {
      preload: f.join(v, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      webSecurity: !1
    },
    show: !1
  });
  let r = null;
  const o = (i = !1) => {
    if (!t || t.isDestroyed()) return;
    const l = () => {
      if (!t || t.isDestroyed()) return;
      const M = t.isMaximized();
      g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["is_maximized", M ? "true" : "false"]);
      const x = t.getBounds();
      x.width > 100 && x.height > 100 && g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["window_bounds", JSON.stringify(x)]);
    };
    if (i) {
      r && clearTimeout(r), r = null, l();
      return;
    }
    r && clearTimeout(r), r = setTimeout(l, 500);
  };
  t.on("resize", () => o(!1)), t.on("move", () => o(!1)), t.on("close", () => o(!0)), t.on("maximize", () => o(!0)), t.on("unmaximize", () => o(!0)), t.on("hide", () => o(!0)), t.on("minimize", () => {
    b() && (t == null || t.webContents.send("session:shield-enable"));
    const i = u("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
    (i == null ? void 0 : i.value) === "true" && (t == null || t.hide());
  }), t.on("restore", () => {
    $() ? (S = !0, t == null || t.webContents.send("session:force-lock")) : t == null || t.webContents.send("session:shield-disable");
  }), t.on("show", () => {
    $() && (S = !0, t == null || t.webContents.send("session:force-lock"));
  }), t.on("close", (i) => {
    const l = u("SELECT value FROM settings WHERE key = ?", ["close_to_tray"]);
    if ((l == null ? void 0 : l.value) === "true" && !A)
      return i.preventDefault(), b() && (t == null || t.webContents.send("session:shield-enable")), t == null || t.hide(), !1;
    if (Y)
      return i.preventDefault(), k(), t == null || t.webContents.send("confirm-unsaved-exit"), !1;
    m && !m.isDestroyed() && (m.destroy(), m = null);
  }), t.webContents.setWindowOpenHandler(({ url: i }) => (i.startsWith("http") && W.openExternal(i), { action: "deny" })), t.webContents.on("context-menu", (i, l) => {
    i.preventDefault();
    const M = l.mediaType === "image" && l.srcURL || l.hasImageContents && l.srcURL ? l.srcURL : null;
    t == null || t.webContents.send("context-menu-data", {
      x: l.x,
      y: l.y,
      suggestions: l.dictionarySuggestions,
      misspelledWord: l.misspelledWord,
      linkURL: l.linkURL,
      imageSrc: M
    });
  }), I ? t.loadURL("http://localhost:5173") : t.loadFile(f.join(v, "../dist/index.html")), t.once("ready-to-show", () => {
    process.argv.includes("--hidden") || ((e == null ? void 0 : e.value) === "true" && (t == null || t.maximize()), t.show(), t.focus());
  });
}
a.handle("window-minimize", () => {
  b() && (t == null || t.webContents.send("session:shield-enable"));
  const s = u("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
  (s == null ? void 0 : s.value) === "true" ? t == null || t.hide() : t == null || t.minimize();
});
a.handle("window-maximize-toggle", () => {
  t != null && t.isMaximized() ? t.unmaximize() : t == null || t.maximize();
});
a.handle("window-close", () => t == null ? void 0 : t.close());
a.handle("window:unsavedChanges:set", (s, e) => {
  Y = e;
});
a.handle("open-dev-tools", () => t == null ? void 0 : t.webContents.openDevTools({ mode: "detach" }));
a.handle("open-data-folder", () => W.openPath(X));
a.handle("replace-misspelling", (s, e) => t == null ? void 0 : t.webContents.replaceMisspelling(e));
a.handle("add-to-dictionary", (s, e) => {
  G.defaultSession.addWordToSpellCheckerDictionary(e);
});
a.handle("clipboard:writeImage", async (s, e) => {
  try {
    if (!e || typeof e != "string") return !1;
    let n = F.createEmpty();
    if (e.startsWith("data:"))
      n = F.createFromDataURL(e);
    else if (e.startsWith("file:")) {
      let r;
      try {
        r = Z(e);
      } catch {
        r = decodeURIComponent(e.replace(/^file:\/\//i, "").replace(/^\//, ""));
      }
      if (!p.existsSync(r)) return !1;
      n = F.createFromPath(r);
    } else {
      const r = await le.fetch(e);
      if (!r.ok) return !1;
      const o = Buffer.from(await r.arrayBuffer());
      n = F.createFromBuffer(o);
    }
    return n.isEmpty() ? !1 : (ce.writeImage(n), !0);
  } catch (n) {
    return console.error("[CyberNotes] clipboard:writeImage failed:", n), !1;
  }
});
a.handle("unlock-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((s) => {
  te(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Control]::IsKeyLocked('CapsLock')) { (New-Object -ComObject WScript.Shell).SendKeys('{CAPSLOCK}'); Write-Host 'unlocked' } else { Write-Host 'already-off' }"`, (n, r) => {
    if (n)
      console.error("Failed to unlock caps lock:", n), s(!1);
    else {
      const o = r.trim();
      s(o === "unlocked" || o === "already-off");
    }
  });
}));
a.handle("check-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((s) => {
  te(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')"`, (n, r) => {
    s(n ? !1 : r.trim().toLowerCase() === "true");
  });
}));
a.handle("app:getVersions", () => ({
  app: c.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  osRelease: V.release(),
  osType: V.type()
}));
a.handle("shell:openExternal", (s, e) => typeof e == "string" && /^https?:\/\//i.test(e) ? W.openExternal(e) : !1);
a.handle("auth:hasPassword", () => !!u("SELECT value FROM settings WHERE key = ?", ["password_hash"]));
a.handle("session:activity", () => (D = Date.now(), !0));
a.handle("session:set-locked", (s, e) => (S = !!e, e || (D = Date.now()), !0));
a.on("session:locked", () => {
  S = !0;
});
a.handle("auth:setPassword", async (s, e) => {
  const n = await se.hash(e, 10);
  return g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["password_hash", n]), S = !1, D = Date.now(), t && !t.isDestroyed() && t.webContents.send("setting-changed", { key: "password_hash", value: "set" }), !0;
});
a.handle("auth:verifyPassword", async (s, e) => {
  const n = u("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
  return n ? se.compare(e, n.value) : !0;
});
a.handle("auth:removePassword", () => (g("DELETE FROM settings WHERE key = ?", ["password_hash"]), S = !1, t && !t.isDestroyed() && (t.webContents.send("setting-changed", { key: "password_hash", value: "removed" }), t.webContents.send("session:shield-disable")), !0));
a.handle("settings:get", (s, e) => {
  const n = u("SELECT value FROM settings WHERE key = ?", [e]);
  return n ? n.value : null;
});
a.handle("settings:getMany", (s, e) => {
  const n = {};
  if (!Array.isArray(e)) return n;
  for (const r of e) {
    const o = u("SELECT value FROM settings WHERE key = ?", [r]);
    n[r] = o ? o.value : null;
  }
  return n;
});
a.handle("settings:set", (s, e, n) => (g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [e, n]), (e === "auto_unlock_caps_lock" || e === "language") && J(), e === "caps_lock_sound_scope" && (n === "global" ? ae() : ie()), e === "auto_check_updates" && he(n === "true"), !0));
const B = ["--hidden"];
function ve() {
  if (c.getLoginItemSettings({ args: [...B] }).openAtLogin) return !0;
  const s = c.getLoginItemSettings();
  return !!(s.openAtLogin || process.platform === "win32" && s.executableWillLaunchAtLogin);
}
function Oe(s) {
  s ? (c.setLoginItemSettings({ openAtLogin: !1, args: [] }), c.setLoginItemSettings({
    openAtLogin: !0,
    openAsHidden: !0,
    // macOS only; ignored on Windows
    args: [...B]
  })) : (c.setLoginItemSettings({ openAtLogin: !1, args: [...B] }), c.setLoginItemSettings({ openAtLogin: !1, args: [] }));
}
a.handle("settings:setAutoStart", (s, e) => (Oe(!!e), g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_start", e ? "true" : "false"]), !0));
a.handle("settings:getAutoStart", () => ve());
a.handle("folders:getAll", () => h("SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC"));
a.handle("folders:create", (s, e) => (g(
  "INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  [e.id, e.name, e.icon, e.color, e.sort_order, e.created_at]
), e));
a.handle("folders:update", (s, e) => (g(
  "UPDATE folders SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?",
  [e.name, e.icon, e.color, e.sort_order, e.id]
), !0));
a.handle("folders:delete", (s, e) => (oe([
  { sql: "DELETE FROM notes WHERE folder_id = ?", params: [e] },
  { sql: "DELETE FROM folders WHERE id = ?", params: [e] }
]), !0));
a.handle("notes:getAll", () => h(`SELECT ${L} FROM notes ORDER BY pinned DESC, updated_at DESC`));
a.handle("notes:getByFolder", (s, e) => e === "floating" ? h(`SELECT ${L} FROM notes WHERE folder_id IS NULL OR folder_id = "" ORDER BY pinned DESC, updated_at DESC`) : e === "favorites" ? h(`SELECT ${L} FROM notes WHERE pinned = 1 ORDER BY updated_at DESC`) : e ? h(`SELECT ${L} FROM notes WHERE folder_id = ? ORDER BY pinned DESC, updated_at DESC`, [e]) : h(`SELECT ${L} FROM notes ORDER BY pinned DESC, updated_at DESC`));
a.handle("notes:getById", (s, e) => u("SELECT * FROM notes WHERE id = ?", [e]));
a.handle("notes:save", (s, e) => {
  const n = typeof e.thumb == "string" ? e.thumb : "";
  return u("SELECT id FROM notes WHERE id = ?", [e.id]) ? g(
    "UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, thumb = ?, pinned = ?, updated_at = ? WHERE id = ?",
    [e.folder_id, e.title, e.content, e.preview, n, e.pinned, e.updated_at, e.id]
  ) : g(
    "INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [e.id, e.folder_id, e.title, e.content, e.preview, n, e.pinned, e.created_at, e.updated_at]
  ), e;
});
a.handle("notes:delete", (s, e) => (g("DELETE FROM notes WHERE id = ?", [e]), !0));
a.handle("notes:search", (s, e) => {
  const n = `%${e}%`;
  return !e || e.trim().length < 2 ? h(
    `SELECT ${L} FROM notes WHERE title LIKE ? OR preview LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [n, n]
  ) : h(
    `SELECT ${L} FROM notes WHERE title LIKE ? OR preview LIKE ? OR content LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [n, n, n]
  );
});
a.handle("images:selectAndSave", async () => {
  const s = await q.showOpenDialog(t, {
    title: "Seleccionar imagen",
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
    properties: ["openFile"]
  });
  if (s.canceled || !s.filePaths.length) return null;
  const e = s.filePaths[0], n = f.extname(e), r = `${me()}${n}`, o = f.join(H, r);
  return p.copyFileSync(e, o), `file:///${o.replace(/\\/g, "/")}`;
});
a.handle("data:export", async () => {
  const s = await q.showSaveDialog(t, {
    title: "Exportar datos de CyberNotes",
    defaultPath: "cybernotes-export.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (s.canceled || !s.filePath) return !1;
  U();
  const e = h("SELECT * FROM folders"), n = h("SELECT * FROM notes"), r = { folders: e, notes: n, version: 1 };
  return p.writeFileSync(s.filePath, JSON.stringify(r, null, 2)), !0;
});
a.handle("data:import", async () => {
  const s = await q.showOpenDialog(t, {
    title: "Importar datos a CyberNotes",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (s.canceled || !s.filePaths.length) return !1;
  try {
    const e = JSON.parse(p.readFileSync(s.filePaths[0], "utf-8"));
    if (!e.folders || !e.notes) return !1;
    U();
    const n = C + ".backup-" + Date.now();
    p.existsSync(C) && p.copyFileSync(C, n);
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
    return oe(r, { flushNow: !0 }), !0;
  } catch (e) {
    return console.error("Import error:", e), !1;
  }
});
const Ae = c.requestSingleInstanceLock();
Ae ? (c.on("second-instance", (s, e, n) => {
  k();
}), c.whenReady().then(async () => {
  G.defaultSession.setSpellCheckerLanguages(["es-ES", "en-US"]), await Te(), S = b(), D = Date.now(), Ce(), Q(), ke();
  const s = u("SELECT value FROM settings WHERE key = ?", ["caps_lock_sound_scope"]);
  (s == null ? void 0 : s.value) === "global" && ae();
  const e = u("SELECT value FROM settings WHERE key = ?", ["auto_check_updates"]);
  pe(e ? e.value === "true" : !0), c.on("activate", () => {
    j.getAllWindows().length === 0 ? Q() : k();
  });
}), c.on("window-all-closed", () => {
  process.platform !== "darwin" && (m || c.quit());
}), c.on("before-quit", () => {
  A = !0, _ && (clearInterval(_), _ = null), ie(), U();
})) : c.quit();
a.handle("window-force-close", () => {
  A = !0, t == null || t.close();
});
a.handle("confirm-unsaved-exit-response", (s, e) => {
  e && (Y = !1, A = !0, t == null || t.close());
});
