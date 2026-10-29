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
    const snapshots: string[] = [];
    const observer = new MutationObserver(() => snapshots.push(minimap.textContent || ''));
    observer.observe(minimap, { childList: true });
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
    observer.disconnect();
  });

  it('copies rich content to the minimap without moving editor nodes or embedding a second player', async () => {
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
    const props: ComponentProps<typeof NoteEditor> = {
      language: 'es', note: { ...note, content: '<p><strong>Formatted</strong> <a href="https://example.com">link</a></p>'
        + '<pre><code>  code\n\tline</code></pre><blockquote><p>Quote</p></blockquote>'
        + `<img src="${image}" width="180" />`
        + '<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>'
        + '<div data-video-embed data-video-src="about:blank" data-provider="youtube"></div><p></p>' },
      onSave: vi.fn(), onCreateNote: vi.fn(), layoutMode: 1, onToggleLayout: vi.fn(),
      showMinimap: true, showLineCounter: false, showFloatingToolbar: false,
    };
    await act(async () => root!.render(<NoteEditor {...props} />));
    const dom = container!.querySelector<HTMLElement>('.tiptap')!;
    const editor = (dom as HTMLElement & { editor: Editor }).editor;
    const sourceImage = dom.querySelector<HTMLImageElement>('img')!;
    let imagePos = 0;
    editor.state.doc.descendants((node, pos) => { if (node.type.name === 'image') imagePos = pos; });
    await act(async () => {
      editor.commands.setNodeSelection(imagePos);
      dom.querySelector<HTMLButtonElement>('.video-embed-preview')!.click();
    });
    expect(dom.querySelector('iframe')).not.toBeNull();
    expect(sourceImage.classList.contains('ProseMirror-selectednode')).toBe(true);
    const html = editor.getHTML();
    await act(async () => { vi.advanceTimersToNextFrame(); });
    await act(async () => { vi.advanceTimersToNextFrame(); });
    const minimap = container!.querySelector<HTMLElement>('.minimap-prose')!;
    expect(minimap.querySelector('strong')?.textContent).toBe('Formatted');
    expect(minimap.querySelector('a')?.getAttribute('href')).toBe('https://example.com');
    expect(minimap.querySelector('code')?.textContent).toBe('  code\n\tline');
    expect(minimap.querySelector('.copyable-quote-content')?.textContent).toBe('Quote');
    expect(minimap.querySelector('td')?.textContent).toBe('Cell');
    expect(minimap.querySelector('img')?.getAttribute('src')).toBe(image);
    expect(minimap.querySelector('img')?.style.cssText).toBe(sourceImage.style.cssText);
    expect(minimap.querySelector('img')).not.toBe(sourceImage);
    expect(minimap.querySelector('iframe')).toBeNull();
    expect(minimap.querySelector('.minimap-media-ph')?.textContent).toBe('▶');
    expect(minimap.querySelector('.ProseMirror-selectednode,[data-placeholder]')).toBeNull();
    expect(dom.querySelector('img')).toBe(sourceImage);
    expect(dom.querySelector('iframe')).not.toBeNull();
    expect(editor.getHTML()).toBe(html);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('waits for idle time after the editor frame and cancels obsolete minimap work', async () => {
    const callbacks = new Map<number, IdleRequestCallback>();
    let id = 0;
    const request = vi.fn((callback: IdleRequestCallback) => {
      callbacks.set(++id, callback);
      return id;
    });
    const cancel = vi.fn((handle: number) => { callbacks.delete(handle); });
    vi.stubGlobal('requestIdleCallback', request);
    vi.stubGlobal('cancelIdleCallback', cancel);
    const props: ComponentProps<typeof NoteEditor> = {
      language: 'en', note, onSave: vi.fn(), onCreateNote: vi.fn(),
      layoutMode: 1, onToggleLayout: vi.fn(), showLineCounter: false,
      showFloatingToolbar: false, showMinimap: true,
    };
    await act(async () => root!.render(<NoteEditor {...props} />));
    const minimap = container!.querySelector<HTMLElement>('.minimap-prose')!;
    await act(async () => { vi.advanceTimersToNextFrame(); });
    expect(minimap.textContent).toBe('');
    expect(request).toHaveBeenLastCalledWith(expect.any(Function), { timeout: 200 });
    expect(callbacks.size).toBe(1);
    const oldHandle = [...callbacks.keys()][0];

    await act(async () => root!.render(<NoteEditor {...props} note={{ ...note, id: 'latest', content: '<p>Latest body</p>' }} />));
    expect(cancel).toHaveBeenCalledWith(oldHandle);
    await act(async () => { vi.advanceTimersToNextFrame(); });
    expect(callbacks.size).toBe(1);
    expect(container!.querySelector('.tiptap')?.textContent).toBe('Latest body');
    expect(minimap.textContent).toBe('');
    const runIdle = () => {
      const pending = [...callbacks.values()];
      callbacks.clear();
      pending.forEach(callback => callback({ didTimeout: false, timeRemaining: () => 50 }));
    };
    await act(async () => runIdle());
    expect(minimap.textContent).toBe('Latest body');

    await act(async () => root!.render(<NoteEditor {...props} />));
    await act(async () => { vi.advanceTimersToNextFrame(); });
    expect(callbacks.size).toBe(1);
    await act(async () => root!.unmount());
    root = undefined;
    expect(callbacks.size).toBe(0);
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
