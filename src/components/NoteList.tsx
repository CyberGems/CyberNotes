import { useRef, useEffect, useState, useMemo, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Note, Folder } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import { Plus, Trash2, Star, Search, ArrowUpDown, ChevronDown, ChevronRight, Check, LayoutList, StretchHorizontal, FileText, Pencil, FolderInput, ExternalLink, RotateCcw, AppWindow, FolderPlus, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useInputContextMenu } from '../hooks/useInputContextMenu';
import FolderIcon, { FILTER_COLORS } from './FolderIcon';
import Tooltip from './Tooltip';
import { EnterGlyph, useModalKeys } from './ModalActions';

interface Props {
  language: Language;
  notes: Note[];
  folders: Folder[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: (kind?: 'note' | 'floating' | 'favorite') => void;
  onRequestCreateFolder: () => void;
  onDeleteNote: (id: string) => void;
  onRestoreNote: (id: string) => void;
  onRestoreAllTrash: () => void;
  onPurgeNote: (id: string) => void;
  onEmptyTrash: () => void;
  trashCount: number;
  onTogglePin: (note: Note) => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  onRenameNote: (id: string, title: string) => void;
  selectedFolder: Folder | null;
  searchQuery: string;
  uiScale?: number;
}

function formatDate(iso: string, language: Language): string {
  const d = new Date(iso);
  const now = new Date();
  
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();

  const isEn = language === 'en';
  const locale = isEn ? 'en-US' : 'es-ES';
  const timeStr = d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });

  if (isToday) {
    return isEn ? `Today, ${timeStr}` : `Hoy, ${timeStr}`;
  } else if (isYesterday) {
    return isEn ? `Yesterday, ${timeStr}` : `Ayer, ${timeStr}`;
  } else {
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' }) + `, ${timeStr}`;
  }
}

export interface NoteGroup {
  key: string;
  label: string;
  isPinnedGroup?: boolean;
  isFloatingGroup?: boolean;
  notes: Note[];
}

function getDateGroupKeyAndLabel(
  dateIso: string,
  now: Date,
  startOfToday: Date,
  startOfYesterday: Date,
  startOf7Days: Date,
  startOf30Days: Date,
  language: Language
): { key: string; label: string } {
  const d = new Date(dateIso);
  const isEn = language === 'en';
  if (isNaN(d.getTime())) {
    return { key: 'other', label: isEn ? 'Other' : 'Otras' };
  }

  if (d >= startOfToday) {
    return { key: 'today', label: isEn ? 'Today' : 'Hoy' };
  }
  if (d >= startOfYesterday) {
    return { key: 'yesterday', label: isEn ? 'Yesterday' : 'Ayer' };
  }
  if (d >= startOf7Days) {
    return { key: 'prev7', label: isEn ? 'Previous 7 Days' : 'Últimos 7 días' };
  }
  if (d >= startOf30Days) {
    return { key: 'prev30', label: isEn ? 'Previous 30 Days' : 'Últimos 30 días' };
  }

  const locale = isEn ? 'en-US' : 'es-ES';
  if (d.getFullYear() === now.getFullYear()) {
    const monthStr = d.toLocaleDateString(locale, { month: 'long' });
    const capitalizedMonth = monthStr.charAt(0).toUpperCase() + monthStr.slice(1);
    return {
      key: `month_${d.getFullYear()}_${d.getMonth()}`,
      label: capitalizedMonth,
    };
  }

  const monthYearStr = d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const capitalizedMonthYear = monthYearStr.charAt(0).toUpperCase() + monthYearStr.slice(1);
  return {
    key: `year_${d.getFullYear()}_${d.getMonth()}`,
    label: capitalizedMonthYear,
  };
}

type ViewMode = 'normal' | 'compact';

/** Altura de slot virtual = card + márgenes verticales del diseño original. */
const ROW_NORMAL = 112;  // ~104 card + 8 (margin 4+4)
const ROW_COMPACT = 58;  // ~52 card + 6 (margin 3+3)
const OVERSCAN = 8;
const FLOATING_GROUP_KEY = 'floating';
const FLOATING_GROUP_READY_KEY = 'note_list_floating_group_ready';

function NewNoteSplitButton({
  language,
  createNoteLabel,
  createNoteAriaLabel,
  showFloatingOption,
  showFavoriteOption,
  showNoteOption,
  showFolderOption,
  onCreateNote,
  onRequestCreateFolder,
}: {
  language: Language;
  createNoteLabel: string;
  createNoteAriaLabel: string;
  showFloatingOption: boolean;
  showFavoriteOption: boolean;
  showNoteOption: boolean;
  showFolderOption: boolean;
  onCreateNote: (kind?: 'note' | 'floating' | 'favorite') => void;
  onRequestCreateFolder: () => void;
}) {
  const t = TRANSLATIONS[language];
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const closeTimer = useRef<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const hasExtras = showNoteOption || showFloatingOption || showFavoriteOption || showFolderOption;

  const cancelClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  const updatePos = () => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
  };

  const openMenu = () => {
    cancelClose();
    updatePos();
    setOpen(true);
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => {
      setOpen(false);
      closeTimer.current = null;
    }, 160);
  };

  useEffect(() => () => cancelClose(), []);

  return (
    <div
      ref={wrapRef}
      className="new-note-split"
      onMouseEnter={hasExtras ? openMenu : undefined}
      onMouseLeave={hasExtras ? scheduleClose : undefined}
    >
      <button
        className="new-note-btn"
        type="button"
        onClick={() => onCreateNote()}
        aria-label={createNoteAriaLabel}
        aria-haspopup={hasExtras ? 'menu' : undefined}
        aria-expanded={hasExtras ? open : undefined}
        style={{
          minWidth: 96,
          justifyContent: 'center',
          fontSize: 'calc(12px * var(--ui-scale))',
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <Plus size={14} />
        {createNoteLabel}
      </button>
      {createPortal(
        <AnimatePresence>
          {open && hasExtras && menuPos && (
            <motion.div
              className="new-note-split-menu"
              role="menu"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.14 }}
              style={{ top: menuPos.top, right: menuPos.right }}
              onMouseEnter={openMenu}
              onMouseLeave={scheduleClose}
            >
              {showNoteOption && (
                <button
                  type="button"
                  role="menuitem"
                  className="new-note-split-item"
                  onClick={() => { onCreateNote('note'); setOpen(false); }}
                >
                  <FileText size={14} />
                  {t.noteList.newNoteShort}
                </button>
              )}
              {showFloatingOption && (
                <button
                  type="button"
                  role="menuitem"
                  className="new-note-split-item"
                  onClick={() => { onCreateNote('floating'); setOpen(false); }}
                >
                  <AppWindow size={14} />
                  {t.noteList.newFloatingNote}
                </button>
              )}
              {showFavoriteOption && (
                <button
                  type="button"
                  role="menuitem"
                  className="new-note-split-item"
                  onClick={() => { onCreateNote('favorite'); setOpen(false); }}
                >
                  <Star size={14} />
                  {t.noteList.newFavoriteShort}
                </button>
              )}
              {showFolderOption && (
                <button
                  type="button"
                  role="menuitem"
                  className="new-note-split-item"
                  onClick={() => { onRequestCreateFolder(); setOpen(false); }}
                >
                  <FolderPlus size={14} />
                  {t.noteList.newFolderShort}
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

export default function NoteList({
  language, notes: initialNotes, folders, selectedNoteId, onSelectNote, onCreateNote,
  onRequestCreateFolder,
  onDeleteNote, onRestoreNote, onRestoreAllTrash, onPurgeNote, onEmptyTrash, trashCount,
  onTogglePin, onMoveNote, onRenameNote, selectedFolder, searchQuery, uiScale = 1,
}: Props) {
  const t = TRANSLATIONS[language];
  const isStickyFolder = selectedFolder?.id === 'sticky';
  const isFavoriteFolder = selectedFolder?.id === 'favorites';
  const isUnfiledFolder = selectedFolder?.id === 'floating';
  const isTrashFolder = selectedFolder?.id === 'trash';
  const createNoteLabel = t.noteList.add;
  const createNoteTooltip = t.noteList.addNote;
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'alpha' | 'alpha-desc'>('updated');
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, note: Note } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [renameTarget, setRenameTarget] = useState<Note | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [skipMoveToTrashConfirmation, setSkipMoveToTrashConfirmation] = useState(false);
  const [dontAskMoveToTrash, setDontAskMoveToTrash] = useState(false);
  const [showEmptyTrashConfirm, setShowEmptyTrashConfirm] = useState(false);
  const [openStickyIds, setOpenStickyIds] = useState<string[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const listRef = useRef<HTMLDivElement>(null);
  const inputMenu = useInputContextMenu(language);
  const folderMap = useMemo(() => {
    const m = new Map<string, Folder>();
    folders.forEach(f => m.set(f.id, f));
    return m;
  }, [folders]);

  useEffect(() => {
    let active = true;
    window.cyberNotesAPI?.getOpenStickyNotes().then((ids) => {
      if (active && Array.isArray(ids)) setOpenStickyIds(ids);
    });
    const unregister = window.cyberNotesAPI?.onStickyListChanged((ids) => {
      if (active) setOpenStickyIds(ids);
    });
    return () => {
      active = false;
      if (unregister) unregister();
    };
  }, []);

  useEffect(() => {
    let active = true;
    window.cyberNotesAPI?.getSetting('confirm_move_note_to_trash_dismissed').then((value) => {
      if (active) setSkipMoveToTrashConfirmation(value === 'true');
    });
    const unregister = window.cyberNotesAPI?.onSettingChanged((data) => {
      if (data.key === 'confirm_move_note_to_trash_dismissed') {
        setSkipMoveToTrashConfirmation(data.value === 'true');
      }
    });
    return () => {
      active = false;
      if (unregister) unregister();
    };
  }, []);

  useModalKeys({
    enabled: !!noteToDelete,
    onEsc: () => setNoteToDelete(null),
    onEnter: () => {
      if (!noteToDelete) return;
      void (async () => {
        if (!isTrashFolder && dontAskMoveToTrash) {
          setSkipMoveToTrashConfirmation(true);
          await window.cyberNotesAPI.setSetting('confirm_move_note_to_trash_dismissed', 'true');
        }
        if (isTrashFolder) onPurgeNote(noteToDelete.id);
        else onDeleteNote(noteToDelete.id);
        setNoteToDelete(null);
        setContextMenu(null);
      })();
    },
  });

  useModalKeys({
    enabled: showEmptyTrashConfirm,
    onEsc: () => setShowEmptyTrashConfirm(false),
    onEnter: () => { void onEmptyTrash(); setShowEmptyTrashConfirm(false); },
  });

  const COLLAPSED_GROUPS_STORAGE_KEY = 'cybernotes_notelist_collapsed_groups';
  const COLLAPSED_GROUPS_SETTING_KEY = 'note_list_collapsed_groups';
  const [groupByDate, setGroupByDate] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY);
      const ready = localStorage.getItem(FLOATING_GROUP_READY_KEY) === 'true';
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const next = new Set<string>(parsed);
          if (!ready) next.add(FLOATING_GROUP_KEY);
          return next;
        }
      }
    } catch {}
    return new Set([FLOATING_GROUP_KEY]);
  });

  const persistCollapsedGroups = useCallback((groups: Set<string>) => {
    const serialized = JSON.stringify(Array.from(groups));
    void window.cyberNotesAPI?.setSetting(COLLAPSED_GROUPS_SETTING_KEY, serialized);
    try {
      // Keep the old local value as a fallback for existing profiles.
      localStorage.setItem(COLLAPSED_GROUPS_STORAGE_KEY, serialized);
    } catch {}
  }, []);

  // Cargar preferencias de lista y migrar el estado local anterior a settings.
  useEffect(() => {
    let active = true;
    const loadListPreferences = async () => {
      const settings = await window.cyberNotesAPI.getSettings([
        'note_list_view_mode',
        'note_list_group_by_date',
        COLLAPSED_GROUPS_SETTING_KEY,
        FLOATING_GROUP_READY_KEY,
      ]);
      if (!active) return;

      const viewModeValue = settings.note_list_view_mode;
      if (viewModeValue === 'compact' || viewModeValue === 'normal') {
        setViewMode(viewModeValue);
      }

      const groupByDateValue = settings.note_list_group_by_date;
      if (groupByDateValue !== null) {
        setGroupByDate(groupByDateValue !== 'false' && groupByDateValue !== '0');
      }

      const floatingReady = settings[FLOATING_GROUP_READY_KEY] === 'true';
      const markFloatingReady = (groups: Set<string>) => {
        if (floatingReady) return groups;
        groups.add(FLOATING_GROUP_KEY);
        void window.cyberNotesAPI?.setSetting(FLOATING_GROUP_READY_KEY, 'true');
        try { localStorage.setItem(FLOATING_GROUP_READY_KEY, 'true'); } catch {}
        persistCollapsedGroups(groups);
        return groups;
      };

      if (settings[COLLAPSED_GROUPS_SETTING_KEY]) {
        try {
          const parsed = JSON.parse(settings[COLLAPSED_GROUPS_SETTING_KEY] as string);
          if (Array.isArray(parsed)) setCollapsedGroups(markFloatingReady(new Set(parsed)));
        } catch {
          // Ignore malformed preference data and retain the current fallback.
        }
      } else {
        try {
          const legacy = localStorage.getItem(COLLAPSED_GROUPS_STORAGE_KEY);
          if (legacy) {
            const parsed = JSON.parse(legacy);
            if (Array.isArray(parsed)) {
              const migrated = markFloatingReady(new Set<string>(parsed));
              setCollapsedGroups(migrated);
            }
          } else {
            setCollapsedGroups(markFloatingReady(new Set([FLOATING_GROUP_KEY])));
          }
        } catch {}
      }
    };
    void loadListPreferences();
    return () => { active = false; };
  }, [persistCollapsedGroups]);

  // Alterna y persiste la agrupación por fecha
  const handleToggleGroupByDate = () => {
    const next = !groupByDate;
    setGroupByDate(next);
    void window.cyberNotesAPI?.setSetting('note_list_group_by_date', next ? 'true' : 'false');
  };

  const toggleGroupCollapse = (groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      persistCollapsedGroups(next);
      return next;
    });
  };

  // Alterna y persiste la densidad elegida
  const handleToggleViewMode = () => {
    const next: ViewMode = viewMode === 'normal' ? 'compact' : 'normal';
    setViewMode(next);
    window.cyberNotesAPI?.setSetting('note_list_view_mode', next);
  };

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    document.addEventListener('click', closeContextMenu);
    return () => document.removeEventListener('click', closeContextMenu);
  }, []);

  // Lógica de ordenación
  const sortedNotes = useMemo(() => {
    return [...initialNotes].sort((a, b) => {
      if (a.pinned !== b.pinned) return b.pinned - a.pinned;
      if (sortBy === 'updated') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      if (sortBy === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortBy === 'alpha') return a.title.localeCompare(b.title);
      return b.title.localeCompare(a.title);
    });
  }, [initialNotes, sortBy]);

  const isolateFloatingNotes = !isStickyFolder && !isTrashFolder && !isUnfiledFolder;

  const { floatingNotes, regularNotes } = useMemo(() => {
    if (!isolateFloatingNotes) {
      return { floatingNotes: [] as Note[], regularNotes: sortedNotes };
    }
    const floating: Note[] = [];
    const regular: Note[] = [];
    for (const note of sortedNotes) {
      if (openStickyIds.includes(note.id)) floating.push(note);
      else regular.push(note);
    }
    return { floatingNotes: floating, regularNotes: regular };
  }, [sortedNotes, isolateFloatingNotes, openStickyIds]);

  const isGroupingActive = groupByDate && (sortBy === 'updated' || sortBy === 'created');
  const showFloatingSection = floatingNotes.length > 0;
  const useGroupLayout = isGroupingActive || showFloatingSection;

  const noteGroups = useMemo<NoteGroup[]>(() => {
    const isEn = language === 'en';
    const groups: NoteGroup[] = [];

    if (showFloatingSection) {
      groups.push({
        key: FLOATING_GROUP_KEY,
        label: t.sidebar.stickyNotes,
        isFloatingGroup: true,
        notes: floatingNotes,
      });
    }

    if (!isGroupingActive) return groups;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const startOf7Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const startOf30Days = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);

    const notesForDateGroups: Note[] = [];

    if (isFavoriteFolder || isUnfiledFolder) {
      notesForDateGroups.push(...regularNotes);
    } else {
      const pinnedNotes: Note[] = [];
      const unpinnedNotes: Note[] = [];

      for (const note of regularNotes) {
        if (note.pinned) {
          pinnedNotes.push(note);
        } else {
          unpinnedNotes.push(note);
        }
      }

      if (pinnedNotes.length > 0) {
        groups.push({
          key: 'pinned',
          label: t.sidebar.favorites,
          isPinnedGroup: true,
          notes: pinnedNotes,
        });
      }

      notesForDateGroups.push(...unpinnedNotes);
    }

    const groupMap = new Map<string, NoteGroup>();

    for (const note of notesForDateGroups) {
      const dateIso = sortBy === 'created' ? note.created_at : note.updated_at;
      const { key, label } = getDateGroupKeyAndLabel(
        dateIso,
        now,
        startOfToday,
        startOfYesterday,
        startOf7Days,
        startOf30Days,
        language
      );

      let group = groupMap.get(key);
      if (!group) {
        group = { key, label, notes: [] };
        groupMap.set(key, group);
        groups.push(group);
      }
      group.notes.push(note);
    }

    return groups;
  }, [floatingNotes, regularNotes, isGroupingActive, showFloatingSection, sortBy, language, isFavoriteFolder, isUnfiledFolder, t.sidebar.stickyNotes, t.sidebar.favorites]);

  // Si la nota seleccionada está en un grupo colapsado, expandirlo automáticamente
  useEffect(() => {
    if (!selectedNoteId || !useGroupLayout) return;
    for (const g of noteGroups) {
      if (g.key === FLOATING_GROUP_KEY) continue;
      if (g.notes.some(n => n.id === selectedNoteId)) {
        if (collapsedGroups.has(g.key)) {
          setCollapsedGroups(prev => {
            const next = new Set(prev);
            next.delete(g.key);
            persistCollapsedGroups(next);
            return next;
          });
        }
        break;
      }
    }
  }, [selectedNoteId, useGroupLayout, noteGroups, persistCollapsedGroups, collapsedGroups]);

  const navigableNotes = useMemo(() => {
    if (!useGroupLayout) return sortedNotes;
    const list: Note[] = [];
    for (const group of noteGroups) {
      if (!collapsedGroups.has(group.key)) {
        list.push(...group.notes);
      }
    }
    if (!isGroupingActive) list.push(...regularNotes);
    return list;
  }, [useGroupLayout, isGroupingActive, sortedNotes, regularNotes, noteGroups, collapsedGroups]);

  const rowHeight = Math.round((viewMode === 'compact' ? ROW_COMPACT : ROW_NORMAL) * (uiScale || 1));
  const virtualNotes = (!isGroupingActive && showFloatingSection) ? regularNotes : sortedNotes;
  const totalHeight = virtualNotes.length * rowHeight;

  // Virtualización: solo montar filas visibles
  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const visible = Math.ceil(viewportHeight / rowHeight) + OVERSCAN * 2;
    const end = Math.min(virtualNotes.length, start + visible);
    return { startIndex: start, endIndex: end, offsetY: start * rowHeight };
  }, [scrollTop, viewportHeight, rowHeight, virtualNotes.length]);

  const visibleNotes = useMemo(
    () => virtualNotes.slice(startIndex, endIndex),
    [virtualNotes, startIndex, endIndex]
  );

  // Calcular notas ocultas debajo del scroll + medir viewport
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const update = () => {
      setViewportHeight(el.clientHeight);
      setScrollTop(el.scrollTop);
      let remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining > 10 && sortedNotes.length > 0) {
        let ratio = remaining / el.scrollHeight;
        let hidden = Math.max(1, Math.round(ratio * sortedNotes.length));
        setHiddenCount(Math.min(hidden, sortedNotes.length));
      } else {
        setHiddenCount(0);
      }
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [sortedNotes.length]);

  const scrollNoteIntoView = useCallback((noteId: string, index: number) => {
    if (!listRef.current) return;
    if (useGroupLayout) {
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector(`[data-note-id="${noteId}"]`) as HTMLElement | null;
        if (el) {
          el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    } else {
      const el = listRef.current;
      const targetTop = index * rowHeight;
      const currentScroll = el.scrollTop;
      const viewportH = el.clientHeight;
      if (targetTop < currentScroll) {
        el.scrollTo({ top: targetTop, behavior: 'smooth' });
      } else if (targetTop + rowHeight > currentScroll + viewportH) {
        el.scrollTo({ top: targetTop + rowHeight - viewportH, behavior: 'smooth' });
      }
    }
  }, [useGroupLayout, rowHeight]);

  const requestDeleteNote = useCallback((note: Note) => {
    if (!isTrashFolder && skipMoveToTrashConfirmation) {
      void onDeleteNote(note.id);
      return;
    }
    setDontAskMoveToTrash(false);
    setNoteToDelete(note);
  }, [isTrashFolder, onDeleteNote, skipMoveToTrashConfirmation]);

  const handleListKeyDown = (e: React.KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (navigableNotes.length === 0) return;
      const currentIndex = navigableNotes.findIndex(n => n.id === selectedNoteId);
      const nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, navigableNotes.length - 1);
      const targetNote = navigableNotes[nextIndex];
      if (targetNote && targetNote.id !== selectedNoteId) {
        onSelectNote(targetNote.id);
        scrollNoteIntoView(targetNote.id, nextIndex);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (navigableNotes.length === 0) return;
      const currentIndex = navigableNotes.findIndex(n => n.id === selectedNoteId);
      const prevIndex = currentIndex < 0 ? 0 : Math.max(currentIndex - 1, 0);
      const targetNote = navigableNotes[prevIndex];
      if (targetNote && targetNote.id !== selectedNoteId) {
        onSelectNote(targetNote.id);
        scrollNoteIntoView(targetNote.id, prevIndex);
      }
    } else if (e.key === 'Home') {
      e.preventDefault();
      if (navigableNotes.length === 0) return;
      const targetNote = navigableNotes[0];
      if (targetNote) {
        onSelectNote(targetNote.id);
        scrollNoteIntoView(targetNote.id, 0);
      }
    } else if (e.key === 'End') {
      e.preventDefault();
      if (navigableNotes.length === 0) return;
      const targetNote = navigableNotes[navigableNotes.length - 1];
      if (targetNote) {
        onSelectNote(targetNote.id);
        scrollNoteIntoView(targetNote.id, navigableNotes.length - 1);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const editorEl = document.querySelector('.ProseMirror') as HTMLElement | null;
      if (editorEl) {
        editorEl.focus();
      }
    } else if (e.key === 'Delete') {
      if (selectedNoteId) {
        const currentNote = sortedNotes.find(n => n.id === selectedNoteId);
        if (currentNote) {
          e.preventDefault();
          requestDeleteNote(currentNote);
        }
      }
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent, note: Note) => {
    e.preventDefault();
    let safeX = e.clientX;
    let safeY = e.clientY;
    if (safeX + 160 > window.innerWidth) safeX = window.innerWidth - 160;
    if (safeY + 250 > window.innerHeight) safeY = window.innerHeight - 250;
    setContextMenu({ x: safeX, y: safeY, note });
  }, []);

  const getHeaderTitle = () => {
    if (searchQuery) {
      return language === 'es' ? `Resultados (${initialNotes.length})` : `Results (${initialNotes.length})`;
    }
    if (selectedFolder) {
      return selectedFolder.name;
    }
    return t.sidebar.allNotes;
  };

  return (
    <div className={`glass-effect notelist-glass${isHovering ? ' is-hovered' : ''}`} data-leave-guard="nav" style={{
      width: 'var(--notelist-width)',
      background: 'var(--bg-notelist)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
      position: 'relative',
    }}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Header */}
      <div style={{
        padding: '20px 18px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
          <h2 style={{
            fontSize: 'calc(14px * var(--ui-scale))',
            fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 'none',
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {searchQuery ? (
              <Search size={16} color="var(--accent-light)" style={{ flexShrink: 0 }} />
            ) : selectedFolder ? (
              <FolderIcon name={selectedFolder.icon} color={selectedFolder.color} size={16} />
            ) : (
              <FolderIcon name="file-text" color={FILTER_COLORS.all} size={16} />
            )}
            {getHeaderTitle()}
          </h2>
          {isTrashFolder ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Tooltip placement="bottom" label={t.noteList.restoreAll}>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={onRestoreAllTrash}
                  disabled={trashCount === 0}
                  aria-label={t.noteList.restoreAll}
                  style={{ padding: 6, color: 'var(--accent-light)' }}
                >
                  <RotateCcw size={14} />
                </button>
              </Tooltip>
              <Tooltip placement="bottom" label={t.noteList.emptyTrash}>
                <button
                  className="btn-icon"
                  type="button"
                  onClick={() => setShowEmptyTrashConfirm(true)}
                  disabled={trashCount === 0}
                  aria-label={t.noteList.emptyTrash}
                  style={{ padding: 6, color: 'var(--danger)' }}
                >
                  <Trash2 size={14} />
                </button>
              </Tooltip>
            </div>
          ) : (
            <NewNoteSplitButton
              language={language}
              createNoteLabel={createNoteLabel}
              createNoteAriaLabel={createNoteTooltip}
              showNoteOption={true}
              showFloatingOption={true}
              showFavoriteOption={true}
              showFolderOption={true}
              onCreateNote={onCreateNote}
              onRequestCreateFolder={onRequestCreateFolder}
            />
          )}
        </div>

        {isTrashFolder && (
          <div style={{ fontSize: 'calc(10.5px * var(--ui-scale))', color: 'var(--text-muted)', lineHeight: 1.35 }}>
            {t.noteList.trashRetention}
          </div>
        )}

        {/* Sort & View Controls */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowSortMenu(!showSortMenu)}
                className="btn-icon"
                style={{ fontSize: 'calc(11px * var(--ui-scale))', gap: 4, color: 'var(--text-muted)' }}
              >
                <ArrowUpDown size={12} />
                {sortBy === 'updated' 
                  ? (language === 'es' ? 'Recientes' : 'Recent') 
                  : sortBy === 'created' 
                    ? (language === 'es' ? 'Creadas' : 'Created') 
                    : sortBy === 'alpha' ? 'A-Z' : 'Z-A'}
                <ChevronDown size={10} />
              </button>
              {showSortMenu && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setShowSortMenu(false)} />
                  <div style={{
                    position: 'absolute', top: '100%', left: 0, marginTop: 4,
                    background: 'var(--bg-modal)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: 4, zIndex: 101, minWidth: 165, width: 'max-content',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                  }}>
                    {[
                      { id: 'updated', label: language === 'es' ? 'Actualización' : 'Modification' },
                      { id: 'created', label: language === 'es' ? 'Creación' : 'Creation' },
                      { id: 'alpha', label: language === 'es' ? 'Alfabético (A-Z)' : 'Alphabetical (A-Z)' },
                      { id: 'alpha-desc', label: language === 'es' ? 'Alfabético (Z-A)' : 'Alphabetical (Z-A)' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => { setSortBy(opt.id as any); setShowSortMenu(false); }}
                        style={{
                          width: '100%', padding: '6px 10px', textAlign: 'left', fontSize: 'calc(11.5px * var(--ui-scale))',
                          background: sortBy === opt.id ? 'var(--accent-dim)' : 'transparent',
                          color: sortBy === opt.id ? 'var(--accent-light)' : 'var(--text-secondary)',
                          border: 'none', borderRadius: 4, cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <button
                      onClick={() => {
                        handleToggleGroupByDate();
                        setShowSortMenu(false);
                      }}
                      style={{
                        width: '100%',
                        padding: '6px 10px',
                        textAlign: 'left',
                        fontSize: 'calc(11.5px * var(--ui-scale))',
                        background: 'transparent',
                        color: groupByDate ? 'var(--accent-light)' : 'var(--text-secondary)',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <span>{language === 'es' ? 'Agrupar por fecha' : 'Group by date'}</span>
                      <span style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        border: `1.5px solid ${groupByDate ? 'var(--accent)' : 'var(--border)'}`,
                        background: groupByDate ? 'var(--accent)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {groupByDate && <Check size={10} style={{ color: 'var(--bg-app)', strokeWidth: 3 }} />}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <div style={{ width: 1, height: 12, background: 'var(--border)' }} />

            <Tooltip placement="bottom" label={viewMode === 'normal'
              ? (language === 'es' ? 'Cambiar a vista compacta' : 'Switch to compact view')
              : (language === 'es' ? 'Cambiar a vista normal' : 'Switch to standard view')}>
            <button
              onClick={handleToggleViewMode}
              className="btn-icon"
              style={{ padding: 2, color: 'var(--text-muted)' }}
            >
              {viewMode === 'normal' ? <LayoutList size={14} /> : <StretchHorizontal size={14} />}
            </button>
            </Tooltip>
          </div>
          
          <span style={{ fontSize: 'calc(12px * var(--ui-scale))', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {sortedNotes.length} {sortedNotes.length === 1 ? (language === 'es' ? 'nota' : 'note') : (language === 'es' ? 'notas' : 'notes')}
          </span>
        </div>
      </div>

      <div className="divider" />

      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        <div
          ref={listRef}
          data-notelist-container="true"
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          style={{ height: '100%', overflowY: 'auto', outline: 'none' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedFolder?.id || 'all'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}
            >
              {sortedNotes.length === 0 ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', flex: 1, minHeight: 200, gap: 12, color: 'var(--text-muted)',
                }}>
                  {searchQuery
                    ? <><Search size={32} strokeWidth={1.5} style={{ opacity: 0.4 }} /><span style={{ fontSize: 13 }}>{language === 'es' ? 'No se encontraron resultados' : 'No results found'}</span></>
                    : <><FileText size={34} strokeWidth={1.4} style={{ opacity: 0.32, color: 'var(--text-muted)' }} /><span style={{ fontSize: 13 }}>{t.noteList.noNotes}</span></>
                  }
                </div>
              ) : useGroupLayout ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {noteGroups.map(group => {
                    const isCollapsed = collapsedGroups.has(group.key);
                    return (
                      <div key={group.key} className="note-group">
                        <div
                          className="note-group-header"
                          onClick={() => toggleGroupCollapse(group.key)}
                          title={isCollapsed
                            ? (language === 'es' ? 'Desplegar sección' : 'Expand section')
                            : (language === 'es' ? 'Plegar sección' : 'Collapse section')}
                        >
                          <span
                            className="note-group-chevron"
                            style={{
                              transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                            }}
                          >
                            <ChevronRight size={12} />
                          </span>
                          <span className="note-group-title">
                            {group.isPinnedGroup && (
                              <Star size={11} style={{ fill: 'currentColor', opacity: 0.85 }} />
                            )}
                            {group.isFloatingGroup && (
                              <AppWindow size={11} style={{ opacity: 0.85 }} />
                            )}
                            {group.label}
                          </span>
                          <span className="note-group-line" />
                          <span className="note-group-badge">{group.notes.length}</span>
                        </div>
                        {!isCollapsed && (
                          <div className="note-group-items">
                            {group.notes.map(note => {
                              const folder = note.folder_id ? (folderMap.get(note.folder_id) ?? null) : null;
                              return (
                                <div
                                  key={note.id}
                                  data-note-id={note.id}
                                  style={{
                                    height: rowHeight,
                                    boxSizing: 'border-box',
                                    padding: viewMode === 'compact' ? 'calc(3px * var(--ui-scale)) 0' : 'calc(4px * var(--ui-scale)) 0',
                                  }}
                                >
                                  <NoteItem
                                    language={language}
                                    note={note}
                                    folder={folder}
                                    viewMode={viewMode}
                                    isSelected={selectedNoteId === note.id}
                                    isContextActive={contextMenu?.note.id === note.id}
                                    isStickyOpen={!isStickyFolder && !group.isFloatingGroup && openStickyIds.includes(note.id)}
                                    isTrash={isTrashFolder}
                                    onClick={() => {
                                      onSelectNote(note.id);
                                      listRef.current?.focus({ preventScroll: true });
                                    }}
                                    onDelete={() => requestDeleteNote(note)}
                                    onContextMenu={(e) => handleContextMenu(e, note)}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!isGroupingActive && regularNotes.length > 0 && (
                    <div style={{ height: totalHeight, position: 'relative' }}>
                      <div style={{ transform: `translateY(${offsetY}px)` }}>
                        {visibleNotes.map(note => {
                          const folder = note.folder_id ? (folderMap.get(note.folder_id) ?? null) : null;
                          return (
                            <div
                              key={note.id}
                              data-note-id={note.id}
                              style={{
                                height: rowHeight,
                                boxSizing: 'border-box',
                                padding: viewMode === 'compact' ? 'calc(3px * var(--ui-scale)) 0' : 'calc(4px * var(--ui-scale)) 0',
                              }}
                            >
                              <NoteItem
                                language={language}
                                note={note}
                                folder={folder}
                                viewMode={viewMode}
                                isSelected={selectedNoteId === note.id}
                                isContextActive={contextMenu?.note.id === note.id}
                                isStickyOpen={false}
                                isTrash={isTrashFolder}
                                onClick={() => {
                                  onSelectNote(note.id);
                                  listRef.current?.focus({ preventScroll: true });
                                }}
                                onDelete={() => requestDeleteNote(note)}
                                onContextMenu={(e) => handleContextMenu(e, note)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ height: totalHeight, position: 'relative' }}>
                  <div style={{ transform: `translateY(${offsetY}px)` }}>
                    {visibleNotes.map(note => {
                      const folder = note.folder_id ? (folderMap.get(note.folder_id) ?? null) : null;
                      return (
                        <div
                          key={note.id}
                          data-note-id={note.id}
                          style={{
                            height: rowHeight,
                            boxSizing: 'border-box',
                            padding: viewMode === 'compact' ? 'calc(3px * var(--ui-scale)) 0' : 'calc(4px * var(--ui-scale)) 0',
                          }}
                        >
                          <NoteItem
                            language={language}
                            note={note}
                            folder={folder}
                            viewMode={viewMode}
                            isSelected={selectedNoteId === note.id}
                            isContextActive={contextMenu?.note.id === note.id}
                            isStickyOpen={!isStickyFolder && openStickyIds.includes(note.id)}
                            isTrash={isTrashFolder}
                            onClick={() => {
                              onSelectNote(note.id);
                              listRef.current?.focus({ preventScroll: true });
                            }}
                            onDelete={() => requestDeleteNote(note)}
                            onContextMenu={(e) => handleContextMenu(e, note)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
          </motion.div>
        </AnimatePresence>
        </div>

        {/* X Más pill */}
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: '50%',
          transform: 'translateX(-50%)',
          opacity: hiddenCount > 0 ? 1 : 0,
          visibility: hiddenCount > 0 ? 'visible' : 'hidden',
          transition: 'opacity 0.25s, visibility 0.25s',
          zIndex: 10,
          pointerEvents: hiddenCount > 0 ? 'auto' : 'none',
        }}>
          <button
            onClick={() => {
              let el = listRef.current;
              if (el) el.scrollBy({ top: el.clientHeight * 0.7, behavior: 'smooth' });
            }}
            className="cyber-shine-pill"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px solid rgba(255, 255, 255, 0.16)',
              background: 'var(--bg-surface)',
              color: isHovering ? 'var(--accent-light)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
              whiteSpace: 'nowrap',
              transition: 'color 0.2s, background 0.2s',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
             +{hiddenCount} {language === 'es' ? 'más' : 'more'}
          </button>
        </div>
      </div>

      {/* Menú Contextual */}
      {contextMenu && createPortal(
        <div 
          className="glass-effect"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-modal)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            padding: 4,
            zIndex: 100000,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            minWidth: 140,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => { onSelectNote(contextMenu.note.id); setContextMenu(null); }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <FileText size={13} style={{ flexShrink: 0 }} />
            <span>{language === 'es' ? 'Abrir nota' : 'Open note'}</span>
          </button>
          {isTrashFolder && (
            <button
              onClick={() => { onRestoreNote(contextMenu.note.id); setContextMenu(null); }}
              style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--accent-light)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <RotateCcw size={13} style={{ flexShrink: 0 }} />
              <span>{t.noteList.restore}</span>
            </button>
          )}
          <button
            disabled={isTrashFolder}
            onClick={() => {
              if (openStickyIds.includes(contextMenu.note.id)) {
                window.cyberNotesAPI.revealStickyNote(contextMenu.note.id);
              } else {
                window.cyberNotesAPI.openStickyNote(contextMenu.note.id);
              }
              setContextMenu(null);
            }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: isTrashFolder ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: isTrashFolder ? 0.4 : 1 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {openStickyIds.includes(contextMenu.note.id)
              ? <Eye size={13} style={{ flexShrink: 0 }} />
              : <ExternalLink size={13} style={{ flexShrink: 0 }} />}
            <span>
              {openStickyIds.includes(contextMenu.note.id)
                ? t.noteList.showFloatingNote
                : t.noteList.openSticky}
            </span>
          </button>
          <button
            disabled={isTrashFolder}
            onClick={() => { setRenameTarget(contextMenu.note); setRenameInput(contextMenu.note.title); setContextMenu(null); }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: isTrashFolder ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: isTrashFolder ? 0.4 : 1 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Pencil size={13} style={{ flexShrink: 0 }} />
            <span>{language === 'es' ? 'Renombrar' : 'Rename'}</span>
          </button>
          <button
            disabled={isTrashFolder}
            onClick={() => { onTogglePin(contextMenu.note); setContextMenu(null); }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: isTrashFolder ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: 8, opacity: isTrashFolder ? 0.4 : 1 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Star size={13} fill={contextMenu.note.pinned ? 'currentColor' : 'none'} color={contextMenu.note.pinned ? 'var(--accent-light)' : 'inherit'} style={{ flexShrink: 0 }} />
            <span>{contextMenu.note.pinned ? (language === 'es' ? 'Quitar de favoritos' : 'Remove from favorites') : (language === 'es' ? 'Marcar favorito' : 'Add to favorites')}</span>
          </button>

          {!isTrashFolder && folders.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
              <div style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FolderInput size={11} />
                <span>{language === 'es' ? 'Mover a...' : 'Move to...'}</span>
              </div>
              <div style={{ maxHeight: 150, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button
                  onClick={() => { onMoveNote(contextMenu.note.id, null); setContextMenu(null); }}
                  style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                   📄 {t.sidebar.allNotes}
                </button>
                {folders.map(f => (
                  <button
                    key={f.id}
                    onClick={() => { onMoveNote(contextMenu.note.id, f.id); setContextMenu(null); }}
                    style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <FolderIcon name={f.icon} color={f.color} size={13} />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
          <button
            onClick={() => {
              requestDeleteNote(contextMenu.note);
              setContextMenu(null);
            }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Trash2 size={13} color="var(--danger)" style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <span>{isTrashFolder ? t.noteList.permanentDelete : t.general.delete}</span>
          </button>
        </div>,
        document.body
      )}

      {/* Modal Renombrar */}
      {renameTarget && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'var(--bg-editor-glass)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
        }} onClick={() => setRenameTarget(null)}>
          <div style={{
            background: 'var(--bg-modal)', padding: 24, borderRadius: 'var(--radius-lg)',
            width: 400, display: 'flex', flexDirection: 'column', gap: 16, border: '1px solid var(--border)',
            boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)', fontWeight: 600 }}>{language === 'es' ? 'Renombrar nota' : 'Rename note'}</h3>
            <input
              autoFocus
              type="text"
              value={renameInput}
              onChange={e => setRenameInput(e.target.value)}
              className="input"
              placeholder={language === 'es' ? 'Nombre de la nota' : 'Note name'}
              onContextMenu={inputMenu.onContextMenu}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  onRenameNote(renameTarget.id, renameInput);
                  setRenameTarget(null);
                }
                if (e.key === 'Escape') setRenameTarget(null);
              }}
            />
            <div className="modal-actions">
              <button type="button" className="modal-action-btn is-cancel" onClick={() => setRenameTarget(null)}>
                {t.general.cancel}
                <span className="modal-key-esc">Esc</span>
              </button>
              <button type="button" className="modal-action-btn is-save" onClick={() => {
                onRenameNote(renameTarget.id, renameInput);
                setRenameTarget(null);
              }}>
                {t.general.save}
                <EnterGlyph />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Confirmar Eliminar Nota */}
      {noteToDelete && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5, 5, 8, 0.72)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000000,
        }} onClick={() => setNoteToDelete(null)}>
          <div style={{
            background: 'var(--bg-modal)', padding: '24px 32px', borderRadius: 'var(--radius-lg)',
            width: 380, display: 'flex', flexDirection: 'column', gap: 20, border: '1px solid var(--border)',
            boxShadow: '0 24px 48px rgba(0,0,0,0.6), 0 0 24px var(--accent-glow)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)',
                color: 'var(--danger)',
                width: 42,
                height: 42,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                border: '1px solid rgba(239, 68, 68, 0.3)',
                boxShadow: '0 0 12px rgba(239, 68, 68, 0.2)',
              }}>
                <Trash2 size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)', fontWeight: 700 }}>
                  {isTrashFolder ? t.noteList.permanentDeleteConfirm : (language === 'es' ? '¿Enviar esta nota a la papelera?' : 'Move this note to the trash?')}
                </h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {isTrashFolder ? t.noteList.permanentDeleteDesc : t.noteList.deleteToTrashDesc}
                </span>
              </div>
            </div>

            <div style={{
              fontSize: 'calc(13px * var(--ui-scale))',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              borderLeft: '3px solid var(--danger)',
              fontWeight: 500,
              fontStyle: 'italic',
            }} className="truncate">
              "{noteToDelete.title || t.noteList.unnamedNote}"
            </div>

            {!isTrashFolder && (
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                userSelect: 'none',
                fontSize: 'calc(12px * var(--ui-scale))',
                color: 'var(--text-muted)',
              }}>
                <input
                  type="checkbox"
                  checked={dontAskMoveToTrash}
                  onChange={e => setDontAskMoveToTrash(e.target.checked)}
                  style={{ accentColor: 'var(--accent)', width: 15, height: 15, cursor: 'pointer' }}
                />
                {language === 'es' ? 'No volver a mostrar este aviso' : 'Do not show this warning again'}
              </label>
            )}

            <div className="modal-actions">
              <button
                type="button"
                className="modal-action-btn is-cancel"
                onClick={() => setNoteToDelete(null)}
              >
                {t.general.cancel}
                <span className="modal-key-esc">Esc</span>
              </button>
              <button
                type="button"
                className="modal-action-btn is-danger"
                onClick={async () => {
                  if (!isTrashFolder && dontAskMoveToTrash) {
                    setSkipMoveToTrashConfirmation(true);
                    await window.cyberNotesAPI.setSetting('confirm_move_note_to_trash_dismissed', 'true');
                  }
                  if (isTrashFolder) onPurgeNote(noteToDelete.id);
                  else onDeleteNote(noteToDelete.id);
                  setNoteToDelete(null);
                  setContextMenu(null);
                }}
              >
                {isTrashFolder ? t.noteList.permanentDelete : t.noteList.moveToTrash}
                <EnterGlyph />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showEmptyTrashConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5, 5, 8, 0.72)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000000,
        }} onClick={() => setShowEmptyTrashConfirm(false)}>
          <div style={{
            background: 'var(--bg-modal)', padding: '24px 32px', borderRadius: 'var(--radius-lg)',
            width: 380, display: 'flex', flexDirection: 'column', gap: 20, border: '1px solid var(--border)',
            boxShadow: '0 24px 48px rgba(0,0,0,0.6), 0 0 24px var(--danger-dim)',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                background: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)', width: 42, height: 42,
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, border: '1px solid rgba(239, 68, 68, 0.3)',
              }}>
                <Trash2 size={20} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)', fontWeight: 700 }}>{t.noteList.emptyTrashConfirm}</h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{t.noteList.emptyTrashDesc}</span>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="modal-action-btn is-cancel" onClick={() => setShowEmptyTrashConfirm(false)}>
                {t.general.cancel}
                <span className="modal-key-esc">Esc</span>
              </button>
              <button type="button" className="modal-action-btn is-danger" onClick={() => { void onEmptyTrash(); setShowEmptyTrashConfirm(false); }}>
                {t.noteList.emptyTrash}
                <EnterGlyph />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {inputMenu.menu}
    </div>
  );
}

// ─── NoteItem subcomponent ─────────────────────────────────────────────────

interface NoteItemProps {
  language: Language;
  note: Note;
  folder?: Folder | null;
  viewMode: 'normal' | 'compact';
  isSelected: boolean;
  isContextActive?: boolean;
  isStickyOpen?: boolean;
  isTrash?: boolean;
  onClick: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const NoteItem = memo(function NoteItem({ language, note, folder, viewMode, isSelected, isContextActive, isStickyOpen, isTrash = false, onClick, onDelete, onContextMenu }: NoteItemProps) {
  const [isDragging, setIsDragging] = useState(false);
  const firstImage = viewMode === 'normal' ? (note.thumb || null) : null;
  const t = TRANSLATIONS[language];

  const prevFolderIdRef = useRef(note.folder_id);
  const [highlightSweep, setHighlightSweep] = useState(false);

  useEffect(() => {
    if (prevFolderIdRef.current !== note.folder_id) {
      prevFolderIdRef.current = note.folder_id;
      if (note.folder_id) {
        setHighlightSweep(true);
        const timer = setTimeout(() => setHighlightSweep(false), 900);
        return () => clearTimeout(timer);
      }
    }
  }, [note.folder_id]);

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={!isTrash}
      onDragStart={e => {
        if (isTrash) return;
        setIsDragging(true);
        (e as any).dataTransfer.setData('text/plain', note.id);
        (e as any).dataTransfer.setData('application/cybernotes-note', note.id);
        (e as any).dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setIsDragging(false);
        window.dispatchEvent(new CustomEvent('cybernotes:dragend'));
      }}
      style={{
        height: '100%',
        boxSizing: 'border-box',
        padding: viewMode === 'compact' ? 'calc(5px * var(--ui-scale)) calc(14px * var(--ui-scale))' : 'calc(9px * var(--ui-scale)) calc(14px * var(--ui-scale))',
        margin: '0 calc(12px * var(--ui-scale))',
        borderRadius: 'var(--radius-md)',
        background: isSelected || isContextActive ? 'var(--bg-active)' : 'rgba(255,255,255,0.01)',
        cursor: isDragging ? 'grabbing' : 'pointer',
        position: 'relative',
        transition: 'all var(--transition)',
        border: isSelected || isContextActive ? '1px solid var(--accent)' : '1px solid var(--border)',
        boxShadow: isSelected || isContextActive ? '0 4px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.02)' : 'inset 0 1px 0 rgba(255,255,255,0.01)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        opacity: isDragging ? 0.35 : 1,
        transform: isDragging ? 'scale(0.97)' : 'none',
      }}
      className={`note-item${isDragging ? ' is-dragging' : ''}`}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.01)';
      }}
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between', minHeight: 0, flex: viewMode === 'normal' ? 1 : undefined }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: viewMode === 'compact' ? 2 : 4, flexShrink: 0, paddingRight: 28 }}>
            {note.pinned === 1 && <Star size={13} color="var(--accent-light)" fill="currentColor" stroke="none" style={{ flexShrink: 0 }} />}
            {isStickyOpen && (
              <Tooltip placement="bottom" delay={450} label={t.noteList.stickyActive}>
                <AppWindow size={12} color="var(--accent-light)" style={{ flexShrink: 0 }} />
              </Tooltip>
            )}
            <span style={{
              fontSize: 'calc(13px * var(--ui-scale))',
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              minWidth: 0,
            }}>
              {note.title || t.noteList.unnamedNote}
            </span>
          </div>

          {viewMode === 'normal' && (
            <p style={{
              fontSize: 'calc(11.5px * var(--ui-scale))',
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              lineHeight: 1.35,
              margin: 0,
              paddingRight: firstImage ? 0 : 28,
            }}>
              {note.preview || (language === 'es' ? 'Sin contenido' : 'No content')}
            </p>
          )}
        </div>

        {firstImage && (
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--bg-surface)',
            flexShrink: 0,
            marginTop: 2,
          }}>
            <img
              src={firstImage}
              alt="Preview"
              loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
            />
          </div>
        )}
      </div>

      <div style={{
        fontSize: 'calc(10.5px * var(--ui-scale))',
        color: 'var(--text-secondary)',
        opacity: 0.9,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 'auto',
        paddingTop: 'calc(4px * var(--ui-scale))',
        gap: 8,
        flexShrink: 0,
      }}>
        <span>{formatDate((isTrash && note.deleted_at) || note.updated_at, language)}</span>
        {folder && (
          <Tooltip placement="bottom" label={language === 'es' ? `Carpeta: ${folder.name}` : `Folder: ${folder.name}`}>
          <span
            className={highlightSweep ? 'folder-badge-animating' : ''}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 12,
              fontSize: '9px',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
              border: folder.color ? `1px solid ${folder.color}44` : '1px solid var(--border)',
              background: folder.color ? `${folder.color}14` : 'var(--bg-surface)',
              boxShadow: highlightSweep ? `0 0 12px ${folder.color || 'var(--accent)'}` : 'none',
              textShadow: 'none',
              maxWidth: 120,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              transition: 'all 0.25s ease',
            }}
          >
            {highlightSweep && <span className="folder-badge-shine" />}
            <FolderIcon name={folder.icon} color={folder.color} size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative', zIndex: 1 }}>
              {folder.name}
            </span>
          </span>
          </Tooltip>
        )}
      </div>

      <Tooltip placement="left" label={isTrash ? t.noteList.permanentDelete : (language === 'es' ? 'Eliminar nota' : 'Delete note')}>
        <button
          type="button"
          className="delete-note-btn"
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={isTrash ? t.noteList.permanentDelete : (language === 'es' ? 'Eliminar nota' : 'Delete note')}
          style={{
            position: 'absolute',
            top: viewMode === 'compact' ? 5 : 8,
            right: 8,
            zIndex: 5,
            background: 'rgba(20, 20, 25, 0.88)',
            backdropFilter: 'blur(6px)',
            border: '1px solid var(--border)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            opacity: 0,
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: viewMode === 'compact' ? 22 : 26,
            height: viewMode === 'compact' ? 22 : 26,
            borderRadius: '50%',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            padding: 0,
          }}
        >
          <Trash2 size={viewMode === 'compact' ? 12 : 13} />
        </button>
      </Tooltip>

      <style>{`
        .note-item:hover .delete-note-btn { opacity: 1 !important; }
        .note-item:hover .delete-note-btn:hover {
          color: #fff !important;
          background: #ef4444 !important;
          border-color: #ef4444 !important;
          box-shadow: none !important;
          transform: scale(1.08) !important;
        }
      `}</style>
    </div>
  );
});
