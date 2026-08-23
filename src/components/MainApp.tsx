import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { Folder, Note, ThemeId } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import NoteList from './NoteList';
import NoteEditor from './NoteEditor';
import SettingsModal from './SettingsModal';
import AboutModal from './AboutModal';
import ConfirmDialog from './ConfirmDialog';
import { motion, AnimatePresence } from 'motion/react';
import { toNoteMeta, extractThumb } from '../utils/notes';

// Mapeo de emojis antiguos a nombres de iconos nuevos
const EMOJI_TO_ICON_MAP: Record<string, string> = {
  '📁': 'folder',
  '📝': 'file-text',
  '💼': 'briefcase',
  '🏠': 'home',
  '🚀': 'zap',
  '💡': 'lightbulb',
  '🎨': 'palette',
  '📚': 'book',
  '🔬': 'microscope',
  '🎯': 'target',
  '❤️': 'heart',
  '⭐': 'star',
};

// Función para migrar iconos emoji a nombres
const migrateIcon = (icon: string): string => {
  return EMOJI_TO_ICON_MAP[icon] || icon;
};

interface Props {
  language: Language;
  onLanguageChange: (l: Language) => void;
  currentTheme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  colorIntensity: number;
  onIntensityChange: (v: number) => void;
  onLock: () => void;
  autoLockMinutes: number;
  onAutoLockChange: (v: number) => void;
}

export default function MainApp({
  language,
  onLanguageChange,
  currentTheme,
  onThemeChange,
  colorIntensity,
  onIntensityChange,
  onLock,
  autoLockMinutes,
  onAutoLockChange,
}: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  /** Nota abierta con content completo (listas solo llevan meta). */
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  /** True hasta conocer si hay sesión que restaurar / content listo (evita flash de bienvenida). */
  const [sessionReady, setSessionReady] = useState(false);
  /** True mientras se pide content a disco (cambio de nota sin cache). */
  const [noteLoading, setNoteLoading] = useState(true);
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [draftCache, setDraftCache] = useState<Record<string, { title: string; content: string }>>({});
  const [noteToCloseWithDraft, setNoteToCloseWithDraft] = useState<Note | null>(null);
  const [pendingNavNoteId, setPendingNavNoteId] = useState<string | null>(null);
  const [confirmLeaveDismissed, setConfirmLeaveDismissed] = useState(false);
  const [dontAskChecked, setDontAskChecked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showUnsavedExitDialog, setShowUnsavedExitDialog] = useState(false);
  const [layoutMode, setLayoutMode] = useState<1 | 2 | 3>(3);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [noteListWidth, setNoteListWidth] = useState(300);
  const [uiScale, setUiScale] = useState(1.0);
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [glassBlur, setGlassBlur] = useState(0);
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [statusBarUrl, setStatusBarUrl] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    linkHref?: string;
    suggestions: string[];
    misspelledWord?: string;
  } | null>(null);
  const [lastMousePos, setLastMousePos] = useState({ x: 0, y: 0 });
  const [rememberLastNote, setRememberLastNote] = useState(false);
  const [showLineCounter, setShowLineCounter] = useState(false);
  const [showLineGutter, setShowLineGutter] = useState(true);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [autoUnlockCapsLock, setAutoUnlockCapsLock] = useState(true);
  const [autoUnlockCapsLockTimeout, setAutoUnlockCapsLockTimeout] = useState(5);
  const [capsStatus, setCapsStatus] = useState<{ active: boolean; timeLeft: number }>({ active: false, timeLeft: 0 });
  const [capsLockSound, setCapsLockSound] = useState('cyber-beep');
  const [capsLockSoundScope, setCapsLockSoundScope] = useState('app');
  const [tabsWidthMode, setTabsWidthMode] = useState<'normal' | 'wide'>('normal');
  const [showMinimap, setShowMinimap] = useState(false);
  const [showWordCounter, setShowWordCounter] = useState(false);
  const [recentClearedAt, setRecentClearedAt] = useState(0);
  const [openedHistory, setOpenedHistory] = useState<Record<string, number>>({});
  const isLoadedRef = useRef(false);
  const contentCacheRef = useRef<Record<string, string>>({});
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusBarUrlRef = useRef<string | null>(null);
  const rootStyleRef = useRef<HTMLDivElement | null>(null);
  const selectedNoteIdRef = useRef<string | null>(null);
  const allNotesRef = useRef<Note[]>([]);
  const notesRef = useRef<Note[]>([]);
  selectedNoteIdRef.current = selectedNoteId;
  allNotesRef.current = allNotes;
  notesRef.current = notes;

  useEffect(() => {
    const trackMouse = (e: MouseEvent) => {
      (window as any).lastMousePos = { x: e.clientX, y: e.clientY };
      (window as any).lastMouseDownEl = e.target;
    };
    window.addEventListener('mousedown', trackMouse, true);
    window.addEventListener('contextmenu', trackMouse, true);
    
    loadFolders();
    loadAllNotes();
    loadNotes(null);
    loadSettings();

    // Escuchar el menú contextual desde Electron de forma global
    const unregisterContext = window.cyberNotesAPI.onContextMenuData((data: any) => {
      const mousePos = (window as any).lastMousePos || { x: data.x, y: data.y };
      let safeY = mousePos.y;
      if (safeY + 300 > window.innerHeight) safeY = window.innerHeight - 300;
      
      setContextMenu({
        x: mousePos.x,
        y: safeY,
        linkHref: data.linkURL,
        suggestions: data.suggestions || [],
        misspelledWord: data.misspelledWord || ''
      });
    });

    const unregisterSettingChanged = window.cyberNotesAPI.onSettingChanged((data) => {
      if (data.key === 'auto_unlock_caps_lock') {
        setAutoUnlockCapsLock(data.value === 'true');
      }
    });

    const unregisterOpenSettings = window.cyberNotesAPI.onOpenSettings(() => {
      setShowSettings(true);
    });

    const unregisterOpenAbout = window.cyberNotesAPI.onOpenAbout(() => {
      setShowAbout(true);
    });

    const unregisterUnsavedExit = window.cyberNotesAPI.onConfirmUnsavedExit(() => {
      setShowUnsavedExitDialog(true);
    });

    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);

    return () => {
      window.removeEventListener('mousedown', trackMouse, true);
      window.removeEventListener('contextmenu', trackMouse, true);
      window.removeEventListener('click', closeMenu);
      if (unregisterContext) unregisterContext();
      if (unregisterSettingChanged) unregisterSettingChanged();
      if (unregisterOpenSettings) unregisterOpenSettings();
      if (unregisterOpenAbout) unregisterOpenAbout();
      if (unregisterUnsavedExit) unregisterUnsavedExit();
    };
  }, []);



  // Detector de links vía mousemove (throttled con rAF)
  useEffect(() => {
    let raf = 0;
    const handleMouseMove = (e: MouseEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const link = el?.closest('a');
        let next: string | null = null;
        if (link && link.href) {
          const url = link.href;
          if (url.startsWith('http') || url.startsWith('https') || url.startsWith('mailto:') || url.includes('www.')) {
            next = url;
          }
        }
        if (statusBarUrlRef.current !== next) {
          statusBarUrlRef.current = next;
          setStatusBarUrl(next);
        }
      });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Guardar última nota y sesión de pestañas si la opción está activa
  useEffect(() => {
    if (isLoadedRef.current && rememberLastNote && selectedNoteId) {
      window.cyberNotesAPI.setSetting('last_note_id', selectedNoteId);
    }
  }, [selectedNoteId, rememberLastNote]);

  useEffect(() => {
    if (isLoadedRef.current && rememberLastNote) {
      window.cyberNotesAPI.setSetting('open_note_ids', openNoteIds.join(','));
    }
  }, [openNoteIds, rememberLastNote]);

  // Sincronizar selectedNoteId con openNoteIds
  useEffect(() => {
    if (selectedNoteId) {
      setOpenNoteIds(prev => {
        if (prev.includes(selectedNoteId)) return prev;
        return [...prev, selectedNoteId];
      });
    }
  }, [selectedNoteId]);

  // Registrar el momento en que se abre cada nota (para el panel de recientes → "Abiertas")
  useEffect(() => {
    if (!isLoadedRef.current || !selectedNoteId) return;
    setOpenedHistory(prev => {
      const next = { ...prev, [selectedNoteId]: Date.now() };
      window.cyberNotesAPI.setSetting('opened_history', JSON.stringify(next));
      return next;
    });
  }, [selectedNoteId]);

  const loadSettings = async () => {
    const s = await window.cyberNotesAPI.getSettings([
      'ui_scale', 'bg_image', 'glass_blur', 'bg_opacity', 'auto_lock_minutes',
      'remember_last_note', 'show_line_counter', 'show_line_gutter', 'autosave_enabled',
      'confirm_leave_note_dismissed', 'auto_unlock_caps_lock', 'auto_unlock_caps_lock_timeout',
      'caps_lock_sound', 'caps_lock_sound_scope', 'tabs_width_mode', 'show_minimap',
      'show_word_counter', 'recent_cleared_at', 'opened_history', 'open_note_ids', 'last_note_id',
    ]);

    if (s.ui_scale) setUiScale(parseFloat(s.ui_scale));
    if (s.bg_image) setBgImage(s.bg_image);
    if (s.glass_blur) setGlassBlur(parseFloat(s.glass_blur));
    if (s.bg_opacity) setBgOpacity(parseFloat(s.bg_opacity));

    const isRemember = s.remember_last_note === 'true';
    setRememberLastNote(isRemember);

    if (s.show_line_gutter === null) setShowLineGutter(true);
    else setShowLineGutter(s.show_line_gutter === 'true');
    setShowLineCounter(s.show_line_counter === 'true');

    if (s.autosave_enabled !== null) setAutosaveEnabled(s.autosave_enabled === 'true');
    setConfirmLeaveDismissed(s.confirm_leave_note_dismissed === 'true');
    setAutoUnlockCapsLock(s.auto_unlock_caps_lock === 'true');
    if (s.auto_unlock_caps_lock_timeout) setAutoUnlockCapsLockTimeout(parseInt(s.auto_unlock_caps_lock_timeout));
    setCapsLockSound(s.caps_lock_sound || 'cyber-beep');
    setCapsLockSoundScope(s.caps_lock_sound_scope || 'app');
    if (s.tabs_width_mode) setTabsWidthMode(s.tabs_width_mode as 'normal' | 'wide');
    if (s.show_minimap) setShowMinimap(s.show_minimap === 'true');
    setShowWordCounter(s.show_word_counter === 'true');
    if (s.recent_cleared_at) setRecentClearedAt(parseInt(s.recent_cleared_at));
    if (s.opened_history) {
      try { setOpenedHistory(JSON.parse(s.opened_history)); } catch { /* ignorar JSON corrupto */ }
    }

    if (isRemember) {
      const savedIdsStr = s.open_note_ids;
      if (savedIdsStr) {
        const savedIds = savedIdsStr.split(',').filter(id => id.trim() !== '');
        if (savedIds.length > 0) {
          setOpenNoteIds(savedIds);
          const lastId = s.last_note_id;
          if (lastId && savedIds.includes(lastId)) {
            setSelectedNoteId(lastId);
          } else {
            setSelectedNoteId(savedIds[0]);
          }
          // loadFullNote pondrá noteLoading=false al terminar
          setNoteLoading(true);
        } else {
          setNoteLoading(false);
        }
      } else if (s.last_note_id) {
        setOpenNoteIds([s.last_note_id]);
        setSelectedNoteId(s.last_note_id);
        setNoteLoading(true);
      } else {
        setNoteLoading(false);
      }
    } else {
      setNoteLoading(false);
    }
    // Marcar que la carga inicial de base de datos ha concluido con éxito
    isLoadedRef.current = true;
    setSessionReady(true);
  };

  const loadFolders = async () => {
    const f = await window.cyberNotesAPI.getFolders();
    // Migrar iconos antiguos (emoji) a nuevos nombres
    const migratedFolders = f.map(folder => ({
      ...folder,
      icon: migrateIcon(folder.icon),
    }));
    setFolders(migratedFolders);
    
    // Guardar cambios migridos si es necesario
    const needsMigration = f.some(folder => EMOJI_TO_ICON_MAP[folder.icon]);
    if (needsMigration) {
      for (const folder of migratedFolders) {
        await window.cyberNotesAPI.updateFolder(folder);
      }
    }
  };

  const loadAllNotes = async () => {
    const all = await window.cyberNotesAPI.getAllNotes();
    setAllNotes(all.map(toNoteMeta));
  };

  const loadNotes = async (folderId: string | null) => {
    let n: Note[];
    if (searchQuery) {
      n = await window.cyberNotesAPI.searchNotes(searchQuery);
    } else {
      n = await window.cyberNotesAPI.getNotesByFolder(folderId);
    }
    setNotes(n.map(toNoteMeta));
    // Si no hay nota seleccionada y hay notas, selecciona la primera
    if (n.length > 0 && !selectedNoteIdRef.current) {
      setSelectedNoteId(n[0].id);
    }
  };

  /** Carga content completo de una nota (cache en memoria para pestañas abiertas). */
  const loadFullNote = useCallback(async (id: string | null) => {
    if (!id) {
      setSelectedNote(null);
      setNoteLoading(false);
      return;
    }
    const meta = allNotesRef.current.find(n => n.id === id) || notesRef.current.find(n => n.id === id);
    const cached = contentCacheRef.current[id];
    if (cached !== undefined && meta) {
      setSelectedNote({ ...meta, content: cached });
      setNoteLoading(false);
      return;
    }
    // Mantener la nota anterior en pantalla; solo marcar carga
    setNoteLoading(true);
    const full = await window.cyberNotesAPI.getNoteById(id);
    if (!full || selectedNoteIdRef.current !== id) {
      // Otra navegación ganó la carrera: no apagar loading aquí si el id ya cambió
      if (selectedNoteIdRef.current === id) setNoteLoading(false);
      return;
    }
    contentCacheRef.current[id] = full.content || '';
    setSelectedNote({ ...toNoteMeta(full), content: full.content || '' });
    setNoteLoading(false);
  }, []);

  // useLayoutEffect: con cache, actualiza selectedNote antes del paint (sin flash a bienvenida)
  useLayoutEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadFullNote(selectedNoteId);
    })();
    return () => { cancelled = true; };
  }, [selectedNoteId, loadFullNote]);

  const handleSelectFolder = async (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSearchQuery('');
    const n = await window.cyberNotesAPI.getNotesByFolder(folderId);
    setNotes(n.map(toNoteMeta));
  };

  const patchNoteMeta = useCallback((updated: Note) => {
    const meta = toNoteMeta(updated);
    setNotes(prev => prev.map(n => n.id === meta.id ? { ...n, ...meta } : n));
    setAllNotes(prev => prev.map(n => n.id === meta.id ? { ...n, ...meta } : n));
  }, []);

  const handleRenameNote = async (id: string, title: string) => {
    const note = allNotes.find(n => n.id === id);
    if (!note) return;
    
    // Si la nota posee borrador en caché, actualizamos el título del borrador
    if (draftCache[id]) {
      setDraftCache(prev => ({
        ...prev,
        [id]: { ...prev[id], title }
      }));
    }
    
    const content = contentCacheRef.current[id] ?? (await window.cyberNotesAPI.getNoteById(id))?.content ?? '';
    contentCacheRef.current[id] = content;
    const updated = { ...note, title, content, updated_at: new Date().toISOString() };
    patchNoteMeta(updated);
    if (selectedNoteId === id) {
      setSelectedNote(prev => prev ? { ...prev, title, updated_at: updated.updated_at } : prev);
    }
    await window.cyberNotesAPI.saveNote(updated);
  };

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      if (!q) {
        const n = await window.cyberNotesAPI.getNotesByFolder(selectedFolderId);
        setNotes(n.map(toNoteMeta));
        return;
      }
      const n = await window.cyberNotesAPI.searchNotes(q);
      setNotes(n.map(toNoteMeta));
      setSelectedNoteId(n.length > 0 ? n[0].id : null);
    }, 250);
  }, [selectedFolderId]);

  const handleCreateNote = async () => {
    const now = new Date().toISOString();
    const newNote: Note = {
      id: window.crypto.randomUUID(),
      folder_id: (selectedFolderId === 'floating' || selectedFolderId === 'favorites')
        ? null
        : selectedFolderId,
      title: language === 'es' ? 'Nueva nota' : 'New note',
      content: '',
      preview: '',
      thumb: '',
      pinned: 0,
      created_at: now,
      updated_at: now,
    };
    try {
      const saved = await window.cyberNotesAPI.saveNote(newNote);
      contentCacheRef.current[saved.id] = saved.content || '';
      const meta = toNoteMeta(saved);
      setNotes(prev => [meta, ...prev]);
      setAllNotes(prev => [meta, ...prev]);
      setSelectedNote({ ...meta, content: saved.content || '' });
      setSelectedNoteId(saved.id);
    } catch (err) {
      console.error('[MainApp] Error creating note:', err);
    }
  };

  const handleSaveNote = useCallback(async (note: Note) => {
    const thumb = note.thumb || extractThumb(note.content);
    const updated = { ...note, thumb, updated_at: new Date().toISOString() };
    contentCacheRef.current[updated.id] = updated.content || '';
    patchNoteMeta(updated);
    setSelectedNote(prev => (prev && prev.id === updated.id ? updated : prev));
    await window.cyberNotesAPI.saveNote(updated);

    if (selectedFolderId === 'favorites' && updated.pinned !== 1 && !searchQuery) {
      setNotes(prev => prev.filter(n => n.id !== updated.id));
    }
    
    // Al guardar exitosamente, eliminamos la nota del caché de borradores sucios
    setDraftCache(prev => {
      if (!(note.id in prev)) return prev;
      const next = { ...prev };
      delete next[note.id];
      return next;
    });
  }, [patchNoteMeta, selectedFolderId, searchQuery]);

  const handleEditDraft = useCallback((id: string, title: string, content: string) => {
    contentCacheRef.current[id] = content;
    setDraftCache(prev => {
      const cur = prev[id];
      if (cur && cur.title === title && cur.content === content) return prev;
      return { ...prev, [id]: { title, content } };
    });
  }, []);

  const handleDiscardDraft = useCallback((id: string) => {
    setDraftCache(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  // Guard de navegación (Caso A): si dejamos una nota con borrador en modo manual,
  // pedimos confirmación antes de cambiar de nota/pestaña.
  const handleAttemptSelectNote = useCallback((targetId: string) => {
    if (targetId === selectedNoteId) return;
    if (!autosaveEnabled && selectedNoteId && draftCache[selectedNoteId] && !confirmLeaveDismissed) {
      setDontAskChecked(false);
      setPendingNavNoteId(targetId);
      return;
    }
    setSelectedNoteId(targetId);
  }, [selectedNoteId, autosaveEnabled, draftCache, confirmLeaveDismissed]);

  const executeCloseTab = useCallback((id: string) => {
    setOpenNoteIds(prev => {
      const filtered = prev.filter(noteId => noteId !== id);
      
      // Si cerramos la pestaña activa, cambiamos el foco a una pestaña vecina
      if (selectedNoteId === id) {
        if (filtered.length > 0) {
          const closedIndex = prev.indexOf(id);
          const newSelectedIndex = Math.min(closedIndex, filtered.length - 1);
          setSelectedNoteId(filtered[newSelectedIndex]);
        } else {
          setSelectedNoteId(null);
        }
      }
      return filtered;
    });
    
    // Descartar borrador si se cierra la pestaña
    setDraftCache(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [selectedNoteId]);

  const handleCloseTab = useCallback((id: string) => {
    const isDirty = draftCache[id] !== undefined && !autosaveEnabled;
    if (isDirty) {
      const meta = allNotes.find(n => n.id === id);
      if (meta) {
        const draft = draftCache[id];
        setNoteToCloseWithDraft({
          ...meta,
          content: draft?.content ?? contentCacheRef.current[id] ?? '',
          title: draft?.title ?? meta.title,
        });
        return;
      }
    }
    
    executeCloseTab(id);
  }, [draftCache, autosaveEnabled, allNotes, executeCloseTab]);

  const handleDeleteNote = async (id: string) => {
    await window.cyberNotesAPI.deleteNote(id);
    delete contentCacheRef.current[id];
    const remaining = notes.filter(n => n.id !== id);
    setNotes(remaining);
    setAllNotes(prev => prev.filter(n => n.id !== id));
    
    // Remover de las pestañas abiertas inmediatamente
    setOpenNoteIds(prev => prev.filter(noteId => noteId !== id));
    
    // Limpiar caché de borrador si existía
    setDraftCache(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    if (selectedNoteId === id) {
      const remainingTabs = openNoteIds.filter(noteId => noteId !== id);
      if (remainingTabs.length > 0) {
        setSelectedNoteId(remainingTabs[0]);
      } else if (remaining.length > 0) {
        setSelectedNoteId(remaining[0].id);
      } else {
        setSelectedNote(null);
        setSelectedNoteId(null);
      }
    }
  };

  const handleTogglePin = async (note: Note) => {
    const content = contentCacheRef.current[note.id]
      ?? (selectedNote?.id === note.id ? selectedNote.content : undefined)
      ?? (await window.cyberNotesAPI.getNoteById(note.id))?.content
      ?? '';
    contentCacheRef.current[note.id] = content;
    const updated = { ...note, content, pinned: note.pinned === 1 ? 0 : 1, updated_at: new Date().toISOString() };
    await window.cyberNotesAPI.saveNote(updated);
    patchNoteMeta(updated);
    if (selectedNoteId === note.id) {
      setSelectedNote(prev => prev ? { ...prev, pinned: updated.pinned, updated_at: updated.updated_at } : prev);
    }
    // Leaving Favorites filter: unfavorited notes drop out of the visible list
    if (selectedFolderId === 'favorites' && updated.pinned !== 1 && !searchQuery) {
      setNotes(prev => prev.filter(n => n.id !== note.id));
    }
  };

  const handleMoveNote = async (noteId: string, targetFolderId: string | null) => {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    const content = contentCacheRef.current[noteId]
      ?? (selectedNote?.id === noteId ? selectedNote.content : undefined)
      ?? (await window.cyberNotesAPI.getNoteById(noteId))?.content
      ?? '';
    contentCacheRef.current[noteId] = content;
    const updated = { ...note, content, folder_id: targetFolderId, updated_at: new Date().toISOString() };
    await window.cyberNotesAPI.saveNote(updated);
    
    patchNoteMeta(updated);
    if (selectedNoteId === noteId) {
      setSelectedNote(prev => prev ? { ...prev, folder_id: targetFolderId, updated_at: updated.updated_at } : prev);
    }

    // Si estamos viendo una carpeta específica y movemos la nota a otra, la quitamos de la lista visible
    if (selectedFolderId !== null && selectedFolderId !== targetFolderId && !searchQuery) {
       setNotes(prev => prev.filter(n => n.id !== noteId));
    }
  };

  // Get available colors: all colors minus those in use (unless it's the currentFolderId)
  const getAvailableColors = useCallback((currentFolderId?: string) => {
    const currentFolder = folders.find(f => f.id === currentFolderId);
    const usedColors = new Set(
      folders
        .filter(f => !currentFolderId || f.id !== currentFolderId)
        .map(f => f.color)
    );
    const allColors = ['#7c3aed', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#3b82f6', '#d946ef', '#f97316', '#06b6d4', '#84cc16', '#0891b2', '#7c2d12', '#831843', '#4c0519', '#3730a3', '#1e40af', '#0d9488'];
    return {
      all: allColors,
      available: allColors.filter(color => !usedColors.has(color) || color === currentFolder?.color),
      usedColors,
    };
  }, [folders]);

  const handleCreateFolder = async (name: string, icon: string, color: string) => {
    const now = new Date().toISOString();
    const folder: Folder = {
      id: window.crypto.randomUUID(),
      name,
      icon,
      color,
      sort_order: folders.length,
      created_at: now,
    };
    await window.cyberNotesAPI.createFolder(folder);
    setFolders(prev => [...prev, folder]);
  };

  const handleUpdateFolder = async (folder: Folder) => {
    await window.cyberNotesAPI.updateFolder(folder);
    setFolders(prev => prev.map(f => f.id === folder.id ? folder : f));
  };

  const handleDeleteFolder = async (id: string) => {
    await window.cyberNotesAPI.deleteFolder(id);
    setFolders(prev => prev.filter(f => f.id !== id));
    // Notas de esa carpeta ya no existen en DB
    setAllNotes(prev => prev.filter(n => n.folder_id !== id));
    setNotes(prev => prev.filter(n => n.folder_id !== id));
    if (selectedFolderId === id) {
      setSelectedFolderId(null);
      const n = await window.cyberNotesAPI.getNotesByFolder(null);
      setNotes(n.map(toNoteMeta));
      setSelectedNoteId(n.length > 0 ? n[0].id : null);
    }
  };

  const handleScaleChange = (scale: number) => {
    setUiScale(scale);
    window.cyberNotesAPI.setSetting('ui_scale', scale.toString());
  };

  const handleBgImageChange = (url: string | null) => {
    setBgImage(url);
    window.cyberNotesAPI.setSetting('bg_image', url || '');
  };

  const handleBlurChange = (val: number) => {
    setGlassBlur(val);
    window.cyberNotesAPI.setSetting('glass_blur', val.toString());
  };

  const handleOpacityChange = async (v: number) => {
    setBgOpacity(v);
    await window.cyberNotesAPI.setSetting('bg_opacity', v.toString());
  };

  const handleAutoLockChange = async (v: number) => {
    onAutoLockChange(v);
  };

  const handleRememberLastNoteChange = async (v: boolean) => {
    setRememberLastNote(v);
    await window.cyberNotesAPI.setSetting('remember_last_note', v.toString());
  };

  const handleTabsWidthModeChange = async (mode: 'normal' | 'wide') => {
    setTabsWidthMode(mode);
    await window.cyberNotesAPI.setSetting('tabs_width_mode', mode);
  };

  const handleShowMinimapChange = async (v: boolean) => {
    setShowMinimap(v);
    await window.cyberNotesAPI.setSetting('show_minimap', v.toString());
  };

  const handleShowLineCounterChange = async (v: boolean) => {
    setShowLineCounter(v);
    await window.cyberNotesAPI.setSetting('show_line_counter', v.toString());
  };

  const handleAutosaveEnabledChange = async (val: boolean) => {
    setAutosaveEnabled(val);
    await window.cyberNotesAPI.setSetting('autosave_enabled', val.toString());
  };

  const handleAutoUnlockCapsLockChange = async (val: boolean) => {
    setAutoUnlockCapsLock(val);
    await window.cyberNotesAPI.setSetting('auto_unlock_caps_lock', val.toString());
  };

  const handleAutoUnlockCapsLockTimeoutChange = async (val: number) => {
    setAutoUnlockCapsLockTimeout(val);
    await window.cyberNotesAPI.setSetting('auto_unlock_caps_lock_timeout', val.toString());
  };

  const handleCapsLockSoundChange = async (val: string) => {
    setCapsLockSound(val);
    await window.cyberNotesAPI.setSetting('caps_lock_sound', val);
  };

  const handleCapsLockSoundScopeChange = async (val: string) => {
    setCapsLockSoundScope(val);
    await window.cyberNotesAPI.setSetting('caps_lock_sound_scope', val);
  };

  const recentNotesSorted = useMemo(() =>
    [...allNotes]
      .filter(n => !recentClearedAt || new Date(n.updated_at).getTime() > recentClearedAt)
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()),
  [allNotes, recentClearedAt]);

  const recentNotesTop10 = useMemo(() => recentNotesSorted.slice(0, 10), [recentNotesSorted]);
  const recentNotesTop6 = useMemo(() =>
    [...allNotes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 6),
  [allNotes]);

  const startDragSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const root = rootStyleRef.current;
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(Math.max(startWidth + (ev.clientX - startX), 150), 500);
      if (root) root.style.setProperty('--sidebar-width', `${w}px`);
      (onMove as any)._last = w;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = 'default';
      const w = (onMove as any)._last;
      if (typeof w === 'number') setSidebarWidth(w);
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startDragNoteList = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = noteListWidth;
    const root = rootStyleRef.current;
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(Math.max(startWidth + (ev.clientX - startX), 200), 600);
      if (root) root.style.setProperty('--notelist-width', `${w}px`);
      (onMove as any)._last = w;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = 'default';
      const w = (onMove as any)._last;
      if (typeof w === 'number') setNoteListWidth(w);
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div 
      ref={rootStyleRef}
      className={bgImage ? 'has-bg' : ''}
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        height: '100vh', 
        overflow: 'hidden',
        '--sidebar-width': `${sidebarWidth}px`,
        '--notelist-width': `${noteListWidth}px`,
        '--ui-scale': uiScale.toString(),
        '--bg-image': bgImage ? `url("${bgImage}")` : 'none',
        '--glass-blur': `${glassBlur}px`,
        '--bg-overlay-opacity': bgOpacity.toString(),
      } as React.CSSProperties}>
      
      {bgImage && (
        <div className="app-bg-layer">
          <img 
            src={bgImage} 
            alt="App Background" 
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} 
          />
        </div>
      )}
      {bgImage && <div className="app-overlay-layer" />}

      <TitleBar
        language={language}
        onLock={onLock}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAbout={() => setShowAbout(true)}
        onSelectNote={(id) => {
          setSelectedNoteId(id);
          const note = allNotes.find(n => n.id === id);
          if (note) setSelectedFolderId(note.folder_id);
        }}
        recentNotes={recentNotesTop10}
        onClearRecent={async () => {
          const now = Date.now().toString();
          await window.cyberNotesAPI.setSetting('recent_cleared_at', now);
          setRecentClearedAt(parseInt(now));
        }}
        autosaveEnabled={autosaveEnabled}
        onAutosaveChange={handleAutosaveEnabledChange}
        autoUnlockCapsLock={autoUnlockCapsLock}
        onAutoUnlockCapsLockChange={handleAutoUnlockCapsLockChange}
        autoUnlockCapsLockTimeout={autoUnlockCapsLockTimeout}
        capsStatus={capsStatus}
        showMinimap={showMinimap}
        onShowMinimapChange={(v) => { setShowMinimap(v); window.cyberNotesAPI.setSetting('show_minimap', v.toString()); }}
        showLineCounter={showLineCounter}
        onShowLineCounterChange={handleShowLineCounterChange}
        showLineGutter={showLineGutter}
        onShowLineGutterChange={(v: boolean) => { setShowLineGutter(v); window.cyberNotesAPI.setSetting('show_line_gutter', v.toString()); }}
        showWordCounter={showWordCounter}
        onShowWordCounterChange={(v) => { setShowWordCounter(v); window.cyberNotesAPI.setSetting('show_word_counter', v.toString()); }}
        rememberLastNote={rememberLastNote}
        onRememberLastNoteChange={handleRememberLastNoteChange}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        {layoutMode === 3 && (
          <>
            <Sidebar
              language={language}
              folders={folders}
              selectedFolderId={selectedFolderId}
              noteCount={allNotes.length}
              recentNotes={recentNotesTop6}
              allNotes={allNotes}
              openedHistory={openedHistory}
              recentClearedAt={recentClearedAt}
              onClearRecent={async () => {
                const now = Date.now().toString();
                await window.cyberNotesAPI.setSetting('recent_cleared_at', now);
                await window.cyberNotesAPI.setSetting('opened_history', '{}');
                setRecentClearedAt(parseInt(now));
                setOpenedHistory({});
              }}
              onSelectNote={(id) => {
                let note = allNotes.find(n => n.id === id);
                if (note) { setSelectedNoteId(id); setSelectedFolderId(note.folder_id); }
              }}
              onSelectFolder={handleSelectFolder}
              onCreateFolder={handleCreateFolder}
              onUpdateFolder={handleUpdateFolder}
              onDeleteFolder={handleDeleteFolder}
              onOpenSettings={() => setShowSettings(true)}
              onLock={onLock}
              searchQuery={searchQuery}
              onSearch={handleSearch}
              getAvailableColors={getAvailableColors}
              onMoveNote={handleMoveNote}
            />
            <div 
              onMouseDown={startDragSidebar}
              style={{ width: 4, cursor: 'col-resize', background: 'transparent', flexShrink: 0, zIndex: 10, margin: '0 -2px' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--accent)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
            />
          </>
        )}

        {/* Note list */}
        {layoutMode >= 2 && (
          <>
            <NoteList
              language={language}
              notes={notes}
              folders={folders}
              selectedNoteId={selectedNoteId}
              onSelectNote={handleAttemptSelectNote}
              onCreateNote={handleCreateNote}
              onDeleteNote={handleDeleteNote}
              onTogglePin={handleTogglePin}
              onMoveNote={handleMoveNote}
              onRenameNote={handleRenameNote}
              selectedFolder={selectedFolderId === 'floating'
                ? { id: 'floating', name: TRANSLATIONS[language].sidebar.floatingNotes, icon: '☁️', color: '#06b6d4' } as Folder
                : selectedFolderId === 'favorites'
                  ? { id: 'favorites', name: TRANSLATIONS[language].sidebar.favorites, icon: 'star', color: '#f59e0b' } as Folder
                : (folders.find(f => f.id === selectedFolderId) ?? null)}
              searchQuery={searchQuery}
            />
            <div 
              onMouseDown={startDragNoteList}
              style={{ width: 4, cursor: 'col-resize', background: 'transparent', flexShrink: 0, zIndex: 10, margin: '0 -2px' }}
              onMouseEnter={e => { (e.target as HTMLElement).style.background = 'var(--accent)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; }}
            />
          </>
        )}

        {/* Editor */}
        <NoteEditor
          language={language}
          note={selectedNote}
          isNoteLoading={
            !sessionReady
            || (!!selectedNoteId && (noteLoading || !selectedNote || selectedNote.id !== selectedNoteId))
          }
          onSave={handleSaveNote}
          onCreateNote={handleCreateNote}
          layoutMode={layoutMode}
          onToggleLayout={() => setLayoutMode(prev => prev === 1 ? 3 : prev - 1 as any)}
          showLineCounter={showLineCounter}
          autosaveEnabled={autosaveEnabled}
          autoUnlockCapsLock={autoUnlockCapsLock}
          onAutoUnlockCapsLockChange={handleAutoUnlockCapsLockChange}
          autoUnlockCapsLockTimeout={autoUnlockCapsLockTimeout}
          onCapsStatusChange={setCapsStatus}
          capsLockSound={capsLockSound}
          capsLockSoundScope={capsLockSoundScope}
          uiScale={uiScale}
          onScaleChange={handleScaleChange}
          openNoteIds={openNoteIds}
          notes={allNotes}
          folders={folders}
          onSelectNote={handleAttemptSelectNote}
          onCloseTab={handleCloseTab}
          draftCache={draftCache}
          onEditDraft={handleEditDraft}
          onDiscardDraft={handleDiscardDraft}
          tabsWidthMode={tabsWidthMode}
          showMinimap={showMinimap}
          onShowMinimapChange={handleShowMinimapChange}
          showLineGutter={showLineGutter}
          showWordCounter={showWordCounter}
        />
      </div>

      {showSettings && (
        <SettingsModal
          language={language}
          onLanguageChange={onLanguageChange}
          currentTheme={currentTheme}
          onThemeChange={onThemeChange}
          colorIntensity={colorIntensity}
          onIntensityChange={onIntensityChange}
          bgImage={bgImage}
          onBgImageChange={handleBgImageChange}
          glassBlur={glassBlur}
          onBlurChange={handleBlurChange}
          bgOpacity={bgOpacity}
          onOpacityChange={handleOpacityChange}
          autoLockMinutes={autoLockMinutes}
          onAutoLockChange={handleAutoLockChange}
          rememberLastNote={rememberLastNote}
          onRememberLastNoteChange={handleRememberLastNoteChange}
          showLineCounter={showLineCounter}
          onShowLineCounterChange={handleShowLineCounterChange}
          showLineGutter={showLineGutter}
          onShowLineGutterChange={(v: boolean) => { setShowLineGutter(v); window.cyberNotesAPI.setSetting('show_line_gutter', v.toString()); }}
          autosaveEnabled={autosaveEnabled}
          onAutosaveEnabledChange={handleAutosaveEnabledChange}
          autoUnlockCapsLock={autoUnlockCapsLock}
          onAutoUnlockCapsLockChange={handleAutoUnlockCapsLockChange}
          autoUnlockCapsLockTimeout={autoUnlockCapsLockTimeout}
          onAutoUnlockCapsLockTimeoutChange={handleAutoUnlockCapsLockTimeoutChange}
          capsLockSound={capsLockSound}
          onCapsLockSoundChange={handleCapsLockSoundChange}
          capsLockSoundScope={capsLockSoundScope}
          onCapsLockSoundScopeChange={handleCapsLockSoundScopeChange}
          onClose={() => setShowSettings(false)}
          onLock={onLock}
          tabsWidthMode={tabsWidthMode}
          onTabsWidthModeChange={handleTabsWidthModeChange}
          showMinimap={showMinimap}
          onShowMinimapChange={handleShowMinimapChange}
          showWordCounter={showWordCounter}
          onShowWordCounterChange={(v: boolean) => { setShowWordCounter(v); window.cyberNotesAPI.setSetting('show_word_counter', v.toString()); }}
        />
      )}

      {showAbout && (
        <AboutModal
          language={language}
          onClose={() => setShowAbout(false)}
        />
      )}

      {showUnsavedExitDialog && (
        <ConfirmDialog
          language={language}
          title={language === 'es' ? 'Cambios sin guardar' : 'Unsaved changes'}
          message={language === 'es'
            ? 'Tienes cambios sin guardar en la nota actual. ¿Salir sin guardar?'
            : 'You have unsaved changes in the current note. Exit without saving?'}
          variant="warning"
          confirm
          confirmLabel={language === 'es' ? 'Salir sin guardar' : 'Exit without saving'}
          cancelLabel={language === 'es' ? 'Cancelar' : 'Cancel'}
          onResolve={(accepted: boolean) => {
            setShowUnsavedExitDialog(false);
            window.cyberNotesAPI.respondUnsavedExit(accepted);
          }}
        />
      )}

      {/* Modal de Confirmación de Cierre de Pestaña Sucia */}
      <AnimatePresence>
        {noteToCloseWithDraft && (
          <div 
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(5, 5, 8, 0.8)',
              backdropFilter: 'blur(16px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 20000,
            }}
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
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 48,
                  height: 48,
                  borderRadius: 12,
                  background: 'rgba(234, 88, 12, 0.1)',
                  border: '1px solid rgba(234, 88, 12, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: 'drop-shadow(0 0 6px rgba(234, 88, 12, 0.6))' }}>
                    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/>
                    <line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{
                    fontSize: 'calc(16px * var(--ui-scale))',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: 0,
                    letterSpacing: '-0.01em',
                  }}>
                    {language === 'es' ? '¿Guardar cambios?' : 'Save changes?'}
                  </h3>
                  <p style={{
                    fontSize: 'calc(12px * var(--ui-scale))',
                    color: 'var(--text-muted)',
                    margin: '4px 0 0 0',
                    lineHeight: 1.4,
                  }}>
                    {language === 'es' 
                      ? `La nota "${draftCache[noteToCloseWithDraft.id]?.title || noteToCloseWithDraft.title}" tiene cambios no guardados. Si la cierras ahora, perderás las modificaciones.` 
                      : `The note "${draftCache[noteToCloseWithDraft.id]?.title || noteToCloseWithDraft.title}" has unsaved changes. If you close it now, your modifications will be lost.`}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {/* Save and Close */}
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    const draft = draftCache[noteToCloseWithDraft.id];
                    if (draft) {
                      const updated = { ...noteToCloseWithDraft, title: draft.title, content: draft.content };
                      await handleSaveNote(updated);
                    }
                    executeCloseTab(noteToCloseWithDraft.id);
                    setNoteToCloseWithDraft(null);
                  }}
                  style={{ justifyContent: 'center', padding: '10px 16px', fontSize: 'calc(13px * var(--ui-scale))' }}
                >
                  {language === 'es' ? 'Guardar y Cerrar' : 'Save & Close'}
                </button>

                {/* Close without saving */}
                <button
                  className="btn btn-danger"
                  onClick={() => {
                    executeCloseTab(noteToCloseWithDraft.id);
                    setNoteToCloseWithDraft(null);
                  }}
                  style={{
                    justifyContent: 'center',
                    padding: '10px 16px',
                    fontSize: 'calc(13px * var(--ui-scale))',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#ef4444',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.background = '#ef4444';
                    btn.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    const btn = e.currentTarget as HTMLButtonElement;
                    btn.style.background = 'rgba(239, 68, 68, 0.1)';
                    btn.style.color = '#ef4444';
                  }}
                >
                  {language === 'es' ? 'Cerrar sin Guardar' : 'Close without Saving'}
                </button>

                {/* Cancel */}
                <button
                  className="btn btn-ghost"
                  onClick={() => setNoteToCloseWithDraft(null)}
                  style={{ justifyContent: 'center', padding: '8px 16px', fontSize: 'calc(13px * var(--ui-scale))' }}
                >
                  {language === 'es' ? 'Cancelar' : 'Cancel'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmación al Navegar fuera de una nota con borrador (Caso A) */}
      <AnimatePresence>
        {pendingNavNoteId && (
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
              background: 'rgba(5, 5, 8, 0.8)',
              backdropFilter: 'blur(16px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 20000,
            }}
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
            >
              {/* Header */}
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
                      ? `La nota "${(selectedNoteId && draftCache[selectedNoteId]?.title) || selectedNote?.title || ''}" tiene cambios sin guardar.`
                      : `The note "${(selectedNoteId && draftCache[selectedNoteId]?.title) || selectedNote?.title || ''}" has unsaved changes.`}
                  </p>
                </div>
              </div>

              {/* Checkbox "No volver a mostrar" */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 'calc(12px * var(--ui-scale))', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={dontAskChecked}
                  onChange={e => setDontAskChecked(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                />
                {language === 'es' ? 'No volver a mostrar este aviso' : 'Do not show this warning again'}
              </label>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                {/* Guardar y continuar */}
                <button
                  className="btn btn-primary"
                  onClick={async () => {
                    const draft = selectedNoteId ? draftCache[selectedNoteId] : null;
                    if (selectedNote && draft) {
                      await handleSaveNote({ ...selectedNote, title: draft.title, content: draft.content });
                    }
                    if (dontAskChecked) {
                      await window.cyberNotesAPI.setSetting('confirm_leave_note_dismissed', 'true');
                      setConfirmLeaveDismissed(true);
                    }
                    const target = pendingNavNoteId;
                    setPendingNavNoteId(null);
                    if (target) setSelectedNoteId(target);
                  }}
                  style={{ justifyContent: 'center', padding: '10px 16px', fontSize: 'calc(13px * var(--ui-scale))' }}
                >
                  {language === 'es' ? 'Guardar y continuar' : 'Save & continue'}
                </button>

                {/* Salir sin guardar (descartar) */}
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (selectedNoteId) handleDiscardDraft(selectedNoteId);
                    if (dontAskChecked) {
                      await window.cyberNotesAPI.setSetting('confirm_leave_note_dismissed', 'true');
                      setConfirmLeaveDismissed(true);
                    }
                    const target = pendingNavNoteId;
                    setPendingNavNoteId(null);
                    if (target) setSelectedNoteId(target);
                  }}
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

                {/* Seguir aquí */}
                <button
                  className="btn btn-ghost"
                  onClick={() => setPendingNavNoteId(null)}
                  style={{ justifyContent: 'center', padding: '8px 16px', fontSize: 'calc(13px * var(--ui-scale))' }}
                >
                  {language === 'es' ? 'Seguir aquí' : 'Stay here'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Status Bar (Hover Link) */}
      <AnimatePresence>
        {statusBarUrl && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{
              position: 'fixed',
              bottom: 12,
              left: 12,
              background: 'var(--bg-modal)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '4px 10px',
              fontSize: 'calc(11px * var(--ui-scale))',
              color: 'var(--text-secondary)',
              maxWidth: '40vw',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              zIndex: 10001,
              pointerEvents: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            }}
            className="glass-effect"
          >
            {statusBarUrl}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
