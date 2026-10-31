// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_HIDDEN_TOOLBAR_IDS } from '../../shared/toolbarDefaults';
import MainApp from './MainApp';
import { toNoteMeta } from '../utils/notes';
import type { Note } from '../types';

vi.mock('./TitleBar', () => ({ default: () => null }));
vi.mock('./SettingsModal', () => ({ default: () => null }));
vi.mock('./AboutModal', () => ({ default: () => null }));
vi.mock('./TrayPinModal', () => ({ default: () => null }));
vi.mock('./UpdaterBanner', () => ({ default: () => null }));
vi.mock('../utils/audio', () => ({ playSynthSound: vi.fn() }));
vi.mock('@tiptap/react', async importOriginal => {
  const original = await importOriginal<typeof import('@tiptap/react')>();
  return { ...original, BubbleMenu: () => null };
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('choosing an empty editor', () => {
  const scrollToDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
  let root: ReturnType<typeof createRoot>;
  let host: HTMLDivElement;
  let saved: Map<string, Note>;
  let settings: Record<string, string>;
  let stickyIds: string[];
  beforeEach(() => {
    vi.useFakeTimers(); localStorage.clear();
    saved = new Map(['first', 'second'].map(id => [id, { id, title: id, content: `<p>${id} body</p>`, preview: '', pinned: 0,
      folder_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }]));
    settings = { note_list_group_by_date: 'false', note_list_floating_group_ready: 'true', show_floating_toolbar: 'false' };
    stickyIds = [];
    vi.stubGlobal('innerWidth', 1400);
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
    const api = {
      getFolders: vi.fn().mockResolvedValue([]),
      getAllNotes: vi.fn().mockImplementation(async () => [...saved.values()].map(toNoteMeta)),
      getNotesByFolder: vi.fn().mockImplementation(async folder => [...saved.values()].filter(note => folder !== 'favorites' || note.pinned === 1).map(toNoteMeta)),
      getNoteById: vi.fn().mockImplementation(async id => saved.get(id) ?? null),
      getDrafts: vi.fn().mockResolvedValue([]), getTrashCount: vi.fn().mockResolvedValue(0), getTrashNotes: vi.fn().mockResolvedValue([]),
      getOpenStickyNotes: vi.fn().mockImplementation(async () => stickyIds),
      getSetting: vi.fn().mockImplementation(async key => settings[key] ?? null),
      getSettings: vi.fn().mockImplementation(async () => settings),
      setSetting: vi.fn().mockImplementation(async (key, value) => { settings[key] = value; return true; }),
      saveNote: vi.fn().mockImplementation(async (note: Note) => { const copy = structuredClone(note); saved.set(copy.id, copy); return copy; }),
      deleteNote: vi.fn().mockImplementation(async id => saved.delete(id)),
      saveDraft: vi.fn().mockResolvedValue(true), deleteDraft: vi.fn().mockResolvedValue(true),
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
    if (scrollToDescriptor) Object.defineProperty(Element.prototype, 'scrollTo', scrollToDescriptor);
    else delete (Element.prototype as Partial<Element>).scrollTo;
  });
  async function render(language: 'es' | 'en' = 'es') {
    const noop = () => {};
    await act(async () => root.render(<MainApp language={language} onLanguageChange={noop} currentTheme="cyber-dark" onThemeChange={noop}
      colorIntensity={1} onIntensityChange={noop} onLock={noop} autoLockMinutes={0} onAutoLockChange={noop} />));
  }
  const list = () => host.querySelector<HTMLElement>('[data-notelist-container]')!;
  const card = (id: string) => list().querySelector<HTMLElement>(`.note-item[data-note-id="${id}"]`)!;
  const empty = () => host.querySelector('.editor-empty-state');
  const editor = () => (host.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
  async function select(id = 'first') {
    await act(async () => card(id).click());
    editor().view.setProps({ handleScrollToSelection: () => true });
  }
  async function deselect() { await act(async () => (host.querySelector('[aria-label="Deseleccionar nota"]') as HTMLElement).click()); }
  async function trashFromContext(id: string) {
    await act(async () => card(id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })));
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Eliminar')!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('[data-leave-guard="modal"] .modal-action-btn.is-save')!.click());
  }

  it.each([
    { name: 'new profile', value: JSON.stringify(DEFAULT_HIDDEN_TOOLBAR_IDS), count: 8 },
    { name: 'show all', value: '[]', count: 0 },
    { name: 'custom selection', value: '["bold"]', count: 1 },
    { name: 'implicit legacy preference', value: undefined, count: 2 },
  ])('loads the saved toolbar selection without overwriting it: $name', async ({ value, count }) => {
    if (value !== undefined) settings.toolbar_hidden_ids = value;
    await render(); await select();
    const more = host.querySelector<HTMLButtonElement>('[aria-label="Más controles del editor"]');
    if (count) expect(more?.textContent?.trim()).toBe(String(count)); else expect(more).toBeNull();
    expect(window.cyberNotesAPI.setSetting).not.toHaveBeenCalledWith('toolbar_hidden_ids', expect.anything());
    expect(settings.toolbar_hidden_ids).toBe(value);
  });

  it.each(['es', 'en'] as const)('starts with the bilingual empty state and only loads a note explicitly chosen, language: %s', async language => {
    await render(language);
    expect(empty()?.textContent).toContain(language === 'es' ? 'Ninguna nota seleccionada' : 'No note selected');
    expect(window.cyberNotesAPI.getNoteById).not.toHaveBeenCalled();
    expect(list().querySelector('[aria-selected="true"]')).toBeNull();
    await select();
    expect(empty()).toBeNull();
    expect(editor().getText()).toBe('first body');
  });

  it('deleting the active note leaves an empty editor even when another note and tab remain', async () => {
    await render(); await select(); await select('second');
    await trashFromContext('second');
    expect(saved.has('second')).toBe(false);
    expect(saved.has('first')).toBe(true);
    expect(empty()).not.toBeNull();
    expect(host.querySelector('.tab-strip [data-note-id="first"]')).not.toBeNull();
    expect(list().querySelector('[aria-selected="true"]')).toBeNull();
  });

  it('deleting a different note preserves the active editor', async () => {
    await render(); await select('second'); await trashFromContext('first');
    expect(saved.has('first')).toBe(false);
    expect(empty()).toBeNull();
    expect(editor().getText()).toBe('second body');
  });

  it.each(['button', 'Escape', 'Ctrl click', 'blank click', 'clear group', 'click selected', 'selected group'])('deselects with %s while retaining the open tab and stored note', async action => {
    await render(); await select();
    if (action === 'button') await deselect();
    else if (action === 'click selected') await act(async () => card('first').click());
    else if (action === 'selected group') {
      await act(async () => list().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })));
      await act(async () => card('second').click());
    }
    else if (action === 'clear group') {
      await act(async () => list().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true, bubbles: true, cancelable: true })));
      await act(async () => (host.querySelector('[aria-label="Limpiar selección"]') as HTMLElement).click());
    }
    else if (action === 'Escape') await act(async () => list().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    else if (action === 'Ctrl click') await act(async () => card('first').dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true })));
    else {
      Object.defineProperties(list(), { clientWidth: { value: 300 }, clientHeight: { value: 600 } });
      vi.spyOn(list(), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 200, 300, 600));
      for (const [target, type] of [[list(), 'pointerdown'], [window, 'pointerup']] as const) {
        const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: 104, clientY: 220 });
        Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: 'mouse' } });
        await act(async () => target.dispatchEvent(event));
      }
    }
    expect(empty()).not.toBeNull();
    expect(saved.get('first')?.content).toBe('<p>first body</p>');
    expect(host.querySelector('.tab-strip [data-note-id="first"]')).not.toBeNull();
    expect(list().querySelector('[aria-selected="true"]')).toBeNull();
    await act(async () => (host.querySelector('.tab-strip [data-note-id="first"]') as HTMLElement).click());
    expect(editor().getText()).toBe('first body');
  });

  it.each(['save', 'discard', 'cancel'])('protects an immediate unsynchronized draft on deselection, action: %s', async action => {
    await render(); await select();
    await act(async () => { editor().commands.insertContent(' changed'); });
    await deselect();
    expect(document.body.textContent).toContain('¿Salir sin guardar?');
    expect(empty()).toBeNull();
    const buttonClass = action === 'save' ? 'is-save' : action === 'discard' ? 'is-danger' : 'is-cancel';
    await act(async () => document.querySelector<HTMLButtonElement>(`.modal-actions.is-stack .${buttonClass}`)!.click());
    expect(empty() !== null).toBe(action !== 'cancel');
    expect(saved.get('first')!.content.includes('changed')).toBe(action === 'save');
    if (action === 'cancel') expect(editor().getText()).toContain('changed');
  });

  it('flushes pending autosave before deselecting', async () => {
    settings.autosave_enabled = 'true';
    await render(); await select();
    await act(async () => { editor().commands.insertContent(' autosaved'); });
    await deselect();
    expect(empty()).not.toBeNull();
    expect(saved.get('first')?.content).toContain('autosaved');
    expect(document.querySelector('.modal-actions.is-stack')).toBeNull();
  });

  it('restores a deselected session with tabs available and keeps it empty while changing filters', async () => {
    settings.remember_last_note = 'true'; settings.open_note_ids = 'first,second'; settings.last_note_id = '';
    stickyIds = ['first']; saved.get('first')!.pinned = 1;
    await render();
    expect(empty()).not.toBeNull();
    expect(host.querySelectorAll('.tab-strip [data-note-id]')).toHaveLength(2);
    for (const label of ['Favoritos', 'Notas flotantes', 'Todas las notas']) {
      await act(async () => [...host.querySelectorAll<HTMLButtonElement>('.sidebar-glass button')].find(button => button.textContent?.includes(label))!.click());
      expect(empty()).not.toBeNull();
    }
    await act(async () => (host.querySelector('.tab-strip [data-note-id="first"]') as HTMLElement).click());
    await deselect();
    expect(settings.last_note_id).toBe('');
    expect(settings.open_note_ids).toContain('first');
  });

  async function openFourTabs() {
    for (const id of ['third', 'fourth']) saved.set(id, { ...saved.get('first')!, id, title: id, content: `<p>${id} body</p>` });
    settings.remember_last_note = 'true';
    settings.open_note_ids = 'first,second,third,fourth';
    settings.last_note_id = 'fourth';
    await render();
    editor().view.setProps({ handleScrollToSelection: () => true });
  }
  const tab = (id: string) => host.querySelector<HTMLElement>(`.tab-strip [data-note-id="${id}"]`)!;
  const activeTab = () => host.querySelector<HTMLElement>('.editor-tab.active')?.dataset.noteId ?? null;
  async function closeTab(id: string) { await act(async () => tab(id).querySelector<HTMLButtonElement>('.tab-close-btn')!.click()); }

  async function middleClose(id: string) {
    await act(async () => {
      const target = tab(id).querySelector<HTMLElement>('.editor-tab-title')!;
      for (const type of ['mousedown', 'mouseup', 'auxclick']) {
        target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 1 }));
      }
    });
  }

  it('closes inactive and active tabs with the middle button, preserving selection and the empty view', async () => {
    await openFourTabs();
    await middleClose('second');
    expect(tab('second')).toBeNull();
    expect(activeTab()).toBe('fourth');
    await middleClose('fourth');
    expect(activeTab()).toBe('third');
    expect(editor().getText()).toBe('third body');
    await deselect();
    await middleClose('third');
    expect(empty()).not.toBeNull();
    expect(activeTab()).toBeNull();
    expect(tab('third')).toBeNull();
    expect(saved.size).toBe(4);
  });

  it.each(['save', 'discard', 'cancel'])('protects the latest edits on middle close, action: %s', async action => {
    await render(); await select();
    await act(async () => { editor().commands.insertContent(' unsaved'); });
    await middleClose('first');
    expect(document.querySelector('.modal-actions.is-stack')).not.toBeNull();
    expect(tab('first')).not.toBeNull();
    const buttonClass = action === 'save' ? 'is-save' : action === 'discard' ? 'is-danger' : 'is-cancel';
    await act(async () => document.querySelector<HTMLButtonElement>(`.modal-actions.is-stack .${buttonClass}`)!.click());
    expect(tab('first') !== null).toBe(action === 'cancel');
    expect(empty() !== null).toBe(action !== 'cancel');
    expect(saved.get('first')!.content.includes('unsaved')).toBe(action === 'save');
    if (action === 'cancel') expect(editor().getText()).toContain('unsaved');
  });

  it('finishes pending autosave before closing with the middle button', async () => {
    settings.autosave_enabled = 'true';
    await render(); await select();
    await act(async () => { editor().commands.insertContent(' autosaved'); });
    await middleClose('first');
    expect(empty()).not.toBeNull();
    expect(saved.get('first')?.content).toContain('autosaved');
    expect(document.querySelector('.modal-actions.is-stack')).toBeNull();
  });

  it('selects the immediate left tab on closing the active middle tab', async () => {
    await openFourTabs();
    await act(async () => tab('third').click());
    await closeTab('third');
    expect(activeTab()).toBe('second');
    expect(editor().getText()).toBe('second body');
    expect(saved.size).toBe(4);
  });

  it('uses the right neighbor when closing the first tab', async () => {
    await openFourTabs();
    await act(async () => tab('first').click());
    await closeTab('first');
    expect(activeTab()).toBe('second');
    expect(saved.size).toBe(4);
  });

  it('returns to the empty view when closing the only open tab', async () => {
    await render(); await select(); await closeTab('first');
    expect(activeTab()).toBeNull();
    expect(empty()).not.toBeNull();
    expect(saved.size).toBe(2);
  });

  it('keeps the active tab when closing an inactive one, and preserves the empty view if none is selected', async () => {
    await openFourTabs();
    await closeTab('second');
    expect(activeTab()).toBe('fourth');
    await deselect();
    await closeTab('third');
    expect(activeTab()).toBeNull();
    expect(empty()).not.toBeNull();
  });

  it('uses the closest remaining left tab when closing tabs to the right from the tab menu', async () => {
    await openFourTabs();
    await act(async () => tab('third').click());
    await act(async () => tab('second').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 20, clientY: 20 })));
    await act(async () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent?.trim() === 'Cerrar a la derecha')!.click());
    expect(activeTab()).toBe('second');
    expect([...host.querySelectorAll<HTMLElement>('.editor-tab')].map(item => item.dataset.noteId)).toEqual(['first', 'second']);
  });

  it('chooses the left neighbor in the current tab order after reordering', async () => {
    await openFourTabs();
    const data = { getData: () => 'fourth', dropEffect: 'move' };
    const event = new MouseEvent('drop', { bubbles: true, cancelable: true, clientX: 1 });
    Object.defineProperty(event, 'dataTransfer', { value: data });
    await act(async () => tab('second').dispatchEvent(event));
    expect([...host.querySelectorAll<HTMLElement>('.editor-tab')].map(item => item.dataset.noteId)).toEqual(['first', 'second', 'fourth', 'third']);
    await act(async () => tab('third').click());
    await closeTab('third');
    expect(activeTab()).toBe('fourth');
  });

  it('still protects unsaved changes when clicking the selected note again', async () => {
    await render(); await select();
    await act(async () => { editor().commands.insertContent(' unsaved'); });
    await act(async () => card('first').click());
    expect(document.body.textContent).toContain('¿Salir sin guardar?');
    expect(empty()).toBeNull();
    await act(async () => document.querySelector<HTMLButtonElement>('.modal-actions.is-stack .is-cancel')!.click());
    expect(editor().getText()).toContain('unsaved');
  });
});
