# Changelog

Notable changes for each CyberNotes release. Releases before v1.18.0 are described in their [GitHub Releases](https://github.com/CyberGems/CyberNotes/releases).

## [1.19.0] - 2026-11-06

### Added

- Dedicated Floating Notes settings tab with configurable defaults for color (including Random), opacity, pinned state, zoom, and window size.
- 10th color option (Cyber Red) completing a balanced 5x2 color grid with uniform circular swatches.
- Global editable and disableable shortcut for floating notes (`Alt+Shift+F`), registered with conflict detection and synchronized with the system tray menu.
- Word-style inline image interaction: natural caret placement before and after images with native blinking animation, lateral click positioning, and smooth keyboard navigation.
- Mixed range selection across text and inline images via Shift+Arrows with semi-transparent selection overlays.
- Dedicated single-modifier editor shortcuts for Table (`Ctrl+T`), Insert Video (`Alt+V`), Character Map (`Alt+M`), and Emoji Picker (`Alt+E`).
- Lightweight hover marquee effect on tab titles to smoothly display long truncated titles with exact fade mask clearance.
- Embedded search bar integrated directly into the settings sidebar tabs column with automatic autofocus on open.

### Changed

- Eliminated double modifiers across all 29 editor toolbar actions (`Ctrl+D` for Strikethrough, `Alt+C` for Code Block).
- Standardized modal action buttons and enter badge glyphs to match suite standards.
- Harmonized glass-card sliders, numeric inputs, and custom select dropdowns across settings tabs.
- Refined image selection frames with clean borders, removing laggy animations and heavy glow.
- Restored floating notes on app startup without stealing focus from the main window.
- Modernized NSIS installer sidebar and wizard artwork.

### Fixed

- Caret height normalization for inline images and startup editor autofocus.
- Clean Esc deselect handling for inline images.

### En Español

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

## [1.18.0] - 2026-11-01

### Added

- Guided first-run setup before any note exists, with live theme previews, system language detection, refreshed factory notes, and safe cleanup of temporary sessions on exit.
- Marquee selection, drag-and-drop of multi-note selections into sidebar folders with clear drop targets and auto-scroll, and tab closing with the middle mouse button.
- Editable emoji and symbol trays: reorder entries by dragging, unified selection flow, recents preserved, and unsupported glyphs filtered out.
- Customizable toolbars and settings: show-all action, stable visibility checklists, searchable settings, dismissible context toolbars, and a balanced two-row toolbar.
- 13pt font size option, and floating notes that remember their chosen opacity and default to electric blue.
- Title-bar update notice with a persistent update preview in the console.

### Changed

- Consolidated suite themes with improved light and gray contrast, saved appearance applied during startup, and synced tray styling.
- Faster tab switching through cached tab content and reduced minimap rendering work.

### Fixed

- Minimap navigation, missing code line numbers, editor menu clipping, and image cuts copying before deletion.

### En Español

- Configuración inicial guiada antes de crear cualquier nota, con vistas previas de temas, detección del idioma del sistema, notas de fábrica renovadas y limpieza segura de sesiones temporales al salir.
- Selección con lazo, arrastre de varias notas a carpetas de la barra lateral con zonas claras y desplazamiento automático, y cierre de pestañas con el botón central.
- Bandejas de emojis y símbolos editables: reordenar arrastrando, flujo de selección unificado, recientes conservados y glifos no compatibles filtrados.
- Barras y ajustes personalizables: acción de mostrar todo, listas de visibilidad estables, ajustes con búsqueda, barras contextuales descartables y una barra equilibrada en dos filas.
- Tamaño de fuente de 13 puntos, y notas flotantes que recuerdan su opacidad elegida y abren en azul eléctrico por defecto.
- Aviso de actualización en la barra de título con vista previa persistente en la consola.
- Temas de la suite consolidados con mejor contraste, apariencia guardada aplicada durante el inicio, y cambio de pestañas más rápido gracias al contenido en caché.
- Corregidos: navegación del minimapa, números de línea faltantes, recorte de menús del editor y cortes de imagen que copian antes de borrar.
