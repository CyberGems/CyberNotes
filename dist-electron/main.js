import { app as c, ipcMain as a, shell as N, session as D, dialog as L, BrowserWindow as I, Tray as H, Menu as W } from "electron";
import d from "path";
import E from "fs";
import { fileURLToPath as j } from "url";
import { createRequire as B } from "module";
import { exec as x, spawn as z } from "child_process";
const g = d.dirname(j(import.meta.url)), v = B(import.meta.url), _ = !c.isPackaged;
let y = d.join(g, "..", "public", "icon.png");
_ || (y = d.join(c.getAppPath(), "dist", "icon.png"));
if (!E.existsSync(y)) {
  const s = d.join(_ ? d.join(g, "..", "public") : d.join(c.getAppPath(), "dist"), "icon.ico");
  E.existsSync(s) && (y = s);
}
const P = v("bcryptjs"), b = c.getPath("userData"), T = d.join(b, "cybernotes.db"), C = d.join(b, "images"), { v4: $ } = v("uuid");
let f = null, w = null;
function M() {
  if (!f) return;
  const s = f.export();
  E.writeFileSync(T, Buffer.from(s));
}
async function q() {
  const s = _ ? d.join(g, "..", "node_modules", "sql.js", "dist", "sql-wasm.wasm") : d.join(process.resourcesPath, "sql-wasm.wasm");
  if (w = await v("sql.js")({
    locateFile: () => s
  }), E.existsSync(T)) {
    const n = E.readFileSync(T);
    f = new w.Database(n);
  } else
    f = new w.Database();
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
      pinned     INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `), M(), E.existsSync(C) || E.mkdirSync(C, { recursive: !0 });
}
function h(s, e = []) {
  if (!f) throw new Error("Base de datos no inicializada");
  const n = f.prepare(s);
  n.bind(e);
  const o = [];
  for (; n.step(); )
    o.push(n.getAsObject());
  return n.free(), o;
}
function u(s, e = []) {
  const n = h(s, e);
  return n.length > 0 ? n[0] : null;
}
function l(s, e = []) {
  if (!f) throw new Error("Base de datos no inicializada");
  f.run(s, e), M();
}
let t = null, p = null, k = !1, O = !1, S = null;
function U() {
  if (S || process.platform !== "win32") return;
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
    S = z("powershell", ["-Command", s]), S.stdout.on("data", (e) => {
      const o = e.toString().split(`
`);
      for (const r of o)
        if (r.trim().startsWith("STATE:")) {
          const i = r.trim().substring(6).toLowerCase() === "true";
          t && !t.isDestroyed() && t.webContents.send("global-caps-lock-changed", i);
        }
    }), S.on("exit", () => {
      S = null;
    });
  } catch (e) {
    console.error("Failed to start caps lock worker:", e);
  }
}
function X() {
  S && (S.kill(), S = null);
}
function m() {
  if (!t) return;
  t.isMinimized() && t.restore();
  const s = u("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  (s == null ? void 0 : s.value) === "true" && t.maximize(), t.show(), t.focus();
}
function K() {
  const s = u("SELECT value FROM settings WHERE key = ?", ["auto_unlock_caps_lock"]), e = (s == null ? void 0 : s.value) === "true", n = u("SELECT value FROM settings WHERE key = ?", ["language"]), r = ((n == null ? void 0 : n.value) || "en") === "es";
  return [
    { label: `CyberNotes  ·  v${c.getVersion()}`, enabled: !1 },
    { type: "separator" },
    { label: r ? "Abrir CyberNotes" : "Open CyberNotes", click: m },
    {
      label: r ? "Configuración" : "Settings",
      click: () => {
        m(), t && !t.isDestroyed() && t.webContents.send("open-settings");
      }
    },
    { type: "separator" },
    {
      label: r ? "Desactivar CapsLock por inactividad" : "Disable Caps Lock on inactivity",
      type: "checkbox",
      checked: e,
      click: (i) => {
        const R = i.checked;
        l("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_unlock_caps_lock", R ? "true" : "false"]), A(), t && !t.isDestroyed() && t.webContents.send("setting-changed", { key: "auto_unlock_caps_lock", value: R ? "true" : "false" });
      }
    },
    { type: "separator" },
    {
      label: r ? "Salir" : "Quit",
      click: () => {
        k = !0, c.quit();
      }
    }
  ];
}
function A() {
  if (!(!p || p.isDestroyed()))
    try {
      const s = W.buildFromTemplate(K());
      p.setContextMenu(s);
    } catch (s) {
      console.error("Failed to update tray menu:", s);
    }
}
function Y() {
  try {
    p = new H(y), A(), p.setToolTip("CyberNotes"), p.on("click", () => {
      t != null && t.isVisible() ? t.hide() : m();
    });
  } catch (s) {
    console.error("Failed to create tray:", s);
  }
}
function F() {
  const s = u("SELECT value FROM settings WHERE key = ?", ["window_bounds"]), e = u("SELECT value FROM settings WHERE key = ?", ["is_maximized"]);
  let n = { width: 1100, height: 700, x: void 0, y: void 0 };
  if (s)
    try {
      const r = JSON.parse(s.value);
      r.width > 400 && r.height > 400 && (n = r);
    } catch {
    }
  t = new I({
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
    icon: y,
    webPreferences: {
      preload: d.join(g, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      webSecurity: !1
    },
    show: !1
  });
  const o = () => {
    if (!t || t.isDestroyed()) return;
    const r = t.isMaximized();
    l("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["is_maximized", r ? "true" : "false"]);
    const i = t.getBounds();
    i.width > 100 && i.height > 100 && l("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["window_bounds", JSON.stringify(i)]);
  };
  t.on("resize", o), t.on("move", o), t.on("close", o), t.on("maximize", o), t.on("unmaximize", o), t.on("hide", o), t.on("minimize", () => {
    const r = u("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
    (r == null ? void 0 : r.value) === "true" && (t == null || t.hide());
  }), t.on("close", (r) => {
    const i = u("SELECT value FROM settings WHERE key = ?", ["close_to_tray"]);
    if ((i == null ? void 0 : i.value) === "true" && !k)
      return r.preventDefault(), t == null || t.hide(), !1;
    if (O)
      return r.preventDefault(), L.showMessageBox(t, {
        type: "question",
        buttons: ["Salir sin guardar", "Cancelar"],
        defaultId: 1,
        title: "Cambios sin guardar",
        message: "Tienes cambios sin guardar en la nota actual. ¿Salir sin guardar?"
      }).then((R) => {
        R.response === 0 && (O = !1, k = !0, t == null || t.close());
      }), !1;
    p && !p.isDestroyed() && (p.destroy(), p = null);
  }), t.webContents.setWindowOpenHandler(({ url: r }) => (r.startsWith("http") && N.openExternal(r), { action: "deny" })), t.webContents.on("context-menu", (r, i) => {
    r.preventDefault(), t == null || t.webContents.send("context-menu-data", {
      x: i.x,
      y: i.y,
      suggestions: i.dictionarySuggestions,
      misspelledWord: i.misspelledWord,
      linkURL: i.linkURL
    });
  }), _ ? t.loadURL("http://localhost:5173") : t.loadFile(d.join(g, "../dist/index.html")), t.once("ready-to-show", () => {
    process.argv.includes("--hidden") || ((e == null ? void 0 : e.value) === "true" && (t == null || t.maximize()), t.show(), t.focus());
  });
}
a.handle("window-minimize", () => {
  const s = u("SELECT value FROM settings WHERE key = ?", ["minimize_to_tray"]);
  (s == null ? void 0 : s.value) === "true" ? t == null || t.hide() : t == null || t.minimize();
});
a.handle("window-maximize-toggle", () => {
  t != null && t.isMaximized() ? t.unmaximize() : t == null || t.maximize();
});
a.handle("window-close", () => t == null ? void 0 : t.close());
a.handle("window:unsavedChanges:set", (s, e) => {
  O = e;
});
a.handle("open-dev-tools", () => t == null ? void 0 : t.webContents.openDevTools({ mode: "detach" }));
a.handle("open-data-folder", () => N.openPath(b));
a.handle("replace-misspelling", (s, e) => t == null ? void 0 : t.webContents.replaceMisspelling(e));
a.handle("add-to-dictionary", (s, e) => {
  D.defaultSession.addWordToSpellCheckerDictionary(e);
});
a.handle("unlock-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((s) => {
  x(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; if ([System.Windows.Forms.Control]::IsKeyLocked('CapsLock')) { (New-Object -ComObject WScript.Shell).SendKeys('{CAPSLOCK}'); Write-Host 'unlocked' } else { Write-Host 'already-off' }"`, (n, o) => {
    if (n)
      console.error("Failed to unlock caps lock:", n), s(!1);
    else {
      const r = o.trim();
      s(r === "unlocked" || r === "already-off");
    }
  });
}));
a.handle("check-caps-lock", async () => process.platform !== "win32" ? !1 : new Promise((s) => {
  x(`powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Control]::IsKeyLocked('CapsLock')"`, (n, o) => {
    s(n ? !1 : o.trim().toLowerCase() === "true");
  });
}));
a.handle("auth:hasPassword", () => !!u("SELECT value FROM settings WHERE key = ?", ["password_hash"]));
a.handle("auth:setPassword", async (s, e) => {
  const n = await P.hash(e, 10);
  return l("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["password_hash", n]), !0;
});
a.handle("auth:verifyPassword", async (s, e) => {
  const n = u("SELECT value FROM settings WHERE key = ?", ["password_hash"]);
  return n ? P.compare(e, n.value) : !0;
});
a.handle("auth:removePassword", () => (l("DELETE FROM settings WHERE key = ?", ["password_hash"]), !0));
a.handle("settings:get", (s, e) => {
  const n = u("SELECT value FROM settings WHERE key = ?", [e]);
  return n ? n.value : null;
});
a.handle("settings:set", (s, e, n) => (l("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [e, n]), (e === "auto_unlock_caps_lock" || e === "language") && A(), e === "caps_lock_sound_scope" && (n === "global" ? U() : X()), !0));
a.handle("settings:setAutoStart", (s, e) => (c.setLoginItemSettings({
  openAtLogin: e,
  openAsHidden: !0,
  // macOS
  args: e ? ["--hidden"] : []
  // Windows / Linux
}), l("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ["auto_start", e ? "true" : "false"]), !0));
a.handle("settings:getAutoStart", () => c.getLoginItemSettings().openAtLogin);
a.handle("folders:getAll", () => h("SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC"));
a.handle("folders:create", (s, e) => (l(
  "INSERT INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  [e.id, e.name, e.icon, e.color, e.sort_order, e.created_at]
), e));
a.handle("folders:update", (s, e) => (l(
  "UPDATE folders SET name = ?, icon = ?, color = ?, sort_order = ? WHERE id = ?",
  [e.name, e.icon, e.color, e.sort_order, e.id]
), !0));
a.handle("folders:delete", (s, e) => (l("DELETE FROM notes WHERE folder_id = ?", [e]), l("DELETE FROM folders WHERE id = ?", [e]), !0));
a.handle("notes:getAll", () => h("SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC"));
a.handle("notes:getByFolder", (s, e) => e === "floating" ? h('SELECT * FROM notes WHERE folder_id IS NULL OR folder_id = "" ORDER BY pinned DESC, updated_at DESC') : e ? h("SELECT * FROM notes WHERE folder_id = ? ORDER BY pinned DESC, updated_at DESC", [e]) : h("SELECT * FROM notes ORDER BY pinned DESC, updated_at DESC"));
a.handle("notes:save", (s, e) => (u("SELECT id FROM notes WHERE id = ?", [e.id]) ? l(
  "UPDATE notes SET folder_id = ?, title = ?, content = ?, preview = ?, pinned = ?, updated_at = ? WHERE id = ?",
  [e.folder_id, e.title, e.content, e.preview, e.pinned, e.updated_at, e.id]
) : l(
  "INSERT INTO notes (id, folder_id, title, content, preview, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  [e.id, e.folder_id, e.title, e.content, e.preview, e.pinned, e.created_at, e.updated_at]
), e));
a.handle("notes:delete", (s, e) => (l("DELETE FROM notes WHERE id = ?", [e]), !0));
a.handle("notes:search", (s, e) => {
  const n = `%${e}%`;
  return h(
    "SELECT * FROM notes WHERE title LIKE ? OR preview LIKE ? OR content LIKE ? ORDER BY pinned DESC, updated_at DESC",
    [n, n, n]
  );
});
a.handle("images:selectAndSave", async () => {
  const s = await L.showOpenDialog(t, {
    title: "Seleccionar imagen",
    filters: [{ name: "Imágenes", extensions: ["png", "jpg", "jpeg", "gif", "webp", "svg"] }],
    properties: ["openFile"]
  });
  if (s.canceled || !s.filePaths.length) return null;
  const e = s.filePaths[0], n = d.extname(e), o = `${$()}${n}`, r = d.join(C, o);
  return E.copyFileSync(e, r), `file:///${r.replace(/\\/g, "/")}`;
});
a.handle("data:export", async () => {
  const s = await L.showSaveDialog(t, {
    title: "Exportar datos de CyberNotes",
    defaultPath: "cybernotes-export.json",
    filters: [{ name: "JSON", extensions: ["json"] }]
  });
  if (s.canceled || !s.filePath) return !1;
  const e = h("SELECT * FROM folders"), n = h("SELECT * FROM notes"), o = { folders: e, notes: n, version: 1 };
  return E.writeFileSync(s.filePath, JSON.stringify(o, null, 2)), !0;
});
a.handle("data:import", async () => {
  const s = await L.showOpenDialog(t, {
    title: "Importar datos a CyberNotes",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"]
  });
  if (s.canceled || !s.filePaths.length) return !1;
  try {
    const e = JSON.parse(E.readFileSync(s.filePaths[0], "utf-8"));
    if (!e.folders || !e.notes) return !1;
    const n = T + ".backup-" + Date.now();
    E.existsSync(T) && E.copyFileSync(T, n);
    for (const o of e.folders)
      l(
        "INSERT OR REPLACE INTO folders (id, name, icon, color, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        [o.id, o.name, o.icon, o.color, o.sort_order, o.created_at]
      );
    for (const o of e.notes)
      l(
        "INSERT OR REPLACE INTO notes (id, folder_id, title, content, preview, pinned, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [o.id, o.folder_id, o.title, o.content, o.preview, o.pinned, o.created_at, o.updated_at]
      );
    return !0;
  } catch (e) {
    return console.error("Import error:", e), !1;
  }
});
const J = c.requestSingleInstanceLock();
J ? (c.on("second-instance", (s, e, n) => {
  m();
}), c.whenReady().then(async () => {
  D.defaultSession.setSpellCheckerLanguages(["es-ES", "en-US"]), await q(), F(), Y();
  const s = u("SELECT value FROM settings WHERE key = ?", ["caps_lock_sound_scope"]);
  (s == null ? void 0 : s.value) === "global" && U(), c.on("activate", () => {
    I.getAllWindows().length === 0 ? F() : m();
  });
}), c.on("window-all-closed", () => {
  process.platform !== "darwin" && (p || c.quit());
})) : c.quit();
