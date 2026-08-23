import { BrowserWindow as X, ipcMain as i, app as c, shell as K, session as te, nativeImage as v, net as de, clipboard as fe, dialog as V, Tray as pe, Menu as he } from "electron";
import d from "path";
import p from "fs";
import Z from "os";
import { fileURLToPath as se } from "url";
import { createRequire as ne } from "module";
import { exec as oe, spawn as Ee } from "child_process";
const ge = ne(import.meta.url), { autoUpdater: h } = ge("electron-updater");
let P = !1;
function L(s) {
  for (const e of X.getAllWindows())
    e.webContents.send("update:status", s);
}
function ye(s) {
  P = s, h.autoDownload = !1, h.autoInstallOnAppQuit = !0, h.on("checking-for-update", () => L({ state: "checking" })), h.on("update-available", (e) => {
    L({ state: "available", version: e.version }), P && h.downloadUpdate().catch((n) => {
      L({ state: "error", message: String((n == null ? void 0 : n.message) || n) });
    });
  }), h.on("update-not-available", (e) => {
    L({ state: "not-available", version: e.version });
  }), h.on("download-progress", (e) => {
    L({ state: "downloading", percent: Math.round(e.percent) });
  }), h.on("update-downloaded", (e) => {
    L({ state: "downloaded", version: e.version });
  }), h.on("error", (e) => {
    L({ state: "error", message: String((e == null ? void 0 : e.message) || e) });
  }), we(), P && setTimeout(() => {
    h.checkForUpdates().catch(() => {
    });
  }, 8e3);
}
function me(s) {
  P = s;
}
function we() {
  i.handle("update:check", async () => {
    var s;
    try {
      const e = new Promise((r, o) => {
        setTimeout(() => o(new Error("Update check timed out")), 2e4);
      }), n = await Promise.race([
        h.checkForUpdates(),
        e
      ]);
      return { ok: !0, version: (s = n == null ? void 0 : n.updateInfo) == null ? void 0 : s.version };
    } catch (e) {
      return console.error("[Updater] Check failed:", e), { ok: !1, error: String((e == null ? void 0 : e.message) || e) };
    } finally {
    }
  }), i.handle("update:download", async () => {
    try {
      return await h.downloadUpdate(), { ok: !0 };
    } catch (s) {
      return { ok: !1, error: String((s == null ? void 0 : s.message) || s) };
    }
  }), i.handle("update:install", () => {
    h.quitAndInstall(!1, !0);
  });
}
const O = d.dirname(se(import.meta.url)), Y = ne(import.meta.url), I = !c.isPackaged;
let D = d.join(O, "..", "public", "icon.png");
I || (D = d.join(c.getAppPath(), "dist", "icon.png"));
if (!p.existsSync(D)) {
  const s = d.join(I ? d.join(O, "..", "public") : d.join(c.getAppPath(), "dist"), "icon.ico");
  p.existsSync(s) && (D = s);
}
let j = d.join(I ? d.join(O, "..", "public") : d.join(c.getAppPath(), "dist"), "icon.ico");
p.existsSync(j) || (j = D);
const re = Y("bcryptjs"), J = c.getPath("userData"), _ = d.join(J, "cybernotes.db"), q = d.join(J, "images"), { v4: Se } = Y("uuid");
let f = null, $ = null;
const b = "id, folder_id, title, preview, thumb, pinned, created_at, updated_at", Te = 1500;
let k = !1, R = null;
function Q() {
  if (!f) return;
  const s = f.export();
  p.writeFileSync(_, Buffer.from(s)), k = !1;
}
function ie(s = Te) {
  k = !0, R && clearTimeout(R), R = setTimeout(() => {
    R = null, k && Q();
  }, s);
}
function H() {
  R && (clearTimeout(R), R = null), (k || f) && k && Q();
}
function Le(s, e, n) {
  E(`PRAGMA table_info(${s})`).some((o) => o.name === e) || f.run(`ALTER TABLE ${s} ADD COLUMN ${e} ${n}`);
}
async function be() {
  const s = I ? d.join(O, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm") : d.join(process.resourcesPath, "sql-wasm.wasm");
  if ($ = await Y("sql.js")({
    locateFile: () => s
  }), p.existsSync(_)) {
    const n = p.readFileSync(_);
    f = new $.Database(n);
  } else
    f = new $.Database();
  f.run(`
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
  `), Le("notes", "thumb", "TEXT DEFAULT ''"), ke(), Q(), p.existsSync(q) || p.mkdirSync(q, { recursive: !0 });
}
function Re(s) {
  if (!s || typeof s != "string") return "";
  if (s.trim().startsWith("{"))
    try {
      const n = JSON.parse(s);
      let r = "";
      const o = (a) => {
        var l;
        if (!r) {
          if ((a == null ? void 0 : a.type) === "image" && ((l = a.attrs) != null && l.src)) {
            r = String(a.attrs.src);
            return;
          }
          Array.isArray(a == null ? void 0 : a.content) && a.content.forEach(o);
        }
      };
      if (Array.isArray(n == null ? void 0 : n.content) && n.content.forEach(o), r) return r;
    } catch {
    }
  const e = s.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return (e == null ? void 0 : e[1]) || "";
}
function ke() {
  if (!f) return;
  const s = E(
    `SELECT id, content FROM notes
     WHERE (thumb IS NULL OR thumb = '')
       AND content IS NOT NULL AND content != ''
       AND (content LIKE '%<img%' OR content LIKE '%"type":"image"%' OR content LIKE '%"type": "image"%')`
  );
  if (s.length === 0) return;
  let e = 0;
  for (const n of s) {
    const r = Re(n.content);
    r && (f.run("UPDATE notes SET thumb = ? WHERE id = ?", [r, n.id]), e++);
  }
  e > 0 && (k = !0, console.log(`[CyberNotes] Backfilled thumbs for ${e} note(s)`));
}
function E(s, e = []) {
  if (!f) throw new Error("Base de datos no inicializada");
  const n = f.prepare(s);
  n.bind(e);
  const r = [];
  for (; n.step(); )
    r.push(n.getAsObject());
  return n.free(), r;
}
function u(s, e = []) {
  const n = E(s, e);
  return n.length > 0 ? n[0] : null;
}
function g(s, e = [], n) {
  if (!f) throw new Error("Base de datos no inicializada");
  f.run(s, e), ie();
}
function ae(s, e) {
  if (!f) throw new Error("Base de datos no inicializada");
  for (const n of s)
    f.run(n.sql, n.params ?? []);
  e != null && e.flushNow ? (k = !0, H()) : ie();
}
let t = null, y = null, x = !1, m = !1, U = Date.now(), A = null;
function T() {
  return !!u("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
}
function Ce() {
  const s = u("SELECT value FROM settings WHERE key = ?", ["auto_lock_minutes"]), e = s ? parseInt(s.value, 10) : 0;
  return Number.isFinite(e) && e > 0 ? e * 60 * 1e3 : 0;
}
function le() {
  const s = Ce();
  return s <= 0 ? !1 : Date.now() - U >= s;
}
function z() {
  return T() ? m || le() : !1;
}
function ve() {
  m = !0, t && !t.isDestroyed() && t.webContents.send("session:force-lock");
}
function _e() {
  A && clearInterval(A), A = setInterval(() => {
    m || T() && le() && ve();
  }, 5e3);
}
let G = !1, w = null;
function ce() {
  if (w || process.platform !== "win32") return;
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
    w = Ee("powershell", ["-Command", s]), w.stdout.on("data", (e) => {
      const r = e.toString().split(`
`);
      for (const o of r)
        if (o.trim().startsWith("STATE:")) {
          const a = o.trim().substring(6).toLowerCase() === "true";
          t && !t.isDestroyed() && t.webContents.send("global-caps-lock-changed", a);
        }
    }), w.on("exit", () => {
      w = null;
    });
  } catch (e) {
    console.error("Failed to start caps lock worker:", e);
  }
}
function ue() {
  w && (w.kill(), w = null);
}
function S() {
  if (!t || t.isDestroyed()) return;
  z() ? (m = !0, t.webContents.send("session:force-lock")) : t.webContents.send("session:shield-disable"), t.isMinimized() && t.restore();
  const e = u("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  (e == null ? void 0 : e.value) === "true" && t.maximize(), t.show(), t.setOpacity(1), t.focus();
}
function M(s) {
  try {
    return v.createFromDataURL("data:image/svg+xml;base64," + Buffer.from(s).toString("base64")).resize({ width: 16, height: 16 });
  } catch {
    return;
  }
}
const F = {
  get app() {
    try {
      return v.createFromPath(D).resize({ width: 16, height: 16, quality: "best" });
    } catch {
      return;
    }
  },
  get window() {
    return M('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="10" y1="4" x2="10" y2="8"/><line x1="2" y1="8" x2="22" y2="8"/><line x1="6" y1="4" x2="6" y2="8"/></svg>');
  },
  get settings() {
    return M('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>');
  },
  get about() {
    return M('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>');
  },
  get quit() {
    return M('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/></svg>');
  }
};
function Ae() {
  const s = u("SELECT value FROM settings WHERE key = ?", ["auto_unlock_caps_lock"]), e = (s == null ? void 0 : s.value) === "true", n = u("SELECT value FROM settings WHERE key = ?", ["language"]), o = ((n == null ? void 0 : n.value) || "en") === "es", a = t == null ? void 0 : t.isVisible();
  return [
    {
      label: `CyberNotes v${c.getVersion()}`,
      icon: F.app,
      click: () => {
        S(), t && !t.isDestroyed() && t.webContents.send("open-about");
      }
    },
    { type: "separator" },
    {
      label: a ? o ? "Ocultar CyberNotes" : "Hide CyberNotes" : o ? "Abrir CyberNotes" : "Open CyberNotes",
      icon: F.window,
      click: () => {
        t != null && t.isVisible() ? (T() && t.webContents.send("session:shield-enable"), t.hide()) : S();
      }
    },
    {
      label: o ? "Configuración" : "Settings",
      icon: F.settings,
      click: () => {
        S(), t && !t.isDestroyed() && t.webContents.send("open-settings");
      }
    },
    {
      label: o ? "Acerca de CyberNotes" : "About CyberNotes",
      icon: F.about,
      click: () => {
        S(), t && !t.isDestroyed() && t.webContents.send("open-about");
      }
    },
    { type: "separator" },
    {
      label: o ? "Desactivar CapsLock por inactividad" : "Disable Caps Lock on inactivity",
      type: "checkbox",
      checked: e,
      click: (l) => {
        const C = l.checked;
        g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_unlock_caps_lock", C ? "true" : "false"]), N(), t && !t.isDestroyed() && t.webContents.send("setting-changed", { key: "auto_unlock_caps_lock", value: C ? "true" : "false" });
      }
    },
    { type: "separator" },
    {
      label: o ? "Salir" : "Quit",
      icon: F.quit,
      click: () => {
        x = !0, c.quit();
      }
    }
  ];
}
function N() {
  if (!(!y || y.isDestroyed()))
    try {
      const s = he.buildFromTemplate(Ae());
      y.setContextMenu(s);
    } catch (s) {
      console.error("Failed to update tray menu:", s);
    }
}
function Oe() {
  try {
    y = new pe(j), N(), y.setToolTip(`CyberNotes v${c.getVersion()}`), y.on("click", () => {
      t != null && t.isVisible() ? (T() && t.webContents.send("session:shield-enable"), t.hide()) : S();
    });
  } catch (s) {
    console.error("Failed to create tray:", s);
  }
}
function ee() {
  const s = u("SELECT value FROM settings WHERE key = ?", ["window_bounds"]), e = u("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
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
    icon: D,
    webPreferences: {
      preload: d.join(O, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      webSecurity: !1
    },
    show: !1
  });
  let r = null;
  const o = (a = !1) => {
    if (!t || t.isDestroyed()) return;
    const l = () => {
      if (!t || t.isDestroyed()) return;
      const C = t.isMaximized();
      g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["is_maximized", C ? "true" : "false"]);
      const B = t.getBounds();
      B.width > 100 && B.height > 100 && g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["window_bounds", JSON.stringify(B)]);
    };
    if (a) {
      r && clearTimeout(r), r = null, l();
      return;
    }
    r && clearTimeout(r), r = setTimeout(l, 500);
  };
  t.on("resize", () => o(!1)), t.on("move", () => o(!1)), t.on("close", () => o(!0)), t.on("maximize", () => o(!0)), t.on("unmaximize", () => o(!0)), t.on("hide", () => {
    o(!0), N();
  }), t.on("minimize", () => {
    T() && (t == null || t.webContents.send("session:shield-enable"));
    const a = u("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
    (a == null ? void 0 : a.value) === "true" && (t == null || t.hide());
  }), t.on("restore", () => {
    z() ? (m = !0, t == null || t.webContents.send("session:force-lock")) : t == null || t.webContents.send("session:shield-disable");
  }), t.on("show", () => {
    z() && (m = !0, t == null || t.webContents.send("session:force-lock")), N();
  }), t.on("close", (a) => {
    const l = u("SELECT value FROM settings WHERE key = ?", ["close_to_tray"]);
    if ((l == null ? void 0 : l.value) === "true" && !x)
      return a.preventDefault(), T() && (t == null || t.webContents.send("session:shield-enable")), t == null || t.hide(), !1;
    if (G)
      return a.preventDefault(), S(), t == null || t.webContents.send("confirm-unsaved-exit"), !1;
    y && !y.isDestroyed() && (y.destroy(), y = null);
  }), t.webContents.setWindowOpenHandler(({ url: a }) => (a.startsWith("http") && K.openExternal(a), { action: "deny" })), t.webContents.on("context-menu", (a, l) => {
    a.preventDefault();
    const C = l.mediaType === "image" && l.srcURL || l.hasImageContents && l.srcURL ? l.srcURL : null;
    t == null || t.webContents.send("context-menu-data", {
      x: l.x,
      y: l.y,
      suggestions: l.dictionarySuggestions,
      misspelledWord: l.misspelledWord,
      linkURL: l.linkURL,
      imageSrc: C
    });
  }), I ? t.loadURL("http://localhost:5173") : t.loadFile(d.join(O, "../dist/index.html")), t.once("ready-to-show", () => {
    process.argv.includes("--hidden") || ((e == null ? void 0 : e.value) === "true" && (t == null || t.maximize()), t.show(), t.focus());
  });
}
i.handle("window-minimize", () => {
  T() && (t == null || t.webContents.send("session:shield-enable"));
  const s = u("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
  (s == null ? void 0 : s.value) === "true" ? t == null || t.hide() : t == null || t.minimize();
});
i.handle("window-maximize-toggle", () => {
  t != null && t.isMaximized() ? t.unmaximize() : t == null || t.maximize();
});
i.handle("window-close", () => t == null ? void 0 : t.close());
i.handle("window:unsavedChanges:set", (s, e) => {
  G = e;
});
i.handle("open-dev-tools", () => t == null ? void 0 : t.webContents.openDevTools({ mode: "detach" }));
i.handle("open-data-folder", () => K.openPath(J));
i.handle("replace-misspelling", (s, e) => t == null ? void 0 : t.webContents.replaceMisspelling(e));
i.handle("add-to-dictionary", (s, e) => {
  te.defaultSession.addWordToSpellCheckerDictionary(e);
});
i.handle("clipboard:writeImage", async (s, e) => {
  try {
    if (!e || typeof e != "string") return !1;
    let n = v.createEmpty();
    if (e.startsWith("data:"))
      n = v.createFromDataURL(e);
    else if (e.startsWith("file:")) {
      let r;
      try {
        r = se(e);
      } catch {
        r = decodeURIComponent(e.replace(/^file:\/\//i, "").replace(/^\//, ""));
      }
      if (!p.existsSync(r)) return !1;
      n = v.createFromPath(r);
    } else {
      const r = await de.fetch(e);
      if (!r.ok) return !1;
      const o = Buffer.from(await r.arrayBuffer());
      n = v.createFromBuffer(o);
    }
    return n.isEmpty() ? !1 : (fe.writeImage(n), !0);
  } catch (n) {
    return console.error("[CyberNotes] clipboard:writeImage failed:", n), !1;
  }
});
i.handle("unlock-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((s) => {
  oe(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Control]::IsKeyLocked('CapsLock')) { (New-Object -ComObject WScript.Shell).SendKeys('{CAPSLOCK}'); Write-Host 'unlocked' } else { Write-Host 'already-off' }"`, (n, r) => {
    if (n)
      console.error("Failed to unlock caps lock:", n), s(!1);
    else {
      const o = r.trim();
      s(o === "unlocked" || o === "already-off");
    }
  });
}));
i.handle("check-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((s) => {
  oe(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')"`, (n, r) => {
    s(n ? !1 : r.trim().toLowerCase() === "true");
  });
}));
i.handle("app:getVersions", () => ({
  app: c.getVersion(),
  electron: process.versions.electron,
  chrome: process.versions.chrome,
  node: process.versions.node,
  platform: process.platform,
  arch: process.arch,
  osRelease: Z.release(),
  osType: Z.type()
}));
i.handle("shell:openExternal", (s, e) => typeof e == "string" && /^https?:\/\//i.test(e) ? K.openExternal(e) : !1);
i.handle("auth:hasPassword", () => !!u("SELECT value FROM settings WHERE key = ?", ["password_hash"]));
i.handle("session:activity", () => (U = Date.now(), !0));
i.handle("session:set-locked", (s, e) => (m = !!e, e || (U = Date.now()), !0));
i.on("session:locked", () => {
  m = !0;
});
i.handle("auth:setPassword", async (s, e) => {
  const n = await re.hash(e, 10);
  return g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["password_hash", n]), m = !1, U = Date.now(), t && !t.isDestroyed() && t.webContents.send("setting-changed", { key: "password_hash", value: "set" }), !0;
});
i.handle("auth:verifyPassword", async (s, e) => {
  const n = u("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
  return n ? re.compare(e, n.value) : !0;
});
i.handle("auth:removePassword", () => (g("DELETE FROM settings WHERE key = ?", ["password_hash"]), m = !1, t && !t.isDestroyed() && (t.webContents.send("setting-changed", { key: "password_hash", value: "removed" }), t.webContents.send("session:shield-disable")), !0));
i.handle("settings:get", (s, e) => {
  const n = u("SELECT value FROM settings WHERE key = ?", [e]);
  return n ? n.value : null;
});
i.handle("settings:getMany", (s, e) => {
  const n = {};
  if (!Array.isArray(e)) return n;
  for (const r of e) {
    const o = u("SELECT value FROM settings WHERE key = ?", [r]);
    n[r] = o ? o.value : null;
  }
  return n;
});
i.handle("settings:set", (s, e, n) => (g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [e, n]), (e === "auto_unlock_caps_lock" || e === "language") && N(), e === "caps_lock_sound_scope" && (n === "global" ? ce() : ue()), e === "auto_check_updates" && me(n === "true"), !0));
const W = ["--hidden"];
function De() {
  if (c.getLoginItemSettings({ args: [...W] }).openAtLogin) return !0;
  const s = c.getLoginItemSettings();
  return !!(s.openAtLogin || process.platform === "win32" && s.executableWillLaunchAtLogin);
}
function Fe(s) {
  s ? (c.setLoginItemSettings({ openAtLogin: !1, args: [] }), c.setLoginItemSettings({
    openAtLogin: !0,
    openAsHidden: !0,
    // macOS only; ignored on Windows
    args: [...W]
  })) : (c.setLoginItemSettings({ openAtLogin: !1, args: [...W] }), c.setLoginItemSettings({ openAtLogin: !1, args: [] }));
}
i.handle("settings:setAutoStart", (s, e) => (Fe(!!e), g("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_start", e ? "true" : "false"]), !0));
i.handle("settings:getAutoStart", () => De());
i.handle("folders:getAll", () => E("SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC"));
i.handle("folders:create", (s, e) => (g(
  "INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  [e.id, e.name, e.icon, e.color, e.sort_order, e.created_at]
), e));
i.handle("folders:update", (s, e) => (g(
  "UPDATE folders SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?",
  [e.name, e.icon, e.color, e.sort_order, e.id]
), !0));
i.handle("folders:delete", (s, e) => (ae([
  { sql: "DELETE FROM notes WHERE folder_id = ?", params: [e] },
  { sql: "DELETE FROM folders WHERE id = ?", params: [e] }
]), !0));
i.handle("notes:getAll", () => E(`SELECT ${b} FROM notes ORDER BY pinned DESC, updated_at DESC`));
i.handle("notes:getByFolder", (s, e) => e === "floating" ? E(`SELECT ${b} FROM notes WHERE folder_id IS NULL OR folder_id = "" ORDER BY pinned DESC, updated_at DESC`) : e === "favorites" ? E(`SELECT ${b} FROM notes WHERE pinned = 1 ORDER BY updated_at DESC`) : e ? E(`SELECT ${b} FROM notes WHERE folder_id = ? ORDER BY pinned DESC, updated_at DESC`, [e]) : E(`SELECT ${b} FROM notes ORDER BY pinned DESC, updated_at DESC`));
i.handle("notes:getById", (s, e) => u("SELECT * FROM notes WHERE id = ?", [e]));
i.handle("notes:save", (s, e) => {
  const n = typeof e.thumb == "string" ? e.thumb : "";
  return u("SELECT id FROM notes WHERE id = ?", [e.id]) ? g(
    "UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, thumb = ?, pinned = ?, updated_at = ? WHERE id = ?",
    [e.folder_id, e.title, e.content, e.preview, n, e.pinned, e.updated_at, e.id]
  ) : g(
    "INSERT INTO notes (id, folder_id, title, content, preview, thumb, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [e.id, e.folder_id, e.title, e.content, e.preview, n, e.pinned, e.created_at, e.updated_at]
  ), e;
});
i.handle("notes:delete", (s, e) => (g("DELETE FROM notes WHERE id = ?", [e]), !0));
i.handle("notes:search", (s, e) => {
  const n = `%${e}%`;
  return !e || e.trim().length < 2 ? E(
    `SELECT ${b} FROM notes WHERE title LIKE ? OR preview LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [n, n]
  ) : E(
    `SELECT ${b} FROM notes WHERE title LIKE ? OR preview LIKE ? OR content LIKE ? ORDER BY pinned DESC, updated_at DESC`,
    [n, n, n]
  );
});
i.handle("images:selectAndSave", async () => {
  const s = await V.showOpenDialog(t, {
    title: "Seleccionar imagen",
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
    properties: ["openFile"]
  });
  if (s.canceled || !s.filePaths.length) return null;
  const e = s.filePaths[0], n = d.extname(e), r = `${Se()}${n}`, o = d.join(q, r);
  return p.copyFileSync(e, o), `file:///${o.replace(/\\/g, "/")}`;
});
i.handle("data:export", async () => {
  const s = await V.showSaveDialog(t, {
    title: "Exportar datos de CyberNotes",
    defaultPath: "cybernotes-export.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (s.canceled || !s.filePath) return !1;
  H();
  const e = E("SELECT * FROM folders"), n = E("SELECT * FROM notes"), r = { folders: e, notes: n, version: 1 };
  return p.writeFileSync(s.filePath, JSON.stringify(r, null, 2)), !0;
});
i.handle("data:import", async () => {
  const s = await V.showOpenDialog(t, {
    title: "Importar datos a CyberNotes",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (s.canceled || !s.filePaths.length) return !1;
  try {
    const e = JSON.parse(p.readFileSync(s.filePaths[0], "utf-8"));
    if (!e.folders || !e.notes) return !1;
    H();
    const n = _ + ".backup-" + Date.now();
    p.existsSync(_) && p.copyFileSync(_, n);
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
    return ae(r, { flushNow: !0 }), !0;
  } catch (e) {
    return console.error("Import error:", e), !1;
  }
});
const Ne = c.requestSingleInstanceLock();
Ne ? (c.on("second-instance", (s, e, n) => {
  S();
}), c.whenReady().then(async () => {
  te.defaultSession.setSpellCheckerLanguages(["es-ES", "en-US"]), await be(), m = T(), U = Date.now(), _e(), ee(), Oe();
  const s = u("SELECT value FROM settings WHERE key = ?", ["caps_lock_sound_scope"]);
  (s == null ? void 0 : s.value) === "global" && ce();
  const e = u("SELECT value FROM settings WHERE key = ?", ["auto_check_updates"]);
  ye(e ? e.value === "true" : !0), c.on("activate", () => {
    X.getAllWindows().length === 0 ? ee() : S();
  });
}), c.on("window-all-closed", () => {
  process.platform !== "darwin" && (y || c.quit());
}), c.on("before-quit", () => {
  x = !0, A && (clearInterval(A), A = null), ue(), H();
})) : c.quit();
i.handle("window-force-close", () => {
  x = !0, t == null || t.close();
});
i.handle("confirm-unsaved-exit-response", (s, e) => {
  e && (G = !1, x = !0, t == null || t.close());
});
