// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MainApp from './MainApp';
import { TRANSLATIONS } from '../languages';
import { toNoteMeta } from '../utils/notes';
import type { Note } from '../types';

vi.mock('./NoteEditor', () => ({ default: () => null, isToolbarItemId: () => false }));
vi.mock('./TitleBar', () => ({ default: () => null }));
vi.mock('./SettingsModal', () => ({ default: () => null }));
vi.mock('./AboutModal', () => ({ default: () => null }));
vi.mock('./TrayPinModal', () => ({ default: () => null }));
vi.mock('./UpdaterBanner', () => ({ default: () => null }));
vi.mock('../utils/audio', () => ({ playSynthSound: vi.fn() }));
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('favorite drops through MainApp', () => {
  let root: ReturnType<typeof createRoot>;
  let host: HTMLDivElement;
  let saved: Map<string, Note>;
  beforeEach(() => {
    vi.useFakeTimers(); localStorage.clear(); saved = new Map();
    vi.stubGlobal('innerWidth', 1400);
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    const api = {
      getFolders: vi.fn().mockResolvedValue([]),
      getAllNotes: vi.fn().mockImplementation(async () => [...saved.values()].map(toNoteMeta)),
      getNotesByFolder: vi.fn().mockImplementation(async () => [...saved.values()].map(toNoteMeta)),
      getNoteById: vi.fn().mockImplementation(async id => saved.get(id) ?? null),
      getDrafts: vi.fn().mockResolvedValue([]), getTrashCount: vi.fn().mockResolvedValue(0),
      getOpenStickyNotes: vi.fn().mockResolvedValue([]),
      getSetting: vi.fn().mockResolvedValue(null),
      getSettings: vi.fn().mockResolvedValue({ note_list_group_by_date: 'false', note_list_floating_group_ready: 'true' }),
      saveNote: vi.fn().mockImplementation(async (note: Note) => { const copy = structuredClone(note); saved.set(copy.id, copy); return copy; }),
      reportRendererError: vi.fn().mockResolvedValue(true),
    };
    vi.stubGlobal('cyberNotesAPI', new Proxy(api, { get(target, key) {
      if (key in target) return target[key as keyof typeof target];
      if (String(key).startsWith('on')) return () => () => {};
      return vi.fn().mockResolvedValue(true);
    } }));
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear();
  });

  it('creates an empty note and persists it as a favorite when dropped from the actual note list', async () => {
    const noop = () => {};
    await act(async () => root.render(<MainApp language="es" onLanguageChange={noop} currentTheme="cyber-dark" onThemeChange={noop}
      colorIntensity={1} onIntensityChange={noop} onLock={noop} autoLockMinutes={0} onAutoLockChange={noop} />));
    const create = host.querySelector<HTMLButtonElement>(`button[aria-label="${TRANSLATIONS.es.noteList.addNote}"]`)!;
    expect(create).not.toBeNull();
    await act(async () => create.click());
    expect(saved.size).toBe(1);
    const note = [...saved.values()][0];
    expect(note.pinned).toBe(0);
    const card = host.querySelector<HTMLElement>(`.note-item[data-note-id="${note.id}"]`)!;
    const values = new Map<string, string>();
    const data = { types: [] as string[], effectAllowed: 'none', dropEffect: 'none',
      setData: (key: string, value: string) => { values.set(key, value); data.types = [...values.keys()]; },
      getData: (key: string) => values.get(key) ?? '',
    };
    const drag = (type: string) => { const event = new Event(type, { bubbles: true, cancelable: true }); Object.defineProperty(event, 'dataTransfer', { value: data }); return event; };
    await act(async () => card.dispatchEvent(drag('dragstart')));
    const favorite = [...host.querySelectorAll<HTMLButtonElement>('.sidebar-glass button')].find(button => button.textContent?.includes('Favoritos'))!;
    await act(async () => favorite.dispatchEvent(drag('dragover')));
    await act(async () => favorite.dispatchEvent(drag('drop')));
    expect(saved.get(note.id)?.pinned).toBe(1);
    expect(saved.get(note.id)?.content).toBe('');
    expect(host.querySelector('.note-selection-error')).toBeNull();
    expect(window.cyberNotesAPI.reportRendererError).not.toHaveBeenCalled();
  });
});
