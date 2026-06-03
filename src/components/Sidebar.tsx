import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import { Folder, Note } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import {
  Plus, FolderOpen, Settings, Lock, Search, X,
  ChevronRight, Pencil, Trash2, FileText, Clock, Cloud,
} from 'lucide-react';
import { useInputContextMenu } from '../hooks/useInputContextMenu';

interface Props {
  language: Language;
  folders: Folder[];
  selectedFolderId: string | null;
  noteCount: number;
  recentNotes: Note[];
  allNotes: Note[];
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
}

const FOLDER_ICONS = ['📁', '📝', '💼', '🏠', '🚀', '💡', '🎨', '📚', '🔬', '🎯', '❤️', '⭐'];
const FOLDER_COLORS = [
  '#7c3aed', '#06b6d4', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6',
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
  onOpenSettings, onLock, searchQuery, onSearch, onMoveNote,
}: Props) {
  const t = TRANSLATIONS[language];
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [newFolderIcon, setNewFolderIcon] = useState('📁');
  const [newFolderColor, setNewFolderColor] = useState('#7c3aed');
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [contextMenu, setContextMenu] = useState<{ folder: Folder; x: number; y: number } | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);
  const [showRecent, setShowRecent] = useState(false);
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
      }
    };
    setTimeout(() => document.addEventListener('click', handler), 0);
    return () => document.removeEventListener('click', handler);
  }, [showRecent]);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    onCreateFolder(newFolderName.trim(), newFolderIcon, newFolderColor);
    setNewFolderName('');
    setNewFolderIcon('📁');
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
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
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
              transition: { type: 'spring', stiffness: 400, damping: 18 }
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

        {/* Notas Sueltas / Floating Notes */}
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
                : '1px dashed rgba(6, 182, 212, 0.4)'
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
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
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
              transition: { type: 'spring', stiffness: 400, damping: 18 }
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
            style={{ display: 'inline-flex', alignItems: 'center', pointerEvents: 'none', color: '#06b6d4' }}
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
                transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
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
                  transition: { type: 'spring', stiffness: 400, damping: 18 }
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
                  fontSize: 'calc(15px * var(--ui-scale))',
                  display: 'inline-block',
                  marginRight: 2,
                  pointerEvents: 'none',
                }}
              >
                {folder.icon}
              </motion.span>
              <span className="truncate" style={{ 
                flex: 1,
                textShadow: isTarget ? `0 0 4px ${folder.color}aa` : 'none',
                color: isTarget ? '#fff' : undefined,
                pointerEvents: 'none',
              }}>{folder.name}</span>
              <span style={{
                fontSize: 'calc(11px * var(--ui-scale))',
                background: isSelected ? 'var(--bg-app)' : 'var(--bg-surface)',
                color: isSelected ? 'var(--accent-light)' : 'var(--text-muted)',
                padding: '1px 6px',
                borderRadius: 10,
                marginRight: 6,
                fontWeight: isSelected ? 600 : 400,
                pointerEvents: 'none',
                boxShadow: isSelected ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.01)',
              }}>{allNotes.filter(n => n.folder_id === folder.id).length}</span>
              <ChevronRight size={12} style={{ opacity: isTarget ? 0.8 : 0.4, color: isTarget ? folder.color : undefined, pointerEvents: 'none' }} />
            </motion.button>
          );
        })}

        {/* Nueva carpeta inline */}
        {showNewFolder && (
          <div style={{
            padding: '10px',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            marginTop: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>
            <input
              ref={newFolderInputRef}
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false); }}
              placeholder={t.sidebar.folderName}
              className="input"
              onContextMenu={inputMenu.onContextMenu}
              style={{ fontSize: 'calc(12px * var(--ui-scale))' }}
            />

            {/* Iconos */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {FOLDER_ICONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setNewFolderIcon(icon)}
                  style={{
                    border: newFolderIcon === icon ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: 'var(--bg-input)',
                    borderRadius: 6,
                    padding: '3px 6px',
                    cursor: 'pointer',
                    fontSize: 'calc(14px * var(--ui-scale))',
                  }}
                >{icon}</button>
              ))}
            </div>

            {/* Colores */}
            <div style={{ display: 'flex', gap: 6 }}>
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewFolderColor(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    background: c,
                    border: newFolderColor === c ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                    boxShadow: newFolderColor === c ? `0 0 6px ${c}` : 'none',
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-primary" onClick={handleCreateFolder} style={{ flex: 1, fontSize: 'calc(12px * var(--ui-scale))', padding: '6px' }}>
                {t.sidebar.create}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowNewFolder(false)} style={{ flex: 1, fontSize: 'calc(12px * var(--ui-scale))', padding: '6px' }}>
                {t.general.cancel}
              </button>
            </div>
          </div>
        )}

        {!showNewFolder && (
          <button
            className="btn btn-ghost"
            onClick={() => setShowNewFolder(true)}
            style={{ width: '100%', justifyContent: 'flex-start', marginTop: 4, fontSize: 'calc(12px * var(--ui-scale))', gap: 8, padding: '7px 10px' }}
          >
            <Plus size={14} />
            {t.sidebar.newFolder}
          </button>
        )}
      </div>

      {/* Bottom actions */}
      <div className="divider" />
      <div style={{ padding: '8px', display: 'flex', gap: 4, justifyContent: 'space-between' }}>
        <button
          ref={recentBtnRef}
          className="btn btn-ghost"
          onClick={(e) => { e.stopPropagation(); setShowRecent(prev => !prev); }}
          title={language === 'es' ? 'Notas recientes' : 'Recent notes'}
          style={{ padding: '7px 10px' }}
        >
          <Clock size={14} />
        </button>
        <button
          className="btn btn-ghost"
          onClick={onOpenSettings}
          style={{ flex: 1, fontSize: 'calc(12px * var(--ui-scale))', padding: '7px', gap: 6 }}
        >
          <Settings size={14} />
          {t.settings.title.replace('⚙️ ', '')}
        </button>
        <button
          className="btn btn-ghost"
          onClick={onLock}
          title={language === 'es' ? 'Bloquear app' : 'Lock app'}
          style={{ padding: '7px 10px' }}
        >
          <Lock size={14} />
        </button>
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
            width: 312,
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
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', padding: '8px 10px 6px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {language === 'es' ? 'Últimas notas' : 'Last notes'}
          </div>
          {recentNotes.length === 0 ? (
            <div style={{ fontSize: 15.5, color: 'var(--text-muted)', padding: '16px 10px', textAlign: 'center' }}>
              {t.noteList.noNotes}
            </div>
          ) : (
            recentNotes.map((note, i) => (
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
                      {timeAgo(note.updated_at, language)}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--text-muted)', opacity: 0.75 }}>
                      {new Date(note.updated_at).toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                </button>
              </div>
            ))
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

      {/* Edit folder modal */}
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
            width: 340,
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

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {FOLDER_ICONS.map(icon => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setEditingFolder({ ...editingFolder, icon })}
                  style={{
                    border: editingFolder.icon === icon ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: 'var(--bg-input)',
                    borderRadius: 6,
                    padding: '3px 6px',
                    cursor: 'pointer',
                    fontSize: 'calc(14px * var(--ui-scale))',
                  }}
                >{icon}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setEditingFolder({ ...editingFolder, color: c })}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: '50%',
                    background: c,
                    border: editingFolder.color === c ? '2px solid white' : '2px solid transparent',
                    cursor: 'pointer',
                    boxShadow: editingFolder.color === c ? `0 0 8px ${c}` : 'none',
                  }}
                />
              ))}
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
