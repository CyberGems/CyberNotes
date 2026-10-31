export interface FactoryNote {
  id: string;
  title: string;
  content: string;
  preview: string;
  folderId: string | null;
  pinned: number;
  floating?: boolean;
}

/** Templates for a new profile or an explicit restoration, never a migration of user notes. */
export function getFactoryNotes(language: 'es' | 'en'): FactoryNote[] {
  const es = language === 'es';
  return [
    {
      id: 'welcome-note', folderId: 'folder-getting-started', pinned: 1,
      title: es ? '👋 Bienvenida' : '👋 Welcome',
      preview: es ? 'Escribe, organiza y guarda tus notas en tu equipo.' : 'Write, organize and save notes on your computer.',
      content: es ? `<h1>👋 Bienvenido a CyberNotes</h1>
<p>Un espacio para escribir y organizar notas en tu equipo. Puedes editar o eliminar estas notas de ejemplo cuando quieras.</p>
<h2>Escribe a tu manera</h2>
<p>Combina texto con títulos, listas, enlaces, imágenes, tablas y bloques de código. La barra muestra 22 controles de fábrica; los otros ocho están en <strong>Más (···)</strong>. Elige cuáles mostrar en <strong>Configuración &gt; Apariencia &gt; Barra de herramientas</strong>.</p>
<h2>Organiza tus ideas</h2>
<ul><li>Crea carpetas con iconos y colores, y marca tus notas favoritas.</li><li>Trabaja con varias pestañas. Usa las flechas para desplazarlas y mantenlas pulsadas para seguir avanzando.</li><li>Abre una nota como flotante para tenerla a mano. Activa el minimapa en Configuración si necesitas navegar por una nota larga.</li></ul>
<h2>Guardado y seguridad</h2>
<p>Las notas se guardan localmente. El guardado automático está activado de fábrica; si lo desactivas, usa <strong>Guardar</strong> o <code>Ctrl+S</code>.</p>
<p>La contraseña o el PIN bloquean el acceso a la aplicación, pero <strong>no cifran los archivos de notas ni los respaldos</strong>. Si activas el bloqueo, guarda tu código de recuperación fuera de este equipo.</p>
<p>Sigue con <strong>Primeros pasos</strong> para configurar la apariencia, los respaldos y los selectores.</p>` : `<h1>👋 Welcome to CyberNotes</h1>
<p>A place to write and organize notes on your computer. You can edit or delete these example notes whenever you like.</p>
<h2>Write your way</h2>
<p>Combine text with headings, lists, links, images, tables and code blocks. The toolbar starts with 22 controls; the other eight are in <strong>More (···)</strong>. Choose which to show in <strong>Settings &gt; Appearance &gt; Toolbar</strong>.</p>
<h2>Organize your ideas</h2>
<ul><li>Create folders with icons and colours, and mark your favourite notes.</li><li>Work with several tabs. Use the arrows to scroll them and hold an arrow to keep moving.</li><li>Open a note as a floating window to keep it nearby. Enable the minimap in Settings to navigate a long note.</li></ul>
<h2>Saving and security</h2>
<p>Notes are saved locally. Autosave is enabled by default; if you turn it off, use <strong>Save</strong> or <code>Ctrl+S</code>.</p>
<p>A password or PIN locks access to the app, but <strong>does not encrypt note files or backups</strong>. If you enable the lock, store your recovery code away from this computer.</p>
<p>Continue with <strong>First steps</strong> to set up appearance, backups and the pickers.</p>`,
    },
    {
      id: 'quickstart-note', folderId: 'folder-getting-started', pinned: 0,
      title: es ? '🎯 Primeros pasos' : '🎯 First steps',
      preview: es ? 'Notas nuevas, apariencia, emojis, símbolos y respaldos.' : 'New notes, appearance, emojis, symbols and backups.',
      content: es ? `<h1>🎯 Primeros pasos</h1>
<h2>Prepara tu espacio</h2>
<ol><li><strong>Crea una nota:</strong> usa Nueva, el botón + al final de las pestañas o <code>Ctrl+N</code> en la ventana principal.</li><li><strong>Crea una carpeta:</strong> usa + en la barra lateral o <code>Ctrl+Shift+N</code>.</li><li><strong>Elige tu tema:</strong> en Configuración &gt; Apariencia encontrarás CyberNotes, Gris y Claro. La intensidad de color corresponde al tema CyberNotes.</li><li><strong>Ajusta la barra:</strong> marca los controles que quieras mostrar en Configuración &gt; Apariencia &gt; Barra de herramientas. Los desmarcados siguen en Más (···).</li></ol>
<h2>Emojis y símbolos</h2>
<p>Busca por nombre o carácter y aprovecha Recientes. Un clic selecciona; <strong>Insertar</strong> inserta y cierra. En modo individual también puedes insertar con doble clic.</p>
<p>Activa <strong>Varios</strong> para preparar un grupo: puedes repetir elementos, quitarlos con un clic y arrastrarlos para cambiar el orden. Mantén el arrastre junto al borde superior o inferior de la bandeja para desplazarla. Insertar envía el grupo completo y cierra el selector.</p>
<h2>Respalda tu trabajo</h2>
<p>En <strong>Configuración &gt; Respaldo y Datos</strong> puedes crear un respaldo, elegir su carpeta y configurar frecuencia y copias conservadas. Restaurar reemplaza los datos actuales por los del archivo elegido; antes se crea una copia de seguridad del estado actual.</p>
<h2>Atajos de la ventana principal</h2>
<ul><li><code>Ctrl+F</code>: buscar entre tus notas.</li><li><code>Ctrl+B</code>, <code>Ctrl+I</code>, <code>Ctrl+U</code>: negrita, cursiva y subrayado.</li><li><code>Alt+Shift+N</code>: mostrar u ocultar la aplicación. Puedes cambiar este atajo global en Configuración &gt; General.</li></ul>
<h2>Prueba un bloque de código</h2>
<pre><code>const note = {
  title: 'Mi primera nota',
  tags: ['ideas', 'trabajo']
};</code></pre>` : `<h1>🎯 First steps</h1>
<h2>Set up your space</h2>
<ol><li><strong>Create a note:</strong> use Add, the + button at the end of the tabs or <code>Ctrl+N</code> in the main window.</li><li><strong>Create a folder:</strong> use + in the sidebar or <code>Ctrl+Shift+N</code>.</li><li><strong>Choose your theme:</strong> Settings &gt; Appearance offers CyberNotes, Gray and Light. Colour intensity applies to the CyberNotes theme.</li><li><strong>Adjust the toolbar:</strong> check the controls you want to show in Settings &gt; Appearance &gt; Toolbar. Unchecked controls remain in More (···).</li></ol>
<h2>Emojis and symbols</h2>
<p>Search by name or character and reuse Recent items. One click selects; <strong>Insert</strong> inserts and closes. In individual mode you can also insert by double-clicking.</p>
<p>Enable <strong>Multiple</strong> to prepare a group: repeat items, click to remove them and drag to reorder. Hold a dragged item near the top or bottom edge of the tray to scroll. Insert sends the whole group and closes the picker.</p>
<h2>Back up your work</h2>
<p>In <strong>Settings &gt; Backup &amp; Data</strong> you can create a backup, choose its folder, frequency and number of copies to keep. Restoring replaces current data with the selected backup; a safety copy of the current state is created first.</p>
<h2>Main window shortcuts</h2>
<ul><li><code>Ctrl+F</code>: search your notes.</li><li><code>Ctrl+B</code>, <code>Ctrl+I</code>, <code>Ctrl+U</code>: bold, italic and underline.</li><li><code>Alt+Shift+N</code>: show or hide the app. Change this global shortcut in Settings &gt; General.</li></ul>
<h2>Try a code block</h2>
<pre><code>const note = {
  title: 'My first note',
  tags: ['ideas', 'work']
};</code></pre>`,
    },
    {
      id: 'cybergems-suite-note', folderId: 'folder-cybergems', pinned: 0,
      title: es ? '💎 Suite CyberGems' : '💎 CyberGems Suite',
      preview: es ? 'Descubre las otras aplicaciones y los enlaces oficiales de CyberGems.' : 'Discover other CyberGems apps and official links.',
      content: es ? `<h1>💎 Suite CyberGems</h1>
<p>CyberNotes forma parte de CyberGems, una suite de aplicaciones de escritorio para Windows, gratuitas y de código abierto.</p>
<h2>Explora la suite</h2>
<ul><li><strong>CyberClock:</strong> reloj, calendario y herramientas de tiempo.</li><li><strong>CyberPaste:</strong> historial y organización del portapapeles.</li><li><strong>CyberSnap:</strong> capturas de pantalla y anotaciones.</li><li><strong>CyberViewer:</strong> visualización y edición de imágenes y reproducción de video.</li><li><strong>CyberFeeds:</strong> lectura de fuentes RSS y Atom.</li></ul>
<p>Algunas funciones, como obtener noticias de fuentes RSS o reproducir videos de YouTube, necesitan conexión a internet. Consulta la información de cada aplicación para conocer sus funciones y requisitos.</p>
<h2>Enlaces oficiales</h2>
<ul><li><a href="https://cybergems.org" target="_blank" rel="noopener noreferrer">Sitio web: aplicaciones y descargas</a></li><li><a href="https://github.com/CyberGems" target="_blank" rel="noopener noreferrer">CyberGems en GitHub</a></li><li><a href="https://github.com/CyberGems/CyberNotes" target="_blank" rel="noopener noreferrer">Código y novedades de CyberNotes</a></li></ul>` : `<h1>💎 CyberGems Suite</h1>
<p>CyberNotes is part of CyberGems, a suite of free, open-source desktop applications for Windows.</p>
<h2>Explore the suite</h2>
<ul><li><strong>CyberClock:</strong> clock, calendar and time tools.</li><li><strong>CyberPaste:</strong> clipboard history and organization.</li><li><strong>CyberSnap:</strong> screenshots and annotations.</li><li><strong>CyberViewer:</strong> image viewing and editing, and video playback.</li><li><strong>CyberFeeds:</strong> RSS and Atom feed reading.</li></ul>
<p>Some features, such as fetching RSS news or playing YouTube videos, require an internet connection. Check each app's information for its features and requirements.</p>
<h2>Official links</h2>
<ul><li><a href="https://cybergems.org" target="_blank" rel="noopener noreferrer">Website: apps and downloads</a></li><li><a href="https://github.com/CyberGems" target="_blank" rel="noopener noreferrer">CyberGems on GitHub</a></li><li><a href="https://github.com/CyberGems/CyberNotes" target="_blank" rel="noopener noreferrer">CyberNotes code and updates</a></li></ul>`,
    },
    {
      id: 'floating-demo-note', folderId: null, pinned: 0, floating: true,
      title: es ? '⚡ Atajos rápidos' : '⚡ Quick shortcuts',
      preview: es ? 'Atajos de la ventana principal y de las notas flotantes.' : 'Shortcuts for the main window and floating notes.',
      content: es ? `<h2>⚡ Atajos rápidos</h2>
<p><strong>En la ventana principal:</strong></p>
<ul><li><code>Ctrl+N</code>: nueva nota.</li><li><code>Ctrl+Shift+N</code>: nueva carpeta.</li><li><code>Ctrl+F</code>: buscar notas.</li><li><code>Ctrl+S</code>: guardar la nota actual.</li></ul>
<p><strong>En esta nota flotante:</strong> <code>Ctrl+B</code>, <code>Ctrl+I</code> y <code>Ctrl+U</code> dan formato al texto. <code>Ctrl+rueda</code> ajusta el zoom. Los cambios se guardan automáticamente.</p>
<p><strong>Atajo global:</strong> <code>Alt+Shift+N</code> muestra u oculta la ventana principal, incluso desde otra aplicación. Puedes cambiarlo en Configuración.</p>
<p>Puedes editar o cerrar esta nota de ejemplo cuando quieras.</p>` : `<h2>⚡ Quick shortcuts</h2>
<p><strong>In the main window:</strong></p>
<ul><li><code>Ctrl+N</code>: new note.</li><li><code>Ctrl+Shift+N</code>: new folder.</li><li><code>Ctrl+F</code>: search notes.</li><li><code>Ctrl+S</code>: save the current note.</li></ul>
<p><strong>In this floating note:</strong> <code>Ctrl+B</code>, <code>Ctrl+I</code> and <code>Ctrl+U</code> format text. <code>Ctrl+wheel</code> adjusts zoom. Changes are saved automatically.</p>
<p><strong>Global shortcut:</strong> <code>Alt+Shift+N</code> shows or hides the main window, even from another app. Change it in Settings.</p>
<p>Edit or close this example note whenever you like.</p>`,
    },
  ];
}
