import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import { EditorState } from '@tiptap/pm/state';
import { EditorView } from '@tiptap/pm/view';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TiptapImage from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Note, ThemeId } from '../types';
import type { StickyColorId } from '../../shared/sticky';
import { STICKY_BACKGROUNDS } from '../../shared/sticky';
import { Language, TRANSLATIONS } from '../languages';
import { applyThemeVars } from '../themes';
import { applyEditorFont } from '../fonts';
import { extractPreview, extractThumb } from '../utils/notes';
import { FontSize, FontFamily, WordFontFamilySelect, WordFontSizeSelect } from './NoteEditor';
import Tooltip from './Tooltip';
import GlobalErrorToast from './GlobalErrorToast';
import {
  Pin,
  Palette,
  Eye,
  ExternalLink,
  SquareArrowDownLeft,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  List,
  ListOrdered,
  Code,
  Undo2,
  Redo2,
  Plus,
  Scissors,
  Copy,
  Clipboard,
  CheckSquare,
  Trash2,
  Blend,
  Lock,
  GripVertical,
} from 'lucide-react';

interface Props {
  noteId: string;
}

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
    bgDark: STICKY_BACKGROUNDS['cyber-yellow'],
    border: 'rgba(245, 158, 11, 0.35)',
    headerBg: '#261e0e',
  },
  'neon-cyan': {
    id: 'neon-cyan',
    nameKey: 'cyan',
    accent: '#06b6d4',
    accentGlow: 'rgba(6, 182, 212, 0.4)',
    bgDark: STICKY_BACKGROUNDS['neon-cyan'],
    border: 'rgba(6, 182, 212, 0.35)',
    headerBg: '#0c202a',
  },
  'matrix-green': {
    id: 'matrix-green',
    nameKey: 'green',
    accent: '#10b981',
    accentGlow: 'rgba(16, 185, 129, 0.4)',
    bgDark: STICKY_BACKGROUNDS['matrix-green'],
    border: 'rgba(16, 185, 129, 0.35)',
    headerBg: '#0c2416',
  },
  'midnight-purple': {
    id: 'midnight-purple',
    nameKey: 'purple',
    accent: '#a855f7',
    accentGlow: 'rgba(168, 85, 247, 0.4)',
    bgDark: STICKY_BACKGROUNDS['midnight-purple'],
    border: 'rgba(168, 85, 247, 0.35)',
    headerBg: '#20102e',
  },
  'cyber-pink': {
    id: 'cyber-pink',
    nameKey: 'pink',
    accent: '#f43f5e',
    accentGlow: 'rgba(244, 63, 94, 0.4)',
    bgDark: STICKY_BACKGROUNDS['cyber-pink'],
    border: 'rgba(244, 63, 94, 0.35)',
    headerBg: '#28101a',
  },
  graphite: {
    id: 'graphite',
    nameKey: 'dark',
    accent: '#38bdf8',
    accentGlow: 'rgba(56, 189, 248, 0.3)',
    bgDark: STICKY_BACKGROUNDS.graphite,
    border: 'rgba(255, 255, 255, 0.14)',
    headerBg: '#181820',
  },
  'electric-blue': {
    id: 'electric-blue',
    nameKey: 'blue',
    accent: '#3b82f6',
    accentGlow: 'rgba(59, 130, 246, 0.4)',
    bgDark: STICKY_BACKGROUNDS['electric-blue'],
    border: 'rgba(59, 130, 246, 0.35)',
    headerBg: '#0e1a36',
  },
  'cyber-orange': {
    id: 'cyber-orange',
    nameKey: 'orange',
    accent: '#f97316',
    accentGlow: 'rgba(249, 115, 22, 0.4)',
    bgDark: STICKY_BACKGROUNDS['cyber-orange'],
    border: 'rgba(249, 115, 22, 0.35)',
    headerBg: '#34180c',
  },
  'acid-lime': {
    id: 'acid-lime',
    nameKey: 'lime',
    accent: '#a3e635',
    accentGlow: 'rgba(163, 230, 53, 0.4)',
    bgDark: STICKY_BACKGROUNDS['acid-lime'],
    border: 'rgba(163, 230, 53, 0.35)',
    headerBg: '#1c2a0c',
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

const MAX_STICKY_IMAGE_DIMENSION = 1400;
const MAX_STICKY_IMAGE_INPUT_BYTES = 20_000_000;
const MAX_STICKY_IMAGE_BYTES = 1_500_000;

class StickyImageTooLargeError extends Error {}

function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.ceil((base64.length * 3) / 4);
}

async function optimizeStickyImage(blob: Blob): Promise<string> {
  if (!blob.type.startsWith('image/')) {
    throw new Error('Unsupported image type');
  }
  if (blob.size > MAX_STICKY_IMAGE_INPUT_BYTES) {
    throw new StickyImageTooLargeError('Input image is too large to process');
  }

  const objectUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Unable to decode image'));
      element.src = objectUrl;
    });

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) throw new Error('Image has no dimensions');

    let width = Math.max(1, Math.round(sourceWidth * Math.min(1, MAX_STICKY_IMAGE_DIMENSION / sourceWidth, MAX_STICKY_IMAGE_DIMENSION / sourceHeight)));
    let height = Math.max(1, Math.round(sourceHeight * (width / sourceWidth)));
    const outputType = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    let quality = 0.86;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    for (let attempt = 0; attempt < 10; attempt++) {
      canvas.width = width;
      canvas.height = height;
      context.clearRect(0, 0, width, height);
      if (outputType === 'image/jpeg') {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
      }
      context.drawImage(image, 0, 0, width, height);

      const dataUrl = canvas.toDataURL(outputType, quality);
      if (estimateDataUrlBytes(dataUrl) <= MAX_STICKY_IMAGE_BYTES) return dataUrl;

      if (outputType !== 'image/png' && quality > 0.5) {
        quality = Math.max(0.5, quality - 0.12);
      } else {
        width = Math.max(1, Math.floor(width * 0.8));
        height = Math.max(1, Math.floor(height * 0.8));
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  throw new StickyImageTooLargeError('Image exceeds the sticky note size limit');
}

function insertStickyImage(view: EditorView, dataUrl: string): boolean {
  const imageType = view.state.schema.nodes.image;
  if (!imageType) return false;
  const imageNode = imageType.create({ src: dataUrl });
  view.focus();
  view.dispatch(view.state.tr.replaceSelectionWith(imageNode).scrollIntoView());
  return true;
}

type StickyContextAction = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll';

/** Carga el documento inicial sin crear una falsa entrada en Undo/Redo. */
function loadStickyEditorContent(editor: Editor, raw: string) {
  editor.chain().setMeta('addToHistory', false).setContent(raw || '', false).run();
  const fresh = EditorState.create({
    doc: editor.state.doc,
    plugins: editor.state.plugins,
  });
  editor.view.updateState(fresh);
}

const STICKY_FOOTER_TIP_DELAY = 500;

function StickyFooterBtn({
  label,
  onClick,
  active = false,
  disabled = false,
  accent,
  accentGlow,
  danger = false,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  accent?: string;
  accentGlow?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const idle = danger ? 'rgba(244, 63, 94, 0.65)' : 'rgba(255, 255, 255, 0.5)';
  return (
    <Tooltip label={label} placement="top" delay={STICKY_FOOTER_TIP_DELAY}>
      <button
        className="sticky-note-button"
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        style={{
          background: active && accentGlow ? accentGlow : 'transparent',
          color: active && accent ? accent : idle,
          border: 'none',
          borderRadius: 4,
          padding: 4,
          cursor: disabled ? 'default' : 'pointer',
        }}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export default function StickyNoteApp({ noteId }: Props) {
  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState<Language>('es');
  const [color, setColor] = useState<StickyColorId>('cyber-yellow');
  const [opacity, setOpacity] = useState<number>(DEFAULT_STICKY_OPACITY);
  const [zoom, setZoom] = useState<number>(1);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showOpacityPicker, setShowOpacityPicker] = useState(false);
  const [hoveredColor, setHoveredColor] = useState<StickyColorId | null>(null);
  const [hoveredOpacity, setHoveredOpacity] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [isSessionLocked, setIsSessionLocked] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [pasteNotice, setPasteNotice] = useState<'too-large' | 'failed' | null>(null);
  const [isAttention, setIsAttention] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pasteNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);
  const zoomRef = useRef(1);
  const editorContentRef = useRef<string>('');
  const noteRef = useRef<Note | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  noteRef.current = note;

  const t = TRANSLATIONS[language];
  const colorMeta = STICKY_COLORS[hoveredColor || color] || STICKY_COLORS['cyber-yellow'];
  const previewOpacity = hoveredOpacity ?? opacity;

  /** Mismo rango que la escala del editor principal (0.8–1.5). */
  const clampZoom = (value: number): number => {
    if (!Number.isFinite(value)) return 1;
    return Math.min(1.5, Math.max(0.8, Math.round(value * 100) / 100));
  };

  const applyZoom = useCallback((next: number) => {
    const clamped = clampZoom(next);
    zoomRef.current = clamped;
    setZoom(clamped);
    if (zoomPersistTimerRef.current) clearTimeout(zoomPersistTimerRef.current);
    zoomPersistTimerRef.current = setTimeout(() => {
      zoomPersistTimerRef.current = null;
      void window.cyberNotesAPI.saveStickyConfig(noteId, { zoom: clamped });
    }, 400);
  }, [noteId]);

  // Ctrl+rueda sobre el contenido: zoom (rueda abajo = aumentar, convención de la suite).
  // Incluye `loading`: en el primer render el contenedor aun no existe (retorno temprano).
  useEffect(() => {
    if (loading) return;
    const el = editorScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      applyZoom(zoomRef.current + (e.deltaY > 0 ? 0.05 : -0.05));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyZoom, loading]);

  const showPasteNotice = useCallback((notice: 'too-large' | 'failed') => {
    setPasteNotice(notice);
    if (pasteNoticeTimerRef.current) clearTimeout(pasteNoticeTimerRef.current);
    pasteNoticeTimerRef.current = setTimeout(() => {
      setPasteNotice(null);
      pasteNoticeTimerRef.current = null;
    }, 3200);
  }, []);

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      TiptapImage.configure({ allowBase64: true, inline: false }),
      Underline,
      Highlight.configure({ multicolor: false }),
      // Necesario para leer y escribir tamaños y fuentes por selección (misma
      // marca que el editor principal; sin esto, el sticky los borraría al guardar).
      FontSize,
      FontFamily,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: t.editor.placeholderBody,
      }),
    ],
    editorProps: {
      attributes: {
        spellcheck: 'true',
      },
      handlePaste: (view, event) => {
        const imageItem = Array.from(event.clipboardData?.items || [])
          .find(item => item.kind === 'file' && item.type.startsWith('image/'));
        const imageFile = imageItem?.getAsFile();
        if (!imageFile) return false;

        event.preventDefault();
        void optimizeStickyImage(imageFile)
          .then(dataUrl => {
            if (!view.isDestroyed) insertStickyImage(view, dataUrl);
          })
          .catch(error => {
            if (error instanceof StickyImageTooLargeError) showPasteNotice('too-large');
            else showPasteNotice('failed');
          });
        return true;
      },
    },
    content: '',
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      editorContentRef.current = html;
      scheduleSave();
    },
  });

  // Los combos Word del footer leen el estado directo del editor en cada
  // render (igual que los botones bold/italic), sin estado local aquí.

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
          if (typeof stickyConfig.zoom === 'number' && Number.isFinite(stickyConfig.zoom)) {
            const initial = clampZoom(stickyConfig.zoom);
            zoomRef.current = initial;
            setZoom(initial);
          }
        }

        const fetched = await window.cyberNotesAPI.getNoteById(noteId);
        if (mounted) {
          if (fetched) {
            setNote(fetched);
            setTitle(fetched.title);
            editorContentRef.current = fetched.content;
            if (editor) {
              loadStickyEditorContent(editor, fetched.content || '');
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
    if (loading) return;
    window.cyberNotesAPI.setStickyWindowChrome(noteId, hoveredColor || color, previewOpacity);
  }, [loading, noteId, hoveredColor, color, previewOpacity]);

  useEffect(() => {
    return () => {
      dragCleanupRef.current?.();
      dragCleanupRef.current = null;
      document.body.classList.remove('sticky-is-dragging');
      if (pasteNoticeTimerRef.current) clearTimeout(pasteNoticeTimerRef.current);
      if (attentionTimerRef.current) clearTimeout(attentionTimerRef.current);
      if (zoomPersistTimerRef.current) clearTimeout(zoomPersistTimerRef.current);
    };
  }, []);

  // Sync real-time updates from other windows
  useEffect(() => {
    const unregisterNoteUpdated = window.cyberNotesAPI.onNoteUpdated((updated) => {
      if (updated.id === noteId) {
        setTitle((prev) => (prev !== updated.title ? updated.title : prev));
        if (editor && editor.getHTML() !== updated.content) {
          loadStickyEditorContent(editor, updated.content || '');
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

    const unregisterAttention = window.cyberNotesAPI.onStickyAttention?.(() => {
      setIsAttention(true);
      if (attentionTimerRef.current) clearTimeout(attentionTimerRef.current);
      attentionTimerRef.current = setTimeout(() => {
        setIsAttention(false);
        attentionTimerRef.current = null;
      }, 1150);
    });

    return () => {
      unregisterNoteUpdated();
      unregisterNoteDeleted();
      unregisterLock();
      if (unregisterShieldDisable) unregisterShieldDisable();
      if (unregisterAttention) unregisterAttention();
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

  const handleCreateStickyNote = async () => {
    await window.cyberNotesAPI.createAndOpenStickyNote();
  };

  const handleStickyContextAction = async (action: StickyContextAction) => {
    if (!editor) return;

    try {
      switch (action) {
        case 'undo':
          editor.chain().focus().undo().run();
          break;
        case 'redo':
          editor.chain().focus().redo().run();
          break;
        case 'copy': {
          const { from, to } = editor.state.selection;
          if (from === to) break;
          const selectedText = editor.state.doc.textBetween(from, to, '\n');
          try {
            await navigator.clipboard.writeText(selectedText);
          } catch {
            editor.chain().focus().run();
            document.execCommand('copy');
          }
          break;
        }
        case 'cut': {
          const { from, to } = editor.state.selection;
          if (from === to) break;
          const selectedText = editor.state.doc.textBetween(from, to, '\n');
          try {
            await navigator.clipboard.writeText(selectedText);
            editor.chain().focus().deleteSelection().run();
          } catch {
            editor.chain().focus().run();
            document.execCommand('cut');
          }
          break;
        }
        case 'paste': {
          try {
            let imageFound = false;
            if (navigator.clipboard.read) {
              const clipboardItems = await navigator.clipboard.read();
              for (const item of clipboardItems) {
                const imageType = item.types.find(type => type.startsWith('image/'));
                if (!imageType) continue;
                imageFound = true;
                const imageBlob = await item.getType(imageType);
                const dataUrl = await optimizeStickyImage(imageBlob);
                editor.chain().focus().setImage({ src: dataUrl }).run();
                break;
              }
            }
            if (!imageFound) {
              const text = await navigator.clipboard.readText();
              if (text) editor.chain().focus().insertContent(text).run();
            }
          } catch (error) {
            if (error instanceof StickyImageTooLargeError) {
              showPasteNotice('too-large');
            } else {
              editor.chain().focus().run();
              if (!document.execCommand('paste')) showPasteNotice('failed');
            }
          }
          break;
        }
        case 'selectAll':
          editor.chain().focus().selectAll().run();
          break;
      }
    } finally {
      setContextMenu(null);
    }
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

  const endStickyWindowDrag = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  const beginStickyWindowDrag = useCallback((header: HTMLElement) => {
    endStickyWindowDrag();
    header.classList.add('is-dragging');
    document.body.classList.add('sticky-is-dragging');
    window.cyberNotesAPI.beginStickyDrag(noteId);

    const onMove = () => {
      window.cyberNotesAPI.dragStickyWindow(noteId);
    };
    window.addEventListener('pointermove', onMove);

    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove);
      header.classList.remove('is-dragging');
      document.body.classList.remove('sticky-is-dragging');
      window.cyberNotesAPI.endStickyDrag(noteId);
    };
  }, [noteId, endStickyWindowDrag]);

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, a, select, [data-no-drag]')) return;

    e.preventDefault();
    const header = e.currentTarget;
    const pointerId = e.pointerId;
    try {
      header.setPointerCapture(pointerId);
    } catch {
      // Capture can fail if the pointer is already gone.
    }
    beginStickyWindowDrag(header);

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      header.removeEventListener('pointerup', onUp);
      header.removeEventListener('pointercancel', onUp);
      endStickyWindowDrag();
    };
    header.addEventListener('pointerup', onUp);
    header.addEventListener('pointercancel', onUp);
  };

  const handleTitlePointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (e.button !== 0) return;
    const input = e.currentTarget;
    if (document.activeElement === input) return;

    e.preventDefault();
    e.stopPropagation();

    const header = input.closest('.sticky-note-header') as HTMLElement | null;
    const pointerId = e.pointerId;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let finished = false;
    const TITLE_HOLD_MS = 200;
    const TITLE_MOVE_PX = 8;

    const begin = () => {
      if (dragging || finished || !header) return;
      dragging = true;
      try {
        header.setPointerCapture(pointerId);
      } catch {
        // Capture can fail if the pointer is already gone.
      }
      beginStickyWindowDrag(header);
    };

    const holdTimer = window.setTimeout(begin, TITLE_HOLD_MS);

    const onMove = (event: PointerEvent) => {
      if (event.pointerId !== pointerId || dragging || finished) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if ((dx * dx) + (dy * dy) >= TITLE_MOVE_PX * TITLE_MOVE_PX) begin();
    };

    const onUp = (event: PointerEvent) => {
      if (event.pointerId !== pointerId || finished) return;
      finished = true;
      window.clearTimeout(holdTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (dragging) {
        endStickyWindowDrag();
        return;
      }
      input.focus();
      const len = input.value.length;
      try {
        input.setSelectionRange(len, len);
      } catch {
        // Some inputs reject selection changes while unmounted.
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const handleEditorBodyMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editor) return;
    if (e.button === 2) return;
    const target = e.target as HTMLElement;
    if (target.closest('.ProseMirror')) return;

    // El espacio vacío enfoca el documento sin intentar crear un caret fuera
    // de una posición válida del contenido.
    e.preventDefault();
    editor.chain().focus('end').run();
  };

  const handleEditorContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editor) return;
    e.preventDefault();
    e.stopPropagation();

    const margin = 8;
    const menuWidth = 184;
    const menuHeight = 252;
    setContextMenu({
      x: Math.min(e.clientX, Math.max(margin, window.innerWidth - menuWidth - margin)),
      y: Math.min(e.clientY, Math.max(margin, window.innerHeight - menuHeight - margin)),
    });
  };

  const handleEditorMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!editor || e.button !== 2) return;
    const { from, to } = editor.state.selection;
    if (from !== to) {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClick = () => {
      setShowColorPicker(false);
      setShowOpacityPicker(false);
      setHoveredColor(null);
      setHoveredOpacity(null);
      setContextMenu(null);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const hasEditorSelection = editor ? !editor.state.selection.empty : false;
  const hasEditorContent = editor ? editor.state.doc.content.size > 0 : false;

  if (loading) {
    return (
      <div
        className={`sticky-note-window${isAttention ? ' is-attention' : ''}`}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colorMeta.bgDark,
          color: colorMeta.accent,
          borderRadius: 0,
          border: 'none',
          '--sticky-border': colorMeta.border,
          '--sticky-attention': colorMeta.accent,
          '--sticky-attention-glow': colorMeta.accentGlow,
          overflow: 'hidden',
          isolation: 'isolate',
          position: 'relative',
        } as any}
      >
        <span style={{ fontSize: 13, letterSpacing: '0.05em' }}>{t.general.loading}</span>
      </div>
    );
  }

  return (
    <div
      className={`sticky-note-window${isAttention ? ' is-attention' : ''}`}
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: colorMeta.bgDark,
        color: '#f8fafc',
        borderRadius: 0,
        border: 'none',
        '--sticky-border': colorMeta.border,
        '--sticky-attention': colorMeta.accent,
        '--sticky-attention-glow': colorMeta.accentGlow,
        overflow: 'hidden',
        isolation: 'isolate',
        position: 'relative',
        transition: 'background 0.2s ease, border-color 0.25s ease',
        userSelect: 'none',
      } as any}
    >
      {/* ── Barra de Título / Arrastre (Sticky Header) ── */}
      <div
        className="sticky-note-header"
        onPointerDown={handleHeaderPointerDown}
        style={{
          height: 38,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          background: colorMeta.headerBg,
          borderBottom: `1px solid ${colorMeta.border}`,
          transition: 'background 0.2s ease, border-color 0.25s ease',
          gap: 6,
        }}
      >
        {/* Grip y título */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
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
              transition: 'color 0.15s ease, opacity 0.15s ease',
            }}
          >
            <GripVertical size={12} strokeWidth={2} />
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            onPointerDown={handleTitlePointerDown}
            placeholder={t.editor.placeholderTitle}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#f8fafc',
              fontSize: 13,
              fontWeight: 600,
              flex: 1,
              minWidth: 0,
              letterSpacing: '-0.01em',
            }}
          />
        </div>

        {/* Acciones de la barra superior */}
        <div
          data-no-drag
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexShrink: 0,
          }}
        >
          {/* New sticky note */}
          <Tooltip label={t.editor.stickyNew} placement="bottom">
            <button
              className="sticky-note-button"
              type="button"
              onClick={handleCreateStickyNote}
              aria-label={t.editor.stickyNew}
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
              <Plus size={14} />
            </button>
          </Tooltip>

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
                data-no-drag
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
                <Blend size={13} />
              </button>
            </Tooltip>

            {showOpacityPicker && (
              <div
                data-no-drag
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
              <Eye size={13} />
            </button>
          </Tooltip>

          {/* Convert back to normal note */}
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
              <SquareArrowDownLeft size={14} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Editor Body ── */}
      <div
        ref={editorScrollRef}
        onMouseDown={handleEditorBodyMouseDown}
        onMouseDownCapture={handleEditorMouseDownCapture}
        onContextMenu={handleEditorContextMenu}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '10px 10px',
          userSelect: 'text',
          fontSize: 13.5 * zoom,
          lineHeight: 1.55,
          color: '#f1f5f9',
          outline: 'none',
        }}
      >
        <EditorContent editor={editor} style={{ minHeight: '100%' }} />
      </div>

      {contextMenu && editor && (
        <div
          className="sticky-context-menu"
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            type="button"
            role="menuitem"
            disabled={!editor.can().undo()}
            onMouseDown={() => { void handleStickyContextAction('undo'); }}
          >
            <Undo2 size={13} />
            <span>{t.editor.stickyUndo}</span>
            <kbd>Ctrl+Z</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!editor.can().redo()}
            onMouseDown={() => { void handleStickyContextAction('redo'); }}
          >
            <Redo2 size={13} />
            <span>{t.editor.stickyRedo}</span>
            <kbd>Ctrl+Y</kbd>
          </button>
          <div className="sticky-context-separator" />
          <button
            type="button"
            role="menuitem"
            disabled={!hasEditorSelection}
            onMouseDown={() => { void handleStickyContextAction('cut'); }}
          >
            <Scissors size={13} />
            <span>{t.editor.stickyCut}</span>
            <kbd>Ctrl+X</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!hasEditorSelection}
            onMouseDown={() => { void handleStickyContextAction('copy'); }}
          >
            <Copy size={13} />
            <span>{t.editor.stickyCopy}</span>
            <kbd>Ctrl+C</kbd>
          </button>
          <button
            type="button"
            role="menuitem"
            onMouseDown={() => { void handleStickyContextAction('paste'); }}
          >
            <Clipboard size={13} />
            <span>{t.editor.stickyPaste}</span>
            <kbd>Ctrl+V</kbd>
          </button>
          <div className="sticky-context-separator" />
          <button
            type="button"
            role="menuitem"
            disabled={!hasEditorContent}
            onMouseDown={() => { void handleStickyContextAction('selectAll'); }}
          >
            <CheckSquare size={13} />
            <span>{t.editor.stickySelectAll}</span>
            <kbd>Ctrl+A</kbd>
          </button>
          <div className="sticky-context-separator" />
          <button
            type="button"
            role="menuitem"
            onMouseDown={() => { setContextMenu(null); setShowDeleteConfirm(true); }}
            style={{ color: '#fca5a5' }}
          >
            <Trash2 size={13} style={{ color: '#f87171' }} />
            <span>{t.general.delete}</span>
          </button>
        </div>
      )}

      {pasteNotice && (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 42,
            zIndex: 105,
            padding: '7px 10px',
            borderRadius: 6,
            border: `1px solid ${colorMeta.border}`,
            background: 'rgba(10, 10, 16, 0.92)',
            color: '#f8fafc',
            fontSize: 11,
            textAlign: 'center',
            boxShadow: '0 8px 20px rgba(0,0,0,0.32)',
            pointerEvents: 'none',
          }}
        >
          {pasteNotice === 'too-large' ? t.editor.stickyImageTooLarge : t.editor.stickyImagePasteError}
        </div>
      )}

      {/* ── Mini Toolbar Inferior ── */}
      {editor && (
        <div
          className="sticky-note-footer"
          style={{
            height: 34,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 8px',
            background: '#0a0a10',
            borderTop: `1px solid rgba(255, 255, 255, 0.07)`,
            gap: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <StickyFooterBtn
              label={t.editor.stickyUndo}
              onClick={() => editor.chain().focus().undo().run()}
              disabled={!editor.can().undo()}
            >
              <Undo2 size={12} />
            </StickyFooterBtn>
            <StickyFooterBtn
              label={t.editor.stickyRedo}
              onClick={() => editor.chain().focus().redo().run()}
              disabled={!editor.can().redo()}
            >
              <Redo2 size={12} />
            </StickyFooterBtn>
            <div style={{ width: 1, height: 15, background: 'rgba(255, 255, 255, 0.1)', margin: '0 2px' }} />
            <StickyFooterBtn
              label={t.editor.bold}
              onClick={() => editor.chain().focus().toggleBold().run()}
              active={editor.isActive('bold')}
              accent={colorMeta.accent}
              accentGlow={colorMeta.accentGlow}
            >
              <Bold size={12} />
            </StickyFooterBtn>
            <StickyFooterBtn
              label={t.editor.italic}
              onClick={() => editor.chain().focus().toggleItalic().run()}
              active={editor.isActive('italic')}
              accent={colorMeta.accent}
              accentGlow={colorMeta.accentGlow}
            >
              <Italic size={12} />
            </StickyFooterBtn>
            <StickyFooterBtn
              label={t.editor.underline}
              onClick={() => editor.chain().focus().toggleUnderline().run()}
              active={editor.isActive('underline')}
              accent={colorMeta.accent}
              accentGlow={colorMeta.accentGlow}
            >
              <UnderlineIcon size={12} />
            </StickyFooterBtn>
            <StickyFooterBtn
              label={t.editor.strike}
              onClick={() => editor.chain().focus().toggleStrike().run()}
              active={editor.isActive('strike')}
              accent={colorMeta.accent}
              accentGlow={colorMeta.accentGlow}
            >
              <Strikethrough size={12} />
            </StickyFooterBtn>
            <StickyFooterBtn
              label={t.editor.highlight}
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              active={editor.isActive('highlight')}
              accent={colorMeta.accent}
              accentGlow={colorMeta.accentGlow}
            >
              <Highlighter size={12} />
            </StickyFooterBtn>
            <div style={{ width: 1, height: 15, background: 'rgba(255, 255, 255, 0.1)', margin: '0 2px' }} />
            <WordFontFamilySelect editor={editor} language={language} compact tooltipSide="top" dropUp />
            <WordFontSizeSelect editor={editor} language={language} compact tooltipSide="top" dropUp defaultSize={Math.round(13.5 * zoom)} />
            <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.1)', margin: '0 2px' }} />
            <StickyFooterBtn
              label={t.editor.bulletList}
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              active={editor.isActive('bulletList')}
              accent={colorMeta.accent}
              accentGlow={colorMeta.accentGlow}
            >
              <List size={12} />
            </StickyFooterBtn>
            <StickyFooterBtn
              label={t.editor.orderedList}
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              active={editor.isActive('orderedList')}
              accent={colorMeta.accent}
              accentGlow={colorMeta.accentGlow}
            >
              <ListOrdered size={12} />
            </StickyFooterBtn>
            <StickyFooterBtn
              label={t.editor.codeBlock}
              onClick={() => editor.chain().focus().toggleCodeBlock().run()}
              active={editor.isActive('codeBlock')}
              accent={colorMeta.accent}
              accentGlow={colorMeta.accentGlow}
            >
              <Code size={12} />
            </StickyFooterBtn>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 1, height: 14, background: 'rgba(255, 255, 255, 0.1)', margin: '0 2px' }} />
            <Tooltip
              label={saveStatus === 'saving' ? t.editor.saving : saveStatus === 'error' ? t.editor.saveError : t.editor.saved}
              placement="top"
              delay={STICKY_FOOTER_TIP_DELAY}
            >
              <span
                className={`sticky-save-led${saveStatus === 'saving' ? ' is-saving' : ''}`}
                aria-label={saveStatus === 'saving' ? t.editor.saving : saveStatus === 'error' ? t.editor.saveError : t.editor.saved}
                style={{
                  background: saveStatus === 'error'
                    ? 'radial-gradient(circle at 35% 35%, #ffffff 0%, #ef4444 46%, rgba(0, 0, 0, 0.55) 100%)'
                    : saveStatus === 'saving'
                      ? 'radial-gradient(circle at 35% 35%, #ffffff 0%, #f59e0b 46%, rgba(0, 0, 0, 0.55) 100%)'
                      : `radial-gradient(circle at 35% 35%, #ffffff 0%, ${colorMeta.accent} 46%, rgba(0, 0, 0, 0.55) 100%)`,
                  boxShadow: saveStatus === 'error'
                    ? '0 0 8px rgba(239, 68, 68, 0.7)'
                    : saveStatus === 'saving'
                      ? '0 0 8px rgba(245, 158, 11, 0.7)'
                      : `0 0 8px ${colorMeta.accentGlow}`,
                }}
              />
            </Tooltip>
            <StickyFooterBtn
              label={t.noteList.moveToTrash}
              onClick={() => setShowDeleteConfirm(true)}
              danger
            >
              <Trash2 size={12} />
            </StickyFooterBtn>
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

      <GlobalErrorToast language={language} />
    </div>
  );
}
