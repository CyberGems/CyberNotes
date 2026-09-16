import { useState, useEffect, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Square, X, BookOpen, Menu, Settings, Save, CaseSensitive, Map, BarChart3, List, Pin, Hash, Lock, FileText, Info, Minimize2, Power, HelpCircle, Tag, Globe, Heart, Download, Upload, FileDown, Printer } from 'lucide-react';
import { Note } from '../types';
import Tooltip from './Tooltip';

interface Props {
  language?: 'es' | 'en';
  onLock?: () => void;
  onOpenSettings?: () => void;
  onOpenAbout?: () => void;
  onOpenTrayPin?: () => void;
  onExportMarkdown?: () => void;
  onExportHtml?: () => void;
  onExportPdf?: () => void;
  onExportText?: () => void;
  onPrint?: () => void;
  onSelectNote?: (id: string) => void;
  onClearRecent?: () => void;
  recentNotes?: Note[];
  autosaveEnabled?: boolean;
  onAutosaveChange?: (v: boolean) => void;
  autoUnlockCapsLock?: boolean;
  onAutoUnlockCapsLockChange?: (v: boolean) => void;
  autoUnlockCapsLockTimeout?: number;
  showMinimap?: boolean;
  onShowMinimapChange?: (v: boolean) => void;
  showLineCounter?: boolean;
  onShowLineCounterChange?: (v: boolean) => void;
  showLineGutter?: boolean;
  onShowLineGutterChange?: (v: boolean) => void;
  showWordCounter?: boolean;
  onShowWordCounterChange?: (v: boolean) => void;
  rememberLastNote?: boolean;
  onRememberLastNoteChange?: (v: boolean) => void;
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
  onLock,
  onOpenSettings,
  onOpenAbout,
  onOpenTrayPin,
  onExportMarkdown,
  onExportHtml,
  onExportPdf,
  onExportText,
  onPrint,
  onSelectNote,
  onClearRecent,
  recentNotes = [],
  autosaveEnabled = true,
  onAutosaveChange,
  autoUnlockCapsLock = false,
  onAutoUnlockCapsLockChange,
  autoUnlockCapsLockTimeout = 10,
  showMinimap = false,
  onShowMinimapChange,
  showLineCounter = true,
  onShowLineCounterChange,
  showLineGutter = true,
  onShowLineGutterChange,
  showWordCounter = true,
  onShowWordCounterChange,
  rememberLastNote = true,
  onRememberLastNoteChange,
  minimizeToTray = false,
  closeToTray = false,
  capsStatus,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const burgerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const [recentSubOpen, setRecentSubOpen] = useState(false);
  const [exportSubOpen, setExportSubOpen] = useState(false);
  const [helpSubOpen, setHelpSubOpen] = useState(false);
  const [exitConfirm, setExitConfirm] = useState(false);

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
      setRecentSubOpen(false);
      setExportSubOpen(false);
      setHelpSubOpen(false);
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
    const frame = window.requestAnimationFrame(focusFirstItem);
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
      window.cancelAnimationFrame(frame);
      document.removeEventListener('keydown', handleMenuKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    window.cyberNotesAPI.isMaximized?.().then(setIsMaximized).catch(() => {});
    const unsub = window.cyberNotesAPI.onMaximizedState?.((max) => setIsMaximized(max));
    return () => { unsub?.(); };
  }, []);

  const t = (es: string, en: string) => language === 'es' ? es : en;
  const activateMenuItem = (event: React.KeyboardEvent, action: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    width: 32,
    height: 18,
    borderRadius: 9,
    background: active ? 'var(--accent)' : 'var(--border)',
    position: 'relative',
    transition: 'background 0.2s',
    flexShrink: 0,
    cursor: 'pointer',
  });

  const toggleDot: React.CSSProperties = {
    width: 14,
    height: 14,
    borderRadius: '50%',
    background: '#fff',
    position: 'absolute',
    top: 2,
    transition: 'left 0.2s',
  };
  return (
    <div
      className="glass-effect titlebar-glass"
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, input, textarea, select, [data-no-drag], .btn-icon, .menu-item')) {
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
      <Tooltip placement="bottom" label={language === 'es' ? 'Acerca de CyberNotes' : 'About CyberNotes'}>
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
          minWidth: 0,
          padding: '0 12px',
          height: '100%',
          WebkitAppRegion: 'drag',
        } as any}
      >
        {(() => {
          const capsOn = !!capsStatus?.active;
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

          return (
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
                        background: '#ef4444',
                        borderRadius: 2,
                        transition: 'width 1s linear',
                      }}
                    />
                  </span>
                )}
              </div>
            </Tooltip>
          );
        })()}
      </div>

      {/* Controles de ventana */}
      <div
        data-no-drag
        style={{ display: 'flex', alignItems: 'center', gap: 2, WebkitAppRegion: 'no-drag', flexShrink: 0 } as any}
      >
        {/* Settings Button */}
        <Tooltip placement="bottom" label={t('Configuración', 'Settings')}>
          <button
            className="btn-icon titlebar-btn"
            onClick={onOpenSettings}
            style={{ width: 28, height: 28 }}
          >
            <Settings size={14} />
          </button>
        </Tooltip>

        {/* Burger Menu */}
        <div style={{ position: 'relative' }}>
          <Tooltip placement="bottom" label={t('Menú', 'Menu')}>
          <button
            ref={burgerRef}
            className="btn-icon titlebar-btn"
            onClick={() => {
              if (!menuOpen && burgerRef.current) {
                const r = burgerRef.current.getBoundingClientRect();
                setMenuPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
              }
              setMenuOpen(!menuOpen);
            }}
            style={{ width: 28, height: 28 }}
          >
            <Menu size={14} />
          </button>
          </Tooltip>

          {menuOpen && createPortal(
            <div ref={menuRef} role="menu" aria-label={t('Menú principal', 'Main menu')} style={{
              position: 'fixed',
              top: menuPos.top,
              right: menuPos.right,
              width: 240,
              background: 'var(--bg-modal)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
              zIndex: 99999,
              padding: '6px 0',
              display: 'flex',
              flexDirection: 'column',
            }}>
              {/* Recent Notes Submenu */}
              {recentNotes.length > 0 && (
                <>
                  <button
                    className="menu-item"
                    onClick={() => setRecentSubOpen(!recentSubOpen)}
                  >
                    <FileText size={14} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Notas recientes', 'Recent notes')}</span>
                    <span style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      transform: recentSubOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                      transition: 'transform 0.15s',
                    }}>▶</span>
                  </button>
                  {recentSubOpen && (
                    <div style={{
                      borderLeft: '2px solid var(--border)',
                      marginLeft: 19,
                      paddingLeft: 0,
                    }}>
                      {recentNotes.slice(0, 10).map(note => (
                        <button
                          key={note.id}
                          className="menu-item"
                          onClick={() => { setMenuOpen(false); onSelectNote?.(note.id); }}
                          style={{ padding: '4px 10px', fontSize: 11 }}
                        >
                          <span style={{
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {note.title || (language === 'es' ? 'Sin título' : 'Untitled')}
                          </span>
                        </button>
                      ))}
                      <div style={{ height: 1, background: 'var(--border)', margin: '2px 8px' }} />
                      <button
                        className="menu-item"
                        onClick={() => { onClearRecent?.(); setRecentSubOpen(false); }}
                        style={{ padding: '4px 10px', fontSize: 10, color: 'var(--text-muted)' }}
                      >
                        {t('Limpiar recientes', 'Clear recently opened')}
                      </button>
                    </div>
                  )}
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
                </>
              )}

              {/* Export Submenu */}
              <button
                className="menu-item"
                onClick={() => setExportSubOpen(!exportSubOpen)}
                aria-haspopup="true"
                aria-expanded={exportSubOpen}
              >
                <Upload size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Exportar', 'Export')}</span>
                <span style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  transform: exportSubOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}>▶</span>
              </button>
              {exportSubOpen && (
                <div style={{
                  borderLeft: '2px solid var(--border)',
                  marginLeft: 19,
                  paddingLeft: 0,
                }}>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); setExportSubOpen(false); onExportPdf?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+Alt+P"
                  >
                    <FileDown size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Exportar PDF', 'Export PDF')}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+Alt+P</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); setExportSubOpen(false); onExportMarkdown?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+Alt+M"
                  >
                    <FileText size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Markdown (.md)', 'Markdown (.md)')}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+Alt+M</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); setExportSubOpen(false); onExportText?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+Alt+T"
                  >
                    <FileText size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Texto plano (.txt)', 'Plain text (.txt)')}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+Alt+T</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); setExportSubOpen(false); onExportHtml?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+Alt+H"
                  >
                    <Globe size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('HTML (.html)', 'HTML (.html)')}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+Alt+H</span>
                  </button>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); setExportSubOpen(false); onPrint?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    aria-keyshortcuts="Control+P"
                  >
                    <Printer size={13} style={{ opacity: 0.7 }} />
                    <span style={{ flex: 1 }}>{t('Imprimir', 'Print')}</span>
                    <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>Ctrl+P</span>
                  </button>
                </div>
              )}

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />

              {/* Toggles */}
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onAutosaveChange?.(!autosaveEnabled)}
                onKeyDown={e => activateMenuItem(e, () => onAutosaveChange?.(!autosaveEnabled))}
              >
                <Save size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Autoguardado', 'Autosave')}</span>
                <div style={toggleStyle(autosaveEnabled)}>
                  <div style={{ ...toggleDot, left: autosaveEnabled ? 16 : 2 }} />
                </div>
              </div>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onAutoUnlockCapsLockChange?.(!autoUnlockCapsLock)}
                onKeyDown={e => activateMenuItem(e, () => onAutoUnlockCapsLockChange?.(!autoUnlockCapsLock))}
              >
                <span style={{ fontSize: 13, lineHeight: 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 14, opacity: 0.7 }}>⇪</span>
                <span style={{ flex: 1 }}>{t('Auto-unlock Caps', 'Auto-unlock Caps')}</span>
                <div style={toggleStyle(autoUnlockCapsLock)}>
                  <div style={{ ...toggleDot, left: autoUnlockCapsLock ? 16 : 2 }} />
                </div>
              </div>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowMinimapChange?.(!showMinimap)}
                onKeyDown={e => activateMenuItem(e, () => onShowMinimapChange?.(!showMinimap))}
              >
                <Map size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Minimapa', 'Minimap')}</span>
                <div style={toggleStyle(showMinimap)}>
                  <div style={{ ...toggleDot, left: showMinimap ? 16 : 2 }} />
                </div>
              </div>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowLineCounterChange?.(!showLineCounter)}
                onKeyDown={e => activateMenuItem(e, () => onShowLineCounterChange?.(!showLineCounter))}
              >
                <BarChart3 size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Contador líneas', 'Line counter')}</span>
                <div style={toggleStyle(showLineCounter)}>
                  <div style={{ ...toggleDot, left: showLineCounter ? 16 : 2 }} />
                </div>
              </div>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowLineGutterChange?.(!showLineGutter)}
                onKeyDown={e => activateMenuItem(e, () => onShowLineGutterChange?.(!showLineGutter))}
              >
                <List size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Líneas numeradas', 'Line gutter')}</span>
                <div style={toggleStyle(showLineGutter)}>
                  <div style={{ ...toggleDot, left: showLineGutter ? 16 : 2 }} />
                </div>
              </div>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onShowWordCounterChange?.(!showWordCounter)}
                onKeyDown={e => activateMenuItem(e, () => onShowWordCounterChange?.(!showWordCounter))}
              >
                <Hash size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Contador palabras', 'Word counter')}</span>
                <div style={toggleStyle(showWordCounter)}>
                  <div style={{ ...toggleDot, left: showWordCounter ? 16 : 2 }} />
                </div>
              </div>
              <div
                className="menu-item"
                role="menuitem"
                tabIndex={0}
                onClick={() => onRememberLastNoteChange?.(!rememberLastNote)}
                onKeyDown={e => activateMenuItem(e, () => onRememberLastNoteChange?.(!rememberLastNote))}
              >
                <Pin size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Recordar sesión', 'Remember session')}</span>
                <div style={toggleStyle(rememberLastNote)}>
                  <div style={{ ...toggleDot, left: rememberLastNote ? 16 : 2 }} />
                </div>
              </div>

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />

              <button
                className="menu-item"
                onClick={() => setHelpSubOpen(!helpSubOpen)}
              >
                <HelpCircle size={14} style={{ opacity: 0.7 }} />
                <span style={{ flex: 1 }}>{t('Ayuda', 'Help')}</span>
                <span style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  transform: helpSubOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s',
                }}>▶</span>
              </button>
              {helpSubOpen && (
                <div style={{
                  borderLeft: '2px solid var(--border)',
                  marginLeft: 19,
                  paddingLeft: 0,
                }}>
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); onOpenTrayPin?.(); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <Pin size={13} style={{ opacity: 0.7 }} />
                    <span>{t('Mantener visible en la bandeja', 'Keep visible in system tray')}</span>
                  </button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '3px 8px' }} />
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://github.com/CyberGems/CyberNotes/wiki'); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <BookOpen size={13} style={{ opacity: 0.7 }} />
                    <span>{t('Documentación / Wiki', 'Documentation / Wiki')}</span>
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
                  <button
                    className="menu-item"
                    onClick={() => { setMenuOpen(false); window.cyberNotesAPI.openExternal('https://github.com/CyberGems/CyberNotes#%EF%B8%8F-donate'); }}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    <Heart size={13} style={{ color: '#F43F5E', opacity: 1 }} fill="#F43F5E" stroke="none" />
                    <span>{t('Donar', 'Donate')}</span>
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
        <Tooltip placement="bottom" label={closeToTray ? t('Cerrar a la bandeja', 'Close to tray') : t('Cerrar', 'Close')}>
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
