// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteList from './NoteList';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('note list multiple selection', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let list: HTMLDivElement;
  let props: ComponentProps<typeof NoteList>;
  let mode: 'normal' | 'compact' | 'dense' | 'grid';
  let grouped: boolean;

  beforeEach(() => {
    vi.useFakeTimers();
    mode = 'normal';
    grouped = false;
    localStorage.clear();
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('PointerEvent', class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    });
    vi.stubGlobal('cyberNotesAPI', {
      getOpenStickyNotes: vi.fn().mockResolvedValue([]), onStickyListChanged: () => () => {},
      getSetting: vi.fn().mockResolvedValue('false'), onSettingChanged: () => () => {},
      setSetting: vi.fn().mockResolvedValue(true),
      getSettings: vi.fn().mockImplementation(async () => ({
        note_list_view_mode: mode, note_list_group_by_date: String(grouped),
        note_list_collapsed_groups: '[]', note_list_floating_group_ready: 'true',
      })),
    });
    const noop = vi.fn();
    props = {
      language: 'es', notes: Array.from({ length: 40 }, (_, index) => ({
        id: `n${index}`, title: `Note ${index}`, content: '', preview: 'Preview', pinned: 0,
        folder_id: null, created_at: '2026-10-29T12:00:00.000Z', updated_at: '2026-10-29T12:00:00.000Z',
      })), folders: [{ id: 'folder', name: 'Destination', color: '#6c63e6', icon: 'folder', sort_order: 0, created_at: '2026-01-01' }],
      selectedNoteId: 'n0', onSelectNote: vi.fn(), onCreateNote: noop, onRequestCreateFolder: noop,
      onDeleteNote: vi.fn(), onDeleteNotes: vi.fn().mockResolvedValue([]), onRestoreNote: noop,
      onRestoreAllTrash: noop, onPurgeNote: noop, onEmptyTrash: noop, trashCount: 0,
      onTogglePin: noop, onMoveNote: vi.fn().mockResolvedValue(undefined), onRenameNote: noop, onDuplicateNote: noop,
      selectedFolder: null, searchQuery: '', onSearch: vi.fn(),
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  async function render() {
    await act(async () => root.render(<NoteList {...props} />));
    list = container.querySelector<HTMLDivElement>('[data-notelist-container]')!;
    Object.defineProperties(list, {
      clientWidth: { configurable: true, value: 300 }, clientHeight: { configurable: true, value: 300 },
      scrollHeight: { configurable: true, value: 5000 },
    });
    list.getBoundingClientRect = () => new DOMRect(100, 200, 300, 300);
    list.setPointerCapture = vi.fn();
    list.hasPointerCapture = () => false;
    const height = mode === 'normal' ? 112 : mode === 'compact' ? 58 : 38;
    for (const card of list.querySelectorAll<HTMLElement>('.note-item[data-note-id]')) {
      const index = Number(card.dataset.noteId!.slice(1));
      card.getBoundingClientRect = () => mode === 'grid'
        ? new DOMRect(112 + index % 2 * 144, 206 + Math.floor(index / 2) * 144, 132, 132)
        : new DOMRect(112, 206 + index * height, 276, height - 8);
    }
  }

  function pointer(target: EventTarget, type: string, x: number, y: number, extra: PointerEventInit = {}) {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId: 1, clientX: x, clientY: y, ...extra }));
  }
  const selected = () => [...list.querySelectorAll<HTMLElement>('.note-item[aria-selected="true"]')].map(card => card.dataset.noteId);
  const card = (id: string) => list.querySelector<HTMLElement>(`.note-item[data-note-id="${id}"]`)!;
  async function drag(x: number, y: number, endX: number, endY: number, extra: PointerEventInit = {}) {
    await act(async () => pointer(list, 'pointerdown', x, y, extra));
    await act(async () => pointer(window, 'pointermove', endX, endY, extra));
    await act(async () => pointer(window, 'pointerup', endX, endY, extra));
  }
  const deleteSelection = () => container.querySelector<HTMLButtonElement>('[aria-label="Eliminar notas seleccionadas"]')!;
  const confirm = () => document.querySelector<HTMLButtonElement>('[data-leave-guard="modal"] .modal-action-btn.is-save')!;

  it.each(['normal', 'compact', 'dense', 'grid'] as const)('selects intersecting cards from empty space in %s view without opening notes', async view => {
    mode = view;
    await render();
    const second = card('n1').getBoundingClientRect();
    await drag(103, 202, 390, second.bottom + 1);
    expect(selected()).toEqual(['n0', 'n1']);
    expect(props.onSelectNote).not.toHaveBeenCalled();
    expect(container.querySelector('[role="status"]')?.textContent).toContain('2 seleccionadas');
    expect(container.querySelector('.note-list-marquee')?.getAttribute('style')).toContain('display: none');
  });

  it('keeps native card dragging, supports Ctrl/Shift clicks, and clears with Escape', async () => {
    await render();
    await act(async () => {
      card('n2').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    });
    expect(selected()).toEqual(['n0', 'n2']);
    await act(async () => { card('n4').dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); });
    expect(selected()).toEqual(['n2', 'n3', 'n4']);
    await act(async () => pointer(card('n3'), 'pointerdown', 150, 550));
    await act(async () => pointer(window, 'pointermove', 390, 600));
    expect(selected()).toEqual(['n2', 'n3', 'n4']);
    const data = { setData: vi.fn(), effectAllowed: '' };
    const event = new Event('dragstart', { bubbles: true });
    Object.defineProperty(event, 'dataTransfer', { value: data });
    await act(async () => card('n3').dispatchEvent(event));
    expect(data.setData).toHaveBeenCalledWith('application/cybernotes-note', 'n3');
    await act(async () => list.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(container.querySelector('.note-selection-actions')).toBeNull();
  });

  it('adds a marquee to the selection with Ctrl, and restores it when the gesture is cancelled', async () => {
    await render();
    await drag(103, 202, 390, 423);
    await act(async () => pointer(list, 'pointerdown', 103, 430, { ctrlKey: true }));
    await act(async () => pointer(window, 'pointermove', 390, 490));
    expect(selected()).toEqual(['n0', 'n1', 'n2']);
    await act(async () => pointer(window, 'pointercancel', 390, 490));
    expect(selected()).toEqual(['n0', 'n1']);
    await act(async () => pointer(list, 'pointerdown', 103, 204));
    await act(async () => pointer(window, 'pointermove', 200, 400));
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(selected()).toEqual(['n0', 'n1']);
  });

  it('auto-scrolls across virtual rows and deletes the full selected range with one confirmation', async () => {
    await render();
    const mounted = list.querySelectorAll('.note-item').length;
    await act(async () => pointer(list, 'pointerdown', 103, 202));
    await act(async () => pointer(window, 'pointermove', 390, 499));
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    await act(async () => pointer(window, 'pointerup', 390, 499));
    expect(list.scrollTop).toBeGreaterThan(1000);
    await act(async () => deleteSelection().click());
    expect(props.onDeleteNotes).not.toHaveBeenCalled();
    await act(async () => confirm().click());
    const ids = vi.mocked(props.onDeleteNotes).mock.calls[0][0];
    expect(ids.length).toBeGreaterThan(mounted);
    expect(ids).toContain('n20');
    expect(props.onDeleteNotes).toHaveBeenCalledTimes(1);
    expect(vi.mocked(props.onDeleteNotes).mock.calls[0][1]).toBe(false);
  });

  it('moves selected notes together and retries only failed deletions', async () => {
    await render();
    await drag(103, 202, 390, 423);
    const move = container.querySelector<HTMLSelectElement>('[aria-label="Mover notas seleccionadas a"]')!;
    await act(async () => { move.value = 'folder'; move.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(props.onMoveNote).toHaveBeenNthCalledWith(1, 'n0', 'folder');
    expect(props.onMoveNote).toHaveBeenNthCalledWith(2, 'n1', 'folder');
    await drag(103, 202, 390, 423);
    vi.mocked(props.onDeleteNotes).mockResolvedValueOnce(['n1']).mockResolvedValueOnce([]);
    await act(async () => deleteSelection().click());
    await act(async () => confirm().click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('notas restantes');
    await act(async () => confirm().click());
    expect(props.onDeleteNotes).toHaveBeenNthCalledWith(1, ['n0', 'n1'], false);
    expect(props.onDeleteNotes).toHaveBeenNthCalledWith(2, ['n1'], false);
  });

  it('resets selection when the search changes and labels its actions in English', async () => {
    props = { ...props, language: 'en' };
    await render();
    await drag(103, 202, 390, 423);
    expect(container.querySelector('[role="status"]')?.textContent).toContain('2 selected');
    expect(container.querySelector('[aria-label="Move selected notes to"]')).not.toBeNull();
    const clear = container.querySelector<HTMLButtonElement>('[aria-label="Clear selection"]')!;
    await act(async () => { clear.focus(); clear.click(); });
    expect(document.activeElement).toBe(list);
    await drag(103, 202, 390, 423);
    props = { ...props, searchQuery: 'different' };
    await act(async () => root.render(<NoteList {...props} />));
    expect(container.querySelector('.note-selection-actions')).toBeNull();
  });

  it('uses the full selection in its context menu and switches to one note when right-clicking outside it', async () => {
    await render();
    await drag(103, 202, 390, 423);
    await act(async () => { card('n1').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 180, clientY: 350 })); });
    expect(document.querySelector('.note-selection-menu-heading')?.textContent).toBe('2 notas seleccionadas');
    const destination = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Destination')!;
    await act(async () => destination.click());
    expect(props.onMoveNote).toHaveBeenNthCalledWith(1, 'n0', 'folder');
    expect(props.onMoveNote).toHaveBeenNthCalledWith(2, 'n1', 'folder');
    await drag(103, 202, 390, 423);
    await act(async () => { card('n2').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 180, clientY: 450 })); });
    expect(document.querySelector('.note-selection-menu-heading')).toBeNull();
    const remove = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === 'Eliminar')!;
    await act(async () => remove.click());
    await act(async () => confirm().click());
    expect(props.onDeleteNotes).toHaveBeenCalledExactlyOnceWith(['n2'], false);
    expect(props.onSelectNote).not.toHaveBeenCalled();
  });

  it('does not turn a marquee release into a card click, or start one on a group header', async () => {
    grouped = true;
    await render();
    const header = list.querySelector<HTMLElement>('.note-group-header')!;
    await act(async () => pointer(header, 'pointerdown', 110, 210));
    await act(async () => pointer(window, 'pointermove', 390, 423));
    expect(container.querySelector('.note-selection-actions')).toBeNull();
    await act(async () => pointer(list, 'pointerdown', 103, 202));
    await act(async () => pointer(window, 'pointermove', 390, 423));
    await act(async () => {
      pointer(window, 'pointerup', 390, 423);
      card('n1').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(props.onSelectNote).not.toHaveBeenCalled();
    expect(selected()).toEqual(['n0', 'n1']);
    await act(async () => { vi.advanceTimersByTime(0); header.click(); });
    expect(container.querySelector('.note-selection-actions')).toBeNull();
  });

  it('keeps failed moves selected and sends permanent deletions through one batch confirmation', async () => {
    await render();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(props.onMoveNote).mockImplementation(async id => { if (id === 'n1') throw new Error('Storage unavailable'); });
    await drag(103, 202, 390, 423);
    const move = container.querySelector<HTMLSelectElement>('[aria-label="Mover notas seleccionadas a"]')!;
    await act(async () => { move.value = 'folder'; move.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(selected()).toEqual(['n1']);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('restantes');
    props = { ...props, selectedFolder: { ...props.folders[0], id: 'trash' } };
    await act(async () => root.render(<NoteList {...props} />));
    await drag(103, 202, 390, 423);
    expect(container.querySelector('[aria-label="Mover notas seleccionadas a"]')).toBeNull();
    await act(async () => deleteSelection().click());
    expect(document.body.textContent).toContain('¿Eliminar 2 notas definitivamente?');
    await act(async () => confirm().click());
    expect(props.onDeleteNotes).toHaveBeenCalledWith(['n0', 'n1'], true);
  });
});
