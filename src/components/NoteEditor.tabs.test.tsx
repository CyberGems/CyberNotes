// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteEditor from './NoteEditor';
import type { Note } from '../types';

// Floating menu positioning needs browser layout; this test exercises the real
// editor and tab hydration without the unrelated popper integration.
vi.mock('@tiptap/react', async importOriginal => {
  const original = await importOriginal<typeof import('@tiptap/react')>();
  return { ...original, BubbleMenu: () => null };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('NoteEditor tab hydration', () => {
  const scrollToDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
  let root: ReturnType<typeof createRoot> | undefined;
  let container: HTMLDivElement | undefined;
  const note: Note = {
    id: 'first', title: 'First note', content: '<p>First body</p>', preview: '',
    folder_id: null, pinned: 0, created_at: '2026-01-01', updated_at: '2026-01-01',
  };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
    vi.stubGlobal('cyberNotesAPI', { setUnsavedChanges: vi.fn() });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    if (root) act(() => root!.unmount());
    root = undefined;
    container?.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (scrollToDescriptor) Object.defineProperty(Element.prototype, 'scrollTo', scrollToDescriptor);
    else delete (Element.prototype as Partial<Element>).scrollTo;
  });

  it('disables spellcheck before replacing a tab and enables it after the delay', async () => {
    const props: ComponentProps<typeof NoteEditor> = {
      language: 'es', note, onSave: vi.fn(), onCreateNote: vi.fn(),
      layoutMode: 1, onToggleLayout: vi.fn(), showLineCounter: false,
      showFloatingToolbar: false,
    };
    await act(async () => root!.render(<NoteEditor {...props} />));
    const dom = container!.querySelector<HTMLElement>('.tiptap')!;
    const editor = (dom as HTMLElement & { editor: Editor }).editor;
    await act(async () => { vi.advanceTimersByTime(450); });
    expect(dom.getAttribute('spellcheck')).toBe('true');

    const duringLoad: (string | null)[] = [];
    editor.on('beforeTransaction', () => duringLoad.push(dom.getAttribute('spellcheck')));
    await act(async () => root!.render(<NoteEditor {...props} note={{
      ...note, id: 'second', title: 'Second note', content: '<p>Second body</p>',
    }} />));
    expect(duringLoad.length).toBeGreaterThan(0);
    expect(duringLoad.every(value => value === 'false')).toBe(true);
    expect(dom.textContent).toBe('Second body');
    expect(dom.getAttribute('spellcheck')).toBe('false');
    await act(async () => { vi.advanceTimersByTime(450); });
    expect(dom.getAttribute('spellcheck')).toBe('true');
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('lets the editor paint first and coalesces minimap refreshes to the latest tab', async () => {
    const props: ComponentProps<typeof NoteEditor> = {
      language: 'es', note, onSave: vi.fn(), onCreateNote: vi.fn(),
      layoutMode: 1, onToggleLayout: vi.fn(), showLineCounter: false,
      showFloatingToolbar: false, showMinimap: true,
    };
    await act(async () => root!.render(<NoteEditor {...props} />));
    const minimap = container!.querySelector<HTMLElement>('.minimap-prose')!;
    const editor = container!.querySelector<HTMLElement>('.tiptap')!;
    const html = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!;
    const snapshots: string[] = [];
    Object.defineProperty(minimap, 'innerHTML', {
      configurable: true,
      get: () => html.get!.call(minimap),
      set: (value: string) => { snapshots.push(value); html.set!.call(minimap, value); },
    });
    await act(async () => { vi.advanceTimersToNextFrame(); });
    expect(editor.textContent).toBe('First body');
    expect(snapshots).toEqual([]);

    const second = { ...note, id: 'second', content: '<p>Second body</p>' };
    await act(async () => root!.render(<NoteEditor {...props} note={second} />));
    await act(async () => { vi.advanceTimersToNextFrame(); });
    const latest = { ...note, id: 'latest', content: '<p>Latest body</p>' };
    await act(async () => root!.render(<NoteEditor {...props} note={latest} />));
    await act(async () => { vi.advanceTimersToNextFrame(); });
    expect(editor.textContent).toBe('Latest body');
    expect(snapshots).toEqual([]);
    await act(async () => { vi.advanceTimersToNextFrame(); });
    expect(snapshots).toHaveLength(1);
    expect(minimap.textContent).toBe('Latest body');
    expect(props.onSave).not.toHaveBeenCalled();

    await act(async () => root!.render(<NoteEditor {...props} note={note} />));
    await act(async () => root!.unmount());
    root = undefined;
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(snapshots).toHaveLength(1);
  });
});
