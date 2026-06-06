import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Note, Folder } from '../types';
import { Language, TRANSLATIONS } from '../languages';
import { Plus, Trash2, Pin, Search, ArrowUpDown, ChevronDown, LayoutList, StretchHorizontal } from 'lucide-react';
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

function extractFirstImage(content: string | null): string | null {
  if (!content || typeof content !== 'string') return null;
  
  // Si parece JSON (notas antiguas), buscar en el árbol
  if (content.trim().startsWith('{')) {
    try {
      const doc = JSON.parse(content);
      let foundSrc: string | null = null;
      const walk = (node: any) => {
        if (foundSrc) return;
        if (node.type === 'image' && node.attrs && node.attrs.src) {
          foundSrc = node.attrs.src;
        }
        if (node.content && Array.isArray(node.content)) {
          node.content.forEach(walk);
        }
      };
      if (doc.content && Array.isArray(doc.content)) {
        doc.content.forEach(walk);
      }
      if (foundSrc) return foundSrc;
    } catch (e) {
      // Si falla, intentamos procesarlo como HTML por si acaso
    }
  }

  // Usar un parser real en lugar de regex para máxima fiabilidad con HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(content, 'text/html');
  const img = doc.querySelector('img');
  
  if (!img) return null;
  
  return img.getAttribute('src');
}

type ViewMode = 'normal' | 'compact';

export default function NoteList({
  language, notes: initialNotes, folders, selectedNoteId, onSelectNote, onCreateNote,
  onDeleteNote, onTogglePin, onMoveNote, onRenameNote, selectedFolder, searchQuery,
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
  const listRef = useRef<HTMLDivElement>(null);
  const inputMenu = useInputContextMenu(language);

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
  const sortedNotes = [...initialNotes].sort((a, b) => {
    if (a.pinned !== b.pinned) return b.pinned - a.pinned;
    if (sortBy === 'updated') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    if (sortBy === 'created') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (sortBy === 'alpha') return a.title.localeCompare(b.title);
    return b.title.localeCompare(a.title);
  });

  // Calcular notas ocultas debajo del scroll
  useEffect(() => {
    const el = listRef.current;
    if (!el || sortedNotes.length === 0) return;
    const update = () => {
      let remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining > 10) {
        let ratio = remaining / el.scrollHeight;
        let hidden = Math.max(1, Math.round(ratio * sortedNotes.length));
        setHiddenCount(Math.min(hidden, sortedNotes.length));
      } else {
        setHiddenCount(0);
      }
    };
    update();
    el.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [sortedNotes.length]);

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
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}
            >
              {sortedNotes.length === 0 ? (
                <div style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', flex: 1, minHeight: 200, gap: 12, color: 'var(--text-muted)',
                }}>
                  {searchQuery
                    ? <><Search size={32} opacity={0.4} /><span style={{ fontSize: 13 }}>{language === 'es' ? 'No se encontraron resultados' : 'No results found'}</span></>
                    : <><span style={{ fontSize: 32, opacity: 0.3 }}>📝</span><span style={{ fontSize: 13 }}>{t.noteList.noNotes}</span></>
                  }
                </div>
              ) : (
                sortedNotes.map(note => {
                  const folder = folders.find(f => f.id === note.folder_id) ?? null;
                  return (
                    <NoteItem
                      key={note.id}
                      language={language}
                      note={note}
                      folder={folder}
                      viewMode={viewMode}
                      isSelected={note.id === selectedNoteId}
                      onClick={() => onSelectNote(note.id)}
                      onDelete={() => setNoteToDelete(note)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        let safeX = e.clientX;
                        let safeY = e.clientY;
                        // Evitar desborde por la derecha (menú mide ~140px)
                        if (safeX + 160 > window.innerWidth) safeX = window.innerWidth - 160;
                        // Evitar desborde por abajo (menú mide ~250px)
                        if (safeY + 250 > window.innerHeight) safeY = window.innerHeight - 250;
                        setContextMenu({ x: safeX, y: safeY, note });
                      }}
                    />
                  );
                })
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
            onClick={() => onSelectNote(contextMenu.note.id)}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {language === 'es' ? 'Abrir nota' : 'Open note'}
          </button>
          <button
            onClick={() => { setRenameTarget(contextMenu.note); setRenameInput(contextMenu.note.title); setContextMenu(null); }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {language === 'es' ? 'Renombrar' : 'Rename'}
          </button>
          <button
            onClick={() => onTogglePin(contextMenu.note)}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, background: 'transparent', color: 'var(--text-primary)', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {contextMenu.note.pinned ? (language === 'es' ? 'Desfijar' : 'Unpin') : (language === 'es' ? 'Fijar' : 'Pin')}
          </button>

          {folders.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
              <div style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{language === 'es' ? 'Mover a...' : 'Move to...'}</div>
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
            }}
            style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, color: 'var(--danger)', background: 'transparent', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {t.general.delete}
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
  folder: Folder | null;
  viewMode: ViewMode;
  isSelected: boolean;
  onClick: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

function NoteItem({ language, note, folder, viewMode, isSelected, onClick, onDelete, onContextMenu }: NoteItemProps) {
  const firstImage = viewMode === 'normal' ? extractFirstImage(note.content) : null;
  const t = TRANSLATIONS[language];

  return (
    <motion.div
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={true}
      onDragStart={e => {
        (e as any).dataTransfer.setData('text/plain', note.id);
        (e as any).dataTransfer.effectAllowed = 'move';
      }}
      whileHover="hover"
      whileTap="tap"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2 }}
      style={{
        padding: viewMode === 'compact' ? '5px 14px' : '10px 14px',
        margin: viewMode === 'compact' ? '3px 12px' : '4px 12px',
        borderRadius: 'var(--radius-md)',
        background: isSelected ? 'var(--bg-active)' : 'rgba(255,255,255,0.01)',
        cursor: 'pointer',
        position: 'relative',
        transition: 'background var(--transition), border-color var(--transition)',
        border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
        boxShadow: isSelected ? '0 4px 14px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.02)' : 'inset 0 1px 0 rgba(255,255,255,0.01)',
      }}
      variants={{
        hover: {
          scale: 1.015,
          background: isSelected ? 'var(--bg-active)' : 'var(--bg-hover)',
          borderColor: isSelected ? 'var(--accent)' : 'rgba(255, 255, 255, 0.12)',
          boxShadow: isSelected ? '0 6px 18px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.03)' : '0 4px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.02)',
          transition: { type: 'spring', stiffness: 400, damping: 20 }
        },
        tap: {
          scale: 0.985,
          transition: { duration: 0.1 }
        }
      }}
      className="note-item"
    >
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: viewMode === 'compact' ? 2 : 4 }}>
            {note.pinned === 1 && <Pin size={11} color="var(--accent)" style={{ flexShrink: 0 }} />}
            <span style={{
              fontSize: 'calc(13px * var(--ui-scale))',
              fontWeight: 600,
              color: 'var(--text-primary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
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
              lineHeight: 1.45,
              marginBottom: 0,
              maxHeight: '2.9em',
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
        marginTop: viewMode === 'compact' ? 3 : 8,
        gap: 8,
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
            letterSpacing: '0.03em',
            color: 'rgba(255, 255, 255, 0.92)',
            textShadow: folder.color ? `0 0 2px ${folder.color}aa` : 'none',
            border: folder.color ? `1px solid ${folder.color}66` : '1px solid var(--border)',
            background: folder.color ? `${folder.color}18` : 'var(--bg-surface)',
            boxShadow: folder.color ? `0 0 8px ${folder.color}22` : 'none',
            backdropFilter: 'blur(4px)',
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

      <button
        className="delete-note-btn"
        onClick={e => {
          e.stopPropagation();
          onDelete();
        }}
        style={{
          position: 'absolute',
          right: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'rgba(20, 20, 25, 0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid var(--border)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          opacity: 0,
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 28,
          height: 28,
          borderRadius: '50%',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
          zIndex: 5,
        }}
      >
        <Trash2 size={14} />
      </button>

      <style>{`
        .note-item:hover .delete-note-btn { opacity: 1 !important; }
        .note-item:hover .delete-note-btn:hover { 
          color: #ff4d4d !important; 
          background: rgba(239, 68, 68, 0.2) !important;
          border-color: rgba(239, 68, 68, 0.4) !important;
          box-shadow: 0 0 12px rgba(239, 68, 68, 0.35) !important;
          transform: translateY(-50%) scale(1.08) !important;
        }
      `}</style>
    </motion.div>
  );
}

