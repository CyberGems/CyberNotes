# Changelog

All notable changes to CyberNotes are documented here.

## [1.19.3] - 2026-11-19

### 🇺🇸 English

- Upgrade Electron to `42.11.18` and switch the tray menu to a fresh prewarmed window with two-step transparent reveal and a `4px` flyout gap, fixing the native white titlebar flash on Windows, repeated-open flicker, and cross-monitor position jumps.
- Simplify the titlebar More menu by opening sections as right-pointing side flyouts, removing the redundant App section, and lifting Lock to the main level.

### 🇪🇸 Español

- Actualiza Electron a `42.11.18` y cambia el menú de bandeja a una ventana precalentada con revelado transparente en dos pasos y espacio de `4px`, corrigiendo la barra de título blanca nativa en Windows, el parpadeo en aperturas repetidas y los saltos entre monitores.
- Simplifica el menú Más de la barra de título abriendo las secciones como flyouts laterales hacia la derecha, eliminando la sección App redundante y subiendo Bloquear al nivel principal.

## [1.19.2] - 2026-11-18

### 🇺🇸 English

- Convert the tray submenus (`Help` and `More from CyberGems`) into side-by-side flyout panels with dwell hover, click toggling, automatic monitor-edge placement, all three themes supported, and keyboard arrow navigation.
- Tighten the production Content Security Policy down to `connect-src 'self'`, re-enable web security and shared navigation locks across main, sticky, and tray windows, reload dead renderers, reveal the main window reliably if first paint misses, and report startup failures in a dialog.
- Strip internal `ProseMirror-separator` helper nodes from cloned minimap blocks.

### 🇪🇸 Español

- Convierte los submenús de la bandeja (`Ayuda` y `Más de CyberGems`) en paneles flyout laterales con retardo hover, alternancia por clic, colocación automática según el monitor, soporte completo de los tres temas y navegación con flechas del teclado.
- Endurece la política CSP de producción a `connect-src 'self'`, reactiva web security y bloqueo de navegación en las ventanas principal, flotantes y bandeja, recarga renderizadores caídos, muestra la ventana principal aunque falte el primer pintado e informa fallos de arranque en un diálogo.
- Limpia nodos internos `ProseMirror-separator` al clonar bloques en el minimapa.

## [1.19.1] - 2026-11-16

### 🇺🇸 English

- Keep the update banner quiet when an update check fails instead of reporting the error.
- Hide the Before you install guidance from the in-app update notes, because updates install automatically.
- Show the CyberNotes website and description in the Windows uninstall entry.
- Fix the forced-close retry when uninstalling the all-users installation.
- Update 23 npm dependencies and ship winget manifests with every release.

### 🇪🇸 Español

- Mantiene el banner de actualizaciones en silencio cuando una comprobación falla, en lugar de mostrar el error.
- Oculta la guía Antes de instalar de las notas de actualización dentro de la app, porque las actualizaciones se instalan automáticamente.
- Muestra el sitio web de CyberNotes y su descripción en la entrada de desinstalación de Windows.
- Corrige el reintento de cierre forzado al desinstalar la instalación para todos los usuarios.
- Actualiza 23 dependencias de npm y publica manifiestos winget con cada release.

## [1.19.0] - 2026-11-06

### 🇺🇸 English

- Dedicated Floating Notes settings tab with configurable defaults for color (including Random), opacity, pinned state, zoom, and window size.
- 10th color option (Cyber Red) completing a balanced 5x2 color grid with uniform circular swatches.
- Global editable and disableable shortcut for floating notes (`Alt+Shift+F`), registered with conflict detection and synchronized with the system tray menu.
- Word-style inline image interaction: natural caret placement before and after images with native blinking animation, lateral click positioning, and smooth keyboard navigation.
- Mixed range selection across text and inline images via Shift+Arrows with semi-transparent selection overlays.
- Dedicated single-modifier editor shortcuts for Table (`Ctrl+T`), Insert Video (`Alt+V`), Character Map (`Alt+M`), and Emoji Picker (`Alt+E`).
- Lightweight hover marquee effect on tab titles to smoothly display long truncated titles with exact fade mask clearance.
- Embedded search bar integrated directly into the settings sidebar tabs column with automatic autofocus on open.
- Eliminated double modifiers across all 29 editor toolbar actions (`Ctrl+D` for Strikethrough, `Alt+C` for Code Block).
- Standardized modal action buttons and enter badge glyphs to match suite standards.
- Harmonized glass-card sliders, numeric inputs, and custom select dropdowns across settings tabs.
- Refined image selection frames with clean borders, removing laggy animations and heavy glow.
- Restored floating notes on app startup without stealing focus from the main window.
- Modernized NSIS installer sidebar and wizard artwork.
- Fixed caret height normalization for inline images and startup editor autofocus.
- Fixed clean Esc deselect handling for inline images.

### 🇪🇸 Español

- Pestaña de configuración dedicada para Notas Flotantes con valores predeterminados para color (incluye Aleatorio), opacidad, fijado, zoom y tamaño de ventana.
- Décimo color (Rojo Ciber) que completa una cuadrícula equilibrada de 5x2 con muestras circulares uniformes.
- Atajo global editable y desactivable para notas flotantes (`Alt+Shift+F`), con detección de conflictos y sincronizado con el menú de la bandeja.
- Interacción con imágenes integradas estilo Word: posición natural del cursor antes y después de imágenes con parpadeo nativo, clic lateral y navegación fluida con teclado.
- Selección mixta de rango en texto e imágenes con Shift+Flechas mediante capas de selección semitransparentes.
- Atajos simples dedicados para Tabla (`Ctrl+T`), Insertar Video (`Alt+V`), Mapa de Caracteres (`Alt+M`) y Selector de Emojis (`Alt+E`).
- Efecto de marquesina ligero en títulos de pestañas al pasar el ratón para mostrar títulos largos con ajuste exacto de máscara.
- Barra de búsqueda integrada directamente en la columna de pestañas de configuración con enfoque automático al abrir.
- Eliminación de modificadores dobles en las 29 acciones de la barra del editor (`Ctrl+D` para tachado, `Alt+C` para bloque de código).
- Botones de acción y glifos Enter estandarizados según las normas de la suite.
- Controles deslizantes, entradas numéricas y menús desplegables armonizados en la configuración.
- Marcos de selección de imagen refinados con bordes limpios sin animaciones pesadas ni destellos.
- Restauración de notas flotantes al inicio sin quitar el foco a la ventana principal.
- Arte del instalador NSIS y asistente modernizados.
- Corregida la normalización de la altura del cursor para imágenes integradas y el enfoque automático del editor al iniciar.
- Corregida la desselección limpia con Esc para las imágenes integradas.

## [1.18.0] - 2026-11-01

### 🇺🇸 English

- Guided first-run setup before any note exists, with live theme previews, system language detection, refreshed factory notes, and safe cleanup of temporary sessions on exit.
- Marquee selection, drag-and-drop of multi-note selections into sidebar folders with clear drop targets and auto-scroll, and tab closing with the middle mouse button.
- Editable emoji and symbol trays: reorder entries by dragging, unified selection flow, recents preserved, and unsupported glyphs filtered out.
- Customizable toolbars and settings: show-all action, stable visibility checklists, searchable settings, dismissible context toolbars, and a balanced two-row toolbar.
- 13pt font size option, and floating notes that remember their chosen opacity and default to electric blue.
- Title-bar update notice with a persistent update preview in the console.
- Consolidated suite themes with improved light and gray contrast, saved appearance applied during startup, and synced tray styling.
- Faster tab switching through cached tab content and reduced minimap rendering work.
- Fixed minimap navigation, missing code line numbers, editor menu clipping, and image cuts copying before deletion.

### 🇪🇸 Español

- Configuración inicial guiada antes de crear cualquier nota, con vistas previas de temas, detección del idioma del sistema, notas de fábrica renovadas y limpieza segura de sesiones temporales al salir.
- Selección con lazo, arrastre de varias notas a carpetas de la barra lateral con zonas claras y desplazamiento automático, y cierre de pestañas con el botón central.
- Bandejas de emojis y símbolos editables: reordenar arrastrando, flujo de selección unificado, recientes conservados y glifos no compatibles filtrados.
- Barras y ajustes personalizables: acción de mostrar todo, listas de visibilidad estables, ajustes con búsqueda, barras contextuales descartables y una barra equilibrada en dos filas.
- Tamaño de fuente de 13 puntos, y notas flotantes que recuerdan su opacidad elegida y abren en azul eléctrico por defecto.
- Aviso de actualización en la barra de título con vista previa persistente en la consola.
- Temas de la suite consolidados con mejor contraste, apariencia guardada aplicada durante el inicio y estilo de la bandeja sincronizado.
- Cambio de pestañas más rápido gracias al contenido en caché y menor trabajo de renderizado del minimapa.
- Corregidos: navegación del minimapa, números de línea faltantes, recorte de menús del editor y cortes de imagen que copian antes de borrar.

## [1.17.0] - 2026-10-27

### 🇺🇸 English

- Self-contained backups: automatic backups and JSON exports carry the database and images together in one portable file, with a configurable folder, retention options, and in-app restore.
- Danger Zone: wipe all notes and data from Settings in one deliberate, guarded action.
- Faster storage engine: notes now persist through better-sqlite3 with WAL, with lighter per-keystroke editing and pasted images saved as files.
- Editor refinements: cleaner click-and-drag selection, a floating toolbar that appears after the drag ends, opaque dropdown menus, and the line-number gutter hidden by default.

### 🇪🇸 Español

- Copias autocontenidas: los respaldos automáticos y la exportación JSON llevan base de datos e imágenes juntas en un único archivo portátil, con carpeta configurable, opciones de retención y restauración desde la app.
- Zona de peligro: borra todas las notas y datos desde Ajustes con una acción deliberada y confirmada.
- Motor de almacenamiento más rápido: las notas se guardan ahora con better-sqlite3 y WAL, con una edición más ligera por pulsación e imágenes pegadas guardadas como archivos.
- Refinamientos del editor: selección más limpia, barra flotante que aparece al soltar el arrastre, menús desplegables opacos y columna de números oculta por defecto.

## [1.16.0] - 2026-10-04

### 🇺🇸 English

- Character and emoji pickers: search categorized Unicode symbols and Emoji 18.0, then insert one character or collect several together.
- Reliable long-note navigation: line numbers and continuation markers stay aligned across wrapped text and hard line breaks.
- A workspace that adapts: collapse the sidebar or line-number gutter, and use screen-aware menus that keep recent notes and actions in reach.
- Clearer everyday controls: retain startup update notices, refine quick settings and toolbar states, and improve shortcut hints and installer artwork.

### 🇪🇸 Español

- Selectores de caracteres y emojis: busca símbolos Unicode y emojis 18.0 por categoría; inserta uno o reúne varios a la vez.
- Navegación fiable en notas largas: los números de línea y los indicadores de continuación siguen el texto ajustado y los saltos manuales.
- Un espacio de trabajo adaptable: contrae la barra lateral o la columna de números y usa menús que mantienen a mano las notas recientes y acciones.
- Controles cotidianos más claros: conserva los avisos de actualización al iniciar y mejora los ajustes rápidos, los estados de botones, los atajos y el arte del instalador.

## [1.15.0] - 2026-10-03

### 🇺🇸 English

- Save feedback at a glance: timestamped saved, saving and unsaved states in the editor and floating notes, with compact indicators that fit narrow layouts.
- More room on screen: responsive title bar and editor footer, scale-aware More menu, denser recent notes, narrow-window layouts, and mouse-wheel navigation for hidden floating-toolbar buttons.
- Clearer keyboard cues: themed Caps Lock inactivity countdown and dismissible notice, one toggle for Caps/Num/Insert indicators, and Shift+F3 cycling through all five case styles.
- Desktop and editor polish: more reliable window restore across monitors and DPI changes, consistent shortcut tooltips, copy controls for code and quotes, and custom NSIS installer artwork.

### 🇪🇸 Español

- Confirmación de guardado: estados con hora para guardado automático y manual en el editor y las notas flotantes, con indicadores compactos para ventanas angostas.
- Más espacio en pantalla: barra superior y pie del editor adaptables, menú Más según la escala, recientes más densos, diseños compactos y rueda del mouse para recorrer botones ocultos.
- Señales de teclado más claras: cuenta regresiva y aviso cerrable para Bloq Mayús, un solo control para Caps/Num/Insert y Mayús+F3 con los cinco estilos de mayúsculas.
- Mejoras de escritorio y edición: restauración de ventanas más fiable entre monitores y escalas, tooltips de atajos coherentes, controles para copiar código y citas, y arte NSIS personalizado.

## [1.14.0] - 2026-09-28

### 🇺🇸 English

- Grid cards view: square cards with cover images or text peeks, collapsible favorite, floating and date groups, a views dropdown with Alt+V shortcut, and inline badges that never overlap text.
- Security access log: last 50 unlocks, failed attempts, auto-locks and credential changes in Settings, with one-click clear, an opt-out toggle, and Forgot PIN plus Enter hint on the lock screen.
- Updates ask first: notices always show the changelog in your language with Download, Skip and View release; nothing downloads or installs without your click, and the close-window dialog is now option cards.
- Flow polish: delete from the tab menu and the editor header, Esc clearing search, smoother tab switches without loader flicker or scroll jumps, a cleaner recents menu, and a Space key for Leave without saving.

### 🇪🇸 Español

- Vista de tarjetas: tarjetas cuadradas con portada o peek de texto, grupos colapsables de favoritas, flotantes y fechas, menú de vistas con atajo Alt+V e insignias que nunca tapan texto.
- Registro de accesos: últimos 50 desbloqueos, intentos, bloqueos y cambios de clave en Ajustes, con limpiar en un clic, interruptor opt-out y PIN olvidado más Enter en el login.
- Avisos con confirmación: los avisos siempre muestran el changelog en tu idioma con Descargar, Omitir y Ver release; nada se descarga ni instala sin tu clic, y el diálogo de cierre ahora son tarjetas.
- Pulido de flujo: borrado desde menú de pestaña y header, Esc que limpia la búsqueda, cambios de pestaña sin parpadeos ni saltos, recientes renovados y Espacio para Salir sin guardar.

## [1.13.0] - 2026-09-27

### 🇺🇸 English

- Video embeds with dedicated menu: multi-provider embeds with privacy facade, thumbnails and loader, plus right-click actions to edit the URL, copy or open the link, and delete the clip.
- Spell checker upgrades: footer switcher with on/off toggle and multi-select for bilingual writing, full language names, and a personal dictionary manager in Settings with search, add and remove.
- Smarter recovery and sidebar: the recovery dialog now compares saved version versus draft (dates, word counts, excerpts), and the Views and Folders sidebar sections collapse with persisted state.
- Alt+Delete and polish: delete the selected note from anywhere, a note-list menu that stays on screen, Esc closing the video menu, deterministic modal focus, and update notices in Spanish.

### 🇪🇸 Español

- Videos embebidos con menú dedicado: embebidos multiproveedor con fachada de privacidad, miniaturas y loader, más acciones de clic derecho para editar la URL, copiar o abrir el enlace y eliminar el clip.
- Mejoras del corrector: selector en el footer con interruptor y selección múltiple para escritura bilingüe, nombres completos de idioma y gestor de diccionario personal en Ajustes con búsqueda, alta y baja.
- Recuperación y sidebar más listos: el diálogo de recuperación compara versión guardada y borrador (fechas, palabras, extractos), y las secciones Vistas y Carpetas se pliegan con estado persistido.
- Alt+Supr y pulido: elimina la nota seleccionada desde cualquier foco, menú de la lista siempre visible, Esc cierra el menú de video, foco determinista en modales y avisos en español.

## [1.12.0] - 2026-09-24

### 🇺🇸 English

- Word-style typography: per-selection font family and size, paragraph alignment, clear formatting, and a customizable toolbar with a More overflow menu, also in floating notes.
- Version history: automatic local snapshots with preview and safe one-click restore from the editor.
- Expanded usage statistics: unlocks, average words per note, and new notes, with icons and friendlier tooltips.
- First-close choice: tray-or-quit dialog with remember option, keyboard badges, and bilingual refinements throughout.

### 🇪🇸 Español

- Tipografía estilo Word: familia y tamaño de fuente por selección, alineación de párrafos, quitar formato y una barra personalizable con menú Más, también en las notas flotantes.
- Historial de versiones: instantáneas locales automáticas con vista previa y restauración segura con un clic desde el editor.
- Estadísticas de uso ampliadas: desbloqueos, promedio de palabras por nota y notas nuevas, con iconos y tooltips más amables.
- Elección al primer cierre: diálogo de bandeja o salir con opción de recordar, insignias de teclado y refinamientos bilingües en todo.

## [1.11.0] - 2026-09-21

### 🇺🇸 English

- PIN unlock and offline recovery: 4 to 8 digit PIN or full password, one-time recovery code with hint, and rate-limited reset straight from the lock screen.
- Word-style text sizing: font-size dropdown and floating bubble in the editor, plus one-tap size cycling in floating notes.
- Suite and stats: More from CyberGems in About and the tray (optional), with opt-in local usage statistics including streaks.
- Respectful updater: manual checks only check; downloads and restarts happen solely on your tap.
- Settings polish: always-visible buttons, app-style tooltips, clearer tray labels, and one-click backups folder access.

### 🇪🇸 Español

- Desbloqueo con PIN y recuperación sin conexión: PIN de 4 a 8 dígitos o contraseña completa, código de recuperación de un solo uso con pista y restablecimiento con límite de intentos desde la pantalla de bloqueo.
- Tamaños de texto estilo Word: menú desplegable de tamaño de fuente y burbuja flotante en el editor, además de cambio de tamaño con un toque en las notas flotantes.
- Suite y estadísticas: Más de CyberGems en Acerca de y la bandeja (opcional), con estadísticas de uso locales opcionales que incluyen rachas.
- Actualizador respetuoso: las comprobaciones manuales solo comprueban; las descargas y los reinicios ocurren únicamente cuando tú los pides.
- Pulido de ajustes: botones siempre visibles, tooltips al estilo de la app, etiquetas de bandeja más claras y acceso a la carpeta de respaldos con un clic.

## [1.10.0] - 2026-09-18

### 🇺🇸 English

- New welcome space: time-based greeting, notes and favorites stats, and keyboard shortcuts at a glance whenever no note is open, in English and Spanish.
- Faster tab switching: open tabs switch instantly from the in-memory cache, with no loading flash when coming back to a visited tab.
- Smarter global hotkey control: one-click restore of the default (Alt+Shift+N), live modifier preview while capturing, and validation that rejects unusable combinations.
- Settings polish: greeting name field keeps its compact size in any layout, with clearer hotkey feedback.

### 🇪🇸 Español

- Nuevo espacio de bienvenida: saludo según la hora, estadísticas de notas y favoritas, y atajos de teclado de un vistazo cuando no hay ninguna nota abierta, en inglés y español.
- Cambio de pestañas más rápido: las pestañas abiertas cambian al instante desde la caché en memoria, sin destello de carga al volver a una pestaña visitada.
- Control del atajo global más inteligente: restauración del valor predeterminado (Alt+Shift+N) con un clic, vista previa en vivo de los modificadores al capturar y validación que rechaza combinaciones inservibles.
- Pulido de ajustes: el campo del nombre para el saludo mantiene su tamaño compacto en cualquier diseño, con feedback más claro del atajo.

## [1.9.0] - 2026-09-16

### 🇺🇸 English

- Floating sticky notes: independent always-on-top stickies with tray controls, colors, opacity and size persistence, plus smoother dragging, resize and restore so windows stay where you left them.
- Tabs and the note list: drag tabs to reorder them, new notes open just to the right of the current tab, and date grouping with collapsible headers, trash, favorites and clearer sidebar filters.
- Smarter updates: new update card with a changelog peek plus view-release, skip-version and download actions (CyberFeeds-style), and unattended download and restart still available when auto-updates are enabled.
- Interface polish: faster confirmation dialogs with shared Cancel/Save (Esc/Enter) actions, and softer shine on the note list (hover-only) and the editor Save button.

### 🇪🇸 Español

- Notas adhesivas flotantes: stickies independientes siempre visibles con controles en la bandeja, colores, opacidad y tamaño persistente, además de arrastre, cambio de tamaño y restauración más fluidos para que las ventanas queden donde las dejaste.
- Pestañas y lista de notas: arrastra las pestañas para reordenarlas, las notas nuevas se abren justo a la derecha de la pestaña actual, y agrupación por fechas con encabezados colapsables, papelera, favoritas y filtros de la barra lateral más claros.
- Actualizaciones más inteligentes: nueva tarjeta de actualización con vista previa del changelog y acciones de ver release, omitir versión y descargar (al estilo CyberFeeds), con descarga y reinicio desatendidos aún disponibles cuando las auto-actualizaciones están activadas.
- Pulido de la interfaz: diálogos de confirmación más rápidos con acciones compartidas Cancelar/Guardar (Esc/Enter) y brillo más suave en la lista de notas (solo al pasar el ratón) y el botón Guardar del editor.

## [1.8.0] - 2026-08-23

### 🇺🇸 English

- Unattended updater: background checks on launch and every 6 hours, auto-download with a global progress bar, and auto-restart that defers when you have unsaved changes and can be postponed via Later.
- Official icon refresh: new 1024px icon across the entire app.
- Crystal-clear tray icon: the Windows tray renders from the PNG resized at runtime to the exact DPI size, so taskbar and tray finally match.
- Bilingual updater banner with a countdown (Restarting in 8s) and Restart now / Later actions in English and Spanish.
- Updater robustness: explicit download when an update is available, periodic checks, installing state, cancel option, and auto-install on quit as a fallback.

### 🇪🇸 Español

- Actualizador desatendido: comprobaciones en segundo plano al iniciar y cada 6 horas, descarga automática con barra de progreso global y reinicio automático que se pospone si tienes cambios sin guardar y puede aplazarse con Más tarde.
- Renovación del icono oficial: nuevo icono de 1024 px en toda la app.
- Icono de bandeja nítido: la bandeja de Windows se genera desde el PNG redimensionado en tiempo de ejecución al tamaño exacto según DPI, así la barra de tareas y la bandeja por fin coinciden.
- Banner de actualización bilingüe con cuenta regresiva (Reiniciando en 8 s) y acciones Reiniciar ahora / Más tarde en inglés y español.
- Actualizador más robusto: descarga explícita al haber una actualización disponible, comprobaciones periódicas, estado de instalación, opción de cancelar y instalación automática al salir como respaldo.

## [1.7.0] - 2026-08-23

### 🇺🇸 English

- Customizable global shortcut with an interactive recording modal (default `Alt+Shift+N`) to summon or hide CyberNotes from anywhere.
- Modern floating tray menu with direct navigation, shortcut hints and full bilingual support, and dynamic window controls whose tooltips adapt to the tray background settings.
- High-resolution official brand icon across the application, tray and desktop shortcuts.
- Virtualized note list cards scale cleanly from 80% up to 150% without overlapping text or layout clipping.
- Toolbar and editor refinements: redesigned separators, an animated save button with hover transitions, improved line number gutter tooltips, and rich icons with state detection across all context menus (folder options, minimap navigation and editor actions).
- Starter welcome note: a rich interactive welcome guide is seeded automatically on fresh installations.
- Smart Caps Lock management: title bar status indicator with a real-time countdown LED and audio feedback.
- Clear formatting in the editor enables only when active styling is selected.
- Factory Reset option in settings restores defaults while safely preserving your notes and folders.

### 🇪🇸 Español

- Atajo global personalizable con modal interactivo de grabación (por defecto `Alt+Shift+N`) para mostrar u ocultar CyberNotes desde cualquier lugar.
- Menú de bandeja flotante moderno con navegación directa, pistas de atajos y soporte bilingüe completo, y controles de ventana dinámicos cuyos tooltips se adaptan a la configuración de bandeja en segundo plano.
- Icono oficial de la marca en alta resolución en la aplicación, la bandeja y los accesos directos del escritorio.
- Las tarjetas virtualizadas de la lista de notas escalan limpiamente del 80% al 150% sin texto superpuesto ni recortes de diseño.
- Refinamientos de barra y editor: separadores rediseñados, botón de guardar animado con transiciones al pasar el ratón, tooltips mejorados en la columna de números de línea e iconos con detección de estado en todos los menús contextuales (opciones de carpetas, navegación del minimapa y acciones del editor).
- Nota de bienvenida inicial: una guía interactiva de bienvenida se crea automáticamente en instalaciones nuevas.
- Gestión inteligente de Bloq Mayús: indicador de estado en la barra de título con LED de cuenta regresiva en tiempo real y feedback sonoro.
- Quitar formato en el editor se activa solo cuando hay estilos aplicados en la selección.
- Opción de Restablecimiento de fábrica en ajustes para volver a los valores por defecto conservando de forma segura tus notas y carpetas.

## [1.6.0] - 2026-07-28

### 🇺🇸 English

- New About dialog with version diagnostics, GitHub links and update check, download and install, backed by auto-updater support via GitHub Releases.
- New Favorites filter in the sidebar (between All and Unfiled) to pin or star notes as favorites with bilingual wording.
- Settings redesigned as a right-side drawer with vertical navigation.
- Lock screen polish: draggable title bar, window controls, Caps Lock warning, version label and themed wallpaper.
- No more note flash when restoring from the tray after auto-lock, and the Caps Lock badge and timer stay in sync with the global Caps Lock worker.
- Smoother note switching without the welcome flash, TipTap undo isolation between notes, retractable minimap, better context menus and clipboard image copy.
- Deferred database flush, lighter note lists and virtualized note cards.
- Fixed a startup crash when loading electron-updater and the Start with Windows toggle desync on Windows.

### 🇪🇸 Español

- Nuevo diálogo Acerca de con diagnóstico de versión, enlaces de GitHub y comprobación, descarga e instalación de actualizaciones, con soporte de auto-actualización vía GitHub Releases.
- Nuevo filtro Favoritas en la barra lateral (entre Todas y Sin carpeta) para fijar o marcar notas como favoritas con textos bilingües.
- Ajustes rediseñados como cajón lateral derecho con navegación vertical.
- Pulido de la pantalla de bloqueo: barra de título arrastrable, controles de ventana, aviso de Bloq Mayús, etiqueta de versión y fondo temático.
- Sin destello de nota al restaurar desde la bandeja tras el autobloqueo, y la insignia y el temporizador de Bloq Mayús se sincronizan con el worker global de Bloq Mayús.
- Cambio de notas más fluido sin destello de bienvenida, deshacer de TipTap aislado entre notas, minimapa retráctil, mejores menús contextuales y copia de imágenes al portapapeles.
- Escritura a la base de datos diferida, listas de notas más ligeras y tarjetas de notas virtualizadas.
- Corregido un crash al iniciar al cargar electron-updater y la desincronización del interruptor Iniciar con Windows en Windows.

## [1.5.1] - 2026-06-06

### 🇺🇸 English

- Custom folder icons and a reusable tooltip component shared across the interface.
- Improvements to the editor, note list, sidebar and title bar, plus the main app and settings screens.
- Style refreshes and updated wording with localization updates.
- TypeScript and Electron process fixes for greater stability.

### 🇪🇸 Español

- Iconos de carpetas personalizados y un componente Tooltip reutilizable en toda la interfaz.
- Mejoras en el editor de notas, la lista de notas, la barra lateral y la barra de título, además de la app principal y el modal de ajustes.
- Mejoras de estilos y actualizaciones de textos e internacionalización.
- Correcciones de TypeScript y del proceso Electron para mayor estabilidad.

## [1.5.0] - 2026-06-03

### 🇺🇸 English

- Custom themed confirmation dialogs replace native popups for destructive actions like removing the lock password or importing a backup, with bilingual messages.
- Confirmation prompt before leaving a note with unsaved draft changes, with a do-not-ask-again option.
- Right-click context menu for text inputs across the editor, sidebar, note list and lock screen.
- The note list density (normal or compact) is remembered between sessions, and the app version shows in settings and the tray menu.

### 🇪🇸 Español

- Diálogos de confirmación con tema propio sustituyen a los avisos nativos en acciones destructivas como eliminar la contraseña de acceso o importar un backup, con mensajes bilingües.
- Confirmación antes de salir de una nota con cambios de borrador sin guardar, con opción de no volver a preguntar.
- Menú contextual de clic derecho para los campos de texto en el editor, la barra lateral, la lista de notas y la pantalla de bloqueo.
- La densidad de la lista de notas (normal o compacta) se recuerda entre sesiones, y la versión de la app se muestra en ajustes y en el menú de la bandeja.

## [1.1.0] - 2026-05-19

### 🇺🇸 English

- First published release of CyberNotes: premium tab support, session restoration, overscroll bounce, floating notes, and custom portalized dialogs.

### 🇪🇸 Español

- Primera versión publicada de CyberNotes: soporte de pestañas premium, restauración de sesiones, rebote de overscroll, notas flotantes y diálogos personalizados portalizados.
