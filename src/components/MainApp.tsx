import { useState, useEffect, useCallback, useRef } from 'react';
import { Folder, Note, ThemeId } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import TitleBar from './TitleBar';
import Sidebar from './Sidebar';
import NoteList from './NoteList';
import NoteEditor from './NoteEditor';
import SettingsModal from './SettingsModal';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  language: Language;
  onLanguageChange: (l: Language) => void;
  currentTheme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  colorIntensity: number;
  onIntensityChange: (v: number) => void;
  onLock: () => void;
}

export default function MainApp({ language, onLanguageChange, currentTheme, onThemeChange, colorIntensity, onIntensityChange, onLock }: Props) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [allNotes, setAllNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [openNoteIds, setOpenNoteIds] = useState<string[]>([]);
  const [draftCache, setDraftCache] = useState<Record<string, { title: string; content: string }>>({});
  const [noteToCloseWithDraft, setNoteToCloseWithDraft] = useState<Note | null>(null);
  const [pendingNavNoteId, setPendingNavNoteId] = useState<string | null>(null);
  const [confirmLeaveDismissed, setConfirmLeaveDismissed] = useState(false);
  const [dontAskChecked, setDontAskChecked] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSettings, setShowSettings] = useState(false);
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
  const [autoLockMinutes, setAutoLockMinutes] = useState(0);
  const [rememberLastNote, setRememberLastNote] = useState(false);
  const [showLineCounter, setShowLineCounter] = useState(false);
  const [autosaveEnabled, setAutosaveEnabled] = useState(true);
  const [autoUnlockCapsLock, setAutoUnlockCapsLock] = useState(true);
  const [autoUnlockCapsLockTimeout, setAutoUnlockCapsLockTimeout] = useState(0);
  const [capsLockSound, setCapsLockSound] = useState('cyber-beep');
  const [capsLockSoundScope, setCapsLockSoundScope] = useState('app');
  const [tabsWidthMode, setTabsWidthMode] = useState<'normal' | 'wide'>('normal');
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const isLoadedRef = useRef(false);

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

    const closeMenu = () => setContextMenu(null);
    window.addEventListener('click', closeMenu);

    return () => {
      window.removeEventListener('mousedown', trackMouse, true);
      window.removeEventListener('contextmenu', trackMouse, true);
      window.removeEventListener('click', closeMenu);
      if (unregisterContext) unregisterContext();
      if (unregisterSettingChanged) unregisterSettingChanged();
      if (unregisterOpenSettings) unregisterOpenSettings();
    };
  }, []);

  // Lógica de Auto-bloqueo
  useEffect(() => {
    if (autoLockMinutes <= 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onLock();
      }, autoLockMinutes * 60 * 1000);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer));

    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [autoLockMinutes, onLock]);

  // Detector de links vía mousemove (máxima compatibilidad)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Inspeccionamos el elemento bajo el cursor de forma precisa
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const link = el?.closest('a');
      
      if (link && link.href) {
        const url = link.href;
        // Solo mostrar si es un link real (web) o tiene protocolo
        if (url.startsWith('http') || url.startsWith('https') || url.startsWith('mailto:') || url.includes('www.')) {
          if (statusBarUrl !== url) setStatusBarUrl(url);
          return;
        }
      }
      
      if (statusBarUrl !== null) setStatusBarUrl(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [statusBarUrl]);

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

  const loadSettings = async () => {
    const scale = await window.cyberNotesAPI.getSetting('ui_scale');
    if (scale) setUiScale(parseFloat(scale));

    const bg = await window.cyberNotesAPI.getSetting('bg_image');
    if (bg) setBgImage(bg);

    const blur = await window.cyberNotesAPI.getSetting('glass_blur');
    if (blur) setGlassBlur(parseFloat(blur));

    const op = await window.cyberNotesAPI.getSetting('bg_opacity');
    if (op) setBgOpacity(parseFloat(op));

    const lock = await window.cyberNotesAPI.getSetting('auto_lock_minutes');
    if (lock) setAutoLockMinutes(parseInt(lock));

    const remember = await window.cyberNotesAPI.getSetting('remember_last_note');
    const isRemember = remember === 'true';
    setRememberLastNote(isRemember);

    const lineCounter = await window.cyberNotesAPI.getSetting('show_line_counter');
    setShowLineCounter(lineCounter === 'true');

    const autosave = await window.cyberNotesAPI.getSetting('autosave_enabled');
    if (autosave !== null) setAutosaveEnabled(autosave === 'true');

    const dismissed = await window.cyberNotesAPI.getSetting('confirm_leave_note_dismissed');
    setConfirmLeaveDismissed(dismissed === 'true');

    const capsLock = await window.cyberNotesAPI.getSetting('auto_unlock_caps_lock');
    setAutoUnlockCapsLock(capsLock === 'true');

    const capsLockTimeout = await window.cyberNotesAPI.getSetting('auto_unlock_caps_lock_timeout');
    if (capsLockTimeout) setAutoUnlockCapsLockTimeout(parseInt(capsLockTimeout));

    const soundVal = await window.cyberNotesAPI.getSetting('caps_lock_sound');
    setCapsLockSound(soundVal || 'cyber-beep');

    const scopeVal = await window.cyberNotesAPI.getSetting('caps_lock_sound_scope');
    setCapsLockSoundScope(scopeVal || 'app');

    const tabsWidth = await window.cyberNotesAPI.getSetting('tabs_width_mode');
    if (tabsWidth) setTabsWidthMode(tabsWidth as 'normal' | 'wide');

    if (isRemember) {
      const savedIdsStr = await window.cyberNotesAPI.getSetting('open_note_ids');
      if (savedIdsStr) {
        const savedIds = savedIdsStr.split(',').filter(id => id.trim() !== '');
        if (savedIds.length > 0) {
          setOpenNoteIds(savedIds);
          const lastId = await window.cyberNotesAPI.getSetting('last_note_id');
          if (lastId && savedIds.includes(lastId)) {
            setSelectedNoteId(lastId);
          } else {
            setSelectedNoteId(savedIds[0]);
          }
        }
      } else {
        const lastId = await window.cyberNotesAPI.getSetting('last_note_id');
        if (lastId) {
          setOpenNoteIds([lastId]);
          setSelectedNoteId(lastId);
        }
      }
    }
    // Marcar que la carga inicial de base de datos ha concluido con éxito
    isLoadedRef.current = true;
  };

  const loadFolders = async () => {
    const f = await window.cyberNotesAPI.getFolders();
    setFolders(f);
  };

  const loadAllNotes = async () => {
    const all = await window.cyberNotesAPI.getAllNotes();
    setAllNotes(all);
  };

  const loadNotes = async (folderId: string | null) => {
    let n: Note[];
    if (searchQuery) {
      n = await window.cyberNotesAPI.searchNotes(searchQuery);
    } else {
      n = await window.cyberNotesAPI.getNotesByFolder(folderId);
    }
    setNotes(n);
    // Si no hay nota seleccionada y hay notas, selecciona la primera
    if (n.length > 0 && !selectedNoteId) {
      setSelectedNoteId(n[0].id);
    }
  };

  const handleSelectFolder = async (folderId: string | null) => {
    setSelectedFolderId(folderId);
    setSearchQuery('');
    const n = await window.cyberNotesAPI.getNotesByFolder(folderId);
    setNotes(n);
  };

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
    
    const updated = { ...note, title, updated_at: new Date().toISOString() };
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setAllNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    await window.cyberNotesAPI.saveNote(updated);
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q) {
      const n = await window.cyberNotesAPI.getNotesByFolder(selectedFolderId);
      setNotes(n);
      return;
    }
    const n = await window.cyberNotesAPI.searchNotes(q);
    setNotes(n);
    setSelectedNoteId(n.length > 0 ? n[0].id : null);
  };

  const handleCreateNote = async () => {
    console.log('[MainApp] handleCreateNote triggered');
    const now = new Date().toISOString();
    const newNote: Note = {
      id: window.crypto.randomUUID(),
      folder_id: selectedFolderId === 'floating' ? null : selectedFolderId,
      title: language === 'es' ? 'Nueva nota' : 'New note',
      content: '',
      preview: '',
      pinned: 0,
      created_at: now,
      updated_at: now,
    };
    console.log('[MainApp] Creating note:', newNote);
    try {
      const saved = await window.cyberNotesAPI.saveNote(newNote);
      console.log('[MainApp] Note saved:', saved);
      setNotes(prev => [saved, ...prev]);
      setAllNotes(prev => [saved, ...prev]);
      setSelectedNoteId(saved.id);
    } catch (err) {
      console.error('[MainApp] Error creating note:', err);
    }
  };

  const handleSaveNote = useCallback(async (note: Note) => {
    const updated = { ...note, updated_at: new Date().toISOString() };
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setAllNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    await window.cyberNotesAPI.saveNote(updated);
    
    // Al guardar exitosamente, eliminamos la nota del caché de borradores sucios
    setDraftCache(prev => {
      const next = { ...prev };
      delete next[note.id];
      return next;
    });
  }, []);

  const handleEditDraft = useCallback((id: string, title: string, content: string) => {
    setDraftCache(prev => ({
      ...prev,
      [id]: { title, content }
    }));
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
      const noteToClose = allNotes.find(n => n.id === id);
      if (noteToClose) {
        setNoteToCloseWithDraft(noteToClose);
        return;
      }
    }
    
    executeCloseTab(id);
  }, [draftCache, autosaveEnabled, allNotes, executeCloseTab]);

  const handleDeleteNote = async (id: string) => {
    await window.cyberNotesAPI.deleteNote(id);
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
      } else {
        setSelectedNoteId(remaining.length > 0 ? remaining[0].id : null);
      }
    }
  };

  const handleTogglePin = async (note: Note) => {
    const updated = { ...note, pinned: note.pinned === 1 ? 0 : 1 };
    await window.cyberNotesAPI.saveNote(updated);
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
    setAllNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
  };

  const handleMoveNote = async (noteId: string, targetFolderId: string | null) => {
    const note = allNotes.find(n => n.id === noteId);
    if (!note) return;
    const updated = { ...note, folder_id: targetFolderId, updated_at: new Date().toISOString() };
    await window.cyberNotesAPI.saveNote(updated);
    
    setAllNotes(prev => prev.map(n => n.id === noteId ? updated : n));

    // Si estamos viendo una carpeta específica y movemos la nota a otra, la quitamos de la lista visible
    if (selectedFolderId !== null && selectedFolderId !== targetFolderId && !searchQuery) {
       const remaining = notes.filter(n => n.id !== noteId);
       setNotes(remaining);
    } else {
       setNotes(prev => prev.map(n => n.id === noteId ? updated : n));
    }
  };

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
    if (selectedFolderId === id) {
      setSelectedFolderId(null);
      const n = await window.cyberNotesAPI.getNotesByFolder(null);
      setNotes(n);
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
    setAutoLockMinutes(v);
    await window.cyberNotesAPI.setSetting('auto_lock_minutes', v.toString());
  };

  const handleRememberLastNoteChange = async (v: boolean) => {
    setRememberLastNote(v);
    await window.cyberNotesAPI.setSetting('remember_last_note', v.toString());
  };

  const handleTabsWidthModeChange = async (mode: 'normal' | 'wide') => {
    setTabsWidthMode(mode);
    await window.cyberNotesAPI.setSetting('tabs_width_mode', mode);
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

  const selectedNote = allNotes.find(n => n.id === selectedNoteId) ?? null;

  const startDragSidebar = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
       setSidebarWidth(Math.min(Math.max(startWidth + (ev.clientX - startX), 150), 500));
    };
    const onUp = () => {
       document.removeEventListener('mousemove', onMove);
       document.removeEventListener('mouseup', onUp);
       document.body.style.cursor = 'default';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const startDragNoteList = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = noteListWidth;
    const onMove = (ev: MouseEvent) => {
       setNoteListWidth(Math.min(Math.max(startWidth + (ev.clientX - startX), 200), 600));
    };
    const onUp = () => {
       document.removeEventListener('mousemove', onMove);
       document.removeEventListener('mouseup', onUp);
       document.body.style.cursor = 'default';
    };
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  return (
    <div 
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

      <TitleBar onLock={onLock} />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Sidebar */}
        {layoutMode === 3 && (
          <>
            <Sidebar
              language={language}
              folders={folders}
              selectedFolderId={selectedFolderId}
              noteCount={allNotes.length}
              recentNotes={[...allNotes].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()).slice(0, 5)}
              allNotes={allNotes}
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
          onSave={handleSaveNote}
          onCreateNote={handleCreateNote}
          layoutMode={layoutMode}
          onToggleLayout={() => setLayoutMode(prev => prev === 1 ? 3 : prev - 1 as any)}
          showLineCounter={showLineCounter}
          autosaveEnabled={autosaveEnabled}
          autoUnlockCapsLock={autoUnlockCapsLock}
          onAutoUnlockCapsLockChange={handleAutoUnlockCapsLockChange}
          autoUnlockCapsLockTimeout={autoUnlockCapsLockTimeout}
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
