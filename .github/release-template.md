<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberNotes/main/public/icon.png" width="120" alt="CyberNotes">
</p>

## 📰 CyberNotes {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. Keep the Spanish mirror inside the details block in sync: translate the summary and rewrite the highlights. -->
<!-- COVERAGE: list every commit since the previous tag before drafting. Give every user-facing change at least one highlight and group related commits into one. Skip internal refactors, CI, tests and dependency bumps with no visible effect; keep small visible fixes such as copy, tooltips, shortcuts, themes, icons, spacing, stability and perceptible performance. Review the draft if 15+ user-facing commits produce fewer than 6 highlights, or 40+ total commits fewer than 8. Patch releases may have 1-3 highlights or a plain maintenance-only note. -->
<!-- changelog-summary:start -->
Upgrades Electron to 42.11.18 to eliminate the native white titlebar flash on Windows tray popups, fixes tray flicker and cross-monitor jumps with a 4px flyout gap, and refines the titlebar More menu with side flyouts and top-level Lock.
<!-- changelog-summary:end -->

> **New to CyberNotes?** A privacy-focused Windows notes app with rich text, folders, tabs, floating notes, and fully local data.

---

### ✨ Key Features & Highlights

- 🪟 **Clean multi-monitor tray on Electron 42**: Upgraded Electron to `42.11.18` and switched the tray menu to a fresh prewarmed window with two-step transparent reveal and a `4px` flyout gap, eliminating the white titlebar flash, repeated-open flicker, and cross-monitor jumps.
- 📋 **Streamlined titlebar More menu**: Sections now open as side flyouts preferring the right side, the redundant App section is removed, and Lock is lifted directly to the main menu level.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

Actualiza Electron a 42.11.18 para eliminar la barra de título blanca en la bandeja de Windows, corrige parpadeos y saltos entre monitores con flyouts a 4px y simplifica el menú Más de la barra de título con flyouts laterales y Bloquear en primer nivel.

> **¿Nuevo en CyberNotes?** Una app de notas para Windows centrada en la privacidad, con texto enriquecido, carpetas, pestañas, notas flotantes y datos totalmente locales.

---

### ✨ Novedades destacadas

- 🪟 **Bandeja limpia en multimonitor con Electron 42**: Se actualizó Electron a `42.11.18` y se pasó el menú de bandeja a ventana precalentada con revelado transparente en dos pasos y espacio de `4px`, eliminando la barra blanca, el parpadeo y los saltos entre monitores.
- 📋 **Menú Más más limpio en la barra de título**: Las secciones se abren como flyouts laterales hacia la derecha, se eliminó la sección App redundante y Bloquear queda directamente en el nivel principal.

### ℹ️ Antes de instalar

- **Windows:** esta versión aún no está firmada digitalmente. SmartScreen puede avisar antes de ejecutarla: **Más información › Ejecutar de todas formas**. Cuando Smart App Control está activado, Windows rechaza programas sin firmar; consulta la [política de firma de código](https://github.com/CyberGems/.github/blob/main/CODE_SIGNING.md). Verifica la descarga con los checksums SHA256 que aparecen más abajo.

</details>

---

### ℹ️ Before you install

- **Windows:** this release is not code-signed yet. SmartScreen may ask before it runs: **More info › Run anyway**. Where Smart App Control is on, Windows refuses unsigned programs; see the [code signing policy](https://github.com/CyberGems/.github/blob/main/CODE_SIGNING.md). Verify the download with the SHA256 checksums below.

---

### 📦 Downloads & Packages

> ⬇️ **Direct download:** click a file name to download it now. Same files as in **Assets** at the bottom of this page.

| File | Description | Platform |
| :--- | :--- | :--- |
| **[`CyberNotes_Setup_{{RAW_VERSION}}.exe`](https://github.com/CyberGems/CyberNotes/releases/download/{{VERSION}}/CyberNotes_Setup_{{RAW_VERSION}}.exe)** | 🚀 **Recommended Installer** (NSIS wizard, custom install dir, Start Menu + Desktop shortcuts) | Windows 10 / 11 (x64) |
| **[`CyberNotes_Portable_{{RAW_VERSION}}.exe`](https://github.com/CyberGems/CyberNotes/releases/download/{{VERSION}}/CyberNotes_Portable_{{RAW_VERSION}}.exe)** | Portable build (zero-install) | Windows 10 / 11 (x64) |

---

### 🔐 VirusTotal and SHA256

> 🛡️ The report opens on VirusTotal and does not download anything.

**Installer**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{INSTALLER_HASH}})

```text
{{INSTALLER_HASH}}
```

**Portable**: [View VirusTotal report](https://www.virustotal.com/gui/file/{{PORTABLE_HASH}})

```text
{{PORTABLE_HASH}}
```

---

📜 **Full changelog:** browse every version in [CHANGELOG.md](https://github.com/CyberGems/CyberNotes/blob/main/CHANGELOG.md).

*Crafted with precision by [CyberGems](https://cybergems.org)*
