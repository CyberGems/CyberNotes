import { useEffect, useRef, useCallback, useState, useLayoutEffect, type CSSProperties, type DragEvent as ReactDragEvent } from 'react';
import { createPortal } from 'react-dom';
import { useInputContextMenu } from '../hooks/useInputContextMenu';
import { motion, AnimatePresence } from 'motion/react';
import { useEditor, EditorContent, Editor, BubbleMenu } from '@tiptap/react';
import { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import TextStyle from '@tiptap/extension-text-style';
import { Note, Folder } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import { playSynthSound } from '../utils/audio';
import { extractPreview, extractThumb } from '../utils/notes';
import { tabHydrationStart, tabHydrationEnd } from '../utils/tabPerf';
import Tooltip from './Tooltip';
import WelcomeGreeting from './WelcomeGreeting';
import { EnterGlyph, modalCardMotion, modalOverlayMotion, modalOverlayStyle, useModalKeys } from './ModalActions';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, List, ListOrdered, Link as LinkIcon,
  Image as ImageIcon, Highlighter, Quote, Minus, Code,
  Plus, Star, AlignLeft, AlignCenter, AlignRight, Braces, PanelLeft,
  Undo, Redo, Save, Upload, FileDown, FileText, Printer, Globe, X, ExternalLink, Pencil, Unlink, Scissors, Copy, Clipboard,
   CheckSquare, Trash2, RemoveFormatting, BookPlus, AppWindow, RotateCcw,
   NotebookText, Keyboard, ArrowRight, ALargeSmall
 } from 'lucide-react';
import { FILTER_COLORS } from './FolderIcon';

export interface NoteExportActions {
  markdown: () => void;
  html: () => void;
  pdf: () => Promise<void>;
  text: () => void;
  print: () => Promise<void>;
}

interface Props {
  language: Language;
  note: Note | null;
  readOnly?: boolean;
  /** Cargando content de otra nota: no mostrar bienvenida; overlay / preloader. */
  isNoteLoading?: boolean;
  onSave: (note: Note) => void | Promise<void>;
  onCreateNote: () => void;
  layoutMode: number;
  onToggleLayout: () => void;
  showLineCounter?: boolean;
  showLineGutter?: boolean;
  onShowLineGutterChange?: (v: boolean) => void;
  showWordCounter?: boolean;
  autosaveEnabled?: boolean;
  autoUnlockCapsLock?: boolean;
  autoUnlockCapsLockTimeout?: number;
  onAutoUnlockCapsLockChange?: (v: boolean) => void;
  capsLockSound?: string;
  capsLockSoundScope?: string;
  /** Estado Caps Lock → TitleBar (indicador visible) */
  onCapsStatusChange?: (status: { active: boolean; timeLeft: number }) => void;
  uiScale?: number;
  onScaleChange?: (scale: number) => void;
  openNoteIds?: string[];
  notes?: Note[];
  folders?: Folder[];
  onSelectNote?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  onCloseOtherTabs?: (keepId: string) => void;
  onCloseTabsToRight?: (fromId: string) => void;
  onCloseAllTabs?: () => void;
  onReopenClosedTab?: () => void;
  canReopenClosedTab?: boolean;
  onReorderTabs?: (fromId: string, toId: string, edge: 'before' | 'after') => void;
  onRegisterExportActions?: (actions: NoteExportActions | null) => void;
  draftCache?: Record<string, { title: string; content: string }>;
  onEditDraft?: (id: string, title: string, content: string) => void | Promise<void>;
  onDiscardDraft?: (id: string) => void;
  onRegisterDraftFlush?: (flush: (() => Promise<void>) | null) => void;
  draftRecoveryNonce?: number;
  tabsWidthMode?: 'normal' | 'wide';
  showMinimap?: boolean;
  onShowMinimapChange?: (v: boolean) => void;
  openStickyIds?: string[];
}

// Extensión personalizada para imagen con soporte de tamaño y alineación
const CustomImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: '100%',
        renderHTML: attributes => ({
          style: `width: ${attributes.width}; height: auto; display: block; margin-left: ${attributes.align === 'left' ? '0' : attributes.align === 'right' ? 'auto' : 'auto'}; margin-right: ${attributes.align === 'right' ? '0' : attributes.align === 'left' ? 'auto' : 'auto'};`,
        }),
        parseHTML: element => element.style.width,
      },
      align: {
        default: 'center',
        renderHTML: attributes => ({
          'data-align': attributes.align,
        }),
        parseHTML: element => element.getAttribute('data-align'),
      },
    };
  },
});

/**
 * Marca de tamaño de letra estilo Word (span con font-size). TextStyle no la
 * trae por defecto, así que se extiende con los comandos estándar set/unset.
 * Se persiste sola en el HTML y el minimapa la hereda al clonar el DOM.
 */
export const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => (element as HTMLElement).style.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

/**
 * Carga contenido en TipTap sin contaminar el historial de Undo/Redo.
 * Sin esto, Ctrl+Z / Deshacer puede restaurar el contenido de otra nota.
 */
function loadEditorContent(editor: Editor, raw: string) {  let content: string | object = raw || '';
  if (typeof content === 'string' && content.trim().startsWith('{')) {
    try {
      content = JSON.parse(content);
    } catch {
      /* HTML / texto plano */
    }
  }

  editor.chain().setMeta('addToHistory', false).setContent(content, false).run();

  // Reinicia el estado de plugins (incluye history vacío) conservando el doc actual
  const fresh = EditorState.create({
    doc: editor.state.doc,
    plugins: editor.state.plugins,
  });
  editor.view.updateState(fresh);
}

const ToolbarBtn = ({
  onClick, active = false, title, children, disabled = false,
}: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean }) => (
  <Tooltip label={title} placement="bottom">
    <button
      onMouseDown={(e) => e.preventDefault()} // CRÍTICO: Previene pérdida de foco
      onClick={onClick}
      disabled={disabled}
      className={`btn-icon toolbar-btn${active ? ' is-active' : ''}`}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      {children}
    </button>
  </Tooltip>
);

/** Misma huella táctil que ToolbarBtn (barra de formato del editor). */
const noteActionBtnStyle = (active: boolean, opts?: { warn?: boolean }): CSSProperties => ({
  background: active ? (opts?.warn ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent-dim)') : 'transparent',
  color: active
    ? (opts?.warn ? '#fca5a5' : 'var(--accent-light)')
    : 'var(--text-muted)',
  border: active
    ? (opts?.warn ? '1px solid rgba(239, 68, 68, 0.45)' : '1px solid var(--accent)')
    : '1px solid transparent',
  borderRadius: 6,
  padding: '6px 8px',
  minWidth: 32,
  minHeight: 32,
  boxSizing: 'border-box',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'color 0.2s, border 0.2s, background 0.2s',
  outline: 'none',
  position: 'relative',
});

const TAB_DRAG_MIME = 'application/x-cybernotes-tab';

/** Tamaños del desplegable de letra (px), estilo Word. Compartido con stickies. */
export const FONT_SIZE_OPTIONS = ['12', '14', '16', '18', '20', '24', '28', '32'];

function tabDropEdge(e: ReactDragEvent<HTMLElement>): 'before' | 'after' {
  const rect = e.currentTarget.getBoundingClientRect();
  return e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
}

export default function NoteEditor({ 
  language,
  note,
  readOnly = false,
  isNoteLoading = false,
  onSave, 
  onCreateNote, 
  layoutMode, 
  onToggleLayout, 
  showLineCounter, 
  showLineGutter = true,
  onShowLineGutterChange,
  showWordCounter = false,
  autosaveEnabled = true,
  autoUnlockCapsLock = false,
  autoUnlockCapsLockTimeout = 8,
  onAutoUnlockCapsLockChange,
  capsLockSound = 'cyber-beep',
  capsLockSoundScope = 'app',
  onCapsStatusChange,
  uiScale = 1.0,
  onScaleChange,
  openNoteIds = [],
  notes = [],
  folders = [],
  onSelectNote,
  onCloseTab,
  onCloseOtherTabs,
  onCloseTabsToRight,
  onCloseAllTabs,
  onReopenClosedTab,
  canReopenClosedTab = false,
  onReorderTabs,
  onRegisterExportActions,
  draftCache = {},
  onEditDraft,
  onDiscardDraft,
  onRegisterDraftFlush,
  draftRecoveryNonce = 0,
  tabsWidthMode = 'normal',
  showMinimap = false,
  onShowMinimapChange,
  openStickyIds = [],
}: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNoteRef = useRef<Note | null>(note);
  const hydratedNoteIdRef = useRef<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const isSelectionChangingRef = useRef(false);
  const lastContextMenuTargetRef = useRef<'title' | 'editor'>('editor');
  const lastContextMenuTimeRef = useRef(0);
  const isDirtyRef = useRef(false);
  const tabStripRef = useRef<HTMLDivElement>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const draggingTabIdRef = useRef<string | null>(null);
  const [tabDropHint, setTabDropHint] = useState<{ id: string; edge: 'before' | 'after' } | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  const clearTabDrag = useCallback(() => {
    draggingTabIdRef.current = null;
    setDraggingTabId(null);
    setTabDropHint(null);
    document.documentElement.classList.remove('tab-dragging');
  }, []);

  useEffect(() => {
    if (!tabContextMenu) return;
    const closeMenu = () => setTabContextMenu(null);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMenu();
      }
    };
    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('resize', closeMenu);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('resize', closeMenu);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [tabContextMenu]);

  useEffect(() => {
    const allowDrop = (e: DragEvent) => {
      if (!draggingTabIdRef.current) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    };
    document.addEventListener('dragenter', allowDrop);
    document.addEventListener('dragover', allowDrop);
    return () => {
      document.removeEventListener('dragenter', allowDrop);
      document.removeEventListener('dragover', allowDrop);
      document.documentElement.classList.remove('tab-dragging');
    };
  }, []);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);

  // ─── Minimap state ──────────────────────────────────────────────
  const minimapIndicatorRef = useRef<HTMLDivElement>(null);
  const minimapContentRef = useRef<HTMLDivElement>(null);
  const minimapPanRef = useRef<HTMLDivElement>(null);
  const showMinimapRef = useRef(showMinimap);
  showMinimapRef.current = showMinimap; // mantener actualizado para callbacks estables
  const editorRef = useRef<any>(null); // inicializado con null; editor se declara más abajo
  const [minimapScale, setMinimapScale] = useState(0.075);
  const minimapScaleRef = useRef(0.075);
  const [minimapMenu, setMinimapMenu] = useState<{ x: number; y: number } | null>(null);
  const [gutterMenu, setGutterMenu] = useState<{ x: number; y: number } | null>(null);
  const MINIMAP_WIDTH = 96;

  // Cerrar el menú contextual del minimapa al hacer click en cualquier sitio
  useEffect(() => {
    if (!minimapMenu) return;
    const close = () => setMinimapMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [minimapMenu]);

  // Cerrar el menú contextual de la barra de líneas al hacer click en cualquier sitio
  useEffect(() => {
    if (!gutterMenu) return;
    const close = () => setGutterMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [gutterMenu]);

  const openGutterMenu = (clientX: number, clientY: number) => {
    const MENU_WIDTH = 180;
    const MENU_HEIGHT = 48;
    const margin = 10;
    let x = clientX;
    let y = clientY;
    if (x + MENU_WIDTH + margin > window.innerWidth) {
      x = window.innerWidth - MENU_WIDTH - margin;
    }
    if (y + MENU_HEIGHT + margin > window.innerHeight) {
      y = window.innerHeight - MENU_HEIGHT - margin;
    }
    setGutterMenu({ x: Math.max(margin, x), y: Math.max(margin, y) });
  };

  // Actualizar indicador vía DOM directo (sin React → sin re-renders en scroll)
  const updateMinimapIndicator = useCallback(() => {
    const el = scrollContainerRef.current;
    const indicator = minimapIndicatorRef.current;
    const mm = minimapRef.current;
    const content = minimapContentRef.current;
    const panEl = minimapPanRef.current;
    if (!el || !indicator || !mm || !content) return;

    const total = el.scrollHeight;
    const view = el.clientHeight;
    const top = el.scrollTop;
    if (total <= 0) {
      indicator.style.display = 'none';
      return;
    }

    const scale = minimapScaleRef.current || 0;
    const scaledH = content.offsetHeight * scale;
    const mmH = mm.clientHeight;
    const maxScroll = Math.max(0, total - view);
    const scrollRatio = maxScroll > 0 ? top / maxScroll : 0;

    // Docs largos: desplazar el preview para que coincida con el scroll del editor
    if (panEl) {
      const pan = scaledH > mmH && maxScroll > 0 ? scrollRatio * (scaledH - mmH) : 0;
      panEl.style.transform = `translateY(${-pan}px)`;
    }

    const mapH = scaledH > 0 ? Math.min(Math.max(scaledH, 8), mmH) : mmH;
    const indH = Math.max(8, (view / total) * mapH);
    indicator.style.display = 'block';
    indicator.style.top = `${scrollRatio * Math.max(0, mapH - indH)}px`;
    indicator.style.height = `${indH}px`;
  }, []);

  // Sincronizar HTML del minimap desde el DOM renderizado del editor (más fiel que getHTML())
  const minimapSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncMinimapHtml = useCallback((immediate = false) => {
    if (!showMinimapRef.current) return;
    const run = () => {
      requestAnimationFrame(() => {
        const target = minimapContentRef.current;
        const ed = editorRef.current;
        if (!target || !ed?.view?.dom) return;

        // Clonar el DOM pintado: mismos nodos, estilos inline de imágenes, etc.
        target.innerHTML = ed.view.dom.innerHTML;

        // Quitar ruido visual de edición (placeholder, selección)
        target.querySelectorAll('.ProseMirror-selectednode').forEach((n) => {
          n.classList.remove('ProseMirror-selectednode');
        });
        target.querySelectorAll('[data-placeholder]').forEach((n) => {
          n.removeAttribute('data-placeholder');
          n.classList.remove('is-editor-empty', 'is-empty');
        });

        updateMinimapIndicator();
      });
    };
    if (immediate) {
      if (minimapSyncTimer.current) clearTimeout(minimapSyncTimer.current);
      minimapSyncTimer.current = null;
      run();
      return;
    }
    if (minimapSyncTimer.current) clearTimeout(minimapSyncTimer.current);
    minimapSyncTimer.current = setTimeout(run, 150);
  }, [updateMinimapIndicator]);

  // Escala = ancho del ProseMirror real / ancho del minimapa (mismo wrapping que el documento)
  useEffect(() => {
    if (!showMinimap) return;
    const updateScale = () => {
      const prose = editorRef.current?.view?.dom as HTMLElement | undefined;
      if (!prose) return;
      const editorWidth = prose.offsetWidth;
      if (editorWidth > 0) {
        const next = MINIMAP_WIDTH / editorWidth;
        minimapScaleRef.current = next;
        setMinimapScale(next);
        requestAnimationFrame(updateMinimapIndicator);
      }
    };
    updateScale();
    const prose = editorRef.current?.view?.dom as HTMLElement | undefined;
    const observer = new ResizeObserver(updateScale);
    if (prose) observer.observe(prose);
    if (scrollContainerRef.current) observer.observe(scrollContainerRef.current);
    return () => observer.disconnect();
  }, [showMinimap, note?.id, showLineGutter, updateMinimapIndicator]);

  // Poblar minimap solo al activarlo (el cambio de nota lo maneja syncMinimapHtml)
  useEffect(() => {
    if (!showMinimap) return;
    syncMinimapHtml(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMinimap, showLineGutter]);

  // Scroll del editor → actualizar indicador vía DOM (sin React)
  useEffect(() => {
    if (!showMinimap) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    updateMinimapIndicator();
    el.addEventListener('scroll', updateMinimapIndicator, { passive: true });
    return () => el.removeEventListener('scroll', updateMinimapIndicator);
  }, [showMinimap, note?.id, updateMinimapIndicator]);

  // ─── Minimap: arrastre del indicador de viewport ──────────────
  const isDraggingMinimap = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const scrollEditorToMinimapY = (clientY: number) => {
    const el = scrollContainerRef.current;
    const mm = minimapRef.current;
    const content = minimapContentRef.current;
    if (!el || !mm) return;
    const rect = mm.getBoundingClientRect();
    const scale = minimapScaleRef.current || 0;
    const scaledH = content ? content.offsetHeight * scale : rect.height;
    const mapH = scaledH > 0 ? Math.min(Math.max(scaledH, 8), rect.height) : rect.height;
    const y = clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, y / mapH));
    const maxScroll = el.scrollHeight - el.clientHeight;
    el.scrollTop = ratio * maxScroll;
  };

  const handleMinimapClick = (e: React.MouseEvent) => {
    scrollEditorToMinimapY(e.clientY);
  };

  const handleMinimapIndicatorMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingMinimap.current = true;
    setIsDragging(true);
    scrollEditorToMinimapY(e.clientY);

    const onMove = (ev: MouseEvent) => {
      if (!isDraggingMinimap.current) return;
      scrollEditorToMinimapY(ev.clientY);
    };
    const onUp = () => {
      isDraggingMinimap.current = false;
      setIsDragging(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Rueda en tabs + rebote suave en los extremos (rubber-band)
  useLayoutEffect(() => {
    const el = tabStripRef.current;
    if (!el) return;

    const MAX_PULL = 12;
    const RESISTANCE = 0.08;
    let offset = 0;
    let settleTimer: ReturnType<typeof setTimeout> | null = null;

    const applyOffset = (value: number, animate: boolean) => {
      offset = value;
      el.style.transition = animate ? 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
      el.style.transform = value === 0 ? '' : `translateX(${value}px)`;
    };

    const settle = () => {
      if (offset === 0) return;
      applyOffset(0, true);
    };

    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;

      e.preventDefault();

      const maxScroll = el.scrollWidth - el.clientWidth;
      const atStart = el.scrollLeft <= 0.5;
      const atEnd = el.scrollLeft >= maxScroll - 0.5;
      // Rueda invertida: deltaY>0 → hacia el inicio; deltaY<0 → hacia el final
      const towardStart = e.deltaY > 0;
      const towardEnd = e.deltaY < 0;

      if (atStart && towardStart) {
        const next = Math.min(MAX_PULL, offset + e.deltaY * RESISTANCE);
        applyOffset(next, false);
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, 120);
        return;
      }

      if (atEnd && towardEnd) {
        const next = Math.max(-MAX_PULL, offset + e.deltaY * RESISTANCE);
        applyOffset(next, false);
        if (settleTimer) clearTimeout(settleTimer);
        settleTimer = setTimeout(settle, 120);
        return;
      }

      // Scroll normal: soltar rebote si había
      if (offset !== 0) applyOffset(0, true);
      el.scrollLeft -= e.deltaY;
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (settleTimer) clearTimeout(settleTimer);
      el.style.transition = '';
      el.style.transform = '';
    };
  }, [openNoteIds]);

  // Llevar la pestaña activa a la vista solo cuando está fuera de vista.
  // Centrado manual e instantáneo: sin animación smooth que compita con la
  // hidratación del editor, y sin mover contenedores ancestros (scrollIntoView
  // los arrastra). Si la pestaña ya se ve completa, no se toca el scroll.
  useEffect(() => {
    if (!note?.id) return;
    const strip = tabStripRef.current;
    if (!strip) return;
    if (strip.scrollWidth <= strip.clientWidth + 1) return;
    const tab = strip.querySelector(`[data-note-id="${note.id}"]`) as HTMLElement | null;
    if (!tab) return;
    const stripRect = strip.getBoundingClientRect();
    const tabRect = tab.getBoundingClientRect();
    const MARGIN = 8;
    const fullyVisible =
      tabRect.left >= stripRect.left - MARGIN && tabRect.right <= stripRect.right + MARGIN;
    if (fullyVisible) return;
    const delta = tabRect.left + tabRect.width / 2 - (stripRect.left + stripRect.width / 2);
    strip.scrollLeft += delta;
  }, [note?.id]);

  // Sincronizar ref con cada render para que scheduleAutoSave siempre tenga la note actual
  const [pinned, setPinned] = useState(note?.pinned === 1);
  const isFloatingNote = !!(note?.id && openStickyIds.includes(note.id));
  const identityColor = pinned && isFloatingNote
    ? null
    : pinned
      ? FILTER_COLORS.favorites
      : isFloatingNote
        ? FILTER_COLORS.sticky
        : null;
  const identityBorder = pinned && isFloatingNote
    ? '1px solid color-mix(in srgb, #f59e0b 55%, #22d3ee)'
    : pinned
      ? '1px solid rgba(245, 158, 11, 0.45)'
      : isFloatingNote
        ? '1px solid rgba(34, 211, 238, 0.45)'
        : '1px solid rgba(255, 255, 255, 0.05)';
  const identityGlow = pinned && isFloatingNote
    ? '0 0 12px rgba(245, 158, 11, 0.18), 0 0 10px rgba(34, 211, 238, 0.14), inset 0 1px 3px rgba(0,0,0,0.2)'
    : pinned
      ? '0 0 12px rgba(245, 158, 11, 0.22), inset 0 1px 3px rgba(0,0,0,0.2)'
      : isFloatingNote
        ? '0 0 12px rgba(34, 211, 238, 0.22), inset 0 1px 3px rgba(0,0,0,0.2)'
        : 'inset 0 1px 3px rgba(0,0,0,0.2)';
  const [isRaw, setIsRaw] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    linkHref?: string;
    suggestions?: string[];
    misspelledWord?: string;
    target?: 'title' | 'editor';
    imageSrc?: string | null;
    hasSelection: boolean;
    hasContent: boolean;
    canPaste: boolean;
    canUndo: boolean;
    canRedo: boolean;
  } | null>(null);
  const [showFontSizeMenu, setShowFontSizeMenu] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const linkInputMenu = useInputContextMenu(language);
  const [editLinkData, setEditLinkData] = useState<{ href: string } | null>(null);
  const [lineInfo, setLineInfo] = useState({ line: 1, col: 1, total: 1 });
  const [textMetrics, setTextMetrics] = useState({ words: 0, chars: 0, readingTime: 0 });
  const [localTitle, setLocalTitle] = useState(note?.title || '');
  const localTitleRef = useRef(localTitle);

  const updateTitle = (newTitle: string) => {
    setLocalTitle(newTitle);
    localTitleRef.current = newTitle;
    const current = currentNoteRef.current;
    if (current && hydratedNoteIdRef.current === current.id) {
      const updated = { ...current, title: newTitle };
      currentNoteRef.current = updated;
      if (autosaveEnabled) {
        onSave(updated);
      } else {
        setHasUnsavedChanges(true);
        onEditDraft?.(current.id, newTitle, editor?.getHTML() || '');
      }
    }
  };
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showLeaveEditorWarning, setShowLeaveEditorWarning] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isCapsLockActive, setIsCapsLockActive] = useState(false);
  const [isNumLockActive, setIsNumLockActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [capsToast, setCapsToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevCapsActiveRef = useRef<boolean | null>(null);
  const capsAutoUnlockPendingRef = useRef(false);
  const prevCapsActiveForSoundRef = useRef<boolean | null>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Refs sincronizados en cada render: garantizan valores frescos dentro de los
  // callbacks de TipTap (onBlur) evitando cualquier cierre obsoleto (stale closure).
  const autosaveEnabledRef = useRef(autosaveEnabled);
  autosaveEnabledRef.current = autosaveEnabled;
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  // 1. Initial check on startup / mount
  useEffect(() => {
    const checkInitialCaps = async () => {
      if (window.cyberNotesAPI?.checkCapsLock || window.cyberNotesAPI?.checkNumLock) {
        const [isActive, isNumActive] = await Promise.all([
          window.cyberNotesAPI.checkCapsLock?.() ?? Promise.resolve(false),
          window.cyberNotesAPI.checkNumLock?.() ?? Promise.resolve(false),
        ]);
        setIsNumLockActive(isNumActive);
        if (isActive) {
          setIsCapsLockActive(true);
          prevCapsActiveRef.current = true;
          if (autoUnlockCapsLock) {
            setTimeLeft(autoUnlockCapsLockTimeout);
          }
        } else {
          prevCapsActiveRef.current = false;
        }
      }
    };
    checkInitialCaps();
  }, [autoUnlockCapsLock, autoUnlockCapsLockTimeout]);

  // 2. Keyboard event listeners to capture physical typing updates
  useEffect(() => {
    const handleKeyboardActivity = (e: KeyboardEvent) => {
      const capActive = e.getModifierState && e.getModifierState("CapsLock");
      const numActive = e.getModifierState && e.getModifierState("NumLock");
      setIsCapsLockActive(!!capActive);
      setIsNumLockActive(!!numActive);

      if (autoUnlockCapsLock && capActive) {
        setTimeLeft(autoUnlockCapsLockTimeout);
      } else {
        setTimeLeft(0);
      }
    };

    window.addEventListener('keydown', handleKeyboardActivity, true);
    window.addEventListener('keyup', handleKeyboardActivity, true);

    return () => {
      window.removeEventListener('keydown', handleKeyboardActivity, true);
      window.removeEventListener('keyup', handleKeyboardActivity, true);
    };
  }, [autoUnlockCapsLock, autoUnlockCapsLockTimeout]);

  // 3. Toast solo si nosotros apagamos Caps (no si el usuario lo hace a mano)
  useEffect(() => {
    if (prevCapsActiveRef.current === null) {
      prevCapsActiveRef.current = isCapsLockActive;
      return;
    }

    if (prevCapsActiveRef.current !== isCapsLockActive) {
      if (!isCapsLockActive && capsAutoUnlockPendingRef.current) {
        capsAutoUnlockPendingRef.current = false;
        setCapsToast(TRANSLATIONS[language].editor.capsLockToastAuto);
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = setTimeout(() => setCapsToast(null), 2200);
      } else if (!isCapsLockActive) {
        // Apagado manual: no toast
        capsAutoUnlockPendingRef.current = false;
      }
      prevCapsActiveRef.current = isCapsLockActive;
    }
  }, [isCapsLockActive, language]);

  // Reportar estado Caps Lock a TitleBar
  useEffect(() => {
    onCapsStatusChange?.({ active: isCapsLockActive, timeLeft });
  }, [isCapsLockActive, timeLeft, onCapsStatusChange]);

  // Limpiar indicador al desmontar
  useEffect(() => {
    return () => onCapsStatusChange?.({ active: false, timeLeft: 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 3.5 Isolated sound trigger for Caps Lock state changes
  useEffect(() => {
    if (prevCapsActiveForSoundRef.current === null) {
      prevCapsActiveForSoundRef.current = isCapsLockActive;
      return;
    }

    if (prevCapsActiveForSoundRef.current !== isCapsLockActive) {
      if (capsLockSoundScope === 'app' && capsLockSound && capsLockSound !== 'off') {
        playSynthSound(capsLockSound);
      }
      prevCapsActiveForSoundRef.current = isCapsLockActive;
    }
  }, [isCapsLockActive, capsLockSound, capsLockSoundScope]);

  // 3.7 Global Caps Lock from background worker: keep UI + timer in sync, play sound
  useEffect(() => {
    if (capsLockSoundScope !== 'global') return;
    if (!window.cyberNotesAPI?.onGlobalCapsLockChanged) return;

    const unsubscribe = window.cyberNotesAPI.onGlobalCapsLockChanged((active) => {
      setIsCapsLockActive(!!active);
      if (active && autoUnlockCapsLock) {
        setTimeLeft(autoUnlockCapsLockTimeout);
      } else {
        setTimeLeft(0);
      }
      if (capsLockSound && capsLockSound !== 'off') {
        playSynthSound(capsLockSound);
      }
    });
    return unsubscribe;
  }, [capsLockSoundScope, capsLockSound, autoUnlockCapsLock, autoUnlockCapsLockTimeout]);

  // 3.8 Resync Caps Lock when returning to the app (tray / other window).
  // Covers missed IPC while hidden and app-scope (no global worker).
  useEffect(() => {
    const syncCapsFromSystem = async () => {
      if (!window.cyberNotesAPI?.checkCapsLock && !window.cyberNotesAPI?.checkNumLock) return;
      try {
        const [active, numActive] = await Promise.all([
          window.cyberNotesAPI.checkCapsLock?.() ?? Promise.resolve(false),
          window.cyberNotesAPI.checkNumLock?.() ?? Promise.resolve(false),
        ]);
        setIsCapsLockActive(active);
        setIsNumLockActive(numActive);
        if (!active) {
          setTimeLeft(0);
        } else if (autoUnlockCapsLock) {
          // Only (re)start countdown if we weren't already counting.
          setTimeLeft(prev => (prev > 0 ? prev : autoUnlockCapsLockTimeout));
        }
      } catch {
        /* ignore */
      }
    };

    const onFocus = () => { void syncCapsFromSystem(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void syncCapsFromSystem();
    };

    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [autoUnlockCapsLock, autoUnlockCapsLockTimeout]);

  // 4. Isolated cleanup for toast timeout on component unmount
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  // 5. Countdown timer loop effect
  useEffect(() => {
    if (!autoUnlockCapsLock || !isCapsLockActive || timeLeft <= 0) return;

    const timer = setTimeout(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoUnlockCapsLock, isCapsLockActive, timeLeft]);

  // 6. Unlock Caps Lock trigger effect when countdown hits 0 (Unconditional visual reset!)
  //    Also handles "Instantly" mode (autoUnlockCapsLockTimeout === 0) where the
  //    unlock must fire immediately as soon as Caps Lock is detected as active.
  useEffect(() => {
    if (autoUnlockCapsLock && isCapsLockActive && timeLeft === 0) {
      const triggerUnlock = async () => {
        // Marca el apagado como automático (para el toast)
        capsAutoUnlockPendingRef.current = true;
        // Unconditionally clear visual indicators immediately!
        setIsCapsLockActive(false);

        if (window.cyberNotesAPI && window.cyberNotesAPI.unlockCapsLock) {
          await window.cyberNotesAPI.unlockCapsLock();
        }
      };
      triggerUnlock();
    }
  }, [autoUnlockCapsLock, isCapsLockActive, timeLeft, autoUnlockCapsLockTimeout]);

  useEffect(() => {
    // Escuchar el menú contextual desde Electron
    let unregisterContext: (() => void) | undefined;
    if (window.cyberNotesAPI && window.cyberNotesAPI.onContextMenuData) {
      unregisterContext = window.cyberNotesAPI.onContextMenuData((data: any) => {
        // Usamos las coordenadas reales del ratón (capturadas globalmente)
        const mousePos = (window as any).lastMousePos || { x: data.x, y: data.y };
        
        const timeDiff = Date.now() - lastContextMenuTimeRef.current;
        if (timeDiff > 200) {
          return;
        }

        // El reposicionamiento dentro de la ventana lo afina useLayoutEffect tras medir el menú.
        const target = lastContextMenuTargetRef.current;
        let hasSelection = false;
        let hasContent = false;
        let canUndo = false;
        let canRedo = false;
        let imageSrc: string | null = data.imageSrc || null;

        if (target === 'title') {
          const input = titleInputRef.current;
          if (input) {
            hasSelection = input.selectionStart !== input.selectionEnd;
            hasContent = (input.value?.length ?? 0) > 0;
          }
          // queryCommandEnabled('undo') suele devolver true sin historial real → no exponer undo/redo aquí.
          // El input sigue soportando Ctrl+Z nativo.
          canUndo = false;
          canRedo = false;
        } else if (editorRef.current) {
          const ed = editorRef.current;
          const { from, to } = ed.state.selection;
          hasSelection = from !== to;
          hasContent = ed.state.doc.textContent.length > 0;
          canUndo = ed.can().undo();
          canRedo = ed.can().redo();
          if (!imageSrc && ed.isActive('image')) {
            imageSrc = ed.getAttributes('image').src || null;
          }
          // Fallback: nodo bajo el cursor del último mousedown
          if (!imageSrc) {
            const el = (window as any).lastMouseDownEl as HTMLElement | null;
            const img = el?.closest?.('img') as HTMLImageElement | null;
            if (img?.src) imageSrc = img.src;
          }
          // Seleccionar el nodo imagen para que Cortar/Eliminar funcionen
          if (imageSrc) {
            let foundPos: number | null = null;
            ed.state.doc.descendants((node: any, pos: number) => {
              if (foundPos !== null) return false;
              if (node.type.name === 'image' && node.attrs?.src === imageSrc) {
                foundPos = pos;
                return false;
              }
            });
            if (foundPos !== null) {
              ed.commands.setNodeSelection(foundPos);
              hasSelection = true;
            }
          }
        }

        setContextMenu({
          x: mousePos.x,
          y: mousePos.y,
          linkHref: data.linkURL,
          suggestions: data.suggestions || [],
          misspelledWord: data.misspelledWord || '',
          target,
          imageSrc,
          hasSelection: hasSelection || !!imageSrc,
          hasContent,
          canPaste: false,
          canUndo,
          canRedo,
        });

        // Pegar: habilitar solo si el portapapeles tiene texto
        navigator.clipboard.readText()
          .then(text => {
            setContextMenu(cm => (cm ? { ...cm, canPaste: text.length > 0 } : cm));
          })
          .catch(() => {
            // Sin permiso de clipboard: permitir pegar (el SO puede gestionar el paste)
            setContextMenu(cm => (cm ? { ...cm, canPaste: true } : cm));
          });
      });
    }
    
    return () => {
      if (unregisterContext) unregisterContext();
    };
  }, []);

  // Reposiciona el menú contextual para que no se desborde de la ventana.
  // Mide el tamaño real (su ancho varía: sugerencias, "agregar al diccionario", etc.).
  useLayoutEffect(() => {
    if (!contextMenu) return;
    const el = contextMenuRef.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    let nextX = contextMenu.x;
    let nextY = contextMenu.y;
    if (nextX + rect.width + margin > window.innerWidth) {
      nextX = Math.max(margin, window.innerWidth - rect.width - margin);
    }
    if (nextY + rect.height + margin > window.innerHeight) {
      nextY = Math.max(margin, window.innerHeight - rect.height - margin);
    }
    if (nextX !== contextMenu.x || nextY !== contextMenu.y) {
      setContextMenu(cm => (cm ? { ...cm, x: nextX, y: nextY } : cm));
    }
  }, [contextMenu]);

  // Keep language synchronized on window for tiptap extensions
  (window as any).__currentLanguage = language;

  const editor = useEditor({
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      CustomImage.configure({
        allowBase64: true,
        inline: false,
        HTMLAttributes: {
          class: 'editor-image',
        },
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        // false: al pegar una URL sobre una selección, reemplaza el texto en vez
        // de aplicar el enlace al texto seleccionado ("adoptarlo"). autolink sigue
        // haciendo clicable la URL pegada.
        linkOnPaste: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({
        placeholder: () => TRANSLATIONS[((window as any).__currentLanguage as Language) || 'es'].editor.placeholderBody,
      }),
      Underline,
      Highlight.configure({ multicolor: false }),
      FontSize,
    ],
    editorProps: {
      attributes: {
        spellcheck: 'true',
      },
      handleDOMEvents: {
        mousedown: (_view, event) => {
          if (event.button === 2) {
            const { from, to } = _view.state.selection;
            if (from !== to) {
              // Prevenir que el click derecho colapse la selección de texto existente
              lastContextMenuTargetRef.current = 'editor';
              lastContextMenuTimeRef.current = Date.now();
              event.preventDefault();
              return true;
            }
          }
          return false;
        },
        contextmenu: (_view, _event) => {
          const { from, to } = _view.state.selection;
          if (from !== to) {
            // Si ya hay texto seleccionado, preservar la selección activa al hacer click derecho lejos
            lastContextMenuTargetRef.current = 'editor';
            lastContextMenuTimeRef.current = Date.now();
            return true;
          }
          return false;
        },
      },
      handleKeyDown: (_view, event) => {
        // Tab = sangría / espacios; evita saltar el foco a otros controles de la UI
        if (event.key === 'Tab') {
          event.preventDefault();

          const { state, dispatch } = _view;
          if (event.shiftKey) {
            // Shift+Tab: quitar un tabulador o hasta 4 espacios antes del cursor
            const { $from } = state.selection;
            const before = $from.parent.textBetween(
              Math.max(0, $from.parentOffset - 4),
              $from.parentOffset,
              undefined,
              '\ufffc',
            );
            if (before.endsWith('\t')) {
              dispatch(state.tr.delete($from.pos - 1, $from.pos));
              return true;
            }
            const spaces = before.match(/ +$/)?.[0] ?? '';
            if (spaces.length > 0) {
              const n = Math.min(4, spaces.length);
              dispatch(state.tr.delete($from.pos - n, $from.pos));
              return true;
            }
            return true;
          }

          dispatch(state.tr.insertText('\t'));
          return true;
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          handleManualSave();
          return true;
        }

        if (event.key === 'Escape') {
          const listEl = document.querySelector('[data-notelist-container="true"]') as HTMLElement | null;
          if (listEl) {
            _view.dom.blur();
            listEl.focus();
            return true;
          }
        }

        return false;
      },
    },
    content: '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      const current = currentNoteRef.current;
      const isHydrated = !!current && hydratedNoteIdRef.current === current.id;
      if (!isSelectionChangingRef.current && isHydrated) {
        isDirtyRef.current = true;
        scheduleAutoSave(html);
      }
      updateLineInfo(editor);
      updateTextMetrics(editor);
      // Actualizar minimap al editar (rAF coalesce llamadas múltiples)
      syncMinimapHtml();
    },
    onSelectionUpdate: ({ editor }) => {
      updateLineInfo(editor);
    },
    onFocus: () => {
      setIsFocused(true);
    },
    onBlur: ({ editor, event }) => {
      setIsFocused(false);
      if (isDirtyRef.current) {
        const html = editor.getHTML();
        const current = currentNoteRef.current;
        if (current && hydratedNoteIdRef.current === current.id) {
          if (autosaveEnabledRef.current) {
            const preview = extractPreview(html);
            const thumb = extractThumb(html);
            onSave({ ...current, content: html, preview, thumb });
            isDirtyRef.current = false;
          } else {
            // Modo manual: NO persistir al perder el foco; solo mantener el borrador al día.
            if (draftSyncTimer.current) clearTimeout(draftSyncTimer.current);
            onEditDraft?.(current.id, localTitleRef.current, html);
          }
        }
      }
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }

      // Caso B — Modo manual con cambios sin guardar: avisar si el foco abandona el
      // editor hacia una zona neutra (no el título, ni controles internos, ni navegación).
      // document.hasFocus() evita falsos positivos al cambiar de ventana (alt-tab).
      if (!autosaveEnabledRef.current && hasUnsavedChangesRef.current && document.hasFocus()) {
        const target = (event?.relatedTarget as HTMLElement | null) || ((window as any).lastMouseDownEl as HTMLElement | null);
        const goesToTitle = !!target && target === titleInputRef.current;
        const goesInsideEditor = !!target && !!editorRootRef.current?.contains(target);
        const goesToNav = !!target && !!target.closest?.('[data-leave-guard="nav"]');
        const goesToAppChrome = !!target && !!target.closest?.('.titlebar-glass');
        if (target && !goesToTitle && !goesInsideEditor && !goesToNav && !goesToAppChrome) {
          setShowLeaveEditorWarning(true);
        }
      }
    },
  });

  useEffect(() => {
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);

  // Sincronizar editorRef después de que useEditor lo haya inicializado
  editorRef.current = editor;

  useEffect(() => {
    if (!onRegisterDraftFlush) return;

    const flushBeforeLock = async () => {
      const current = currentNoteRef.current;
      if (!current || !editor || hydratedNoteIdRef.current !== current.id) return;

      if (autosaveEnabledRef.current) {
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
          saveTimer.current = null;
        }
        if (isDirtyRef.current) {
          const html = editor.getHTML();
          const preview = extractPreview(html);
          await onSave({ ...current, content: html, preview, thumb: extractThumb(html) });
          isDirtyRef.current = false;
        }
        return;
      }

      if (draftSyncTimer.current) {
        clearTimeout(draftSyncTimer.current);
        draftSyncTimer.current = null;
      }
      if (hasUnsavedChangesRef.current || isDirtyRef.current) {
        await onEditDraft?.(current.id, localTitleRef.current, editor.getHTML());
      }
    };

    onRegisterDraftFlush(flushBeforeLock);
    return () => onRegisterDraftFlush(null);
  }, [editor, onEditDraft, onRegisterDraftFlush, onSave]);

  const updateLineInfo = (editor: any) => {
    if (!showLineCounter) return;
    const { from } = editor.state.selection;
    const textBefore = editor.state.doc.textBetween(0, from, '\n');
    const linesBefore = textBefore.split('\n');
    const currentLine = linesBefore.length;
    const currentCol = linesBefore[linesBefore.length - 1].length + 1;
    
    const totalText = editor.getText();
    const totalLines = totalText.split('\n').length;
    
    setLineInfo({ line: currentLine, col: currentCol, total: totalLines });
  };

  const updateTextMetrics = (editor: any) => {
    const text = editor.getText();
    const chars = text.length;
    const words = text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
    const readingTime = Math.ceil(words / 200);
    setTextMetrics({ words, chars, readingTime });
  };

  const handleManualSave = useCallback(() => {
    if (!editor || !note || hydratedNoteIdRef.current !== note.id) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (draftSyncTimer.current) {
      clearTimeout(draftSyncTimer.current);
      draftSyncTimer.current = null;
    }
    const html = editor.getHTML();
    const preview = extractPreview(html);
    onSave({ ...note, content: html, title: localTitle, preview, thumb: extractThumb(html) });
    setHasUnsavedChanges(false);
    isDirtyRef.current = false;
  }, [editor, note, localTitle, onSave]);

  // Descarta el borrador y restaura el editor al último estado guardado en disco.
  const handleRevertToSaved = useCallback(() => {
    if (!editor || !note) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (draftSyncTimer.current) {
      clearTimeout(draftSyncTimer.current);
      draftSyncTimer.current = null;
    }
    isSelectionChangingRef.current = true;
    hydratedNoteIdRef.current = null;
    loadEditorContent(editor, note.content || '');
    setLocalTitle(note.title || '');
    localTitleRef.current = note.title || '';
    isDirtyRef.current = false;
    setHasUnsavedChanges(false);
    onDiscardDraft?.(note.id);
    hydratedNoteIdRef.current = note.id;
    syncMinimapHtml(true);
    setTimeout(() => { isSelectionChangingRef.current = false; }, 100);
  }, [editor, note, onDiscardDraft, syncMinimapHtml]);

  useModalKeys({
    enabled: showLeaveEditorWarning,
    onEsc: () => { setShowLeaveEditorWarning(false); editor?.commands.focus(); },
    onEnter: () => { handleManualSave(); setShowLeaveEditorWarning(false); },
  });

  // Sincronizar estado de cambios no guardados con el proceso principal
  useEffect(() => {
    window.cyberNotesAPI?.setUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  // Actualizar editor cuando cambia la nota seleccionada o cuando se monta/desmonta
  useLayoutEffect(() => {
    const draft = note ? draftCache[note.id] : null;
    setPinned(note?.pinned === 1);
    setLocalTitle(draft ? draft.title : (note?.title || ''));
    localTitleRef.current = draft ? draft.title : (note?.title || '');
    setHasUnsavedChanges(!!draft);

    hydratedNoteIdRef.current = null;
    if (!editor || !note) return;
    tabHydrationStart(note.id);

    // Set selection changing flag to true to ignore programmatic updates
    isSelectionChangingRef.current = true;
    isDirtyRef.current = false;

    if (saveTimer.current) clearTimeout(saveTimer.current);

    // Carga limpia: sin meter el cambio de nota en el historial de Undo
    const content = draft ? draft.content : (note.content || '');
    loadEditorContent(editor, content);
    hydratedNoteIdRef.current = note.id;

    // Métricas aquí mismo: la sonda mostró hidratación de ~2ms, así que no
    // tiene sentido pagar un render pasivo extra por estos números.
    updateTextMetrics(editor);
    updateLineInfo(editor);

    // Sincronizar minimap con el nuevo contenido de la nota
    syncMinimapHtml(true);
    
    if ((draft ? draft.title : note.title) === 'Nueva nota') {
      setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
          const len = titleInputRef.current.value.length;
          titleInputRef.current.setSelectionRange(len, len);
        }
      }, 50);
    } else {
      editor.commands.focus('start');
    }
    setIsRaw(false);
    setShowFontSizeMenu(false);

    tabHydrationEnd();

    // Reset selection changing flag after all synchronous & immediate asynchronous updates
    const timeoutId = setTimeout(() => {
      isSelectionChangingRef.current = false;
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      if (draftSyncTimer.current) {
        clearTimeout(draftSyncTimer.current);
        draftSyncTimer.current = null;
      }
      if (hydratedNoteIdRef.current === note.id) {
        hydratedNoteIdRef.current = null;
      }
      // Closure-based safeguard: flush save immediately when note changes or unmounts.
      // En modo manual NO persistimos: el borrador ya está al día en draftCache.
      if (saveTimer.current && isDirtyRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const current = currentNoteRef.current;
        if (current && editor && autosaveEnabledRef.current) {
          const html = editor.getHTML();
          const preview = extractPreview(html);
          onSave({ ...current, content: html, preview, thumb: extractThumb(html) });
          isDirtyRef.current = false;
        }
      }
    };
  }, [note?.id, editor, draftRecoveryNonce]);

  // Mantener la referencia sincronizada después de hidratar el contenido.
  useEffect(() => {
    currentNoteRef.current = note;
  }, [note]);

  const scheduleAutoSave = useCallback((html: string) => {
    const current = currentNoteRef.current;
    if (!current || hydratedNoteIdRef.current !== current.id) return;
    const noteId = current.id;
    if (!autosaveEnabled) {
      setHasUnsavedChanges(true);
      // Throttle: no bombardear al padre en cada tecla (solo marcar dirty + sync periódico)
      if (draftSyncTimer.current) clearTimeout(draftSyncTimer.current);
      draftSyncTimer.current = setTimeout(() => {
        if (currentNoteRef.current?.id !== noteId || hydratedNoteIdRef.current !== noteId) return;
        onEditDraft?.(noteId, localTitleRef.current, html);
      }, 300);
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const current = currentNoteRef.current;
      if (!current || current.id !== noteId || hydratedNoteIdRef.current !== noteId) return;
      const preview = extractPreview(html);
      const thumb = extractThumb(html);
      onSave({ ...current, content: html, preview, thumb });
      isDirtyRef.current = false;
    }, 500);
  }, [onSave, autosaveEnabled, onEditDraft]);

  const handlePin = () => {
    if (!note) return;
    const newPinned = pinned ? 0 : 1;
    setPinned(!pinned);
    onSave({ ...note, pinned: newPinned });
    currentNoteRef.current = { ...note, pinned: newPinned };
  };

  const convertHtmlToMarkdown = (html: string): string => {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;

    const traverse = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent || '';
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }
      const el = node as HTMLElement;
      const childrenStr = Array.from(el.childNodes).map(traverse).join('');

      switch (el.tagName.toLowerCase()) {
        case 'p': return `\n${childrenStr}\n`;
        case 'h1': return `\n# ${childrenStr}\n`;
        case 'h2': return `\n## ${childrenStr}\n`;
        case 'h3': return `\n### ${childrenStr}\n`;
        case 'strong':
        case 'b': return `**${childrenStr}**`;
        case 'em':
        case 'i': return `*${childrenStr}*`;
        case 'u': return `_${childrenStr}_`;
        case 's':
        case 'strike':
        case 'del': return `~~${childrenStr}~~`;
        case 'ul': return `\n${childrenStr}\n`;
        case 'ol': return `\n${childrenStr}\n`;
        case 'li': return `* ${childrenStr}\n`;
        case 'blockquote': return `\n> ${childrenStr.trim().split('\n').join('\n> ')}\n`;
        case 'code': return `\`${childrenStr}\``;
        case 'pre': return `\n\`\`\`\n${childrenStr.trim()}\n\`\`\`\n`;
        case 'br': return '\n';
        case 'hr': return '\n---\n';
        case 'a': return `[${childrenStr}](${el.getAttribute('href') || ''})`;
        case 'img': return `![Imagen](${el.getAttribute('src') || ''})`;
        default: return childrenStr;
      }
    };

    return traverse(temp).trim().replace(/\n{3,}/g, '\n\n');
  };

  const handleExportMarkdown = () => {
    if (!note) return;
    const editorHtml = editor?.getHTML() || '';
    const title = note.title || 'Nota';
    const md = convertHtmlToMarkdown(editorHtml);
    const mdContent = `# ${title}\n\n${md}`;

    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '-')}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const buildExportHtml = () => {
    if (!note) return;
    const editorHtml = editor?.getHTML() || '';
    const title = note.title || 'Nota';
    const htmlContent = `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f0f13;
      color: #e2e8f0;
      line-height: 1.6;
      max-width: 700px;
      margin: 40px auto;
      padding: 0 20px;
    }
    h1 {
      font-size: 2.2em;
      border-bottom: 1px solid #2d3748;
      padding-bottom: 10px;
      color: #38bdf8;
      letter-spacing: -0.02em;
    }
    h2 { color: #f472b6; }
    h3 { color: #c084fc; }
    a { color: #38bdf8; text-decoration: none; }
    a:hover { text-underline-offset: 4px; text-decoration: underline; }
    pre {
      background: #1a1a24;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
      border: 1px solid #2d3748;
    }
    code { font-family: monospace; }
    blockquote {
      border-left: 4px solid #a855f7;
      padding-left: 20px;
      margin-left: 0;
      color: #94a3b8;
      font-style: italic;
    }
    img { max-width: 100%; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div>${editorHtml}</div>
</body>
</html>`;

    return { title, htmlContent };
  };

  const handleExportHtml = () => {
    const documentData = buildExportHtml();
    if (!documentData) return;
    const { title, htmlContent } = documentData;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '-')}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPdf = async () => {
    const documentData = buildExportHtml();
    if (!documentData) return;
    await window.cyberNotesAPI.exportNotePdf(documentData.title, documentData.htmlContent);
  };

  const handleExportText = () => {
    if (!note) return;
    const title = note.title || 'Nota';
    const textContent = `${title}\n\n${editor?.getText() || ''}`;
    const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '-')}.txt`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handlePrint = async () => {
    const documentData = buildExportHtml();
    if (!documentData) return;
    await window.cyberNotesAPI.printDocument(documentData.title, documentData.htmlContent);
  };

  const exportMenu = (
    <div style={{ position: 'relative', display: 'flex', zIndex: 40 }}>
      <Tooltip placement="bottom" label={language === 'es' ? 'Exportar nota' : 'Export note'}>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={e => {
            e.stopPropagation();
            setShowExportMenu(prev => !prev);
          }}
          style={noteActionBtnStyle(showExportMenu)}
          aria-haspopup="menu"
          aria-expanded={showExportMenu}
        >
          <Upload size={15} />
        </button>
      </Tooltip>
      <AnimatePresence>
        {showExportMenu && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="glass-effect"
            role="menu"
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              marginTop: 6,
              minWidth: 205,
              padding: 4,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              background: 'var(--bg-modal)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              zIndex: 100,
            }}
          >
            {[
              { icon: <FileDown size={13} />, label: language === 'es' ? 'Exportar PDF' : 'Export PDF', hint: 'Ctrl+Alt+P', onClick: handleExportPdf },
              { icon: <FileText size={13} />, label: language === 'es' ? 'Exportar Markdown (.md)' : 'Export Markdown (.md)', hint: 'Ctrl+Alt+M', onClick: handleExportMarkdown },
              { icon: <FileText size={13} />, label: language === 'es' ? 'Exportar texto (.txt)' : 'Export plain text (.txt)', hint: 'Ctrl+Alt+T', onClick: handleExportText },
              { icon: <Globe size={13} />, label: language === 'es' ? 'Exportar HTML (.html)' : 'Export HTML (.html)', hint: 'Ctrl+Alt+H', onClick: handleExportHtml },
              { icon: <Printer size={13} />, label: language === 'es' ? 'Imprimir' : 'Print', hint: 'Ctrl+P', onClick: handlePrint },
            ].map(item => (
              <button
                key={item.hint}
                type="button"
                role="menuitem"
                onClick={() => { setShowExportMenu(false); void item.onClick(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 9px',
                  fontSize: 11,
                  textAlign: 'left',
                  background: 'transparent',
                  color: 'var(--text-primary)',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span style={{ display: 'inline-flex', color: 'var(--accent-light)' }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 9, whiteSpace: 'nowrap' }}>{item.hint}</span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  useEffect(() => {
    if (!onRegisterExportActions) return;
    onRegisterExportActions({
      markdown: handleExportMarkdown,
      html: handleExportHtml,
      pdf: handleExportPdf,
      text: handleExportText,
      print: handlePrint,
    });
    return () => onRegisterExportActions(null);
  }, [handleExportHtml, handleExportMarkdown, handleExportPdf, handleExportText, handlePrint, onRegisterExportActions]);

  useEffect(() => {
    if (!showExportMenu) return;
    const close = () => setShowExportMenu(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [showExportMenu]);

  const handleSetLink = () => {
    if (!editor) return;
    const prev = editor.getAttributes('link').href;
    setEditLinkData({ href: prev || 'https://' });
  };

  const handleInsertImage = async () => {
    if (!editor) return;
    const url = await window.cyberNotesAPI.selectAndSaveImage();
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  };

  const handleCopySelection = useCallback(() => {
    if (!editor || editor.state.selection.empty) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, '\n', '\n');
    editor.commands.focus();
    if (!document.execCommand('copy')) {
      void navigator.clipboard?.writeText(text);
    }
  }, [editor]);

  const handlePasteFromClipboard = useCallback(async () => {
    if (!editor || readOnly) return;
    editor.commands.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (text) editor.chain().focus().insertContent(text).run();
    } catch {
      document.execCommand('paste');
    }
  }, [editor, readOnly]);

  const t = TRANSLATIONS[language];

  const activeFontSize = (editor?.getAttributes('textStyle')?.fontSize as string | null) || null;

  const noteLoader = (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        background: 'rgba(8, 8, 14, 0.55)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        pointerEvents: 'all',
      }}
    >
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          border: '2px solid rgba(255,255,255,0.12)',
          borderTopColor: 'var(--accent)',
          boxShadow: '0 0 12px var(--accent-glow)',
        }}
      />
      <span style={{
        fontSize: 'calc(12.5px * var(--ui-scale))',
        color: 'var(--text-secondary)',
        letterSpacing: '0.02em',
      }}>
        {language === 'es' ? 'Cargando nota…' : 'Loading note…'}
      </span>
    </div>
  );

  if (!note) {
    if (isNoteLoading) {
      return (
        <div className="glass-effect editor-glass" style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          background: 'var(--bg-editor)', position: 'relative', overflow: 'hidden',
        }}>
          {noteLoader}
        </div>
      );
    }
    const totalNotes = notes.length;
    const favoriteCount = notes.filter(n => n.pinned === 1).length;
    const numberLocale = language === 'es' ? 'es-ES' : 'en-US';
    const fmtCount = (n: number) => new Intl.NumberFormat(numberLocale).format(n);
    const kbdChip: CSSProperties = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: 26, padding: '3px 8px', borderRadius: 6, fontSize: 11.5, fontWeight: 600,
      color: 'var(--text-primary)', background: 'rgba(255, 255, 255, 0.06)',
      border: '1px solid var(--border)',
    };
    const cardStyle: CSSProperties = {
      width: '100%', borderRadius: 14, padding: '18px 20px',
      background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column', gap: 12,
    };
    const cardLabelStyle: CSSProperties = {
      display: 'flex', alignItems: 'center', gap: 10,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)',
    };
    const cardIconTile: CSSProperties = {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 34, height: 34, borderRadius: 9, color: 'var(--text-secondary)',
      background: 'rgba(255, 255, 255, 0.05)', border: '1px solid var(--border)',
    };
    const shortcuts: { keys: string[]; label: string }[] = [
      { keys: ['Ctrl', 'N'], label: language === 'es' ? 'Nueva nota' : 'New note' },
      { keys: ['Ctrl', 'F'], label: language === 'es' ? 'Buscar notas' : 'Search notes' },
      { keys: ['Ctrl', 'S'], label: language === 'es' ? 'Guardar nota' : 'Save note' },
    ];
    return (
      <div className="glass-effect editor-glass" style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        background: 'var(--bg-editor)', overflowY: 'auto', color: 'var(--text-muted)',
      }}>
        <div style={{
          margin: 'auto', width: '100%', maxWidth: 600, display: 'flex',
          flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 28px',
        }}>
          <WelcomeGreeting language={language} showName={false} />
          <h1 style={{
            margin: 0, fontSize: 30, fontWeight: 700, letterSpacing: '-0.01em',
            color: 'var(--text-primary)', textAlign: 'center',
          }}>
            {language === 'es' ? 'Tu espacio de notas' : 'Your notes space'}
          </h1>
          <p style={{ margin: 0, fontSize: 14, textAlign: 'center', color: 'var(--text-secondary)', maxWidth: 460 }}>
            {language === 'es'
              ? 'Selecciona una nota de la lista para empezar a escribir, o crea una nueva y organiza tus ideas.'
              : 'Select a note from the list to start writing, or create a new one and organize your ideas.'}
          </p>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>
              <span style={cardIconTile}><NotebookText size={17} /></span>
              {language === 'es' ? 'NOTAS' : 'NOTES'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {fmtCount(totalNotes)}
              </span>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {language === 'es' ? 'notas en total' : 'total notes'}
                {favoriteCount > 0 && (language === 'es'
                  ? ` · ${fmtCount(favoriteCount)} favoritas`
                  : ` · ${fmtCount(favoriteCount)} favorites`)}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary" onClick={onCreateNote} style={{ gap: 6 }}>
                <Plus size={15} /> {language === 'es' ? 'Nueva nota' : 'New note'} <ArrowRight size={14} />
              </button>
              {canReopenClosedTab && (
                <button className="btn btn-ghost" onClick={onReopenClosedTab} style={{ gap: 6 }}>
                  <RotateCcw size={15} /> {language === 'es' ? 'Reabrir pestaña cerrada' : 'Reopen closed tab'}
                </button>
              )}
            </div>
          </div>
          <div style={cardStyle}>
            <div style={cardLabelStyle}>
              <span style={cardIconTile}><Keyboard size={17} /></span>
              {language === 'es' ? 'ATAJOS DE TECLADO' : 'KEYBOARD SHORTCUTS'}
            </div>
            {shortcuts.map((s) => (
              <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {s.keys.map((k, i) => (
                    <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      {i > 0 && <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>+</span>}
                      <kbd style={kbdChip}>{k}</kbd>
                    </span>
                  ))}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{s.label}</span>
              </div>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={onToggleLayout} style={{ gap: 6 }}>
            <PanelLeft size={15} /> {language === 'es' ? 'Cambiar vista' : 'Switch view'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={editorRootRef}
      className={`glass-effect editor-glass ${isFocused ? 'focused-immersive' : ''}`}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-editor)', overflow: 'hidden', position: 'relative' }}
    >
      {isNoteLoading && noteLoader}
      {/* Pestañas (Tabs) Premium */}
      {openNoteIds.length > 0 && (
        <div style={{ background: 'var(--bg-sidebar)', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
          <div
            ref={tabStripRef}
            className={`tab-strip ${tabsWidthMode === 'wide' ? 'tabs-wide' : ''} ${draggingTabId ? 'is-reordering' : ''}`}
            style={{ borderBottom: 'none' }}
            onDragOver={(e) => {
              if (!draggingTabIdRef.current) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
            }}
            onDrop={clearTabDrag}
            onDragEnd={clearTabDrag}
          >
            {openNoteIds.map((tabId) => {
              const tabNote = notes.find(n => n.id === tabId);
              if (!tabNote) return null;

              const isActive = note.id === tabId;
              const draft = draftCache[tabId];
              const displayTitle = draft ? draft.title : tabNote.title;
              const isDirty = draft !== undefined && !autosaveEnabled;

              const folder = folders.find(f => f.id === tabNote.folder_id);
              const folderColor = folder ? folder.color : 'transparent';
              const dropClass = tabDropHint?.id === tabId
                ? (tabDropHint.edge === 'before' ? 'drop-before' : 'drop-after')
                : '';

              return (
                <Tooltip
                  key={tabId}
                  placement="bottom"
                  label={
                    draggingTabId ? '' : (
                    <>
                      <span style={{ fontWeight: 600 }}>{displayTitle || (language === 'es' ? 'Sin título' : 'Untitled')}</span>
                      {folder?.name && (
                        <span style={{ fontSize: 9, color: folder.color || 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {folder.name}
                        </span>
                      )}
                    </>
                    )
                  }
                >
                <div
                  data-note-id={tabId}
                  draggable
                  className={`editor-tab ${isActive ? 'active' : ''} ${draggingTabId === tabId ? 'is-dragging' : ''} ${dropClass}`}
                  onClick={() => onSelectNote?.(tabId)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const menuWidth = 190;
                    const menuHeight = 230;
                    setTabContextMenu({
                      tabId,
                      x: Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8)),
                      y: Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 8)),
                    });
                  }}
                  onDragStart={(e) => {
                    if ((e.target as HTMLElement).closest('.tab-close-btn')) {
                      e.preventDefault();
                      return;
                    }
                    e.dataTransfer.setData(TAB_DRAG_MIME, tabId);
                    e.dataTransfer.setData('text/plain', tabId);
                    e.dataTransfer.effectAllowed = 'move';
                    draggingTabIdRef.current = tabId;
                    document.documentElement.classList.add('tab-dragging');
                    setDraggingTabId(tabId);
                    setTabDropHint(null);
                  }}
                  onDragOver={(e) => {
                    const fromId = draggingTabIdRef.current;
                    if (!fromId || fromId === tabId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = 'move';
                    const edge = tabDropEdge(e);
                    setTabDropHint(prev => (prev?.id === tabId && prev.edge === edge) ? prev : { id: tabId, edge });
                  }}
                  onDragLeave={(e) => {
                    const next = e.relatedTarget as Node | null;
                    if (next && e.currentTarget.contains(next)) return;
                    setTabDropHint(prev => (prev?.id === tabId ? null : prev));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const fromId = e.dataTransfer.getData(TAB_DRAG_MIME) || e.dataTransfer.getData('text/plain');
                    const edge = tabDropEdge(e);
                    clearTabDrag();
                    if (fromId && openNoteIds.includes(fromId)) {
                      onReorderTabs?.(fromId, tabId, edge);
                    }
                  }}
                  onDragEnd={clearTabDrag}
                >
                  {isActive && (
                    <motion.div
                      layoutId="activeTabBackground"
                      className="active-tab-glow"
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        height: 2,
                        borderRadius: '8px 8px 0 0',
                        background: 'var(--accent)',
                        boxShadow: '0 0 8px var(--accent-glow)',
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  {folder && (
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: folderColor,
                        boxShadow: `0 0 6px ${folderColor}`,
                        display: 'inline-block',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {tabNote.pinned === 1 && (
                    <Star size={10} color={FILTER_COLORS.favorites} fill={FILTER_COLORS.favorites} stroke="none" style={{ flexShrink: 0 }} />
                  )}
                  {openStickyIds.includes(tabId) && (
                    <AppWindow size={10} color={FILTER_COLORS.sticky} style={{ flexShrink: 0 }} />
                  )}

                  <span className="editor-tab-title" style={{ fontStyle: isDirty ? 'italic' : 'normal' }}>
                    {displayTitle || (language === 'es' ? 'Sin título' : 'Untitled')}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, position: 'relative' }}>
                    <button
                      className="tab-close-btn"
                      draggable={false}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        onCloseTab?.(tabId);
                      }}
                    >
                      <X size={10} />
                    </button>
                  </div>
                </div>
                </Tooltip>
              );
            })}

            <Tooltip label={language === 'es' ? 'Nueva pestaña' : 'New tab'} placement="bottom">
              <button
                className="tab-new-btn"
                onClick={onCreateNote}
              >
                <Plus size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
      )}

      {tabContextMenu && createPortal(
        (() => {
          const tabIndex = openNoteIds.indexOf(tabContextMenu.tabId);
          const hasOtherTabs = openNoteIds.length > 1;
          const hasTabsToRight = tabIndex >= 0 && tabIndex < openNoteIds.length - 1;
          const itemStyle = (disabled = false): CSSProperties => ({
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '8px 10px',
            border: 'none',
            borderRadius: 5,
            background: 'transparent',
            color: disabled ? 'var(--text-muted)' : 'var(--text-primary)',
            opacity: disabled ? 0.45 : 1,
            cursor: disabled ? 'default' : 'pointer',
            textAlign: 'left',
            fontSize: 12,
          });
          const runAction = (action?: () => void) => {
            if (!action) return;
            setTabContextMenu(null);
            action();
          };

          return (
            <>
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 100000 }}
                onMouseDown={() => setTabContextMenu(null)}
              />
              <div
                className="glass-effect"
                style={{
                  position: 'fixed',
                  left: tabContextMenu.x,
                  top: tabContextMenu.y,
                  zIndex: 100001,
                  minWidth: 190,
                  padding: 5,
                  background: 'var(--bg-modal)',
                  border: '1px solid var(--border)',
                  borderRadius: 7,
                  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
                }}
                onMouseDown={event => event.stopPropagation()}
              >
                <button
                  type="button"
                  disabled={!canReopenClosedTab}
                  style={itemStyle(!canReopenClosedTab)}
                  onClick={() => runAction(onReopenClosedTab)}
                  onMouseEnter={event => { if (canReopenClosedTab) event.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
                >
                  <RotateCcw size={14} />
                  {language === 'es' ? 'Reabrir pestaña cerrada' : 'Reopen closed tab'}
                </button>
                <button
                  type="button"
                  style={itemStyle()}
                  onClick={() => runAction(() => onCloseTab?.(tabContextMenu.tabId))}
                  onMouseEnter={event => { event.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
                >
                  <X size={14} />
                  {language === 'es' ? 'Cerrar pestaña' : 'Close tab'}
                </button>
                <button
                  type="button"
                  disabled={!hasOtherTabs}
                  style={itemStyle(!hasOtherTabs)}
                  onClick={() => runAction(() => onCloseOtherTabs?.(tabContextMenu.tabId))}
                  onMouseEnter={event => { if (hasOtherTabs) event.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
                >
                  <PanelLeft size={14} />
                  {language === 'es' ? 'Cerrar otras pestañas' : 'Close other tabs'}
                </button>
                <button
                  type="button"
                  disabled={!hasTabsToRight}
                  style={itemStyle(!hasTabsToRight)}
                  onClick={() => runAction(() => onCloseTabsToRight?.(tabContextMenu.tabId))}
                  onMouseEnter={event => { if (hasTabsToRight) event.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
                >
                  <PanelLeft size={14} style={{ transform: 'rotate(180deg)' }} />
                  {language === 'es' ? 'Cerrar a la derecha' : 'Close tabs to the right'}
                </button>
                <div style={{ height: 1, margin: '4px 6px', background: 'var(--border)' }} />
                <button
                  type="button"
                  style={itemStyle()}
                  onClick={() => runAction(onCloseAllTabs)}
                  onMouseEnter={event => { event.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={event => { event.currentTarget.style.background = 'transparent'; }}
                >
                  <X size={14} />
                  {language === 'es' ? 'Cerrar todas las pestañas' : 'Close all tabs'}
                </button>
              </div>
            </>
          );
        })(),
        document.body
      )}

      {/* Title Container (Moved from below) */}
      <div style={{
        padding: '20px 48px 16px',
        flexShrink: 0,
        borderBottom: '1px solid var(--border)',
        background: 'linear-gradient(to bottom, var(--bg-sidebar) 0%, var(--bg-editor) 100%)',
        position: 'relative',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.18)',
      }}>
        {/* Top glowing cyber border line */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent 0%, var(--accent) 50%, transparent 100%)', opacity: 0.6 }} />
        {(pinned || isFloatingNote) && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: 0,
              top: 14,
              bottom: 14,
              width: 3,
              borderRadius: 2,
              background: pinned && isFloatingNote
                ? 'linear-gradient(180deg, #f59e0b 0%, #22d3ee 100%)'
                : (identityColor || FILTER_COLORS.favorites),
              boxShadow: pinned && isFloatingNote
                ? '0 0 10px rgba(245, 158, 11, 0.35), 0 0 10px rgba(34, 211, 238, 0.28)'
                : `0 0 10px ${identityColor}88`,
            }}
          />
        )}
        
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            {(pinned || isFloatingNote) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {pinned && (
                  <Tooltip
                    placement="bottom"
                    delay={400}
                    label={language === 'es' ? 'Nota favorita' : 'Favorite note'}
                  >
                    <span style={{ display: 'inline-flex' }}>
                      <Star size={16} color={FILTER_COLORS.favorites} fill={FILTER_COLORS.favorites} stroke="none" />
                    </span>
                  </Tooltip>
                )}
                {isFloatingNote && (
                  <Tooltip placement="bottom" delay={400} label={t.noteList.stickyActive}>
                    <span style={{ display: 'inline-flex' }}>
                      <AppWindow size={16} color={FILTER_COLORS.sticky} />
                    </span>
                  </Tooltip>
                )}
              </div>
            )}
            <input
              ref={titleInputRef}
              value={localTitle}
              readOnly={readOnly}
              aria-readonly={readOnly}
              onChange={e => updateTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                  editor?.commands.focus('start');
                } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                  e.preventDefault();
                  handleManualSave();
                } else if (e.key === 'Escape') {
                  (e.target as HTMLInputElement).blur();
                  const listEl = document.querySelector('[data-notelist-container="true"]') as HTMLElement | null;
                  listEl?.focus();
                }
              }}
              onContextMenu={(e) => {
                lastContextMenuTargetRef.current = 'title';
                lastContextMenuTimeRef.current = Date.now();
                e.stopPropagation();
              }}
              placeholder={t.editor.placeholderTitle}
              className="title-input"
              style={{
                width: '100%',
                fontSize: 'calc(26px * var(--ui-scale))',
                fontWeight: 700,
                background: 'rgba(255, 255, 255, 0.02)',
                border: identityBorder,
                outline: 'none',
                color: 'var(--text-primary)',
                marginBottom: 4,
                letterSpacing: '-0.02em',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: identityGlow,
              }}
              onFocus={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 10px var(--accent-glow), inset 0 1px 3px rgba(0,0,0,0.2)';
              }}
              onBlur={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                e.currentTarget.style.border = identityBorder;
                e.currentTarget.style.boxShadow = identityGlow;
              }}
            />
          </div>
          
          {/* Note-Level Actions Toolbar Panel */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 4, 
            flexShrink: 0,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            padding: '4px 6px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          }}>
            {/* Guardar manual (alineado a la izquierda / primero) */}
            <AnimatePresence>
              {!autosaveEnabled && hasUnsavedChanges && (
                <motion.div
                  key="manual-save-container"
                  initial={{ opacity: 0, scale: 0.9, width: 0, marginRight: 0 }}
                  animate={{ opacity: 1, scale: 1, width: 'auto', marginRight: 4 }}
                  exit={{ opacity: 0, scale: 0.9, width: 0, marginRight: 0 }}
                  transition={{ duration: 0.16, ease: 'easeInOut' }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'visible',
                    whiteSpace: 'nowrap',
                    padding: '2px 3px',
                  }}
                >
                  <Tooltip placement="bottom" label={language === 'es' ? 'Guardar nota (Ctrl+S)' : 'Save note (Ctrl+S)'}>
                    <motion.button
                      onClick={handleManualSave}
                      className="cyber-save-shine"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 5,
                        padding: '6px 11px',
                        minHeight: 32,
                        borderRadius: 6,
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        background: 'var(--accent-dim)',
                        color: 'var(--accent-light)',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 600,
                        transition: 'background 0.15s ease, color 0.15s ease',
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'var(--accent)';
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'var(--accent-dim)';
                        e.currentTarget.style.color = 'var(--accent-light)';
                      }}
                      whileTap={{ scale: 0.95 }}
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <Save size={15} />
                      <span>{language === 'es' ? 'Guardar' : 'Save'}</span>
                    </motion.button>
                  </Tooltip>
                  <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Grupo 1: Estado y Marcadores (Bloq Mayús, Favorito) */}
            <Tooltip
              placement="bottom"
              label={
                autoUnlockCapsLock
                  ? t.editor.capsLockAutoOn
                  : t.editor.capsLockAutoOff
              }
            >
            <button
              type="button"
              onClick={() => {
                const nextVal = !autoUnlockCapsLock;
                onAutoUnlockCapsLockChange?.(nextVal);
              }}
              style={noteActionBtnStyle(autoUnlockCapsLock)}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = autoUnlockCapsLock ? 'var(--accent-dim)' : 'transparent';
                e.currentTarget.style.color = autoUnlockCapsLock ? 'var(--accent-light)' : 'var(--text-muted)';
              }}
            >
              <span style={{ fontSize: 14, lineHeight: 1, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>⇪</span>
              {isCapsLockActive && (
                <span style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 6,
                  height: 6,
                  background: autoUnlockCapsLock ? 'var(--accent-light)' : '#ef4444',
                  borderRadius: '50%',
                  boxShadow: autoUnlockCapsLock
                    ? '0 0 4px var(--accent-glow)'
                    : '0 0 3px #ef4444',
                }} />
              )}
            </button>
            </Tooltip>

            {/* Favorite */}
            <Tooltip placement="bottom" label={pinned ? (language === 'es' ? 'Quitar de favoritos' : 'Remove from favorites') : (language === 'es' ? 'Marcar favorito' : 'Add to favorites')}>
            <button
              type="button"
              onClick={handlePin}
              style={{
                ...noteActionBtnStyle(pinned),
                ...(pinned ? {
                  color: FILTER_COLORS.favorites,
                  background: 'rgba(245, 158, 11, 0.14)',
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                } : {}),
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = pinned ? 'rgba(245, 158, 11, 0.14)' : 'transparent';
                e.currentTarget.style.color = pinned ? FILTER_COLORS.favorites : 'var(--text-muted)';
                e.currentTarget.style.border = pinned ? '1px solid rgba(245, 158, 11, 0.45)' : '1px solid transparent';
              }}
            >
              <Star size={15} fill={pinned ? FILTER_COLORS.favorites : 'none'} color={pinned ? FILTER_COLORS.favorites : 'currentColor'} stroke={pinned ? 'none' : 'currentColor'} strokeWidth={pinned ? 0 : 2} />
            </button>
            </Tooltip>

            {/* Abrir / mostrar nota flotante */}
            <Tooltip placement="bottom" label={isFloatingNote ? t.noteList.showFloatingNote : t.noteList.openSticky}>
              <button
                type="button"
                onClick={() => {
                  if (!note?.id) return;
                  if (isFloatingNote) {
                    window.cyberNotesAPI.revealStickyNote(note.id);
                  } else {
                    window.cyberNotesAPI.openStickyNote(note.id);
                  }
                }}
                style={{
                  ...noteActionBtnStyle(isFloatingNote),
                  ...(isFloatingNote ? {
                    color: FILTER_COLORS.sticky,
                    background: 'rgba(34, 211, 238, 0.14)',
                    border: '1px solid rgba(34, 211, 238, 0.45)',
                  } : {}),
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = isFloatingNote ? 'rgba(34, 211, 238, 0.14)' : 'transparent';
                  e.currentTarget.style.color = isFloatingNote ? FILTER_COLORS.sticky : 'var(--text-muted)';
                  e.currentTarget.style.border = isFloatingNote ? '1px solid rgba(34, 211, 238, 0.45)' : '1px solid transparent';
                }}
              >
                <AppWindow size={15} color={isFloatingNote ? FILTER_COLORS.sticky : 'currentColor'} />
              </button>
            </Tooltip>

            <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 3px' }} />

            {/* Grupo 2: Vistas y Edición (HTML, Columnas) */}
            <Tooltip placement="bottom" label={language === 'es' ? 'Vista HTML (Ver código fuente)' : 'HTML View (Source code)'}>
            <button
              type="button"
              onClick={() => setIsRaw(!isRaw)}
              style={noteActionBtnStyle(isRaw)}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isRaw ? 'var(--accent-dim)' : 'transparent';
                e.currentTarget.style.color = isRaw ? 'var(--accent-light)' : 'var(--text-muted)';
              }}
            >
              <Braces size={15} />
            </button>
            </Tooltip>

            {/* Cambiar vista */}
            <Tooltip placement="bottom" label={language === 'es' ? `Cambiar vista (Actual: ${layoutMode} columnas)` : `Change view (Current: ${layoutMode} columns)`}>
            <button
              type="button"
              onClick={onToggleLayout}
              style={noteActionBtnStyle(false)}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <PanelLeft size={15} />
            </button>
            </Tooltip>

            {exportMenu}

          </div>
        </div>
      </div>
                {/* Toolbar Container */}
      <div style={{
        display: 'flex', flexDirection: 'column', borderBottom: '1px solid var(--border)',
        flexShrink: 0, background: 'var(--bg-notelist)',
        position: 'relative', // Necesario para que la barra de imagen se posicione absolutamente
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '8px 12px', flexWrap: 'wrap' }}>
          {editor && (
            <>
              <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title={language === 'es' ? 'Deshacer (Ctrl+Z)' : 'Undo (Ctrl+Z)'}><Undo size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title={language === 'es' ? 'Rehacer (Ctrl+Y)' : 'Redo (Ctrl+Y)'}><Redo size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={handleCopySelection} disabled={editor.state.selection.empty} title={language === 'es' ? 'Copiar (Ctrl+C)' : 'Copy (Ctrl+C)'}><Copy size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => { void handlePasteFromClipboard(); }} disabled={readOnly} title={language === 'es' ? 'Pegar (Ctrl+V)' : 'Paste (Ctrl+V)'}><Clipboard size={15} /></ToolbarBtn>
              
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

              <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title={language === 'es' ? 'Negrita' : 'Bold'}><Bold size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title={language === 'es' ? 'Cursiva' : 'Italic'}><Italic size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title={language === 'es' ? 'Subrayado' : 'Underline'}><UnderlineIcon size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title={language === 'es' ? 'Tachado' : 'Strikethrough'}><Strikethrough size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title={language === 'es' ? 'Resaltar' : 'Highlight'}><Highlighter size={15} /></ToolbarBtn>

              <div style={{ position: 'relative' }}>
                <ToolbarBtn
                  onClick={() => setShowFontSizeMenu((v) => !v)}
                  active={!!activeFontSize}
                  title={t.editor.fontSize}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <ALargeSmall size={19} />
                    {activeFontSize && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent-light)', minWidth: 16, textAlign: 'left' }}>
                        {parseInt(activeFontSize, 10)}
                      </span>
                    )}
                  </span>
                </ToolbarBtn>
                {showFontSizeMenu && (
                  <>
                    <div
                      style={{ position: 'fixed', inset: 0, zIndex: 100 }}
                      onClick={() => setShowFontSizeMenu(false)}
                    />
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 101,
                      minWidth: 132, padding: 5, borderRadius: 9,
                      background: 'rgba(10, 10, 18, 0.96)',
                      border: '1px solid var(--border)',
                      boxShadow: '0 10px 28px rgba(0, 0, 0, 0.5)',
                      display: 'flex', flexDirection: 'column', gap: 1,
                    }}>
                      <button
                        type="button"
                        onClick={() => { editor.chain().focus().unsetFontSize().run(); setShowFontSizeMenu(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                          padding: '6px 10px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                          background: !activeFontSize ? 'var(--accent-dim)' : 'transparent',
                          color: !activeFontSize ? 'var(--accent-light)' : 'var(--text-secondary)',
                          border: 'none', textAlign: 'left',
                        }}
                      >
                        {t.editor.fontSizeNormal}
                      </button>
                      {FONT_SIZE_OPTIONS.map((size) => {
                        const isCurrent = activeFontSize === `${size}px`;
                        return (
                          <button
                            key={size}
                            type="button"
                            onClick={() => { editor.chain().focus().setFontSize(`${size}px`).run(); setShowFontSizeMenu(false); }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                              padding: '5px 10px', borderRadius: 6, cursor: 'pointer',
                              background: isCurrent ? 'var(--accent-dim)' : 'transparent',
                              color: isCurrent ? 'var(--accent-light)' : 'var(--text-primary)',
                              border: 'none', textAlign: 'left', fontSize: Math.min(Number(size), 22),
                            }}
                          >
                            {size} px
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
              
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title={language === 'es' ? 'Título 1' : 'Heading 1'}><Heading1 size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title={language === 'es' ? 'Título 2' : 'Heading 2'}><Heading2 size={15} /></ToolbarBtn>
              
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
              
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title={language === 'es' ? 'Lista' : 'Bullet List'}><List size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title={language === 'es' ? 'Lista numerada' : 'Numbered List'}><ListOrdered size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title={language === 'es' ? 'Cita' : 'Blockquote'}><Quote size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title={t.editor.codeBlock}><Code size={15} /></ToolbarBtn>

              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
              
              <ToolbarBtn onClick={handleSetLink} active={editor.isActive('link')} title={language === 'es' ? 'Insertar link' : 'Insert Link'}><LinkIcon size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={handleInsertImage} title={language === 'es' ? 'Insertar imagen' : 'Insert Image'}><ImageIcon size={15} /></ToolbarBtn>

              <div style={{ flex: 1 }} />
            </>
          )}
        </div>

        {/* Barra flotante de formato (estilo Word): solo ante selección de
            texto. Convive con la barra fija y el menú de click derecho. */}
        {editor && !readOnly && (
          <BubbleMenu
            editor={editor}
            tippyOptions={{ placement: 'top', offset: [0, 8], arrow: false }}
            shouldShow={({ editor: e, state }) => {
              if (!e.isEditable) return false;
              const { selection } = state;
              if (selection.empty) return false;
              if ('node' in selection && selection.node) return false;
              return true;
            }}
          >
            <div
              onMouseDown={(e) => e.preventDefault()}
              style={{
                display: 'flex', alignItems: 'center', gap: 2, padding: 5,
                borderRadius: 10, background: 'rgba(10, 10, 18, 0.96)',
                border: '1px solid var(--border)',
                boxShadow: '0 10px 28px rgba(0, 0, 0, 0.5)',
              }}
            >
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title={language === 'es' ? 'Negrita' : 'Bold'}><Bold size={14} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title={language === 'es' ? 'Cursiva' : 'Italic'}><Italic size={14} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title={language === 'es' ? 'Subrayado' : 'Underline'}><UnderlineIcon size={14} /></ToolbarBtn>
              <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 3px' }} />
              <ToolbarBtn
                onClick={() => {
                  const values: (string | null)[] = [null, ...FONT_SIZE_OPTIONS.map((s) => `${s}px`)];
                  const next = values[(values.indexOf(activeFontSize) + 1) % values.length];
                  if (next) editor.chain().focus().setFontSize(next).run();
                  else editor.chain().focus().unsetFontSize().run();
                }}
                active={!!activeFontSize}
                title={t.editor.fontSize}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                  <ALargeSmall size={16} />
                  {activeFontSize && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent-light)', minWidth: 14, textAlign: 'left' }}>
                      {parseInt(activeFontSize, 10)}
                    </span>
                  )}
                </span>
              </ToolbarBtn>
            </div>
          </BubbleMenu>
        )}

        {/* Barra de imagen flotante: posicionada absolutamente para no desplazar el contenido */}
        <AnimatePresence>
          {editor?.isActive('image') && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute',
                top: '100%',
                left: 0,
                right: 0,
                zIndex: 20,
                background: 'rgba(10, 10, 18, 0.92)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderTop: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 16px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>{language === 'es' ? 'Imagen:' : 'Image:'}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <ToolbarBtn onClick={() => editor.chain().focus().updateAttributes('image', { align: 'left' }).run()} active={editor.getAttributes('image').align === 'left'} title={language === 'es' ? 'Izquierda' : 'Left'}><AlignLeft size={14} /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor.chain().focus().updateAttributes('image', { align: 'center' }).run()} active={editor.getAttributes('image').align === 'center'} title={language === 'es' ? 'Centro' : 'Center'}><AlignCenter size={14} /></ToolbarBtn>
                <ToolbarBtn onClick={() => editor.chain().focus().updateAttributes('image', { align: 'right' }).run()} active={editor.getAttributes('image').align === 'right'} title={language === 'es' ? 'Derecha' : 'Right'}><AlignRight size={14} /></ToolbarBtn>
              </div>
              <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 4px' }} />
              <div style={{ display: 'flex', gap: 4 }}>
                {['20%', '40%', '60%', '80%', '100%'].map(size => (
                  <motion.button
                    key={size}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => editor.chain().focus().updateAttributes('image', { width: size }).run()}
                    style={{
                      padding: '4px 8px', fontSize: 10, fontWeight: 700, borderRadius: 4,
                      border: '1px solid var(--border)', cursor: 'pointer',
                      background: editor.getAttributes('image').width === size ? 'var(--accent)' : 'transparent',
                      color: editor.getAttributes('image').width === size ? '#fff' : 'var(--text-muted)',
                    }}
                  >
                    {size}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Editor Area: relative wrapper para que el minimapa flote a la derecha */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', overflow: 'hidden', minHeight: 0 }}>
        {/* Editor Content Container (Scrolling) */}
        <div
          ref={scrollContainerRef}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            paddingRight: showMinimap ? MINIMAP_WIDTH + 10 : 10,
            transition: 'padding-right 0.22s ease',
            position: 'relative',
          }}
        >
        {/* Tooltip en barra vertical de números de línea */}
        {showLineGutter && (
          <Tooltip placement="right" label={language === 'es' ? 'Barra de número de línea' : 'Line numbers gutter'}>
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 50,
                zIndex: 2,
                cursor: 'default',
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openGutterMenu(e.clientX, e.clientY);
              }}
            />
          </Tooltip>
        )}

        <div 
          className={showLineGutter ? 'show-line-numbers' : ''}
          style={{ position: 'relative', cursor: 'text', flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}
          onMouseDown={(e) => {
            if (showLineGutter && e.button === 2) {
              const rect = scrollContainerRef.current?.getBoundingClientRect();
              if (rect && e.clientX >= rect.left && e.clientX <= rect.left + 50) {
                e.stopPropagation();
                return;
              }
            }
            if (e.button === 2 && editor) {
              const { from, to } = editor.state.selection;
              if (from !== to) {
                lastContextMenuTargetRef.current = 'editor';
                lastContextMenuTimeRef.current = Date.now();
                e.preventDefault();
              }
            }
          }}
          onContextMenu={(e) => {
            if (showLineGutter) {
              const rect = scrollContainerRef.current?.getBoundingClientRect();
              if (rect && e.clientX >= rect.left && e.clientX <= rect.left + 50) {
                e.preventDefault();
                e.stopPropagation();
                openGutterMenu(e.clientX, e.clientY);
                return;
              }
            }
            lastContextMenuTargetRef.current = 'editor';
            lastContextMenuTimeRef.current = Date.now();
          }}
          onClick={(e) => {
            if (editor && e.target === e.currentTarget) {
              editor.commands.focus('end');
            }
          }}
        >
          {isRaw ? (
            <textarea
              value={(editor?.getHTML() || '').replace(/(<img\b[^>]*\bsrc=["'])(data:image\/[^"']*)(["'])/gi, '$1[image]$3')}
              readOnly
              style={{
                width: '100%', height: '100%', padding: '0 48px 32px', background: 'transparent',
                color: 'var(--accent-light)', fontFamily: 'var(--font-mono)', fontSize: 'calc(15px * var(--ui-scale))', lineHeight: 1.3,
                border: 'none', outline: 'none', resize: 'none', flex: '1 0 auto',
              }}
            />
          ) : (
            editor && <EditorContent editor={editor} style={{ minHeight: '100%', width: '100%', flex: '1 0 auto' }} />
          )}
        </div>

      </div>

      {/* ─── Minimap (retraíble) ─────────────────────────────────── */}
      {/* Carril de toggle: siempre visible a la derecha del editor */}
      <Tooltip
        placement="left"
        label={showMinimap
          ? (language === 'es' ? 'Ocultar minimapa' : 'Hide minimap')
          : (language === 'es' ? 'Mostrar minimapa' : 'Show minimap')}
      >
        <button
          type="button"
          aria-label={showMinimap ? 'Hide minimap' : 'Show minimap'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onShowMinimapChange?.(!showMinimap)}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const MENU_WIDTH = 180;
            const MENU_HEIGHT = 48;
            const margin = 10;
            let x = e.clientX;
            let y = e.clientY;
            if (x + MENU_WIDTH + margin > window.innerWidth) {
              x = window.innerWidth - MENU_WIDTH - margin;
            }
            if (y + MENU_HEIGHT + margin > window.innerHeight) {
              y = window.innerHeight - MENU_HEIGHT - margin;
            }
            setMinimapMenu({ x: Math.max(margin, x), y: Math.max(margin, y) });
          }}
          style={{
            position: 'absolute',
            right: showMinimap ? MINIMAP_WIDTH : 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 10,
            height: 56,
            zIndex: 8,
            padding: 0,
            border: 'none',
            borderRadius: showMinimap ? '6px 0 0 6px' : '6px 0 0 6px',
            cursor: 'pointer',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'right 0.22s ease, background 0.15s ease',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
            const line = e.currentTarget.querySelector('[data-minimap-rail]') as HTMLElement | null;
            if (line) {
              line.style.background = 'var(--accent)';
              line.style.boxShadow = '0 0 8px var(--accent-glow)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            const line = e.currentTarget.querySelector('[data-minimap-rail]') as HTMLElement | null;
            if (line) {
              line.style.background = 'rgba(255,255,255,0.22)';
              line.style.boxShadow = 'none';
            }
          }}
        >
          <span
            data-minimap-rail
            style={{
              width: 2,
              height: 36,
              borderRadius: 2,
              background: 'rgba(255,255,255,0.22)',
              transition: 'background 0.15s ease, box-shadow 0.15s ease',
            }}
          />
        </button>
      </Tooltip>

      <div
        ref={minimapRef}
        onClick={showMinimap ? handleMinimapClick : undefined}
        onContextMenu={(e) => {
          if (!showMinimap) return;
          e.preventDefault();
          e.stopPropagation();
          const MENU_WIDTH = 180;
          const MENU_HEIGHT = 48;
          const margin = 10;
          let x = e.clientX;
          let y = e.clientY;
          if (x + MENU_WIDTH + margin > window.innerWidth) {
            x = window.innerWidth - MENU_WIDTH - margin;
          }
          if (y + MENU_HEIGHT + margin > window.innerHeight) {
            y = window.innerHeight - MENU_HEIGHT - margin;
          }
          setMinimapMenu({ x: Math.max(margin, x), y: Math.max(margin, y) });
        }}
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: showMinimap ? MINIMAP_WIDTH : 0,
          background: 'rgba(8, 8, 16, 0.85)',
          borderLeft: showMinimap ? '1px solid var(--border)' : '1px solid transparent',
          overflow: 'hidden',
          cursor: showMinimap ? 'pointer' : 'default',
          zIndex: 5,
          userSelect: 'none',
          opacity: showMinimap ? 1 : 0,
          pointerEvents: showMinimap ? 'auto' : 'none',
          transition: 'width 0.22s ease, opacity 0.18s ease, border-color 0.22s ease',
        }}
      >
        {/* Contenido escalado: clona el DOM del ProseMirror con los mismos estilos */}
        <div
          ref={minimapPanRef}
          className={showLineGutter ? 'show-line-numbers' : undefined}
          style={{ pointerEvents: 'none', willChange: 'transform' }}
        >
          <div
            ref={minimapContentRef}
            className="ProseMirror minimap-prose"
            style={{
              width: minimapScale > 0 ? MINIMAP_WIDTH / minimapScale : 1280,
              transform: `scale(${minimapScale})`,
              transformOrigin: 'top left',
              pointerEvents: 'none',
            }}
          />
        </div>
        {/* Indicador de viewport (arrastrable) — actualizado vía DOM directo */}
        <div
          ref={minimapIndicatorRef}
          onMouseDown={handleMinimapIndicatorMouseDown}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            display: 'none', // se muestra vía updateMinimapIndicator()
            background: 'var(--accent)',
            opacity: 0.15,
            borderTop: '1px solid var(--accent)',
            borderBottom: '1px solid var(--accent)',
            cursor: isDragging ? 'grabbing' : 'grab',
            pointerEvents: 'auto',
            transition: isDragging ? 'none' : 'top 0.05s linear, height 0.05s linear',
          }}
        />
      </div>

      {minimapMenu && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100000 }}
            onMouseDown={(e) => { e.preventDefault(); setMinimapMenu(null); }}
          />
          <div
            className="glass-effect"
            style={{
              position: 'fixed',
              left: minimapMenu.x,
              top: minimapMenu.y,
              background: 'var(--bg-modal)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 6,
              zIndex: 100001,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              minWidth: 160,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onShowMinimapChange?.(!showMinimap);
                setMinimapMenu(null);
              }}
              style={{
                textAlign: 'left', padding: '6px 10px', fontSize: 13,
                background: 'transparent', border: 'none', borderRadius: 4,
                color: 'var(--text-primary)', cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {showMinimap
                ? (language === 'es' ? 'Ocultar minimapa' : 'Hide minimap')
                : (language === 'es' ? 'Mostrar minimapa' : 'Show minimap')}
            </button>
          </div>
        </>,
        document.body
      )}

      {gutterMenu && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 100000 }}
            onMouseDown={(e) => { e.preventDefault(); setGutterMenu(null); }}
          />
          <div
            className="glass-effect"
            style={{
              position: 'fixed',
              left: gutterMenu.x,
              top: gutterMenu.y,
              background: 'var(--bg-modal)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 6,
              zIndex: 100001,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              minWidth: 170,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onShowLineGutterChange?.(false);
                setGutterMenu(null);
              }}
              style={{
                textAlign: 'left', padding: '6px 10px', fontSize: 13,
                background: 'transparent', border: 'none', borderRadius: 4,
                color: 'var(--text-primary)', cursor: 'pointer',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {language === 'es' ? 'Ocultar barra de líneas' : 'Hide line numbers'}
            </button>
          </div>
        </>,
        document.body
      )}

      </div>{/* Cierre del wrapper relativo del editor area */}

      <div style={{
        padding: '4px 12px',
        background: 'var(--bg-notelist)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        fontSize: 10,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: 0.3,
        flexShrink: 0,
        minHeight: 28,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
      }}>
        {/* Escala UI — sin etiqueta textual; tooltips descriptivos */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Tooltip placement="top" label={language === 'es' ? 'Reducir escala de interfaz' : 'Decrease UI scale'}>
            <button
              type="button"
              onClick={() => onScaleChange?.(Math.max(0.8, parseFloat((uiScale - 0.05).toFixed(2))))}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', padding: '2px 3px', display: 'flex', outline: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              onMouseDown={e => e.preventDefault()}
            >
              <Minus size={11} />
            </button>
          </Tooltip>

          <Tooltip placement="top" label={language === 'es' ? 'Escala de la interfaz' : 'Interface scale'}>
            <input
              type="range"
              min="0.8"
              max="1.5"
              step="0.05"
              value={uiScale}
              onChange={(e) => onScaleChange?.(parseFloat(e.target.value))}
              onWheel={(e) => {
                e.preventDefault();
                // Rueda hacia abajo = subir escala (convención de la suite)
                const delta = e.deltaY > 0 ? 0.05 : -0.05;
                const next = Math.min(1.5, Math.max(0.8, parseFloat((uiScale + delta).toFixed(2))));
                if (next !== uiScale) onScaleChange?.(next);
              }}
              aria-label={language === 'es' ? 'Escala de interfaz' : 'UI scale'}
              style={{
                width: 64, height: 4, background: 'var(--border)', borderRadius: 2,
                appearance: 'none', outline: 'none', cursor: 'pointer', accentColor: 'var(--accent)',
              }}
            />
          </Tooltip>

          <Tooltip placement="top" label={language === 'es' ? 'Aumentar escala de interfaz' : 'Increase UI scale'}>
            <button
              type="button"
              onClick={() => onScaleChange?.(Math.min(1.5, parseFloat((uiScale + 0.05).toFixed(2))))}
              style={{
                background: 'transparent', border: 'none', color: 'var(--text-muted)',
                cursor: 'pointer', padding: '2px 3px', display: 'flex', outline: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-light)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
              onMouseDown={e => e.preventDefault()}
            >
              <Plus size={11} />
            </button>
          </Tooltip>

          <Tooltip placement="top" label={language === 'es' ? `Escala actual: ${Math.round(uiScale * 100)}%` : `Current scale: ${Math.round(uiScale * 100)}%`}>
            <span style={{ fontSize: 10, fontWeight: 700, minWidth: 30, color: 'var(--accent-light)', textAlign: 'right', cursor: 'default' }}>
              {Math.round(uiScale * 100)}%
            </span>
          </Tooltip>
        </div>

        {/* Indicadores físicos de bloqueo de teclado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Tooltip
            placement="top"
            label={language === 'es'
              ? (isCapsLockActive ? 'Bloq Mayús activado' : 'Bloq Mayús desactivado')
              : (isCapsLockActive ? 'Caps Lock on' : 'Caps Lock off')}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 999,
                border: `1px solid ${isCapsLockActive ? 'var(--accent)' : 'var(--border)'}`,
                background: isCapsLockActive ? 'var(--accent-dim)' : 'rgba(255,255,255,0.03)',
                color: isCapsLockActive ? 'var(--accent-light)' : 'var(--text-muted)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.2,
                opacity: isCapsLockActive ? 1 : 0.72,
                userSelect: 'none',
              }}
            >
              <span aria-hidden="true">⇪</span>
              <span>CAPS</span>
            </span>
          </Tooltip>
          <Tooltip
            placement="top"
            label={language === 'es'
              ? (isNumLockActive ? 'Bloq Num activado' : 'Bloq Num desactivado')
              : (isNumLockActive ? 'Num Lock on' : 'Num Lock off')}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '2px 6px',
                borderRadius: 999,
                border: `1px solid ${isNumLockActive ? 'var(--accent)' : 'var(--border)'}`,
                background: isNumLockActive ? 'var(--accent-dim)' : 'rgba(255,255,255,0.03)',
                color: isNumLockActive ? 'var(--accent-light)' : 'var(--text-muted)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.2,
                opacity: isNumLockActive ? 1 : 0.72,
                userSelect: 'none',
              }}
            >
              <span aria-hidden="true">#</span>
              <span>NUM</span>
            </span>
          </Tooltip>
        </div>

        {/* Métricas compactas: números + tooltips */}
        {(showLineCounter || showWordCounter) && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            flexShrink: 1,
            minWidth: 0,
            overflow: 'hidden',
          }}>
            {showLineCounter && (
              <>
                <Tooltip
                  placement="top"
                  label={language === 'es'
                    ? `Línea ${lineInfo.line}, columna ${lineInfo.col}`
                    : `Line ${lineInfo.line}, column ${lineInfo.col}`}
                >
                  <span style={{ cursor: 'default', padding: '0 6px', opacity: 0.9 }}>
                    {lineInfo.line}:{lineInfo.col}
                  </span>
                </Tooltip>
                <span style={{ opacity: 0.25, userSelect: 'none' }}>·</span>
                <Tooltip
                  placement="top"
                  label={language === 'es'
                    ? `${lineInfo.total} líneas en total`
                    : `${lineInfo.total} lines total`}
                >
                  <span style={{ cursor: 'default', padding: '0 6px', opacity: 0.9 }}>
                    {lineInfo.total}L
                  </span>
                </Tooltip>
              </>
            )}
            {showLineCounter && showWordCounter && (
              <span style={{ opacity: 0.25, userSelect: 'none', margin: '0 2px' }}>|</span>
            )}
            {showWordCounter && (
              <>
                <Tooltip
                  placement="top"
                  label={language === 'es'
                    ? `${textMetrics.words.toLocaleString('es-ES')} palabras`
                    : `${textMetrics.words.toLocaleString('en-US')} words`}
                >
                  <span style={{ cursor: 'default', padding: '0 6px', opacity: 0.9 }}>
                    {textMetrics.words}{language === 'es' ? 'p' : 'w'}
                  </span>
                </Tooltip>
                <span style={{ opacity: 0.25, userSelect: 'none' }}>·</span>
                <Tooltip
                  placement="top"
                  label={language === 'es'
                    ? `${textMetrics.chars.toLocaleString('es-ES')} caracteres`
                    : `${textMetrics.chars.toLocaleString('en-US')} characters`}
                >
                  <span style={{ cursor: 'default', padding: '0 6px', opacity: 0.9 }}>
                    {textMetrics.chars}c
                  </span>
                </Tooltip>
                <span style={{ opacity: 0.25, userSelect: 'none' }}>·</span>
                <Tooltip
                  placement="top"
                  label={language === 'es'
                    ? `Tiempo de lectura estimado: ~${textMetrics.readingTime} min`
                    : `Estimated reading time: ~${textMetrics.readingTime} min`}
                >
                  <span style={{ cursor: 'default', padding: '0 6px', color: 'var(--accent-light)', fontWeight: 600 }}>
                    ~{textMetrics.readingTime}m
                  </span>
                </Tooltip>
              </>
            )}
          </div>
        )}
      </div>

      {contextMenu && editor && createPortal(
        <>
          {/* Backdrop: cierra al mousedown fuera (evita carrera con click del ítem). */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 99999 }}
            onMouseDown={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            ref={contextMenuRef}
            className="glass-effect"
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              background: 'var(--bg-modal)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 6,
              zIndex: 100000,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              minWidth: 160,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
            onMouseDown={(e) => {
              // Evita que el editor pierda la selección / trague el primer click
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => e.stopPropagation()}
          >
          {(() => {
            const itemStyle = (enabled: boolean): React.CSSProperties => ({
              textAlign: 'left',
              padding: '6px 10px',
              fontSize: 13,
              background: 'transparent',
              border: 'none',
              borderRadius: 4,
              cursor: enabled ? 'pointer' : 'default',
              opacity: enabled ? 1 : 0.45,
              color: !enabled ? 'var(--text-muted)' : 'var(--text-primary)',
            });
            const runAction = (fn: () => void) => {
              try { fn(); } finally { setContextMenu(null); }
            };
            const MenuBtn = ({
              icon,
              label,
              enabled,
              onAction,
              danger,
              extraStyle,
            }: {
              icon?: React.ReactNode;
              label: string;
              enabled: boolean;
              onAction: () => void;
              danger?: boolean;
              extraStyle?: React.CSSProperties;
            }) => (
              <button
                type="button"
                disabled={!enabled}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!enabled) return;
                  runAction(onAction);
                }}
                style={{
                  ...itemStyle(enabled),
                  ...extraStyle,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
                onMouseEnter={e => {
                  if (enabled) (e.currentTarget as HTMLElement).style.background = danger ? 'var(--danger-dim)' : 'var(--bg-hover)';
                }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {icon && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, color: danger ? 'var(--danger)' : 'inherit', flexShrink: 0 }}>
                    {icon}
                  </span>
                )}
                <span style={{ flex: 1 }}>{label}</span>
              </button>
            );

            const copySelectionOrImage = async () => {
              if (contextMenu.imageSrc) {
                const ok = await window.cyberNotesAPI.writeImageToClipboard(contextMenu.imageSrc);
                if (ok) return;
              }
              document.execCommand('copy');
            };

            const copyLabel = contextMenu.imageSrc
              ? (language === 'es' ? 'Copiar imagen' : 'Copy image')
              : (language === 'es' ? 'Copiar' : 'Copy');

            return (
              <>
          {contextMenu.suggestions && contextMenu.suggestions.length > 0 && (
            <>
              {contextMenu.suggestions.map((suggestion: string) => (
                <button
                  key={suggestion}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    runAction(() => {
                      window.cyberNotesAPI?.replaceMisspelling?.(suggestion);
                    });
                  }}
                  style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >{suggestion}</button>
              ))}
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            </>
          )}

          {contextMenu.misspelledWord && (
            <>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  runAction(() => {
                    window.cyberNotesAPI?.addToDictionary?.(contextMenu.misspelledWord!);
                  });
                }}
                style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--success)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <BookPlus size={13} style={{ flexShrink: 0 }} />
                <span>{language === 'es' ? `Agregar "${contextMenu.misspelledWord}" al diccionario` : `Add "${contextMenu.misspelledWord}" to dictionary`}</span>
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            </>
          )}

          {contextMenu.linkHref && (
            <>
              <MenuBtn
                icon={<ExternalLink size={13} />}
                label={language === 'es' ? 'Abrir en navegador' : 'Open in browser'}
                enabled
                extraStyle={{ color: 'var(--accent-light)', fontWeight: 600 }}
                onAction={() => { window.open(contextMenu.linkHref, '_blank'); }}
              />
              <MenuBtn
                icon={<Pencil size={13} />}
                label={language === 'es' ? 'Editar enlace' : 'Edit link'}
                enabled
                onAction={() => { setEditLinkData({ href: contextMenu.linkHref! }); }}
              />
              <MenuBtn
                icon={<Unlink size={13} />}
                label={language === 'es' ? 'Eliminar enlace' : 'Remove link'}
                enabled
                danger
                onAction={() => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); }}
              />
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            </>
          )}

          <MenuBtn
            icon={<Undo size={13} />}
            label={language === 'es' ? 'Deshacer' : 'Undo'}
            enabled={contextMenu.canUndo}
            onAction={() => {
              if (contextMenu.target === 'title') {
                titleInputRef.current?.focus();
                document.execCommand('undo');
              } else {
                editor.chain().focus().undo().run();
              }
            }}
          />
          <MenuBtn
            icon={<Redo size={13} />}
            label={language === 'es' ? 'Rehacer' : 'Redo'}
            enabled={contextMenu.canRedo}
            onAction={() => {
              if (contextMenu.target === 'title') {
                titleInputRef.current?.focus();
                document.execCommand('redo');
              } else {
                editor.chain().focus().redo().run();
              }
            }}
          />
          
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <MenuBtn
            icon={<Scissors size={13} />}
            label={language === 'es' ? 'Cortar' : 'Cut'}
            enabled={contextMenu.hasSelection}
            onAction={() => { document.execCommand('cut'); }}
          />
          <MenuBtn
            icon={<Copy size={13} />}
            label={copyLabel}
            enabled={contextMenu.hasSelection || !!contextMenu.imageSrc}
            onAction={() => { void copySelectionOrImage(); }}
          />
          <MenuBtn
            icon={<Clipboard size={13} />}
            label={language === 'es' ? 'Pegar' : 'Paste'}
            enabled={contextMenu.canPaste}
            onAction={() => {
              navigator.clipboard.readText().then(text => {
                if (contextMenu.target === 'title') {
                  const input = titleInputRef.current;
                  if (input) {
                    const start = input.selectionStart || 0;
                    const end = input.selectionEnd || 0;
                    const val = input.value;
                    const newVal = val.slice(0, start) + text + val.slice(end);
                    updateTitle(newVal);
                    setTimeout(() => {
                      input.setSelectionRange(start + text.length, start + text.length);
                    }, 0);
                  }
                } else {
                  editor.chain().focus().insertContent(text).run();
                }
              }).catch(() => {
                document.execCommand('paste');
              });
            }}
          />
          
          <MenuBtn
            icon={<CheckSquare size={13} />}
            label={language === 'es' ? 'Seleccionar todo' : 'Select all'}
            enabled={contextMenu.hasContent}
            onAction={() => {
              if (contextMenu.target === 'title') {
                titleInputRef.current?.select();
              } else {
                editor.chain().focus().selectAll().run();
              }
            }}
          />
          
          <MenuBtn
            icon={<Trash2 size={13} />}
            label={t.general.delete}
            enabled={contextMenu.hasSelection}
            danger
            onAction={() => {
              if (contextMenu.target === 'title') {
                const input = titleInputRef.current;
                if (input) {
                  const start = input.selectionStart || 0;
                  const end = input.selectionEnd || 0;
                  const val = input.value;
                  const newVal = val.slice(0, start) + val.slice(end);
                  updateTitle(newVal);
                  setTimeout(() => {
                    input.setSelectionRange(start, start);
                  }, 0);
                }
              } else {
                editor.chain().focus().deleteSelection().run();
              }
            }}
          />

            {/* Formato de texto enriquecido: no aplica al título (input de texto plano). */}
          {contextMenu.target !== 'title' && (() => {
            const canClearFormatting = (() => {
              if (!editor) return false;
              const { from, to, empty } = editor.state.selection;
              if (empty) return false;

              let hasFormatting = false;
              editor.state.doc.nodesBetween(from, to, (node) => {
                if (hasFormatting) return false;
                if (node.marks && node.marks.length > 0) {
                  hasFormatting = true;
                  return false;
                }
                if (node.isBlock && node.type.name !== 'paragraph' && node.type.name !== 'doc') {
                  hasFormatting = true;
                  return false;
                }
              });
              return hasFormatting;
            })();

            return (
              <>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                <MenuBtn
                  icon={<Bold size={13} />}
                  label={language === 'es' ? 'Negrita' : 'Bold'}
                  enabled
                  extraStyle={{ fontWeight: 'bold' }}
                  onAction={() => { editor.chain().focus().toggleBold().run(); }}
                />
                <MenuBtn
                  icon={<Italic size={13} />}
                  label={language === 'es' ? 'Cursiva' : 'Italic'}
                  enabled
                  extraStyle={{ fontStyle: 'italic' }}
                  onAction={() => { editor.chain().focus().toggleItalic().run(); }}
                />
                <MenuBtn
                  icon={<UnderlineIcon size={13} />}
                  label={language === 'es' ? 'Subrayado' : 'Underline'}
                  enabled
                  extraStyle={{ textDecoration: 'underline' }}
                  onAction={() => { editor.chain().focus().toggleUnderline().run(); }}
                />

                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                <MenuBtn
                  icon={<RemoveFormatting size={13} />}
                  label={language === 'es' ? 'Limpiar formato' : 'Clear formatting'}
                  enabled={canClearFormatting}
                  onAction={() => { editor.chain().focus().clearNodes().unsetAllMarks().run(); }}
                />
              </>
            );
          })()}
              </>
            );
          })()}
          </div>
        </>,
        document.body
      )}

      {/* Modal Editar Enlace */}
      {editLinkData && editor && (
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg-editor-glass)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }} onClick={() => setEditLinkData(null)}>
          <div style={{
            background: 'var(--bg-modal)', padding: 24, borderRadius: 'var(--radius-lg)',
            width: 400, display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid var(--border)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)', fontWeight: 600 }}>{language === 'es' ? 'Editar enlace' : 'Edit link'}</h3>
            <input
              autoFocus
              type="url"
              value={editLinkData.href}
              onChange={e => setEditLinkData({ href: e.target.value })}
              className="input"
              placeholder="https://"
              onContextMenu={linkInputMenu.onContextMenu}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                   if (editLinkData.href === '') {
                     editor.chain().focus().extendMarkRange('link').unsetLink().run();
                   } else {
                     if (editor.state.selection.empty && !editor.isActive('link')) {
                       editor.chain().focus().insertContent(`<a target="_blank" rel="noopener noreferrer" href="${editLinkData.href}">${editLinkData.href}</a> `).run();
                     } else {
                       editor.chain().focus().extendMarkRange('link').setLink({ href: editLinkData.href }).run();
                     }
                   }
                   setEditLinkData(null);
                }
                if (e.key === 'Escape') setEditLinkData(null);
              }}
            />
            <div className="modal-actions">
              <button type="button" className="modal-action-btn is-cancel" onClick={() => setEditLinkData(null)}>
                {t.general.cancel}
                <span className="modal-key-esc">Esc</span>
              </button>
              <button type="button" className="modal-action-btn is-save" onClick={() => {
                 if (editLinkData.href === '') {
                   editor.chain().focus().extendMarkRange('link').unsetLink().run();
                 } else {
                   if (editor.state.selection.empty && !editor.isActive('link')) {
                     editor.chain().focus().insertContent(`<a target="_blank" rel="noopener noreferrer" href="${editLinkData.href}">${editLinkData.href}</a> `).run();
                   } else {
                     editor.chain().focus().extendMarkRange('link').setLink({ href: editLinkData.href }).run();
                   }
                 }
                 setEditLinkData(null);
              }}>
                {t.general.save}
                <EnterGlyph />
              </button>
            </div>

            {linkInputMenu.menu}
          </div>
        </div>
      )}

      {createPortal(
        <div
          style={{
            position: 'fixed',
            top: 48,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
            zIndex: 100000,
            padding: '0 16px',
          }}
        >
          <AnimatePresence>
            {capsToast && (
              <motion.div
                key="caps-toast"
                initial={{ opacity: 0, y: -10, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                style={{
                  background: 'var(--bg-modal)',
                  border: '1px solid var(--accent)',
                  color: 'var(--accent-light)',
                  padding: '8px 18px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  fontWeight: 600,
                  boxShadow: '0 8px 28px rgba(0,0,0,0.45), 0 0 16px var(--accent-glow)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  maxWidth: 'min(420px, 92vw)',
                }}
                className="glass-effect"
              >
                <span style={{ color: 'var(--accent)' }} aria-hidden>ℹ️</span>
                <span>{capsToast}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}

      {/* Caso B — Aviso al salir del editor con cambios sin guardar (modo manual) */}
      {createPortal(
        <AnimatePresence>
          {showLeaveEditorWarning && (
            <motion.div
              key="leave-editor"
              {...modalOverlayMotion}
              style={{ ...modalOverlayStyle, zIndex: 20000 }}
              onClick={() => setShowLeaveEditorWarning(false)}
            >
              <motion.div
                {...modalCardMotion}
                className="glass-effect"
                style={{
                  width: 'calc(420px * var(--ui-scale))',
                  background: 'rgba(15, 15, 22, 0.95)',
                  border: '1px solid rgba(234, 88, 12, 0.3)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '24px 28px',
                  boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(234, 88, 12, 0.05)',
                  display: 'flex', flexDirection: 'column', gap: 20,
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: 'rgba(234, 88, 12, 0.1)',
                    border: '1px solid rgba(234, 88, 12, 0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(234, 88, 12, 0.6))' }}>
                      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <h3 style={{ fontSize: 'calc(16px * var(--ui-scale))', fontWeight: 700, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
                      {language === 'es' ? '¿Salir sin guardar?' : 'Leave without saving?'}
                    </h3>
                    <p style={{ fontSize: 'calc(12px * var(--ui-scale))', color: 'var(--text-muted)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                      {language === 'es'
                        ? 'Si sales del editor perderás los cambios sin guardar de esta nota.'
                        : 'If you leave the editor you will lose this note’s unsaved changes.'}
                    </p>
                  </div>
                </div>

                <div className="modal-actions is-stack">
                  <button type="button" className="modal-action-btn is-save" onClick={() => { handleManualSave(); setShowLeaveEditorWarning(false); }}>
                    {language === 'es' ? 'Guardar' : 'Save'}
                    <EnterGlyph />
                  </button>
                  <button type="button" className="modal-action-btn is-danger" onClick={() => { handleRevertToSaved(); setShowLeaveEditorWarning(false); }}>
                    {language === 'es' ? 'Salir sin guardar' : 'Leave without saving'}
                  </button>
                  <button type="button" className="modal-action-btn is-cancel" onClick={() => { setShowLeaveEditorWarning(false); editor?.commands.focus(); }}>
                    {language === 'es' ? 'Seguir editando' : 'Keep editing'}
                    <span className="modal-key-esc">Esc</span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      <style>{`
        .ProseMirror {
          caret-color: var(--text-primary) !important;
        }
        @keyframes cyber-border-pulse {
          0%, 100% {
            border-color: var(--accent);
            filter: brightness(1);
          }
          33% {
            border-color: #ff007f;
            filter: brightness(1.02);
          }
          66% {
            border-color: #00f0ff;
            filter: brightness(1.02);
          }
        }
      `}</style>
    </div>
  );
}
