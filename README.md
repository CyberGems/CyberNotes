<p align="center">
  <img src="public/icon.png" width="128" height="128" alt="CyberNotes" />
</p>

<h1 align="center">CyberNotes: Secure Note-Taking</h1>

<p align="center">
  <strong>Premium, privacy-focused note-taking</strong>: high-performance Electron + React + SQL.js with a stunning Cyber aesthetic. Your data stays 100% local.
</p>

<p align="center">
  <a href="https://github.com/CyberGems/CyberNotes/releases/latest"><img src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FCyberGems%2FCyberNotes%2Fmain%2Fpackage.json&query=%24.version&prefix=%E2%9A%A1%20RELEASE%20v&style=for-the-badge&label=&labelColor=555555&color=555555" alt="Download Latest Release" /><img src="https://img.shields.io/badge/-(WINDOWS_64--BIT)-0047B3?style=for-the-badge&logo=windows&logoColor=white" alt="Windows 64-bit" /></a>
  &nbsp;<a href="https://github.com/CyberGems/CyberNotes/releases"><img src="https://img.shields.io/badge/All_Releases-Changelog-18181B?style=for-the-badge&logo=github&logoColor=white" alt="All Releases" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License" height="24" />&nbsp;
  <img src="https://img.shields.io/badge/platform-Windows-0078D4.svg?logo=windows&logoColor=white" alt="Platform" height="24" />&nbsp;
  <img src="https://img.shields.io/badge/Electron-35-512BD4.svg?logo=electron&logoColor=white" alt="Electron" height="24" />&nbsp;
  <a href="https://github.com/CyberGems/CyberNotes/wiki"><img src="https://img.shields.io/badge/%F0%9F%93%96_Wiki-Documentation-222222?style=flat-square&logo=github&logoColor=white" alt="Wiki" height="24" /></a>
</p>

A modern, privacy-focused desktop note-taking application with a modern neon aesthetic. Built with **Electron + React + TypeScript**, it stores all data locally using **SQL.js (SQLite WASM)**: your notes never leave your device.

*Free and open source (GPLv3): no ads, no tracking, and no data collection. Just enjoy it.*

---

## 🔒 Why CyberNotes?

Most note apps either sync your data to the cloud (privacy risk) or are too basic to be useful. CyberNotes gives you **the best of both worlds**: rich editing, powerful organization, and rock-solid security, all 100% offline.

| Need | Solution |
|---|---|
| Keep notes private | Local-only SQL.js — no cloud, no accounts, no tracking |
| Rich editing without bloat | TipTap editor with markdown shortcuts, images, code blocks |
| Stay organized | Folders with icons & colors, favorites, multi-tabs, drag & drop |
| Protect sensitive notes | Master password (bcrypt) with auto-lock and privacy shield |
| Work efficiently | Autosave, session restore, global hotkey, system tray |
| Make it yours | 6 themes, custom backgrounds, glass effects, UI scaling |

---

## ✨ Key Features

### ✍️ Rich Text Editing
- **TipTap Editor** — bold, italic, underline, strikethrough, headings (H1–H3), bullet/ordered lists, code blocks, blockquotes, horizontal rules, text highlighting
- **Links & Images** — auto-link detection, image insertion with size and alignment controls, local thumbnail previews
- **Markdown Shortcuts** — type `##`, `>`, `-`, `` ``` `` for instant formatting
- **Document Tools** — line/column counter, word/character count, reading time, document minimap, line numbers
- **Save Options** — autosave as you type, manual save with draft protection, confirm on close/navigation

### 📁 Organization
- **Folders** — custom names, 20 icon options, 20 unique colors (enforced uniqueness)
- **Multi-Tab Interface** — work with multiple notes simultaneously
- **Favorites & Pinning** — pin important notes for quick access
- **Drag & Drop** — move notes between folders effortlessly
- **Instant Search** — full-text search across titles, previews, and content
- **Recent Notes** — track edited, opened, and created notes with history
- **Session Restoration** — remember open tabs and active note between sessions

### 🔐 Security
- **Master Password** — bcrypt-hashed password protection with lock screen
- **Auto-Lock** — configurable inactivity timeout (1 min to 24 hours)
- **Privacy Shield** — screen shield when app is hidden or minimized
- **Caps Lock Manager** — auto-off after inactivity with visual countdown and sound notifications (5 synthesized presets)

### 🎨 Customization
- **6 Visual Themes** — Cyber Dark, Midnight, Forest, Cyber Neon, Light, Graphite
- **Color Intensity** — adjustable 0–100% for colorful themes
- **Custom Background** — set your own wallpaper image
- **Glass Effects** — configurable blur intensity (0–40px) and overlay opacity (0–95%)
- **UI Scaling** — adjust interface size to your preference
- **Tab Width** — normal or wide, minimap toggle, density controls

### 🖥️ Desktop Integration
- **System Tray** — minimize/close to tray, custom DPI-aware tray menu
- **Global Hotkey** — show/hide with customizable shortcut (default: `Alt+Shift+N`)
- **Auto-Start** — launch minimized with Windows
- **Single Instance** — second launches focus the existing window
- **Spell Check** — bilingual (English/Spanish) with right-click suggestions
- **Context Menu** — formatting, spell suggestions, link/image controls

### 🔄 Updates & Data
- **Auto-Updates** — background check on launch + every 6h, progress bar, auto-download and restart
- **Export** — Markdown, HTML (styled), or full JSON backup
- **Import** — restore from JSON backup (with automatic safety backup)
- **Bilingual UI** — full English / Español with instant switching

---

## 🛠️ Tech Stack & Architecture

- **Platform:** Windows 10 / 11
- **Framework:** Electron 35 + React 19 + TypeScript
- **Editor:** TipTap (ProseMirror)
- **Storage:** SQL.js (SQLite compiled to WebAssembly)
- **Security:** bcryptjs password hashing
- **Animations:** Motion (Framer Motion)

```
cyber-notes/
├── electron/
│   ├── main.ts           Electron main process (window, tray, IPC handlers)
│   ├── preload.ts        Context bridge (secure API exposure)
│   └── updater.ts        Auto-update logic
├── src/
│   ├── components/
│   │   ├── MainApp.tsx        Main application layout
│   │   ├── TitleBar.tsx       Custom title bar with menu
│   │   ├── Sidebar.tsx        Folder navigation
│   │   ├── NoteList.tsx       Note list panel
│   │   ├── NoteEditor.tsx     TipTap editor wrapper
│   │   ├── SettingsModal.tsx  Settings panel
│   │   ├── LockScreen.tsx     Password lock screen
│   │   └── AboutModal.tsx     About dialog
│  ├── types/             TypeScript interfaces
│  ├── utils/             Utility functions
│  ├── hooks/             Custom React hooks
│  ├── themes.ts          Theme definitions
│  └── languages.ts       i18n translations
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+ (LTS recommended)
- npm or yarn

### Development

```bash
git clone https://github.com/CyberGems/CyberNotes.git
cd CyberNotes
npm install
npm run dev
```

### Build for Production

```bash
npm run build:electron
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Vite development server with hot reload |
| `npm run build` | Compile TypeScript and build production bundle |
| `npm run build:electron` | Full build: TypeScript → Vite → electron-builder installer |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run TypeScript type-checking without emitting files |

### Distribution

Artifacts land in `release/`:

| Artifact | Description |
|---|---|
| `CyberNotes_Setup_1.8.0.exe` | NSIS installer (interactive wizard, custom install dir) |
| `CyberNotes_Portable_1.8.0.exe` | Portable build (zero-install) |

### 🛡️ Windows SmartScreen

Windows may show a SmartScreen warning the first time you run the CyberNotes installer: this is an unsigned hobby app, so Windows hasn't built reputation for the file yet. This is expected; the source is public so you can inspect exactly what it does. The same can appear when launching the portable build.

To continue:

1. Click **More info**.
2. Click **Run anyway**.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Alt+Shift+N` | Toggle window visibility (customizable) |
| `Ctrl+N` | Create new note |
| `Ctrl+Z` | Undo |
| `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| `Tab` | Insert tab / indent |
| `Shift+Tab` | Remove indent |

---

## ❤️ Donate

I’ve spent countless hours building and refining **CyberNotes** for my own use. I recently decided to share it with the world as part of the [CyberGems](https://github.com/CyberGems#-all-apps--repositories) set of free and open-source tools.

If you’d like to support future updates, I’d truly appreciate it. You can also show your support by [starring the repo on GitHub](https://github.com/CyberGems/CyberNotes). Thank you! 🙏

<p align="center">
  <a href="https://www.paypal.com/donate/?hosted_button_id=M4PY3UPJA5Y6Q"><img src="https://img.shields.io/badge/Donate-PayPal-0070BA?style=for-the-badge&logo=paypal" alt="Donate via PayPal" /></a>
</p>

<p align="center">
  <a href="https://ko-fi.com/cybergems"><img src="https://img.shields.io/badge/Support_me_on_Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support me on Ko-fi" /></a>
</p>

<p align="center">
  <a href="https://buymeacoffee.com/cybergems"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee" /></a>
</p>

<div align="center">

<details>
<summary><b>Crypto donations (BTC, ETH, USDT, LTC) — click to view addresses</b></summary>

| Asset | Address | QR |
|---|---|---|
| **BTC** | <pre><code>bc1q5mxzz05nmvsheqzx7970euswta3fksxzcfzag4</code></pre> | <img src="docs/donate/qr-btc.png" width="90" height="90" alt="BTC QR" /> |
| **ETH** | <pre><code>0x79b703Ec0f77493679Fcd280aF3b983E20c580B8</code></pre> | <img src="docs/donate/qr-eth.png" width="90" height="90" alt="ETH QR" /> |
| **USDT (ERC20 / BEP20)** | <pre><code>0x79b703Ec0f77493679Fcd280aF3b983E20c580B8</code></pre> | <img src="docs/donate/qr-eth.png" width="90" height="90" alt="USDT QR" /> |
| **USDT (TRC20)** | <pre><code>TSVbSk1HSyZ1NprCnAYiw56ECwXgH887mD</code></pre> | <img src="docs/donate/qr-usdt-tron.png" width="90" height="90" alt="USDT TRC20 QR" /> |
| **LTC** | <pre><code>LWGnEHgcFCE2BRkzLnsdPDD8Y8ZeDK577X</code></pre> | <img src="docs/donate/qr-ltc.png" width="90" height="90" alt="LTC QR" /> |

> ⚠️ Send only the selected asset on the indicated network. Using the wrong network will result in permanent loss of funds.

</details>

</div>

---

## 📄 License

CyberNotes is distributed under the terms of the GNU General Public License v3.0. See [LICENSE](LICENSE) for the full license text.

Copyright (C) 2026 CyberGems

---

## ❓ FAQ

For frequently asked questions, troubleshooting guides, and detailed configuration instructions, visit the [FAQ](https://github.com/CyberGems/CyberNotes/wiki/FAQ) or the [online documentation](https://cybergems.org/docs/cybernotes/FAQ).

---

<div align="center" style="background:#0D0F17; border:1px solid rgba(0,255,255,0.12); border-radius:12px; padding:28px 20px; margin-top:32px;">

### Thanks for using CyberNotes! 🎉

Made by [**CyberGems**](https://cybergems.org)

</div>
<p align="center">
  <a href="https://twitter.com/intent/tweet?text=CyberNotes%3A%20free%20%26%20open-source%20desktop%20tool%20for%20Windows&url=https%3A%2F%2Fcybergems.org%2Fapps%2Fcybernotes%2F"><img src="https://img.shields.io/badge/Share_on_X-1DA1F2?style=for-the-badge&logo=x&logoColor=white" alt="Share on X" /></a>
  &nbsp;<a href="https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fcybergems.org%2Fapps%2Fcybernotes%2F"><img src="https://img.shields.io/badge/Share_on_Facebook-1877F2?style=for-the-badge&logo=facebook&logoColor=white" alt="Share on Facebook" /></a>
  &nbsp;<a href="https://www.reddit.com/submit?url=https%3A%2F%2Fcybergems.org%2Fapps%2Fcybernotes%2F&title=CyberNotes%3A%20free%20%26%20open-source%20desktop%20tool%20for%20Windows"><img src="https://img.shields.io/badge/Share_on_Reddit-FF4500?style=for-the-badge&logo=reddit&logoColor=white" alt="Share on Reddit" /></a>
  &nbsp;<a href="https://t.me/share/url?url=https%3A%2F%2Fcybergems.org%2Fapps%2Fcybernotes%2F&text=CyberNotes%3A%20free%20%26%20open-source%20desktop%20tool%20for%20Windows"><img src="https://img.shields.io/badge/Share_on_Telegram-26A5E4?style=for-the-badge&logo=telegram&logoColor=white" alt="Share on Telegram" /></a>
  &nbsp;<a href="https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fcybergems.org%2Fapps%2Fcybernotes%2F"><img src="https://img.shields.io/badge/Share_on_LinkedIn-0A66C2?style=for-the-badge&logo=linkedin&logoColor=white" alt="Share on LinkedIn" /></a>
  &nbsp;<a href="mailto:?subject=CyberNotes%3A%20free%20%26%20open-source%20desktop%20tool%20for%20Windows&body=CyberNotes%3A%20free%20%26%20open-source%20desktop%20tool%20for%20Windows%20https%3A%2F%2Fcybergems.org%2Fapps%2Fcybernotes%2F"><img src="https://img.shields.io/badge/Share_by_Email-EA4335?style=for-the-badge&logo=gmail&logoColor=white" alt="Share by Email" /></a>
</p>

---

## 🔗 See also

More free, open-source, privacy-first apps from [**CyberGems**](https://github.com/CyberGems):

| App | Description |
|:---:|---|
| 🕐&nbsp;[**CyberClock**](https://github.com/CyberGems/CyberClock#readme) | Desktop clock with analog & digital display, calendar, timer, stopwatch and relaxation module. |
| 📢&nbsp;[**CyberFeeds**](https://github.com/CyberGems/CyberFeeds#readme) | High-performance, local-first RSS and Atom reader built for speed, privacy and clean reading. |
| 🚀&nbsp;[**CyberLauncher**](https://github.com/CyberGems/CyberLauncher#readme) | Windows application launcher with hot corners, scheduler, system monitor and integrated terminal. |
| 💻&nbsp;[**CyberManager**](https://github.com/CyberGems/CyberManager#readme) | Lightweight, high-performance task manager, virtualized and NT-native, a powerful Task Manager alternative. |
| ⚡&nbsp;[**CyberPaste**](https://github.com/CyberGems/CyberPaste#readme) | Privacy-first clipboard manager for text, code, images, HTML and files. |
| 📸&nbsp;[**CyberSnap**](https://github.com/CyberGems/CyberSnap#readme) | Screen capture and annotation suite with vector tools, high-speed OCR, screen recording and color picker. |
| ⭐&nbsp;[**CyberTray**](https://github.com/CyberGems/CyberTray#readme) | High-performance tray launcher with hotspots, system monitoring, process manager and PIN-protected file vault. |
| 💫&nbsp;[**CyberViewer**](https://github.com/CyberGems/CyberViewer#readme) | Full-featured image viewer and editor engineered for casual and power users. |
| 🛡️&nbsp;[**CyberWall**](https://github.com/CyberGems/CyberWall#readme) | User-friendly Windows firewall with real-time per-app rules powered by the WFP kernel engine. |

➡️ **[Browse all apps at cybergems.org](https://cybergems.org)**
