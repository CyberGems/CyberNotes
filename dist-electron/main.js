import { BrowserWindow as X, ipcMain as i, app as l, shell as le, session as we, nativeImage as q, net as Ne, clipboard as xe, dialog as ce, globalShortcut as te, Tray as Fe, screen as B } from "electron";
import d from "path";
import E from "fs";
import me from "os";
import { fileURLToPath as Te } from "url";
import { createRequire as be } from "module";
import { exec as Le, spawn as Ie } from "child_process";
const Me = be(import.meta.url), { autoUpdater: g } = Me("electron-updater");
let W = !1;
function O(s) {
  for (const e of X.getAllWindows())
    e.webContents.send("update:status", s);
}
function Pe(s) {
  W = s, g.autoDownload = !1, g.autoInstallOnAppQuit = !0, g.on("checking-for-update", () => O({ state: "checking" })), g.on("update-available", (e) => {
    O({ state: "available", version: e.version }), W && g.downloadUpdate().catch((n) => {
      O({ state: "error", message: String((n == null ? void 0 : n.message) || n) });
    });
  }), g.on("update-not-available", (e) => {
    O({ state: "not-available", version: e.version });
  }), g.on("download-progress", (e) => {
    O({ state: "downloading", percent: Math.round(e.percent) });
  }), g.on("update-downloaded", (e) => {
    O({ state: "downloaded", version: e.version });
  }), g.on("error", (e) => {
    O({ state: "error", message: String((e == null ? void 0 : e.message) || e) });
  }), He(), W && setTimeout(() => {
    g.checkForUpdates().catch(() => {
    });
  }, 8e3);
}
function Ue(s) {
  W = s;
}
function He() {
  i.handle("update:check", async () => {
    var s;
    try {
      const e = new Promise((o, r) => {
        setTimeout(() => r(new Error("Update check timed out")), 2e4);
      }), n = await Promise.race([
        g.checkForUpdates(),
        e
      ]);
      return { ok: !0, version: (s = n == null ? void 0 : n.updateInfo) == null ? void 0 : s.version };
    } catch (e) {
      return console.error("[Updater] Check failed:", e), { ok: !1, error: String((e == null ? void 0 : e.message) || e) };
    } finally {
    }
  }), i.handle("update:download", async () => {
    try {
      return await g.downloadUpdate(), { ok: !0 };
    } catch (s) {
      return { ok: !1, error: String((s == null ? void 0 : s.message) || s) };
    }
  }), i.handle("update:install", () => {
    g.quitAndInstall(!1, !0);
  });
}
const _ = d.dirname(Te(import.meta.url)), ue = be(import.meta.url), N = !l.isPackaged;
let P = d.join(_, "..", "public", "icon.png");
N || (P = d.join(l.getAppPath(), "dist", "icon.png"));
if (!E.existsSync(P)) {
  const s = d.join(N ? d.join(_, "..", "public") : d.join(l.getAppPath(), "dist"), "icon.ico");
  E.existsSync(s) && (P = s);
}
let se = d.join(N ? d.join(_, "..", "public") : d.join(l.getAppPath(), "dist"), "icon.ico");
E.existsSync(se) || (se = P);
const Re = ue("bcryptjs"), de = l.getPath("userData"), F = d.join(de, "cybernotes.db"), ne = d.join(de, "images"), { v4: je } = ue("uuid");
let p = null, ee = null;
const v = "id, folder_id, title, preview, thumb, pinned, created_at, updated_at", $e = 1500;
let x = !1, D = null;
function fe() {
  if (!p) return;
  const s = p.export();
  E.writeFileSync(F, Buffer.from(s)), x = !1;
}
function Ce(s = $e) {
  x = !0, D && clearTimeout(D), D = setTimeout(() => {
    D = null, x && fe();
  }, s);
}
function Y() {
  D && (clearTimeout(D), D = null), (x || p) && x && fe();
}
function ze(s, e, n) {
  y(`PRAGMA table_info(${s})`).some((r) => r.name === e) || p.run(`ALTER TABLE ${s} ADD COLUMN ${e} ${n}`);
}
async function qe() {
  const s = N ? d.join(_, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm") : d.join(process.resourcesPath, "sql-wasm.wasm");
  if (ee = await ue("sql.js")({
    locateFile: () => s
  }), E.existsSync(F)) {
    const n = E.readFileSync(F);
    p = new ee.Database(n);
  } else
    p = new ee.Database();
  p.run(`
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
  `), ze("notes", "thumb", "TEXT DEFAULT ''"), We(), fe(), E.existsSync(ne) || E.mkdirSync(ne, { recursive: !0 });
}
function Be(s) {
  if (!s || typeof s != "string") return "";
  if (s.trim().startsWith("{"))
    try {
      const n = JSON.parse(s);
      let o = "";
      const r = (a) => {
        var c;
        if (!o) {
          if ((a == null ? void 0 : a.type) === "image" && ((c = a.attrs) != null && c.src)) {
            o = String(a.attrs.src);
            return;
          }
          Array.isArray(a == null ? void 0 : a.content) && a.content.forEach(r);
        }
      };
      if (Array.isArray(n == null ? void 0 : n.content) && n.content.forEach(r), o) return o;
    } catch {
    }
  const e = s.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return (e == null ? void 0 : e[1]) || "";
}
function We() {
  if (!p) return;
  const s = y(
    `SELECT id, content FROM notes
     WHERE (thumb IS NULL OR thumb = '')
       AND content IS NOT NULL AND content != ''
       AND (content LIKE '%<img%' OR content LIKE '%"type":"image"%' OR content LIKE '%"type": "image"%')`
  );
  if (s.length === 0) return;
  let e = 0;
  for (const n of s) {
    const o = Be(n.content);
    o && (p.run("UPDATE notes SET thumb = ? WHERE id = ?", [o, n.id]), e++);
  }
  e > 0 && (x = !0, console.log(`[CyberNotes] Backfilled thumbs for ${e} note(s)`));
}
function y(s, e = []) {
  if (!p) throw new Error("Base de datos no inicializada");
  const n = p.prepare(s);
  n.bind(e);
  const o = [];
  for (; n.step(); )
    o.push(n.getAsObject());
  return n.free(), o;
}
function f(s, e = []) {
  const n = y(s, e);
  return n.length > 0 ? n[0] : null;
}
function S(s, e = [], n) {
  if (!p) throw new Error("Base de datos no inicializada");
  p.run(s, e), Ce();
}
function _e(s, e) {
  if (!p) throw new Error("Base de datos no inicializada");
  for (const n of s)
    p.run(n.sql, n.params ?? []);
  e != null && e.flushNow ? (x = !0, Y()) : Ce();
}
let t = null, m = null, U = !1, w = !1, H = Date.now(), I = null;
function b() {
  return !!f("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
}
function Xe() {
  const s = f("SELECT value FROM settings WHERE key = ?", ["auto_lock_minutes"]), e = s ? parseInt(s.value, 10) : 0;
  return Number.isFinite(e) && e > 0 ? e * 60 * 1e3 : 0;
}
function Ae() {
  const s = Xe();
  return s <= 0 ? !1 : Date.now() - H >= s;
}
function oe() {
  return b() ? w || Ae() : !1;
}
function Ye() {
  w = !0, t && !t.isDestroyed() && t.webContents.send("session:force-lock");
}
function Ke() {
  I && clearInterval(I), I = setInterval(() => {
    w || b() && Ae() && Ye();
  }, 5e3);
}
let he = !1, R = null;
function ke() {
  if (R || process.platform !== "win32") return;
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
    R = Ie("powershell", ["-Command", s]), R.stdout.on("data", (e) => {
      const o = e.toString().split(`
`);
      for (const r of o)
        if (r.trim().startsWith("STATE:")) {
          const a = r.trim().substring(6).toLowerCase() === "true";
          t && !t.isDestroyed() && t.webContents.send("global-caps-lock-changed", a);
        }
    }), R.on("exit", () => {
      R = null;
    });
  } catch (e) {
    console.error("Failed to start caps lock worker:", e);
  }
}
function Oe() {
  R && (R.kill(), R = null);
}
function C() {
  if (!t || t.isDestroyed()) return;
  oe() ? (w = !0, t.webContents.send("session:force-lock")) : t.webContents.send("session:shield-disable"), t.isMinimized() && t.restore();
  const e = f("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  (e == null ? void 0 : e.value) === "true" && t.maximize(), t.show(), t.setOpacity(1), t.focus();
}
const K = 26, pe = 268, Ee = 220;
let u = null, re = null, T = null, ve = 0;
function ge() {
  return !!(t && !t.isDestroyed() && t.isVisible());
}
function ye() {
  const s = f("SELECT value FROM settings WHERE key = ?", ["language"]), n = ((s == null ? void 0 : s.value) || "en") === "es", o = ge();
  return {
    version: l.getVersion(),
    head: "CyberNotes v" + l.getVersion(),
    visible: o,
    showLabel: o ? n ? "Ocultar CyberNotes" : "Hide CyberNotes" : n ? "Abrir CyberNotes" : "Open CyberNotes",
    settingsLabel: n ? "Configuración" : "Settings",
    aboutLabel: n ? "Acerca de..." : "About...",
    exitLabel: n ? "Salir" : "Quit",
    shortcut: "Alt+Shift+N"
  };
}
function Ve() {
  try {
    te.unregisterAll(), te.register("Alt+Shift+N", () => {
      !t || t.isDestroyed() || (ge() ? (b() && t.webContents.send("session:shield-enable"), t.hide()) : C());
    });
  } catch (s) {
    console.error("Failed to register global hotkey Alt+Shift+N:", s);
  }
}
function De(s, e, n) {
  let o = s && typeof s.x == "number" && (s.width || s.height) ? { x: s.x, y: s.y, width: s.width || 0, height: s.height || 0 } : null;
  if (!o) {
    let M = null;
    try {
      M = B.getCursorScreenPoint();
    } catch {
      M = { x: 0, y: 0 };
    }
    o = { x: M.x, y: M.y, width: 0, height: 0 };
  }
  const r = o.x + o.width / 2, a = o.y + o.height / 2;
  let c;
  try {
    c = B.getDisplayNearestPoint({ x: r, y: a });
  } catch {
    c = B.getPrimaryDisplay();
  }
  const h = c && c.workArea || { x: 0, y: 0, width: e, height: n }, L = 4, j = K, $ = e - 2 * j, z = n - 2 * j;
  let A, k;
  const J = r - h.x, G = h.x + h.width - r, Q = a - h.y, Z = h.y + h.height - a;
  return Z <= J && Z <= G && Z <= Q ? (A = r - $ / 2, k = o.y - L - z) : Q <= J && Q <= G ? (A = r - $ / 2, k = o.y + o.height + L) : J <= G ? (A = o.x + o.width + L, k = a - z / 2) : (A = o.x - L - $, k = a - z / 2), A = Math.min(Math.max(A, h.x + 4), h.x + h.width - $ - 4), k = Math.min(Math.max(k, h.y + 4), h.y + h.height - z - 4), { x: Math.round(A - j), y: Math.round(k - j), width: e, height: n };
}
function Je() {
  if (u && !u.isDestroyed()) return u;
  const s = N ? d.join(_, "..", "public", "tray-menu.html") : d.join(l.getAppPath(), "dist", "tray-menu.html"), e = N ? d.join(_, "..", "public", "tray-preload.js") : d.join(l.getAppPath(), "dist", "tray-preload.js");
  return u = new X({
    width: pe + 2 * K,
    height: Ee,
    show: !1,
    frame: !1,
    transparent: !0,
    hasShadow: !1,
    resizable: !1,
    minimizable: !1,
    maximizable: !1,
    fullscreenable: !1,
    skipTaskbar: !0,
    alwaysOnTop: !0,
    focusable: !0,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: e,
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !0
    }
  }), u.setAlwaysOnTop(!0, "pop-up-menu"), u.loadFile(s), u.on("blur", () => {
    T || Date.now() - ve < 250 || (T = setTimeout(() => {
      T = null, V();
    }, 120));
  }), u.on("closed", () => {
    u = null;
  }), u.webContents.once("did-finish-load", () => {
    !u || u.isDestroyed() || (u.webContents.send("tray-menu-state", ye()), u.webContents.send("tray-menu-show"));
  }), u;
}
function Ge(s) {
  if (!m) return;
  let e = s && typeof s.x == "number" && (s.width || s.height) ? s : null;
  if (!e)
    try {
      e = m.getBounds();
    } catch {
      e = null;
    }
  if (!e || !e.width && !e.height) {
    let r = null;
    try {
      r = B.getCursorScreenPoint();
    } catch {
      r = null;
    }
    e = r ? { x: r.x, y: r.y, width: 0, height: 0 } : { x: 0, y: 0, width: 0, height: 0 };
  }
  re = e, T && (clearTimeout(T), T = null);
  const n = Je();
  if (!n || n.isDestroyed()) return;
  const o = De(re, pe + 2 * K, Ee);
  n.setBounds(o), n.isVisible() || n.show(), n.focus(), ve = Date.now(), n.webContents.isLoading() || (n.webContents.send("tray-menu-state", ye()), n.webContents.send("tray-menu-show"));
}
function V() {
  T && (clearTimeout(T), T = null), u && !u.isDestroyed() && u.isVisible() && u.hide();
}
function ie() {
  m && (m.setToolTip(`CyberNotes v${l.getVersion()}`), u && !u.isDestroyed() && !u.webContents.isLoading() && u.webContents.send("tray-menu-state", ye()));
}
function Qe() {
  try {
    m = new Fe(se), m.setToolTip(`CyberNotes v${l.getVersion()}`), m.on("click", () => {
      V(), !(!t || t.isDestroyed()) && (t.isVisible() ? (b() && t.webContents.send("session:shield-enable"), t.hide()) : C());
    }), m.on("right-click", (s, e) => {
      Ge(e);
    });
  } catch (s) {
    console.error("Failed to create tray:", s);
  }
}
i.on("tray-menu-action", (s, e) => {
  switch (V(), e) {
    case "toggle":
      ge() ? (b() && (t == null || t.webContents.send("session:shield-enable")), t == null || t.hide()) : C();
      break;
    case "settings":
      C(), t && !t.isDestroyed() && t.webContents.send("open-settings");
      break;
    case "about":
      C(), t && !t.isDestroyed() && t.webContents.send("open-about");
      break;
    case "quit":
      U = !0, l.quit();
      break;
  }
});
i.on("tray-menu-hide", () => V());
i.on("tray-menu-ready", (s, e) => {
  if (!u || u.isDestroyed() || !e) return;
  const n = K, o = Math.round((e.width || pe) + 2 * n), r = Math.round((e.height || Ee - 2 * n) + 2 * n), a = De(re, o, r);
  u.setBounds(a);
});
function Se() {
  const s = f("SELECT value FROM settings WHERE key = ?", ["window_bounds"]), e = f("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  let n = { width: 1100, height: 700, x: void 0, y: void 0 };
  if (s)
    try {
      const a = JSON.parse(s.value);
      a.width > 400 && a.height > 400 && (n = a);
    } catch {
    }
  t = new X({
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
    icon: P,
    webPreferences: {
      preload: d.join(_, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      webSecurity: !1
    },
    show: !1
  });
  let o = null;
  const r = (a = !1) => {
    if (!t || t.isDestroyed()) return;
    const c = () => {
      if (!t || t.isDestroyed()) return;
      const h = t.isMaximized();
      S("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["is_maximized", h ? "true" : "false"]);
      const L = t.getBounds();
      L.width > 100 && L.height > 100 && S("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["window_bounds", JSON.stringify(L)]);
    };
    if (a) {
      o && clearTimeout(o), o = null, c();
      return;
    }
    o && clearTimeout(o), o = setTimeout(c, 500);
  };
  t.on("resize", () => r(!1)), t.on("move", () => r(!1)), t.on("close", () => r(!0)), t.on("maximize", () => {
    r(!0), t == null || t.webContents.send("window:maximized-state", !0);
  }), t.on("unmaximize", () => {
    r(!0), t == null || t.webContents.send("window:maximized-state", !1);
  }), t.on("hide", () => {
    r(!0), ie();
  }), t.on("minimize", () => {
    b() && (t == null || t.webContents.send("session:shield-enable"));
    const a = f("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
    (a == null ? void 0 : a.value) === "true" && (t == null || t.hide());
  }), t.on("restore", () => {
    oe() ? (w = !0, t == null || t.webContents.send("session:force-lock")) : t == null || t.webContents.send("session:shield-disable");
  }), t.on("show", () => {
    oe() && (w = !0, t == null || t.webContents.send("session:force-lock")), ie();
  }), t.on("close", (a) => {
    const c = f("SELECT value FROM settings WHERE key = ?", ["close_to_tray"]);
    if ((c == null ? void 0 : c.value) === "true" && !U)
      return a.preventDefault(), b() && (t == null || t.webContents.send("session:shield-enable")), t == null || t.hide(), !1;
    if (he)
      return a.preventDefault(), C(), t == null || t.webContents.send("confirm-unsaved-exit"), !1;
    m && !m.isDestroyed() && (m.destroy(), m = null);
  }), t.webContents.setWindowOpenHandler(({ url: a }) => (a.startsWith("http") && le.openExternal(a), { action: "deny" })), t.webContents.on("context-menu", (a, c) => {
    a.preventDefault();
    const h = c.mediaType === "image" && c.srcURL || c.hasImageContents && c.srcURL ? c.srcURL : null;
    t == null || t.webContents.send("context-menu-data", {
      x: c.x,
      y: c.y,
      suggestions: c.dictionarySuggestions,
      misspelledWord: c.misspelledWord,
      linkURL: c.linkURL,
      imageSrc: h
    });
  }), N ? t.loadURL("http://localhost:5173") : t.loadFile(d.join(_, "../dist/index.html")), t.once("ready-to-show", () => {
    process.argv.includes("--hidden") || ((e == null ? void 0 : e.value) === "true" && (t == null || t.maximize()), t.show(), t.focus());
  });
}
i.handle("window-minimize", () => {
  b() && (t == null || t.webContents.send("session:shield-enable"));
  const s = f("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
  (s == null ? void 0 : s.value) === "true" ? t == null || t.hide() : t == null || t.minimize();
});
i.handle("window-maximize-toggle", () => {
  t != null && t.isMaximized() ? t.unmaximize() : t == null || t.maximize();
});
i.handle("window:is-maximized", () => !!(t && !t.isDestroyed() && t.isMaximized()));
i.handle("window-close", () => t == null ? void 0 : t.close());
i.handle("window:unsavedChanges:set", (s, e) => {
  he = e;
});
i.handle("open-dev-tools", () => t == null ? void 0 : t.webContents.openDevTools({ mode: "detach" }));
i.handle("open-data-folder", () => le.openPath(de));
i.handle("replace-misspelling", (s, e) => t == null ? void 0 : t.webContents.replaceMisspelling(e));
i.handle("add-to-dictionary", (s, e) => {
  we.defaultSession.addWordToSpellCheckerDictionary(e);
});
i.handle("clipboard:writeImage", async (s, e) => {
  try {
    if (!e || typeof e != "string") return !1;
    let n = q.createEmpty();
    if (e.startsWith("data:"))
      n = q.createFromDataURL(e);
    else if (e.startsWith("file:")) {
      let o;
      try {
        o = Te(e);
      } catch {
        o = decodeURIComponent(e.replace(/^file:\/\//i, "").replace(/^\//, ""));
      }
      if (!E.existsSync(o)) return !1;
      n = q.createFromPath(o);
    } else {
      const o = await Ne.fetch(e);
      if (!o.ok) return !1;
      const r = Buffer.from(await o.arrayBuffer());
      n = q.createFromBuffer(r);
    }
    return n.isEmpty() ? !1 : (xe.writeImage(n), !0);
  } catch (n) {
    return console.error("[CyberNotes] clipboard:writeImage failed:", n), !1;
  }
});
i.handle("unlock-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((s) => {
  Le(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Control]::IsKeyLocked('CapsLock')) { (New-Object -ComObject WScript.Shell).SendKeys('{CAPSLOCK}'); Write-Host 'unlocked' } else { Write-Host 'already-off' }"`, (n, o) => {
    if (n)
      console.error("Failed to unlock caps lock:", n), s(!1);
    else {
      const r = o.trim();
      s(r === "unlocked" || r === "already-off");
    }
  });
}));
i.handle("check-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((s) => {
  Le(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')"`, (n, o) => {
    s(n ? !1 : o.trim().toLowerCase() === "true");
  });
}));
i.handle("app:getVersions", () => ({
  app: l.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  osRelease: me.release(),
  osType: me.type()
}));
i.handle("shell:openExternal", (s, e) => typeof e == "string" && /^https?:\/\//i.test(e) ? le.openExternal(e) : !1);
i.handle("auth:hasPassword", () => !!f("SELECT value FROM settings WHERE key = ?", ["password_hash"]));
i.handle("session:activity", () => (H = Date.now(), !0));
i.handle("session:set-locked", (s, e) => (w = !!e, e || (H = Date.now()), !0));
i.on("session:locked", () => {
  w = !0;
});
i.handle("auth:setPassword", async (s, e) => {
  const n = await Re.hash(e, 10);
  return S("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["password_hash", n]), w = !1, H = Date.now(), t && !t.isDestroyed() && t.webContents.send("setting-changed", { key: "password_hash", value: "set" }), !0;
});
i.handle("auth:verifyPassword", async (s, e) => {
  const n = f("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
  return n ? Re.compare(e, n.value) : !0;
});
i.handle("auth:removePassword", () => (S("DELETE FROM settings WHERE key = ?", ["password_hash"]), w = !1, t && !t.isDestroyed() && (t.webContents.send("setting-changed", { key: "password_hash", value: "removed" }), t.webContents.send("session:shield-disable")), !0));
i.handle("settings:get", (s, e) => {
  const n = f("SELECT value FROM settings WHERE key = ?", [e]);
  return n ? n.value : null;
});
i.handle("settings:getMany", (s, e) => {
  const n = {};
  if (!Array.isArray(e)) return n;
  for (const o of e) {
    const r = f("SELECT value FROM settings WHERE key = ?", [o]);
    n[o] = r ? r.value : null;
  }
  return n;
});
i.handle("settings:set", (s, e, n) => (S("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [e, n]), (e === "auto_unlock_caps_lock" || e === "language") && ie(), e === "caps_lock_sound_scope" && (n === "global" ? ke() : Oe()), e === "auto_check_updates" && Ue(n === "true"), !0));
const ae = ["--hidden"];
function Ze() {
  if (l.getLoginItemSettings({ args: [...ae] }).openAtLogin) return !0;
  const s = l.getLoginItemSettings();
  return !!(s.openAtLogin || process.platform === "win32" && s.executableWillLaunchAtLogin);
}
function et(s) {
  s ? (l.setLoginItemSettings({ openAtLogin: !1, args: [] }), l.setLoginItemSettings({
    openAtLogin: !0,
    openAsHidden: !0,
    // macOS only; ignored on Windows
    args: [...ae]
  })) : (l.setLoginItemSettings({ openAtLogin: !1, args: [...ae] }), l.setLoginItemSettings({ openAtLogin: !1, args: [] }));
}
i.handle("settings:setAutoStart", (s, e) => (et(!!e), S("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_start", e ? "true" : "false"]), !0));
i.handle("settings:getAutoStart", () => Ze());
i.handle("folders:getAll", () => y("SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC"));
i.handle("folders:create", (s, e) => (S(
  "INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  [e.id, e.name, e.icon, e.color, e.sort_order, e.created_at]
), e));
i.handle("folders:update", (s, e) => (S(
  "UPDATE folders SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?",
  [e.name, e.icon, e.color, e.sort_order, e.id]
), !0));
i.handle("folders:delete", (s, e) => (_e([
  { sql: "DELETE FROM notes WHERE folder_id = ?", params: [e] },
  { sql: "DELETE FROM folders WHERE id = ?", params: [e] }
]), !0));
i.handle("notes:getAll", () => y(`SELECT ${v} FROM notes ORDER BY pinned DESC, updated_at DESC`));
i.handle("notes:getByFolder", (s, e) => e === "floating" ? y(`SELECT ${v} FROM notes WHERE folder_id IS NULL OR folder_id = "" ORDER BY pinned DESC, updated_at DESC`) : e === "favorites" ? y(`SELECT ${v} FROM notes WHERE pinned = 1 ORDER BY updated_at DESC`) : e ? y(`SELECT ${v} FROM notes WHERE folder_id = ? ORDER BY pinned DESC, updated_at DESC`, [e]) : y(`SELECT ${v} FROM notes ORDER BY pinned DESC, updated_at DESC`));
i.handle("notes:getById", (s, e) => f("SELECT * FROM notes WHERE id = ?", [e]));
i.handle("notes:save", (s, e) => {
  const n = typeof e.thumb == "string" ? e.thumb : "";
  return f("SELECT id FROM notes WHERE id = ?", [e.id]) ? S(
    "UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, thumb = ?, pinned = ?, updated_at = ? WHERE id = ?",
    [e.folder_id, e.title, e.content, e.preview, n, e.pinned, e.updated_at, e.id]
  ) : S(
    "INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [e.id, e.folder_id, e.title, e.content, e.preview, n, e.pinned, e.created_at, e.updated_at]
  ), e;
});
i.handle("notes:delete", (s, e) => (S("DELETE FROM notes WHERE id = ?", [e]), !0));
i.handle("notes:search", (s, e) => {
  const n = `%${e}%`;
  return !e || e.trim().length < 2 ? y(
    `SELECT ${v} FROM notes WHERE title LIKE ? OR preview LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [n, n]
  ) : y(
    `SELECT ${v} FROM notes WHERE title LIKE ? OR preview LIKE ? OR content LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [n, n, n]
  );
});
i.handle("images:selectAndSave", async () => {
  const s = await ce.showOpenDialog(t, {
    title: "Seleccionar imagen",
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
    properties: ["openFile"]
  });
  if (s.canceled || !s.filePaths.length) return null;
  const e = s.filePaths[0], n = d.extname(e), o = `${je()}${n}`, r = d.join(ne, o);
  return E.copyFileSync(e, r), `file:///${r.replace(/\\/g, "/")}`;
});
i.handle("data:export", async () => {
  const s = await ce.showSaveDialog(t, {
    title: "Exportar datos de CyberNotes",
    defaultPath: "cybernotes-export.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (s.canceled || !s.filePath) return !1;
  Y();
  const e = y("SELECT * FROM folders"), n = y("SELECT * FROM notes"), o = { folders: e, notes: n, version: 1 };
  return E.writeFileSync(s.filePath, JSON.stringify(o, null, 2)), !0;
});
i.handle("data:import", async () => {
  const s = await ce.showOpenDialog(t, {
    title: "Importar datos a CyberNotes",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (s.canceled || !s.filePaths.length) return !1;
  try {
    const e = JSON.parse(E.readFileSync(s.filePaths[0], "utf-8"));
    if (!e.folders || !e.notes) return !1;
    Y();
    const n = F + ".backup-" + Date.now();
    E.existsSync(F) && E.copyFileSync(F, n);
    const o = [];
    for (const r of e.folders)
      o.push({
        sql: "INSERT OR REPLACE INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        params: [r.id, r.name, r.icon, r.color, r.sort_order, r.created_at]
      });
    for (const r of e.notes)
      o.push({
        sql: "INSERT OR REPLACE INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params: [r.id, r.folder_id, r.title, r.content, r.preview, r.thumb || "", r.pinned, r.created_at, r.updated_at]
      });
    return _e(o, { flushNow: !0 }), !0;
  } catch (e) {
    return console.error("Import error:", e), !1;
  }
});
const tt = l.requestSingleInstanceLock();
tt ? (l.on("second-instance", (s, e, n) => {
  C();
}), l.whenReady().then(async () => {
  we.defaultSession.setSpellCheckerLanguages(["es-ES", "en-US"]), await qe(), w = b(), H = Date.now(), Ke(), Se(), Qe(), Ve();
  const s = f("SELECT value FROM settings WHERE key = ?", ["caps_lock_sound_scope"]);
  (s == null ? void 0 : s.value) === "global" && ke();
  const e = f("SELECT value FROM settings WHERE key = ?", ["auto_check_updates"]);
  Pe(e ? e.value === "true" : !0), l.on("activate", () => {
    X.getAllWindows().length === 0 ? Se() : C();
  });
}), l.on("window-all-closed", () => {
  process.platform !== "darwin" && (m || l.quit());
}), l.on("before-quit", () => {
  U = !0;
  try {
    te.unregisterAll();
  } catch {
  }
  I && (clearInterval(I), I = null), Oe(), Y();
})) : l.quit();
i.handle("window-force-close", () => {
  U = !0, t == null || t.close();
});
i.handle("confirm-unsaved-exit-response", (s, e) => {
  e && (he = !1, U = !0, t == null || t.close());
});
