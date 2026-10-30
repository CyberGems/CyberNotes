// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteList from './NoteList';
import Sidebar from './Sidebar';
import { NOTE_DRAG_MIME, NOTE_IDS_DRAG_MIME } from '../utils/noteDrag';

vi.mock('../utils/audio', () => ({ playSynthSound: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('dragging note selections into the sidebar', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let listProps: ComponentProps<typeof NoteList>;
  let sidebarProps: ComponentProps<typeof Sidebar>;
  let view: string;
  const move = vi.fn();
  const pin = vi.fn();
  const trash = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    view = 'normal';
    localStorage.clear();
    move.mockReset().mockResolvedValue(undefined);
    pin.mockReset().mockResolvedValue(undefined);
    trash.mockReset().mockResolvedValue([]);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.stubGlobal('cyberNotesAPI', {
      getOpenStickyNotes: vi.fn().mockResolvedValue([]), onStickyListChanged: () => () => {},
      openStickyNote: vi.fn().mockResolvedValue(true),
      getSetting: vi.fn().mockResolvedValue('false'), onSettingChanged: () => () => {},
      setSetting: vi.fn().mockResolvedValue(true),
      getSettings: vi.fn().mockImplementation(async () => ({ note_list_view_mode: view, note_list_group_by_date: 'false', note_list_collapsed_groups: '[]', note_list_floating_group_ready: 'true' })),
    });
    const noop = vi.fn();
    const notes = Array.from({ length: 4 }, (_, index) => ({ id: `n${index}`, title: `Note ${index}`, content: '', preview: '', folder_id: null, pinned: 0, created_at: '2026-01-01', updated_at: '2026-01-01' }));
    const folders = [{ id: 'folder', name: 'Destination', icon: 'folder', color: '#6c63e6', sort_order: 0, created_at: '2026-01-01' }];
    listProps = { language: 'es', notes, folders, selectedNoteId: 'n0', onSelectNote: noop, onCreateNote: noop, onRequestCreateFolder: noop,
      onDeleteNote: noop, onDeleteNotes: vi.fn().mockResolvedValue([]), onRestoreNote: noop, onRestoreAllTrash: noop, onPurgeNote: noop,
      onEmptyTrash: noop, trashCount: 0, onTogglePin: noop, onMoveNote: move, onRenameNote: noop, onDuplicateNote: noop, selectedFolder: null, searchQuery: '' };
    sidebarProps = { language: 'es', folders, selectedFolderId: null, noteCount: notes.length, trashCount: 0, allNotes: notes, stickyNoteIds: [],
      onSelectNote: noop, onSelectFolder: noop, onCreateFolder: noop, onUpdateFolder: noop, onDeleteFolder: noop, onOpenSettings: noop, onLock: noop,
      searchQuery: '', onSearch: noop, onMoveNote: move, onTogglePin: pin, onDeleteNotes: trash, onToggleRail: noop,
      getAvailableColors: () => ({ all: ['#6c63e6'], available: ['#6c63e6'], usedColors: new Set() }) };
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
    await act(async () => root.render(<><div data-sidebar><Sidebar {...sidebarProps} /></div><NoteList {...listProps} /></>));
  }
  const list = () => container.querySelector<HTMLElement>('[data-notelist-container]')!;
  const card = (id: string) => list().querySelector<HTMLElement>(`.note-item[data-note-id="${id}"]`)!;
  const target = (label = 'Destination') => Array.from(container.querySelectorAll<HTMLButtonElement>('[data-sidebar] button')).find(button => button.textContent?.includes(label) || button.getAttribute('aria-label')?.startsWith(label))!;
  function dataTransfer() {
    const values = new Map<string, string>();
    const data: DataTransfer = {
      getData: type => values.get(type) ?? '',
      setData: (type, value) => { values.set(type, value); },
      clearData: type => { if (type) values.delete(type); else values.clear(); },
      get types() { return [...values.keys()]; },
      effectAllowed: 'none', dropEffect: 'none',
      files: Object.assign([], { item: () => null }),
      items: Object.assign([], { add: () => null, clear: () => {}, remove: () => {} }),
      setDragImage: vi.fn(),
    };
    return data;
  }
  function dragEvent(type: string, data: DataTransfer) {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: data });
    return event;
  }
  async function selectThree() {
    await act(async () => list().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })));
    await act(async () => card('n3').dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true })));
  }
  async function drop(data: DataTransfer, label = 'Destination') {
    const button = target(label);
    await act(async () => button.dispatchEvent(dragEvent('dragover', data)));
    expect(target(label)).toBe(button);
    expect(button.isConnected).toBe(true);
    await act(async () => button.dispatchEvent(dragEvent('drop', data)));
  }

  it.each([
    ['normal', false], ['compact', false], ['dense', false], ['grid', false],
    ['normal', true], ['compact', true], ['dense', true], ['grid', true],
  ] as const)('moves every selected note in %s view, compact sidebar: %s', async (mode, rail) => {
    view = mode;
    sidebarProps.rail = rail;
    await render();
    await selectThree();
    const data = dataTransfer();
    await act(async () => card('n1').dispatchEvent(dragEvent('dragstart', data)));
    expect(JSON.parse(data.getData(NOTE_IDS_DRAG_MIME))).toEqual(['n0', 'n1', 'n2']);
    expect(data.getData(NOTE_DRAG_MIME)).toBe('n1');
    expect(list().querySelectorAll('.is-dragging')).toHaveLength(3);
    const preview = document.querySelector('.note-drag-preview');
    expect(preview?.textContent).toBe('3 notas');
    expect(data.setDragImage).toHaveBeenCalledExactlyOnceWith(preview, -12, -12);
    expect(container.querySelectorAll('[data-note-drop-state="ready"]')).toHaveLength(6);
    await drop(data);
    expect(move.mock.calls).toEqual([['n0', 'folder'], ['n1', 'folder'], ['n2', 'folder']]);
    expect(container.querySelector('.note-selection-actions')).toBeNull();
    expect(list().querySelector('.is-dragging')).toBeNull();
    expect(document.querySelector('.note-drag-preview')).toBeNull();
    expect(container.querySelector('[data-note-drop-state]')).toBeNull();
  });

  it('preserves selection on cancellation and moves only the dragged note when it is outside the selection', async () => {
    await render();
    await selectThree();
    const data = dataTransfer();
    await act(async () => card('n1').dispatchEvent(dragEvent('dragstart', data)));
    await act(async () => card('n1').dispatchEvent(dragEvent('dragend', data)));
    expect(move).not.toHaveBeenCalled();
    expect(list().querySelectorAll('[aria-selected="true"]')).toHaveLength(3);
    expect(list().querySelector('.is-dragging')).toBeNull();
    expect(document.querySelector('.note-drag-preview')).toBeNull();
    await act(async () => card('n3').dispatchEvent(dragEvent('dragstart', data)));
    expect(JSON.parse(data.getData(NOTE_IDS_DRAG_MIME))).toEqual(['n3']);
    expect(document.querySelector('.note-drag-preview')).toBeNull();
    expect(data.setDragImage).toHaveBeenCalledTimes(1);
    await drop(data);
    expect(move).toHaveBeenCalledExactlyOnceWith('n3', 'folder');
  });

  it.each([[false, 'Todas las notas'], [false, 'Sin carpeta'], [true, 'Todas las notas'], [true, 'Sin carpeta']] as const)('accepts the full group on the unfiled target, compact sidebar: %s, target: %s', async (rail, label) => {
    sidebarProps.rail = rail;
    await render();
    await selectThree();
    const data = dataTransfer();
    await act(async () => card('n0').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, label);
    expect(move.mock.calls).toEqual([['n0', null], ['n1', null], ['n2', null]]);
  });

  it.each([false, true])('highlights every folder and switches the active reception state, compact sidebar: %s', async rail => {
    sidebarProps.rail = rail;
    sidebarProps.folders = [
      ...sidebarProps.folders,
      { ...sidebarProps.folders[0], id: 'cyan', name: 'Cyan', color: '#06b6d4' },
      { ...sidebarProps.folders[0], id: 'green', name: 'Green', color: '#10b981' },
    ];
    await render();
    const data = dataTransfer();
    await act(async () => card('n0').dispatchEvent(dragEvent('dragstart', data)));
    expect(container.querySelectorAll('[data-note-drop-state="ready"]')).toHaveLength(8);
    for (const label of ['Destination', 'Cyan', 'Green', 'Todas las notas', 'Sin carpeta', 'Favoritos', 'Notas flotantes', 'Papelera']) {
      const button = target(label);
      await act(async () => button.dispatchEvent(dragEvent('dragover', data)));
      expect(target(label)).toBe(button);
      expect(button.dataset.noteDropState).toBe('active');
      expect(container.querySelectorAll('[data-note-drop-state="active"]')).toHaveLength(1);
      await act(async () => button.dispatchEvent(dragEvent('dragleave', data)));
      expect(button.dataset.noteDropState).toBe('ready');
    }
    await act(async () => card('n0').dispatchEvent(dragEvent('dragend', data)));
    expect(container.querySelector('[data-note-drop-state]')).toBeNull();
  });

  it('uses an English counter and removes its native preview when the list unmounts', async () => {
    listProps.language = 'en';
    await render();
    await selectThree();
    const data = dataTransfer();
    await act(async () => card('n0').dispatchEvent(dragEvent('dragstart', data)));
    expect(document.querySelector('.note-drag-preview')?.textContent).toBe('3 notes');
    await act(async () => root.render(<Sidebar {...sidebarProps} />));
    expect(document.querySelector('.note-drag-preview')).toBeNull();
  });

  it.each([false, true])('adds the full group to Favorites without toggling existing favorites off, compact sidebar: %s', async rail => {
    sidebarProps.rail = rail;
    sidebarProps.allNotes[0].pinned = 1;
    sidebarProps.allNotes.forEach(note => { note.folder_id = 'source'; });
    await render(); await selectThree();
    const data = dataTransfer();
    await act(async () => card('n1').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, 'Favoritos');
    expect(pin.mock.calls.map(([note]) => note.id)).toEqual(['n1', 'n2']);
    expect(pin.mock.calls.every(([note]) => note.folder_id === 'source')).toBe(true);
    expect(sidebarProps.allNotes[0].pinned).toBe(1);
    expect(move).not.toHaveBeenCalled(); expect(trash).not.toHaveBeenCalled();
    expect(container.querySelector('.note-selection-actions')).toBeNull();
  });

  it.each([false, true])('opens floating notes without reopening existing windows, compact sidebar: %s', async rail => {
    sidebarProps.rail = rail;
    sidebarProps.stickyNoteIds = ['n0'];
    await render(); await selectThree();
    const data = dataTransfer();
    await act(async () => card('n1').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, 'Notas flotantes');
    expect(vi.mocked(window.cyberNotesAPI.openStickyNote).mock.calls).toEqual([['n1'], ['n2']]);
    expect(move).not.toHaveBeenCalled(); expect(pin).not.toHaveBeenCalled();
    expect(container.querySelector('.note-selection-actions')).toBeNull();
  });

  it('retains notes whose floating windows could not be opened', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(window.cyberNotesAPI.openStickyNote).mockImplementation(async id => id !== 'n1');
    await render(); await selectThree();
    const data = dataTransfer();
    await act(async () => card('n0').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, 'Notas flotantes');
    expect([...list().querySelectorAll<HTMLElement>('.note-item[aria-selected="true"]')].map(item => item.dataset.noteId)).toEqual(['n1']);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('restantes');
  });

  it.each([false, true])('confirms a group trash drop once and preserves selection when cancelled, compact sidebar: %s', async rail => {
    sidebarProps.rail = rail;
    await render(); await selectThree();
    const data = dataTransfer();
    await act(async () => card('n0').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, 'Papelera');
    expect(trash).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('¿Enviar 3 notas a la papelera?');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(list().querySelectorAll('.note-item[aria-selected="true"]')).toHaveLength(3);
    expect(trash).not.toHaveBeenCalled();
    await act(async () => card('n0').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, 'Papelera');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })));
    expect(trash).toHaveBeenCalledExactlyOnceWith(['n0', 'n1', 'n2']);
    expect(move).not.toHaveBeenCalled();
    expect(container.querySelector('.note-selection-actions')).toBeNull();
  });

  it('respects the dismissed confirmation preference for single trash drops but still confirms groups', async () => {
    vi.mocked(window.cyberNotesAPI.getSetting).mockResolvedValue('true');
    await render(); await selectThree();
    const data = dataTransfer();
    await act(async () => card('n0').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, 'Papelera');
    expect(trash).not.toHaveBeenCalled();
    await act(async () => (document.querySelector('.modal-action-btn.is-cancel') as HTMLElement).click());
    await act(async () => card('n3').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, 'Papelera');
    expect(trash).toHaveBeenCalledExactlyOnceWith(['n3']);
    expect(document.querySelector('.modal-actions')).toBeNull();
  });

  it('shows the trash confirmation in English and retains failed notes for retry', async () => {
    sidebarProps.language = 'en'; listProps.language = 'en';
    trash.mockResolvedValueOnce(['n1']);
    await render(); await selectThree();
    const data = dataTransfer();
    await act(async () => card('n0').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, 'Trash');
    expect(document.body.textContent).toContain('Move 3 notes to the trash?');
    await act(async () => (document.querySelector('.modal-action-btn.is-save') as HTMLElement).click());
    expect([...list().querySelectorAll<HTMLElement>('.note-item[aria-selected="true"]')].map(item => item.dataset.noteId)).toEqual(['n1']);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('remaining notes');
    await act(async () => card('n1').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data, 'Trash');
    await act(async () => (document.querySelector('.modal-action-btn.is-save') as HTMLElement).click());
    expect(trash.mock.calls).toEqual([[['n0', 'n1', 'n2']], [['n1']]]);
  });

  it('keeps failed moves selected and reports the error', async () => {
    await render();
    await selectThree();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    move.mockImplementation(async id => { if (id === 'n1') throw new Error('Storage unavailable'); });
    const data = dataTransfer();
    await act(async () => card('n0').dispatchEvent(dragEvent('dragstart', data)));
    await drop(data);
    const selected = [...list().querySelectorAll<HTMLElement>('.note-item[aria-selected="true"]')].map(item => item.dataset.noteId);
    expect(selected).toEqual(['n1']);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('restantes');
    expect(console.error).toHaveBeenCalled();
  });

  it('rejects malformed groups and unknown notes, and still accepts a legacy single-note drag', async () => {
    await render();
    const data = dataTransfer();
    data.setData(NOTE_DRAG_MIME, 'n0');
    data.setData(NOTE_IDS_DRAG_MIME, 'invalid');
    await drop(data);
    expect(move).not.toHaveBeenCalled();
    data.setData(NOTE_IDS_DRAG_MIME, '["unknown"]');
    await drop(data);
    expect(move).not.toHaveBeenCalled();
    const single = dataTransfer();
    single.setData('text/plain', 'n2');
    await drop(single);
    expect(move).toHaveBeenCalledExactlyOnceWith('n2', 'folder');
  });
});
