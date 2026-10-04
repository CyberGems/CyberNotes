import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion } from 'motion/react';
import type { Editor } from '@tiptap/react';
import { Check, Copy, Pin, Plus, Search, Smile, X } from 'lucide-react';
import type { Language } from '../languages';
import emojiCatalogJson from '../data/emoji-catalog.json';
import emojiComponentsJson from '../data/emoji-components.json';
import { EnterGlyph, KeyHint, modalCardMotion, modalOverlayMotion, modalOverlayStyle, useModalKeys } from './ModalActions';
import Tooltip from './Tooltip';

type EmojiGroup = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type EmojiFilter = 'all' | 'recent' | EmojiGroup;
type EmojiTuple = [string, string, string, number, string];
interface EmojiEntry { value: string; es: string; en: string; group: EmojiGroup; search: string; normalizedSearch: string; }
interface EmojiCatalog { entries: EmojiTuple[]; }

const EMOJI_GROUPS: { id: EmojiGroup; es: string; en: string }[] = [
  { id: 0, es: 'Caras y emociones', en: 'Smileys & emotion' },
  { id: 1, es: 'Personas y cuerpo', en: 'People & body' },
  { id: 2, es: 'Animales y naturaleza', en: 'Animals & nature' },
  { id: 3, es: 'Comida y bebida', en: 'Food & drink' },
  { id: 4, es: 'Viajes y lugares', en: 'Travel & places' },
  { id: 5, es: 'Actividades', en: 'Activities' },
  { id: 6, es: 'Objetos', en: 'Objects' },
  { id: 7, es: 'Símbolos', en: 'Symbols' },
  { id: 8, es: 'Banderas', en: 'Flags' },
];
const EMOJI_CATALOG_ENTRIES = [
  ...(emojiCatalogJson as unknown as EmojiCatalog).entries,
  ...(emojiComponentsJson as unknown as EmojiCatalog).entries,
];
const EMOJI_ENTRIES: EmojiEntry[] = EMOJI_CATALOG_ENTRIES.map(([value, es, en, group, search]) => {
  const searchText = `${value} ${es} ${en} ${search} ${codePointLabel(value)}`;
  return { value, es, en, group: group as EmojiGroup, search, normalizedSearch: normalizeSearch(searchText) };
});
const EMOJI_BY_VALUE = new Map(EMOJI_ENTRIES.map(entry => [entry.value, entry]));
const RECENT_STORAGE_KEY = 'cybernotes-emoji-picker-recents-v1';
const VIEW_SESSION_KEY = 'cybernotes-emoji-picker-view-v1';
const EMOJI_FILTERS = new Set<EmojiFilter>(['all', 'recent', ...EMOJI_GROUPS.map(group => group.id)]);

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function codePointLabel(value: string): string {
  return Array.from(value)
    .map(character => `U+${(character.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' · ');
}

function readViewState(): { category: EmojiFilter; scrollTop: Partial<Record<EmojiFilter, number>> } {
  try {
    const stored: unknown = JSON.parse(sessionStorage.getItem(VIEW_SESSION_KEY) || 'null');
    if (!stored || typeof stored !== 'object') return { category: 'all', scrollTop: {} };
    const state = stored as { category?: unknown; scrollTop?: unknown };
    const scrollTop: Partial<Record<EmojiFilter, number>> = {};
    if (state.scrollTop && typeof state.scrollTop === 'object') {
      for (const [filter, value] of Object.entries(state.scrollTop)) {
        const parsedFilter: EmojiFilter = filter === 'all' || filter === 'recent' ? filter : Number(filter) as EmojiGroup;
        if (EMOJI_FILTERS.has(parsedFilter) && typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          scrollTop[parsedFilter] = value;
        }
      }
    }
    return { category: EMOJI_FILTERS.has(state.category as EmojiFilter) ? state.category as EmojiFilter : 'all', scrollTop };
  } catch {
    return { category: 'all', scrollTop: {} };
  }
}

export default function EmojiPickerModal({ editor, language, uiScale, onClose }: {
  editor: Editor;
  language: Language;
  uiScale: number;
  onClose: () => void;
}) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ensureActiveVisibleRef = useRef(false);
  const insertionRangeRef = useRef({ from: editor.state.selection.from, to: editor.state.selection.to });
  const [initialViewState] = useState(readViewState);
  const scrollTopRef = useRef(initialViewState.scrollTop);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<EmojiFilter>(initialViewState.category);
  const [activeIndex, setActiveIndex] = useState(0);
  const [gridMetrics, setGridMetrics] = useState({ columns: 8, rowStep: 57, rowGap: 5, viewportHeight: 0, scrollTop: 0 });
  const gridMetricsRef = useRef(gridMetrics);
  gridMetricsRef.current = gridMetrics;
  const [selected, setSelected] = useState<EmojiEntry | null>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [batchEmojis, setBatchEmojis] = useState('');
  const [batchEntries, setBatchEntries] = useState<EmojiEntry[]>([]);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [recentEmojis, setRecentEmojis] = useState<string[]>(() => {
    try {
      const stored: unknown = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string').slice(0, 32) : [];
    } catch {
      return [];
    }
  });
  const isSpanish = language === 'es';
  const persistViewState = useCallback((nextCategory: EmojiFilter, nextScrollTop: Partial<Record<EmojiFilter, number>>) => {
    try { sessionStorage.setItem(VIEW_SESSION_KEY, JSON.stringify({ category: nextCategory, scrollTop: nextScrollTop })); } catch { /* session storage opcional */ }
  }, []);

  const filteredEntries = useMemo(() => {
    const source = category === 'recent'
      ? recentEmojis.map(value => EMOJI_BY_VALUE.get(value)).filter((entry): entry is EmojiEntry => Boolean(entry))
      : EMOJI_ENTRIES.filter(entry => category === 'all' || entry.group === category);
    const normalizedQuery = normalizeSearch(query.trim());
    return normalizedQuery
      ? source.filter(entry => entry.normalizedSearch.includes(normalizedQuery))
      : source;
  }, [category, query, recentEmojis]);

  const rememberEmoji = useCallback((value: string) => {
    setRecentEmojis(current => {
      const next = [value, ...current.filter(item => item !== value)].slice(0, 32);
      try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage opcional */ }
      return next;
    });
  }, []);

  const close = useCallback(() => {
    if (!query && gridRef.current) scrollTopRef.current[category] = gridRef.current.scrollTop;
    persistViewState(category, scrollTopRef.current);
    onClose();
    requestAnimationFrame(() => { if (!editor.isDestroyed) editor.commands.focus(); });
  }, [category, editor, onClose, persistViewState, query]);

  const insertText = useCallback((text: string) => {
    if (editor.isDestroyed) return false;
    const maxPos = editor.state.doc.content.size;
    const from = Math.max(0, Math.min(insertionRangeRef.current.from, maxPos));
    const to = Math.max(from, Math.min(insertionRangeRef.current.to, maxPos));
    const inserted = editor.chain().focus().setTextSelection({ from, to }).insertContent({ type: 'text', text }).run();
    if (!inserted) return false;
    const cursor = editor.state.selection.from;
    insertionRangeRef.current = { from: cursor, to: cursor };
    return true;
  }, [editor]);

  const insertEmoji = useCallback((entry: EmojiEntry, closeAfter = false) => {
    if (!insertText(entry.value)) return;
    setSelected(entry);
    rememberEmoji(entry.value);
    if (closeAfter) close();
    else requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  }, [close, insertText, rememberEmoji]);

  const appendBatchEmoji = useCallback((entry: EmojiEntry) => {
    setBatchEmojis(current => current + entry.value);
    setBatchEntries(current => [...current, entry]);
    setCopyState('idle');
  }, []);

  const insertBatch = useCallback(() => {
    if (!batchEmojis || !insertText(batchEmojis)) return;
    if (batchEntries.map(entry => entry.value).join('') === batchEmojis) {
      batchEntries.forEach(entry => rememberEmoji(entry.value));
    }
    close();
  }, [batchEmojis, batchEntries, close, insertText, rememberEmoji]);

  const copyBatch = useCallback(async () => {
    if (!batchEmojis) return;
    try {
      await navigator.clipboard.writeText(batchEmojis);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  }, [batchEmojis]);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const updateMetrics = () => {
      const styles = window.getComputedStyle(grid);
      const scale = Number.parseFloat(styles.getPropertyValue('--ui-scale')) || 1;
      const rowHeight = 52 * scale;
      const rowGap = 5 * scale;
      const horizontalPadding = (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
      const contentWidth = Math.max(1, grid.clientWidth - horizontalPadding);
      const columns = Math.max(1, Math.floor((contentWidth + rowGap) / (50 * scale + rowGap)));
      setGridMetrics(current => ({ ...current, columns, rowGap, rowStep: rowHeight + rowGap, viewportHeight: grid.clientHeight }));
    };
    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (gridRef.current) {
      const scrollTop = query ? 0 : scrollTopRef.current[category] || 0;
      gridRef.current.scrollTop = scrollTop;
      setGridMetrics(current => ({ ...current, scrollTop }));
    }
  }, [category, query]);
  useEffect(() => {
    if (!ensureActiveVisibleRef.current) return;
    ensureActiveVisibleRef.current = false;
    if (filteredEntries.length === 0) return;
    const metrics = gridMetricsRef.current;
    const firstVisibleRow = Math.max(0, Math.floor(Math.max(0, metrics.scrollTop - 3) / metrics.rowStep) - 2);
    const lastVisibleRow = Math.ceil((metrics.scrollTop + metrics.viewportHeight) / metrics.rowStep) + 2;
    const row = Math.floor(activeIndex / metrics.columns);
    if (row < firstVisibleRow || row >= lastVisibleRow) {
      const top = row * metrics.rowStep;
      if (gridRef.current) gridRef.current.scrollTop = top;
      setGridMetrics(current => ({ ...current, scrollTop: top }));
      return;
    }
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-emoji-index="${Math.min(activeIndex, filteredEntries.length - 1)}"]`)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, filteredEntries.length]);

  const activeEntry = filteredEntries.length > 0 ? filteredEntries[Math.min(activeIndex, filteredEntries.length - 1)] : null;
  const totalRows = Math.ceil(filteredEntries.length / gridMetrics.columns);
  const firstVisibleRow = Math.max(0, Math.floor(Math.max(0, gridMetrics.scrollTop - 3) / gridMetrics.rowStep) - 2);
  const lastVisibleRow = Math.min(totalRows, Math.ceil((gridMetrics.scrollTop + gridMetrics.viewportHeight) / gridMetrics.rowStep) + 2);
  const visibleEntries = filteredEntries.slice(firstVisibleRow * gridMetrics.columns, lastVisibleRow * gridMetrics.columns);
  const insertActive = useCallback(() => {
    if (!activeEntry) return;
    if (multiSelect) appendBatchEmoji(activeEntry);
    else insertEmoji(activeEntry);
  }, [activeEntry, appendBatchEmoji, insertEmoji, multiSelect]);
  useModalKeys({ enabled: true, onEsc: close, onEnter: multiSelect ? insertBatch : insertActive });

  const copyLabel = copyState === 'copied'
    ? (isSpanish ? 'Copiado' : 'Copied')
    : copyState === 'failed'
      ? (isSpanish ? 'Error al copiar' : 'Copy failed')
      : (isSpanish ? 'Copiar' : 'Copy');
  const filterList: EmojiFilter[] = ['all', 'recent', ...EMOJI_GROUPS.map(group => group.id)];
  const filterLabel = (filter: EmojiFilter) => filter === 'all'
    ? (isSpanish ? 'Todos' : 'All')
    : filter === 'recent'
      ? (isSpanish ? 'Recientes' : 'Recent')
      : EMOJI_GROUPS.find(group => group.id === filter)?.[isSpanish ? 'es' : 'en'];

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && filteredEntries.length > 0) {
      event.preventDefault();
      ensureActiveVisibleRef.current = filteredEntries.length > 1;
      setActiveIndex(index => (index + 1) % filteredEntries.length);
    } else if (event.key === 'ArrowUp' && filteredEntries.length > 0) {
      event.preventDefault();
      ensureActiveVisibleRef.current = filteredEntries.length > 1;
      setActiveIndex(index => (index - 1 + filteredEntries.length) % filteredEntries.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      insertActive();
    }
  };

  return createPortal(
    <motion.div
      className="modal-overlay character-map-overlay emoji-picker-overlay"
      data-leave-guard="modal"
      style={{ ...modalOverlayStyle, zIndex: 10020, '--ui-scale': uiScale.toString() } as CSSProperties}
      initial={modalOverlayMotion.initial}
      animate={modalOverlayMotion.animate}
      exit={modalOverlayMotion.exit}
      onMouseDown={event => { if (event.target === event.currentTarget) close(); }}
    >
      <motion.div
        className="modal character-map-modal emoji-picker-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isSpanish ? 'Selector de emojis' : 'Emoji picker'}
        style={{ width: 'min(calc(900px * var(--ui-scale, 1)), calc(100vw - 24px))', height: 'min(calc(740px * var(--ui-scale, 1)), calc(100vh - 24px))', maxWidth: 'calc(100vw - 24px)', maxHeight: 'calc(100vh - 24px)' }}
        initial={modalCardMotion.initial}
        animate={modalCardMotion.animate}
        exit={modalCardMotion.exit}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="modal-header character-map-header">
          <span className="character-map-title-icon"><Smile size={19} aria-hidden="true" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{isSpanish ? 'Selector de emojis' : 'Emoji picker'}</h2>
            <p>{isSpanish ? '3.972 emojis y componentes estándar de Unicode 18.0.' : '3,972 standard Unicode 18.0 emojis and components.'}</p>
          </div>
          <Tooltip label={isSpanish ? (multiSelect ? 'Desactivar selección múltiple' : 'Preparar varios emojis') : (multiSelect ? 'Turn off multiple selection' : 'Queue multiple emojis')} placement="top">
            <button
              type="button"
              className={`btn-icon character-map-pin${multiSelect ? ' is-active' : ''}`}
              aria-label={isSpanish ? (multiSelect ? 'Desactivar selección múltiple' : 'Preparar varios emojis') : (multiSelect ? 'Turn off multiple selection' : 'Queue multiple emojis')}
              aria-pressed={multiSelect}
              onClick={() => {
                const next = !multiSelect;
                setMultiSelect(next);
                if (next) requestAnimationFrame(() => batchInputRef.current?.focus({ preventScroll: true }));
                else { setBatchEmojis(''); setBatchEntries([]); setCopyState('idle'); }
              }}
            >
              <Pin size={16} aria-hidden="true" />
            </button>
          </Tooltip>
          <button type="button" className="btn-icon" onClick={close} aria-label={isSpanish ? 'Cerrar selector de emojis' : 'Close emoji picker'}><X size={16} /></button>
        </div>

        <div className="modal-body character-map-body emoji-picker-body">
          <div className="character-map-search" role="search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={handleSearchKeyDown}
              placeholder={isSpanish ? 'Buscar por emoji, nombre o palabra' : 'Search emoji, name, or keyword'}
              aria-label={isSpanish ? 'Buscar emojis' : 'Search emojis'}
              autoComplete="off"
              spellCheck={false}
            />
            {query && <button type="button" className="character-map-clear-search" onClick={() => { setQuery(''); setActiveIndex(0); }} aria-label={isSpanish ? 'Borrar búsqueda' : 'Clear search'}>×</button>}
          </div>

          <div className="character-map-browser emoji-picker-browser">
            <div className="character-map-categories" role="tablist" aria-label={isSpanish ? 'Categorías de emojis' : 'Emoji categories'}>
              {filterList.map(filter => (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={category === filter}
                  className={category === filter ? 'is-active' : ''}
                  onClick={() => {
                    if (!query && gridRef.current) scrollTopRef.current[category] = gridRef.current.scrollTop;
                    setCategory(filter);
                    setActiveIndex(0);
                    persistViewState(filter, scrollTopRef.current);
                  }}
                >{filterLabel(filter)}</button>
              ))}
            </div>

            <div
              ref={gridRef}
              className="character-map-grid emoji-picker-grid"
              role="group"
              aria-label={isSpanish ? 'Emojis disponibles' : 'Available emojis'}
              onScroll={event => {
                const scrollTop = event.currentTarget.scrollTop;
                if (!query) scrollTopRef.current[category] = scrollTop;
                setGridMetrics(current => current.scrollTop === scrollTop ? current : { ...current, scrollTop });
              }}
            >
              {filteredEntries.length > 0 ? (
                <div className="emoji-picker-grid-extent" style={{ height: totalRows * gridMetrics.rowStep }}>
                  <div
                    className="emoji-picker-grid-window"
                    style={{
                      top: firstVisibleRow * gridMetrics.rowStep,
                      gridTemplateColumns: `repeat(${gridMetrics.columns}, minmax(0, 1fr))`,
                      gridAutoRows: `${gridMetrics.rowStep - gridMetrics.rowGap}px`,
                      gap: gridMetrics.rowGap,
                    }}
                  >
                    {visibleEntries.map((entry, localIndex) => {
                      const index = firstVisibleRow * gridMetrics.columns + localIndex;
                      return (
                        <button
                          key={entry.value}
                          type="button"
                          data-emoji-index={index}
                          aria-label={`${entry.value}, ${isSpanish ? entry.es : entry.en}`}
                          aria-current={activeIndex === index ? 'true' : undefined}
                          className={`${activeIndex === index ? 'is-current' : ''}${selected?.value === entry.value ? ' is-inserted' : ''}${multiSelect && batchEntries.some(staged => staged.value === entry.value) ? ' is-batch-selected' : ''}`}
                          onMouseDown={event => event.preventDefault()}
                          onClick={event => {
                            setActiveIndex(index);
                            if (multiSelect) {
                              if (event.detail === 2) appendBatchEmoji(entry);
                            } else if (event.detail !== 2) {
                              insertEmoji(entry);
                            }
                          }}
                          onDoubleClick={() => { if (!multiSelect) close(); }}
                        >{entry.value}</button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="character-map-empty">
                  {category === 'recent'
                    ? (isSpanish ? 'Los emojis que insertes aparecerán aquí.' : 'Emojis you insert will appear here.')
                    : (isSpanish ? 'No se encontraron emojis.' : 'No emojis found.')}
                </div>
              )}
            </div>
          </div>

          {multiSelect && (
            <div className="character-map-batch-row">
              <input
                ref={batchInputRef}
                value={batchEmojis}
                onChange={event => { setBatchEmojis(event.target.value); setBatchEntries([]); setCopyState('idle'); }}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); insertBatch(); } }}
                placeholder={isSpanish ? 'Doble clic en emojis o usa Agregar' : 'Double-click emojis or use Add'}
                aria-label={isSpanish ? 'Emojis preparados para insertar' : 'Emojis queued for insertion'}
                autoComplete="off"
                spellCheck={false}
              />
              <button type="button" className="copyable-block-button character-map-copy-button" aria-label={copyLabel} disabled={!batchEmojis} onMouseDown={event => event.preventDefault()} onClick={() => { void copyBatch(); }}>
                {copyState === 'copied' ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                <span>{copyLabel}</span>
              </button>
            </div>
          )}

          <div className="character-map-details" aria-live="polite">
            {activeEntry ? <>
              <span className="character-map-preview emoji-picker-preview">{activeEntry.value}</span>
              <span className="character-map-detail-copy">
                <strong>{isSpanish ? activeEntry.es : activeEntry.en}</strong>
                <code>{codePointLabel(activeEntry.value)}</code>
              </span>
              {multiSelect
                ? <button type="button" className="character-map-add-button" onMouseDown={event => event.preventDefault()} onClick={() => appendBatchEmoji(activeEntry)}><Plus size={13} aria-hidden="true" /><span>{isSpanish ? 'Agregar' : 'Add'}</span></button>
                : <span className="character-map-detail-hint">{isSpanish ? 'Enter para insertar' : 'Enter to insert'}</span>}
            </> : <span className="character-map-detail-hint">{multiSelect
              ? (isSpanish ? 'Elige un emoji para agregarlo a la selección.' : 'Choose an emoji to add to the selection.')
              : (isSpanish ? 'Elige un emoji para insertarlo en la nota.' : 'Choose an emoji to insert it into the note.')}</span>}
          </div>
        </div>

        <div className="modal-actions character-map-actions">
          <button type="button" className="modal-action-btn is-cancel" onClick={close}>{isSpanish ? 'Cerrar' : 'Close'}<KeyHint>Esc</KeyHint></button>
          <button type="button" className="modal-action-btn is-save" onClick={multiSelect ? insertBatch : insertActive} disabled={multiSelect ? !batchEmojis : !activeEntry}>
            {multiSelect ? (isSpanish ? 'Agregar' : 'Add') : (isSpanish ? 'Insertar' : 'Insert')}
            <EnterGlyph />
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
