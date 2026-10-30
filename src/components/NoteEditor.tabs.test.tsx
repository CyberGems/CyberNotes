// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
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
  const rangeRectsDescriptor = Object.getOwnPropertyDescriptor(Range.prototype, 'getClientRects');
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
    if (rangeRectsDescriptor) Object.defineProperty(Range.prototype, 'getClientRects', rangeRectsDescriptor);
    else delete (Range.prototype as Partial<Range>).getClientRects;
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

  it('hydrates React node views outside the React lifecycle when switching tabs', async () => {
    const errors = vi.spyOn(console, 'error');
    const props: ComponentProps<typeof NoteEditor> = {
      language: 'es', note, onSave: vi.fn(), onCreateNote: vi.fn(),
      layoutMode: 1, onToggleLayout: vi.fn(), showFloatingToolbar: false,
    };
    await act(async () => root!.render(<NoteEditor {...props} />));
    await act(async () => { vi.advanceTimersByTime(0); });
    const editor = (container!.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
    expect(editor.isInitialized).toBe(true);
    const content = '<pre><code>Second code</code></pre><blockquote><p>Second quote</p></blockquote>'
      + '<div data-video-embed data-video-src="about:blank" data-provider="youtube"></div><p>Second body</p>';
    await act(async () => root!.render(<NoteEditor {...props} note={{ ...note, id: 'second', content }} />));
    expect(container!.querySelector('.copyable-code-block code')?.textContent).toBe('Second code');
    expect(container!.querySelector('.copyable-quote-content')?.textContent).toBe('Second quote');
    expect(container!.querySelector('.video-embed-preview')).not.toBeNull();
    const editorDOM = editor.view.dom;
    for (let i = 0; i < 2; i++) {
      await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', altKey: true })); });
    }
    expect(container!.querySelector('.tiptap')).toBe(editorDOM);
    expect(editor.can().undo()).toBe(false);
    expect(errors.mock.calls.filter(args => args.some(value => String(value).includes('flushSync')))).toEqual([]);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('cancels obsolete hydration when switching again or unmounting before the microtask', async () => {
    const props: ComponentProps<typeof NoteEditor> = {
      language: 'es', note, onSave: vi.fn(), onCreateNote: vi.fn(),
      layoutMode: 1, onToggleLayout: vi.fn(), showFloatingToolbar: false,
    };
    await act(async () => root!.render(<NoteEditor {...props} />));
    const editor = (container!.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
    const loaded: string[] = [];
    editor.on('transaction', () => { loaded.push(editor.getText()); });
    const obsolete = { ...note, id: 'obsolete', content: '<p>Obsolete body</p>' };
    const latest = { ...note, id: 'latest', content: '<p>Latest body</p>' };
    await act(async () => {
      flushSync(() => root!.render(<NoteEditor {...props} note={obsolete} />));
      flushSync(() => root!.render(<NoteEditor {...props} note={latest} />));
    });
    expect(editor.getText()).toBe('Latest body');
    expect(loaded).not.toContain('Obsolete body');
    loaded.length = 0;
    await act(async () => {
      flushSync(() => root!.render(<NoteEditor {...props} note={obsolete} />));
      root!.unmount();
    });
    root = undefined;
    expect(loaded).toEqual([]);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it.each(['es', 'en'] as const)('positions More and export menus within the viewport (%s)', async language => {
    vi.stubGlobal('innerWidth', 320);
    vi.stubGlobal('innerHeight', 240);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(18, 40, 28, 28));
    await act(async () => root!.render(<NoteEditor language={language} note={note} hiddenToolbarIds={['h1', 'h2']}
      onSave={vi.fn()} onCreateNote={vi.fn()} layoutMode={1} onToggleLayout={vi.fn()} showFloatingToolbar={false} />));
    const more = () => container!.querySelector<HTMLButtonElement>(`[aria-label="${language === 'es' ? 'Más controles del editor' : 'More editor controls'}"]`)!;
    const press = async (button: HTMLElement) => {
      await act(async () => { button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); button.click(); });
    };
    await press(more());
    let menu = document.querySelector<HTMLElement>('[data-more-menu]')!;
    expect(menu.parentElement).toBe(document.body);
    expect(menu.style.position).toBe('fixed');
    expect(menu.style.left).toBe('8px');
    expect(menu.style.width).toBe('240px');
    await press(more());
    expect(document.querySelector('[data-more-menu]')).toBeNull();
    await press(more());
    vi.stubGlobal('innerWidth', 160);
    await act(async () => { window.dispatchEvent(new Event('resize')); });
    menu = document.querySelector<HTMLElement>('[data-more-menu]')!;
    expect(menu.style.left).toBe('8px');
    expect(menu.style.width).toBe('144px');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(document.querySelector('[data-more-menu]')).toBeNull();
    vi.stubGlobal('innerWidth', 320);
    const exportButton = container!.querySelector<HTMLButtonElement>(`[aria-label="${language === 'es' ? 'Exportar nota' : 'Export note'}"]`)!;
    await press(exportButton);
    const exportMenu = document.querySelector<HTMLElement>('[role="menu"][data-export-menu]')!;
    expect(exportMenu.parentElement).toBe(document.body);
    expect(exportMenu.style.position).toBe('fixed');
    expect(exportMenu.style.left).toBe('8px');
    expect(exportMenu.style.width).toBe('300px');
    await press(exportButton);
    expect(exportButton.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps More open while using a nested font menu in its portal', async () => {
    await act(async () => root!.render(<NoteEditor language="es" note={note} hiddenToolbarIds={['fontFamily']}
      onSave={vi.fn()} onCreateNote={vi.fn()} layoutMode={1} onToggleLayout={vi.fn()} showFloatingToolbar={false} />));
    await act(async () => container!.querySelector<HTMLButtonElement>('[aria-label="Más controles del editor"]')!.click());
    const family = document.querySelector<HTMLButtonElement>('[data-more-menu] [data-word-combo="family"]')!;
    await act(async () => family.click());
    const option = document.querySelector<HTMLButtonElement>('[data-word-menu]:not([data-more-menu]) .word-menu-item')!;
    await act(async () => { option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); option.click(); });
    expect(document.querySelector('[data-more-menu]')).not.toBeNull();
    expect(document.querySelector('[data-word-menu]:not([data-more-menu])')).toBeNull();
  });

  it('selects a tab on primary press once and keeps click activation, closing and dragging', async () => {
    const second = { ...note, id: 'second', title: 'Second', content: '<p>Second body</p>' };
    const select = vi.fn();
    const close = vi.fn();
    const reorder = vi.fn();
    await act(async () => root!.render(<NoteEditor
      language="es" note={note} notes={[note, second]} openNoteIds={[note.id, second.id]}
      onSave={vi.fn()} onCreateNote={vi.fn()} layoutMode={1} onToggleLayout={vi.fn()}
      onSelectNote={select} onCloseTab={close} onReorderTabs={reorder} showFloatingToolbar={false}
    />));
    const tab = container!.querySelector<HTMLElement>('[data-note-id="second"]')!;
    const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    await act(async () => { tab.dispatchEvent(press); });
    expect(select).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(select).toHaveBeenCalledExactlyOnceWith('second');
    expect(press.defaultPrevented).toBe(false);
    await act(async () => { tab.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); });
    expect(select).toHaveBeenCalledTimes(1);
    select.mockClear();
    for (const button of [1, 2]) {
      await act(async () => { tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button })); });
    }
    expect(select).not.toHaveBeenCalled();
    await act(async () => tab.click());
    expect(select).toHaveBeenCalledExactlyOnceWith('second');
    select.mockClear();

    const closeButton = tab.querySelector<HTMLButtonElement>('.tab-close-btn')!;
    await act(async () => {
      tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      closeButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
      closeButton.click();
      vi.advanceTimersByTime(0);
    });
    expect(close).toHaveBeenCalledExactlyOnceWith('second');
    expect(select).not.toHaveBeenCalled();

    const values = new Map<string, string>();
    const dataTransfer = { setData: (key: string, value: string) => values.set(key, value), getData: (key: string) => values.get(key), effectAllowed: '' };
    const drag = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(drag, 'dataTransfer', { value: dataTransfer });
    await act(async () => { tab.dispatchEvent(drag); });
    expect(drag.defaultPrevented).toBe(false);
    expect(values.get('text/plain')).toBe('second');
    const drop = new MouseEvent('drop', { bubbles: true });
    Object.defineProperty(drop, 'dataTransfer', { value: dataTransfer });
    await act(async () => { container!.querySelector('[data-note-id="first"]')!.dispatchEvent(drop); });
    expect(reorder).toHaveBeenCalledWith('second', 'first', 'after');
    select.mockClear();
    await act(async () => { tab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); });
    await act(async () => root!.unmount());
    root = undefined;
    await act(async () => { vi.advanceTimersByTime(0); });
    expect(select).not.toHaveBeenCalled();
  });

  it('closes on middle release over the title or close button without activating the tab or autoscroll', async () => {
    const second = { ...note, id: 'second', title: 'Second' };
    const select = vi.fn();
    const close = vi.fn();
    await act(async () => root!.render(<NoteEditor
      language="es" note={note} notes={[note, second]} openNoteIds={[note.id, second.id]}
      onSave={vi.fn()} onCreateNote={vi.fn()} layoutMode={1} onToggleLayout={vi.fn()}
      onSelectNote={select} onCloseTab={close} showFloatingToolbar={false}
    />));
    const tab = container!.querySelector<HTMLElement>('[data-note-id="second"]')!;
    for (const selector of ['.editor-tab-title', '.tab-close-btn']) {
      close.mockClear();
      const target = tab.querySelector<HTMLElement>(selector)!;
      const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1 });
      const release = new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 });
      await act(async () => { target.dispatchEvent(press); vi.advanceTimersByTime(0); });
      expect(press.defaultPrevented).toBe(true);
      expect(close).not.toHaveBeenCalled();
      await act(async () => {
        target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 1 }));
        target.dispatchEvent(release);
      });
      expect(release.defaultPrevented).toBe(true);
      expect(close).toHaveBeenCalledExactlyOnceWith('second');
      expect(select).not.toHaveBeenCalled();
    }
    close.mockClear();
    await act(async () => tab.dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 2 })));
    expect(close).not.toHaveBeenCalled();
  });

  it('waits for initial visible lines instead of measuring the entire document before painting', async () => {
    const callbacks: IntersectionObserverCallback[] = [];
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { callbacks.push(callback); }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON() {},
    });
    const props: ComponentProps<typeof NoteEditor> = {
      language: 'es', note, onSave: vi.fn(), onCreateNote: vi.fn(), layoutMode: 1,
      onToggleLayout: vi.fn(), showFloatingToolbar: false, showLineGutter: true, showWrapGuides: false,
    };
    await act(async () => root!.render(<NoteEditor {...props} />));
    const paragraph = container!.querySelector<HTMLElement>('.tiptap p')!;
    const editor = (container!.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
    // jsdom has no text layout; native geometry is verified in Electron.
    const caret = vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({ top: 20, bottom: 40, left: 0, right: 0 });
    const measure = vi.spyOn(paragraph, 'getBoundingClientRect');
    await act(async () => { vi.advanceTimersToNextFrame(); });
    expect(measure).not.toHaveBeenCalled();
    expect(caret).not.toHaveBeenCalled();
    expect(container!.querySelector('.line-number-mark')).toBeNull();
    const notify = (callback: IntersectionObserverCallback, target: Element) => callback([
      { target, isIntersecting: true } as IntersectionObserverEntry,
    ], {} as IntersectionObserver);
    await act(async () => { notify(callbacks[callbacks.length - 1], paragraph); vi.advanceTimersToNextFrame(); });
    expect(container!.querySelector('.line-number-mark')?.textContent).toBe('1');

    const obsolete = callbacks[callbacks.length - 1];
    await act(async () => root!.render(<NoteEditor {...props} note={{ ...note, id: 'second', content: '<p>Other</p>' }} />));
    expect(container!.querySelector('.line-number-mark')).toBeNull();
    await act(async () => { notify(obsolete, paragraph); vi.advanceTimersToNextFrame(); });
    expect(container!.querySelector('.line-number-mark')).toBeNull();
    await act(async () => {
      notify(callbacks[callbacks.length - 1], container!.querySelector('.tiptap p')!);
      vi.advanceTimersToNextFrame();
    });
    expect(container!.querySelector('.line-number-mark')?.textContent).toBe('1');

    vi.stubGlobal('IntersectionObserver', undefined);
    await act(async () => root!.render(<NoteEditor {...props} note={{ ...note, id: 'fallback', content: '<p>Fallback</p>' }} />));
    await act(async () => { vi.advanceTimersToNextFrame(); });
    expect(container!.querySelector('.line-number-mark')?.textContent).toBe('1');
  });

  it('numbers every code line from its text coordinates when only its wrapper is visible', async () => {
    let notify: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 400));
    const props: ComponentProps<typeof NoteEditor> = {
      language: 'es', note, onSave: vi.fn(), onCreateNote: vi.fn(), layoutMode: 1,
      onToggleLayout: vi.fn(), showFloatingToolbar: false, showLineGutter: true, showWrapGuides: false,
    };
    await act(async () => root!.render(<NoteEditor {...props} />));
    await act(async () => root!.render(<NoteEditor {...props} note={{
      ...note, id: 'code', content: '<pre><code>a\n\n\nb\n</code></pre><p>Offscreen</p>',
    }} />));
    const editor = (container!.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
    const positions = [1, 3, 4, 5, 7];
    const caret = vi.spyOn(editor.view, 'coordsAtPos').mockImplementation(pos => {
      const index = positions.indexOf(pos);
      if (index < 0) throw Error('Measured an offscreen line');
      return { top: 100 + index * 26, bottom: 120 + index * 26, left: 70, right: 70 };
    });
    await act(async () => {
      notify!([{ target: container!.querySelector('.node-codeBlock')!, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      vi.advanceTimersToNextFrame();
    });
    const marks = Array.from(container!.querySelectorAll<HTMLElement>('.line-number-mark'));
    expect(marks.map(mark => mark.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(marks.map(mark => mark.style.top)).toEqual(['110px', '136px', '162px', '188px', '214px']);
    expect(marks.every(mark => mark.classList.contains('is-text-line'))).toBe(true);
    expect(caret.mock.calls.map(([pos]) => pos)).toEqual(positions);
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('uses the observed code wrapper for continuation guides after its inner pre mounts', async () => {
    let notify: IntersectionObserverCallback;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 400));
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true, value: () => [new DOMRect(70, 100, 150, 24), new DOMRect(70, 132, 150, 24), new DOMRect(70, 164, 100, 24)],
    });
    await act(async () => root!.render(<NoteEditor
      language="es" note={{ ...note, content: '<pre><code>wrapped code</code></pre>' }}
      onSave={vi.fn()} onCreateNote={vi.fn()} layoutMode={1} onToggleLayout={vi.fn()}
      showFloatingToolbar={false} showLineGutter showWrapGuides
    />));
    await act(async () => {
      notify!([{ target: container!.querySelector('.node-codeBlock')!, isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
      vi.advanceTimersToNextFrame();
    });
    expect(container!.querySelector<HTMLElement>('.line-number-mark')?.style.top).toBe('112px');
    expect(Array.from(container!.querySelectorAll<HTMLElement>('.wrap-guide-mark')).map(mark => mark.style.top)).toEqual(['144px', '176px']);
    expect(container!.querySelectorAll('.wrap-guide-link')).toHaveLength(1);
  });

  it('positions blank quote lines using their actual caret height without font-size estimates', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 800, 400));
    await act(async () => root!.render(<NoteEditor
      language="es" note={{ ...note, content: '<blockquote><p><span style="font-size:24px">First<br><br>Last</span></p></blockquote>' }}
      onSave={vi.fn()} onCreateNote={vi.fn()} layoutMode={1} onToggleLayout={vi.fn()}
      showFloatingToolbar={false} showLineGutter showWrapGuides={false}
    />));
    const editor = (container!.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
    vi.spyOn(editor.view, 'coordsAtPos').mockImplementation(pos => {
      const index = [2, 8, 9].indexOf(pos);
      return { top: 100 + index * 34, bottom: 128 + index * 34, left: 70, right: 70 };
    });
    await act(async () => { vi.advanceTimersToNextFrame(); });
    expect(Array.from(container!.querySelectorAll<HTMLElement>('.line-number-mark')).map(mark => mark.style.top)).toEqual(['114px', '148px', '182px']);
  });

  it('keeps the gutter overlay inside the document when its height shrinks', async () => {
    let notify: IntersectionObserverCallback | undefined;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(callback: IntersectionObserverCallback) { notify = callback; }
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, top: 0, left: 0, right: 800, bottom: 400, width: 800, height: 400, toJSON() {},
    });
    await act(async () => root!.render(<NoteEditor
      language="es" note={note} onSave={vi.fn()} onCreateNote={vi.fn()} layoutMode={1}
      onToggleLayout={vi.fn()} showFloatingToolbar={false} showLineGutter showWrapGuides={false}
    />));
    const dom = container!.querySelector<HTMLElement>('.tiptap')!;
    const editor = (dom as HTMLElement & { editor: Editor }).editor;
    const layer = container!.querySelector<HTMLElement>('.wrap-guides-layer')!;
    const scroller = layer.parentElement!;
    Object.defineProperty(dom, 'offsetHeight', { configurable: true, value: 800 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 300 });
    scroller.scrollTop = 1400;
    vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({ top: 20, bottom: 40, left: 0, right: 0 });
    const paragraph = dom.querySelector('p')!;
    const rect = paragraph.getBoundingClientRect();
    const entry: IntersectionObserverEntry = {
      target: paragraph, isIntersecting: true, intersectionRatio: 1, time: 0,
      boundingClientRect: rect, intersectionRect: rect, rootBounds: scroller.getBoundingClientRect(),
    };
    await act(async () => {
      notify!([entry], {} as IntersectionObserver);
      vi.advanceTimersToNextFrame();
    });
    expect(parseFloat(layer.style.top) + parseFloat(layer.style.height)).toBeLessThanOrEqual(dom.offsetHeight);

    Object.defineProperty(dom, 'offsetHeight', { configurable: true, value: 400 });
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll'));
      vi.advanceTimersToNextFrame();
    });
    expect(parseFloat(layer.style.top) + parseFloat(layer.style.height)).toBeLessThanOrEqual(dom.offsetHeight);
    expect(layer.querySelector('.line-number-mark')?.textContent).toBe('1');
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
