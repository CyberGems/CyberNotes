<p align="center">
  <img src="public/icon.png" width="128" height="128" alt="CyberNotes" />
</p>

<h1 align="center">CyberNotes — Secure Note-Taking</h1>

<p align="center">
  <strong>Premium, privacy-focused note-taking</strong> — high-performance Electron + React + SQL.js with a stunning Cyber aesthetic. Your data stays 100% local.
</p>

<p align="center">
  <a href="https://github.com/CyberGems/CyberNotes/releases/latest">
    <img src="https://img.shields.io/badge/⚡_Download_Latest_Release-(Windows_64--bit)-00F2FF?style=for-the-badge&logo=windows&logoColor=000000" alt="Download Latest Release" />
  </a>
  <a href="https://github.com/CyberGems/CyberNotes/releases">
    <img src="https://img.shields.io/badge/All_Releases-Changelog-18181B?style=for-the-badge&logo=github&logoColor=white" alt="All Releases" />
  </a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D4.svg?logo=windows&logoColor=white" alt="Platform" />
  <img src="https://img.shields.io/badge/version-1.8.0-00F0FF.svg" alt="Version" />
  <img src="https://img.shields.io/badge/Electron-35-512BD4.svg?logo=electron&logoColor=white" alt="Electron" />
  <a href="https://github.com/CyberGems/CyberNotes/wiki"><img src="https://img.shields.io/badge/📖_Wiki-Documentation-222222.svg?logo=github&logoColor=white" alt="Wiki" /></a>
</p>

A modern, privacy-focused desktop note-taking application with a cyberpunk aesthetic. Built with **Electron + React + TypeScript**, it stores all data locally using **SQL.js (SQLite WASM)** — your notes never leave your device.

*Free and open source (GPLv3) — no ads, no tracking, and no data collection. Just enjoy it.*

---

## 🔒 Why CyberNotes?

Most note apps either sync your data to the cloud (privacy risk) or are too basic to be useful. CyberNotes gives you **the best of both worlds**: rich editing, powerful organization, and rock-solid security — all 100% offline.

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

## ❓ Frequently Asked Questions

### Is my data synced to the cloud?

No. CyberNotes stores everything locally using SQL.js (SQLite WASM). Your notes never leave your device unless you explicitly export or back them up.

### What happens if I forget my master password?

The master password is hashed with bcrypt and cannot be recovered. You would need to reset the database, which would result in data loss. Choose a password you won't forget.

### Does CyberNotes support other operating systems?

Currently, Windows is officially supported. The application is built with Electron, so support for macOS and Linux may be added in the future.

### How do updates work?

Auto-updates are **unattended** when enabled (Settings → About → *Actualizaciones automáticas*): the app checks on launch and every 6h, downloads in background with a progress bar, then shows *"Update ready — Restarting in 8s"* (you can hit **Restart now** or **Later**; if you have unsaved changes it waits until quit). You can also trigger a manual check from the About dialog at any time.

### Where is my data stored?

All data is stored locally:

```
%APPDATA%/CyberNotes/cybernotes.db
```

Images are stored in `%APPDATA%/CyberNotes/images/`.

---

## ❤️ Donate

**CyberNotes** is a personal open-source project within the **CyberGems** suite. I've spent thousands of hours building and refining it — both for my own use and to share premium-quality software with the world for free.

If you'd like to support this work, a donation would mean a lot. Thank you! 🙏

<p align="center">
  <a href="https://www.paypal.com/donate/?hosted_button_id=M4PY3UPJA5Y6Q"><img src="https://img.shields.io/badge/Donate-PayPal-0070BA?style=for-the-badge&logo=paypal" alt="Donate via PayPal" /></a>
  <a href="https://ko-fi.com/cybergems"><img src="https://img.shields.io/badge/Support_me_on_Ko--fi-FF5E5B?style=for-the-badge&logo=ko-fi&logoColor=white" alt="Support me on Ko-fi" /></a>
  <a href="https://buymeacoffee.com/cybergems"><img src="https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black" alt="Buy Me a Coffee" /></a>
</p>

<div align="center">

<details>
<summary><b>Crypto donations (BTC, ETH, USDT, LTC) — click to view addresses</b></summary>

<div align="left">

| Asset | Network | Address | QR |
|---|---|---|---|
| <img src="docs/donate/btc.svg" width="18" height="18" valign="middle" alt="BTC" /> **BTC** | Bitcoin | `bc1q5mxzz05nmvsheqzx7970euswta3fksxzcfzag4` | ![BTC QR](docs/donate/qr-btc.png) |
| <img src="docs/donate/eth.svg" width="18" height="18" valign="middle" alt="ETH" /> **ETH** | Ethereum (ERC20) | `0x79b703Ec0f77493679Fcd280aF3b983E20c580B8` | ![ETH QR](docs/donate/qr-eth.png) |
| <img src="docs/donate/usdt.svg" width="18" height="18" valign="middle" alt="USDT" /> **USDT** | Ethereum (ERC20) | `0x79b703Ec0f77493679Fcd280aF3b983E20c580B8` | ![USDT ERC20 QR](docs/donate/qr-eth.png) |
| <img src="docs/donate/usdt.svg" width="18" height="18" valign="middle" alt="USDT" /> **USDT** | BNB Smart Chain (BEP20) | `0x79b703Ec0f77493679Fcd280aF3b983E20c580B8` | ![USDT BEP20 QR](docs/donate/qr-eth.png) |
| <img src="docs/donate/usdt.svg" width="18" height="18" valign="middle" alt="USDT" /> **USDT** | Tron (TRC20) | `TSVbSk1HSyZ1NprCnAYiw56ECwXgH887mD` | ![USDT TRC20 QR](docs/donate/qr-usdt-tron.png) |
| <img src="docs/donate/ltc.svg" width="18" height="18" valign="middle" alt="LTC" /> **LTC** | Litecoin | `LWGnEHgcFCE2BRkzLnsdPDD8Y8ZeDK577X` | ![LTC QR](docs/donate/qr-ltc.png) |

> ⚠️ Send only the selected asset on the indicated network. Using the wrong network will result in permanent loss of funds.

</div>

</details>

</div>

---

## 📄 License

CyberNotes is distributed under the terms of the GNU General Public License v3.0. See [LICENSE](LICENSE) for the full license text.

Copyright (C) 2026 CyberGems

---

<div align="center" style="background:#0D0F17; border:1px solid rgba(0,255,255,0.12); border-radius:12px; padding:28px 20px; margin-top:32px;">

### Thanks for using CyberNotes! 🎉

Made by [**CyberGems**](https://cybergems.org)

</div>
