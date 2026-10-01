import { useState, useRef, useEffect, useMemo, type CSSProperties, type ReactNode, type DragEvent as ReactDragEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Folder, Note } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import {
  Plus, FolderOpen, Settings, Lock, Search, X,
  ChevronRight, Pencil, Trash2, FileText, Clock, Inbox, Star, AppWindow,
} from 'lucide-react';
import { useInputContextMenu } from '../hooks/useInputContextMenu';
import { playSynthSound } from '../utils/audio';
import FolderIcon, { FILTER_COLORS } from './FolderIcon';
import Tooltip from './Tooltip';
import { EnterGlyph, modalCardMotion } from './ModalActions';

interface Props {
  language: Language;
  folders: Folder[];
  selectedFolderId: string | null;
  noteCount: number;
  trashCount: number;
  recentNotes: Note[];
  allNotes: Note[];
  stickyNoteIds: string[];
  openedHistory?: Record<string, number>;
  recentClearedAt?: number;
  onClearRecent?: () => void;
  onSelectNote: (id: string) => void;
  onSelectFolder: (id: string | null) => void;
  onCreateFolder: (name: string, icon: string, color: string) => void;
  onUpdateFolder: (folder: Folder) => void;
  onDeleteFolder: (id: string) => void;
  onOpenSettings: () => void;
  onLock: () => void;
  searchQuery: string;
  onSearch: (q: string) => void;
  onMoveNote: (noteId: string, folderId: string | null) => void;
  rail?: boolean;
  getAvailableColors: (currentFolderId?: string) => { all: string[]; available: string[]; usedColors: Set<string> };
  triggerNewFolderSignal?: number;
}

const FOLDER_ICONS = [
  'folder', 'file-text', 'briefcase', 'home',
  'zap', 'lightbulb', 'palette', 'book',
  'microscope', 'target', 'heart', 'tag',
  'archive', 'cloud', 'code', 'users',
  'rocket', 'bookmark', 'wrench', 'layers',
];
const FOLDER_COLORS = [
  '#7c3aed', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
  '#3b82f6', '#d946ef', '#f97316', '#06b6d4',
  '#84cc16', '#0891b2', '#7c2d12', '#831843',
  '#4c0519', '#3730a3', '#1e40af', '#0d9488',
];

function specialFilterBadgeStyle(isSelected: boolean, tint?: string): CSSProperties {
  return {
    fontSize: 'calc(11px * var(--ui-scale))',
    background: isSelected
      ? (tint ? `${tint}33` : 'color-mix(in srgb, var(--accent) 28%, transparent)')
      : 'var(--bg-surface)',
    color: isSelected ? (tint || 'var(--accent-light)') : 'var(--text-muted)',
    padding: '1px 6px',
    borderRadius: 10,
    pointerEvents: 'none',
    fontWeight: isSelected ? 600 : 400,
    boxShadow: isSelected
      ? tint
        ? `0 0 6px ${tint}66, inset 0 1px 0 rgba(255,255,255,0.12)`
        : '0 0 6px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.12)'
      : 'none',
  };
}

function timeAgo(iso: string, language: Language): string {
  let diff = Date.now() - new Date(iso).getTime();
  let mins = Math.round(diff / 60000);
  const isEn = language === 'en';
  if (mins < 1) return isEn ? 'Just now' : 'Ahora';
  if (mins < 60) return isEn ? `${mins}m ago` : `hace ${mins} min`;
  let hours = Math.floor(mins / 60);
  if (hours < 24) return isEn ? `${hours}h ago` : `hace ${hours}h`;
  let days = Math.floor(hours / 24);
  if (days < 7) return isEn ? `${days}d ago` : `hace ${days} día${days > 1 ? 's' : ''}`;
  let weeks = Math.floor(days / 7);
  if (weeks < 5) return isEn ? `${weeks}w ago` : `hace ${weeks} sem`;
  return new Date(iso).toLocaleDateString(isEn ? 'en-US' : 'es-ES', { month: 'short', day: 'numeric' });
}

export default function Sidebar({
  language, folders, selectedFolderId, noteCount, trashCount, recentNotes, allNotes, stickyNoteIds, onSelectNote,
  onSelectFolder, onCreateFolder, onUpdateFolder, onDeleteFolder,
  onOpenSettings, onLock, searchQuery, onSearch, onMoveNote, rail = false, getAvailableColors,
  openedHistory = {}, recentClearedAt = 0, onClearRecent,
  triggerNewFolderSignal,
}: Props) {
  const t = TRANSLATIONS[language];
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('folder');
  const [newFolderColor, setNewFolderColor] = useState('#7c3aed');
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [contextMenu, setContextMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [showRecent, setShowRecent] = useState(false);
  const [railSearchOpen, setRailSearchOpen] = useState(false);
  const [railSearchPos, setRailSearchPos] = useState<{ top: number; left: number } | null>(null);
  const railSearchBtnRef = useRef<HTMLButtonElement | null>(null);
  const railSearchInputRef = useRef<HTMLInputElement | null>(null);

  // Autofoco al abrir el buscador del rail + cierre al clicar fuera o salir del rail.
  useEffect(() => {
    if (!railSearchOpen) return;
    const t = setTimeout(() => railSearchInputRef.current?.focus(), 30);
    const onDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.('[data-rail-search]')) return;
      if (railSearchBtnRef.current?.contains(target as Node)) return;
      setRailSearchOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setRailSearchOpen(false);
    };
    window.addEventListener('mousedown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [railSearchOpen]);

  useEffect(() => {
    if (!rail) setRailSearchOpen(false);
  }, [rail]);
  const [recentTab, setRecentTab] = useState<'edited' | 'opened' | 'created'>('edited');
  const [clearConfirm, setClearConfirm] = useState(false);
  const recentBtnRef = useRef<HTMLButtonElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const inputMenu = useInputContextMenu(language);

  const [isNoteDragging, setIsNoteDragging] = useState(false);
  const [activeDropTargetId, setActiveDropTargetId] = useState<string | null | 'all'>(null);

  // Secciones colapsables (Vistas y Carpetas), como los grupos de la lista.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('cybernotes_sidebar_collapsed_sections');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed.filter((k): k is string => typeof k === 'string'));
      }
    } catch {}
    return new Set<string>();
  });
  const toggleSidebarSection = (key: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem('cybernotes_sidebar_collapsed_sections', JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };
  // Si la selección cae dentro de una sección colapsada, se expande sola.
  useEffect(() => {
    const specialIds = new Set<string>(['favorites', 'sticky', 'floating', 'trash']);
    const inFolders = selectedFolderId !== null && !specialIds.has(selectedFolderId);
    setCollapsedSections(prev => {
      const target = inFolders ? 'folders' : 'views';
      if (!prev.has(target)) return prev;
      const next = new Set(prev);
      next.delete(target);
      try {
        localStorage.setItem('cybernotes_sidebar_collapsed_sections', JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }, [selectedFolderId]);

  const viewsCollapsed = collapsedSections.has('views');
  const foldersCollapsed = collapsedSections.has('folders');

  const renderSectionHeader = (key: 'views' | 'folders', label: string) => {
    const collapsed = collapsedSections.has(key);
    return (
      <Tooltip
        placement="bottom"
        label={collapsed
          ? (language === 'es' ? 'Desplegar sección' : 'Expand section')
          : (language === 'es' ? 'Plegar sección' : 'Collapse section')}
      >
        <button
          type="button"
          onClick={() => toggleSidebarSection(key)}
          aria-expanded={!collapsed}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, width: '100%',
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 'calc(10px * var(--ui-scale))', fontWeight: 700,
            color: 'var(--text-muted)', textTransform: 'uppercase',
            letterSpacing: 1, padding: '12px 10px 6px', textAlign: 'left',
          }}
        >
          <span style={{
            display: 'inline-flex',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            transition: 'transform 0.15s',
          }}>
            <ChevronRight size={12} />
          </span>
          <span style={{ flex: 1 }}>{label}</span>
        </button>
      </Tooltip>
    );
  };

  // Botón del rail: 40px centrado, con activo y hover elegante.
  const railBtnStyle = (active: boolean, tint?: string): CSSProperties => ({
    width: 40,
    height: 40,
    borderRadius: 10,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: active ? 'var(--bg-active)' : 'transparent',
    border: active ? `1px solid ${tint || 'var(--accent)'}` : '1px solid transparent',
    color: active ? (tint || 'var(--accent-light)') : 'var(--text-secondary)',
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s, border-color 0.15s, filter 0.15s',
  });

  function RailIconBtn({
    label, active, tint, onClick, onContextMenu, onDragOver, onDragLeave, onDrop, children,
  }: {
    label: string;
    active: boolean;
    tint?: string;
    onClick?: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onDragOver?: (e: ReactDragEvent) => void;
    onDragLeave?: (e: ReactDragEvent) => void;
    onDrop?: (e: ReactDragEvent) => void;
    children: ReactNode;
  }) {
    const [hover, setHover] = useState(false);
    return (
      <Tooltip placement="right" label={label}>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          onContextMenu={onContextMenu}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            ...railBtnStyle(active, tint),
            ...(hover && !active
              ? {
                background: 'var(--bg-hover)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border)',
                boxShadow: '0 0 10px var(--accent-glow)',
              }
              : null),
            ...(hover && active ? { filter: 'brightness(1.18)' } : null),
          }}
        >
          {children}
        </button>
      </Tooltip>
    );
  }

  // Global drag listeners to activate target drop indicators
  useEffect(() => {
    const handleDragStart = () => {
      setIsNoteDragging(true);
    };
    const handleDragEnd = () => {
      setIsNoteDragging(false);
      setActiveDropTargetId(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDragEnd();
    };

    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('drop', handleDragEnd);
    window.addEventListener('cybernotes:dragend', handleDragEnd);
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('drop', handleDragEnd);
      window.removeEventListener('cybernotes:dragend', handleDragEnd);
      window.removeEventListener('mouseup', handleDragEnd);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (showNewFolder) setTimeout(() => newFolderInputRef.current?.focus(), 50);
  }, [showNewFolder]);

  useEffect(() => {
    if (triggerNewFolderSignal && triggerNewFolderSignal > 0) {
      setNewFolderName('');
      setNewFolderIcon('folder');
      const { available } = getAvailableColors();
      setNewFolderColor(available[0] || '#7c3aed');
      setShowNewFolder(true);
    }
  }, [triggerNewFolderSignal]);

  // Cerrar context menu al hacer click fuera
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, []);

  // Cerrar menú recientes al hacer click fuera
  const recentMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showRecent) return;
    const handler = (e: MouseEvent) => {
      if (
        recentBtnRef.current && !recentBtnRef.current.contains(e.target as Node) &&
        recentMenuRef.current && !recentMenuRef.current.contains(e.target as Node)
      ) {
        setShowRecent(false);
        setClearConfirm(false);
      }
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [showRecent]);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    onCreateFolder(newFolderName.trim(), newFolderIcon, newFolderColor);
    setNewFolderName('');
    setNewFolderIcon('folder');
    setNewFolderColor('#7c3aed');
    setShowNewFolder(false);
  };

  const handleContextMenu = (e: React.MouseEvent, folder: Folder) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ folder, x: e.clientX, y: e.clientY });
  };

  const handleSaveEdit = () => {
    if (!editingFolder || !editingFolder.name.trim()) return;
    onUpdateFolder(editingFolder);
    setEditingFolder(null);
  };

  useEffect(() => {
    if (!showNewFolder && !editingFolder && !folderToDelete) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (folderToDelete) setFolderToDelete(null);
        else if (editingFolder) setEditingFolder(null);
        else setShowNewFolder(false);
        return;
      }
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON') return;
      e.preventDefault();
      if (folderToDelete) {
        onDeleteFolder(folderToDelete.id);
        setFolderToDelete(null);
      } else if (editingFolder) {
        handleSaveEdit();
      } else {
        handleCreateFolder();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showNewFolder, editingFolder, folderToDelete, newFolderName, newFolderIcon, newFolderColor, onDeleteFolder, onCreateFolder, onUpdateFolder]);

  // Lista de notas recientes según la pestaña activa (Editadas / Abiertas / Creadas).
  // Memoizada: antes se reordenaba con Date parsing en cada render (cada click de tab).
  const RECENT_LIMIT = 6;
  const recentForTab = useMemo(() => {
    if (recentTab === 'opened') {
      return [...allNotes]
        .filter(n => openedHistory[n.id] && openedHistory[n.id] > recentClearedAt)
        .sort((a, b) => openedHistory[b.id] - openedHistory[a.id])
        .slice(0, RECENT_LIMIT)
        .map(n => ({ note: n, ts: new Date(openedHistory[n.id]).toISOString() }));
    }
    const field = recentTab === 'created' ? 'created_at' : 'updated_at';
    return [...allNotes]
      .filter(n => !recentClearedAt || new Date(n[field]).getTime() > recentClearedAt)
      .sort((a, b) => new Date(b[field]).getTime() - new Date(a[field]).getTime())
      .slice(0, RECENT_LIMIT)
      .map(n => ({ note: n, ts: n[field] }));
  }, [recentTab, allNotes, openedHistory, recentClearedAt]);

  const recentTabs: { id: 'edited' | 'opened' | 'created'; label: string }[] = [
    { id: 'edited', label: t.sidebar.recentEdited },
    { id: 'opened', label: t.sidebar.recentOpened },
    { id: 'created', label: t.sidebar.recentCreated },
  ];

  return (
    <div className={`glass-effect sidebar-glass${rail ? ' sidebar-rail' : ''}`} data-leave-guard="nav" style={{
      width: 'var(--sidebar-width)',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Search (el rail trae su propio acceso) */}
      {!rail && (
      <div style={{ padding: '12px 12px 8px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-muted)',
            pointerEvents: 'none',
          }} />
          <Tooltip
            placement="bottom"
            label={language === 'es' ? 'Buscar notas (Esc para limpiar)' : 'Search notes (Esc to clear)'}
          >
          <input
            id="cybernotes-search-input"
            type="text"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            onKeyDown={e => {
              // Esc limpia la búsqueda y devuelve la lista a su vista normal.
              if (e.key === 'Escape' && searchQuery) {
                e.preventDefault();
                onSearch('');
                e.currentTarget.blur();
              }
            }}
            placeholder={`${t.general.search} (Ctrl+F)`}
            className="input"
            onContextMenu={inputMenu.onContextMenu}
            style={{ padding: '7px 10px 7px 32px', paddingRight: searchQuery ? 30 : 12, fontSize: 'calc(12px * var(--ui-scale))' }}
          />
          </Tooltip>
          {searchQuery && (
            <button
              className="btn-icon"
              onClick={() => onSearch('')}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', padding: 2 }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>
      )}

      <div className="divider" />

      {rail ? (
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
        <Tooltip placement="right" label={searchQuery
          ? (language === 'es' ? 'Limpiar búsqueda' : 'Clear search')
          : (language === 'es' ? 'Buscar notas (Ctrl+F)' : 'Search notes (Ctrl+F)')}>
          <button
            ref={railSearchBtnRef}
            type="button"
            className="btn-icon"
            style={{ width: 40, height: 40, borderRadius: 10 }}
            onClick={() => {
              if (searchQuery) {
                onSearch('');
                return;
              }
              const r = railSearchBtnRef.current?.getBoundingClientRect();
              if (r) {
                setRailSearchPos({
                  top: r.top - 4,
                  left: Math.min(r.right + 8, window.innerWidth - 256),
                });
              }
              setRailSearchOpen(true);
            }}
            aria-label={t.general.search}
          >
            {searchQuery ? <X size={16} /> : <Search size={16} />}
          </button>
        </Tooltip>
        {railSearchOpen && railSearchPos && createPortal(
          <div
            data-rail-search="true"
            className="glass-effect"
            style={{
              position: 'fixed', top: railSearchPos.top, left: railSearchPos.left,
              width: 240, zIndex: 100000,
              background: 'var(--bg-modal)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', padding: 8,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Search size={14} style={{
                position: 'absolute', left: 10, top: '50%',
                transform: 'translateY(-50%)', color: 'var(--text-muted)',
                pointerEvents: 'none',
              }} />
              <input
                ref={railSearchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => onSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setRailSearchOpen(false);
                  }
                }}
                placeholder={t.general.search}
                className="input"
                aria-label={t.general.search}
                onContextMenu={inputMenu.onContextMenu}
                style={{ padding: '7px 10px 7px 32px', fontSize: 'calc(12px * var(--ui-scale))', width: '100%' }}
              />
            </div>
          </div>,
          document.body
        )}
        <div style={{ height: 1, width: 24, background: 'var(--border)', margin: '4px 0' }} />
        {([
          { key: 'all', icon: <FileText size={17} />, label: t.sidebar.allNotes, count: noteCount, active: selectedFolderId === null && !searchQuery, onClick: () => onSelectFolder(null), dropId: null as string | null },
          { key: 'favorites', icon: <Star size={17} />, label: t.sidebar.favorites, count: allNotes.filter(n => n.pinned === 1).length, active: selectedFolderId === 'favorites' && !searchQuery, onClick: () => onSelectFolder('favorites'), dropId: null as string | null },
          { key: 'sticky', icon: <AppWindow size={17} />, label: t.sidebar.stickyNotes, count: stickyNoteIds.length, active: selectedFolderId === 'sticky' && !searchQuery, onClick: () => onSelectFolder('sticky'), dropId: null as string | null },
          { key: 'floating', icon: <Inbox size={17} />, label: t.sidebar.floatingNotes, count: allNotes.filter(n => !n.folder_id).length, active: selectedFolderId === 'floating' && !searchQuery, onClick: () => onSelectFolder('floating'), dropId: null as string | null },
          { key: 'trash', icon: <Trash2 size={17} />, label: t.sidebar.trash, count: trashCount, active: selectedFolderId === 'trash' && !searchQuery, onClick: () => onSelectFolder('trash'), dropId: null as string | null },
        ]).map((item) => (
          <RailIconBtn
            key={item.key}
            label={`${item.label} (${item.count})`}
            active={item.active}
            tint={isNoteDragging && activeDropTargetId === 'all' && item.key === 'all' ? 'var(--accent)' : undefined}
            onClick={item.onClick}
            onDragOver={item.key === 'all' ? (e => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'move';
              setActiveDropTargetId(prev => (prev === 'all' ? prev : 'all'));
            }) : undefined}
            onDragLeave={item.key === 'all' ? (e => {
              if (e.currentTarget.contains(e.relatedTarget as Node)) return;
              setActiveDropTargetId(prev => (prev === 'all' ? null : prev));
            }) : undefined}
            onDrop={item.key === 'all' ? (e => {
              e.preventDefault();
              e.stopPropagation();
              const noteId = e.dataTransfer.getData('text/plain');
              setActiveDropTargetId(null);
              setIsNoteDragging(false);
              window.dispatchEvent(new CustomEvent('cybernotes:dragend'));
              if (noteId) {
                playSynthSound('mechanical-click');
                onMoveNote(noteId, null);
              }
            }) : undefined}
          >
            {item.icon}
          </RailIconBtn>
        ))}
        <div style={{ height: 1, width: 24, background: 'var(--border)', margin: '4px 0' }} />
        {folders.map(folder => {
          const isSelected = selectedFolderId === folder.id;
          const count = allNotes.filter(n => n.folder_id === folder.id).length;
          const isTarget = isNoteDragging && activeDropTargetId === folder.id;
          return (
            <RailIconBtn
              key={folder.id}
              label={`${folder.name} (${count})`}
              active={isSelected}
              tint={isTarget ? folder.color : (isSelected ? `${folder.color}66` : undefined)}
              onClick={() => onSelectFolder(folder.id)}
              onContextMenu={e => handleContextMenu(e, folder)}
              onDragOver={e => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setActiveDropTargetId(prev => (prev === folder.id ? prev : folder.id));
              }}
              onDragLeave={e => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setActiveDropTargetId(prev => (prev === folder.id ? null : prev));
              }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                const noteId = e.dataTransfer.getData('text/plain');
                setActiveDropTargetId(null);
                setIsNoteDragging(false);
                window.dispatchEvent(new CustomEvent('cybernotes:dragend'));
                if (noteId) {
                  playSynthSound('mechanical-click');
                  onMoveNote(noteId, folder.id);
                }
              }}
            >
              <FolderIcon name={folder.icon} color={folder.color} size={17} />
            </RailIconBtn>
          );
        })}
        <div style={{ height: 1, width: 24, background: 'var(--border)', margin: '4px 0' }} />
        <Tooltip placement="right" label={language === 'es' ? 'Nueva carpeta (Ctrl+Shift+N)' : 'New folder (Ctrl+Shift+N)'}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setNewFolderName('');
              setNewFolderIcon('folder');
              const { available } = getAvailableColors();
              setNewFolderColor(available[0] || '#7c3aed');
              setShowNewFolder(true);
            }}
            aria-label={t.sidebar.newFolder}
            style={{ width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <Plus size={16} />
          </button>
        </Tooltip>
      </div>
      ) : (
      <>
      {/* Nav */}
      <div
        onDragOver={e => {
          e.preventDefault();
        }}
        onDragLeave={e => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setActiveDropTargetId(null);
          }
        }}
        style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}
      >
        {renderSectionHeader('views', t.sidebar.views)}
        {!viewsCollapsed && (
          <>
        {/* Todas las notas */}
        <motion.button
          onClick={() => onSelectFolder(null)}
          onDragOver={e => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setActiveDropTargetId(prev => (prev === 'all' ? prev : 'all'));
          }}
          onDragLeave={e => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setActiveDropTargetId(prev => (prev === 'all' ? null : prev));
          }}
          onDrop={e => {
            e.preventDefault();
            e.stopPropagation();
            const noteId = e.dataTransfer.getData('text/plain');
            setActiveDropTargetId(null);
            setIsNoteDragging(false);
            window.dispatchEvent(new CustomEvent('cybernotes:dragend'));
            if (noteId) {
              playSynthSound('mechanical-click');
              onMoveNote(noteId, null);
            }
          }}
          whileHover="hover"
          whileTap="tap"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: isNoteDragging
              ? activeDropTargetId === 'all'
                ? '1px solid var(--accent)'
                : '1px dashed color-mix(in srgb, var(--accent) 45%, transparent)'
              : selectedFolderId === null && !searchQuery
                ? '1px solid var(--accent)'
                : '1px solid transparent',
            background: isNoteDragging && activeDropTargetId === 'all'
              ? 'var(--accent-dim)'
              : selectedFolderId === null && !searchQuery
                ? 'var(--bg-active)'
                : 'transparent',
            color: isNoteDragging && activeDropTargetId === 'all'
              ? 'var(--accent-light)'
              : selectedFolderId === null && !searchQuery
                ? 'var(--accent-light)'
                : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'calc(13px * var(--ui-scale))',
            fontWeight: (selectedFolderId === null && !searchQuery) || (isNoteDragging && activeDropTargetId === 'all') ? 600 : 400,
            textAlign: 'left',
            transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            marginBottom: 4,
            position: 'relative',
            boxShadow: isNoteDragging && activeDropTargetId === 'all'
              ? '0 0 16px var(--accent-glow), inset 0 0 6px var(--accent-dim)'
              : selectedFolderId === null && !searchQuery
                ? '0 0 12px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.01), inset 0 1px 0 rgba(255,255,255,0.02)'
                : 'none',
            transform: isNoteDragging && activeDropTargetId === 'all' ? 'translateX(4px) scale(1.01)' : 'none',
          }}
          variants={{
            hover: {
              x: 3,
              boxShadow: '0 0 14px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              background: selectedFolderId === null && !searchQuery ? 'var(--bg-active)' : 'rgba(255, 255, 255, 0.02)',
              transition: { duration: 0.1 }
            },
            tap: {
              scale: 0.98,
              x: 0,
              transition: { duration: 0.1 }
            }
          }}
        >
          <motion.span
            variants={{
              hover: { scale: 1.2, rotate: [0, -5, 5, 0], transition: { type: 'spring', stiffness: 300, damping: 10 } }
            }}
            style={{ display: 'inline-flex', alignItems: 'center', pointerEvents: 'none' }}
          >
            <FileText size={15} />
          </motion.span>
          <span style={{ flex: 1, pointerEvents: 'none' }}>{t.sidebar.allNotes}</span>
          <span style={specialFilterBadgeStyle(selectedFolderId === null && !searchQuery, FILTER_COLORS.all)}>{noteCount}</span>
        </motion.button>

        {/* Favoritos / Favorites */}
        <motion.button
          onClick={() => onSelectFolder('favorites')}
          whileHover="hover"
          whileTap="tap"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid transparent',
            background: selectedFolderId === 'favorites' && !searchQuery
              ? 'var(--bg-active)'
              : 'transparent',
            color: selectedFolderId === 'favorites' && !searchQuery
              ? 'var(--accent-light)'
              : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'calc(13px * var(--ui-scale))',
            fontWeight: selectedFolderId === 'favorites' && !searchQuery ? 600 : 400,
            textAlign: 'left',
            transition: 'all 0.12s ease-out',
            marginBottom: 4,
            position: 'relative',
            boxShadow: selectedFolderId === 'favorites' && !searchQuery
              ? '0 0 12px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.01), inset 0 1px 0 rgba(255,255,255,0.02)'
              : 'none',
          }}
          variants={{
            hover: {
              x: 3,
              boxShadow: '0 0 14px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              background: selectedFolderId === 'favorites' && !searchQuery ? 'var(--bg-active)' : 'rgba(255, 255, 255, 0.02)',
              transition: { duration: 0.1 }
            },
            tap: {
              scale: 0.98,
              x: 0,
              transition: { duration: 0.1 }
            }
          }}
        >
          <motion.span
            variants={{
              hover: { scale: 1.2, rotate: [0, -12, 12, 0], transition: { type: 'spring', stiffness: 300, damping: 10 } }
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <Star
              size={15}
              fill="currentColor"
              stroke="none"
            />
          </motion.span>
          <span style={{ flex: 1, pointerEvents: 'none' }}>{t.sidebar.favorites}</span>
          <span style={specialFilterBadgeStyle(selectedFolderId === 'favorites' && !searchQuery, FILTER_COLORS.favorites)}>{allNotes.filter(n => n.pinned === 1).length}</span>
        </motion.button>

        {/* Notas adhesivas / Sticky notes */}
        <motion.button
          onClick={() => onSelectFolder('sticky')}
          whileHover="hover"
          whileTap="tap"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid transparent',
            background: selectedFolderId === 'sticky' && !searchQuery
              ? 'var(--bg-active)'
              : 'transparent',
            color: selectedFolderId === 'sticky' && !searchQuery
              ? 'var(--accent-light)'
              : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'calc(13px * var(--ui-scale))',
            fontWeight: selectedFolderId === 'sticky' && !searchQuery ? 600 : 400,
            textAlign: 'left',
            transition: 'all 0.12s ease-out',
            marginBottom: 4,
            position: 'relative',
            boxShadow: selectedFolderId === 'sticky' && !searchQuery
              ? '0 0 12px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.01), inset 0 1px 0 rgba(255,255,255,0.02)'
              : 'none',
          }}
          variants={{
            hover: {
              x: 3,
              boxShadow: '0 0 14px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              background: selectedFolderId === 'sticky' && !searchQuery ? 'var(--bg-active)' : 'rgba(255, 255, 255, 0.02)',
              transition: { duration: 0.1 }
            },
            tap: {
              scale: 0.98,
              x: 0,
              transition: { duration: 0.1 }
            }
          }}
        >
          <motion.span
            variants={{
              hover: { scale: 1.2, rotate: [-3, 3, -3, 0], transition: { type: 'spring', stiffness: 300, damping: 10 } }
            }}
            style={{ display: 'inline-flex', alignItems: 'center', pointerEvents: 'none' }}
          >
            <AppWindow size={15} />
          </motion.span>
          <span style={{ flex: 1, pointerEvents: 'none' }}>{t.sidebar.stickyNotes}</span>
          <span style={specialFilterBadgeStyle(selectedFolderId === 'sticky' && !searchQuery, FILTER_COLORS.sticky)}>{stickyNoteIds.length}</span>
        </motion.button>

        {/* Sin carpeta / Unfiled */}
        <motion.button
          onClick={() => onSelectFolder('floating')}
          onDragOver={e => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            setActiveDropTargetId(prev => (prev === 'floating' ? prev : 'floating'));
          }}
          onDragLeave={e => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return;
            setActiveDropTargetId(prev => (prev === 'floating' ? null : prev));
          }}
          onDrop={e => {
            e.preventDefault();
            e.stopPropagation();
            const noteId = e.dataTransfer.getData('text/plain');
            setActiveDropTargetId(null);
            setIsNoteDragging(false);
            window.dispatchEvent(new CustomEvent('cybernotes:dragend'));
            if (noteId) {
              playSynthSound('mechanical-click');
              onMoveNote(noteId, null);
            }
          }}
          whileHover="hover"
          whileTap="tap"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: isNoteDragging
              ? activeDropTargetId === 'floating'
                ? '1px solid var(--accent)'
                : '1px dashed color-mix(in srgb, var(--accent) 45%, transparent)'
              : selectedFolderId === 'floating' && !searchQuery
                ? '1px solid var(--accent)'
                : '1px solid transparent',
            background: isNoteDragging && activeDropTargetId === 'floating'
              ? 'var(--accent-dim)'
              : selectedFolderId === 'floating' && !searchQuery
                ? 'var(--bg-active)'
                : 'transparent',
            color: isNoteDragging && activeDropTargetId === 'floating'
              ? 'var(--accent-light)'
              : selectedFolderId === 'floating' && !searchQuery
                ? 'var(--accent-light)'
                : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'calc(13px * var(--ui-scale))',
            fontWeight: (selectedFolderId === 'floating' && !searchQuery) || (isNoteDragging && activeDropTargetId === 'floating') ? 600 : 400,
            textAlign: 'left',
            transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
            marginBottom: 4,
            position: 'relative',
            boxShadow: isNoteDragging && activeDropTargetId === 'floating'
              ? '0 0 16px var(--accent-glow), inset 0 0 6px var(--accent-dim)'
              : selectedFolderId === 'floating' && !searchQuery
                ? '0 0 12px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.01), inset 0 1px 0 rgba(255,255,255,0.02)'
                : 'none',
            transform: isNoteDragging && activeDropTargetId === 'floating' ? 'translateX(4px) scale(1.01)' : 'none',
          }}
          variants={{
            hover: {
              x: 3,
              boxShadow: '0 0 14px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              background: selectedFolderId === 'floating' && !searchQuery ? 'var(--bg-active)' : 'rgba(255, 255, 255, 0.02)',
              transition: { duration: 0.1 }
            },
            tap: {
              scale: 0.98,
              x: 0,
              transition: { duration: 0.1 }
            }
          }}
        >
          <motion.span
            variants={{
              hover: { scale: 1.2, y: [0, -2, 2, 0], transition: { type: 'spring', stiffness: 300, damping: 10 } }
            }}
            style={{ display: 'inline-flex', alignItems: 'center', pointerEvents: 'none' }}
          >
            <Inbox size={15} />
          </motion.span>
          <span style={{ flex: 1, pointerEvents: 'none' }}>{t.sidebar.floatingNotes}</span>
          <span style={specialFilterBadgeStyle(selectedFolderId === 'floating' && !searchQuery, FILTER_COLORS.unfiled)}>{allNotes.filter(n => !n.folder_id).length}</span>
        </motion.button>

        {/* Papelera / Trash */}
        <motion.button
          onClick={() => onSelectFolder('trash')}
          whileHover="hover"
          whileTap="tap"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid transparent',
            background: selectedFolderId === 'trash' && !searchQuery
              ? 'var(--bg-active)'
              : 'transparent',
            color: selectedFolderId === 'trash' && !searchQuery
              ? 'var(--accent-light)'
              : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'calc(13px * var(--ui-scale))',
            fontWeight: selectedFolderId === 'trash' && !searchQuery ? 600 : 400,
            textAlign: 'left',
            transition: 'all 0.12s ease-out',
            marginBottom: 4,
            position: 'relative',
            boxShadow: selectedFolderId === 'trash' && !searchQuery
              ? '0 0 12px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.01), inset 0 1px 0 rgba(255,255,255,0.02)'
              : 'none',
          }}
          variants={{
            hover: {
              x: 3,
              boxShadow: '0 0 14px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.03), inset 0 1px 0 rgba(255,255,255,0.04)',
              borderColor: 'rgba(255, 255, 255, 0.08)',
              background: selectedFolderId === 'trash' && !searchQuery ? 'var(--bg-active)' : 'rgba(255, 255, 255, 0.02)',
              transition: { duration: 0.1 },
            },
            tap: { scale: 0.98, x: 0, transition: { duration: 0.1 } },
          }}
        >
          <motion.span
            variants={{
              hover: { scale: 1.15, rotate: [-4, 4, -2, 0], transition: { type: 'spring', stiffness: 300, damping: 10 } },
            }}
            style={{ display: 'inline-flex', alignItems: 'center', pointerEvents: 'none' }}
          >
            <Trash2 size={15} />
          </motion.span>
          <span style={{ flex: 1, pointerEvents: 'none' }}>{t.sidebar.trash}</span>
          {trashCount > 0 && (
            <span style={specialFilterBadgeStyle(selectedFolderId === 'trash' && !searchQuery, FILTER_COLORS.trash)}>{trashCount}</span>
          )}
        </motion.button>
          </>
        )}

        {renderSectionHeader('folders', t.sidebar.folders)}
        {!foldersCollapsed && (
          <>

        {/* Lista de folders */}
        {folders.map(folder => {
          const isSelected = selectedFolderId === folder.id;
          const isTarget = isNoteDragging && activeDropTargetId === folder.id;
          const isContextActive = contextMenu?.folder.id === folder.id;

          return (
            <motion.button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              onContextMenu={e => handleContextMenu(e, folder)}
              onDragOver={e => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                setActiveDropTargetId(prev => (prev === folder.id ? prev : folder.id));
              }}
              onDragLeave={e => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setActiveDropTargetId(prev => (prev === folder.id ? null : prev));
              }}
              onDrop={e => {
                e.preventDefault();
                e.stopPropagation();
                const noteId = e.dataTransfer.getData('text/plain');
                setActiveDropTargetId(null);
                setIsNoteDragging(false);
                window.dispatchEvent(new CustomEvent('cybernotes:dragend'));
                if (noteId) {
                  playSynthSound('mechanical-click');
                  onMoveNote(noteId, folder.id);
                }
              }}
              whileHover="hover"
              whileTap="tap"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                border: isNoteDragging
                  ? isTarget
                    ? `1.5px solid ${folder.color}`
                    : `1px dashed ${folder.color}55`
                  : isContextActive
                    ? `1px solid ${folder.color}66`
                    : '1px solid transparent',
                background: isTarget
                  ? `${folder.color}28`
                  : isSelected || isContextActive
                    ? 'var(--bg-active)'
                    : 'transparent',
                color: isTarget
                  ? '#fff'
                  : isSelected || isContextActive
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 'calc(13px * var(--ui-scale))',
                fontWeight: isSelected || isTarget || isContextActive ? 600 : 400,
                textAlign: 'left',
                transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                marginBottom: 4,
                position: 'relative',
                boxShadow: isTarget
                  ? `0 0 18px ${folder.color}55, inset 0 0 8px ${folder.color}25`
                  : isContextActive
                    ? `0 0 16px ${folder.color}33, inset 0 0 4px ${folder.color}15, inset 0 1px 0 rgba(255,255,255,0.04)`
                    : isSelected
                      ? `0 0 14px ${folder.color}18, inset 0 0 4px ${folder.color}0a, inset 0 1px 0 rgba(255,255,255,0.01)`
                      : 'none',
                transform: isTarget ? 'translateX(5px) scale(1.02)' : 'none',
              }}
              variants={{
                hover: {
                  x: 3,
                  boxShadow: `0 0 16px ${folder.color}2c, inset 0 0 4px ${folder.color}10, inset 0 1px 0 rgba(255,255,255,0.04)`,
                  borderColor: `${folder.color}44`,
                  background: isSelected ? 'var(--bg-active)' : 'rgba(255, 255, 255, 0.02)',
                  transition: { duration: 0.1 }
                },
                tap: {
                  scale: 0.98,
                  x: 0,
                  transition: { duration: 0.1 }
                }
              }}
            >
              {/* Color bar */}
              {isSelected && !isTarget && (
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: '20%',
                  bottom: '20%',
                  width: 3,
                  borderRadius: 2,
                  background: folder.color,
                  pointerEvents: 'none',
                }} />
              )}
              <motion.span 
                variants={{
                  hover: { scale: 1.2, rotate: [0, -5, 5, 0], transition: { type: 'spring', stiffness: 300, damping: 10 } }
                }}
                style={{ 
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 2,
                  pointerEvents: 'none',
                }}
              >
                <FolderIcon name={folder.icon} color={folder.color} size={15} />
              </motion.span>
              <span className="truncate" style={{ 
                flex: 1,
                textShadow: isTarget ? `0 0 4px ${folder.color}aa` : 'none',
                color: isTarget ? '#fff' : undefined,
                pointerEvents: 'none',
              }}>{folder.name}</span>
              <span style={{
                fontSize: 'calc(11px * var(--ui-scale))',
                background: isSelected
                  ? 'color-mix(in srgb, var(--accent) 28%, transparent)'
                  : `${folder.color}22`,
                color: isSelected ? 'var(--accent-light)' : '#fff',
                padding: '1px 6px',
                borderRadius: 10,
                marginRight: 6,
                fontWeight: isSelected ? 600 : 400,
                pointerEvents: 'none',
                boxShadow: isSelected
                  ? '0 0 6px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.12)'
                  : `0 0 6px ${folder.color}44, inset 0 1px 0 rgba(255,255,255,0.1)`,
              }}>{allNotes.filter(n => n.folder_id === folder.id).length}</span>
              <ChevronRight size={12} style={{ opacity: isTarget ? 0.8 : 0.4, color: isTarget ? folder.color : undefined, pointerEvents: 'none' }} />
            </motion.button>
          );
        })}

        <Tooltip placement="bottom" label={language === 'es' ? 'Nueva carpeta (Ctrl+Shift+N)' : 'New folder (Ctrl+Shift+N)'}>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setNewFolderName('');
              setNewFolderIcon('folder');
              const { available } = getAvailableColors();
              setNewFolderColor(available[0] || '#7c3aed');
              setShowNewFolder(true);
            }}
            style={{ width: '100%', justifyContent: 'flex-start', marginTop: 4, fontSize: 'calc(12px * var(--ui-scale))', gap: 8, padding: '7px 10px' }}
          >
            <Plus size={14} />
            {t.sidebar.newFolder}
          </button>
        </Tooltip>
          </>
        )}
      </div>
      </>
      )}

      {/* Bottom actions */}
      <div className="divider" />
      <div style={{ padding: '8px', display: 'flex', gap: 6, justifyContent: 'space-between', flexDirection: rail ? 'column' : 'row' }}>
        <Tooltip placement="top" label={language === 'es' ? 'Notas recientes' : 'Recent notes'}>
          <button
            ref={recentBtnRef}
            className="btn btn-ghost"
            onClick={(e) => { e.stopPropagation(); setShowRecent(prev => !prev); setClearConfirm(false); }}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 'calc(12px * var(--ui-scale))',
              padding: '7px 8px',
              ...(showRecent ? {
                background: 'var(--accent-dim)',
                borderColor: 'var(--accent)',
                color: 'var(--accent-light)',
                boxShadow: '0 0 8px var(--accent-glow)',
              } : null),
            }}
          >
            <Clock size={14} />
            {!rail && <span>{language === 'es' ? 'Recientes' : 'Recent'}</span>}
          </button>
        </Tooltip>
        <Tooltip placement="top" label={language === 'es' ? 'Bloquear aplicación' : 'Lock application'}>
          <button
            className="btn btn-ghost"
            onClick={onLock}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              fontSize: 'calc(12px * var(--ui-scale))',
              padding: '7px 8px',
            }}
          >
            <Lock size={14} />
            {!rail && <span>{language === 'es' ? 'Bloquear' : 'Lock'}</span>}
          </button>
        </Tooltip>
      </div>

      {/* Drop-up recientes */}
      {showRecent && recentBtnRef.current && createPortal(
        <div
          ref={recentMenuRef}
          className="glass-effect"
          style={{
            position: 'fixed',
            left: recentBtnRef.current.getBoundingClientRect().left,
            bottom: window.innerHeight - recentBtnRef.current.getBoundingClientRect().top + 4,
            width: 360,
            background: 'var(--bg-modal)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 8,
            boxShadow: '0 -8px 24px rgba(0,0,0,0.4)',
            zIndex: 100000,
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 6px 6px 10px' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t.sidebar.recentTitle}
            </span>
            <Tooltip placement="left" label={language === 'es' ? 'Cerrar' : 'Close'}>
            <button
              onClick={() => { setShowRecent(false); setClearConfirm(false); }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-primary)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 26,
                height: 26,
                background: 'transparent',
                color: 'var(--text-muted)',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <X size={15} />
            </button>
            </Tooltip>
          </div>

          {/* Pestañas arriba: Editadas / Abiertas / Creadas */}
          <div style={{ display: 'flex', gap: 4, margin: '2px 0 8px' }}>
            {recentTabs.map(tab => {
              const active = recentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setRecentTab(tab.id)}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  style={{
                    flex: 1,
                    padding: '6px 4px',
                    fontSize: 12.5,
                    fontWeight: active ? 600 : 500,
                    background: active ? 'var(--accent-dim)' : 'transparent',
                    color: active ? 'var(--text-accent)' : 'var(--text-secondary)',
                    border: '1px solid ' + (active ? 'var(--accent)' : 'var(--border)'),
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'background 0.12s, color 0.12s, border-color 0.12s',
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Lista de notas (altura fija para 6 elementos) */}
          <div style={{ minHeight: 312, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {recentForTab.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: '40px 10px', textAlign: 'center' }}>
                {t.noteList.noNotes}
              </div>
            ) : (
              recentForTab.map(({ note, ts }, i) => {
                const parentFolder = note.folder_id ? folders.find(f => f.id === note.folder_id) : null;
                return (
                <div key={note.id}>
                  {i > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />}
                  <Tooltip
                    placement="right"
                    delay={400}
                    label={note.preview ? (
                      <span style={{
                        whiteSpace: 'normal', maxWidth: 250, textAlign: 'left',
                        fontWeight: 400, fontSize: 12, lineHeight: 1.5,
                        display: '-webkit-box', WebkitLineClamp: 5, WebkitBoxOrient: 'vertical',
                        overflow: 'hidden', wordBreak: 'break-word',
                      }}>
                        {note.preview.slice(0, 220)}
                      </span>
                    ) : ''}
                  >
                  <button
                    onClick={() => { onSelectNote(note.id); setShowRecent(false); }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 2,
                      padding: '8px 12px',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                    }}>
                      {note.title || t.noteList.unnamedNote}
                    </span>
                    <span style={{
                      fontSize: 12, color: 'var(--text-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      width: '100%',
                    }}>
                      {timeAgo(ts, language)}
                      {parentFolder ? ` · ${parentFolder.name}` : ''}
                    </span>
                  </button>
                  </Tooltip>
                </div>
                );
              })
            )}
          </div>

          {/* Limpiar historial (con confirmación inline) */}
          {clearConfirm ? (
            <div style={{ marginTop: 4, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-hover)', borderRadius: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5, textAlign: 'center' }}>
                {language === 'es' ? '¿Borrar el historial de notas recientes?' : 'Clear the recent notes history?'}
              </span>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                <button
                  onClick={() => setClearConfirm(false)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-surface)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 13,
                    background: 'transparent', color: 'var(--text-secondary)',
                    border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  {language === 'es' ? 'Cancelar' : 'Cancel'}
                </button>
                <button
                  onClick={() => { onClearRecent?.(); setClearConfirm(false); setShowRecent(false); }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#ef4444'; (e.currentTarget as HTMLElement).style.color = '#fff'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
                  style={{
                    flex: 1, padding: '6px 10px', fontSize: 13, fontWeight: 600,
                    background: 'transparent', color: '#ef4444',
                    border: '1px solid #ef4444', borderRadius: 6, cursor: 'pointer',
                  }}
                >
                  {language === 'es' ? 'Borrar' : 'Clear'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setClearConfirm(true)}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = '#ef4444'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                marginTop: 4,
                padding: '8px',
                fontSize: 13.5,
                background: 'transparent',
                color: 'var(--text-muted)',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                width: '100%',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <Trash2 size={14} />
              {t.sidebar.clearHistory}
            </button>
          )}
        </div>,
        document.body
      )}

      {/* Context Menu */}
      {contextMenu && createPortal(
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--bg-modal)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 6,
            zIndex: 99999,
            minWidth: 160,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}
        >
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: 'calc(12px * var(--ui-scale))', padding: '6px 10px', gap: 8 }}
            onClick={() => {
              setEditingFolder(contextMenu.folder);
              setContextMenu(null);
            }}
          >
            <Pencil size={13} style={{ flexShrink: 0 }} />
            <span>{language === 'es' ? 'Editar carpeta' : 'Edit folder'}</span>
          </button>
          <button
            className="btn btn-ghost"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: 'calc(12px * var(--ui-scale))', padding: '6px 10px', gap: 8, marginTop: 2 }}
            onClick={() => {
              setFolderToDelete(contextMenu.folder);
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} color="var(--danger)" style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <span>{language === 'es' ? 'Eliminar carpeta' : 'Delete folder'}</span>
          </button>
        </div>,
        document.body
      )}

      {/* Modal Nueva carpeta */}
      {showNewFolder && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5, 5, 8, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999,
        }} onClick={() => setShowNewFolder(false)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg-modal)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: 28,
              width: 540,
              maxWidth: 'calc(100vw - 32px)',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 20px var(--accent-glow)',
            }}
          >
            <h3 style={{ fontSize: 'calc(16px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
              {t.sidebar.newFolder}
            </h3>

            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder={t.sidebar.folderName}
              className="input"
              autoFocus
              onContextMenu={inputMenu.onContextMenu}
            />

            <label style={{ fontSize: 'calc(13px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {language === 'es' ? 'Selecciona un icono' : 'Select an icon'}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {FOLDER_ICONS.map(icon => {
                const isSelected = newFolderIcon === icon;
                return (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setNewFolderIcon(icon)}
                    style={{
                      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: 'var(--bg-input)',
                      borderRadius: 6,
                      padding: '6px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      aspectRatio: '1',
                    }}
                  >
                    <FolderIcon name={icon} color={isSelected ? 'var(--accent)' : '#ffffff'} size={16} />
                  </button>
                );
              })}
            </div>

            <label style={{ fontSize: 'calc(13px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {language === 'es' ? 'Asigna un color único de carpeta' : 'Assign a unique folder color'}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {FOLDER_COLORS.map(c => {
                const { usedColors } = getAvailableColors();
                const isUsed = usedColors.has(c);
                const isSelected = newFolderColor === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => !isUsed || isSelected ? setNewFolderColor(c) : null}
                    disabled={isUsed && !isSelected}
                    style={{
                      width: 24,
                      height: 24,
                      padding: 0,
                      borderRadius: '50%',
                      background: c,
                      border: isSelected ? '3px solid white' : '2px solid transparent',
                      cursor: isUsed && !isSelected ? 'not-allowed' : 'pointer',
                      boxShadow: isSelected ? `0 0 8px ${c}` : 'none',
                      boxSizing: 'border-box',
                      flexShrink: 0,
                      opacity: isUsed && !isSelected ? 0.4 : 1,
                      position: 'relative',
                    }}
                    title={isUsed && !isSelected ? (language === 'es' ? 'Color en uso' : 'Color in use') : ''}
                  >
                    {isUsed && !isSelected && (
                      <span style={{
                        position: 'absolute',
                        top: -5,
                        right: -5,
                        width: 12,
                        height: 12,
                        background: '#ef4444',
                        borderRadius: '50%',
                        fontSize: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                      }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="modal-actions">
              <button type="button" className="modal-action-btn is-cancel" onClick={() => setShowNewFolder(false)}>
                {t.general.cancel}
                <span className="modal-key-esc">Esc</span>
              </button>
              <button type="button" className="modal-action-btn is-save" onClick={handleCreateFolder}>
                {t.sidebar.create}
                <EnterGlyph />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Editar carpeta */}
      {editingFolder && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5, 5, 8, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999,
        }} onClick={() => setEditingFolder(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
            background: 'var(--bg-modal)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 28,
            width: 540,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 20px var(--accent-glow)',
          }}>
            <h3 style={{ fontSize: 'calc(16px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-primary)' }}>{t.sidebar.context.edit}</h3>

            <input
              type="text"
              value={editingFolder.name}
              onChange={e => setEditingFolder({ ...editingFolder, name: e.target.value })}
              className="input"
              autoFocus
              onContextMenu={inputMenu.onContextMenu}
            />

            <label style={{ fontSize: 'calc(13px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {language === 'es' ? 'Selecciona un icono' : 'Select an icon'}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {FOLDER_ICONS.map(icon => {
                const isSelected = editingFolder.icon === icon;
                return (
                  <button
                    key={icon}
                    type="button"
                    onClick={() => setEditingFolder({ ...editingFolder, icon })}
                    style={{
                      border: isSelected ? '2px solid var(--accent)' : '1px solid var(--border)',
                      background: 'var(--bg-input)',
                      borderRadius: 6,
                      padding: '6px',
                      cursor: 'pointer',
                      opacity: 1,
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      aspectRatio: '1',
                    }}
                  >
                    <FolderIcon name={icon} color={isSelected ? 'var(--accent)' : '#ffffff'} size={16} />
                  </button>
                );
              })}
            </div>

            <label style={{ fontSize: 'calc(13px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {language === 'es' ? 'Asigna un color único de carpeta' : 'Assign a unique folder color'}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 6 }}>
              {FOLDER_COLORS.map(c => {
                const { usedColors } = getAvailableColors(editingFolder.id);
                const isUsed = usedColors.has(c);
                const isSelected = editingFolder.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => !isUsed || isSelected ? setEditingFolder({ ...editingFolder, color: c }) : null}
                    disabled={isUsed && !isSelected}
                    style={{
                      width: 24,
                      height: 24,
                      padding: 0,
                      borderRadius: '50%',
                      background: c,
                      border: isSelected ? '3px solid white' : '2px solid transparent',
                      cursor: isUsed && !isSelected ? 'not-allowed' : 'pointer',
                      boxShadow: isSelected ? `0 0 8px ${c}` : 'none',
                      boxSizing: 'border-box',
                      flexShrink: 0,
                      opacity: isUsed && !isSelected ? 0.4 : 1,
                      position: 'relative',
                    }}
                    title={isUsed && !isSelected ? language === 'es' ? 'Color en uso' : 'Color in use' : ''}
                  >
                    {isUsed && !isSelected && (
                      <span style={{
                        position: 'absolute',
                        top: -5,
                        right: -5,
                        width: 12,
                        height: 12,
                        background: '#ef4444',
                        borderRadius: '50%',
                        fontSize: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                      }}>✓</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="modal-actions">
              <button type="button" className="modal-action-btn is-cancel" onClick={() => setEditingFolder(null)}>
                {t.general.cancel}
                <span className="modal-key-esc">Esc</span>
              </button>
              <button type="button" className="modal-action-btn is-save" onClick={handleSaveEdit}>
                {t.general.save}
                <EnterGlyph />
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Custom delete folder confirmation dialog */}
      {folderToDelete && createPortal(
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5, 5, 8, 0.72)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
        }}>
          <motion.div
            {...modalCardMotion}
            className="glass-effect"
            style={{
              width: 'calc(400px * var(--ui-scale))',
              background: 'rgba(15, 15, 22, 0.95)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px 28px',
              boxShadow: '0 20px 50px rgba(0,0,0,0.6), 0 0 30px rgba(239, 68, 68, 0.05)',
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
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Trash2 size={24} style={{ color: '#ef4444', filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.6))' }} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h3 style={{
                  fontSize: 'calc(16px * var(--ui-scale))',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  margin: 0,
                  letterSpacing: '-0.01em',
                }}>
                  {language === 'es' ? '¿Eliminar carpeta?' : 'Delete Folder?'}
                </h3>
                <p style={{
                  fontSize: 'calc(13px * var(--ui-scale))',
                  color: 'var(--text-secondary)',
                  margin: '6px 0 0 0',
                  lineHeight: 1.4,
                }}>
                  {t.sidebar.context.deleteConfirm.replace('{name}', folderToDelete.name)}
                </p>
              </div>
            </div>

            <div className="modal-actions">
              <button type="button" className="modal-action-btn is-cancel" onClick={() => setFolderToDelete(null)}>
                {t.general.cancel}
                <span className="modal-key-esc">Esc</span>
              </button>
              <button
                type="button"
                className="modal-action-btn is-danger"
                onClick={() => {
                  onDeleteFolder(folderToDelete.id);
                  setFolderToDelete(null);
                }}
              >
                {language === 'es' ? 'Eliminar' : 'Delete'}
                <EnterGlyph />
              </button>
            </div>
          </motion.div>
        </div>,
        document.body
      )}

      {inputMenu.menu}
    </div>
  );
}
