import { BrowserWindow as X, ipcMain as i, app as l, shell as ae, session as me, nativeImage as q, net as De, clipboard as Ne, dialog as le, Tray as xe, screen as B } from "electron";
import d from "path";
import E from "fs";
import ye from "os";
import { fileURLToPath as Te } from "url";
import { createRequire as Se } from "module";
import { exec as we, spawn as Fe } from "child_process";
const Ie = Se(import.meta.url), { autoUpdater: y } = Ie("electron-updater");
let z = !1;
function k(t) {
  for (const e of X.getAllWindows())
    e.webContents.send("update:status", t);
}
function Me(t) {
  z = t, y.autoDownload = !1, y.autoInstallOnAppQuit = !0, y.on("checking-for-update", () => k({ state: "checking" })), y.on("update-available", (e) => {
    k({ state: "available", version: e.version }), z && y.downloadUpdate().catch((n) => {
      k({ state: "error", message: String((n == null ? void 0 : n.message) || n) });
    });
  }), y.on("update-not-available", (e) => {
    k({ state: "not-available", version: e.version });
  }), y.on("download-progress", (e) => {
    k({ state: "downloading", percent: Math.round(e.percent) });
  }), y.on("update-downloaded", (e) => {
    k({ state: "downloaded", version: e.version });
  }), y.on("error", (e) => {
    k({ state: "error", message: String((e == null ? void 0 : e.message) || e) });
  }), Ue(), z && setTimeout(() => {
    y.checkForUpdates().catch(() => {
    });
  }, 8e3);
}
function Pe(t) {
  z = t;
}
function Ue() {
  i.handle("update:check", async () => {
    var t;
    try {
      const e = new Promise((o, r) => {
        setTimeout(() => r(new Error("Update check timed out")), 2e4);
      }), n = await Promise.race([
        y.checkForUpdates(),
        e
      ]);
      return { ok: !0, version: (t = n == null ? void 0 : n.updateInfo) == null ? void 0 : t.version };
    } catch (e) {
      return console.error("[Updater] Check failed:", e), { ok: !1, error: String((e == null ? void 0 : e.message) || e) };
    } finally {
    }
  }), i.handle("update:download", async () => {
    try {
      return await y.downloadUpdate(), { ok: !0 };
    } catch (t) {
      return { ok: !1, error: String((t == null ? void 0 : t.message) || t) };
    }
  }), i.handle("update:install", () => {
    y.quitAndInstall(!1, !0);
  });
}
const R = d.dirname(Te(import.meta.url)), ce = Se(import.meta.url), N = !l.isPackaged;
let P = d.join(R, "..", "public", "icon.png");
N || (P = d.join(l.getAppPath(), "dist", "icon.png"));
if (!E.existsSync(P)) {
  const t = d.join(N ? d.join(R, "..", "public") : d.join(l.getAppPath(), "dist"), "icon.ico");
  E.existsSync(t) && (P = t);
}
let te = d.join(N ? d.join(R, "..", "public") : d.join(l.getAppPath(), "dist"), "icon.ico");
E.existsSync(te) || (te = P);
const be = ce("bcryptjs"), ue = l.getPath("userData"), F = d.join(ue, "cybernotes.db"), se = d.join(ue, "images"), { v4: He } = ce("uuid");
let p = null, ee = null;
const O = "id, folder_id, title, preview, thumb, pinned, created_at, updated_at", je = 1500;
let x = !1, v = null;
function de() {
  if (!p) return;
  const t = p.export();
  E.writeFileSync(F, Buffer.from(t)), x = !1;
}
function Le(t = je) {
  x = !0, v && clearTimeout(v), v = setTimeout(() => {
    v = null, x && de();
  }, t);
}
function Y() {
  v && (clearTimeout(v), v = null), (x || p) && x && de();
}
function $e(t, e, n) {
  g(`PRAGMA table_info(${t})`).some((r) => r.name === e) || p.run(`ALTER TABLE ${t} ADD COLUMN ${e} ${n}`);
}
async function We() {
  const t = N ? d.join(R, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm") : d.join(process.resourcesPath, "sql-wasm.wasm");
  if (ee = await ce("sql.js")({
    locateFile: () => t
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
  `), $e("notes", "thumb", "TEXT DEFAULT ''"), Be(), de(), E.existsSync(se) || E.mkdirSync(se, { recursive: !0 });
}
function qe(t) {
  if (!t || typeof t != "string") return "";
  if (t.trim().startsWith("{"))
    try {
      const n = JSON.parse(t);
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
  const e = t.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return (e == null ? void 0 : e[1]) || "";
}
function Be() {
  if (!p) return;
  const t = g(
    `SELECT id, content FROM notes
     WHERE (thumb IS NULL OR thumb = '')
       AND content IS NOT NULL AND content != ''
       AND (content LIKE '%<img%' OR content LIKE '%"type":"image"%' OR content LIKE '%"type": "image"%')`
  );
  if (t.length === 0) return;
  let e = 0;
  for (const n of t) {
    const o = qe(n.content);
    o && (p.run("UPDATE notes SET thumb = ? WHERE id = ?", [o, n.id]), e++);
  }
  e > 0 && (x = !0, console.log(`[CyberNotes] Backfilled thumbs for ${e} note(s)`));
}
function g(t, e = []) {
  if (!p) throw new Error("Base de datos no inicializada");
  const n = p.prepare(t);
  n.bind(e);
  const o = [];
  for (; n.step(); )
    o.push(n.getAsObject());
  return n.free(), o;
}
function f(t, e = []) {
  const n = g(t, e);
  return n.length > 0 ? n[0] : null;
}
function T(t, e = [], n) {
  if (!p) throw new Error("Base de datos no inicializada");
  p.run(t, e), Le();
}
function Re(t, e) {
  if (!p) throw new Error("Base de datos no inicializada");
  for (const n of t)
    p.run(n.sql, n.params ?? []);
  e != null && e.flushNow ? (x = !0, Y()) : Le();
}
let s = null, m = null, U = !1, S = !1, H = Date.now(), I = null;
function C() {
  return !!f("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
}
function ze() {
  const t = f("SELECT value FROM settings WHERE key = ?", ["auto_lock_minutes"]), e = t ? parseInt(t.value, 10) : 0;
  return Number.isFinite(e) && e > 0 ? e * 60 * 1e3 : 0;
}
function Ce() {
  const t = ze();
  return t <= 0 ? !1 : Date.now() - H >= t;
}
function ne() {
  return C() ? S || Ce() : !1;
}
function Xe() {
  S = !0, s && !s.isDestroyed() && s.webContents.send("session:force-lock");
}
function Ye() {
  I && clearInterval(I), I = setInterval(() => {
    S || C() && Ce() && Xe();
  }, 5e3);
}
let fe = !1, L = null;
function _e() {
  if (L || process.platform !== "win32") return;
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
    L = Fe("powershell", ["-Command", t]), L.stdout.on("data", (e) => {
      const o = e.toString().split(`
`);
      for (const r of o)
        if (r.trim().startsWith("STATE:")) {
          const a = r.trim().substring(6).toLowerCase() === "true";
          s && !s.isDestroyed() && s.webContents.send("global-caps-lock-changed", a);
        }
    }), L.on("exit", () => {
      L = null;
    });
  } catch (e) {
    console.error("Failed to start caps lock worker:", e);
  }
}
function Ae() {
  L && (L.kill(), L = null);
}
function D() {
  if (!s || s.isDestroyed()) return;
  ne() ? (S = !0, s.webContents.send("session:force-lock")) : s.webContents.send("session:shield-disable"), s.isMinimized() && s.restore();
  const e = f("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  (e == null ? void 0 : e.value) === "true" && s.maximize(), s.show(), s.setOpacity(1), s.focus();
}
const K = 26, he = 268, pe = 220;
let u = null, oe = null, w = null, ke = 0;
function Oe() {
  return !!(s && !s.isDestroyed() && s.isVisible());
}
function Ee() {
  const t = f("SELECT value FROM settings WHERE key = ?", ["language"]), n = ((t == null ? void 0 : t.value) || "en") === "es", o = Oe();
  return {
    version: l.getVersion(),
    head: "CyberNotes v" + l.getVersion(),
    visible: o,
    showLabel: o ? n ? "Ocultar CyberNotes" : "Hide CyberNotes" : n ? "Abrir CyberNotes" : "Open CyberNotes",
    settingsLabel: n ? "Configuración" : "Settings",
    aboutLabel: n ? "Acerca de..." : "About...",
    exitLabel: n ? "Salir" : "Quit"
  };
}
function ve(t, e, n) {
  let o = t && typeof t.x == "number" && (t.width || t.height) ? { x: t.x, y: t.y, width: t.width || 0, height: t.height || 0 } : null;
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
  const h = c && c.workArea || { x: 0, y: 0, width: e, height: n }, b = 4, j = K, $ = e - 2 * j, W = n - 2 * j;
  let _, A;
  const J = r - h.x, G = h.x + h.width - r, Q = a - h.y, Z = h.y + h.height - a;
  return Z <= J && Z <= G && Z <= Q ? (_ = r - $ / 2, A = o.y - b - W) : Q <= J && Q <= G ? (_ = r - $ / 2, A = o.y + o.height + b) : J <= G ? (_ = o.x + o.width + b, A = a - W / 2) : (_ = o.x - b - $, A = a - W / 2), _ = Math.min(Math.max(_, h.x + 4), h.x + h.width - $ - 4), A = Math.min(Math.max(A, h.y + 4), h.y + h.height - W - 4), { x: Math.round(_ - j), y: Math.round(A - j), width: e, height: n };
}
function Ke() {
  if (u && !u.isDestroyed()) return u;
  const t = N ? d.join(R, "..", "public", "tray-menu.html") : d.join(l.getAppPath(), "dist", "tray-menu.html"), e = N ? d.join(R, "..", "public", "tray-preload.js") : d.join(l.getAppPath(), "dist", "tray-preload.js");
  return u = new X({
    width: he + 2 * K,
    height: pe,
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
  }), u.setAlwaysOnTop(!0, "pop-up-menu"), u.loadFile(t), u.on("blur", () => {
    w || Date.now() - ke < 250 || (w = setTimeout(() => {
      w = null, V();
    }, 120));
  }), u.on("closed", () => {
    u = null;
  }), u.webContents.once("did-finish-load", () => {
    !u || u.isDestroyed() || (u.webContents.send("tray-menu-state", Ee()), u.webContents.send("tray-menu-show"));
  }), u;
}
function Ve(t) {
  if (!m) return;
  let e = t && typeof t.x == "number" && (t.width || t.height) ? t : null;
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
  oe = e, w && (clearTimeout(w), w = null);
  const n = Ke();
  if (!n || n.isDestroyed()) return;
  const o = ve(oe, he + 2 * K, pe);
  n.setBounds(o), n.isVisible() || n.show(), n.focus(), ke = Date.now(), n.webContents.isLoading() || (n.webContents.send("tray-menu-state", Ee()), n.webContents.send("tray-menu-show"));
}
function V() {
  w && (clearTimeout(w), w = null), u && !u.isDestroyed() && u.isVisible() && u.hide();
}
function re() {
  m && (m.setToolTip(`CyberNotes v${l.getVersion()}`), u && !u.isDestroyed() && !u.webContents.isLoading() && u.webContents.send("tray-menu-state", Ee()));
}
function Je() {
  try {
    m = new xe(te), m.setToolTip(`CyberNotes v${l.getVersion()}`), m.on("click", () => {
      V(), !(!s || s.isDestroyed()) && (s.isVisible() ? (C() && s.webContents.send("session:shield-enable"), s.hide()) : D());
    }), m.on("right-click", (t, e) => {
      Ve(e);
    });
  } catch (t) {
    console.error("Failed to create tray:", t);
  }
}
i.on("tray-menu-action", (t, e) => {
  switch (V(), e) {
    case "toggle":
      Oe() ? (C() && (s == null || s.webContents.send("session:shield-enable")), s == null || s.hide()) : D();
      break;
    case "settings":
      D(), s && !s.isDestroyed() && s.webContents.send("open-settings");
      break;
    case "about":
      D(), s && !s.isDestroyed() && s.webContents.send("open-about");
      break;
    case "quit":
      U = !0, l.quit();
      break;
  }
});
i.on("tray-menu-hide", () => V());
i.on("tray-menu-ready", (t, e) => {
  if (!u || u.isDestroyed() || !e) return;
  const n = K, o = Math.round((e.width || he) + 2 * n), r = Math.round((e.height || pe - 2 * n) + 2 * n), a = ve(oe, o, r);
  u.setBounds(a);
});
function ge() {
  const t = f("SELECT value FROM settings WHERE key = ?", ["window_bounds"]), e = f("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  let n = { width: 1100, height: 700, x: void 0, y: void 0 };
  if (t)
    try {
      const a = JSON.parse(t.value);
      a.width > 400 && a.height > 400 && (n = a);
    } catch {
    }
  s = new X({
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
      preload: d.join(R, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      webSecurity: !1
    },
    show: !1
  });
  let o = null;
  const r = (a = !1) => {
    if (!s || s.isDestroyed()) return;
    const c = () => {
      if (!s || s.isDestroyed()) return;
      const h = s.isMaximized();
      T("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["is_maximized", h ? "true" : "false"]);
      const b = s.getBounds();
      b.width > 100 && b.height > 100 && T("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["window_bounds", JSON.stringify(b)]);
    };
    if (a) {
      o && clearTimeout(o), o = null, c();
      return;
    }
    o && clearTimeout(o), o = setTimeout(c, 500);
  };
  s.on("resize", () => r(!1)), s.on("move", () => r(!1)), s.on("close", () => r(!0)), s.on("maximize", () => r(!0)), s.on("unmaximize", () => r(!0)), s.on("hide", () => {
    r(!0), re();
  }), s.on("minimize", () => {
    C() && (s == null || s.webContents.send("session:shield-enable"));
    const a = f("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
    (a == null ? void 0 : a.value) === "true" && (s == null || s.hide());
  }), s.on("restore", () => {
    ne() ? (S = !0, s == null || s.webContents.send("session:force-lock")) : s == null || s.webContents.send("session:shield-disable");
  }), s.on("show", () => {
    ne() && (S = !0, s == null || s.webContents.send("session:force-lock")), re();
  }), s.on("close", (a) => {
    const c = f("SELECT value FROM settings WHERE key = ?", ["close_to_tray"]);
    if ((c == null ? void 0 : c.value) === "true" && !U)
      return a.preventDefault(), C() && (s == null || s.webContents.send("session:shield-enable")), s == null || s.hide(), !1;
    if (fe)
      return a.preventDefault(), D(), s == null || s.webContents.send("confirm-unsaved-exit"), !1;
    m && !m.isDestroyed() && (m.destroy(), m = null);
  }), s.webContents.setWindowOpenHandler(({ url: a }) => (a.startsWith("http") && ae.openExternal(a), { action: "deny" })), s.webContents.on("context-menu", (a, c) => {
    a.preventDefault();
    const h = c.mediaType === "image" && c.srcURL || c.hasImageContents && c.srcURL ? c.srcURL : null;
    s == null || s.webContents.send("context-menu-data", {
      x: c.x,
      y: c.y,
      suggestions: c.dictionarySuggestions,
      misspelledWord: c.misspelledWord,
      linkURL: c.linkURL,
      imageSrc: h
    });
  }), N ? s.loadURL("http://localhost:5173") : s.loadFile(d.join(R, "../dist/index.html")), s.once("ready-to-show", () => {
    process.argv.includes("--hidden") || ((e == null ? void 0 : e.value) === "true" && (s == null || s.maximize()), s.show(), s.focus());
  });
}
i.handle("window-minimize", () => {
  C() && (s == null || s.webContents.send("session:shield-enable"));
  const t = f("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
  (t == null ? void 0 : t.value) === "true" ? s == null || s.hide() : s == null || s.minimize();
});
i.handle("window-maximize-toggle", () => {
  s != null && s.isMaximized() ? s.unmaximize() : s == null || s.maximize();
});
i.handle("window-close", () => s == null ? void 0 : s.close());
i.handle("window:unsavedChanges:set", (t, e) => {
  fe = e;
});
i.handle("open-dev-tools", () => s == null ? void 0 : s.webContents.openDevTools({ mode: "detach" }));
i.handle("open-data-folder", () => ae.openPath(ue));
i.handle("replace-misspelling", (t, e) => s == null ? void 0 : s.webContents.replaceMisspelling(e));
i.handle("add-to-dictionary", (t, e) => {
  me.defaultSession.addWordToSpellCheckerDictionary(e);
});
i.handle("clipboard:writeImage", async (t, e) => {
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
      const o = await De.fetch(e);
      if (!o.ok) return !1;
      const r = Buffer.from(await o.arrayBuffer());
      n = q.createFromBuffer(r);
    }
    return n.isEmpty() ? !1 : (Ne.writeImage(n), !0);
  } catch (n) {
    return console.error("[CyberNotes] clipboard:writeImage failed:", n), !1;
  }
});
i.handle("unlock-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((t) => {
  we(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Control]::IsKeyLocked('CapsLock')) { (New-Object -ComObject WScript.Shell).SendKeys('{CAPSLOCK}'); Write-Host 'unlocked' } else { Write-Host 'already-off' }"`, (n, o) => {
    if (n)
      console.error("Failed to unlock caps lock:", n), t(!1);
    else {
      const r = o.trim();
      t(r === "unlocked" || r === "already-off");
    }
  });
}));
i.handle("check-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((t) => {
  we(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')"`, (n, o) => {
    t(n ? !1 : o.trim().toLowerCase() === "true");
  });
}));
i.handle("app:getVersions", () => ({
  app: l.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  osRelease: ye.release(),
  osType: ye.type()
}));
i.handle("shell:openExternal", (t, e) => typeof e == "string" && /^https?:\/\//i.test(e) ? ae.openExternal(e) : !1);
i.handle("auth:hasPassword", () => !!f("SELECT value FROM settings WHERE key = ?", ["password_hash"]));
i.handle("session:activity", () => (H = Date.now(), !0));
i.handle("session:set-locked", (t, e) => (S = !!e, e || (H = Date.now()), !0));
i.on("session:locked", () => {
  S = !0;
});
i.handle("auth:setPassword", async (t, e) => {
  const n = await be.hash(e, 10);
  return T("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["password_hash", n]), S = !1, H = Date.now(), s && !s.isDestroyed() && s.webContents.send("setting-changed", { key: "password_hash", value: "set" }), !0;
});
i.handle("auth:verifyPassword", async (t, e) => {
  const n = f("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
  return n ? be.compare(e, n.value) : !0;
});
i.handle("auth:removePassword", () => (T("DELETE FROM settings WHERE key = ?", ["password_hash"]), S = !1, s && !s.isDestroyed() && (s.webContents.send("setting-changed", { key: "password_hash", value: "removed" }), s.webContents.send("session:shield-disable")), !0));
i.handle("settings:get", (t, e) => {
  const n = f("SELECT value FROM settings WHERE key = ?", [e]);
  return n ? n.value : null;
});
i.handle("settings:getMany", (t, e) => {
  const n = {};
  if (!Array.isArray(e)) return n;
  for (const o of e) {
    const r = f("SELECT value FROM settings WHERE key = ?", [o]);
    n[o] = r ? r.value : null;
  }
  return n;
});
i.handle("settings:set", (t, e, n) => (T("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [e, n]), (e === "auto_unlock_caps_lock" || e === "language") && re(), e === "caps_lock_sound_scope" && (n === "global" ? _e() : Ae()), e === "auto_check_updates" && Pe(n === "true"), !0));
const ie = ["--hidden"];
function Ge() {
  if (l.getLoginItemSettings({ args: [...ie] }).openAtLogin) return !0;
  const t = l.getLoginItemSettings();
  return !!(t.openAtLogin || process.platform === "win32" && t.executableWillLaunchAtLogin);
}
function Qe(t) {
  t ? (l.setLoginItemSettings({ openAtLogin: !1, args: [] }), l.setLoginItemSettings({
    openAtLogin: !0,
    openAsHidden: !0,
    // macOS only; ignored on Windows
    args: [...ie]
  })) : (l.setLoginItemSettings({ openAtLogin: !1, args: [...ie] }), l.setLoginItemSettings({ openAtLogin: !1, args: [] }));
}
i.handle("settings:setAutoStart", (t, e) => (Qe(!!e), T("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_start", e ? "true" : "false"]), !0));
i.handle("settings:getAutoStart", () => Ge());
i.handle("folders:getAll", () => g("SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC"));
i.handle("folders:create", (t, e) => (T(
  "INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  [e.id, e.name, e.icon, e.color, e.sort_order, e.created_at]
), e));
i.handle("folders:update", (t, e) => (T(
  "UPDATE folders SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?",
  [e.name, e.icon, e.color, e.sort_order, e.id]
), !0));
i.handle("folders:delete", (t, e) => (Re([
  { sql: "DELETE FROM notes WHERE folder_id = ?", params: [e] },
  { sql: "DELETE FROM folders WHERE id = ?", params: [e] }
]), !0));
i.handle("notes:getAll", () => g(`SELECT ${O} FROM notes ORDER BY pinned DESC, updated_at DESC`));
i.handle("notes:getByFolder", (t, e) => e === "floating" ? g(`SELECT ${O} FROM notes WHERE folder_id IS NULL OR folder_id = "" ORDER BY pinned DESC, updated_at DESC`) : e === "favorites" ? g(`SELECT ${O} FROM notes WHERE pinned = 1 ORDER BY updated_at DESC`) : e ? g(`SELECT ${O} FROM notes WHERE folder_id = ? ORDER BY pinned DESC, updated_at DESC`, [e]) : g(`SELECT ${O} FROM notes ORDER BY pinned DESC, updated_at DESC`));
i.handle("notes:getById", (t, e) => f("SELECT * FROM notes WHERE id = ?", [e]));
i.handle("notes:save", (t, e) => {
  const n = typeof e.thumb == "string" ? e.thumb : "";
  return f("SELECT id FROM notes WHERE id = ?", [e.id]) ? T(
    "UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, thumb = ?, pinned = ?, updated_at = ? WHERE id = ?",
    [e.folder_id, e.title, e.content, e.preview, n, e.pinned, e.updated_at, e.id]
  ) : T(
    "INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [e.id, e.folder_id, e.title, e.content, e.preview, n, e.pinned, e.created_at, e.updated_at]
  ), e;
});
i.handle("notes:delete", (t, e) => (T("DELETE FROM notes WHERE id = ?", [e]), !0));
i.handle("notes:search", (t, e) => {
  const n = `%${e}%`;
  return !e || e.trim().length < 2 ? g(
    `SELECT ${O} FROM notes WHERE title LIKE ? OR preview LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [n, n]
  ) : g(
    `SELECT ${O} FROM notes WHERE title LIKE ? OR preview LIKE ? OR content LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [n, n, n]
  );
});
i.handle("images:selectAndSave", async () => {
  const t = await le.showOpenDialog(s, {
    title: "Seleccionar imagen",
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
    properties: ["openFile"]
  });
  if (t.canceled || !t.filePaths.length) return null;
  const e = t.filePaths[0], n = d.extname(e), o = `${He()}${n}`, r = d.join(se, o);
  return E.copyFileSync(e, r), `file:///${r.replace(/\\/g, "/")}`;
});
i.handle("data:export", async () => {
  const t = await le.showSaveDialog(s, {
    title: "Exportar datos de CyberNotes",
    defaultPath: "cybernotes-export.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (t.canceled || !t.filePath) return !1;
  Y();
  const e = g("SELECT * FROM folders"), n = g("SELECT * FROM notes"), o = { folders: e, notes: n, version: 1 };
  return E.writeFileSync(t.filePath, JSON.stringify(o, null, 2)), !0;
});
i.handle("data:import", async () => {
  const t = await le.showOpenDialog(s, {
    title: "Importar datos a CyberNotes",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (t.canceled || !t.filePaths.length) return !1;
  try {
    const e = JSON.parse(E.readFileSync(t.filePaths[0], "utf-8"));
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
    return Re(o, { flushNow: !0 }), !0;
  } catch (e) {
    return console.error("Import error:", e), !1;
  }
});
const Ze = l.requestSingleInstanceLock();
Ze ? (l.on("second-instance", (t, e, n) => {
  D();
}), l.whenReady().then(async () => {
  me.defaultSession.setSpellCheckerLanguages(["es-ES", "en-US"]), await We(), S = C(), H = Date.now(), Ye(), ge(), Je();
  const t = f("SELECT value FROM settings WHERE key = ?", ["caps_lock_sound_scope"]);
  (t == null ? void 0 : t.value) === "global" && _e();
  const e = f("SELECT value FROM settings WHERE key = ?", ["auto_check_updates"]);
  Me(e ? e.value === "true" : !0), l.on("activate", () => {
    X.getAllWindows().length === 0 ? ge() : D();
  });
}), l.on("window-all-closed", () => {
  process.platform !== "darwin" && (m || l.quit());
}), l.on("before-quit", () => {
  U = !0, I && (clearInterval(I), I = null), Ae(), Y();
})) : l.quit();
i.handle("window-force-close", () => {
  U = !0, s == null || s.close();
});
i.handle("confirm-unsaved-exit-response", (t, e) => {
  e && (fe = !1, U = !0, s == null || s.close());
});
