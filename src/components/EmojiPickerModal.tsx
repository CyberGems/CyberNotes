import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { motion } from 'motion/react';
import type { Editor } from '@tiptap/react';
import { ListPlus, Search, Smile, X } from 'lucide-react';
import type { Language } from '../languages';
import emojiCatalogJson from '../data/emoji-catalog.json';
import emojiComponentsJson from '../data/emoji-components.json';
import { EnterGlyph, KeyHint, modalCardMotion, modalOverlayMotion, modalOverlayStyle, useModalKeys } from './ModalActions';
import { EMOJI_FONT_FAMILY, filterSupportedEmojis } from '../utils/emojiSupport';
import NativeGlyph from './NativeGlyph';

type EmojiGroup = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type EmojiFilter = 'all' | 'recent' | EmojiGroup;
type EmojiTuple = [string, string, string, number, string];
interface EmojiEntry { value: string; es: string; en: string; group: EmojiGroup; search: string; normalizedSearch: string; }
interface EmojiCatalog { entries: EmojiTuple[]; }
interface QueuedEmoji extends EmojiEntry { queueId: number; }

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
let compatibleEntriesPromise: Promise<EmojiEntry[]> | null = null;
let compatibleEntriesCache: EmojiEntry[] | null = null;

function loadCompatibleEntries() {
  if (!compatibleEntriesPromise) {
    compatibleEntriesPromise = filterSupportedEmojis(EMOJI_ENTRIES.map(entry => entry.value))
      .then(supported => {
        compatibleEntriesCache = EMOJI_ENTRIES.filter(entry => supported.has(entry.value));
        return compatibleEntriesCache;
      })
      .catch(error => { compatibleEntriesPromise = null; throw error; });
  }
  return compatibleEntriesPromise;
}
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
  const trayRef = useRef<HTMLDivElement | null>(null);
  const nextQueueId = useRef(0);
  const focusGridRef = useRef(false);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const ensureActiveVisibleRef = useRef(false);
  const insertionRangeRef = useRef({ from: editor.state.selection.from, to: editor.state.selection.to });
  const [initialViewState] = useState(readViewState);
  const scrollTopRef = useRef(initialViewState.scrollTop);
  const [query, setQuery] = useState('');
  const [compatibleEntries, setCompatibleEntries] = useState<EmojiEntry[] | null>(() => compatibleEntriesCache);
  const [compatibilityError, setCompatibilityError] = useState(false);
  const [category, setCategory] = useState<EmojiFilter>(initialViewState.category);
  const [activeIndex, setActiveIndex] = useState(0);
  const [gridMetrics, setGridMetrics] = useState({ columns: 8, rowStep: 57, rowGap: 5, viewportHeight: 0, scrollTop: 0 });
  const gridMetricsRef = useRef(gridMetrics);
  gridMetricsRef.current = gridMetrics;
  const [selected, setSelected] = useState<EmojiEntry | null>(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [batchEntries, setBatchEntries] = useState<QueuedEmoji[]>([]);
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

  const compatibleValues = useMemo(() => new Set(compatibleEntries?.map(entry => entry.value)), [compatibleEntries]);
  const filteredEntries = useMemo(() => {
    const source = category === 'recent'
      ? recentEmojis.filter(value => compatibleValues.has(value)).map(value => EMOJI_BY_VALUE.get(value)).filter((entry): entry is EmojiEntry => Boolean(entry))
      : (compatibleEntries || []).filter(entry => category === 'all' || entry.group === category);
    const normalizedQuery = normalizeSearch(query.trim());
    return normalizedQuery
      ? source.filter(entry => entry.normalizedSearch.includes(normalizedQuery))
      : source;
  }, [category, query, recentEmojis, compatibleEntries, compatibleValues]);

  const rememberEmojis = useCallback((entries: readonly EmojiEntry[]) => {
    const next = entries.reduce((recent, entry) => [entry.value, ...recent.filter(value => value !== entry.value)], recentEmojis).slice(0, 32);
    // Persist before onClose unmounts the modal. React may discard pending
    // state updaters during that unmount, so storage writes must happen here.
    try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage opcional */ }
    setRecentEmojis(next);
  }, [recentEmojis]);

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

  const insertEntries = useCallback((entries: readonly EmojiEntry[]) => {
    if (!entries.length || !insertText(entries.map(entry => entry.value).join(''))) return;
    rememberEmojis(entries);
    close();
  }, [close, insertText, rememberEmojis]);

  const appendBatchEmoji = useCallback((entry: EmojiEntry) => {
    const queued = { ...entry, queueId: nextQueueId.current++ };
    setBatchEntries(current => [...current, queued]);
  }, []);

  const removeQueuedEmoji = useCallback((queueId: number, index: number) => {
    setBatchEntries(current => current.filter(entry => entry.queueId !== queueId));
    requestAnimationFrame(() => {
      const buttons = trayRef.current?.querySelectorAll<HTMLButtonElement>('.emoji-picker-chip');
      const next = buttons?.[Math.min(index, buttons.length - 1)];
      (next || searchRef.current)?.focus({ preventScroll: true });
    });
  }, []);

  const confirmInsertion = useCallback(() => {
    if (multiSelect) insertEntries(batchEntries);
    else if (selected) insertEntries([selected]);
  }, [batchEntries, insertEntries, multiSelect, selected]);

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    let mounted = true;
    loadCompatibleEntries().then(entries => { if (mounted) setCompatibleEntries(entries); }).catch(error => {
      console.error('Could not check native emoji support:', error);
      if (mounted) setCompatibilityError(true);
    });
    return () => { mounted = false; };
  }, []);
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
  const previewEntry = selected || activeEntry;
  const totalRows = Math.ceil(filteredEntries.length / gridMetrics.columns);
  const firstVisibleRow = Math.max(0, Math.floor(Math.max(0, gridMetrics.scrollTop - 3) / gridMetrics.rowStep) - 2);
  const lastVisibleRow = Math.min(totalRows, Math.ceil((gridMetrics.scrollTop + gridMetrics.viewportHeight) / gridMetrics.rowStep) + 2);
  const visibleEntries = filteredEntries.slice(firstVisibleRow * gridMetrics.columns, lastVisibleRow * gridMetrics.columns);
  useModalKeys({ enabled: true, onEsc: close, onEnter: confirmInsertion });
  useEffect(() => {
    if (!focusGridRef.current) return;
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-emoji-index="${activeIndex}"]`);
    if (button) {
      focusGridRef.current = false;
      button.focus({ preventScroll: true });
    }
  }, [activeIndex, gridMetrics.scrollTop, filteredEntries]);

  const moveGridCursor = (index: number) => {
    const next = ((index % filteredEntries.length) + filteredEntries.length) % filteredEntries.length;
    ensureActiveVisibleRef.current = true;
    focusGridRef.current = true;
    setActiveIndex(next);
    if (!multiSelect) setSelected(filteredEntries[next]);
    const button = gridRef.current?.querySelector<HTMLButtonElement>(`[data-emoji-index="${next}"]`);
    if (button) {
      focusGridRef.current = false;
      button.focus({ preventScroll: true });
    }
  };

  const filterList: EmojiFilter[] = ['all', 'recent', ...EMOJI_GROUPS.map(group => group.id)];
  const filterLabel = (filter: EmojiFilter) => filter === 'all'
    ? (isSpanish ? 'Todos' : 'All')
    : filter === 'recent'
      ? (isSpanish ? 'Recientes' : 'Recent')
      : EMOJI_GROUPS.find(group => group.id === filter)?.[isSpanish ? 'es' : 'en'];

  const handleSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && filteredEntries.length > 0) {
      event.preventDefault();
      moveGridCursor(activeIndex + (event.key === 'ArrowDown' ? 1 : -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (multiSelect) confirmInsertion();
      else if (activeEntry && (selected || query.trim())) insertEntries([activeEntry]);
    }
  };

  const handleGridKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.nativeEvent.isComposing) return;
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -gridMetrics.columns, ArrowDown: gridMetrics.columns };
    if (event.key in steps) {
      event.preventDefault();
      moveGridCursor(index + steps[event.key]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      event.stopPropagation();
      if (multiSelect) confirmInsertion();
      else insertEntries([filteredEntries[index]]);
    }
  };

  return createPortal(
    <motion.div
      className="modal-overlay character-map-overlay emoji-picker-overlay"
      data-leave-guard="modal"
      style={{ ...modalOverlayStyle, zIndex: 10020, '--ui-scale': uiScale.toString(), '--font-emoji': EMOJI_FONT_FAMILY } as CSSProperties}
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
            <p>{compatibleEntries
              ? `${compatibleEntries.length.toLocaleString(isSpanish ? 'es' : 'en')} emojis`
              : (isSpanish ? 'Emojis disponibles en este equipo.' : 'Emojis available on this device.')}</p>
          </div>
          <button type="button" className={`emoji-picker-mode${multiSelect ? ' is-active' : ''}`}
            aria-pressed={multiSelect} onClick={() => setMultiSelect(value => !value)}>
            <ListPlus size={15} aria-hidden="true" />
            <span>{isSpanish ? 'Varios' : 'Multiple'}</span>
            {batchEntries.length > 0 && <span className="emoji-picker-mode-count">{batchEntries.length}</span>}
          </button>
          <button type="button" className="btn-icon" onClick={close} aria-label={isSpanish ? 'Cerrar selector de emojis' : 'Close emoji picker'}><X size={16} /></button>
        </div>

        <div className="modal-body character-map-body emoji-picker-body">
          <div className="character-map-search" role="search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={event => { focusGridRef.current = false; ensureActiveVisibleRef.current = false; setQuery(event.target.value); setActiveIndex(0); setSelected(null); }}
              onKeyDown={handleSearchKeyDown}
              placeholder={isSpanish ? 'Buscar por emoji, nombre o palabra' : 'Search emoji, name, or keyword'}
              aria-label={isSpanish ? 'Buscar emojis' : 'Search emojis'}
              autoComplete="off"
              spellCheck={false}
            />
            {query && <button type="button" className="character-map-clear-search" onClick={() => { setQuery(''); setActiveIndex(0); }} aria-label={isSpanish ? 'Borrar búsqueda' : 'Clear search'}>×</button>}
          </div>

          <p className="emoji-picker-instructions">{multiSelect
            ? (isSpanish ? 'Clic o Espacio añade a la bandeja. Enter inserta el grupo.' : 'Click or Space adds to the tray. Enter inserts the group.')
            : (isSpanish ? 'Selecciona un emoji. Insertar o Enter confirma la selección.' : 'Select an emoji. Insert or Enter confirms your selection.')}</p>

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
                    focusGridRef.current = false;
                    ensureActiveVisibleRef.current = false;
                    setCategory(filter);
                    setSelected(null);
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
              {compatibleEntries === null ? (
                <div className="emoji-picker-compatibility" role={compatibilityError ? 'alert' : 'status'}>
                  {compatibilityError
                    ? (isSpanish ? 'No se pudo comprobar la compatibilidad de los emojis.' : 'Could not check emoji compatibility.')
                    : (isSpanish ? 'Comprobando compatibilidad de emojis…' : 'Checking emoji compatibility…')}
                </div>
              ) : filteredEntries.length > 0 ? (
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
                          aria-pressed={multiSelect ? batchEntries.some(staged => staged.value === entry.value) : selected?.value === entry.value}
                          tabIndex={activeIndex === index ? 0 : -1}
                          className={`${activeIndex === index && (query || selected) ? 'is-current' : ''}${!multiSelect && selected?.value === entry.value ? ' is-selected' : ''}${multiSelect && batchEntries.some(staged => staged.value === entry.value) ? ' is-batch-selected' : ''}`}
                          onMouseDown={event => event.preventDefault()}
                          onFocus={() => { setActiveIndex(index); if (!multiSelect) setSelected(entry); }}
                          onKeyDown={event => handleGridKeyDown(event, index)}
                          onClick={() => {
                            setActiveIndex(index);
                            setSelected(entry);
                            if (multiSelect) appendBatchEmoji(entry);
                          }}
                        ><NativeGlyph value={entry.value} fontFamily={EMOJI_FONT_FAMILY} className="emoji-picker-glyph" /></button>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="character-map-empty">
                  {category === 'recent' && !query.trim()
                    ? (isSpanish ? 'Los emojis que insertes aparecerán aquí.' : 'Emojis you insert will appear here.')
                    : (isSpanish ? 'No se encontraron emojis.' : 'No emojis found.')}
                </div>
              )}
            </div>
          </div>

          {multiSelect ? (
            <section className="emoji-picker-tray" aria-label={isSpanish ? 'Bandeja de emojis' : 'Emoji tray'}>
              <div className="emoji-picker-tray-header">
                <span role="status">{isSpanish ? 'Preparados' : 'Queued'}: {batchEntries.length}</span>
                <button type="button" className="emoji-picker-clear" disabled={!batchEntries.length}
                  onClick={() => { setBatchEntries([]); searchRef.current?.focus({ preventScroll: true }); }}>
                  {isSpanish ? 'Vaciar' : 'Clear'}
                </button>
              </div>
              <div ref={trayRef} className="emoji-picker-tray-items">
                {batchEntries.length ? batchEntries.map((entry, index) => (
                  <button key={entry.queueId} type="button" className="emoji-picker-chip"
                    aria-label={isSpanish ? `Quitar ${entry.es}, posición ${index + 1}` : `Remove ${entry.en}, position ${index + 1}`}
                    onClick={() => removeQueuedEmoji(entry.queueId, index)}>
                    <NativeGlyph value={entry.value} fontFamily={EMOJI_FONT_FAMILY} className="emoji-picker-glyph" />
                    <X size={12} aria-hidden="true" />
                  </button>
                )) : <span className="emoji-picker-tray-empty">{isSpanish ? 'Elige emojis para preparar tu grupo. Puedes repetirlos.' : 'Choose emojis for your group. You can repeat emojis.'}</span>}
              </div>
            </section>
          ) : (
            <div className="character-map-details" aria-live="polite">
              {previewEntry ? <>
                <span className="character-map-preview emoji-picker-preview"><NativeGlyph value={previewEntry.value} fontFamily={EMOJI_FONT_FAMILY} /></span>
                <span className="character-map-detail-copy"><strong>{isSpanish ? previewEntry.es : previewEntry.en}</strong></span>
              </> : <span className="character-map-detail-hint">{isSpanish ? 'Selecciona un emoji de los resultados.' : 'Select an emoji from the results.'}</span>}
            </div>
          )}
        </div>

        <div className="modal-actions character-map-actions">
          <button type="button" className="modal-action-btn is-cancel" onClick={close}>{isSpanish ? 'Cerrar' : 'Close'}<KeyHint>Esc</KeyHint></button>
          <button type="button" className="modal-action-btn is-save" onClick={confirmInsertion} disabled={multiSelect ? !batchEntries.length : !selected}>
            {isSpanish ? 'Insertar' : 'Insert'}{multiSelect && batchEntries.length > 0 ? ` (${batchEntries.length})` : ''}
            <EnterGlyph />
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}
