import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Square, X, BookOpen, MoreHorizontal, Settings, Save, Map, BarChart3, List, Pin, Hash, Lock, FileText, Info, Minimize2, Power, HelpCircle, Tag, Globe, Heart, Download, FileDown, Printer, Copy, Star, AppWindow, Sparkles, Trash2, Braces, PanelLeft, History, Keyboard, ChevronDown } from 'lucide-react';
import Tooltip, { TooltipShortcut } from './Tooltip';
import WelcomeGreeting from './WelcomeGreeting';

interface Props {
  language?: 'es' | 'en';
  uiScale?: number;
  displayName?: string | null;
  onLock?: () => void;
  onOpenSettings?: () => void;
  onOpenAbout?: () => void;
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

export default function TitleBar({
  language = 'es',
  uiScale = 1,
  displayName,
  onLock,
  onOpenSettings,
  onOpenAbout,
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
  autoUnlockCapsLockTimeout = 10,
  showMinimap = false,
  onShowMinimapChange,
  showKeyboardIndicators = false,
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
  const [openMoreSection, setOpenMoreSection] = useState<'note' | 'export' | 'options' | 'help' | 'app' | null>('note');

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (burgerRef.current?.contains(e.target as Node)) return;
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      document.addEventListener('mousedown', close);
    } else {
      setExitConfirm(false);
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
        setMenuOpen(false);
        burgerRef.current?.focus();
        return;
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
    if (menuRef.current) menuRef.current.scrollTop = 0;
  }, [openMoreSection]);

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
  const moreSectionHeader = (section: 'note' | 'export' | 'options' | 'help' | 'app', label: string) => (
    <button
      type="button"
      role="menuitem"
      className={`more-menu-section-toggle${openMoreSection === section ? ' is-open' : ''}`}
      aria-expanded={openMoreSection === section}
      onClick={() => setOpenMoreSection(current => current === section ? null : section)}
    >
      <span>{label}</span>
      <ChevronDown size={13} aria-hidden="true" style={{ opacity: 0.65, transform: openMoreSection === section ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.15s ease' }} />
    </button>
  );
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
            ? t('Bloq Mayús apagado', 'Caps Lock is off')
            : autoOn
              ? t('El Bloq Mayús se apagará solo si dejas de escribir', 'Caps Lock will turn off if you stop typing')
              : t('Bloq Mayús encendido (auto-desactivar está apagado)', 'Caps Lock is on (auto-disable is off)');

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
                      background: capsOn ? '#22c55e' : 'rgba(255,255,255,0.25)',
                      boxShadow: capsOn ? '0 0 6px #22c55e' : 'none',
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
                <Heart size={13} style={{ color: '#F43F5E', opacity: 1 }} fill="#F43F5E" stroke="none" />
                <span>{t('Donar', 'Donate')}</span>
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
              {moreSectionHeader('note', t('Nota actual', 'Current note'))}
              {openMoreSection === 'note' && (
                <div role="group" aria-label={t('Nota actual', 'Current note')}>
                  <button
                    className="menu-item"
                    disabled={!currentNoteId}
                    onClick={() => { setMenuOpen(false); onSaveNote?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11, opacity: currentNoteId ? 1 : 0.4 }}
                    aria-keyshortcuts="Control+S"
                  >
                    <Save size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Guardar nota', 'Save note')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+S</span>
                  </button>
                  <button
                    className="menu-item"
                    disabled={!currentNoteId}
                    onClick={() => { if (currentNoteId) { setMenuOpen(false); onDuplicateNote?.(currentNoteId); } }}
                    style={{ padding: '4px 10px', fontSize: 11, opacity: currentNoteId ? 1 : 0.4 }}
                    aria-keyshortcuts="Control+D"
                  >
                    <Copy size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Duplicar nota', 'Duplicate note')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+D</span>
                  </button>
                  <button
                    className="menu-item"
                    disabled={!currentNoteId}
                    onClick={() => { if (currentNoteId) { setMenuOpen(false); onToggleNoteFavorite?.(currentNoteId); } }}
                    style={{ padding: '4px 10px', fontSize: 11, opacity: currentNoteId ? 1 : 0.4 }}
                    aria-keyshortcuts="Alt+S"
                  >
                    <Star size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{currentNotePinned ? t('Quitar de favoritos', 'Remove from favorites') : t('Marcar favorita', 'Add to favorites')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Alt+S</span>
                  </button>
                  <button
                    className="menu-item"
                    disabled={!currentNoteId}
                    onClick={() => { if (currentNoteId) { setMenuOpen(false); onToggleNoteSticky?.(currentNoteId); } }}
                    style={{ padding: '4px 10px', fontSize: 11, opacity: currentNoteId ? 1 : 0.4 }}
                    aria-keyshortcuts="Alt+A"
                  >
                    <AppWindow size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{isCurrentNoteSticky ? t('Mostrar flotante', 'Show floating note') : t('Abrir flotante', 'Open floating note')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Alt+A</span>
                  </button>
                  <button
                    className="menu-item"
                    disabled={!currentNoteId}
                    onClick={() => { setMenuOpen(false); onToggleRaw?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11, opacity: currentNoteId ? 1 : 0.4 }}
                    aria-keyshortcuts="Alt+H"
                  >
                    <Braces size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Vista HTML', 'HTML view')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Alt+H</span>
                  </button>
                  <button
                    className="menu-item"
                    disabled={!currentNoteId}
                    onClick={() => { setMenuOpen(false); onCycleLayout?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11, opacity: currentNoteId ? 1 : 0.4 }}
                    aria-keyshortcuts="Alt+L"
                  >
                    <PanelLeft size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Cambiar vista', 'Switch view')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Alt+L</span>
                  </button>
                  <button
                    className="menu-item"
                    disabled={!currentNoteId}
                    onClick={() => { setMenuOpen(false); onShowHistory?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11, opacity: currentNoteId ? 1 : 0.4 }}
                    aria-keyshortcuts="Alt+R"
                  >
                    <History size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Historial de versiones', 'Version history')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Alt+R</span>
                  </button>
                  <button
                    className="menu-item"
                    disabled={!currentNoteId}
                    onClick={() => { setMenuOpen(false); onDeleteNote?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11, opacity: currentNoteId ? 1 : 0.4 }}
                    aria-keyshortcuts="Alt+Delete"
                  >
                    <Trash2 size={13} style={{ color: '#f87171', opacity: 0.9 }} />
                    <span style={{ flex: 1 }}>{t('Eliminar nota', 'Delete note')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>{language === 'es' ? 'Alt+Supr' : 'Alt+Del'}</span>
                  </button>
                </div>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />

              {moreSectionHeader('export', t('Exportar', 'Export'))}
              {openMoreSection === 'export' && (
                <div role="group" aria-label={t('Exportar', 'Export')}>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); onExportPdf?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+Alt+P"
                  >
                    <FileDown size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Exportar PDF', 'Export PDF')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+Alt+P</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); onExportMarkdown?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+Alt+M"
                  >
                    <FileText size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Markdown (.md)', 'Markdown (.md)')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+Alt+M</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); onExportText?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+Alt+T"
                  >
                    <FileText size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Texto plano (.txt)', 'Plain text (.txt)')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+Alt+T</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); onExportHtml?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+Alt+H"
                  >
                    <Globe size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('HTML (.html)', 'HTML (.html)')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+Alt+H</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); onPrint?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+P"
                  >
                    <Printer size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Imprimir', 'Print')}</span>
                    <span className="more-menu-shortcut" style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+P</span>
                  </button>
                </div>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />

              {moreSectionHeader('options', t('Ajustes rápidos', 'Quick settings'))}
              {openMoreSection === 'options' && (
                <div role="group" aria-label={t('Ajustes rápidos', 'Quick settings')}>
              <Tooltip placement="top" label={t('Guarda los cambios automáticamente mientras escribes.', 'Saves changes automatically as you type.')}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onAutosaveChange?.(!autosaveEnabled)}
                onKeyDown={e => activateMenuItem(e, () => onAutosaveChange?.(!autosaveEnabled))}
              >
                <Save size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Autoguardado', 'Autosave')}</span>
                {menuSwitch(autosaveEnabled)}
              </div>
              </Tooltip>
              <Tooltip placement="top" label={t('Desactiva Bloq Mayús automáticamente tras un periodo de inactividad.', 'Turns Caps Lock off automatically after a period of inactivity.')}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onAutoUnlockCapsLockChange?.(!autoUnlockCapsLock)}
                onKeyDown={e => activateMenuItem(e, () => onAutoUnlockCapsLockChange?.(!autoUnlockCapsLock))}
              >
                <span style={{ fontSize: 13, lineHeight: 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, opacity: 0.7 }}>⇪</span>
                <span style={{ flex: 1 }}>{t('Auto-unlock Caps', 'Auto-unlock Caps')}</span>
                {menuSwitch(autoUnlockCapsLock)}
              </div>
              </Tooltip>
              <Tooltip placement="top" label={t('Muestra una vista general del documento junto al editor.', 'Shows an overview of the document beside the editor.')}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowMinimapChange?.(!showMinimap)}
                onKeyDown={e => activateMenuItem(e, () => onShowMinimapChange?.(!showMinimap))}
              >
                <Map size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Minimapa', 'Minimap')}</span>
                {menuSwitch(showMinimap)}
              </div>
              </Tooltip>
              <Tooltip placement="top" label={t('Muestra el total de líneas en la barra de estado.', 'Shows the line total in the status bar.')}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowLineCounterChange?.(!showLineCounter)}
                onKeyDown={e => activateMenuItem(e, () => onShowLineCounterChange?.(!showLineCounter))}
              >
                <BarChart3 size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Contador líneas', 'Line counter')}</span>
                {menuSwitch(showLineCounter)}
              </div>
              </Tooltip>
              <Tooltip placement="top" label={t('Muestra los números junto a cada línea.', 'Shows line numbers beside each line.')}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowLineGutterChange?.(!showLineGutter)}
                onKeyDown={e => activateMenuItem(e, () => onShowLineGutterChange?.(!showLineGutter))}
              >
                <List size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Líneas numeradas', 'Line gutter')}</span>
                {menuSwitch(showLineGutter)}
              </div>
              </Tooltip>
              <Tooltip placement="top" label={t('Muestra los estados de Bloq Mayús, Num y Insert.', 'Shows Caps Lock, Num Lock, and Insert states.')}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowKeyboardIndicatorsChange?.(!showKeyboardIndicators)}
                onKeyDown={e => activateMenuItem(e, () => onShowKeyboardIndicatorsChange?.(!showKeyboardIndicators))}
              >
                <Keyboard size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Indicadores de teclado', 'Keyboard indicators')}</span>
                {menuSwitch(showKeyboardIndicators)}
              </div>
              </Tooltip>
              <Tooltip placement="top" label={t('Muestra el recuento de palabras en la barra de estado.', 'Shows the word count in the status bar.')}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowWordCounterChange?.(!showWordCounter)}
                onKeyDown={e => activateMenuItem(e, () => onShowWordCounterChange?.(!showWordCounter))}
              >
                <Hash size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Contador palabras', 'Word counter')}</span>
                {menuSwitch(showWordCounter)}
              </div>
              </Tooltip>
              <Tooltip placement="top" label={t('Muestra una barra de formato al seleccionar texto.', 'Shows a formatting toolbar when you select text.')}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowFloatingToolbarChange?.(!showFloatingToolbar)}
                onKeyDown={e => activateMenuItem(e, () => onShowFloatingToolbarChange?.(!showFloatingToolbar))}
              >
                <Sparkles size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Barra flotante', 'Floating toolbar')}</span>
                {menuSwitch(showFloatingToolbar)}
              </div>
              </Tooltip>
              <Tooltip placement="top" label={t('Reabre la última nota al iniciar la aplicación.', 'Reopens your last note when the app starts.')}>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onRememberLastNoteChange?.(!rememberLastNote)}
                onKeyDown={e => activateMenuItem(e, () => onRememberLastNoteChange?.(!rememberLastNote))}
              >
                <Pin size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Recordar sesión', 'Remember session')}</span>
                {menuSwitch(rememberLastNote)}
              </div>
              </Tooltip>
                </div>
              )}

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />

              {moreSectionHeader('help', t('Ayuda', 'Help'))}
              {openMoreSection === 'help' && (
                <div role="group" aria-label={t('Ayuda', 'Help')}>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://github.com/CyberGems/CyberNotes/wiki'); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <BookOpen size={13} style={{ opacity: 0.7 }} />
                    <span>{t('Documentación online', 'Online documentation')}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://github.com/CyberGems/CyberNotes/wiki/FAQ'); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <HelpCircle size={13} style={{ opacity: 0.7 }} />
                    <span>{t('Preguntas frecuentes', 'Frequently Asked Questions')}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://github.com/CyberGems/CyberNotes/releases'); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <Tag size={13} style={{ opacity: 0.7 }} />
                    <span>{t('Historial de cambios', 'Changelog')}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://cybergems.org'); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <Globe size={13} style={{ opacity: 0.7 }} />
                    <span>{t('Sitio web', 'Website')}</span>
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '3px 8px' }} />
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); onOpenAbout?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <Info size={13} style={{ opacity: 0.7 }} />
                    <span>{t('Acerca de', 'About')}</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); onOpenAbout?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <Download size={13} style={{ opacity: 0.7 }} />
                    <span>{t('Buscar actualizaciones', 'Check for updates')}</span>
                  </button>
                </div>
              )}

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
              {moreSectionHeader('app', t('Aplicación', 'App'))}
              {openMoreSection === 'app' && (
                <div role="group" aria-label={t('Aplicación', 'App')}>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); onOpenTrayPin?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <Pin size={13} style={{ opacity: 0.7 }} />
                    <span>{t('Mantener visible en la bandeja', 'Keep visible in system tray')}</span>
                  </button>
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
                      style={{ padding: '4px 10px', fontSize: 11, width: 'auto', color: '#ef4444', fontWeight: 600 }}
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
                  <Power size={14} style={{ color: '#ef4444' }} />
                  <span>{t('Salir', 'Exit')}</span>
                </button>
              )}
                </div>
              )}
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

        <Tooltip placement="bottom" label={minimizeToTray ? t('Minimizar a la bandeja', 'Minimize to tray') : t('Minimizar', 'Minimize')}>
        <button
          className="btn-icon titlebar-btn"
          onClick={() => window.cyberNotesAPI.windowMinimize()}
          style={{ width: 28, height: 28 }}
        >
          <Minus size={13} />
        </button>
        </Tooltip>
        <Tooltip placement="bottom" label={isMaximized ? t('Restaurar', 'Restore') : t('Maximizar', 'Maximize')}>
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
