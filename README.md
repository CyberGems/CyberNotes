<p align="center">
  <img src="public/icon.png" width="128" height="128" alt="CyberNotes" />
</p>

<h1 align="center">CyberNotes 🚀</h1>

<p align="center">
  <a href="https://github.com/CyberGems/CyberNotes"><img src="https://img.shields.io/badge/version-1.8.0-blue.svg" alt="Version" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0-green.svg" alt="License" /></a>
  <a href="https://github.com/CyberGems/CyberNotes/releases"><img src="https://img.shields.io/badge/platform-Windows-0078d4.svg" alt="Platform" /></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-35-47848f.svg" alt="Electron" /></a>
</p>

<p align="center">
  <strong>Premium, secure and privacy-focused note-taking</strong> — high-performance Electron + React + SQL.js with a stunning Cyber aesthetic. Your data stays 100% local.
  <br />
  🌐 <a href="https://cybergems.org/">cybergems.org</a> · <a href="https://github.com/CyberGems/CyberNotes/issues">Report Bug</a> · <a href="https://github.com/CyberGems/CyberNotes/releases">Releases</a>
</p>

*Free and open source (GPLv3) — no ads, no tracking, and no data collection. Just enjoy it.*

## 📋 Table of Contents

- [Key Features](#-key-features)
- [Tech Stack](#️-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Available Scripts](#available-scripts)
- [Distribution](#-distribution)
- [Contributing](#-contributing)
- [FAQ](#-faq)
- [License](#-license)
- [Support](#-support)

## ✨ Key Features

### 🔒 Privacy First
- Local-only SQL.js (SQLite WASM) — notes never leave your device.
- Optional master password (bcrypt) with inactivity auto-lock and privacy shield.

### ✍️ Rich Text Editing
- TipTap / ProseMirror: markdown shortcuts, headings, lists, code blocks, highlights, links, blockquotes.
- Images saved locally (`userData/images`) with thumbnail previews.
- Autosave toggle, manual Save, draft protection (confirm on close/navigation).
- Line gutter, line/column counter, word/char count + read time, minimap, global Caps Lock auto-off with countdown.

### 📁 Organization
- Folders with icons + unique colors, Favorites & Unfiled views.
- Multi-tabs, drag & drop between folders, pin/unpin.
- Instant search (title/preview/content), recent notes (edited/opened/created) with history.

### 🎨 Customization
- 6 themes + color intensity, UI scale, glass blur & overlay opacity, custom background image.
- Tab width (normal/wide), minimap toggle, density controls — all persisted locally.

### 🖥️ Desktop Ready
- Native window (custom title bar), system tray with crisp DPI-aware icon, custom tray menu.
- Minimize/close to tray, launch at startup (hidden), single-instance lock, global hotkey `Alt+Shift+N`.
- Display-aware window restore, unsaved-changes guard, offline-first.

### 🔄 Unattended Updates
- `electron-updater` via GitHub Releases: background check on launch + every 6h, progress bar, auto-download and auto-restart (deferred if unsaved changes, cancellable via “Later”). Original NSIS installer stays interactive.

### 🌐 Multilingual
- Full **English / Español** UI with persisted preference.

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, TypeScript, Vite |
| **Editor** | TipTap (ProseMirror) |
| **Animations** | Motion (formerly Framer Motion) |
| **Storage** | SQL.js (SQLite WASM) |
| **Security** | bcryptjs |
| **Desktop** | Electron 35 |
| **Icons** | Lucide React |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Latest LTS recommended — v18+)
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/CyberGems/CyberNotes.git
   cd CyberNotes
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run dev
   ```

4. Build the production installer:
   ```bash
   npm run build:electron
   ```

### Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite development server with hot reload. |
| `npm run build` | Compile TypeScript and build the production bundle. |
| `npm run build:electron` | Full build: TypeScript → Vite → electron-builder installer. |
| `npm run preview` | Preview the production build locally. |
| `npm run lint` | Run TypeScript type-checking without emitting files. |

## 📦 Distribution

Packaged with `electron-builder`. After `npm run build:electron`, artifacts land in `release/`:

- **NSIS Installer** (`CyberNotes_Setup_${version}.exe`) — interactive wizard (`oneClick: false`), custom install dir, desktop shortcut, `perMachine` support. Original installer is never touched by updates.
- **Portable** (`CyberNotes_Portable_${version}.exe`) — zero-install, run from any folder.

Updates are delivered via `electron-updater` (GitHub provider `CyberGems/CyberNotes`). NSIS updates run silently (`/S`) with a global progress banner and auto-restart; portable builds require manual download.

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/your-feature`.
3. Commit your changes with clear commit messages.
4. Push to your branch and open a Pull Request.

Please ensure your code passes type-checking (`npm run lint`) before submitting.

## ❓ FAQ

**Is my data synced to the cloud?**
No. CyberNotes stores everything locally using SQL.js. Your notes never leave your device unless you explicitly back them up.

**What happens if I forget my master password?**
The master password is hashed with bcrypt and cannot be recovered. You would need to reset the database, which would result in data loss. Choose a password you won't forget.

**Does CyberNotes support other operating systems?**
Currently, only Windows is officially supported. The application is built with Electron, so support for macOS and Linux may be added in the future.

**How do I update the application?**
Auto-updates are **unattended** when enabled (Settings → About → *Actualizaciones automáticas*): the app checks on launch and every 6h, downloads in background with a progress bar, then shows *“Update ready — Restarting in 8s”* (you can hit **Restart now** or **Later**; if you have unsaved changes it waits until quit). You can also trigger a manual check from the About dialog at any time.

## ❤️ Donate

**CyberNotes** is a personal open-source project within the **CyberGems** suite. I've spent thousands of hours building and refining it — both for my own use and to share premium-quality software with the world for free.

If you'd like to support this work, a donation would mean a lot. Thank you! 🙏

[![Donate via PayPal](https://img.shields.io/badge/Donate-PayPal-0070BA?style=for-the-badge&logo=paypal)](https://paypal.me/CyberGems) [![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/cybergems)

<details>
<summary><img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/btc.png" width="16" height="16"/> <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/eth.png" width="16" height="16"/> <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/usdt.png" width="16" height="16"/> <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/ltc.png" width="16" height="16"/> Crypto donations — choose the correct network</summary>

| Asset | Network | Address | QR |
|---|---|---|---|
| <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/btc.png" width="16" height="16"/> BTC | Bitcoin | `bc1q5mxzz05nmvsheqzx7970euswta3fksxzcfzag4` | ![BTC QR](docs/donate/qr-btc.png) |
| <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/eth.png" width="16" height="16"/> ETH | Ethereum (ERC20) | `0x79b703Ec0f77493679Fcd280aF3b983E20c580B8` | ![ETH QR](docs/donate/qr-eth.png) |
| <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/usdt.png" width="16" height="16"/> USDT | Ethereum (ERC20) | `0x79b703Ec0f77493679Fcd280aF3b983E20c580B8` | ![USDT ERC20 QR](docs/donate/qr-eth.png) |
| <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/usdt.png" width="16" height="16"/> USDT | BNB Smart Chain (BEP20) | `0x79b703Ec0f77493679Fcd280aF3b983E20c580B8` | ![USDT BEP20 QR](docs/donate/qr-eth.png) |
| <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/usdt.png" width="16" height="16"/> USDT | Tron (TRC20) | `TSVbSk1HSyZ1NprCnAYiw56ECwXgH887mD` | ![USDT TRC20 QR](docs/donate/qr-usdt-tron.png) |
| <img src="https://raw.githubusercontent.com/spothq/cryptocurrency-icons/master/32/color/ltc.png" width="16" height="16"/> LTC | Litecoin | `LWGnEHgcFCE2BRkzLnsdPDD8Y8ZeDK577X` | ![LTC QR](docs/donate/qr-ltc.png) |

> ⚠️ Send only the selected asset on the indicated network. Using the wrong network will result in permanent loss of funds.

</details>

## 📄 License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE) file for details.

```
CyberNotes — A premium, secure, and privacy-focused note-taking application.
Copyright (C) 2025 CyberGems

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
```

## 💬 Support

- **Official Website:** [cybergems.org](https://cybergems.org/)
- **Bug Reports & Feature Requests:** [Open an issue](https://github.com/CyberGems/CyberNotes/issues)
- **Source Code:** [github.com/CyberGems/CyberNotes](https://github.com/CyberGems/CyberNotes)

---

*Built with ❤️ by [CyberGems](https://github.com/CyberGems)*
