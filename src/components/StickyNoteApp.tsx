import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Note, ThemeId } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import { applyThemeVars } from '../themes';
import { applyEditorFont } from '../fonts';
import { extractPreview, extractThumb } from '../utils/notes';
import Tooltip from './Tooltip';
import {
  Pin,
  Palette,
  ExternalLink,
  X,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  List,
  ListOrdered,
  Code,
  Trash2,
  Eye,
  Lock,
  GripVertical,
} from 'lucide-react';

interface Props {
  noteId: string;
}

export type StickyColorId =
  | 'cyber-yellow'
  | 'neon-cyan'
  | 'matrix-green'
  | 'midnight-purple'
  | 'cyber-pink'
  | 'graphite'
  | 'electric-blue'
  | 'cyber-orange'
  | 'acid-lime';

interface StickyColorMeta {
  id: StickyColorId;
  nameKey: keyof typeof TRANSLATIONS.es.editor.stickyColors;
  accent: string;
  accentGlow: string;
  bgDark: string;
  border: string;
  headerBg: string;
}

const STICKY_COLORS: Record<StickyColorId, StickyColorMeta> = {
  'cyber-yellow': {
    id: 'cyber-yellow',
    nameKey: 'yellow',
    accent: '#f59e0b',
    accentGlow: 'rgba(245, 158, 11, 0.4)',
    bgDark: 'rgba(28, 22, 12, 0.94)',
    border: 'rgba(245, 158, 11, 0.35)',
    headerBg: 'rgba(38, 30, 14, 0.98)',
  },
  'neon-cyan': {
    id: 'neon-cyan',
    nameKey: 'cyan',
    accent: '#06b6d4',
    accentGlow: 'rgba(6, 182, 212, 0.4)',
    bgDark: 'rgba(10, 24, 32, 0.94)',
    border: 'rgba(6, 182, 212, 0.35)',
    headerBg: 'rgba(12, 32, 42, 0.98)',
  },
  'matrix-green': {
    id: 'matrix-green',
    nameKey: 'green',
    accent: '#10b981',
    accentGlow: 'rgba(16, 185, 129, 0.4)',
    bgDark: 'rgba(10, 28, 18, 0.94)',
    border: 'rgba(16, 185, 129, 0.35)',
    headerBg: 'rgba(12, 36, 22, 0.98)',
  },
  'midnight-purple': {
    id: 'midnight-purple',
    nameKey: 'purple',
    accent: '#a855f7',
    accentGlow: 'rgba(168, 85, 247, 0.4)',
    bgDark: 'rgba(24, 12, 34, 0.94)',
    border: 'rgba(168, 85, 247, 0.35)',
    headerBg: 'rgba(32, 16, 46, 0.98)',
  },
  'cyber-pink': {
    id: 'cyber-pink',
    nameKey: 'pink',
    accent: '#f43f5e',
    accentGlow: 'rgba(244, 63, 94, 0.4)',
    bgDark: 'rgba(30, 12, 20, 0.94)',
    border: 'rgba(244, 63, 94, 0.35)',
    headerBg: 'rgba(40, 16, 26, 0.98)',
  },
  graphite: {
    id: 'graphite',
    nameKey: 'dark',
    accent: '#38bdf8',
    accentGlow: 'rgba(56, 189, 248, 0.3)',
    bgDark: 'rgba(18, 18, 24, 0.94)',
    border: 'rgba(255, 255, 255, 0.14)',
    headerBg: 'rgba(24, 24, 32, 0.98)',
  },
  'electric-blue': {
    id: 'electric-blue',
    nameKey: 'blue',
    accent: '#3b82f6',
    accentGlow: 'rgba(59, 130, 246, 0.4)',
    bgDark: 'rgba(10, 18, 38, 0.94)',
    border: 'rgba(59, 130, 246, 0.35)',
    headerBg: 'rgba(14, 26, 54, 0.98)',
  },
  'cyber-orange': {
    id: 'cyber-orange',
    nameKey: 'orange',
    accent: '#f97316',
    accentGlow: 'rgba(249, 115, 22, 0.4)',
    bgDark: 'rgba(36, 18, 10, 0.94)',
    border: 'rgba(249, 115, 22, 0.35)',
    headerBg: 'rgba(52, 24, 12, 0.98)',
  },
  'acid-lime': {
    id: 'acid-lime',
    nameKey: 'lime',
    accent: '#a3e635',
    accentGlow: 'rgba(163, 230, 53, 0.4)',
    bgDark: 'rgba(20, 30, 10, 0.94)',
    border: 'rgba(163, 230, 53, 0.35)',
    headerBg: 'rgba(28, 42, 12, 0.98)',
  },
};

const DEFAULT_STICKY_OPACITY = 0.9;
const OPACITY_OPTIONS = [1.0, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1];

const normalizeStickyOpacity = (value: number) => {
  const bounded = Math.min(1, Math.max(0.1, value));
  return OPACITY_OPTIONS.reduce((closest, option) => (
    Math.abs(option - bounded) <= Math.abs(closest - bounded) ? option : closest
  ), DEFAULT_STICKY_OPACITY);
};

const rgbaWithAlpha = (color: string, alpha: number) => {
  const match = color.match(/^rgba?\(\s*([^,]+),\s*([^,]+),\s*([^,]+)(?:,\s*[^)]+)?\)$/);
  if (!match) return color;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
};

export default function StickyNoteApp({ noteId }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<Language>('es');
  const [color, setColor] = useState<StickyColorId>('cyber-yellow');
  const [opacity, setOpacity] = useState<number>(DEFAULT_STICKY_OPACITY);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showOpacityPicker, setShowOpacityPicker] = useState(false);
  const [hoveredColor, setHoveredColor] = useState<StickyColorId | null>(null);
  const [hoveredOpacity, setHoveredOpacity] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorContentRef = useRef<string>('');
  const noteRef = useRef<Note | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  noteRef.current = note;

  const t = TRANSLATIONS[language];
  const colorMeta = STICKY_COLORS[hoveredColor || color] || STICKY_COLORS['cyber-yellow'];
  const previewOpacity = hoveredOpacity ?? opacity;
  const surfaceAlpha = 0.3 + previewOpacity * 0.7;
  const headerAlpha = 0.36 + previewOpacity * 0.64;
  const glassBlur = Math.round(6 + (1 - previewOpacity) * 18);

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: t.editor.placeholderBody,
      }),
    ],
    content: '',
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      editorContentRef.current = html;
      scheduleSave();
    },
  });

  // Load note and initial settings
  useEffect(() => {
    let mounted = true;

    async function loadData() {
      try {
        const s = await window.cyberNotesAPI.getSettings([
          'theme',
          'colorIntensity',
          'language',
          'editor_font',
        ]);
        if (mounted) {
          if (s.language === 'en' || s.language === 'es') setLanguage(s.language);
          applyThemeVars((s.theme as ThemeId) || 'cyber-dark', s.colorIntensity ? parseInt(s.colorIntensity) : 50);
          applyEditorFont(s.editor_font || 'inter');
        }

        const initiallyLocked = await window.cyberNotesAPI.isSessionLocked();
        if (mounted) setIsSessionLocked(initiallyLocked);

        const stickyConfig = await window.cyberNotesAPI.getStickyConfig(noteId);
        if (mounted && stickyConfig) {
          if (stickyConfig.color && stickyConfig.color in STICKY_COLORS) {
            setColor(stickyConfig.color as StickyColorId);
          }
          if (typeof stickyConfig.opacity === 'number') {
            setOpacity(normalizeStickyOpacity(stickyConfig.opacity));
          }
          if (typeof stickyConfig.pinned_top === 'boolean') {
            setIsAlwaysOnTop(stickyConfig.pinned_top);
          }
        }

        const fetched = await window.cyberNotesAPI.getNoteById(noteId);
        if (mounted) {
          if (fetched) {
            setNote(fetched);
            setTitle(fetched.title);
            editorContentRef.current = fetched.content;
            if (editor) {
              editor.commands.setContent(fetched.content || '', false);
            }
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading sticky note:', err);
        if (mounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      mounted = false;
    };
  }, [noteId, editor]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
    };
  }, []);

  // Sync real-time updates from other windows
  useEffect(() => {
    const unregisterNoteUpdated = window.cyberNotesAPI.onNoteUpdated((updated) => {
      if (updated.id === noteId) {
        setTitle((prev) => (prev !== updated.title ? updated.title : prev));
        if (editor && editor.getHTML() !== updated.content) {
          editor.commands.setContent(updated.content || '', false);
          editorContentRef.current = updated.content;
        }
        setNote(updated);
      }
    });

    const unregisterNoteDeleted = window.cyberNotesAPI.onNoteDeleted((deletedId) => {
      if (deletedId === noteId) {
        window.cyberNotesAPI.closeStickyNote(noteId);
      }
    });

    const unregisterLock = window.cyberNotesAPI.onForceLock(() => {
      setIsSessionLocked(true);
    });

    const unregisterShieldDisable = window.cyberNotesAPI.onShieldDisable?.(() => {
      setIsSessionLocked(false);
    });

    return () => {
      unregisterNoteUpdated();
      unregisterNoteDeleted();
      unregisterLock();
      if (unregisterShieldDisable) unregisterShieldDisable();
    };
  }, [noteId, editor]);

  const saveNoteImmediately = useCallback(
    async (newTitle?: string, newContent?: string) => {
      const current = noteRef.current;
      if (!current) return;

      const finalTitle = (newTitle !== undefined ? newTitle : title) || t.noteList.unnamedNote;
      const finalContent = newContent !== undefined ? newContent : editorContentRef.current;
      const preview = extractPreview(finalContent);
      const thumb = extractThumb(finalContent);
      const now = new Date().toISOString();

      const updatedNote: Note = {
        ...current,
        title: finalTitle,
        content: finalContent,
        preview,
        thumb,
        updated_at: now,
      };

      setSaveStatus('saving');
      try {
        await window.cyberNotesAPI.saveNote(updatedNote);
        setNote(updatedNote);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to save sticky note:', err);
        setSaveStatus('error');
      }
    },
    [title, t.noteList.unnamedNote]
  );

  const scheduleSave = useCallback(() => {
    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveNoteImmediately();
    }, 500);
  }, [saveNoteImmediately]);

  const handleTitleChange = (val: string) => {
    setTitle(val);
    scheduleSave();
  };

  const handleTogglePin = async () => {
    const nextVal = await window.cyberNotesAPI.toggleStickyAlwaysOnTop(noteId);
    setIsAlwaysOnTop(nextVal);
    await window.cyberNotesAPI.saveStickyConfig(noteId, { pinned_top: nextVal });
  };

  const handleSelectColor = async (colorId: StickyColorId) => {
    setColor(colorId);
    setHoveredColor(null);
    setHoveredOpacity(null);
    setShowColorPicker(false);
    await window.cyberNotesAPI.saveStickyConfig(noteId, { color: colorId });
  };

  const handleSelectOpacity = async (val: number) => {
    setOpacity(val);
    setHoveredOpacity(null);
    setShowOpacityPicker(false);
    await window.cyberNotesAPI.saveStickyConfig(noteId, { opacity: val });
  };

  const handleOpenInCyberNotes = async () => {
    await window.cyberNotesAPI.focusMainWindowWithNote(noteId);
  };

  const handleClose = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      await saveNoteImmediately();
    }
    await window.cyberNotesAPI.closeStickyNote(noteId);
  };

  const handleDeleteNote = async () => {
    await window.cyberNotesAPI.deleteNote(noteId);
  };

  const handleGripMouseDown = (e: React.MouseEvent<HTMLSpanElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    dragCleanupRef.current?.();

    const startScreenX = e.screenX;
    const startScreenY = e.screenY;
    const startWindowX = e.screenX - e.clientX;
    const startWindowY = e.screenY - e.clientY;
    const stableWidth = window.outerWidth;
    const stableHeight = window.outerHeight;
    const grip = e.currentTarget;
    let pendingX = startWindowX;
    let pendingY = startWindowY;
    let frame: number | null = null;

    const handleMove = (event: MouseEvent) => {
      pendingX = startWindowX + event.screenX - startScreenX;
      pendingY = startWindowY + event.screenY - startScreenY;
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        window.cyberNotesAPI.moveStickyWindow(noteId, pendingX, pendingY, stableWidth, stableHeight);
      });
    };
    const cleanup = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', cleanup);
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      grip.style.cursor = '';
      document.body.style.cursor = '';
      if (dragCleanupRef.current === cleanup) dragCleanupRef.current = null;
    };

    dragCleanupRef.current = cleanup;
    grip.style.cursor = 'grabbing';
    document.body.style.cursor = 'grabbing';
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', cleanup);
  };

  const handleEditorBodyMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editor) return;
    const target = e.target as HTMLElement;
    if (target.closest('.ProseMirror')) return;

    // El espacio vacío enfoca el documento sin intentar crear un caret fuera
    // de una posición válida del contenido.
    e.preventDefault();
    editor.chain().focus('end').run();
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClick = () => {
      setShowColorPicker(false);
      setShowOpacityPicker(false);
      setHoveredColor(null);
      setHoveredOpacity(null);
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  if (loading) {
    return (
      <div
        className="sticky-note-window"
        style={{
          width: '100vw',
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colorMeta.bgDark,
          color: colorMeta.accent,
          borderRadius: 12,
          border: `1px solid ${colorMeta.border}`,
        }}
      >
        <span style={{ fontSize: 13, letterSpacing: '0.05em' }}>{t.general.loading}</span>
      </div>
    );
  }

  return (
    <div
      className="sticky-note-window"
      style={{
        width: '100vw',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: rgbaWithAlpha(colorMeta.bgDark, surfaceAlpha),
        color: '#f8fafc',
        borderRadius: 12,
        border: `1px solid ${colorMeta.border}`,
        boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 0 24px rgba(255, 255, 255, 0.025), 0 8px 32px rgba(0, 0, 0, 0.45), 0 0 16px ${colorMeta.accentGlow}`,
        overflow: 'hidden',
        position: 'relative',
        backdropFilter: `blur(${glassBlur}px) saturate(135%)`,
        WebkitBackdropFilter: `blur(${glassBlur}px) saturate(135%)`,
        transition: 'background 0.2s ease, backdrop-filter 0.2s ease, border-color 0.25s ease',
        userSelect: 'none',
      }}
    >
      {/* ── Barra de Título / Arrastre (Sticky Header) ── */}
      <div
        style={{
          height: 38,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          background: rgbaWithAlpha(colorMeta.headerBg, headerAlpha),
          borderBottom: `1px solid ${colorMeta.border}`,
          transition: 'background 0.2s ease, border-color 0.25s ease',
          WebkitAppRegion: 'drag',
          gap: 6,
        } as any}
      >
        {/* Grip y título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, WebkitAppRegion: 'drag' } as any}>
          <span
            aria-hidden="true"
            className="sticky-drag-grip"
            style={{
              width: 14,
              height: 24,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: 'rgba(255, 255, 255, 0.32)',
              WebkitAppRegion: 'no-drag',
              transition: 'color 0.15s ease, opacity 0.15s ease',
            } as any}
            onMouseDown={handleGripMouseDown}
          >
            <GripVertical size={12} strokeWidth={2} />
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: colorMeta.accent,
              boxShadow: `0 0 8px ${colorMeta.accentGlow}`,
              flexShrink: 0,
            }}
          />
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder={t.editor.placeholderTitle}
            style={{
              WebkitAppRegion: 'no-drag',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: 13,
              fontWeight: 600,
              flex: 1,
              minWidth: 0,
              letterSpacing: '-0.01em',
            } as any}
          />
        </div>

        {/* Acciones de la barra superior */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            WebkitAppRegion: 'no-drag',
            flexShrink: 0,
          } as any}
        >
          {/* Always on top toggle */}
          <Tooltip
            label={
              isAlwaysOnTop
                ? t.editor.stickyAlwaysOnTop
                : t.editor.stickyNotAlwaysOnTop
            }
            placement="bottom"
          >
            <button
              className="sticky-note-button"
              onClick={handleTogglePin}
              style={{
                background: isAlwaysOnTop ? colorMeta.accentGlow : 'transparent',
                color: isAlwaysOnTop ? colorMeta.accent : 'rgba(255, 255, 255, 0.55)',
                border: 'none',
                borderRadius: 4,
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <Pin size={13} style={{ transform: isAlwaysOnTop ? 'rotate(45deg)' : 'none' }} />
            </button>
          </Tooltip>

          {/* Color palette button */}
          <div style={{ position: 'relative' }}>
            <Tooltip label={t.editor.stickyColor} placement="bottom">
              <button
                className="sticky-note-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowColorPicker(!showColorPicker);
                  setShowOpacityPicker(false);
                  setHoveredOpacity(null);
                }}
                style={{
                  background: showColorPicker ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: 'rgba(255, 255, 255, 0.6)',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Palette size={13} />
              </button>
            </Tooltip>

            {showColorPicker && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  zIndex: 100,
                  background: '#12121a',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: 8,
                  padding: 6,
                  display: 'flex',
                  gap: 6,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  transition: 'background 0.2s ease, border-color 0.2s ease',
                }}
                onMouseLeave={() => setHoveredColor(null)}
              >
                {(Object.keys(STICKY_COLORS) as StickyColorId[]).map((cid) => {
                  const meta = STICKY_COLORS[cid];
                  const isSelected = color === cid;
                  const isHovered = hoveredColor === cid;
                  return (
                    <button
                      className="sticky-note-button"
                      key={cid}
                      type="button"
                      onClick={() => handleSelectColor(cid)}
                      onMouseEnter={() => setHoveredColor(cid)}
                      aria-label={t.editor.stickyColors[meta.nameKey]}
                      aria-pressed={isSelected}
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: meta.accent,
                        border: isSelected ? '2px solid #ffffff' : '1px solid rgba(255,255,255,0.2)',
                        boxShadow: isSelected || isHovered ? `0 0 10px ${meta.accent}` : 'none',
                        cursor: 'pointer',
                        padding: 0,
                        transition: 'transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1), filter 0.16s ease, box-shadow 0.16s ease',
                        transform: isSelected
                          ? isHovered ? 'scale(1.2)' : 'scale(1.15)'
                          : isHovered ? 'scale(1.08)' : 'scale(1)',
                      }}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Opacity selector */}
          <div style={{ position: 'relative' }}>
            <Tooltip label={t.editor.stickyOpacity} placement="bottom">
              <button
                className="sticky-note-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowOpacityPicker(!showOpacityPicker);
                  setShowColorPicker(false);
                  setHoveredColor(null);
                }}
                style={{
                  background: showOpacityPicker ? 'rgba(255,255,255,0.1)' : 'transparent',
                  color: 'rgba(255, 255, 255, 0.6)',
                  border: 'none',
                  borderRadius: 4,
                  padding: '4px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Eye size={13} />
              </button>
            </Tooltip>

            {showOpacityPicker && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 6,
                  zIndex: 100,
                  background: '#12121a',
                  border: '1px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: 8,
                  padding: 4,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
                  minWidth: 80,
                }}
                onMouseLeave={() => setHoveredOpacity(null)}
              >
                {OPACITY_OPTIONS.map((op) => (
                  <button
                    className="sticky-note-button"
                    key={op}
                    onClick={() => handleSelectOpacity(op)}
                    onMouseEnter={() => setHoveredOpacity(op)}
                    style={{
                      background: opacity === op ? colorMeta.accentGlow : 'transparent',
                      color: opacity === op ? colorMeta.accent : 'rgba(255,255,255,0.7)',
                      border: 'none',
                      borderRadius: 4,
                      padding: '4px 8px',
                      cursor: 'pointer',
                      fontSize: 11,
                      fontWeight: 600,
                      textAlign: 'left',
                    }}
                  >
                    {Math.round(op * 100)}%
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Open in CyberNotes */}
          <Tooltip label={t.editor.stickyDockMain} placement="bottom">
            <button
              className="sticky-note-button"
              onClick={handleOpenInCyberNotes}
              style={{
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.6)',
                border: 'none',
                borderRadius: 4,
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ExternalLink size={13} />
            </button>
          </Tooltip>

          {/* Close Sticky Note */}
          <Tooltip label={t.editor.stickyClose} placement="bottom">
            <button
              className="sticky-note-button"
              onClick={handleClose}
              style={{
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.6)',
                border: 'none',
                borderRadius: 4,
                padding: '4px 6px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <X size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Editor Body ── */}
      <div
        onMouseDown={handleEditorBodyMouseDown}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          userSelect: 'text',
          fontSize: 13.5,
          lineHeight: 1.55,
          color: '#f1f5f9',
          outline: 'none',
        }}
      >
        <EditorContent editor={editor} style={{ minHeight: '100%' }} />
      </div>

      {/* ── Mini Toolbar Inferior ── */}
      {editor && (
        <div
          style={{
            height: 32,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            background: 'rgba(10, 10, 16, 0.45)',
            borderTop: `1px solid rgba(255, 255, 255, 0.07)`,
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              className="sticky-note-button"
              type="button"
              onClick={() => editor.chain().focus().toggleBold().run()}
              style={{
                background: editor.isActive('bold') ? colorMeta.accentGlow : 'transparent',
                color: editor.isActive('bold') ? colorMeta.accent : 'rgba(255, 255, 255, 0.5)',
                border: 'none',
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
              }}
            >
              <Bold size={12} />
            </button>
            <button
              className="sticky-note-button"
              type="button"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              style={{
                background: editor.isActive('italic') ? colorMeta.accentGlow : 'transparent',
                color: editor.isActive('italic') ? colorMeta.accent : 'rgba(255, 255, 255, 0.5)',
                border: 'none',
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
              }}
            >
              <Italic size={12} />
            </button>
            <button
              className="sticky-note-button"
              type="button"
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              style={{
                background: editor.isActive('underline') ? colorMeta.accentGlow : 'transparent',
                color: editor.isActive('underline') ? colorMeta.accent : 'rgba(255, 255, 255, 0.5)',
                border: 'none',
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
              }}
            >
              <UnderlineIcon size={12} />
            </button>
            <button
              className="sticky-note-button"
              type="button"
              onClick={() => editor.chain().focus().toggleStrike().run()}
              style={{
                background: editor.isActive('strike') ? colorMeta.accentGlow : 'transparent',
                color: editor.isActive('strike') ? colorMeta.accent : 'rgba(255, 255, 255, 0.5)',
                border: 'none',
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
              }}
            >
              <Strikethrough size={12} />
            </button>
            <button
              className="sticky-note-button"
              type="button"
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              style={{
                background: editor.isActive('highlight') ? colorMeta.accentGlow : 'transparent',
                color: editor.isActive('highlight') ? colorMeta.accent : 'rgba(255, 255, 255, 0.5)',
                border: 'none',
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
              }}
            >
              <Highlighter size={12} />
            </button>
            <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.1)', margin: '0 2px' }} />
            <button
              className="sticky-note-button"
              type="button"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              style={{
                background: editor.isActive('bulletList') ? colorMeta.accentGlow : 'transparent',
                color: editor.isActive('bulletList') ? colorMeta.accent : 'rgba(255, 255, 255, 0.5)',
                border: 'none',
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
              }}
            >
              <List size={12} />
            </button>
            <button
              className="sticky-note-button"
              type="button"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              style={{
                background: editor.isActive('orderedList') ? colorMeta.accentGlow : 'transparent',
                color: editor.isActive('orderedList') ? colorMeta.accent : 'rgba(255, 255, 255, 0.5)',
                border: 'none',
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
              }}
            >
              <ListOrdered size={12} />
            </button>
            <button
              className="sticky-note-button"
              type="button"
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              style={{
                background: editor.isActive('codeBlock') ? colorMeta.accentGlow : 'transparent',
                color: editor.isActive('codeBlock') ? colorMeta.accent : 'rgba(255, 255, 255, 0.5)',
                border: 'none',
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
              }}
            >
              <Code size={12} />
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.35)', fontWeight: 500 }}>
              {saveStatus === 'saving' ? t.editor.saving : saveStatus === 'error' ? t.editor.saveError : t.editor.saved}
            </span>
            <button
              className="sticky-note-button"
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              style={{
                background: 'transparent',
                color: 'rgba(244, 63, 94, 0.65)',
                border: 'none',
                borderRadius: 4,
                padding: 4,
                cursor: 'pointer',
              }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ── Modal de Confirmación de Eliminación ── */}
      {showDeleteConfirm && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 110,
            background: 'rgba(8, 8, 14, 0.85)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            textAlign: 'center',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{t.noteList.deleteConfirm}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-ghost sticky-note-button"
              onClick={() => setShowDeleteConfirm(false)}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {t.general.cancel}
            </button>
            <button
              className="btn btn-danger sticky-note-button"
              onClick={handleDeleteNote}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {t.general.delete}
            </button>
          </div>
        </div>
      )}

      {/* ── Escudo de Bloqueo de Sesión (Privacy Shield) ── */}
      {isSessionLocked && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 120,
            background: 'rgba(10, 10, 16, 0.94)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: 'rgba(255, 255, 255, 0.05)',
              border: `1px solid ${colorMeta.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: colorMeta.accent,
            }}
          >
            <Lock size={20} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>
            {language === 'es' ? 'CyberNotes Bloqueado' : 'CyberNotes Locked'}
          </span>
          <button
            className="btn btn-primary sticky-note-button"
            onClick={handleOpenInCyberNotes}
            style={{ fontSize: 12, padding: '6px 14px', gap: 6 }}
          >
            <ExternalLink size={13} />
            {language === 'es' ? 'Desbloquear en CyberNotes' : 'Unlock in CyberNotes'}
          </button>
        </div>
      )}
    </div>
  );
}
