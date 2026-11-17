<p align="center">
  <img src="https://raw.githubusercontent.com/CyberGems/CyberNotes/main/public/icon.png" width="120" alt="CyberNotes">
</p>

## 📰 CyberNotes {{VERSION}}: Release Notes

### 🚀 What's new in this release

<!-- IMPORTANT FOR AGENTS & MAINTAINERS: Always rewrite this entire section and highlights with the ACTUAL release notes for this specific new version before tagging. NEVER leave or copy previous version notes! Use 25-45 words for the summary, lead with user-facing changes, and do not repeat the app name or version. Keep the Spanish mirror inside the details block in sync: translate the summary and rewrite the highlights. -->
<!-- changelog-summary:start -->
Update checks stay quiet when they fail, update notes drop the pre-install guidance, and the Windows uninstall entry shows the website and description. All-users uninstall retries close properly, dependencies are refreshed, and releases now ship winget manifests.
<!-- changelog-summary:end -->

> **New to CyberNotes?** A privacy-focused Windows notes app with rich text, folders, tabs, floating notes, and fully local data.

---

### ✨ Key Features & Highlights

- 🔕 **Calmer updates**: Failed update checks no longer nag through the banner, and the in-app update notes skip the "Before you install" guidance.
- 🧹 **Cleaner uninstall**: The Windows Apps entry shows the CyberNotes website and description, and forced-close retries behave correctly for all-users installs.
- 🧰 **Maintenance**: 23 npm dependencies are refreshed, and every release now ships winget manifests for the Windows Package Manager.

<details>
<summary><b>🇪🇸 Ver notas de la versión en Español</b></summary>

### 🚀 Novedades de esta versión

Las comprobaciones de actualización fallan en silencio, las notas de actualización omiten la guía previa y la entrada de desinstalación de Windows muestra el sitio web y la descripción. El reintento de cierre en desinstalaciones para todos los usuarios queda resuelto, se renuevan dependencias y los releases publican manifiestos winget.

> **¿Nuevo en CyberNotes?** Una app de notas para Windows centrada en la privacidad, con texto enriquecido, carpetas, pestañas, notas flotantes y datos totalmente locales.

---

### ✨ Novedades destacadas

- 🔕 **Actualizaciones más tranquilas**: las comprobaciones fallidas ya no molestan desde el banner, y las notas de actualización dentro de la app omiten la guía «Antes de instalar».
- 🧹 **Desinstalación más limpia**: la entrada de Aplicaciones de Windows muestra el sitio web y la descripción de CyberNotes, y los reintentos de cierre forzado funcionan bien en instalaciones para todos los usuarios.
- 🧰 **Mantenimiento**: se renuevan 23 dependencias de npm y cada release publica manifiestos winget para el Windows Package Manager.

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
