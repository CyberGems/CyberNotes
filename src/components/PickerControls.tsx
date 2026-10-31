import { useRef } from 'react';
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

export function PickerTray({ language, kind, entries, fontFamily, onRemove, onClear, focusSearch }: {
  language: Language; kind: 'emoji' | 'symbol'; entries: readonly QueuedPickerItem[]; fontFamily: string;
  onRemove: (queueId: number) => void; onClear: () => void; focusSearch: () => void;
}) {
  const itemsRef = useRef<HTMLDivElement>(null);
  const es = language === 'es';
  return <section className="picker-tray" aria-label={kind === 'emoji'
    ? (es ? 'Bandeja de emojis' : 'Emoji tray') : (es ? 'Bandeja de símbolos' : 'Symbol tray')}>
    <div className="picker-tray-header">
      <span role="status">{es ? 'Preparados' : 'Queued'}: {entries.length}</span>
      <button type="button" className="picker-clear" disabled={!entries.length} onClick={() => { onClear(); focusSearch(); }}>
        {es ? 'Vaciar' : 'Clear'}
      </button>
    </div>
    <div ref={itemsRef} className="picker-tray-items">
      {entries.length ? entries.map((entry, index) => <button key={entry.queueId} type="button" className="picker-chip"
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
