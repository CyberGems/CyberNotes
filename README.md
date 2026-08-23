# CyberNotes 🚀

[![Version](https://img.shields.io/badge/version-1.6.0-blue.svg)](https://github.com/CyberGems/CyberNotes)
[![License](https://img.shields.io/badge/license-GPL--3.0-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4.svg)](https://github.com/CyberGems/CyberNotes/releases)
[![Electron](https://img.shields.io/badge/Electron-35-47848f.svg)](https://www.electronjs.org/)

**CyberNotes** is a premium, secure, and privacy-focused note-taking application designed for the modern user. Built with Electron, React, and SQL.js, it delivers a high-performance experience with a stunning "Cyber" aesthetic — all while keeping your data entirely on your machine.

🌐 [Official Website](https://cybergems.org/)

![CyberNotes UI](public/icon.png)

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
- Local-only database powered by SQL.js — your notes never leave your device.
- Optional master password protection with bcrypt encryption.
- Automatic inactivity lock to secure your data when you step away.

### ✍️ Rich Text Editing
Advanced editor based on TipTap with support for:
- Markdown-style shortcuts for fast formatting.
- Image integration (saved locally in your user profile).
- Code blocks, highlights, and link previews.
- **Optional Line Counter Gutter** for a professional developer-like writing experience.

### 📁 Organization
- Intuitive folder system with customizable icons and colors.
- Quick note search and filtering.

### 🎨 Advanced Customization
- Dynamic UI scaling to fit any display.
- Glassmorphism effects with adjustable blur intensity.
- Custom background images with configurable opacity.
- Multiple curated themes (Cyber Dark, Cyber Purple, and more).
- Color intensity controls for fine-tuned theming.

### 🖥️ Desktop Ready
- System tray integration for background operation.
- Auto-start with Windows support.
- Single-instance locking to prevent duplicate processes.
- Display-aware window sanitization for perfect placement on any monitor setup.
- Built-in auto-updater powered by `electron-updater`.

### 🌐 Multilingual
- Full bilingual interface available in **English** and **Español**.

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

The application is packaged using `electron-builder`. Installers for Windows can be found in the `release/` directory after running the build command.

Two distribution formats are available:
- **NSIS Installer** — Standard Windows setup with installation wizard.
- **Portable** — No installation required; run from any folder.

Releases are published automatically via [electron-updater](https://www.electron.build/configuration/publish) to GitHub Releases.

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
CyberNotes includes a built-in auto-updater. When a new release is available, you'll be prompted to download and install it from the About section.

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
