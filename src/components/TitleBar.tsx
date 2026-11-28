import { Fragment, useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Square, X, BookOpen, MoreHorizontal, Settings, Save, Map, BarChart3, List, Pin, Hash, Lock, FileText, Info, Minimize2, Power, HelpCircle, Tag, Globe, Heart, Download, FileDown, Printer, Copy, Star, AppWindow, Sparkles, Trash2, Braces, PanelLeft, History, Keyboard, ChevronDown } from 'lucide-react';
import Tooltip, { TooltipShortcut } from './Tooltip';
import WelcomeGreeting from './WelcomeGreeting';
import TitleBarUpdateButton from './TitleBarUpdateButton';

interface Props {
  language?: 'es' | 'en';
  uiScale?: number;
  displayName?: string | null;
  onLock?: () => void;
  onOpenSettings?: () => void;
  onOpenAbout?: () => void;
  onCheckForUpdates?: () => void;
  updateVersion?: string | null;
  onShowUpdate?: () => void;
  onOpenTrayPin?: () => void;
  onExportMarkdown?: () => void;
  onExportHtml?: () => void;
  onExportPdf?: () => void;
  onExportText?: () => void;
  onPrint?: () => void;
  autosaveEnabled?: boolean;
  onAutosaveChange?: (v: boolean) => void;
  autoUnlockCapsLock?: boolean;
  onAutoUnlockCapsLockChange?: (v: boolean) => void;
  autoUnlockCapsLockTimeout?: number;
  showMinimap?: boolean;
  onShowMinimapChange?: (v: boolean) => void;
  showKeyboardIndicators?: boolean;
  onShowKeyboardIndicatorsChange?: (v: boolean) => void;
  showLineCounter?: boolean;
  onShowLineCounterChange?: (v: boolean) => void;
  showLineGutter?: boolean;
  onShowLineGutterChange?: (v: boolean) => void;
  showWordCounter?: boolean;
  onShowWordCounterChange?: (v: boolean) => void;
  showFloatingToolbar?: boolean;
  onShowFloatingToolbarChange?: (v: boolean) => void;
  rememberLastNote?: boolean;
  onRememberLastNoteChange?: (v: boolean) => void;
  currentNoteId?: string | null;
  currentNotePinned?: boolean;
  isCurrentNoteSticky?: boolean;
  onDuplicateNote?: (id: string) => void;
  onToggleNoteFavorite?: (id: string) => void;
  onToggleNoteSticky?: (id: string) => void;
  onSaveNote?: () => void;
  onDeleteNote?: () => void;
  onToggleRaw?: () => void;
  onCycleLayout?: () => void;
  layoutMode?: 1 | 2 | 3;
  onShowHistory?: () => void;
  minimizeToTray?: boolean;
  closeToTray?: boolean;
  /** Caps Lock físico activo + countdown (desde NoteEditor) */
  capsStatus?: { active: boolean; timeLeft: number };
}

function formatCapsTime(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

type MoreSectionId = 'note' | 'export' | 'options' | 'help';

type MoreMenuRow = {
  id: string;
  icon: ReactNode;
  label: string;
  shortcut?: string;
  keyshortcuts?: string;
  disabled?: boolean;
  tooltip?: string;
  toggle?: { value: boolean; onChange: () => void };
  run?: () => void;
};

type MoreMenuEntry = MoreMenuRow | { id: string; divider: true };

export default function TitleBar({
  language = 'es',
  uiScale = 1,
  displayName,
  onLock,
  onOpenSettings,
  onOpenAbout,
  onCheckForUpdates,
  updateVersion,
  onShowUpdate,
  onOpenTrayPin,
  onExportMarkdown,
  onExportHtml,
  onExportPdf,
  onExportText,
  onPrint,
  autosaveEnabled = true,
  onAutosaveChange,
  autoUnlockCapsLock = false,
  onAutoUnlockCapsLockChange,
  autoUnlockCapsLockTimeout = 120,
  showMinimap = false,
  onShowMinimapChange,
  showKeyboardIndicators = true,
  onShowKeyboardIndicatorsChange,
  showLineCounter = true,
  onShowLineCounterChange,
  showLineGutter = true,
  onShowLineGutterChange,
  showWordCounter = true,
  onShowWordCounterChange,
  showFloatingToolbar = true,
  onShowFloatingToolbarChange,
  rememberLastNote = true,
  onRememberLastNoteChange,
  currentNoteId = null,
  currentNotePinned = false,
  isCurrentNoteSticky = false,
  onDuplicateNote,
  onToggleNoteFavorite,
  onToggleNoteSticky,
  onSaveNote,
  onDeleteNote,
  onToggleRaw,
  onCycleLayout,
  layoutMode = 3,
  onShowHistory,
  minimizeToTray = false,
  closeToTray = false,
  capsStatus,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [exitConfirm, setExitConfirm] = useState(false);
  const [openFlyout, setOpenFlyout] = useState<MoreSectionId | null>(null);
  const [flyoutPos, setFlyoutPos] = useState({ top: 0, left: 0 });
  const flyoutRef = useRef<HTMLDivElement>(null);
  const focusFlyoutRef = useRef(false);
  const flyoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flyoutControls = useRef<{
    open: (section: MoreSectionId, trigger: HTMLElement) => void;
    close: (refocus?: boolean) => boolean;
  }>({ open: () => {}, close: () => false });

  useEffect(() => () => {
    if (flyoutTimer.current) clearTimeout(flyoutTimer.current);
  }, []);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (burgerRef.current?.contains(e.target as Node)) return;
      if (flyoutRef.current?.contains(e.target as Node)) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', close);
    } else {
      setExitConfirm(false);
      setOpenFlyout(null);
    }
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const focusMenuItem = (direction: 1 | -1 | 0) => {
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], button.menu-item') || [])
        .filter(item => !item.hasAttribute('disabled') && item.offsetParent !== null);
      if (!items.length) return;
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);
      const nextIndex = direction === 0
        ? 0
        : (currentIndex + direction + items.length) % items.length;
      items[nextIndex]?.focus();
    };

    const focusFirstItem = () => focusMenuItem(0);
    // Foco sincrónico tras el commit: el portal ya está en el DOM y el primer
    // item queda seleccionado de inmediato (sin depender del frame).
    focusFirstItem();
    const handleMenuKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (flyoutControls.current.close(true)) return;
        setMenuOpen(false);
        burgerRef.current?.focus();
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        const active = document.activeElement as HTMLElement | null;
        const header = active?.classList.contains('more-menu-section-toggle') ? active : null;
        if (event.key === 'ArrowRight' && header) {
          event.preventDefault();
          focusFlyoutRef.current = true;
          flyoutControls.current.open(header.dataset.section as MoreSectionId, header);
          return;
        }
        if (event.key === 'ArrowLeft' && flyoutRef.current?.contains(active)) {
          event.preventDefault();
          flyoutControls.current.close(true);
          return;
        }
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        focusMenuItem(1);
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        focusMenuItem(-1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        focusMenuItem(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"], button.menu-item') || [])
          .filter(item => !item.hasAttribute('disabled') && item.offsetParent !== null);
        items[items.length - 1]?.focus();
      }
    };

    document.addEventListener('keydown', handleMenuKeyDown);
    return () => {
      document.removeEventListener('keydown', handleMenuKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) setOpenFlyout(null);
  }, [menuOpen]);

  useEffect(() => {
    if (!openFlyout || !focusFlyoutRef.current) return;
    focusFlyoutRef.current = false;
    flyoutRef.current?.querySelector<HTMLElement>('[role="menuitem"], button.menu-item')?.focus();
  }, [openFlyout]);

  useEffect(() => {
    const handleMenuShortcut = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== 'm') return;
      event.preventDefault();
      setMenuOpen(previous => {
        if (!previous && burgerRef.current) {
          const rect = burgerRef.current.getBoundingClientRect();
          setMenuPos({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
        }
        return !previous;
      });
    };
    window.addEventListener('keydown', handleMenuShortcut);
    return () => window.removeEventListener('keydown', handleMenuShortcut);
  }, []);

  useEffect(() => {
    const handleSettingsShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key !== ',') return;
      event.preventDefault();
      onOpenSettings?.();
    };
    window.addEventListener('keydown', handleSettingsShortcut);
    return () => window.removeEventListener('keydown', handleSettingsShortcut);
  }, [onOpenSettings]);

  useEffect(() => {
    if (!onOpenAbout) return;
    const handleAboutShortcut = (event: KeyboardEvent) => {
      if (event.key !== 'F1') return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      event.preventDefault();
      onOpenAbout();
    };
    window.addEventListener('keydown', handleAboutShortcut);
    return () => window.removeEventListener('keydown', handleAboutShortcut);
  }, [onOpenAbout]);

  useEffect(() => {
    window.cyberNotesAPI.isMaximized?.().then(setIsMaximized).catch(() => {});
    const unsub = window.cyberNotesAPI.onMaximizedState?.((max) => setIsMaximized(max));
    return () => { unsub?.(); };
  }, []);

  const t = (es: string, en: string) => language === 'es' ? es : en;
  const capsOn = !!capsStatus?.active;
  const activateMenuItem = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  const menuSwitch = (active: boolean) => (
    <span aria-hidden="true" className={`custom-switch is-compact ${active ? 'active' : ''}`} />
  );
  const menuScale = Math.max(0.8, Math.min(1.5, uiScale));
  const menuScaleVars = {
    '--more-menu-item-font-size': `${12 * menuScale}px`,
    '--more-menu-item-padding-y': `${8 * menuScale}px`,
    '--more-menu-item-padding-x': `${14 * menuScale}px`,
    '--more-menu-item-gap': `${10 * menuScale}px`,
    '--more-menu-shortcut-font-size': `${9 * menuScale}px`,
    '--more-menu-section-font-size': `${10 * menuScale}px`,
    '--more-menu-section-padding-y': `${7 * menuScale}px`,
    '--more-menu-section-padding-x': `${14 * menuScale}px`,
    '--more-menu-icon-size': `${14 * menuScale}px`,
    '--more-menu-switch-width': `${32 * menuScale}px`,
    '--more-menu-switch-height': `${18 * menuScale}px`,
    '--more-menu-switch-radius': `${9 * menuScale}px`,
    '--more-menu-switch-inset': `${2 * menuScale}px`,
    '--more-menu-switch-thumb': `${14 * menuScale}px`,
    '--more-menu-switch-active-left': `${16 * menuScale}px`,
    '--more-menu-switch-check-size': `${10 * menuScale}px`,
  } as CSSProperties;
  const clearFlyoutTimer = () => {
    if (flyoutTimer.current) {
      clearTimeout(flyoutTimer.current);
      flyoutTimer.current = null;
    }
  };

  const openFlyoutFor = (section: MoreSectionId, trigger: HTMLElement) => {
    clearFlyoutTimer();
    const rect = trigger.getBoundingClientRect();
    const width = 240 * menuScale;
    const gap = 6;
    const margin = 8;
    // Windows-style: open towards the right when it fits, otherwise flip left.
    const spaceRight = window.innerWidth - rect.right - gap - margin;
    const spaceLeft = rect.left - gap - margin;
    let left: number;
    if (spaceRight >= width) {
      left = rect.right + gap;
    } else if (spaceLeft >= width) {
      left = rect.left - gap - width;
    } else {
      left = spaceRight >= spaceLeft ? Math.max(margin, window.innerWidth - width - margin) : margin;
    }
    const top = Math.max(8, Math.min(rect.top - 6, window.innerHeight - 140));
    setFlyoutPos({ top, left });
    setOpenFlyout(section);
  };

  const closeFlyout = (refocus = false) => {
    clearFlyoutTimer();
    if (!openFlyout) return false;
    if (refocus) {
      menuRef.current?.querySelector<HTMLElement>(`[data-section="${openFlyout}"]`)?.focus();
    }
    setOpenFlyout(null);
    return true;
  };

  const scheduleFlyoutOpen = (section: MoreSectionId, trigger: HTMLElement) => {
    clearFlyoutTimer();
    if (openFlyout === section) return;
    flyoutTimer.current = setTimeout(() => openFlyoutFor(section, trigger), 120);
  };

  const scheduleFlyoutClose = () => {
    clearFlyoutTimer();
    flyoutTimer.current = setTimeout(() => setOpenFlyout(null), 220);
  };

  flyoutControls.current = { open: openFlyoutFor, close: closeFlyout };

  const moreSectionHeader = (section: { id: MoreSectionId; label: string }) => (
    <button
      type="button"
      role="menuitem"
      data-section={section.id}
      className={`more-menu-section-toggle${openFlyout === section.id ? ' is-open' : ''}`}
      aria-haspopup="menu"
      aria-expanded={openFlyout === section.id}
      onClick={event => openFlyoutFor(section.id, event.currentTarget)}
      onMouseEnter={event => scheduleFlyoutOpen(section.id, event.currentTarget)}
      onMouseLeave={scheduleFlyoutClose}
    >
      <span>{section.label}</span>
      <ChevronDown size={13} aria-hidden="true" style={{ opacity: 0.65, transform: 'rotate(-90deg)', transition: 'transform 0.15s ease' }} />
    </button>
  );

  const moreMenuRow = (entry: MoreMenuEntry) => {
    if ('divider' in entry) {
      return <div key={entry.id} style={{ height: 1, background: 'var(--border)', margin: '3px 8px' }} />;
    }
    const row = entry;
    const body = (
      <>
        {row.icon}
        <span style={{ flex: 1 }}>{row.label}</span>
        {row.shortcut && (
          <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>{row.shortcut}</span>
        )}
      </>
    );
    const element = row.toggle ? (
      <div
        key={row.id}
        className="menu-item"
        role="menuitem"
        tabIndex={0}
        onClick={row.toggle.onChange}
        onKeyDown={e => activateMenuItem(e, row.toggle!.onChange)}
      >
        {body}
        {menuSwitch(row.toggle.value)}
      </div>
    ) : (
      <button
        key={row.id}
        className="menu-item"
        disabled={row.disabled}
        onClick={row.run}
        style={{ padding: '4px 10px', fontSize: 11, opacity: row.disabled ? 0.4 : 1 }}
        aria-keyshortcuts={row.keyshortcuts}
      >
        {body}
      </button>
    );
    return row.tooltip
      ? <Tooltip key={row.id} placement="top" label={row.tooltip}>{element}</Tooltip>
      : element;
  };

  const noteRows: MoreMenuEntry[] = [
    {
      id: 'save',
      icon: <Save size={13} style={{ opacity: 0.7 }} />,
      label: t('Guardar nota', 'Save note'),
      shortcut: 'Ctrl+S',
      keyshortcuts: 'Control+S',
      disabled: !currentNoteId,
      run: () => { setMenuOpen(false); onSaveNote?.(); },
    },
    {
      id: 'duplicate',
      icon: <Copy size={13} style={{ opacity: 0.7 }} />,
      label: t('Duplicar nota', 'Duplicate note'),
      shortcut: 'Ctrl+D',
      keyshortcuts: 'Control+D',
      disabled: !currentNoteId,
      run: () => { if (!currentNoteId) return; setMenuOpen(false); onDuplicateNote?.(currentNoteId); },
    },
    {
      id: 'favorite',
      icon: <Star size={13} style={{ opacity: 0.7 }} />,
      label: currentNotePinned ? t('Quitar de favoritos', 'Remove from favorites') : t('Marcar favorita', 'Add to favorites'),
      shortcut: 'Alt+S',
      keyshortcuts: 'Alt+S',
      disabled: !currentNoteId,
      run: () => { if (!currentNoteId) return; setMenuOpen(false); onToggleNoteFavorite?.(currentNoteId); },
    },
    {
      id: 'sticky',
      icon: <AppWindow size={13} style={{ opacity: 0.7 }} />,
      label: isCurrentNoteSticky ? t('Mostrar flotante', 'Show floating note') : t('Abrir flotante', 'Open floating note'),
      shortcut: 'Alt+A',
      keyshortcuts: 'Alt+A',
      disabled: !currentNoteId,
      run: () => { if (!currentNoteId) return; setMenuOpen(false); onToggleNoteSticky?.(currentNoteId); },
    },
    {
      id: 'raw',
      icon: <Braces size={13} style={{ opacity: 0.7 }} />,
      label: t('Vista HTML', 'HTML view'),
      shortcut: 'Alt+H',
      keyshortcuts: 'Alt+H',
      disabled: !currentNoteId,
      run: () => { setMenuOpen(false); onToggleRaw?.(); },
    },
    {
      id: 'layout',
      icon: <PanelLeft size={13} style={{ opacity: 0.7 }} />,
      label: t('Cambiar vista', 'Switch view'),
      shortcut: 'Alt+L',
      keyshortcuts: 'Alt+L',
      disabled: !onCycleLayout,
      run: () => { setMenuOpen(false); onCycleLayout?.(); },
    },
    {
      id: 'history',
      icon: <History size={13} style={{ opacity: 0.7 }} />,
      label: t('Historial de versiones', 'Version history'),
      shortcut: 'Alt+R',
      keyshortcuts: 'Alt+R',
      disabled: !currentNoteId,
      run: () => { setMenuOpen(false); onShowHistory?.(); },
    },
    {
      id: 'delete',
      icon: <Trash2 size={13} style={{ color: 'var(--danger)', opacity: 0.9 }} />,
      label: t('Eliminar nota', 'Delete note'),
      shortcut: language === 'es' ? 'Alt+Supr' : 'Alt+Del',
      keyshortcuts: 'Alt+Delete',
      disabled: !currentNoteId,
      run: () => { setMenuOpen(false); onDeleteNote?.(); },
    },
  ];

  const exportRows: MoreMenuEntry[] = [
    { id: 'pdf', icon: <FileDown size={13} style={{ opacity: 0.7 }} />, label: t('Exportar PDF', 'Export PDF'), shortcut: 'Alt+P', keyshortcuts: 'Alt+P', run: () => { setMenuOpen(false); onExportPdf?.(); } },
    { id: 'markdown', icon: <FileText size={13} style={{ opacity: 0.7 }} />, label: t('Markdown (.md)', 'Markdown (.md)'), shortcut: 'Alt+K', keyshortcuts: 'Alt+K', run: () => { setMenuOpen(false); onExportMarkdown?.(); } },
    { id: 'text', icon: <FileText size={13} style={{ opacity: 0.7 }} />, label: t('Texto plano (.txt)', 'Plain text (.txt)'), shortcut: 'Alt+X', keyshortcuts: 'Alt+X', run: () => { setMenuOpen(false); onExportText?.(); } },
    { id: 'html', icon: <Globe size={13} style={{ opacity: 0.7 }} />, label: t('HTML (.html)', 'HTML (.html)'), shortcut: 'Alt+W', keyshortcuts: 'Alt+W', run: () => { setMenuOpen(false); onExportHtml?.(); } },
    { id: 'print', icon: <Printer size={13} style={{ opacity: 0.7 }} />, label: t('Imprimir', 'Print'), shortcut: 'Ctrl+P', keyshortcuts: 'Control+P', run: () => { setMenuOpen(false); onPrint?.(); } },
  ];

  const optionRows: MoreMenuEntry[] = [
    {
      id: 'autosave',
      icon: <Save size={14} style={{ opacity: 0.7 }} />,
      label: t('Autoguardado', 'Autosave'),
      tooltip: t('Guarda los cambios automáticamente mientras escribes.', 'Saves changes automatically as you type.'),
      toggle: { value: autosaveEnabled, onChange: () => onAutosaveChange?.(!autosaveEnabled) },
    },
    {
      id: 'auto-caps',
      icon: <span style={{ fontSize: 13, lineHeight: 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, opacity: 0.7 }}>⇪</span>,
      label: t('Auto-apagar Bloq Mayús', 'Auto-unlock Caps Lock'),
      tooltip: t('Desactiva Bloq Mayús automáticamente tras un periodo de inactividad (Alt+C)', 'Turns Caps Lock off automatically after a period of inactivity (Alt+C)'),
      toggle: { value: autoUnlockCapsLock, onChange: () => onAutoUnlockCapsLockChange?.(!autoUnlockCapsLock) },
    },
    {
      id: 'minimap',
      icon: <Map size={14} style={{ opacity: 0.7 }} />,
      label: t('Minimapa', 'Minimap'),
      tooltip: t('Muestra una vista general del documento junto al editor.', 'Shows an overview of the document beside the editor.'),
      toggle: { value: showMinimap, onChange: () => onShowMinimapChange?.(!showMinimap) },
    },
    {
      id: 'line-counter',
      icon: <BarChart3 size={14} style={{ opacity: 0.7 }} />,
      label: t('Contador líneas', 'Line counter'),
      tooltip: t('Muestra el total de líneas en la barra de estado.', 'Shows the line total in the status bar.'),
      toggle: { value: showLineCounter, onChange: () => onShowLineCounterChange?.(!showLineCounter) },
    },
    {
      id: 'line-gutter',
      icon: <List size={14} style={{ opacity: 0.7 }} />,
      label: t('Líneas numeradas', 'Line gutter'),
      tooltip: t('Muestra los números junto a cada línea.', 'Shows line numbers beside each line.'),
      toggle: { value: showLineGutter, onChange: () => onShowLineGutterChange?.(!showLineGutter) },
    },
    {
      id: 'keyboard-indicators',
      icon: <Keyboard size={14} style={{ opacity: 0.7 }} />,
      label: t('Indicadores de teclado', 'Keyboard indicators'),
      tooltip: t('Muestra los estados de Bloq Mayús, Num y Insert.', 'Shows Caps Lock, Num Lock, and Insert states.'),
      toggle: { value: showKeyboardIndicators, onChange: () => onShowKeyboardIndicatorsChange?.(!showKeyboardIndicators) },
    },
    {
      id: 'word-counter',
      icon: <Hash size={14} style={{ opacity: 0.7 }} />,
      label: t('Contador palabras', 'Word counter'),
      tooltip: t('Muestra el recuento de palabras en la barra de estado.', 'Shows the word count in the status bar.'),
      toggle: { value: showWordCounter, onChange: () => onShowWordCounterChange?.(!showWordCounter) },
    },
    {
      id: 'floating-toolbar',
      icon: <Sparkles size={14} style={{ opacity: 0.7 }} />,
      label: t('Barra flotante', 'Floating toolbar'),
      tooltip: t('Muestra una barra de formato al seleccionar texto.', 'Shows a formatting toolbar when you select text.'),
      toggle: { value: showFloatingToolbar, onChange: () => onShowFloatingToolbarChange?.(!showFloatingToolbar) },
    },
    {
      id: 'remember-session',
      icon: <Pin size={14} style={{ opacity: 0.7 }} />,
      label: t('Recordar sesión', 'Remember session'),
      tooltip: t('Reabre la última nota al iniciar la aplicación.', 'Reopens your last note when the app starts.'),
      toggle: { value: rememberLastNote, onChange: () => onRememberLastNoteChange?.(!rememberLastNote) },
    },
  ];

  const helpRows: MoreMenuEntry[] = [
    { id: 'github-star', icon: <Star size={13} style={{ opacity: 0.7 }} />, label: t('Dar una estrella en GitHub', 'Star on GitHub'), run: () => { setMenuOpen(false); void window.cyberNotesAPI.starRepository().catch(console.error); } },
    { id: 'github-star-divider', divider: true },
    { id: 'docs', icon: <BookOpen size={13} style={{ opacity: 0.7 }} />, label: t('Documentación online', 'Online documentation'), run: () => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://github.com/CyberGems/CyberNotes/wiki'); } },
    { id: 'faq', icon: <HelpCircle size={13} style={{ opacity: 0.7 }} />, label: t('Preguntas frecuentes', 'Frequently Asked Questions'), run: () => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://github.com/CyberGems/CyberNotes/wiki/FAQ'); } },
    { id: 'changelog', icon: <Tag size={13} style={{ opacity: 0.7 }} />, label: t('Historial de cambios', 'Changelog'), run: () => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://github.com/CyberGems/CyberNotes/releases'); } },
    { id: 'website', icon: <Globe size={13} style={{ opacity: 0.7 }} />, label: t('Sitio web', 'Website'), run: () => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://cybergems.org'); } },
    { id: 'help-divider', divider: true },
    { id: 'about', icon: <Info size={13} style={{ opacity: 0.7 }} />, label: t('Acerca de', 'About'), run: () => { setMenuOpen(false); onOpenAbout?.(); } },
    { id: 'updates', icon: <Download size={13} style={{ opacity: 0.7 }} />, label: t('Buscar actualizaciones', 'Check for updates'), run: () => { setMenuOpen(false); onCheckForUpdates?.(); } },
    { id: 'tray-pin', icon: <Pin size={13} style={{ opacity: 0.7 }} />, label: t('Mantener visible en la bandeja', 'Keep visible in system tray'), run: () => { setMenuOpen(false); onOpenTrayPin?.(); } },
  ];

  const sections: { id: MoreSectionId; label: string; rows: MoreMenuEntry[] }[] = [
    { id: 'note', label: t('Nota actual', 'Current note'), rows: noteRows },
    { id: 'export', label: t('Exportar', 'Export'), rows: exportRows },
    { id: 'options', label: t('Ajustes rápidos', 'Quick settings'), rows: optionRows },
    { id: 'help', label: t('Ayuda', 'Help'), rows: helpRows },
  ];

  const activeFlyout = openFlyout ? sections.find(section => section.id === openFlyout) ?? null : null;

  return (
    <div
      className="glass-effect titlebar-glass"
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, input, textarea, select, [data-no-drag], .btn-icon, .menu-item, .more-menu-section-toggle')) {
          return;
        }
        window.cyberNotesAPI.windowMaximizeToggle();
      }}
      style={{
        height: 'var(--titlebar-height)',
        background: 'var(--bg-sidebar)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 12px 0 16px',
        flexShrink: 0,
        userSelect: 'none',
        WebkitAppRegion: 'drag',
      } as any}
    >
      {/* Logo + título (clickable -> About) */}
      <Tooltip placement="bottom" label={language === 'es' ? 'Acerca de CyberNotes (F1)' : 'About CyberNotes (F1)'}>
        <button
          onClick={onOpenAbout}
          data-no-drag="true"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
            background: 'transparent',
            border: 'none',
            padding: '3px 8px 3px 4px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            WebkitAppRegion: 'no-drag',
            transition: 'background 0.15s ease, opacity 0.15s ease',
          } as any}
          className="titlebar-branding-btn"
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255, 255, 255, 0.05)';
            const titleSpan = e.currentTarget.querySelector('.branding-text') as HTMLElement | null;
            if (titleSpan) titleSpan.style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            const titleSpan = e.currentTarget.querySelector('.branding-text') as HTMLElement | null;
            if (titleSpan) titleSpan.style.color = 'var(--text-secondary)';
          }}
        >
          <div style={{
            width: 22,
            height: 22,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <img src="icon.png" style={{ width: 22, height: 22, borderRadius: 4 }} alt="Logo" />
          </div>
          <span className="branding-text" style={{
            fontSize: 'calc(13px * var(--ui-scale))',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            letterSpacing: 0.3,
            transition: 'color 0.15s ease',
          }}>
            CyberNotes
          </span>
        </button>
      </Tooltip>

      {/* Indicador Caps Lock — siempre visible, dinámico */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          minWidth: 0,
          padding: '0 12px',
          height: '100%',
          WebkitAppRegion: 'drag',
        } as any}
      >
        {!capsOn && (
          <WelcomeGreeting
            language={language}
            name={displayName}
            style={{
              fontSize: 'calc(11px * var(--ui-scale))',
              fontWeight: 500,
              maxWidth: 'min(460px, 46vw)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          />
        )}
        {(() => {
          const autoOn = !!autoUnlockCapsLock;
          const timeLeft = capsStatus?.timeLeft ?? 0;
          // ON = azul accent; OFF = muted (estilo neutro actual)
          const chipStyle: CSSProperties = capsOn
            ? {
                border: '1px solid var(--accent)',
                background: 'var(--accent-dim)',
                color: 'var(--accent-light)',
              }
            : {
                border: '1px solid var(--border)',
                background: 'rgba(255,255,255,0.04)',
                color: 'var(--text-secondary)',
              };
          const tooltip = !capsOn
            ? t('Bloq Mayús apagado (Alt+C)', 'Caps Lock is off (Alt+C)')
            : autoOn
              ? t('El Bloq Mayús se apagará solo si dejas de escribir (Alt+C)', 'Caps Lock will turn off if you stop typing (Alt+C)')
              : t('Bloq Mayús encendido: auto-apagar desactivado (Alt+C)', 'Caps Lock is on: auto-disable off (Alt+C)');

          return capsOn && autoOn ? (
            <Tooltip placement="bottom" label={tooltip}>
              <div
                data-no-drag
                style={{
                  WebkitAppRegion: 'no-drag',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  maxWidth: '100%',
                  padding: '3px 10px',
                  borderRadius: 999,
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.2,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  cursor: 'default',
                  transition: 'background 0.2s, border-color 0.2s, color 0.2s',
                  ...chipStyle,
                } as any}
              >
                <span style={{ fontSize: 13, lineHeight: 1, opacity: capsOn ? 1 : 0.7, fontWeight: 700 }} aria-hidden>⇪</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span>{t('Bloq Mayús', 'Caps Lock')}</span>
                  <span
                    style={{
                      display: 'inline-block',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: capsOn ? 'color-mix(in srgb, #22c55e var(--status-color-share, 100%), var(--accent-light))' : 'rgba(255,255,255,0.25)',
                      boxShadow: capsOn ? '0 0 6px color-mix(in srgb, #22c55e var(--status-color-share, 100%), var(--accent-light))' : 'none',
                      flexShrink: 0,
                    }}
                  />
                  {capsOn && autoOn && timeLeft > 0 && (
                    <span style={{ opacity: 0.95, fontWeight: 500 }}>
                      {' · '}
                      {t('se apaga en', 'turns off in')}{' '}
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                        {formatCapsTime(timeLeft)}
                      </span>
                    </span>
                  )}
                  {capsOn && autoOn && timeLeft === 0 && (
                    <span style={{ opacity: 0.95, fontWeight: 500 }}>
                      {' · '}{t('apagando…', 'turning off…')}
                    </span>
                  )}
                </span>
                {capsOn && autoOn && autoUnlockCapsLockTimeout > 0 && timeLeft > 0 && (
                  <span
                    aria-hidden
                    style={{
                      width: 36,
                      height: 3,
                      borderRadius: 2,
                      background: 'rgba(255,255,255,0.12)',
                      overflow: 'hidden',
                      flexShrink: 0,
                    }}
                  >
                    <span
                      style={{
                        display: 'block',
                        height: '100%',
                        width: `${Math.max(4, Math.min(100, (timeLeft / autoUnlockCapsLockTimeout) * 100))}%`,
                        background: 'var(--accent)',
                        borderRadius: 2,
                        transition: 'width 1s linear',
                      }}
                    />
                  </span>
                )}
              </div>
            </Tooltip>
          ) : null;
        })()}
      </div>

      {/* Controles de ventana */}
      <div
        data-no-drag
        style={{ display: 'flex', alignItems: 'center', gap: 2, WebkitAppRegion: 'no-drag', flexShrink: 0 } as any}
      >
        <TitleBarUpdateButton language={language} version={updateVersion} onClick={onShowUpdate} />
        {/* Switch View Button */}
        {onCycleLayout && (
          <Tooltip
            placement="bottom"
            label={language === 'es' ? `Cambiar vista: modo ${layoutMode} (Alt+L)` : `Switch view: mode ${layoutMode} (Alt+L)`}
          >
            <button
              type="button"
              className="btn-icon titlebar-btn"
              onClick={onCycleLayout}
              aria-label={language === 'es' ? `Cambiar vista: modo ${layoutMode} (Alt+L)` : `Switch view: mode ${layoutMode} (Alt+L)`}
              style={{ width: 28, height: 28 }}
            >
              <PanelLeft size={14} />
            </button>
          </Tooltip>
        )}
        {/* Settings Button */}
        <Tooltip placement="bottom" label={t('Configuración general (Ctrl+,)', 'General settings (Ctrl+,)')}>
          <button
            className="btn-icon titlebar-btn"
            onClick={onOpenSettings}
            style={{ width: 28, height: 28 }}
          >
            <Settings size={14} />
          </button>
        </Tooltip>

        {/* More Menu */}
        <div style={{ position: 'relative' }}>
          <Tooltip placement="bottom" label={t('Más opciones (Alt+M)', 'More options (Alt+M)')}>
          <button
            ref={burgerRef}
            className={`btn-icon titlebar-btn${menuOpen ? ' is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              if (!menuOpen && burgerRef.current) {
                const r = burgerRef.current.getBoundingClientRect();
                setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
              }
              setMenuOpen(!menuOpen);
            }}
            style={{ width: 28, height: 28 }}
          >
            <MoreHorizontal size={14} />
          </button>
          </Tooltip>

          {menuOpen && createPortal(
            <div ref={menuRef} role="menu" aria-label={t('Más opciones', 'More options')} className="glass-effect more-menu" style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              width: `${240 * menuScale}px`,
              maxWidth: 'calc(100vw - 16px)',
              background: 'var(--bg-modal)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
              zIndex: 99999,
              padding: `${6 * menuScale}px 0`,
              display: 'flex',
              flexDirection: 'column',
              maxHeight: `calc(100vh - ${menuPos.top + 8}px)`,
              boxSizing: 'border-box',
              overflowY: 'auto',
              overscrollBehavior: 'contain',
              ...menuScaleVars,
            }}>
              {/* Donar primero (convención de la suite) + separador */}
              <button
                className="menu-item"
                onClick={() => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://github.com/CyberGems/CyberNotes#%EF%B8%8F-donate'); }}
                style={{ padding: '4px 10px', fontSize: 11 }}
              >
                <Heart size={13} style={{ color: 'color-mix(in srgb, #F43F5E var(--status-color-share, 100%), var(--accent-light))', opacity: 1 }} fill="currentColor" stroke="none" />
                <span>{t('Donar', 'Donate')}</span>
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
              {sections.map((section, index) => (
                <Fragment key={section.id}>
                  {index > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />}
                  {moreSectionHeader(section)}
                </Fragment>
              ))}

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />

              {minimizeToTray && (
                <button
                  className="menu-item"
                  onClick={() => { setMenuOpen(false); window.cyberNotesAPI.windowMinimize(); }}
                >
                  <Minimize2 size={14} style={{ opacity: 0.7 }} />
                  <span>{t('Ocultar en la bandeja', 'Hide to tray')}</span>
                </button>
              )}
              <button
                className="menu-item"
                onClick={() => { setMenuOpen(false); onLock?.(); }}
              >
                <Lock size={14} style={{ opacity: 0.8 }} />
                <span>{t('Bloquear', 'Lock')}</span>
              </button>

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />

              {/* Exit */}
              {exitConfirm ? (
                <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>
                    {t('¿Cerrar CyberNotes completamente?', 'Close CyberNotes completely?')}
                  </span>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      className="menu-item"
                      onClick={() => setExitConfirm(false)}
                      style={{ padding: '4px 10px', fontSize: 11, width: 'auto' }}
                    >
                      {t('Cancelar', 'Cancel')}
                    </button>
                    <button
                      className="menu-item"
                      onClick={() => { setMenuOpen(false); setExitConfirm(false); window.cyberNotesAPI.windowForceClose(); }}
                      style={{ padding: '4px 10px', fontSize: 11, width: 'auto', color: 'var(--danger)', fontWeight: 600 }}
                    >
                      {t('Cerrar', 'Close')}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="menu-item"
                  onClick={() => setExitConfirm(true)}
                >
                  <Power size={14} style={{ color: 'var(--danger)' }} />
                  <span>{t('Salir de CyberNotes', 'Exit CyberNotes')}</span>
                </button>
              )}
            </div>,
            document.body
          )}

          {menuOpen && activeFlyout && createPortal(
            <div
              ref={flyoutRef}
              role="menu"
              aria-label={activeFlyout.label}
              className="glass-effect more-menu more-menu-flyout"
              style={{
                position: 'fixed',
                top: flyoutPos.top,
                left: flyoutPos.left,
                width: `${240 * menuScale}px`,
                maxWidth: 'calc(100vw - 16px)',
                background: 'var(--bg-modal)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
                zIndex: 100000,
                padding: `${6 * menuScale}px 0`,
                display: 'flex',
                flexDirection: 'column',
                maxHeight: `calc(100vh - ${flyoutPos.top + 8}px)`,
                boxSizing: 'border-box',
                overflowY: 'auto',
                overscrollBehavior: 'contain',
                ...menuScaleVars,
              }}
              onMouseEnter={clearFlyoutTimer}
              onMouseLeave={scheduleFlyoutClose}
            >
              {activeFlyout.rows.map(moreMenuRow)}
            </div>,
            document.body
          )}
        </div>

        {/* Elegant Separator */}
        <div style={{
          width: 1,
          height: 18,
          background: 'var(--border)',
          margin: '0 6px',
        }} />

        <Tooltip placement="bottom" label={
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span>{minimizeToTray ? t('Minimizar a la bandeja', 'Minimize to tray') : t('Minimizar', 'Minimize')}</span>
            {!isMaximized && <TooltipShortcut>Win+↓</TooltipShortcut>}
          </span>
        }>
        <button
          className="btn-icon titlebar-btn"
          onClick={() => window.cyberNotesAPI.windowMinimize()}
          style={{ width: 28, height: 28 }}
        >
          <Minus size={13} />
        </button>
        </Tooltip>
        <Tooltip placement="bottom" label={
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span>{isMaximized ? t('Restaurar', 'Restore') : t('Maximizar', 'Maximize')}</span>
            <TooltipShortcut>{isMaximized ? 'Win+↓' : 'Win+↑'}</TooltipShortcut>
          </span>
        }>
        <button
          className="btn-icon titlebar-btn"
          onClick={() => window.cyberNotesAPI.windowMaximizeToggle()}
          style={{ width: 28, height: 28 }}
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="4 14 10 14 10 20"/>
              <polyline points="20 10 14 10 14 4"/>
              <line x1="14" y1="10" x2="21" y2="3"/>
              <line x1="10" y1="14" x2="3" y2="21"/>
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 3 21 3 21 9"/>
              <polyline points="9 21 3 21 3 15"/>
              <line x1="21" y1="3" x2="14" y2="10"/>
              <line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          )}
        </button>
        </Tooltip>
        <Tooltip placement="bottom" label={
          <span style={{ display: 'inline-flex', alignItems: 'center' }}>
            <span>{closeToTray ? t('Cerrar a la bandeja', 'Close to tray') : t('Cerrar', 'Close')}</span>
            <TooltipShortcut>Alt+F4</TooltipShortcut>
          </span>
        }>
        <button
          className="btn-icon titlebar-btn close-btn"
          onClick={() => window.cyberNotesAPI.windowClose()}
          style={{ width: 28, height: 28 }}
        >
          <X size={14} />
        </button>
        </Tooltip>
      </div>
    </div>
  );
}
