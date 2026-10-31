import { useRef, useState } from 'react';
import { ListPlus, X } from 'lucide-react';
import type { Language } from '../languages';
import NativeGlyph from './NativeGlyph';

export interface QueuedPickerItem { queueId: number; value: string; es: string; en: string; }

export function PickerModeButton({ language, active, count, onToggle }: {
  language: Language; active: boolean; count: number; onToggle: () => void;
}) {
  return <button type="button" className={`picker-mode${active ? ' is-active' : ''}`} aria-pressed={active} onClick={onToggle}>
    <ListPlus size={15} aria-hidden="true" />
    <span>{language === 'es' ? 'Varios' : 'Multiple'}</span>
    {count > 0 && <span className="picker-mode-count">{count}</span>}
  </button>;
}

export function PickerTray({ language, kind, entries, fontFamily, onRemove, onReorder, onClear, focusSearch }: {
  language: Language; kind: 'emoji' | 'symbol'; entries: readonly QueuedPickerItem[]; fontFamily: string;
  onRemove: (queueId: number) => void; onReorder: (sourceId: number, targetId: number | null, after: boolean) => void; onClear: () => void; focusSearch: () => void;
}) {
  const itemsRef = useRef<HTMLDivElement>(null);
  const draggedId = useRef<number | null>(null);
  const [dropHint, setDropHint] = useState<{ id: number | null; after: boolean } | null>(null);
  const resetDrag = () => { draggedId.current = null; setDropHint(null); };
  const es = language === 'es';
  return <section className="picker-tray" aria-label={kind === 'emoji'
    ? (es ? 'Bandeja de emojis' : 'Emoji tray') : (es ? 'Bandeja de símbolos' : 'Symbol tray')}>
    <div className="picker-tray-header">
      <span role="status">{es ? 'Preparados' : 'Queued'}: {entries.length}</span>
      <button type="button" className="picker-clear" disabled={!entries.length} onClick={() => { onClear(); focusSearch(); }}>
        {es ? 'Vaciar' : 'Clear'}
      </button>
    </div>
    {entries.length > 0 && <p className="picker-tray-hint">{es
      ? 'Arrastra para reordenar. Clic para quitar.' : 'Drag to reorder. Click to remove.'}</p>}
    <div ref={itemsRef} className={`picker-tray-items${dropHint?.id === null ? ' drop-at-end' : ''}`}
      onDragOver={event => {
        if (draggedId.current === null || event.target !== event.currentTarget) return;
        event.preventDefault(); event.dataTransfer.dropEffect = 'move';
        setDropHint({ id: null, after: true });
      }}
      onDragLeave={event => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropHint(null);
      }}
      onDrop={event => {
        if (draggedId.current === null) return;
        event.preventDefault();
        onReorder(draggedId.current, null, true); resetDrag();
      }}>
      {entries.length ? entries.map((entry, index) => <button key={entry.queueId} type="button"
        className={`picker-chip${dropHint?.id === entry.queueId ? (dropHint.after ? ' drop-after' : ' drop-before') : ''}`}
        draggable
        onDragStart={event => {
          draggedId.current = entry.queueId;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('application/x-cybernotes-picker-item', String(entry.queueId));
        }}
        onDragOver={event => {
          if (draggedId.current === null) return;
          event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'move';
          const rect = event.currentTarget.getBoundingClientRect();
          setDropHint({ id: entry.queueId, after: event.clientX >= rect.left + rect.width / 2 });
        }}
        onDrop={event => {
          if (draggedId.current === null) return;
          event.preventDefault(); event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          onReorder(draggedId.current, entry.queueId, event.clientX >= rect.left + rect.width / 2);
          resetDrag();
        }}
        onDragEnd={resetDrag}
        onKeyDown={event => {
          if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault();
          const after = event.key === 'ArrowRight';
          const target = entries[index + (after ? 1 : -1)];
          if (target) onReorder(entry.queueId, target.queueId, after);
        }}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        aria-label={es ? `Quitar ${entry.es}, posición ${index + 1}` : `Remove ${entry.en}, position ${index + 1}`}
        onClick={() => {
          onRemove(entry.queueId);
          requestAnimationFrame(() => {
            const buttons = itemsRef.current?.querySelectorAll<HTMLButtonElement>('.picker-chip');
            const next = buttons?.[Math.min(index, buttons.length - 1)];
            if (next) next.focus({ preventScroll: true }); else focusSearch();
          });
        }}>
        <NativeGlyph value={entry.value} fontFamily={fontFamily} />
        <X size={12} aria-hidden="true" />
      </button>) : <span className="picker-tray-empty">{kind === 'emoji'
        ? (es ? 'Elige emojis para preparar tu grupo. Puedes repetirlos.' : 'Choose emojis for your group. You can repeat emojis.')
        : (es ? 'Elige símbolos para preparar tu grupo. Puedes repetirlos.' : 'Choose symbols for your group. You can repeat symbols.')}</span>}
    </div>
  </section>;
}

export function reorderPickerEntries<T extends QueuedPickerItem>(entries: T[], sourceId: number, targetId: number | null, after: boolean): T[] {
  const source = entries.find(entry => entry.queueId === sourceId);
  if (!source || sourceId === targetId || (targetId !== null && !entries.some(entry => entry.queueId === targetId))) return entries;
  const next = entries.filter(entry => entry.queueId !== sourceId);
  const index = targetId === null ? next.length : next.findIndex(entry => entry.queueId === targetId) + (after ? 1 : 0);
  next.splice(index, 0, source);
  return next;
}
