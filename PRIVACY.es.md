# Privacidad — CyberNotes

CyberNotes funciona en tu PC y guarda tus datos en tu PC. **No tiene cuenta, telemetría, SDK de analítica ni anuncios.** Nunca envía tu notas, carpetas o ajustes a su autor ni a nadie más.

Todo lo que sabe (notas, carpetas o ajustes) se queda en `%APPDATA%\CyberNotes\` (`cybernotes.db`, `images\`, `backups\`, logs y diccionarios). La variable `CYBERNOTES_USER_DATA_DIR` puede mover esta carpeta; los datos antiguos en `%APPDATA%\cyber-notes` se conservan. El instalador no define `deleteAppDataOnUninstall`, por lo que los datos se conservan.

## Cuándo CyberNotes se conecta a internet

Estas son todas las conexiones que CyberNotes hace por su cuenta. Ninguna envía tu notas, carpetas o ajustes. Como en cualquier petición de internet, el servidor ve tu dirección IP.

| Cuándo | Dónde | Para qué | Cómo desactivarlo |
|---|---|---|---|
| 8 segundos después de iniciar y cada 6 horas | `github.com` (feed de actualizaciones), con notas desde `api.github.com` | Consultar una versión nueva | `auto_check_updates` (activado por defecto) |
| Con el corrector ortográfico activado | Servicio de diccionarios de Chromium (host exacto no verificable en el código de la app) | Descargar diccionarios | `spellcheck_enabled` |

Las vistas previas de vídeo incrustadas y los enlaces que abres son acciones tuyas.

## Qué lee CyberNotes de tu PC

CyberNotes lee la geometría de pantalla, el idioma del sistema, el estado de las teclas de bloqueo y la lista de idiomas del corrector. Esa información se queda en pantalla. Todo lo que cambia el sistema pide confirmación antes y, cuando es posible, guarda una copia para poder deshacerlo.

## Dudas

Abre un issue: https://github.com/CyberGems/CyberNotes/issues

Para una pregunta concreta sobre privacidad, usa la [página de contacto](https://cybergems.org/contact). La declaración general de la suite está en [cybergems.org/es/privacy](https://cybergems.org/es/privacy).
