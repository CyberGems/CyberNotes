import { useEffect, useRef, useCallback, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useInputContextMenu } from '../hooks/useInputContextMenu';
import { motion, AnimatePresence } from 'motion/react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Highlight from '@tiptap/extension-highlight';
import { Note, Folder } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import { playSynthSound } from '../utils/audio';
import Tooltip from './Tooltip';
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Heading1, Heading2, List, ListOrdered, Link as LinkIcon,
  Image as ImageIcon, Highlighter, Quote, Minus, Code,
  Plus, Pin, Keyboard, AlignLeft, AlignCenter, AlignRight, Braces, PanelLeft,
  Undo, Redo, Save, Download, X
} from 'lucide-react';

interface Props {
  language: Language;
  note: Note | null;
  onSave: (note: Note) => void;
  onCreateNote: () => void;
  layoutMode: number;
  onToggleLayout: () => void;
  showLineCounter?: boolean;
  showLineGutter?: boolean;
  showWordCounter?: boolean;
  autosaveEnabled?: boolean;
  autoUnlockCapsLock?: boolean;
  autoUnlockCapsLockTimeout?: number;
  onAutoUnlockCapsLockChange?: (v: boolean) => void;
  capsLockSound?: string;
  capsLockSoundScope?: string;
  uiScale?: number;
  onScaleChange?: (scale: number) => void;
  openNoteIds?: string[];
  notes?: Note[];
  folders?: Folder[];
  onSelectNote?: (id: string) => void;
  onCloseTab?: (id: string) => void;
  draftCache?: Record<string, { title: string; content: string }>;
  onEditDraft?: (id: string, title: string, content: string) => void;
  onDiscardDraft?: (id: string) => void;
  tabsWidthMode?: 'normal' | 'wide';
  showMinimap?: boolean;
  onShowMinimapChange?: (v: boolean) => void;
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

function extractPreview(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').slice(0, 200).replace(/\s+/g, ' ');
}

const ToolbarBtn = ({
  onClick, active = false, title, children, disabled = false,
}: { onClick: () => void; active?: boolean; title: string; children: React.ReactNode; disabled?: boolean }) => (
  <Tooltip label={title} placement="bottom">
    <motion.button
      whileHover={{ scale: 1.05, background: 'var(--bg-hover)' }}
      whileTap={{ scale: 0.95 }}
      onMouseDown={(e) => e.preventDefault()} // CRÍTICO: Previene pérdida de foco
      onClick={onClick}
      disabled={disabled}
      className="btn-icon"
      style={{
        background: active ? 'var(--accent-dim)' : 'transparent',
        color: active ? 'var(--accent-light)' : 'var(--text-muted)',
        border: active ? '1px solid var(--accent)' : '1px solid transparent',
        borderRadius: 6,
        padding: '6px 8px',
        transition: 'color 0.2s, border 0.2s',
        opacity: disabled ? 0.4 : 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </motion.button>
  </Tooltip>
);

export default function NoteEditor({ 
  language,
  note, 
  onSave, 
  onCreateNote, 
  layoutMode, 
  onToggleLayout, 
  showLineCounter, 
  showLineGutter = true,
  showWordCounter = false,
  autosaveEnabled = true,
  autoUnlockCapsLock = false,
  autoUnlockCapsLockTimeout = 8,
  onAutoUnlockCapsLockChange,
  capsLockSound = 'cyber-beep',
  capsLockSoundScope = 'app',
  uiScale = 1.0,
  onScaleChange,
  openNoteIds = [],
  notes = [],
  folders = [],
  onSelectNote,
  onCloseTab,
  draftCache = {},
  onEditDraft,
  onDiscardDraft,
  tabsWidthMode = 'normal',
  showMinimap = false,
  onShowMinimapChange,
}: Props) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentNoteRef = useRef<Note | null>(note);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const isSelectionChangingRef = useRef(false);
  const lastContextMenuTargetRef = useRef<'title' | 'editor'>('editor');
  const lastContextMenuTimeRef = useRef(0);
  const isDirtyRef = useRef(false);
  const tabStripRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const minimapRef = useRef<HTMLDivElement>(null);
  const [overscrollOffset, setOverscrollOffset] = useState(0);

  // ─── Minimap state ──────────────────────────────────────────────
  const minimapIndicatorRef = useRef<HTMLDivElement>(null);
  const minimapContentRef = useRef<HTMLDivElement>(null);
  const showMinimapRef = useRef(showMinimap);
  showMinimapRef.current = showMinimap; // mantener actualizado para callbacks estables
  const editorRef = useRef<any>(null); // inicializado con null; editor se declara más abajo
  const [minimapScale, setMinimapScale] = useState(0.075);
  const [minimapMenu, setMinimapMenu] = useState<{ x: number; y: number } | null>(null);
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

  // Actualizar indicador vía DOM directo (sin React → sin re-renders en scroll)
  const updateMinimapIndicator = useCallback(() => {
    const el = scrollContainerRef.current;
    const indicator = minimapIndicatorRef.current;
    if (!el || !indicator) return;
    const total = el.scrollHeight;
    const view = el.clientHeight;
    const top = el.scrollTop;
    if (total > 0) {
      indicator.style.top = `${(top / total) * 100}%`;
      indicator.style.height = `${(view / total) * 100}%`;
      indicator.style.display = 'block';
    } else {
      indicator.style.display = 'none';
    }
  }, []);

  // Sincronizar HTML del minimap desde el editor (con rAF para esperar a setContent)
  const syncMinimapHtml = useCallback(() => {
    if (!showMinimapRef.current) return;
    requestAnimationFrame(() => {
      if (!minimapContentRef.current || !editorRef.current) return;
      const html = editorRef.current.getHTML();
      minimapContentRef.current.innerHTML = html;
      updateMinimapIndicator();
    });
  }, [updateMinimapIndicator]);

  // Calcular la escala del minimapa basada en el ancho real del editor
  useEffect(() => {
    if (!showMinimap) return;
    const updateScale = () => {
      const el = scrollContainerRef.current;
      if (!el) return;
      const editorWidth = el.clientWidth;
      if (editorWidth > 0) {
        setMinimapScale(MINIMAP_WIDTH / editorWidth);
      }
    };
    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (scrollContainerRef.current) observer.observe(scrollContainerRef.current);
    return () => observer.disconnect();
  }, [showMinimap, note?.id]);

  // Poblar minimap solo al activarlo (el cambio de nota lo maneja syncMinimapHtml)
  useEffect(() => {
    if (!showMinimap) return;
    syncMinimapHtml();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMinimap]);

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
    if (!el || !mm) return;
    const rect = mm.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
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

  useEffect(() => {
    const el = tabStripRef.current;
    if (!el) return;

    let bounceTimeout: ReturnType<typeof setTimeout> | null = null;

    const handleWheel = (e: WheelEvent) => {
      if (el.scrollWidth > el.clientWidth) {
        e.preventDefault();
        
        const oldScrollLeft = el.scrollLeft;
        el.scrollLeft += e.deltaY;
        
        if (el.scrollLeft === oldScrollLeft) {
          // Límite alcanzado, calcular el desplazamiento elástico
          const pull = -e.deltaY * 0.15;
          setOverscrollOffset(prev => Math.min(30, Math.max(-30, prev + pull)));
          
          if (bounceTimeout) clearTimeout(bounceTimeout);
          bounceTimeout = setTimeout(() => {
            setOverscrollOffset(0);
          }, 150);
        } else {
          setOverscrollOffset(0);
        }
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleWheel);
      if (bounceTimeout) clearTimeout(bounceTimeout);
    };
  }, [openNoteIds]);

  // Scroll a la pestaña activa cuando se selecciona una nota desde la lista
  // (incluso si la pestaña ya estaba abierta pero fuera de vista)
  useEffect(() => {
    if (!note?.id) return;
    const strip = tabStripRef.current;
    if (!strip) return;
    const tab = strip.querySelector(`[data-note-id="${note.id}"]`) as HTMLElement | null;
    if (tab) {
      tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [note?.id]);

  // Sincronizar ref con cada render para que scheduleAutoSave siempre tenga la note actual
  const [pinned, setPinned] = useState(note?.pinned === 1);
  const [isRaw, setIsRaw] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, linkHref?: string, suggestions?: string[], misspelledWord?: string, target?: 'title' | 'editor' } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const linkInputMenu = useInputContextMenu(language);
  const [editLinkData, setEditLinkData] = useState<{ href: string } | null>(null);
  const [hoveredLink, setHoveredLink] = useState<string | null>(null);
  const [lineInfo, setLineInfo] = useState({ line: 1, col: 1, total: 1 });
  const [textMetrics, setTextMetrics] = useState({ words: 0, chars: 0, readingTime: 0 });
  const [localTitle, setLocalTitle] = useState(note?.title || '');
  const localTitleRef = useRef(localTitle);

  const updateTitle = (newTitle: string) => {
    setLocalTitle(newTitle);
    localTitleRef.current = newTitle;
    const current = currentNoteRef.current;
    if (current) {
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
  const [timeLeft, setTimeLeft] = useState(0);
  const [capsToast, setCapsToast] = useState<string | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevCapsActiveRef = useRef<boolean | null>(null);
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
      if (window.cyberNotesAPI && window.cyberNotesAPI.checkCapsLock) {
        const isActive = await window.cyberNotesAPI.checkCapsLock();
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
      setIsCapsLockActive(!!capActive);

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

  // 3. State transition toast trigger for physical CapsLock toggles
  useEffect(() => {
    // Avoid firing toast on the very first cold mount
    if (prevCapsActiveRef.current === null) {
      prevCapsActiveRef.current = isCapsLockActive;
      return;
    }

    if (prevCapsActiveRef.current !== isCapsLockActive) {
      if (isCapsLockActive) {
        setCapsToast(language === 'es' ? "Bloq Mayús: ACTIVADO ⚠️" : "Caps Lock: ON ⚠️");
      } else {
        // If it was auto-unlocked (timeLeft === 0), show a special Auto-desactivado toast.
        // Works for both countdown-to-zero (timeout > 0) and instant mode (timeout === 0).
        if (autoUnlockCapsLock && timeLeft === 0) {
          setCapsToast(language === 'es' ? "Bloq Mayús: AUTO-DESACTIVADO 💡" : "Caps Lock: AUTO-UNLOCKED 💡");
        } else {
          setCapsToast(language === 'es' ? "Bloq Mayús: DESACTIVADO ✅" : "Caps Lock: OFF ✅");
        }
      }

      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => {
        setCapsToast(null);
      }, 2000);

      prevCapsActiveRef.current = isCapsLockActive;
    }
  }, [isCapsLockActive, autoUnlockCapsLock, timeLeft, language, autoUnlockCapsLockTimeout]);

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

  // 3.7 Global sound trigger for Caps Lock state changes (from background worker)
  useEffect(() => {
    if (capsLockSoundScope !== 'global') return;

    if (window.cyberNotesAPI && window.cyberNotesAPI.onGlobalCapsLockChanged) {
      const unsubscribe = window.cyberNotesAPI.onGlobalCapsLockChanged((_active) => {
        if (capsLockSound && capsLockSound !== 'off') {
          playSynthSound(capsLockSound);
        }
      });
      return unsubscribe;
    }
  }, [capsLockSoundScope, capsLockSound]);

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
    const closeMenu = () => {
      setContextMenu(null);
      setShowExportMenu(false);
    };
    document.addEventListener('click', closeMenu);
    
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
        setContextMenu({
          x: mousePos.x,
          y: mousePos.y,
          linkHref: data.linkURL,
          suggestions: data.suggestions || [],
          misspelledWord: data.misspelledWord || '',
          target: lastContextMenuTargetRef.current
        });
      });
    }
    
    return () => {
      document.removeEventListener('click', closeMenu);
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
    ],
    editorProps: {
      attributes: {
        spellcheck: 'true',
      },
    },
    content: '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      if (!isSelectionChangingRef.current) {
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
        if (current) {
          if (autosaveEnabledRef.current) {
            const preview = extractPreview(html);
            onSave({ ...current, content: html, preview });
            isDirtyRef.current = false;
          } else {
            // Modo manual: NO persistir al perder el foco; solo mantener el borrador al día.
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
        if (target && !goesToTitle && !goesInsideEditor && !goesToNav) {
          setShowLeaveEditorWarning(true);
        }
      }
    },
  });

  // Sincronizar editorRef después de que useEditor lo haya inicializado
  editorRef.current = editor;

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
    if (!editor || !note) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const html = editor.getHTML();
    const preview = extractPreview(html);
    onSave({ ...note, content: html, title: localTitle, preview });
    setHasUnsavedChanges(false);
    isDirtyRef.current = false;
  }, [editor, note, localTitle, onSave]);

  // Descarta el borrador y restaura el editor al último estado guardado en disco.
  const handleRevertToSaved = useCallback(() => {
    if (!editor || !note) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    isSelectionChangingRef.current = true;
    const content = note.content || '';
    if (content.trim().startsWith('{')) {
      try {
        editor.commands.setContent(JSON.parse(content), false);
      } catch {
        editor.commands.setContent(content, false);
      }
    } else {
      editor.commands.setContent(content, false);
    }
    setLocalTitle(note.title || '');
    localTitleRef.current = note.title || '';
    isDirtyRef.current = false;
    setHasUnsavedChanges(false);
    onDiscardDraft?.(note.id);
    syncMinimapHtml();
    setTimeout(() => { isSelectionChangingRef.current = false; }, 100);
  }, [editor, note, onDiscardDraft]);

  // Sincronizar estado de cambios no guardados con el proceso principal
  useEffect(() => {
    window.cyberNotesAPI?.setUnsavedChanges(hasUnsavedChanges);
  }, [hasUnsavedChanges]);

  // Actualizar editor cuando cambia la nota seleccionada o cuando se monta/desmonta
  useEffect(() => {
    const draft = note ? draftCache[note.id] : null;
    setPinned(note?.pinned === 1);
    setLocalTitle(draft ? draft.title : (note?.title || ''));
    localTitleRef.current = draft ? draft.title : (note?.title || '');
    setHasUnsavedChanges(!!draft);

    if (!editor || !note) return;
    
    // Set selection changing flag to true to ignore programmatic updates
    isSelectionChangingRef.current = true;
    isDirtyRef.current = false;

    if (saveTimer.current) clearTimeout(saveTimer.current);

    // Carga inteligente: intenta parsear JSON, si falla carga como HTML
    const content = draft ? draft.content : (note.content || '');
    if (content.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(content);
        editor.commands.setContent(parsed, false);
      } catch (e) {
        editor.commands.setContent(content, false);
      }
    } else {
      editor.commands.setContent(content, false);
    }

    updateTextMetrics(editor);
    updateLineInfo(editor);

    // Sincronizar minimap con el nuevo contenido de la nota
    syncMinimapHtml();
    
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

    // Reset selection changing flag after all synchronous & immediate asynchronous updates
    const timeoutId = setTimeout(() => {
      isSelectionChangingRef.current = false;
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      // Closure-based safeguard: flush save immediately when note changes or unmounts.
      // En modo manual NO persistimos: el borrador ya está al día en draftCache.
      if (saveTimer.current && isDirtyRef.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
        const current = currentNoteRef.current;
        if (current && editor && autosaveEnabledRef.current) {
          const html = editor.getHTML();
          const preview = extractPreview(html);
          onSave({ ...current, content: html, preview });
          isDirtyRef.current = false;
        }
      }
    };
  }, [note?.id, editor]);

  // Sincronizar ref con la note prop cuando cambia (mismo id, nuevo ref)
  useEffect(() => {
    currentNoteRef.current = note;
  }, [note]);

  const scheduleAutoSave = useCallback((html: string) => {
    if (!autosaveEnabled) {
      setHasUnsavedChanges(true);
      const current = currentNoteRef.current;
      if (current) {
        onEditDraft?.(current.id, localTitleRef.current, html);
      }
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const current = currentNoteRef.current;
      if (!current) return;
      const preview = extractPreview(html);
      onSave({ ...current, content: html, preview });
      isDirtyRef.current = false;
    }, 500);
  }, [onSave, autosaveEnabled]);

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
    setShowExportMenu(false);
  };

  const handleExportHtml = () => {
    if (!note) return;
    const editorHtml = editor?.getHTML() || '';
    const title = note.title || 'Nota';
    const htmlContent = `<!DOCTYPE html>
<html lang="es">
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

    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${title.toLowerCase().replace(/\s+/g, '-')}.html`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setShowExportMenu(false);
  };

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

  const t = TRANSLATIONS[language];

  if (!note) {
    return (
      <div className="glass-effect editor-glass" style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', background: 'var(--bg-editor)', gap: 16, color: 'var(--text-muted)',
      }}>
        <motion.span 
          animate={{ y: [0, -10, 0] }} 
          transition={{ repeat: Infinity, duration: 3 }}
          style={{ fontSize: 48, opacity: 0.2 }}
        >✏️</motion.span>
        <p style={{ fontSize: 15 }}>{language === 'es' ? 'Selecciona o crea una nota' : 'Select or create a note'}</p>
        <button className="btn btn-primary" onClick={onCreateNote} style={{ gap: 6 }}>
          <Plus size={15} /> {language === 'es' ? 'Nueva nota' : 'New note'}
        </button>
        <button className="btn btn-ghost" onClick={onToggleLayout} style={{ gap: 6, marginTop: 12 }}>
          <PanelLeft size={15} /> {language === 'es' ? 'Cambiar vista' : 'Switch view'}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={editorRootRef}
      className={`glass-effect editor-glass ${isFocused ? 'focused-immersive' : ''}`}
      style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-editor)', overflow: 'hidden' }}
    >
      {/* Pestañas (Tabs) Premium */}
      {openNoteIds.length > 0 && (
        <div style={{ background: 'rgba(10, 10, 15, 0.95)', borderBottom: '1px solid var(--border)', overflow: 'hidden' }}>
          <div 
            ref={tabStripRef} 
            className={`tab-strip ${tabsWidthMode === 'wide' ? 'tabs-wide' : ''}`}
            style={{
              transform: `translateX(${overscrollOffset}px)`,
              transition: overscrollOffset === 0 ? 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)' : 'none',
              borderBottom: 'none',
            }}
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

              return (
                <Tooltip
                  key={tabId}
                  placement="bottom"
                  label={
                    <>
                      <span style={{ fontWeight: 600 }}>{displayTitle || (language === 'es' ? 'Sin título' : 'Untitled')}</span>
                      {folder?.name && (
                        <span style={{ fontSize: 9, color: folder.color || 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {folder.name}
                        </span>
                      )}
                    </>
                  }
                >
                <div
                  data-note-id={tabId}
                  className={`editor-tab ${isActive ? 'active' : ''}`}
                  onClick={() => onSelectNote?.(tabId)}
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
                        background: 'var(--accent)',
                        boxShadow: '0 0 8px var(--accent-glow)',
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

                  <span className="editor-tab-title" style={{ fontStyle: isDirty ? 'italic' : 'normal' }}>
                    {displayTitle || (language === 'es' ? 'Sin título' : 'Untitled')}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, position: 'relative' }}>
                    <button
                      className="tab-close-btn"
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
        
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <input
              ref={titleInputRef}
              value={localTitle}
              onChange={e => updateTitle(e.target.value)}
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
                border: '1px solid rgba(255, 255, 255, 0.05)',
                outline: 'none',
                color: 'var(--text-primary)',
                marginBottom: 4,
                letterSpacing: '-0.02em',
                padding: '8px 16px',
                borderRadius: 'var(--radius-md)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.2)',
              }}
              onFocus={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 10px var(--accent-glow), inset 0 1px 3px rgba(0,0,0,0.2)';
              }}
              onBlur={e => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                e.currentTarget.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.2)';
              }}
            />
          </div>
          
          {/* Note-Level Actions Toolbar Panel */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 6, 
            flexShrink: 0,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border)',
            padding: '4px 6px',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          }}>
            {/* Countdown Timer Badge */}
            <AnimatePresence>
              {autoUnlockCapsLock && isCapsLockActive && timeLeft > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, x: 5 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: 5 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: 'var(--text-muted)',
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 10,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    pointerEvents: 'none',
                    whiteSpace: 'nowrap',
                    gap: 4,
                    animation: 'cyber-warning-pulse-border 1.5s infinite ease-in-out',
                  }}
                >
                  <span>⏱️</span>
                  <span>
                    {(() => {
                      if (timeLeft < 60) return `${timeLeft}s`;
                      if (timeLeft < 3600) {
                        const m = Math.floor(timeLeft / 60);
                        const s = timeLeft % 60;
                        return `${m}:${s < 10 ? '0' : ''}${s}`;
                      }
                      const h = Math.floor(timeLeft / 3600);
                      const m = Math.floor((timeLeft % 3600) / 60);
                      return `${h}h ${m}m`;
                    })()}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Auto-Unlock CapsLock */}
            <Tooltip placement="bottom" label={isCapsLockActive
              ? (language === 'es'
                  ? `Bloq Mayús ACTIVO (Auto-desactivar: ${autoUnlockCapsLock ? 'ENCENDIDO' : 'APAGADO'})`
                  : `Caps Lock ACTIVE (Auto-unlock: ${autoUnlockCapsLock ? 'ON' : 'OFF'})`)
              : (language === 'es'
                  ? `Desactivar Bloq Mayús por inactividad (Estado: ${autoUnlockCapsLock ? 'ACTIVO' : 'INACTIVO'})`
                  : `Disable Caps Lock on inactivity (Status: ${autoUnlockCapsLock ? 'ACTIVE' : 'INACTIVE'})`)}>
            <button
              onClick={() => {
                const nextVal = !autoUnlockCapsLock;
                onAutoUnlockCapsLockChange?.(nextVal);
                
                // Trigger a beautiful floating toast alert
                setCapsToast(nextVal 
                  ? (language === 'es' ? "Bloq Mayús Auto-desactivar: ACTIVADO" : "Caps Lock Auto-Unlock: ON")
                  : (language === 'es' ? "Bloq Mayús Auto-desactivar: DESACTIVADO" : "Caps Lock Auto-Unlock: OFF")
                );
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = setTimeout(() => {
                  setCapsToast(null);
                }, 2000);
              }}
              style={{
                padding: 6,
                position: 'relative',
                color: isCapsLockActive 
                  ? '#ef4444' 
                  : autoUnlockCapsLock 
                    ? 'var(--accent-light)' 
                    : 'var(--text-muted)',
                background: autoUnlockCapsLock ? 'var(--accent-dim)' : 'transparent',
                border: (isCapsLockActive && autoUnlockCapsLock)
                  ? '1px solid rgba(239, 68, 68, 0.4)' 
                  : '1px solid transparent',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                boxShadow: (isCapsLockActive && autoUnlockCapsLock)
                  ? '0 0 2px rgba(239, 68, 68, 0.08)' 
                  : 'none',
                animation: (isCapsLockActive && autoUnlockCapsLock) 
                  ? 'cyber-warning-pulse 1.5s infinite ease-in-out' 
                  : 'none',
              }}
              onMouseEnter={e => { 
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.transform = 'scale(1.05)';
                if (isCapsLockActive && autoUnlockCapsLock) {
                  e.currentTarget.style.color = '#ff7070';
                } else {
                  e.currentTarget.style.color = 'var(--text-primary)';
                }
              }}
              onMouseLeave={e => { 
                e.currentTarget.style.background = autoUnlockCapsLock ? 'var(--accent-dim)' : 'transparent';
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.color = isCapsLockActive 
                  ? '#ef4444' 
                  : autoUnlockCapsLock 
                    ? 'var(--accent-light)' 
                    : 'var(--text-muted)';
              }}
            >
              <Keyboard size={14} />
              
              {/* Pulsing Red Dot for physical CapsLock active state (Only active when feature is also enabled) */}
              {isCapsLockActive && autoUnlockCapsLock && (
                <span style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 5,
                  height: 5,
                  background: '#ef4444',
                  borderRadius: '50%',
                  boxShadow: '0 0 3px #ef4444',
                  animation: 'dot-pulse 1.5s infinite ease-in-out',
                }} />
              )}
            </button>
            </Tooltip>

            <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />

            {/* Pin */}
            <Tooltip placement="bottom" label={pinned ? (language === 'es' ? "Desfijar nota" : "Unpin note") : (language === 'es' ? "Fijar nota" : "Pin note")}>
            <button
              onClick={handlePin}
              style={{
                padding: 6,
                color: pinned ? 'var(--accent-light)' : 'var(--text-muted)',
                background: pinned ? 'var(--accent-dim)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { 
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => { 
                e.currentTarget.style.background = pinned ? 'var(--accent-dim)' : 'transparent';
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.color = pinned ? 'var(--accent-light)' : 'var(--text-muted)';
              }}
            >
              <Pin size={14} />
            </button>
            </Tooltip>

            {/* Guardar manual */}
            <AnimatePresence>
              {!autosaveEnabled && hasUnsavedChanges && (
                <motion.button
                  onClick={handleManualSave}
                  initial={{ scale: 0, opacity: 0, width: 0, marginRight: 0 }}
                  animate={{ scale: 1, opacity: 1, width: 'auto', marginRight: 4 }}
                  exit={{ scale: 0, opacity: 0, width: 0, marginRight: 0 }}
                  transition={{ type: 'spring', stiffness: 450, damping: 25 }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--accent)',
                    background: 'var(--accent-dim)',
                    color: 'var(--accent-light)',
                    cursor: 'pointer',
                    fontWeight: 600,
                    fontSize: 11,
                    animation: 'cyber-border-pulse 3s ease-in-out infinite',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Save size={13} />
                  <span>{language === 'es' ? 'Guardar' : 'Save'}</span>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Vista HTML */}
            <Tooltip placement="bottom" label={language === 'es' ? 'Vista HTML (Ver código fuente)' : 'HTML View (Source code)'}>
            <button
              onClick={() => setIsRaw(!isRaw)}
              style={{
                padding: 6,
                color: isRaw ? 'var(--accent-light)' : 'var(--text-muted)',
                background: isRaw ? 'var(--accent-dim)' : 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                outline: 'none',
              }}
              onMouseEnter={e => { 
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => { 
                e.currentTarget.style.background = isRaw ? 'var(--accent-dim)' : 'transparent';
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.color = isRaw ? 'var(--accent-light)' : 'var(--text-muted)';
              }}
            >
              <Braces size={14} />
            </button>
            </Tooltip>

            <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />

            {/* Cambiar vista */}
            <Tooltip placement="bottom" label={language === 'es' ? `Cambiar vista (Actual: ${layoutMode} columnas)` : `Change view (Current: ${layoutMode} columns)`}>
            <button
              onClick={onToggleLayout}
              style={{
                padding: 6,
                color: 'var(--text-muted)',
                background: 'transparent',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                outline: 'none',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--bg-hover)';
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.color = 'var(--text-primary)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }}
            >
              <PanelLeft size={14} />
            </button>
            </Tooltip>

            <div style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 2px' }} />

            {/* Exportar nota dropdown trigger */}
            <div style={{ position: 'relative', display: 'flex' }}>
              <Tooltip placement="bottom" label={language === 'es' ? 'Exportar nota (.md / .html)' : 'Export note (.md / .html)'}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowExportMenu(!showExportMenu);
                }}
                style={{
                  padding: 6,
                  color: showExportMenu ? 'var(--accent-light)' : 'var(--text-muted)',
                  background: showExportMenu ? 'var(--accent-dim)' : 'transparent',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.2s',
                  outline: 'none',
                }}
                onMouseEnter={e => { 
                  e.currentTarget.style.background = 'var(--bg-hover)';
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.color = 'var(--text-primary)';
                }}
                onMouseLeave={e => { 
                  e.currentTarget.style.background = showExportMenu ? 'var(--accent-dim)' : 'transparent';
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.color = showExportMenu ? 'var(--accent-light)' : 'var(--text-muted)';
                }}
              >
                <Download size={14} />
              </button>
              </Tooltip>

              <AnimatePresence>
                {showExportMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 8, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      marginTop: 6,
                      background: 'var(--bg-modal)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                      zIndex: 100,
                      minWidth: 180,
                      overflow: 'hidden',
                      padding: 4,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                    }}
                    className="glass-effect"
                  >
                    <button
                      onClick={handleExportMarkdown}
                      style={{
                        padding: '8px 12px',
                        fontSize: 12,
                        textAlign: 'left',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {language === 'es' ? '📝 Exportar como Markdown (.md)' : '📝 Export as Markdown (.md)'}
                    </button>
                    <button
                      onClick={handleExportHtml}
                      style={{
                        padding: '8px 12px',
                        fontSize: 12,
                        textAlign: 'left',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      {language === 'es' ? '🌐 Exportar como HTML (.html)' : '🌐 Export as HTML (.html)'}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
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
              
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />

              <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title={language === 'es' ? 'Negrita' : 'Bold'}><Bold size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title={language === 'es' ? 'Cursiva' : 'Italic'}><Italic size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title={language === 'es' ? 'Subrayado' : 'Underline'}><UnderlineIcon size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title={language === 'es' ? 'Tachado' : 'Strikethrough'}><Strikethrough size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive('highlight')} title={language === 'es' ? 'Resaltar' : 'Highlight'}><Highlighter size={15} /></ToolbarBtn>
              
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
              
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} title={language === 'es' ? 'Título 1' : 'Heading 1'}><Heading1 size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} title={language === 'es' ? 'Título 2' : 'Heading 2'}><Heading2 size={15} /></ToolbarBtn>
              
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
              
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title={language === 'es' ? 'Lista' : 'Bullet List'}><List size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title={language === 'es' ? 'Lista numerada' : 'Numbered List'}><ListOrdered size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title={language === 'es' ? 'Cita' : 'Blockquote'}><Quote size={15} /></ToolbarBtn>
              
              <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 4px' }} />
              
              <ToolbarBtn onClick={handleSetLink} active={editor.isActive('link')} title={language === 'es' ? 'Insertar link' : 'Insert Link'}><LinkIcon size={15} /></ToolbarBtn>
              <ToolbarBtn onClick={handleInsertImage} title={language === 'es' ? 'Insertar imagen' : 'Insert Image'}><ImageIcon size={15} /></ToolbarBtn>
              
              <div style={{ flex: 1 }} />
            </>
          )}
        </div>

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
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingRight: showMinimap ? MINIMAP_WIDTH + 6 : 0 }}
        >

        <div 
          className={showLineGutter ? 'show-line-numbers' : ''}
          style={{ position: 'relative', cursor: 'text', flex: '1 0 auto', display: 'flex', flexDirection: 'column' }}
          onContextMenu={() => {
            lastContextMenuTargetRef.current = 'editor';
            lastContextMenuTimeRef.current = Date.now();
          }}
          onClick={(e) => {
            if (editor && e.target === e.currentTarget) {
              editor.commands.focus('end');
            }
          }}
          onMouseMove={e => {
            const aTag = (e.target as HTMLElement).closest('a');
            if (aTag && aTag.href) {
              if (aTag.href !== hoveredLink) setHoveredLink(aTag.href);
            } else {
              if (hoveredLink) setHoveredLink(null);
            }
          }}
          onMouseLeave={() => setHoveredLink(null)}
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

          {/* Browser-like Link Hover Preview */}
          {hoveredLink && (
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                background: '#1a1a1a', // Gris oscuro
                color: '#cccccc', // Gris claro
                padding: '3px 8px',
                fontSize: 11.5,
                borderTopRightRadius: 6,
                maxWidth: '85%',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: 'none',
                zIndex: 50,
                borderTop: '1px solid #333',
                borderRight: '1px solid #333',
                boxShadow: '0 -2px 10px rgba(0,0,0,0.3)',
              }}
            >
              {hoveredLink}
            </motion.div>
          )}
        </div>

      </div>

      {/* ─── Minimap ─────────────────────────────────────────────── */}
      {showMinimap && (
        <div
          ref={minimapRef}
          onClick={handleMinimapClick}
          onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMinimapMenu({ x: e.clientX, y: e.clientY }); }}
          style={{
            position: 'absolute',
            right: 0,
            top: 0,
            bottom: 0,
            width: MINIMAP_WIDTH,
            background: 'rgba(8, 8, 16, 0.85)',
            borderLeft: '1px solid var(--border)',
            overflow: 'hidden',
            cursor: 'pointer',
            zIndex: 5,
            userSelect: 'none',
          }}
        >
          {/* Contenido escalado: HTML seteado vía DOM directo, sin re-renders */}
          <div
            ref={minimapContentRef}
            style={{
              width: minimapScale > 0 ? MINIMAP_WIDTH / minimapScale : 1280,
              transform: `scale(${minimapScale})`,
              transformOrigin: 'top left',
              color: 'var(--text-muted)',
              pointerEvents: 'none',
              fontSize: '16px',
              lineHeight: 1.5,
            }}
          />
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
              cursor: 'grab',
              pointerEvents: 'auto',
              transition: isDragging ? 'none' : 'top 0.05s linear, height 0.05s linear',
            }}
          />
        </div>
      )}

      </div>{/* Cierre del wrapper relativo del editor area */}

      <div style={{
        padding: '6px 16px',
        background: 'var(--bg-notelist)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 10,
        color: 'var(--text-muted)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: 0.5,
        opacity: 0.95,
        flexShrink: 0
      }}>
        {/* Global UI Scale Text Size Controller */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)' }}>
          <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8, opacity: 0.85, marginRight: 2 }}>{language === 'es' ? 'Escala:' : 'Scale:'}</span>
          
          <Tooltip placement="top" label={language === 'es' ? 'Reducir tamaño de interfaz (5%)' : 'Reduce interface scale (5%)'}>
          <button
            onClick={() => onScaleChange?.(Math.max(0.8, parseFloat((uiScale - 0.05).toFixed(2))))}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-light)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            onMouseDown={e => e.preventDefault()}
          >
            <Minus size={11} />
          </button>
          </Tooltip>

          <input 
            type="range"
            min="0.8"
            max="1.5"
            step="0.05"
            value={uiScale}
            onChange={(e) => onScaleChange?.(parseFloat(e.target.value))}
            style={{
              width: 80,
              height: 4,
              background: 'var(--border)',
              borderRadius: 2,
              appearance: 'none',
              outline: 'none',
              cursor: 'pointer',
              accentColor: 'var(--accent)',
              transition: 'background 0.2s',
            }}
          />

          <Tooltip placement="top" label={language === 'es' ? 'Aumentar tamaño de interfaz (5%)' : 'Increase interface scale (5%)'}>
          <button
            onClick={() => onScaleChange?.(Math.min(1.5, parseFloat((uiScale + 0.05).toFixed(2))))}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              outline: 'none',
              transition: 'color 0.2s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--accent-light)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            onMouseDown={e => e.preventDefault()}
          >
            <Plus size={11} />
          </button>
          </Tooltip>

          <span style={{ fontSize: 9.5, fontWeight: 700, minWidth: 32, color: 'var(--accent-light)', textAlign: 'right', marginLeft: 4 }}>
            {Math.round(uiScale * 100)}%
          </span>
        </div>

        {/* Editor Line/Col stats & Text Metrics */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, opacity: 0.85 }}>
          {showLineCounter && (
            <>
              <div style={{ display: 'flex', gap: 10 }}>
                <span>LN {lineInfo.line}</span>
                <span>COL {lineInfo.col}</span>
                <span>TOTAL {lineInfo.total} {language === 'es' ? 'LN' : 'LNS'}</span>
              </div>
              {showWordCounter && <span style={{ opacity: 0.3, fontWeight: 300 }}>|</span>}
            </>
          )}
          {showWordCounter && (
            <div style={{ display: 'flex', gap: 10 }}>
              <span>{textMetrics.words} {language === 'es' ? 'PALABRAS' : 'WORDS'}</span>
              <span>{textMetrics.chars} {language === 'es' ? 'CARS' : 'CHARS'}</span>
              <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>{textMetrics.readingTime} {textMetrics.readingTime === 1 ? (language === 'es' ? 'MIN' : 'MIN') : (language === 'es' ? 'MINS' : 'MINS')} {language === 'es' ? 'LEER' : 'READ'}</span>
            </div>
          )}
        </div>
      </div>

      {contextMenu && editor && createPortal(
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
          onClick={e => e.stopPropagation()}
        >
          {contextMenu.suggestions && contextMenu.suggestions.length > 0 && (
            <>
              {contextMenu.suggestions.map((suggestion: string) => (
                <button
                  key={suggestion}
                  onClick={() => {
                     if (window.cyberNotesAPI && window.cyberNotesAPI.replaceMisspelling) {
                       window.cyberNotesAPI.replaceMisspelling(suggestion);
                     }
                     setContextMenu(null);
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
                onClick={() => {
                   if (window.cyberNotesAPI && window.cyberNotesAPI.addToDictionary) {
                     window.cyberNotesAPI.addToDictionary(contextMenu.misspelledWord!);
                   }
                   setContextMenu(null);
                }}
                style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--success)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {language === 'es' ? `Agregar "${contextMenu.misspelledWord}" al diccionario` : `Add "${contextMenu.misspelledWord}" to dictionary`}
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            </>
          )}

          {contextMenu.linkHref && (
            <>
              <button
                onClick={() => { window.open(contextMenu.linkHref, '_blank'); setContextMenu(null); }}
                style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--accent-light)', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {language === 'es' ? 'Abrir en navegador' : 'Open in browser'}
              </button>
              
              <button
                onClick={() => {
                  setEditLinkData({ href: contextMenu.linkHref! });
                  setContextMenu(null);
                }}
                style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {language === 'es' ? 'Editar enlace' : 'Edit link'}
              </button>
              <button
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  setContextMenu(null);
                }}
                style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--danger)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {language === 'es' ? 'Eliminar enlace' : 'Remove link'}
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            </>
          )}

          <button
            onClick={() => {
              console.warn('Undo clicked. contextMenu:', contextMenu);
              if (contextMenu && contextMenu.target === 'title') {
                console.warn('Target is title. Focusing title input.');
                titleInputRef.current?.focus();
                document.execCommand('undo');
              } else {
                console.warn('Target is editor. Executing editor undo.');
                editor.chain().focus().undo().run();
              }
              setContextMenu(null);
            }}
            disabled={contextMenu && contextMenu.target === 'title' ? false : !editor.can().undo()}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: (contextMenu && contextMenu.target === 'title') || editor.can().undo() ? 'var(--text-primary)' : 'var(--text-muted)', border: 'none', borderRadius: 4, cursor: (contextMenu && contextMenu.target === 'title') || editor.can().undo() ? 'pointer' : 'default', opacity: (contextMenu && contextMenu.target === 'title') || editor.can().undo() ? 1 : 0.5 }}
            onMouseEnter={e => { if ((contextMenu && contextMenu.target === 'title') || editor.can().undo()) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {language === 'es' ? 'Deshacer' : 'Undo'}
          </button>
          <button
            onClick={() => {
              if (contextMenu && contextMenu.target === 'title') {
                titleInputRef.current?.focus();
                document.execCommand('redo');
              } else {
                editor.chain().focus().redo().run();
              }
              setContextMenu(null);
            }}
            disabled={contextMenu && contextMenu.target === 'title' ? false : !editor.can().redo()}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: (contextMenu && contextMenu.target === 'title') || editor.can().redo() ? 'var(--text-primary)' : 'var(--text-muted)', border: 'none', borderRadius: 4, cursor: (contextMenu && contextMenu.target === 'title') || editor.can().redo() ? 'pointer' : 'default', opacity: (contextMenu && contextMenu.target === 'title') || editor.can().redo() ? 1 : 0.5 }}
            onMouseEnter={e => { if ((contextMenu && contextMenu.target === 'title') || editor.can().redo()) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {language === 'es' ? 'Rehacer' : 'Redo'}
          </button>
          
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

          <button
            onClick={() => { document.execCommand('cut'); setContextMenu(null); }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {language === 'es' ? 'Cortar' : 'Cut'}
          </button>
          <button
            onClick={() => { document.execCommand('copy'); setContextMenu(null); }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {language === 'es' ? 'Copiar' : 'Copy'}
          </button>
          <button
            onClick={() => {
              navigator.clipboard.readText().then(text => {
                if (contextMenu && contextMenu.target === 'title') {
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
              setContextMenu(null);
            }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {language === 'es' ? 'Pegar' : 'Paste'}
          </button>
          
          <button
            onClick={() => {
              if (contextMenu && contextMenu.target === 'title') {
                titleInputRef.current?.select();
              } else {
                editor.chain().focus().selectAll().run();
              }
              setContextMenu(null);
            }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {language === 'es' ? 'Seleccionar todo' : 'Select all'}
          </button>
          
          <button
            onClick={() => {
              if (contextMenu && contextMenu.target === 'title') {
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
              setContextMenu(null);
            }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, background: 'transparent', color: 'var(--danger)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--danger-dim)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {t.general.delete}
          </button>

          {/* Formato de texto enriquecido: no aplica al título (input de texto plano). */}
          {contextMenu.target !== 'title' && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              <button
                onClick={() => { editor.chain().focus().toggleBold().run(); setContextMenu(null); }}
                style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, fontWeight: 'bold', background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {language === 'es' ? 'Negrita' : 'Bold'}
              </button>
              <button
                onClick={() => { editor.chain().focus().toggleItalic().run(); setContextMenu(null); }}
                style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, fontStyle: 'italic', background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {language === 'es' ? 'Cursiva' : 'Italic'}
              </button>
              <button
                onClick={() => { editor.chain().focus().toggleUnderline().run(); setContextMenu(null); }}
                style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, textDecoration: 'underline', background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {language === 'es' ? 'Subrayado' : 'Underline'}
              </button>

              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

              <button
                onClick={() => { editor.chain().focus().clearNodes().unsetAllMarks().run(); setContextMenu(null); }}
                style={{ textAlign: 'left', padding: '6px 10px', fontSize: 13, color: 'var(--text-muted)', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {language === 'es' ? 'Limpiar formato' : 'Clear formatting'}
              </button>
            </>
          )}
        </div>,
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditLinkData(null)}>{t.general.cancel}</button>
              <button className="btn btn-primary" onClick={() => {
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
              }}>{t.general.save}</button>
            </div>

            {linkInputMenu.menu}
          </div>
        </div>
      )}

      <AnimatePresence>
        {capsToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            style={{
              position: 'absolute',
              top: 75,
              left: '50%',
              x: '-50%',
              zIndex: 9999,
              background: 'var(--bg-modal)',
              border: '1px solid var(--accent)',
              color: 'var(--accent-light)',
              padding: '8px 18px',
              borderRadius: 'var(--radius-md)',
              fontSize: 12,
              fontWeight: 600,
              boxShadow: '0 4px 20px var(--accent-glow)',
              pointerEvents: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
            className="glass-effect"
          >
            <span style={{ color: 'var(--accent)' }}>ℹ️</span>
            <span>{capsToast}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Caso B — Aviso al salir del editor con cambios sin guardar (modo manual) */}
      <AnimatePresence>
        {showLeaveEditorWarning && createPortal(
          <div
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(5, 5, 8, 0.8)',
              backdropFilter: 'blur(16px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 20000,
            }}
            onClick={() => setShowLeaveEditorWarning(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              transition={{ type: 'spring', damping: 26, stiffness: 330 }}
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                <button
                  className="btn btn-primary"
                  onClick={() => { handleManualSave(); setShowLeaveEditorWarning(false); }}
                  style={{ justifyContent: 'center', padding: '10px 16px', fontSize: 'calc(13px * var(--ui-scale))' }}
                >
                  {language === 'es' ? 'Guardar' : 'Save'}
                </button>

                <button
                  className="btn btn-danger"
                  onClick={() => { handleRevertToSaved(); setShowLeaveEditorWarning(false); }}
                  style={{
                    justifyContent: 'center', padding: '10px 16px', fontSize: 'calc(13px * var(--ui-scale))',
                    background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444', transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { const b = e.currentTarget; b.style.background = '#ef4444'; b.style.color = '#fff'; }}
                  onMouseLeave={(e) => { const b = e.currentTarget; b.style.background = 'rgba(239, 68, 68, 0.1)'; b.style.color = '#ef4444'; }}
                >
                  {language === 'es' ? 'Salir sin guardar' : 'Leave without saving'}
                </button>

                <button
                  className="btn btn-ghost"
                  onClick={() => { setShowLeaveEditorWarning(false); editor?.commands.focus(); }}
                  style={{ justifyContent: 'center', padding: '8px 16px', fontSize: 'calc(13px * var(--ui-scale))' }}
                >
                  {language === 'es' ? 'Seguir editando' : 'Keep editing'}
                </button>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>

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
