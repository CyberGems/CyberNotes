import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Folder, Note } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import {
  Plus, FolderOpen, Settings, Lock, Search, X,
  ChevronRight, Pencil, Trash2, FileText, Clock, Cloud, Star,
} from 'lucide-react';
import { useInputContextMenu } from '../hooks/useInputContextMenu';
import FolderIcon from './FolderIcon';
import Tooltip from './Tooltip';

interface Props {
  language: Language;
  folders: Folder[];
  selectedFolderId: string | null;
  noteCount: number;
  recentNotes: Note[];
  allNotes: Note[];
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
  getAvailableColors: (currentFolderId?: string) => { all: string[]; available: string[]; usedColors: Set<string> };
}

const FOLDER_ICONS = [
  'folder', 'file-text', 'briefcase', 'home',
  'zap', 'lightbulb', 'palette', 'book',
  'microscope', 'target', 'heart', 'tag',
  'archive', 'inbox', 'code', 'users',
  'rocket', 'bookmark', 'wrench', 'layers',
];
const FOLDER_COLORS = [
  '#7c3aed', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
  '#3b82f6', '#d946ef', '#f97316', '#06b6d4',
  '#84cc16', '#0891b2', '#7c2d12', '#831843',
  '#4c0519', '#3730a3', '#1e40af', '#0d9488',
];

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
  language, folders, selectedFolderId, noteCount, recentNotes, allNotes, onSelectNote,
  onSelectFolder, onCreateFolder, onUpdateFolder, onDeleteFolder,
  onOpenSettings, onLock, searchQuery, onSearch, onMoveNote, getAvailableColors,
  openedHistory = {}, recentClearedAt = 0, onClearRecent,
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
  const [recentTab, setRecentTab] = useState<'edited' | 'opened' | 'created'>('edited');
  const [clearConfirm, setClearConfirm] = useState(false);
  const recentBtnRef = useRef<HTMLButtonElement>(null);
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  const inputMenu = useInputContextMenu(language);

  const [isNoteDragging, setIsNoteDragging] = useState(false);
  const [activeDropTargetId, setActiveDropTargetId] = useState<string | null | 'all'>(null);

  // Global drag listeners to activate target drop indicators
  useEffect(() => {
    const handleDragStart = (e: DragEvent) => {
      setIsNoteDragging(true);
    };
    const handleDragEnd = () => {
      setIsNoteDragging(false);
      setActiveDropTargetId(null);
    };

    window.addEventListener('dragstart', handleDragStart);
    window.addEventListener('dragend', handleDragEnd);
    window.addEventListener('drop', handleDragEnd);

    return () => {
      window.removeEventListener('dragstart', handleDragStart);
      window.removeEventListener('dragend', handleDragEnd);
      window.removeEventListener('drop', handleDragEnd);
    };
  }, []);

  useEffect(() => {
    if (showNewFolder) setTimeout(() => newFolderInputRef.current?.focus(), 50);
  }, [showNewFolder]);

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

  // Lista de notas recientes según la pestaña activa (Editadas / Abiertas / Creadas)
  const RECENT_LIMIT = 6;
  const recentForTab = (() => {
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
  })();

  const recentTabs: { id: 'edited' | 'opened' | 'created'; label: string }[] = [
    { id: 'edited', label: t.sidebar.recentEdited },
    { id: 'opened', label: t.sidebar.recentOpened },
    { id: 'created', label: t.sidebar.recentCreated },
  ];

  return (
    <div className="glass-effect sidebar-glass" data-leave-guard="nav" style={{
      width: 'var(--sidebar-width)',
      background: 'var(--bg-sidebar)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* Search */}
      <div style={{ padding: '12px 12px 8px' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{
            position: 'absolute', left: 10, top: '50%',
            transform: 'translateY(-50%)', color: 'var(--text-muted)',
            pointerEvents: 'none',
          }} />
          <input
            type="text"
            value={searchQuery}
            onChange={e => onSearch(e.target.value)}
            placeholder={t.general.search}
            className="input"
            onContextMenu={inputMenu.onContextMenu}
            style={{ paddingLeft: 32, paddingRight: searchQuery ? 30 : 12, fontSize: 'calc(12px * var(--ui-scale))', padding: '7px 10px 7px 32px' }}
          />
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

      <div className="divider" />

      {/* Nav */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
        {/* Todas las notas */}
        <motion.button
          onClick={() => onSelectFolder(null)}
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (activeDropTargetId !== 'all') {
              setActiveDropTargetId('all');
            }
          }}
          onDragLeave={() => setActiveDropTargetId(null)}
          onDrop={e => {
            e.preventDefault();
            const noteId = e.dataTransfer.getData('text/plain');
            setActiveDropTargetId(null);
            setIsNoteDragging(false);
            if (noteId) {
              setTimeout(() => {
                onMoveNote(noteId, null);
              }, 50);
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
                : '1px dashed rgba(124, 90, 237, 0.4)'
              : '1px solid transparent',
            background: activeDropTargetId === 'all'
              ? 'var(--accent-dim)'
              : selectedFolderId === null && !searchQuery
                ? 'var(--bg-active)'
                : 'transparent',
            color: activeDropTargetId === 'all'
              ? 'var(--accent-light)'
              : selectedFolderId === null && !searchQuery
                ? 'var(--accent-light)'
                : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'calc(13px * var(--ui-scale))',
            fontWeight: (selectedFolderId === null && !searchQuery) || activeDropTargetId === 'all' ? 600 : 400,
            textAlign: 'left',
            transition: 'all 0.12s ease-out',
            marginBottom: 4,
            position: 'relative',
            boxShadow: selectedFolderId === null && !searchQuery
              ? '0 0 12px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.01), inset 0 1px 0 rgba(255,255,255,0.02)'
              : 'none',
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
          <span style={{
            fontSize: 'calc(11px * var(--ui-scale))',
            background: 'var(--bg-surface)',
            color: 'var(--text-muted)',
            padding: '1px 6px',
            borderRadius: 10,
            pointerEvents: 'none',
          }}>{noteCount}</span>
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
          <span style={{
            fontSize: 'calc(11px * var(--ui-scale))',
            background: 'var(--bg-surface)',
            color: 'var(--text-muted)',
            padding: '1px 6px',
            borderRadius: 10,
            pointerEvents: 'none',
          }}>{allNotes.filter(n => n.pinned === 1).length}</span>
        </motion.button>

        {/* Sin carpeta / Unfiled */}
        <motion.button
          onClick={() => onSelectFolder('floating')}
          onDragOver={e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (activeDropTargetId !== 'floating') {
              setActiveDropTargetId('floating');
            }
          }}
          onDragLeave={() => setActiveDropTargetId(null)}
          onDrop={e => {
            e.preventDefault();
            const noteId = e.dataTransfer.getData('text/plain');
            setActiveDropTargetId(null);
            setIsNoteDragging(false);
            if (noteId) {
              setTimeout(() => {
                onMoveNote(noteId, null);
              }, 50);
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
                : '1px dashed var(--accent)'
              : '1px solid transparent',
            background: activeDropTargetId === 'floating'
              ? 'var(--accent-dim)'
              : selectedFolderId === 'floating' && !searchQuery
                ? 'var(--bg-active)'
                : 'transparent',
            color: activeDropTargetId === 'floating'
              ? 'var(--accent-light)'
              : selectedFolderId === 'floating' && !searchQuery
                ? 'var(--accent-light)'
                : 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: 'calc(13px * var(--ui-scale))',
            fontWeight: (selectedFolderId === 'floating' && !searchQuery) || activeDropTargetId === 'floating' ? 600 : 400,
            textAlign: 'left',
            transition: 'all 0.12s ease-out',
            marginBottom: 4,
            position: 'relative',
            boxShadow: selectedFolderId === 'floating' && !searchQuery
              ? '0 0 12px var(--accent-glow), inset 0 0 4px rgba(255,255,255,0.01), inset 0 1px 0 rgba(255,255,255,0.02)'
              : 'none',
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
            <Cloud size={15} />
          </motion.span>
          <span style={{ flex: 1, pointerEvents: 'none' }}>{t.sidebar.floatingNotes}</span>
          <span style={{
            fontSize: 'calc(11px * var(--ui-scale))',
            background: 'var(--bg-surface)',
            color: 'var(--text-muted)',
            padding: '1px 6px',
            borderRadius: 10,
            pointerEvents: 'none',
          }}>{allNotes.filter(n => !n.folder_id).length}</span>
        </motion.button>

        {/* Separator */}
        <div style={{
          fontSize: 'calc(10px * var(--ui-scale))',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: 1,
          padding: '12px 10px 6px',
        }}>
          {t.sidebar.folders}
        </div>

        {/* Lista de folders */}
        {folders.map(folder => {
          const isTarget = activeDropTargetId === folder.id;
          const isSelected = selectedFolderId === folder.id;
          return (
            <motion.button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              onContextMenu={e => handleContextMenu(e, folder)}
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (activeDropTargetId !== folder.id) {
                  setActiveDropTargetId(folder.id);
                }
              }}
              onDragLeave={() => setActiveDropTargetId(null)}
              onDrop={e => {
                e.preventDefault();
                const noteId = e.dataTransfer.getData('text/plain');
                setActiveDropTargetId(null);
                setIsNoteDragging(false);
                if (noteId) {
                  setTimeout(() => {
                    onMoveNote(noteId, folder.id);
                  }, 50);
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
                    ? `1px solid ${folder.color}`
                    : `1px dashed ${folder.color}55`
                  : '1px solid transparent',
                background: isTarget
                  ? `${folder.color}22`
                  : isSelected
                    ? 'var(--bg-active)'
                    : 'transparent',
                color: isTarget
                  ? '#fff'
                  : isSelected
                    ? 'var(--text-primary)'
                    : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 'calc(13px * var(--ui-scale))',
                fontWeight: isSelected || isTarget ? 600 : 400,
                textAlign: 'left',
                transition: 'all 0.12s ease-out',
                marginBottom: 4,
                position: 'relative',
                boxShadow: isTarget
                  ? `0 0 12px ${folder.color}44, inset 0 0 6px ${folder.color}22`
                  : isSelected
                    ? `0 0 14px ${folder.color}18, inset 0 0 4px ${folder.color}0a, inset 0 1px 0 rgba(255,255,255,0.01)`
                    : 'none',
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
                background: isSelected ? `${folder.color}33` : `${folder.color}22`,
                color: '#fff',
                padding: '1px 6px',
                borderRadius: 10,
                marginRight: 6,
                fontWeight: isSelected ? 600 : 400,
                pointerEvents: 'none',
                boxShadow: `0 0 6px ${folder.color}44, inset 0 1px 0 rgba(255,255,255,0.1)`,
              }}>{allNotes.filter(n => n.folder_id === folder.id).length}</span>
              <ChevronRight size={12} style={{ opacity: isTarget ? 0.8 : 0.4, color: isTarget ? folder.color : undefined, pointerEvents: 'none' }} />
            </motion.button>
          );
        })}

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
      </div>

      {/* Bottom actions */}
      <div className="divider" />
      <div style={{ padding: '8px', display: 'flex', gap: 4, justifyContent: 'space-between' }}>
        <Tooltip placement="top" label={language === 'es' ? 'Notas recientes' : 'Recent notes'}>
        <button
          ref={recentBtnRef}
          className="btn btn-ghost"
          onClick={(e) => { e.stopPropagation(); setShowRecent(prev => !prev); setClearConfirm(false); }}
          style={{ padding: '7px 10px' }}
        >
          <Clock size={14} />
        </button>
        </Tooltip>
        <button
          className="btn btn-ghost"
          onClick={onOpenSettings}
          style={{ flex: 1, fontSize: 'calc(12px * var(--ui-scale))', padding: '7px', gap: 6 }}
        >
          <Settings size={14} />
          {t.settings.title.replace('⚙️ ', '')}
        </button>
        <Tooltip placement="top" label={language === 'es' ? 'Bloquear app' : 'Lock app'}>
        <button
          className="btn btn-ghost"
          onClick={onLock}
          style={{ padding: '7px 10px' }}
        >
          <Lock size={14} />
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

          {/* Lista de notas (altura fija para 6 elementos) */}
          <div style={{ minHeight: 312, maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
            {recentForTab.length === 0 ? (
              <div style={{ fontSize: 15.5, color: 'var(--text-muted)', padding: '40px 10px', textAlign: 'center' }}>
                {t.noteList.noNotes}
              </div>
            ) : (
              recentForTab.map(({ note, ts }, i) => (
                <div key={note.id}>
                  {i > 0 && <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />}
                  <button
                    onClick={() => { onSelectNote(note.id); setShowRecent(false); }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: 3,
                      padding: '10px 14px',
                      fontSize: 15,
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
                      fontWeight: 500,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      width: '100%',
                    }}>
                      {note.title || t.noteList.unnamedNote}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'flex-end' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                        {timeAgo(ts, language)}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', opacity: 0.75 }}>
                        {new Date(ts).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Pestañas inferiores: Editadas / Abiertas / Creadas */}
          <div style={{ display: 'flex', gap: 4, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
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
                    padding: '7px 4px',
                    fontSize: 13.5,
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
            <Pencil size={13} />
            {language === 'es' ? 'Editar' : 'Edit'}
          </button>
          <button
            className="btn btn-danger"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: 'calc(12px * var(--ui-scale))', padding: '6px 10px', gap: 8, marginTop: 2 }}
            onClick={() => {
              setFolderToDelete(contextMenu.folder);
              setContextMenu(null);
            }}
          >
            <Trash2 size={13} />
            {t.sidebar.context.delete}
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
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
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

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button className="btn btn-primary" onClick={handleCreateFolder} style={{ flex: 1 }}>{t.sidebar.create}</button>
              <button className="btn btn-ghost" onClick={() => setShowNewFolder(false)} style={{ flex: 1 }}>{t.general.cancel}</button>
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
        }}>
          <div style={{
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
              onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditingFolder(null); }}
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

            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary" onClick={handleSaveEdit} style={{ flex: 1 }}>{t.general.save}</button>
              <button className="btn btn-ghost" onClick={() => setEditingFolder(null)} style={{ flex: 1 }}>{t.general.cancel}</button>
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
          background: 'rgba(5, 5, 8, 0.7)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
          animation: 'fadeIn 0.2s ease-out',
        }}>
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            transition={{ type: 'spring', damping: 26, stiffness: 330 }}
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setFolderToDelete(null)}
                style={{ padding: '8px 16px', fontSize: 'calc(13px * var(--ui-scale))' }}
              >
                {t.general.cancel}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => {
                  onDeleteFolder(folderToDelete.id);
                  setFolderToDelete(null);
                }}
                style={{
                  padding: '8px 20px',
                  fontSize: 'calc(13px * var(--ui-scale))',
                  boxShadow: '0 0 12px rgba(239, 68, 68, 0.25)',
                }}
              >
                {language === 'es' ? 'Eliminar' : 'Delete'}
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
