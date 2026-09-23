import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react';
import { Folder, Note, NoteDraft, ThemeId } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import { EditorFontId, applyEditorFont, DEFAULT_EDITOR_FONT } from '../fonts';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import NoteList from './NoteList';
import NoteEditor, { type NoteExportActions, isToolbarItemId } from './NoteEditor';
import SettingsModal from './SettingsModal';
import AboutModal from './AboutModal';
import TrayPinModal from './TrayPinModal';
import ConfirmDialog from './ConfirmDialog';
import { EnterGlyph, modalCardMotion, modalOverlayMotion, modalOverlayStyle, useModalKeys } from './ModalActions';
import { motion, AnimatePresence } from 'motion/react';
import { toNoteMeta, extractThumb } from '../utils/notes';
import { tabSwitchStart, tabSwitchResolve } from '../utils/tabPerf';
import UpdaterBanner from './UpdaterBanner';
import { FILTER_COLORS } from './FolderIcon';

function insertTabAfter(ids: string[], newId: string, afterId: string | null | undefined): string[] {
  if (ids.includes(newId)) return ids;
  if (!afterId) return [...ids, newId];
  const idx = ids.indexOf(afterId);
  if (idx === -1) return [...ids, newId];
  const next = ids.slice();
  next.splice(idx + 1, 0, newId);
  return next;
}

function reorderTabs(ids: string[], fromId: string, toId: string, edge: 'before' | 'after'): string[] {
  if (fromId === toId) return ids;
  const fromIdx = ids.indexOf(fromId);
  const toIdx = ids.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return ids;
  const next = ids.filter(id => id !== fromId);
  let insertAt = next.indexOf(toId);
  if (insertAt < 0) return ids;
  if (edge === 'after') insertAt += 1;
  next.splice(insertAt, 0, fromId);
  if (next.length === ids.length && next.every((id, i) => id === ids[i])) return ids;
  return next;
}

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
  displayName?: string | null;
  onDisplayNameChange?: (name: string) => void | Promise<void>;
  onLanguageChange: (l: Language) => void;
  currentTheme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  colorIntensity: number;
  onIntensityChange: (v: number) => void;
  onLock: () => void;
  onRegisterLockPreparation?: (handler: () => Promise<void>) => () => void;
  autoLockMinutes: number;
  onAutoLockChange: (v: number) => void;
}

type DraftEntry = Pick<NoteDraft, 'title' | 'content'> & {
  baseUpdatedAt: string;
  updatedAt: string;
};

export default function MainApp({
  language,
  displayName,
  onDisplayNameChange,
  onLanguageChange,
  currentTheme,
  onThemeChange,
  colorIntensity,
  onIntensityChange,
  onLock,
  onRegisterLockPreparation,
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
  const [closedTabHistory, setClosedTabHistory] = useState<string[]>([]);
  const [openStickyIds, setOpenStickyIds] = useState<string[]>([]);
  const [trashCount, setTrashCount] = useState(0);
  const [draftCache, setDraftCache] = useState<Record<string, DraftEntry>>({});
  const [draftRecoveryQueue, setDraftRecoveryQueue] = useState<NoteDraft[]>([]);
  const [draftRecoveryNonce, setDraftRecoveryNonce] = useState(0);
  const [noteToCloseWithDraft, setNoteToCloseWithDraft] = useState<Note | null>(null);
  const [pendingBatchCloseIds, setPendingBatchCloseIds] = useState<string[] | null>(null);
  const [pendingNavNoteId, setPendingNavNoteId] = useState<string | null>(null);
  const [confirmLeaveDismissed, setConfirmLeaveDismissed] = useState(false);
  const [dontAskChecked, setDontAskChecked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'general' | 'appearance' | 'security' | 'maintenance'>('general');
  const [showAbout, setShowAbout] = useState(false);
  const [aboutCheckNonce, setAboutCheckNonce] = useState(0);
  const [showTrayPin, setShowTrayPin] = useState(false);
  const [isTrayPinAutomatic, setIsTrayPinAutomatic] = useState(false);
  const [showUnsavedExitDialog, setShowUnsavedExitDialog] = useState(false);
  const [showFirstCloseDialog, setShowFirstCloseDialog] = useState(false);
  const [firstCloseRemember, setFirstCloseRemember] = useState(false);

  const chooseFirstClose = useCallback((action: 'tray' | 'quit') => {
    setShowFirstCloseDialog(false);
    if (firstCloseRemember) setCloseToTray(action === 'tray');
    void window.cyberNotesAPI.respondFirstClose(action, firstCloseRemember);
  }, [firstCloseRemember]);

  useModalKeys({
    enabled: showFirstCloseDialog,
    // Sin botón Cancelar para no saturar: Esc desestima (se queda en la app).
    onEsc: () => setShowFirstCloseDialog(false),
    onEnter: () => chooseFirstClose('tray'),
  });

  // Espacio = Salir (mapa CyberPaste). Se omite si el foco está en un control
  // para no pelear con su comportamiento nativo (checkbox, botones).
  useEffect(() => {
    if (!showFirstCloseDialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' && (e as any).code !== 'Space') return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
      e.preventDefault();
      chooseFirstClose('quit');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFirstCloseDialog, chooseFirstClose]);
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
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [closeToTray, setCloseToTray] = useState(false);
  const [showLineCounter, setShowLineCounter] = useState(false);
  const [showLineGutter, setShowLineGutter] = useState(true);
  const [autosaveEnabled, setAutosaveEnabled] = useState(false);
  const [autoUnlockCapsLock, setAutoUnlockCapsLock] = useState(true);
  const [autoUnlockCapsLockTimeout, setAutoUnlockCapsLockTimeout] = useState(5);
  const [capsStatus, setCapsStatus] = useState<{ active: boolean; timeLeft: number }>({ active: false, timeLeft: 0 });
  const [capsLockSound, setCapsLockSound] = useState('cyber-beep');
  const [capsLockSoundScope, setCapsLockSoundScope] = useState('app');
  const [tabsWidthMode, setTabsWidthMode] = useState<'normal' | 'wide'>('normal');
  const [editorFont, setEditorFont] = useState<EditorFontId>(DEFAULT_EDITOR_FONT);
  const [showMinimap, setShowMinimap] = useState(false);
  const [showWordCounter, setShowWordCounter] = useState(false);
  const [showFloatingToolbar, setShowFloatingToolbar] = useState(true);
  const [hiddenToolbarIds, setHiddenToolbarIds] = useState<string[]>([]);
  const [recentClearedAt, setRecentClearedAt] = useState(0);
  const [openedHistory, setOpenedHistory] = useState<Record<string, number>>({});
  const [triggerNewFolderSignal, setTriggerNewFolderSignal] = useState(0);
  const isLoadedRef = useRef(false);
  const settingsLoadedRef = useRef(false);
  const contentCacheRef = useRef<Record<string, string>>({});
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusBarUrlRef = useRef<string | null>(null);
  const rootStyleRef = useRef<HTMLDivElement | null>(null);
  const selectedNoteIdRef = useRef<string | null>(null);
  const selectedNoteRef = useRef<Note | null>(null);
  const selectedFolderIdRef = useRef<string | null>(null);
  const allNotesRef = useRef<Note[]>([]);
  const notesRef = useRef<Note[]>([]);
  const openStickyIdsRef = useRef<string[]>([]);
  const draftCacheRef = useRef<Record<string, DraftEntry>>({});
  const openedHistoryRef = useRef<Record<string, number>>({});
  const openedHistoryPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justRecordedHistoryRef = useRef<string | null>(null);
  const draftFlushRef = useRef<(() => Promise<void>) | null>(null);
  const draftWriteChainsRef = useRef<Record<string, Promise<boolean>>>({});
  const editorExportActionsRef = useRef<NoteExportActions | null>(null);
  const persistedDraftsRef = useRef<NoteDraft[]>([]);
  const draftsLoadedRef = useRef(false);
  const allNotesLoadedRef = useRef(false);
  selectedNoteIdRef.current = selectedNoteId;
  selectedNoteRef.current = selectedNote;
  selectedFolderIdRef.current = selectedFolderId;
  allNotesRef.current = allNotes;
  notesRef.current = notes;
  openStickyIdsRef.current = openStickyIds;
  draftCacheRef.current = draftCache;
  openedHistoryRef.current = openedHistory;

  const registerEditorExportActions = useCallback((actions: NoteExportActions | null) => {
    editorExportActionsRef.current = actions;
  }, []);

  useEffect(() => {
    const handleExportShortcut = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || event.repeat) return;

      const key = event.key.toLowerCase();
      let action: (() => void | Promise<void>) | undefined;

      if (event.altKey) {
        if (key === 'm') action = editorExportActionsRef.current?.markdown;
        else if (key === 'h') action = editorExportActionsRef.current?.html;
        else if (key === 'p') action = editorExportActionsRef.current?.pdf;
        else if (key === 't') action = editorExportActionsRef.current?.text;
      } else if (key === 'p') {
        action = editorExportActionsRef.current?.print;
      }

      if (!action) return;
      event.preventDefault();
      void action();
    };

    window.addEventListener('keydown', handleExportShortcut);
    return () => window.removeEventListener('keydown', handleExportShortcut);
  }, []);

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
    window.cyberNotesAPI.getTrashCount().then(setTrashCount).catch((err) => {
      console.error('[MainApp] Error loading trash count:', err);
    });

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
      if (data.key === 'confirm_leave_note_dismissed') {
        setConfirmLeaveDismissed(data.value === 'true');
      }
      if (data.key === 'minimize_to_tray') setMinimizeToTray(data.value === 'true');
      if (data.key === 'close_to_tray') setCloseToTray(data.value === 'true');
    });

    const unregisterOpenSettings = window.cyberNotesAPI.onOpenSettings((tab?: string) => {
      if (tab === 'general' || tab === 'appearance' || tab === 'security' || tab === 'maintenance') {
        setSettingsTab(tab);
      }
      setShowSettings(true);
    });

  const unregisterOpenAbout = window.cyberNotesAPI.onOpenAbout((opts) => {
    setShowAbout(true);
    if (opts?.checkUpdates) setAboutCheckNonce((n) => n + 1);
  });

    const unregisterOpenTrayPin = window.cyberNotesAPI.onOpenTrayPin?.(() => {
      setIsTrayPinAutomatic(false);
      setShowTrayPin(true);
    });

    const unregisterUnsavedExit = window.cyberNotesAPI.onConfirmUnsavedExit(() => {
      setShowUnsavedExitDialog(true);
    });

    const unregisterFirstClose = window.cyberNotesAPI.onConfirmFirstClose(() => {
      setFirstCloseRemember(false);
      setShowFirstCloseDialog(true);
    });

    const unregisterNoteUpdated = window.cyberNotesAPI.onNoteUpdated?.((updatedNote) => {
      if (updatedNote.deleted_at) return;
      const meta = toNoteMeta(updatedNote);
      persistedDraftsRef.current = persistedDraftsRef.current.filter(draft => draft.note_id !== updatedNote.id);
      setDraftRecoveryQueue(prev => prev.filter(draft => draft.note_id !== updatedNote.id));
      setAllNotes(prev => {
        const exists = prev.some(n => n.id === updatedNote.id);
        if (exists) return prev.map(n => n.id === updatedNote.id ? { ...n, ...meta } : n);
        return [updatedNote, ...prev];
      });
      setNotes(prev => {
        if (selectedFolderIdRef.current === 'trash') return prev.filter(n => n.id !== updatedNote.id);
        const exists = prev.some(n => n.id === updatedNote.id);
        if (exists) return prev.map(n => n.id === updatedNote.id ? { ...n, ...meta } : n);
        return [updatedNote, ...prev];
      });
      setSelectedNote(prev => {
        if (!prev || prev.id !== updatedNote.id) return prev;
        return selectedFolderIdRef.current === 'trash' ? null : updatedNote;
      });
    });

    const unregisterNoteDeleted = window.cyberNotesAPI.onNoteDeleted?.((deletedId) => {
      setAllNotes(prev => prev.filter(n => n.id !== deletedId));
      setNotes(prev => prev.filter(n => n.id !== deletedId));
      setOpenNoteIds(prev => prev.filter(id => id !== deletedId));
      setSelectedNote(prev => (prev && prev.id === deletedId ? null : prev));
      setSelectedNoteId(prev => (prev === deletedId ? null : prev));
      delete draftCacheRef.current[deletedId];
      setDraftCache(prev => {
        if (!(deletedId in prev)) return prev;
        const next = { ...prev };
        delete next[deletedId];
        return next;
      });
      persistedDraftsRef.current = persistedDraftsRef.current.filter(draft => draft.note_id !== deletedId);
      setDraftRecoveryQueue(prev => prev.filter(draft => draft.note_id !== deletedId));
      setTrashCount(prev => prev + 1);
      if (selectedFolderIdRef.current === 'trash') {
        window.cyberNotesAPI.getTrashNotes().then(trash => setNotes(trash.map(toNoteMeta)));
      }
    });

    const unregisterStickyFocus = window.cyberNotesAPI.onStickyFocusNote?.((targetNoteId) => {
      setSelectedNoteId(targetNoteId);
      setOpenNoteIds(prev => prev.includes(targetNoteId) ? prev : [...prev, targetNoteId]);
    });

    let stickyListenerActive = true;
    window.cyberNotesAPI.getOpenStickyNotes().then((ids) => {
      if (stickyListenerActive && Array.isArray(ids)) {
        openStickyIdsRef.current = ids;
        setOpenStickyIds(ids);
      }
    });
    const unregisterStickyList = window.cyberNotesAPI.onStickyListChanged((ids) => {
      if (stickyListenerActive && Array.isArray(ids)) {
        openStickyIdsRef.current = ids;
        setOpenStickyIds(ids);
      }
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
      if (unregisterOpenTrayPin) unregisterOpenTrayPin();
      if (unregisterUnsavedExit) unregisterUnsavedExit();
      if (unregisterFirstClose) unregisterFirstClose();
      if (unregisterNoteUpdated) unregisterNoteUpdated();
      if (unregisterNoteDeleted) unregisterNoteDeleted();
      if (unregisterStickyFocus) unregisterStickyFocus();
      stickyListenerActive = false;
      unregisterStickyList();
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
    if (selectedNoteId && selectedFolderId !== 'trash') {
      setOpenNoteIds(prev => {
        if (prev.includes(selectedNoteId)) return prev;
        return [...prev, selectedNoteId];
      });
    }
  }, [selectedNoteId, selectedFolderId]);

  // Registrar el momento en que se abre cada nota (para el panel de recientes → "Abiertas").
  // El estado se actualiza de inmediato (la UI lo necesita), pero el stringify +
  // escritura a disco va con debounce fuera del camino crítico de cada click.
  // El click ya registra en su propio batch; este efecto cubre las demás vías
  // (restaurar sesión, cerrar pestaña, lista) y se salta el caso ya registrado.
  useEffect(() => {
    if (!isLoadedRef.current || !selectedNoteId || selectedFolderId === 'trash') return;
    if (justRecordedHistoryRef.current === selectedNoteId) {
      justRecordedHistoryRef.current = null;
      return;
    }
    setOpenedHistory(prev => ({ ...prev, [selectedNoteId]: Date.now() }));
    if (openedHistoryPersistTimer.current) clearTimeout(openedHistoryPersistTimer.current);
    openedHistoryPersistTimer.current = setTimeout(() => {
      openedHistoryPersistTimer.current = null;
      window.cyberNotesAPI
        .setSetting('opened_history', JSON.stringify(openedHistoryRef.current))
        .catch(() => {});
    }, 1500);
  }, [selectedNoteId, selectedFolderId]);

  // Al cerrar la app, vaciar un persist pendiente para no perder el último tramo.
  useEffect(() => () => {
    if (openedHistoryPersistTimer.current) {
      clearTimeout(openedHistoryPersistTimer.current);
      openedHistoryPersistTimer.current = null;
      window.cyberNotesAPI
        .setSetting('opened_history', JSON.stringify(openedHistoryRef.current))
        .catch(() => {});
    }
  }, []);

  const loadSettings = async () => {
    // Anti-doble ejecución (StrictMode en dev monta los efectos dos veces):
    // la segunda copia llegaba tarde con setNoteLoading(true) cuando la primera
    // ya había resuelto, y como la nota no cambiaba el loader quedaba infinito.
    if (settingsLoadedRef.current) return;
    settingsLoadedRef.current = true;
    await loadDrafts();
    const s = await window.cyberNotesAPI.getSettings([
      'ui_scale', 'bg_image', 'glass_blur', 'bg_opacity', 'auto_lock_minutes',
      'remember_last_note', 'minimize_to_tray', 'close_to_tray', 'show_line_counter', 'show_line_gutter', 'autosave_enabled',
      'confirm_leave_note_dismissed', 'auto_unlock_caps_lock', 'auto_unlock_caps_lock_timeout',
      'caps_lock_sound', 'caps_lock_sound_scope', 'tabs_width_mode', 'show_minimap',
      'show_word_counter', 'show_floating_toolbar', 'toolbar_hidden_ids', 'recent_cleared_at', 'opened_history', 'open_note_ids', 'last_note_id',
      'editor_font',
    ]);

    if (s.ui_scale) setUiScale(parseFloat(s.ui_scale));
    if (s.bg_image) setBgImage(s.bg_image);
    if (s.glass_blur) setGlassBlur(parseFloat(s.glass_blur));
    if (s.bg_opacity) setBgOpacity(parseFloat(s.bg_opacity));

    const isRemember = s.remember_last_note === 'true';
    setRememberLastNote(isRemember);
    setMinimizeToTray(s.minimize_to_tray === 'true');
    setCloseToTray(s.close_to_tray === 'true');

    if (s.show_line_gutter === null) setShowLineGutter(true);
    else setShowLineGutter(s.show_line_gutter === 'true');
    setShowLineCounter(s.show_line_counter === 'true');
    setAutosaveEnabled(s.autosave_enabled === 'true');
    setConfirmLeaveDismissed(s.confirm_leave_note_dismissed === 'true');
    setAutoUnlockCapsLock(s.auto_unlock_caps_lock === 'true');
    if (s.auto_unlock_caps_lock_timeout) setAutoUnlockCapsLockTimeout(parseInt(s.auto_unlock_caps_lock_timeout));
    setCapsLockSound(s.caps_lock_sound || 'cyber-beep');
    setCapsLockSoundScope(s.caps_lock_sound_scope || 'app');
    if (s.tabs_width_mode) setTabsWidthMode(s.tabs_width_mode as 'normal' | 'wide');
    if (s.editor_font) {
      setEditorFont(s.editor_font as EditorFontId);
      applyEditorFont(s.editor_font);
    }
    if (s.show_minimap) setShowMinimap(s.show_minimap === 'true');
    setShowWordCounter(s.show_word_counter === 'true');
    if (s.show_floating_toolbar === null) setShowFloatingToolbar(true);
    else setShowFloatingToolbar(s.show_floating_toolbar === 'true');
    if (s.toolbar_hidden_ids) {
      try {
        const parsed: unknown = JSON.parse(s.toolbar_hidden_ids);
        if (Array.isArray(parsed)) {
          setHiddenToolbarIds(parsed.filter((x): x is string => typeof x === 'string' && isToolbarItemId(x)));
        }
      } catch {
        /* ignorar JSON corrupto */
      }
    }
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
    const metas = all.map(toNoteMeta);
    allNotesLoadedRef.current = true;
    allNotesRef.current = metas;
    setAllNotes(metas);
    if (draftsLoadedRef.current) {
      setDraftRecoveryQueue(
        persistedDraftsRef.current.filter(draft => all.some(note => note.id === draft.note_id && !note.deleted_at))
      );
    }
  };

  const loadDrafts = async () => {
    try {
      const drafts = await window.cyberNotesAPI.getDrafts();
      persistedDraftsRef.current = drafts;
      draftsLoadedRef.current = true;
      if (allNotesLoadedRef.current) {
        setDraftRecoveryQueue(
          drafts.filter(draft => allNotesRef.current.some(note => note.id === draft.note_id && !note.deleted_at))
        );
      }
    } catch (err) {
      console.error('[MainApp] Error loading drafts:', err);
    }
  };

  const loadNotes = async (folderId: string | null) => {
    let n: Note[];
    if (folderId === 'trash') {
      n = searchQuery
        ? await window.cyberNotesAPI.searchTrashNotes(searchQuery)
        : await window.cyberNotesAPI.getTrashNotes();
    } else if (searchQuery) {
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

  // La vista de adhesivas depende de ventanas abiertas, no de la carpeta de la nota.
  useEffect(() => {
    if (selectedFolderId !== 'sticky' || searchQuery) return;
    const stickyNotes = allNotes.filter(note => openStickyIds.includes(note.id));
    setNotes(stickyNotes);
    if (stickyNotes.length > 0 && !selectedNoteIdRef.current) {
      setSelectedNoteId(stickyNotes[0].id);
    }
  }, [selectedFolderId, searchQuery, allNotes, openStickyIds]);

  /** Carga content completo de una nota (cache en memoria para pestañas abiertas). */
  const loadFullNote = useCallback(async (id: string | null) => {
    if (!id) {
      setSelectedNote(null);
      setNoteLoading(false);
      return;
    }
    const meta = allNotesRef.current.find(n => n.id === id) || notesRef.current.find(n => n.id === id);
    const activeDraft = draftCacheRef.current[id];
    if (activeDraft && meta) {
      contentCacheRef.current[id] = activeDraft.content;
      setSelectedNote({ ...meta, title: activeDraft.title, content: activeDraft.content });
      setNoteLoading(false);
      return;
    }
    const cached = contentCacheRef.current[id];
    if (cached !== undefined && meta) {
      setSelectedNote({ ...meta, content: cached });
      setNoteLoading(false);
      return;
    }
    // Mantener la nota anterior en pantalla; solo marcar carga
    setNoteLoading(true);
    let full: Note | null | undefined;
    try {
      full = await window.cyberNotesAPI.getNoteById(id);
    } catch (err) {
      console.error('[MainApp] Error loading note:', err);
      if (selectedNoteIdRef.current === id) setNoteLoading(false);
      return;
    }
    if (!full || selectedNoteIdRef.current !== id) {
      // Otra navegación ganó la carrera: no apagar loading aquí si el id ya cambió.
      // Si la nota ya no existe, limpiar la selección: quedarse con el loader
      // infinito sería peor que volver a la bienvenida.
      if (selectedNoteIdRef.current === id) {
        setSelectedNote(null);
        setNoteLoading(false);
      }
      return;
    }
    const latestDraft = draftCacheRef.current[id];
    if (latestDraft) {
      contentCacheRef.current[id] = latestDraft.content;
      setSelectedNote({
        ...toNoteMeta(full),
        title: latestDraft.title,
        content: latestDraft.content,
      });
      setNoteLoading(false);
      return;
    }
    contentCacheRef.current[id] = full.content || '';
    setSelectedNote({ ...toNoteMeta(full), content: full.content || '' });
    setNoteLoading(false);
  }, []);

  /** Intento síncrono de resolver la nota desde cache (borrador o contenido de
      pestañas abiertas). Devuelve cómo se resolvió (o null si hay que ir a disco),
      para que el click no pase por el estado de loading intermedio. */
  const applyCachedNote = useCallback((id: string | null): 'draft' | 'cache' | 'cleared' | null => {
    if (!id) {
      setSelectedNote(null);
      setNoteLoading(false);
      return 'cleared';
    }
    const meta = allNotesRef.current.find(n => n.id === id) || notesRef.current.find(n => n.id === id);
    if (!meta) return null;
    const activeDraft = draftCacheRef.current[id];
    if (activeDraft) {
      contentCacheRef.current[id] = activeDraft.content;
      setSelectedNote({ ...meta, title: activeDraft.title, content: activeDraft.content });
      setNoteLoading(false);
      return 'draft';
    }
    const cached = contentCacheRef.current[id];
    if (cached !== undefined) {
      setSelectedNote({ ...meta, content: cached });
      setNoteLoading(false);
      return 'cache';
    }
    return null;
  }, []);

  // useLayoutEffect: con cache, actualiza selectedNote antes del paint (sin flash a bienvenida)
  // Fast path síncrono para pestañas abiertas: evita el render intermedio con
  // overlay de loading (backdrop-blur) cuando el contenido ya está en memoria.
  useLayoutEffect(() => {
    if (selectedNoteRef.current?.id === selectedNoteId) {
      if (!selectedNoteId) setSelectedNote(null);
      setNoteLoading(false);
      if (selectedNoteId) tabSwitchResolve(selectedNoteId, 'sync-other');
      return;
    }
    const applied = applyCachedNote(selectedNoteId);
    if (applied) {
      if (selectedNoteId) tabSwitchResolve(selectedNoteId, applied);
      return;
    }
    if (selectedNoteId) tabSwitchResolve(selectedNoteId, 'async-miss');
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadFullNote(selectedNoteId);
    })();
    return () => { cancelled = true; };
  }, [selectedNoteId, applyCachedNote, loadFullNote]);

  const queueDraftWrite = useCallback((id: string, draft: DraftEntry) => {
    const note = allNotesRef.current.find(item => item.id === id);
    if (!note) return Promise.resolve(false);

    const payload: NoteDraft = {
      note_id: id,
      title: draft.title,
      content: draft.content,
      base_updated_at: draft.baseUpdatedAt || note.updated_at,
      updated_at: draft.updatedAt,
    };
    const previous = draftWriteChainsRef.current[id] ?? Promise.resolve(true);
    const next = previous
      .catch(() => false)
      .then(() => window.cyberNotesAPI.saveDraft(payload));
    draftWriteChainsRef.current[id] = next;
    next.catch(err => {
      console.error(`[MainApp] Error saving draft ${id}:`, err);
    }).finally(() => {
      if (draftWriteChainsRef.current[id] === next) {
        delete draftWriteChainsRef.current[id];
      }
    });
    return next;
  }, []);

  const registerDraftFlush = useCallback((flush: (() => Promise<void>) | null) => {
    draftFlushRef.current = flush;
  }, []);

  const clearDraftState = useCallback((id: string, removeFromRecoveryQueue = true, keepContentCache = false) => {
    delete draftCacheRef.current[id];
    // OJO: al guardar (keepContentCache) se conserva contentCache porque ya trae
    // lo recién persistido. Evictarla ahí forzaba recarga desde disco + loader
    // con blur cada vez que se volvía a una pestaña ya visitada. Al descartar,
    // cerrar o eliminar se evicta para no servir contenido obsoleto.
    if (!keepContentCache) {
      delete contentCacheRef.current[id];
    }
    persistedDraftsRef.current = persistedDraftsRef.current.filter(draft => draft.note_id !== id);
    setDraftCache(prev => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    if (removeFromRecoveryQueue) {
      setDraftRecoveryQueue(prev => prev.filter(draft => draft.note_id !== id));
    }
  }, []);

  const prepareForLock = useCallback(async () => {
    try {
      await draftFlushRef.current?.();
      await Promise.all(Object.values(draftWriteChainsRef.current));

      const finalWrites = Object.entries(draftCacheRef.current).map(([id, draft]) => {
        const note = allNotesRef.current.find(item => item.id === id);
        if (!note) return Promise.resolve(false);
        return window.cyberNotesAPI.saveDraft({
          note_id: id,
          title: draft.title,
          content: draft.content,
          base_updated_at: draft.baseUpdatedAt || note.updated_at,
          updated_at: draft.updatedAt,
        }, true);
      });
      await Promise.all(finalWrites);
    } catch (err) {
      console.error('[MainApp] Error preparing drafts before lock:', err);
    }
  }, []);

  useEffect(() => {
    if (!onRegisterLockPreparation) return;
    return onRegisterLockPreparation(prepareForLock);
  }, [onRegisterLockPreparation, prepareForLock]);

  const handleSelectFolder = async (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSearchQuery('');
    if (folderId === 'sticky') {
      const stickyNotes = allNotesRef.current.filter(note => openStickyIdsRef.current.includes(note.id));
      setNotes(stickyNotes);
      if (stickyNotes.length > 0 && !selectedNoteIdRef.current) {
        setSelectedNoteId(stickyNotes[0].id);
      }
      return;
    }
    if (folderId === 'trash') {
      const trash = await window.cyberNotesAPI.getTrashNotes();
      setNotes(trash.map(toNoteMeta));
      setSelectedNoteId(trash.length > 0 ? trash[0].id : null);
      return;
    }
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
    clearDraftState(id);
  };

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(async () => {
      if (!q) {
        if (selectedFolderId === 'sticky') {
          setNotes(allNotesRef.current.filter(note => openStickyIdsRef.current.includes(note.id)));
          return;
        }
        if (selectedFolderId === 'trash') {
          const trash = await window.cyberNotesAPI.getTrashNotes();
          setNotes(trash.map(toNoteMeta));
          return;
        }
        const n = await window.cyberNotesAPI.getNotesByFolder(selectedFolderId);
        setNotes(n.map(toNoteMeta));
        return;
      }
      const n = selectedFolderId === 'trash'
        ? await window.cyberNotesAPI.searchTrashNotes(q)
        : await window.cyberNotesAPI.searchNotes(q);
      const visible = selectedFolderId === 'sticky'
        ? n.filter(note => openStickyIdsRef.current.includes(note.id))
        : n;
      setNotes(visible.map(toNoteMeta));
      setSelectedNoteId(visible.length > 0 ? visible[0].id : null);
    }, 250);
  }, [selectedFolderId]);

  const handleCreateNote = useCallback(async (kind: 'note' | 'floating' | 'favorite' = 'note') => {
    const createFloating = kind === 'floating';
    if (createFloating) {
      try {
        const newId = await window.cyberNotesAPI.createAndOpenStickyNote();
        if (newId) {
          const now = new Date().toISOString();
          const meta = toNoteMeta({
            id: newId,
            folder_id: null,
            title: language === 'es' ? 'Nota flotante' : 'Floating note',
            content: '',
            preview: '',
            thumb: '',
            pinned: 0,
            created_at: now,
            updated_at: now,
          });
          contentCacheRef.current[newId] = '';
          setAllNotes(prev => prev.some(n => n.id === newId) ? prev : [meta, ...prev]);
          setNotes(prev => prev.some(n => n.id === newId) ? prev : [meta, ...prev]);
          setOpenNoteIds(prev => insertTabAfter(prev, newId, selectedNoteIdRef.current));
          setSelectedNote({ ...meta, content: '' });
          setSelectedNoteId(newId);
        }
      } catch (err) {
        console.error('[MainApp] Error creating sticky note:', err);
      }
      return;
    }

    const createFavorite = kind === 'favorite';
    const now = new Date().toISOString();
    const newNote: Note = {
      id: window.crypto.randomUUID(),
      folder_id: (selectedFolderId === 'floating' || selectedFolderId === 'favorites' || selectedFolderId === 'sticky')
        ? null
        : selectedFolderId,
      title: language === 'es' ? 'Nueva nota' : 'New note',
      content: '',
      preview: '',
      thumb: '',
      pinned: createFavorite ? 1 : 0,
      created_at: now,
      updated_at: now,
    };
    try {
      const saved = await window.cyberNotesAPI.saveNote(newNote);
      contentCacheRef.current[saved.id] = saved.content || '';
      const meta = toNoteMeta(saved);
      setNotes(prev => [meta, ...prev]);
      setAllNotes(prev => [meta, ...prev]);
      setOpenNoteIds(prev => insertTabAfter(prev, saved.id, selectedNoteIdRef.current));
      setSelectedNote({ ...meta, content: saved.content || '' });
      if (selectedFolderId === 'sticky' || selectedFolderId === 'favorites' || selectedFolderId === 'floating') {
        setSelectedFolderId(null);
      }
      setSelectedNoteId(saved.id);
    } catch (err) {
      console.error('[MainApp] Error creating note:', err);
    }
  }, [selectedFolderId, language]);

  /** Duplica una nota como gemela idéntica (carpeta, favorito y flotante) y la abre. */
  const handleDuplicateNote = useCallback(async (id: string) => {
    const meta = allNotesRef.current.find(n => n.id === id) || notesRef.current.find(n => n.id === id);
    if (!meta) return;
    const full = await window.cyberNotesAPI.getNoteById(id).catch(() => null);
    const now = new Date().toISOString();
    const baseTitle = full?.title ?? meta.title;
    const copy: Note = {
      id: window.crypto.randomUUID(),
      folder_id: full?.folder_id ?? meta.folder_id,
      title: `${baseTitle} ${language === 'es' ? '(copia)' : '(copy)'}`.slice(0, 500),
      content: full?.content ?? '',
      preview: full?.preview ?? meta.preview ?? '',
      thumb: full?.thumb ?? meta.thumb ?? '',
      pinned: full?.pinned ?? meta.pinned ?? 0,
      created_at: now,
      updated_at: now,
    };
    await window.cyberNotesAPI.saveNote(copy);
    const copyMeta = toNoteMeta(copy);
    contentCacheRef.current[copy.id] = copy.content || '';
    setAllNotes(prev => [copyMeta, ...prev]);
    setNotes(prev => [copyMeta, ...prev]);
    setOpenNoteIds(prev => insertTabAfter(prev, copy.id, selectedNoteIdRef.current));
    setSelectedNote({ ...copyMeta, content: copy.content || '' });
    setSelectedNoteId(copy.id);
    if (openStickyIdsRef.current.includes(id)) {
      await window.cyberNotesAPI.openStickyNote(copy.id).catch(() => {});
    }
  }, [language]);

  const handleSaveNote = useCallback(async (note: Note) => {    const thumb = note.thumb || extractThumb(note.content);
    const updated = { ...note, thumb, updated_at: new Date().toISOString() };
    contentCacheRef.current[updated.id] = updated.content || '';
    patchNoteMeta(updated);
    setSelectedNote(prev => (prev && prev.id === updated.id ? updated : prev));
    const pendingDraftWrite = draftWriteChainsRef.current[updated.id];
    if (pendingDraftWrite) await pendingDraftWrite.catch(() => false);
    await window.cyberNotesAPI.saveNote(updated);

    if (selectedFolderId === 'favorites' && updated.pinned !== 1 && !searchQuery) {
      setNotes(prev => prev.filter(n => n.id !== updated.id));
    }
    
    // Al guardar exitosamente, eliminamos la nota del caché de borradores sucios
    // (conservando el contenido en cache: la pestaña sigue abierta).
    clearDraftState(updated.id, true, true);
  }, [clearDraftState, patchNoteMeta, selectedFolderId, searchQuery]);

  const handleEditDraft = useCallback((id: string, title: string, content: string) => {
    const previous = draftCacheRef.current[id];
    const note = allNotesRef.current.find(item => item.id === id);
    const draft: DraftEntry = {
      title,
      content,
      baseUpdatedAt: previous?.baseUpdatedAt || note?.updated_at || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    contentCacheRef.current[id] = content;
    draftCacheRef.current = { ...draftCacheRef.current, [id]: draft };
    setDraftCache(prev => {
      const cur = prev[id];
      if (cur && cur.title === title && cur.content === content) return prev;
      return { ...prev, [id]: draft };
    });
    return queueDraftWrite(id, draft).then(() => undefined);
  }, [queueDraftWrite]);

  const handleDiscardDraft = useCallback(async (id: string) => {
    const pendingDraftWrite = draftWriteChainsRef.current[id];
    if (pendingDraftWrite) await pendingDraftWrite.catch(() => false);
    const deleted = await window.cyberNotesAPI.deleteDraft(id);
    if (!deleted) return;
    clearDraftState(id);
    if (selectedNoteIdRef.current === id) {
      setDraftRecoveryNonce(prev => prev + 1);
    }
  }, [clearDraftState]);

  const resolveDraftRecovery = useCallback(async (continueDraft: boolean) => {
    const draft = draftRecoveryQueue[0];
    if (!draft) return;

    const note = allNotesRef.current.find(item => item.id === draft.note_id);
    if (!note) {
      await window.cyberNotesAPI.deleteDraft(draft.note_id);
      clearDraftState(draft.note_id, false);
      setDraftRecoveryQueue(prev => prev.slice(1));
      return;
    }

    if (continueDraft) {
      const entry: DraftEntry = {
        title: draft.title,
        content: draft.content,
        baseUpdatedAt: draft.base_updated_at,
        updatedAt: draft.updated_at,
      };
      draftCacheRef.current = { ...draftCacheRef.current, [draft.note_id]: entry };
      contentCacheRef.current[draft.note_id] = draft.content;
      setDraftCache(prev => ({ ...prev, [draft.note_id]: entry }));
      setSelectedNote(prev => (
        prev && prev.id === draft.note_id
          ? { ...prev, title: draft.title, content: draft.content }
          : prev
      ));
      setDraftRecoveryNonce(prev => prev + 1);
      setSelectedFolderId(prev => prev === 'sticky' ? prev : note.folder_id);
      setOpenNoteIds(prev => prev.includes(draft.note_id) ? prev : [...prev, draft.note_id]);
      setSelectedNoteId(draft.note_id);
    } else {
      await window.cyberNotesAPI.deleteDraft(draft.note_id);
      clearDraftState(draft.note_id, false);
      if (selectedNoteIdRef.current === draft.note_id) {
        setDraftRecoveryNonce(prev => prev + 1);
      }
    }

    persistedDraftsRef.current = persistedDraftsRef.current.filter(item => item.note_id !== draft.note_id);
    setDraftRecoveryQueue(prev => prev.slice(1));
  }, [draftRecoveryQueue, clearDraftState]);

  useModalKeys({
    enabled: draftRecoveryQueue.length > 0,
    onEsc: () => {},
    onEnter: () => {},
  });

  // Guard de navegación (Caso A): si dejamos una nota con borrador en modo manual,
  // pedimos confirmación antes de cambiar de nota/pestaña.
  const handleAttemptSelectNote = useCallback((targetId: string) => {
    if (targetId === selectedNoteId) return;
    if (!autosaveEnabled && selectedNoteId && draftCache[selectedNoteId] && !confirmLeaveDismissed) {
      setDontAskChecked(false);
      setPendingNavNoteId(targetId);
      return;
    }
    // Fast path: contenido en cache (pestañas abiertas) se resuelve en el mismo
    // batch del click, un solo render sin overlay de loading intermedio.
    // El historial de recientes también entra al batch para no pagar otro render.
    const applied = applyCachedNote(targetId);
    if (isLoadedRef.current && selectedFolderId !== 'trash') {
      setOpenedHistory(prev => ({ ...prev, [targetId]: Date.now() }));
      justRecordedHistoryRef.current = targetId;
      if (openedHistoryPersistTimer.current) clearTimeout(openedHistoryPersistTimer.current);
      openedHistoryPersistTimer.current = setTimeout(() => {
        openedHistoryPersistTimer.current = null;
        window.cyberNotesAPI
          .setSetting('opened_history', JSON.stringify(openedHistoryRef.current))
          .catch(() => {});
      }, 1500);
    }
    tabSwitchStart(targetId, applied ?? 'pending');
    setSelectedNoteId(targetId);
  }, [selectedNoteId, selectedFolderId, autosaveEnabled, draftCache, confirmLeaveDismissed, applyCachedNote]);

  const dismissLeaveNav = useCallback(() => setPendingNavNoteId(null), []);

  const saveAndLeaveNav = useCallback(async () => {
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
  }, [selectedNoteId, draftCache, selectedNote, handleSaveNote, dontAskChecked, pendingNavNoteId]);

  const discardAndLeaveNav = useCallback(async () => {
    if (selectedNoteId) await handleDiscardDraft(selectedNoteId);
    if (dontAskChecked) {
      await window.cyberNotesAPI.setSetting('confirm_leave_note_dismissed', 'true');
      setConfirmLeaveDismissed(true);
    }
    const target = pendingNavNoteId;
    setPendingNavNoteId(null);
    if (target) setSelectedNoteId(target);
  }, [selectedNoteId, handleDiscardDraft, dontAskChecked, pendingNavNoteId]);

  useModalKeys({
    enabled: !!pendingNavNoteId,
    onEsc: dismissLeaveNav,
    onEnter: () => { void saveAndLeaveNav(); },
  });

  const handleReorderTabs = useCallback((fromId: string, toId: string, edge: 'before' | 'after') => {
    setOpenNoteIds(prev => reorderTabs(prev, fromId, toId, edge));
  }, []);

  const executeCloseTabs = useCallback((ids: string[]) => {
    const closingIds = new Set(ids);
    setClosedTabHistory(prev => [
      ...prev.filter(id => !closingIds.has(id)),
      ...ids,
    ].slice(-20));
    setOpenNoteIds(prev => {
      const filtered = prev.filter(noteId => !closingIds.has(noteId));
      if (selectedNoteIdRef.current && closingIds.has(selectedNoteIdRef.current)) {
        setSelectedNoteId(filtered[0] || null);
      }
      return filtered;
    });
  }, []);

  const executeCloseTab = useCallback((id: string) => {
    setClosedTabHistory(prev => [...prev.filter(noteId => noteId !== id), id].slice(-20));
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
    void handleDiscardDraft(id);
    setDraftCache(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, [selectedNoteId, handleDiscardDraft]);

  const requestCloseTabs = useCallback((ids: string[]) => {
    const targets = Array.from(new Set(ids)).filter(id => openNoteIds.includes(id));
    if (targets.length === 0) return;

    const dirtyId = !autosaveEnabled
      ? targets.find(id => draftCache[id] !== undefined)
      : undefined;
    if (dirtyId) {
      const meta = allNotes.find(item => item.id === dirtyId);
      if (meta) {
        const draft = draftCache[dirtyId];
        setPendingBatchCloseIds(targets);
        setNoteToCloseWithDraft({
          ...meta,
          content: draft?.content ?? contentCacheRef.current[dirtyId] ?? '',
          title: draft?.title ?? meta.title,
        });
        return;
      }
    }

    executeCloseTabs(targets);
  }, [openNoteIds, autosaveEnabled, draftCache, allNotes, executeCloseTabs]);

  const handleReopenClosedTab = useCallback(() => {
    const validHistory = closedTabHistory.filter(id => allNotes.some(note => note.id === id && !note.deleted_at));
    const tabId = validHistory[validHistory.length - 1];
    if (!tabId) {
      setClosedTabHistory([]);
      return;
    }

    const meta = allNotes.find(item => item.id === tabId);
    if (!meta) return;
    setClosedTabHistory(validHistory.slice(0, -1));
    setOpenNoteIds(prev => prev.includes(tabId) ? prev : [...prev, tabId]);
    setSelectedFolderId(prev => prev === 'sticky' ? prev : meta.folder_id);
    setSelectedNoteId(tabId);
  }, [closedTabHistory, allNotes]);

  const handleCloseOtherTabs = useCallback((keepId: string) => {
    requestCloseTabs(openNoteIds.filter(id => id !== keepId));
  }, [openNoteIds, requestCloseTabs]);

  const handleCloseTabsToRight = useCallback((fromId: string) => {
    const index = openNoteIds.indexOf(fromId);
    if (index >= 0) requestCloseTabs(openNoteIds.slice(index + 1));
  }, [openNoteIds, requestCloseTabs]);

  const handleCloseAllTabs = useCallback(() => {
    requestCloseTabs(openNoteIds);
  }, [openNoteIds, requestCloseTabs]);

  const saveAndCloseDraftTab = useCallback(async () => {
    if (!noteToCloseWithDraft) return;
    const closedId = noteToCloseWithDraft.id;
    const batchIds = pendingBatchCloseIds;
    const draft = draftCache[noteToCloseWithDraft.id];
    if (draft) {
      await handleSaveNote({ ...noteToCloseWithDraft, title: draft.title, content: draft.content });
    }
    executeCloseTab(closedId);
    setNoteToCloseWithDraft(null);
    setPendingBatchCloseIds(null);
    if (batchIds) {
      void requestCloseTabs(batchIds.filter(id => id !== closedId));
    }
  }, [noteToCloseWithDraft, pendingBatchCloseIds, draftCache, handleSaveNote, executeCloseTab, requestCloseTabs]);

  const closeDraftTabWithoutSaving = useCallback(() => {
    if (!noteToCloseWithDraft) return;
    const closedId = noteToCloseWithDraft.id;
    const batchIds = pendingBatchCloseIds;
    executeCloseTab(closedId);
    setNoteToCloseWithDraft(null);
    setPendingBatchCloseIds(null);
    if (batchIds) {
      void requestCloseTabs(batchIds.filter(id => id !== closedId));
    }
  }, [noteToCloseWithDraft, pendingBatchCloseIds, executeCloseTab, requestCloseTabs]);

  useModalKeys({
    enabled: !!noteToCloseWithDraft && !pendingNavNoteId,
    onEsc: () => {
      setNoteToCloseWithDraft(null);
      setPendingBatchCloseIds(null);
    },
    onEnter: () => { void saveAndCloseDraftTab(); },
  });

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
    setPendingBatchCloseIds(null);
    executeCloseTab(id);
  }, [draftCache, autosaveEnabled, allNotes, executeCloseTab]);

  const handleDeleteNote = async (id: string) => {
    const movedToTrash = await window.cyberNotesAPI.deleteNote(id);
    if (!movedToTrash) return;
    setTrashCount(prev => prev + 1);
    delete contentCacheRef.current[id];
    setClosedTabHistory(prev => prev.filter(noteId => noteId !== id));
    const remaining = notes.filter(n => n.id !== id);
    setNotes(remaining);
    setAllNotes(prev => prev.filter(n => n.id !== id));
    
    // Remover de las pestañas abiertas inmediatamente
    setOpenNoteIds(prev => prev.filter(noteId => noteId !== id));
    
    // Limpiar caché de borrador si existía
    clearDraftState(id);

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

  const handleRestoreNote = async (id: string) => {
    const restored = await window.cyberNotesAPI.restoreNote(id);
    if (!restored) return;
    const meta = toNoteMeta(restored);
    setAllNotes(prev => prev.some(n => n.id === id) ? prev.map(n => n.id === id ? meta : n) : [meta, ...prev]);
    if (selectedFolderId === 'trash') {
      setNotes(prev => prev.filter(n => n.id !== id));
      setSelectedNoteId(prev => prev === id ? null : prev);
      setSelectedNote(prev => prev?.id === id ? null : prev);
    }
    setTrashCount(prev => Math.max(0, prev - 1));
  };

  const handleRestoreAllTrash = async () => {
    const restored = await window.cyberNotesAPI.restoreAllTrash();
    if (restored.length === 0) return;
    const restoredMeta = restored.map(toNoteMeta);
    setAllNotes(prev => {
      const byId = new Map(prev.map(note => [note.id, note]));
      restoredMeta.forEach(note => byId.set(note.id, note));
      return Array.from(byId.values());
    });
    if (selectedFolderId === 'trash') {
      setNotes([]);
      setSelectedNote(null);
      setSelectedNoteId(null);
    }
    setTrashCount(0);
  };

  const handlePurgeNote = async (id: string) => {
    const purged = await window.cyberNotesAPI.purgeNote(id);
    if (!purged) return;
    clearDraftState(id);
    setNotes(prev => prev.filter(n => n.id !== id));
    if (selectedNoteId === id) {
      setSelectedNote(null);
      setSelectedNoteId(null);
    }
    setTrashCount(prev => Math.max(0, prev - 1));
  };

  const handleEmptyTrash = async () => {
    const purgedCount = await window.cyberNotesAPI.emptyTrash();
    if (purgedCount === 0) return;
    setNotes(prev => selectedFolderId === 'trash' ? [] : prev);
    if (selectedFolderId === 'trash') {
      setSelectedNote(null);
      setSelectedNoteId(null);
    }
    setTrashCount(0);
  };

  const handleTogglePin = async (note: Note) => {
    const content = contentCacheRef.current[note.id]
      ?? (selectedNote?.id === note.id ? selectedNote.content : undefined)
      ?? (await window.cyberNotesAPI.getNoteById(note.id))?.content
      ?? '';
    contentCacheRef.current[note.id] = content;
    const updated = { ...note, content, pinned: note.pinned === 1 ? 0 : 1, updated_at: new Date().toISOString() };
    await window.cyberNotesAPI.saveNote(updated);
    clearDraftState(note.id);
    patchNoteMeta(updated);
    if (selectedNoteId === note.id) {
      setSelectedNote(prev => prev ? { ...prev, pinned: updated.pinned, updated_at: updated.updated_at } : prev);
    }
    // Leaving Favorites filter: unfavorited notes drop out of the visible list
    if (selectedFolderId === 'favorites' && updated.pinned !== 1 && !searchQuery) {
      setNotes(prev => prev.filter(n => n.id !== note.id));
    }
  };

  const handleToggleSelectedFavorite = useCallback(() => {
    const target = selectedNoteIdRef.current
      ? allNotesRef.current.find(n => n.id === selectedNoteIdRef.current)
      : undefined;
    if (target) void handleTogglePin(target);
  }, [handleTogglePin]);

  const handleToggleSelectedSticky = useCallback(() => {
    const id = selectedNoteIdRef.current;
    if (!id) return;
    if (openStickyIdsRef.current.includes(id)) {
      void window.cyberNotesAPI.revealStickyNote(id);
    } else {
      void window.cyberNotesAPI.openStickyNote(id);
    }
  }, []);

  const handleMoveNote = async (noteId: string, targetFolderId: string | null) => {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    const content = contentCacheRef.current[noteId]
      ?? (selectedNote?.id === noteId ? selectedNote.content : undefined)
      ?? (await window.cyberNotesAPI.getNoteById(noteId))?.content
      ?? '';
    contentCacheRef.current[noteId] = content;
    // Cambiar de carpeta es una clasificación, no una edición del contenido.
    const updated = { ...note, content, folder_id: targetFolderId, updated_at: note.updated_at };
    await window.cyberNotesAPI.saveNote(updated);
    clearDraftState(noteId);
    
    patchNoteMeta(updated);
    if (selectedNoteId === noteId) {
      setSelectedNote(prev => prev ? { ...prev, folder_id: targetFolderId, updated_at: updated.updated_at } : prev);
    }

    // Si estamos viendo una carpeta específica y movemos la nota a otra, la quitamos de la lista visible
    if (selectedFolderId !== null && selectedFolderId !== 'sticky' && selectedFolderId !== targetFolderId && !searchQuery) {
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
    setFolders(prev => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
  };

  const handleUpdateFolder = async (folder: Folder) => {
    await window.cyberNotesAPI.updateFolder(folder);
    setFolders(prev => prev.map(f => f.id === folder.id ? folder : f).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
  };

  // Atajos globales de teclado
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // No activar si hay modales abiertos
      if (
        showSettings ||
        showAbout ||
        showTrayPin ||
        showUnsavedExitDialog ||
        draftRecoveryQueue.length > 0 ||
        pendingNavNoteId !== null ||
        noteToCloseWithDraft !== null
      ) {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Ctrl+N: Nueva nota
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleCreateNote();
        return;
      }

      // Ctrl+Shift+N: Nueva carpeta
      if (isCtrlOrCmd && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (layoutMode !== 3) {
          setLayoutMode(3);
        }
        setTriggerNewFolderSignal(prev => prev + 1);
        return;
      }

      // Ctrl+F: Buscar notas
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (layoutMode !== 3) {
          setLayoutMode(3);
        }
        setTimeout(() => {
          const searchInput = document.getElementById('cybernotes-search-input') as HTMLInputElement | null;
          if (searchInput) {
            searchInput.focus();
            searchInput.select();
          }
        }, 50);
        return;
      }

      // Ctrl+D: Duplicar nota actual (fuera de campos editables)
      if (isCtrlOrCmd && !e.shiftKey && e.key.toLowerCase() === 'd') {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName;
        const inField = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
          || !!target?.closest?.('[contenteditable="true"]');
        if (!inField) {
          e.preventDefault();
          if (selectedNoteIdRef.current) void handleDuplicateNote(selectedNoteIdRef.current);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    showSettings,
    showAbout,
    showTrayPin,
    showUnsavedExitDialog,
    draftRecoveryQueue.length,
    pendingNavNoteId,
    noteToCloseWithDraft,
    layoutMode,
    handleCreateNote,
    handleDuplicateNote,
  ]);

  const handleDeleteFolder = async (id: string) => {
    const affectedIds = allNotes.filter(note => note.folder_id === id).map(note => note.id);
    const movedCount = await window.cyberNotesAPI.deleteFolder(id);
    setTrashCount(prev => prev + Number(movedCount || 0));
    affectedIds.forEach(noteId => {
      delete draftCacheRef.current[noteId];
    });
    if (affectedIds.length > 0) {
      const affectedSet = new Set(affectedIds);
      setDraftCache(prev => Object.fromEntries(
        Object.entries(prev).filter(([noteId]) => !affectedSet.has(noteId))
      ));
      persistedDraftsRef.current = persistedDraftsRef.current.filter(draft => !affectedSet.has(draft.note_id));
      setDraftRecoveryQueue(prev => prev.filter(draft => !affectedSet.has(draft.note_id)));
    }
    setFolders(prev => prev.filter(f => f.id !== id));
    // Las notas de la carpeta pasan a la Papelera y desaparecen de las vistas activas.
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

  const handleEditorFontChange = async (fontId: EditorFontId) => {
    setEditorFont(fontId);
    applyEditorFont(fontId);
    await window.cyberNotesAPI.setSetting('editor_font', fontId);
  };

  const handleShowMinimapChange = async (v: boolean) => {
    setShowMinimap(v);
    await window.cyberNotesAPI.setSetting('show_minimap', v.toString());
  };

  const handleShowLineCounterChange = async (v: boolean) => {
    setShowLineCounter(v);
    await window.cyberNotesAPI.setSetting('show_line_counter', v.toString());
  };

  const handleShowLineGutterChange = async (v: boolean) => {
    setShowLineGutter(v);
    await window.cyberNotesAPI.setSetting('show_line_gutter', v.toString());
  };

  const handleShowFloatingToolbarChange = async (v: boolean) => {
    setShowFloatingToolbar(v);
    await window.cyberNotesAPI.setSetting('show_floating_toolbar', v.toString());
  };

  const handleHiddenToolbarIdsChange = async (ids: string[]) => {
    setHiddenToolbarIds(ids);
    await window.cyberNotesAPI.setSetting('toolbar_hidden_ids', JSON.stringify(ids));
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

  const recoveryDraft = draftRecoveryQueue[0] ?? null;
  const recoveryNote = recoveryDraft
    ? allNotes.find(note => note.id === recoveryDraft.note_id) ?? null
    : null;
  const recoveryDraftIsStale = !!recoveryDraft
    && !!recoveryNote
    && recoveryDraft.base_updated_at !== recoveryNote.updated_at;

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
        displayName={displayName}
        onLock={onLock}
        onOpenSettings={() => setShowSettings(true)}
        onOpenAbout={() => setShowAbout(true)}
        onOpenTrayPin={() => {
          setIsTrayPinAutomatic(false);
          setShowTrayPin(true);
        }}
        onExportMarkdown={() => editorExportActionsRef.current?.markdown()}
        onExportHtml={() => editorExportActionsRef.current?.html()}
        onExportPdf={() => { void editorExportActionsRef.current?.pdf(); }}
        onExportText={() => editorExportActionsRef.current?.text()}
        onPrint={() => { void editorExportActionsRef.current?.print(); }}
        onSelectNote={(id) => {
          setSelectedNoteId(id);
          const note = allNotes.find(n => n.id === id);
          if (note) setSelectedFolderId(prev => prev === 'sticky' ? prev : note.folder_id);
        }}
        currentNoteId={selectedNoteId}
        currentNotePinned={selectedNote?.pinned === 1}
        isCurrentNoteSticky={!!selectedNoteId && openStickyIds.includes(selectedNoteId)}
        onDuplicateNote={handleDuplicateNote}
        onToggleNoteFavorite={handleToggleSelectedFavorite}
        onToggleNoteSticky={handleToggleSelectedSticky}
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
        onShowMinimapChange={handleShowMinimapChange}
        showLineCounter={showLineCounter}
        onShowLineCounterChange={handleShowLineCounterChange}
        showLineGutter={showLineGutter}
        onShowLineGutterChange={handleShowLineGutterChange}
        showWordCounter={showWordCounter}
        onShowWordCounterChange={(v) => { setShowWordCounter(v); window.cyberNotesAPI.setSetting('show_word_counter', v.toString()); }}
        showFloatingToolbar={showFloatingToolbar}
        onShowFloatingToolbarChange={handleShowFloatingToolbarChange}
        rememberLastNote={rememberLastNote}
        onRememberLastNoteChange={handleRememberLastNoteChange}
        minimizeToTray={minimizeToTray}
        closeToTray={closeToTray}
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
              trashCount={trashCount}
              recentNotes={recentNotesTop6}
              allNotes={allNotes}
              stickyNoteIds={openStickyIds}
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
                if (note) {
                  setSelectedNoteId(id);
                  setSelectedFolderId(prev => prev === 'sticky' ? prev : note!.folder_id);
                }
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
              triggerNewFolderSignal={triggerNewFolderSignal}
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
              onRequestCreateFolder={() => {
                if (layoutMode !== 3) setLayoutMode(3);
                setTriggerNewFolderSignal(prev => prev + 1);
              }}
              onDeleteNote={handleDeleteNote}
              onRestoreNote={handleRestoreNote}
              onRestoreAllTrash={handleRestoreAllTrash}
              onPurgeNote={handlePurgeNote}
              onEmptyTrash={handleEmptyTrash}
              trashCount={trashCount}
              onTogglePin={handleTogglePin}
              onMoveNote={handleMoveNote}
              onRenameNote={handleRenameNote}
              onDuplicateNote={handleDuplicateNote}
              selectedFolder={selectedFolderId === 'sticky'
                ? { id: 'sticky', name: TRANSLATIONS[language].sidebar.stickyNotes, icon: 'app-window', color: FILTER_COLORS.sticky } as Folder
                : selectedFolderId === 'floating'
                ? { id: 'floating', name: TRANSLATIONS[language].sidebar.floatingNotes, icon: 'inbox', color: FILTER_COLORS.unfiled } as Folder
                : selectedFolderId === 'favorites'
                  ? { id: 'favorites', name: TRANSLATIONS[language].sidebar.favorites, icon: 'star', color: FILTER_COLORS.favorites } as Folder
                : selectedFolderId === 'trash'
                  ? { id: 'trash', name: TRANSLATIONS[language].sidebar.trash, icon: 'trash-2', color: FILTER_COLORS.trash } as Folder
                : selectedFolderId === null
                  ? { id: 'all', name: TRANSLATIONS[language].sidebar.allNotes, icon: 'file-text', color: FILTER_COLORS.all } as Folder
                : (folders.find(f => f.id === selectedFolderId) ?? null)}
              searchQuery={searchQuery}
              uiScale={uiScale}
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
          readOnly={selectedFolderId === 'trash'}
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
          openStickyIds={openStickyIds}
          onSelectNote={handleAttemptSelectNote}
          onCloseTab={handleCloseTab}
          onDuplicateNote={handleDuplicateNote}
          onCloseOtherTabs={handleCloseOtherTabs}
          onCloseTabsToRight={handleCloseTabsToRight}
          onCloseAllTabs={handleCloseAllTabs}
          onReopenClosedTab={handleReopenClosedTab}
          canReopenClosedTab={closedTabHistory.length > 0}
          onReorderTabs={handleReorderTabs}
          onRegisterExportActions={registerEditorExportActions}
          draftCache={draftCache}
          onEditDraft={handleEditDraft}
          onDiscardDraft={handleDiscardDraft}
          onRegisterDraftFlush={registerDraftFlush}
          draftRecoveryNonce={draftRecoveryNonce}
          tabsWidthMode={tabsWidthMode}
          showMinimap={showMinimap}
          onShowMinimapChange={handleShowMinimapChange}
          showLineGutter={showLineGutter}
          onShowLineGutterChange={handleShowLineGutterChange}
          showWordCounter={showWordCounter}
          showFloatingToolbar={showFloatingToolbar}
          hiddenToolbarIds={hiddenToolbarIds}
          onHiddenToolbarIdsChange={handleHiddenToolbarIdsChange}
        />
      </div>

      {showSettings && (
        <SettingsModal
          initialTab={settingsTab}
          language={language}
          displayName={displayName}
          onDisplayNameChange={onDisplayNameChange}
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
          onShowLineGutterChange={handleShowLineGutterChange}
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
          onOpenAbout={() => {
            setShowSettings(false);
            setShowAbout(true);
          }}
          onOpenTrayPin={(isAuto) => {
            setIsTrayPinAutomatic(!!isAuto);
            setShowTrayPin(true);
          }}
          tabsWidthMode={tabsWidthMode}
          onTabsWidthModeChange={handleTabsWidthModeChange}
          editorFont={editorFont}
          onEditorFontChange={handleEditorFontChange}
          showMinimap={showMinimap}
          onShowMinimapChange={handleShowMinimapChange}
          showWordCounter={showWordCounter}
          onShowWordCounterChange={(v: boolean) => { setShowWordCounter(v); window.cyberNotesAPI.setSetting('show_word_counter', v.toString()); }}
          showFloatingToolbar={showFloatingToolbar}
          onShowFloatingToolbarChange={handleShowFloatingToolbarChange}
          hiddenToolbarIds={hiddenToolbarIds}
          onHiddenToolbarIdsChange={handleHiddenToolbarIdsChange}
        />
      )}

      {showAbout && (
        <AboutModal
          language={language}
          onClose={() => setShowAbout(false)}
          autoCheckNonce={aboutCheckNonce}
        />
      )}

      {showTrayPin && (
        <TrayPinModal
          language={language}
          onClose={() => setShowTrayPin(false)}
          isAutomatic={isTrayPinAutomatic}
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

      {showFirstCloseDialog && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="first-close-title" style={{ width: 520 }}>
            <div className="modal-header">
              <h2 id="first-close-title" style={{ margin: 0, fontSize: 17, fontWeight: 700, color: 'var(--text-primary)' }}>
                {language === 'es' ? 'Cerrar ventana' : 'Close window'}
              </h2>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                {language === 'es'
                  ? '¿Qué te gustaría hacer al cerrar la ventana? Minimizar a la bandeja mantiene CyberNotes en segundo plano; salir la cierra por completo.'
                  : 'What would you like to do when closing the window? Minimizing to tray keeps CyberNotes in the background; quitting closes it completely.'}
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={firstCloseRemember}
                  onChange={(e) => setFirstCloseRemember(e.target.checked)}
                  style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {language === 'es' ? 'Recordar mi elección' : 'Remember my choice'}
                </span>
              </label>
              <div className="modal-actions" style={{ marginTop: 2 }}>
                <button
                  type="button"
                  className="modal-action-btn is-cancel"
                  style={{ color: '#f87171' }}
                  onClick={() => chooseFirstClose('quit')}
                >
                  {language === 'es' ? 'Salir' : 'Quit'}
                  <span className="modal-key-esc">{language === 'es' ? 'Espacio' : 'Space'}</span>
                </button>
                <button
                  type="button"
                  className="modal-action-btn is-save"
                  onClick={() => chooseFirstClose('tray')}
                >
                  {language === 'es' ? 'Minimizar a la bandeja' : 'Minimize to tray'}
                  <EnterGlyph />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {recoveryDraft && recoveryNote && (
          <motion.div
            key={`draft-recovery-${recoveryDraft.note_id}`}
            {...modalOverlayMotion}
            style={{ ...modalOverlayStyle, zIndex: 21000 }}
          >
            <motion.div
              {...modalCardMotion}
              className="glass-effect"
              style={{
                width: 'calc(440px * var(--ui-scale))',
                maxWidth: 'calc(100vw - 32px)',
                background: 'rgba(15, 15, 22, 0.97)',
                border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
                borderRadius: 'var(--radius-lg)',
                padding: '24px 28px',
                boxShadow: '0 20px 50px rgba(0,0,0,0.65), 0 0 30px var(--accent-glow)',
                display: 'flex',
                flexDirection: 'column',
                gap: 18,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  flexShrink: 0,
                  background: 'var(--accent-dim)',
                  border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-light)',
                  fontSize: 22,
                }}>
                  ↻
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{
                    fontSize: 'calc(16px * var(--ui-scale))',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    margin: 0,
                  }}>
                    {language === 'es' ? 'Borrador recuperable' : 'Recoverable draft'}
                  </h3>
                  <p style={{
                    fontSize: 'calc(12.5px * var(--ui-scale))',
                    color: 'var(--text-secondary)',
                    margin: '6px 0 0',
                    lineHeight: 1.5,
                  }}>
                    {language === 'es'
                      ? `La nota "${recoveryDraft.title || recoveryNote.title}" tiene un borrador guardado antes del bloqueo.`
                      : `The note "${recoveryDraft.title || recoveryNote.title}" has a draft saved before the lock.`}
                  </p>
                </div>
              </div>

              <p style={{
                fontSize: 'calc(11.5px * var(--ui-scale))',
                color: recoveryDraftIsStale ? 'var(--warning)' : 'var(--text-muted)',
                margin: 0,
                lineHeight: 1.45,
              }}>
                {recoveryDraftIsStale
                  ? (language === 'es'
                    ? 'La versión guardada cambió después de crear este borrador. Puedes conservar el borrador o descartarlo.'
                    : 'The saved version changed after this draft was created. You can keep the draft or discard it.')
                  : (language === 'es'
                    ? 'La versión guardada no se modificará hasta que decidas guardar el borrador.'
                    : 'The saved version will not change until you choose to save the draft.')}
              </p>

              <div className="modal-actions is-stack">
                <button
                  type="button"
                  className="modal-action-btn is-save"
                  onClick={() => { void resolveDraftRecovery(true); }}
                >
                  {language === 'es' ? 'Continuar con el borrador' : 'Continue with draft'}
                  <EnterGlyph />
                </button>
                <button
                  type="button"
                  className="modal-action-btn is-danger"
                  onClick={() => { void resolveDraftRecovery(false); }}
                >
                  {language === 'es' ? 'Volver a la versión guardada' : 'Use saved version'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmación de Cierre de Pestaña Sucia */}
      <AnimatePresence>
        {noteToCloseWithDraft && (
          <motion.div
            key="close-dirty-tab"
            {...modalOverlayMotion}
            style={{ ...modalOverlayStyle, zIndex: 20000 }}
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
                display: 'flex',
                flexDirection: 'column',
                gap: 20,
              }}
            >
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

              <div className="modal-actions is-stack">
                <button type="button" className="modal-action-btn is-save" onClick={() => { void saveAndCloseDraftTab(); }}>
                  {language === 'es' ? 'Guardar y cerrar' : 'Save & close'}
                  <EnterGlyph />
                </button>
                <button type="button" className="modal-action-btn is-danger" onClick={closeDraftTabWithoutSaving}>
                  {language === 'es' ? 'Cerrar sin guardar' : 'Close without saving'}
                </button>
                <button type="button" className="modal-action-btn is-cancel" onClick={() => setNoteToCloseWithDraft(null)}>
                  {language === 'es' ? 'Cancelar' : 'Cancel'}
                  <span className="modal-key-esc">Esc</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Confirmación al Navegar fuera de una nota con borrador (Caso A) */}
      <AnimatePresence>
        {pendingNavNoteId && (
          <motion.div
            key="leave-nav"
            {...modalOverlayMotion}
            style={{ ...modalOverlayStyle, zIndex: 20000 }}
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
                      ? `La nota "${(selectedNoteId && draftCache[selectedNoteId]?.title) || selectedNote?.title || ''}" tiene cambios sin guardar.`
                      : `The note "${(selectedNoteId && draftCache[selectedNoteId]?.title) || selectedNote?.title || ''}" has unsaved changes.`}
                  </p>
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 'calc(12px * var(--ui-scale))', color: 'var(--text-muted)' }}>
                <input
                  type="checkbox"
                  checked={dontAskChecked}
                  onChange={e => setDontAskChecked(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                />
                {language === 'es' ? 'No volver a mostrar este aviso' : 'Do not show this warning again'}
              </label>

              <div className="modal-actions is-stack">
                <button type="button" className="modal-action-btn is-save" onClick={() => { void saveAndLeaveNav(); }}>
                  {language === 'es' ? 'Guardar y continuar' : 'Save & continue'}
                  <EnterGlyph />
                </button>
                <button type="button" className="modal-action-btn is-danger" onClick={() => { void discardAndLeaveNav(); }}>
                  {language === 'es' ? 'Salir sin guardar' : 'Leave without saving'}
                </button>
                <button type="button" className="modal-action-btn is-cancel" onClick={dismissLeaveNav}>
                  {language === 'es' ? 'Seguir aquí' : 'Stay here'}
                  <span className="modal-key-esc">Esc</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <UpdaterBanner language={language} />

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
