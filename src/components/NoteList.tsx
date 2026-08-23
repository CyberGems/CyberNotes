import { useRef, useEffect, useState, useMemo, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Note, Folder } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import { Plus, Trash2, Star, Search, ArrowUpDown, ChevronDown, LayoutList, StretchHorizontal, FileText, Pencil, FolderInput } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useInputContextMenu } from '../hooks/useInputContextMenu';
import FolderIcon from './FolderIcon';
import Tooltip from './Tooltip';

interface Props {
  language: Language;
  notes: Note[];
  folders: Folder[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: string) => void;
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

type ViewMode = 'normal' | 'compact';

/** Altura de slot virtual = card + márgenes verticales del diseño original. */
const ROW_NORMAL = 112;  // ~104 card + 8 (margin 4+4)
const ROW_COMPACT = 58;  // ~52 card + 6 (margin 3+3)
const OVERSCAN = 8;

export default function NoteList({
  language, notes: initialNotes, folders, selectedNoteId, onSelectNote, onCreateNote,
  onDeleteNote, onTogglePin, onMoveNote, onRenameNote, selectedFolder, searchQuery, uiScale = 1,
}: Props) {
  const t = TRANSLATIONS[language];
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'alpha' | 'alpha-desc'>('updated');
  const [viewMode, setViewMode] = useState<ViewMode>('normal');
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, note: Note } | null>(null);
  const [isHovering, setIsHovering] = useState(false);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [renameTarget, setRenameTarget] = useState<Note | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const listRef = useRef<HTMLDivElement>(null);
  const inputMenu = useInputContextMenu(language);
  const folderMap = useMemo(() => {
    const m = new Map<string, Folder>();
    folders.forEach(f => m.set(f.id, f));
    return m;
  }, [folders]);

  // Cargar la densidad de la lista guardada (default: vista completa / 'normal')
  useEffect(() => {
    let active = true;
    window.cyberNotesAPI?.getSetting('note_list_view_mode').then(v => {
      if (active && (v === 'compact' || v === 'normal')) setViewMode(v);
    });
    return () => { active = false; };
  }, []);

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

  const rowHeight = Math.round((viewMode === 'compact' ? ROW_COMPACT : ROW_NORMAL) * (uiScale || 1));
  const totalHeight = sortedNotes.length * rowHeight;

  // Virtualización: solo montar filas visibles
  const { startIndex, endIndex, offsetY } = useMemo(() => {
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN);
    const visible = Math.ceil(viewportHeight / rowHeight) + OVERSCAN * 2;
    const end = Math.min(sortedNotes.length, start + visible);
    return { startIndex: start, endIndex: end, offsetY: start * rowHeight };
  }, [scrollTop, viewportHeight, rowHeight, sortedNotes.length]);

  const visibleNotes = useMemo(
    () => sortedNotes.slice(startIndex, endIndex),
    [sortedNotes, startIndex, endIndex]
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
  }, [sortedNotes.length, rowHeight]);

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
    <div className="glass-effect notelist-glass" data-leave-guard="nav" style={{
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
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{
            fontSize: 'calc(14px * var(--ui-scale))',
            fontWeight: 600,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 160,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {selectedFolder && !searchQuery && (
              <FolderIcon name={selectedFolder.icon} color={selectedFolder.color} size={16} />
            )}
            {getHeaderTitle()}
          </h2>
          <Tooltip placement="bottom" label={language === 'es' ? 'Nueva nota (Ctrl+N)' : 'New note (Ctrl+N)'}>
          <button
            className="new-note-btn"
            onClick={onCreateNote}
            style={{ fontSize: 'calc(12px * var(--ui-scale))' }}
          >
            <Plus size={14} />
            {language === 'es' ? 'Nueva nota' : 'New note'}
          </button>
          </Tooltip>
        </div>

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
                    borderRadius: 'var(--radius-sm)', padding: 4, zIndex: 101, width: 140,
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
        <div ref={listRef} style={{ height: '100%', overflowY: 'auto' }}>
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
              ) : (
                <div style={{ height: totalHeight, position: 'relative' }}>
                  <div style={{ transform: `translateY(${offsetY}px)` }}>
                    {visibleNotes.map(note => {
                      const folder = note.folder_id ? (folderMap.get(note.folder_id) ?? null) : null;
                      return (
                        <div
                          key={note.id}
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
                            onClick={() => onSelectNote(note.id)}
                            onDelete={() => setNoteToDelete(note)}
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
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 16px',
              borderRadius: 8,
              border: isHovering ? '1px solid var(--accent)' : '1px solid rgba(255, 255, 255, 0.16)',
              background: 'var(--bg-surface)',
              color: isHovering ? 'var(--accent-light)' : 'var(--text-secondary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: 12,
              whiteSpace: 'nowrap',
              animation: isHovering ? 'cyber-pill-pulse 3s ease-in-out infinite' : 'none',
              boxShadow: isHovering ? '0 0 1px var(--accent-glow)' : 'none',
              transition: 'border-color 0.2s, color 0.2s, box-shadow 0.2s',
            }}
            onMouseDown={(e) => e.preventDefault()}
          >
             +{hiddenCount} {language === 'es' ? 'más' : 'more'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cyber-pill-pulse {
          0%, 100% {
            border-color: var(--accent);
            box-shadow: 0 0 2px rgba(0, 240, 255, 0.06), inset 0 0 1px rgba(0, 240, 255, 0.03);
            filter: brightness(1);
          }
          33% {
            border-color: #ff007f;
            box-shadow: 0 0 2px rgba(255, 0, 127, 0.05), inset 0 0 1px rgba(255, 0, 127, 0.03);
            filter: brightness(1.02);
          }
          66% {
            border-color: #00f0ff;
            box-shadow: 0 0 2px rgba(0, 240, 255, 0.05), inset 0 0 1px rgba(0, 240, 255, 0.03);
            filter: brightness(1.02);
          }
        }
      `}</style>

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
          <button
            onClick={() => { setRenameTarget(contextMenu.note); setRenameInput(contextMenu.note.title); setContextMenu(null); }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Pencil size={13} style={{ flexShrink: 0 }} />
            <span>{language === 'es' ? 'Renombrar' : 'Rename'}</span>
          </button>
          <button
            onClick={() => { onTogglePin(contextMenu.note); setContextMenu(null); }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Star size={13} fill={contextMenu.note.pinned ? 'currentColor' : 'none'} color={contextMenu.note.pinned ? 'var(--accent-light)' : 'inherit'} style={{ flexShrink: 0 }} />
            <span>{contextMenu.note.pinned ? (language === 'es' ? 'Quitar de favoritos' : 'Remove from favorites') : (language === 'es' ? 'Marcar favorito' : 'Add to favorites')}</span>
          </button>

          {folders.length > 0 && (
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
                    {f.icon} <span className="truncate">{f.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
          <button
            onClick={() => {
              setNoteToDelete(contextMenu.note);
              setContextMenu(null);
            }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, color: 'var(--text-primary)', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Trash2 size={13} color="var(--danger)" style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <span>{t.general.delete}</span>
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
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setRenameTarget(null)}>{t.general.cancel}</button>
              <button className="btn btn-primary" onClick={() => {
                onRenameNote(renameTarget.id, renameInput);
                setRenameTarget(null);
              }}>{t.general.save}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Confirmar Eliminar Nota */}
      {noteToDelete && createPortal(
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000000,
          animation: 'fadeIn 0.2s ease-out'
        }} onClick={() => setNoteToDelete(null)}>
          <div style={{
            background: 'var(--bg-modal)', padding: '24px 32px', borderRadius: 'var(--radius-lg)',
            width: 380, display: 'flex', flexDirection: 'column', gap: 20, border: '1px solid var(--border)',
            boxShadow: '0 24px 48px rgba(0,0,0,0.6), 0 0 24px var(--accent-glow)',
            animation: 'modalScaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
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
                <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)', fontWeight: 700 }}>{language === 'es' ? '¿Eliminar esta nota?' : 'Delete this note?'}</h3>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{language === 'es' ? 'Esta acción no se puede deshacer.' : 'This action cannot be undone.'}</span>
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

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
              <button 
                className="btn btn-ghost" 
                onClick={() => setNoteToDelete(null)}
                style={{ padding: '8px 16px', fontWeight: 600 }}
              >
                {t.general.cancel}
              </button>
              <button 
                className="btn btn-danger" 
                onClick={() => {
                  onDeleteNote(noteToDelete.id);
                  setNoteToDelete(null);
                  setContextMenu(null);
                }}
                style={{ 
                  padding: '8px 16px', 
                  fontWeight: 600,
                  boxShadow: '0 0 16px var(--danger-dim)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Trash2 size={14} /> {t.general.delete}
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
  onClick: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

const NoteItem = memo(function NoteItem({ language, note, folder, viewMode, isSelected, isContextActive, onClick, onDelete, onContextMenu }: NoteItemProps) {
  const firstImage = viewMode === 'normal' ? (note.thumb || null) : null;
  const t = TRANSLATIONS[language];

  return (
    <div
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={true}
      onDragStart={e => {
        (e as any).dataTransfer.setData('text/plain', note.id);
        (e as any).dataTransfer.effectAllowed = 'move';
      }}
      style={{
        height: '100%',
        boxSizing: 'border-box',
        padding: viewMode === 'compact' ? 'calc(5px * var(--ui-scale)) calc(14px * var(--ui-scale))' : 'calc(9px * var(--ui-scale)) calc(14px * var(--ui-scale))',
        margin: '0 calc(12px * var(--ui-scale))',
        borderRadius: 'var(--radius-md)',
        background: isSelected || isContextActive ? 'var(--bg-active)' : 'rgba(255,255,255,0.01)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background var(--transition), border-color var(--transition)',
        border: isSelected || isContextActive ? '1px solid var(--accent)' : '1px solid var(--border)',
        boxShadow: isSelected || isContextActive ? '0 4px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.02)' : 'inset 0 1px 0 rgba(255,255,255,0.01)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
      className="note-item"
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
        <span>{formatDate(note.updated_at, language)}</span>
        {folder && (
          <Tooltip placement="bottom" label={language === 'es' ? `Carpeta: ${folder.name}` : `Folder: ${folder.name}`}>
          <span style={{
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
            boxShadow: 'none',
            textShadow: 'none',
            maxWidth: 120,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            transition: 'all 0.2s ease',
          }}
          >
            <FolderIcon name={folder.icon} color={folder.color} size={12} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {folder.name}
            </span>
          </span>
          </Tooltip>
        )}
      </div>

      <Tooltip placement="left" label={language === 'es' ? 'Eliminar nota' : 'Delete note'}>
        <button
          type="button"
          className="delete-note-btn"
          onClick={e => {
            e.stopPropagation();
            onDelete();
          }}
          aria-label={language === 'es' ? 'Eliminar nota' : 'Delete note'}
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
