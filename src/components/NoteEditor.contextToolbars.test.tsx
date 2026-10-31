// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteEditor from './NoteEditor';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('temporary context toolbar dismissal', () => {
  const scrollToDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let editor: Editor;
  let props: ComponentProps<typeof NoteEditor>;
  const setSetting = vi.fn();
  let contextListener: ((data: unknown) => void) | null;
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

  beforeEach(() => {
    // Keep real timers: Motion captures RAF at import time, before test setup.
    // Mixing that RAF with a fake clock can leave exit animations unfinished.
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    contextListener = null;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => '' } });
    vi.stubGlobal('cyberNotesAPI', { setUnsavedChanges: vi.fn(), setSetting, onContextMenuData: (listener: typeof contextListener) => { contextListener = listener; return () => { contextListener = null; }; } });
    setSetting.mockClear();
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    props = {
      language: 'es',
      note: { id: 'toolbars', title: 'Toolbars', content: '<p>Select this text</p><img src="file:///first.png"><img src="file:///second.png">',
        folder_id: null, pinned: 0, preview: '', created_at: '2026-01-01', updated_at: '2026-01-01' },
      onSave: vi.fn(), onCreateNote: vi.fn(), layoutMode: 1, onToggleLayout: vi.fn(),
      showLineCounter: false, showFloatingToolbar: true, showImageToolbar: true,
    };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
    else Reflect.deleteProperty(navigator, 'clipboard');
    if (scrollToDescriptor) Object.defineProperty(Element.prototype, 'scrollTo', scrollToDescriptor);
    else Reflect.deleteProperty(Element.prototype, 'scrollTo');
  });

  async function render() {
    await act(async () => root.render(<NoteEditor {...props} />));
    editor = (container.querySelector('.tiptap') as HTMLElement & { editor: Editor }).editor;
    editor.view.setProps({ handleScrollToSelection: () => true });
    vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({ top: 100, bottom: 120, left: 20, right: 30 });
  }

  async function settle() {
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 400)); });
  }

  function textToolbarVisible() {
    return !!document.querySelector('.tippy-box[data-state="visible"] [data-editor-toolbar="text"]');
  }

  it('hides only the current image toolbar and preserves selection and note content', async () => {
    await render();
    await act(async () => { editor.commands.setNodeSelection(18); });
    const selection = editor.state.selection;
    const html = editor.getHTML();
    expect(container.querySelector('[data-editor-toolbar="image"]')).not.toBeNull();
    await act(async () => { container.querySelector<HTMLButtonElement>('[aria-label="Ocultar barra de imagen"]')!.click(); });
    await settle();
    expect(container.querySelector('[data-editor-toolbar="image"]')).toBeNull();
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(editor.getHTML()).toBe(html);
    expect(setSetting).not.toHaveBeenCalled();

    await act(async () => { editor.commands.updateAttributes('image', { width: '40%' }); });
    await settle();
    expect(container.querySelector('[data-editor-toolbar="image"]')).toBeNull();
    await act(async () => { editor.commands.setNodeSelection(19); });
    expect(container.querySelector('[data-editor-toolbar="image"]')).not.toBeNull();
    await act(async () => { editor.commands.setTextSelection(1); editor.commands.setNodeSelection(18); });
    expect(container.querySelector('[data-editor-toolbar="image"]')).not.toBeNull();
  });

  it('hides the real text bubble without collapsing its selection, then returns for a new selection', async () => {
    await render();
    await act(async () => { editor.commands.setTextSelection({ from: 1, to: 7 }); editor.view.focus(); });
    await settle();
    expect(textToolbarVisible()).toBe(true);
    const selection = editor.state.selection;
    const html = editor.getHTML();
    const close = document.querySelector<HTMLButtonElement>('[aria-label="Ocultar barra de texto"]')!;
    await act(async () => close.click());
    await settle();
    expect(textToolbarVisible()).toBe(false);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(editor.getHTML()).toBe(html);
    expect(editor.can().undo()).toBe(false);
    expect(setSetting).not.toHaveBeenCalled();

    await act(async () => { editor.commands.toggleBold(); });
    await settle();
    expect(textToolbarVisible()).toBe(false);
    await act(async () => { editor.commands.setTextSelection({ from: 8, to: 12 }); });
    await settle();
    expect(textToolbarVisible()).toBe(true);
  });

  it('dismisses the text bubble for the current selection when opening a context menu', async () => {
    await render();
    await act(async () => { editor.commands.setTextSelection({ from: 1, to: 7 }); editor.view.focus(); });
    await settle(); expect(textToolbarVisible()).toBe(true);
    const selection = editor.state.selection, html = editor.getHTML();
    await act(async () => {
      editor.view.dom.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
      contextListener?.({ x: 80, y: 90, suggestions: [] });
    });
    await settle(); expect(textToolbarVisible()).toBe(false);
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(editor.getHTML()).toBe(html);
    const backdrop = [...document.body.querySelectorAll<HTMLElement>('div')].find(el => el.style.zIndex === '99999')!;
    await act(async () => backdrop.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
    await act(async () => editor.view.focus());
    await settle(); expect(textToolbarVisible()).toBe(false);
    await act(async () => { editor.commands.setTextSelection({ from: 8, to: 12 }); editor.view.focus(); });
    await settle(); expect(textToolbarVisible()).toBe(true);
    expect(editor.getHTML()).toBe(html);
    expect(editor.can().undo()).toBe(false);
    expect(setSetting).not.toHaveBeenCalled();
  });

  it('honors the persistent toolbar preferences even for new selections', async () => {
    props = { ...props, showFloatingToolbar: false, showImageToolbar: false, showTableToolbar: false,
      note: { ...props.note!, content: props.note!.content + '<table><tr><td><p>Cell</p></td></tr></table>' } };
    await render();
    await act(async () => { editor.commands.setNodeSelection(18); });
    expect(container.querySelector('[data-editor-toolbar="image"]')).toBeNull();
    await act(async () => { editor.commands.setTextSelection({ from: 1, to: 7 }); editor.view.focus(); });
    await settle();
    expect(textToolbarVisible()).toBe(false);
    await act(async () => {
      editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock && node.textContent === 'Cell') editor.commands.setTextSelection(pos + 1);
      });
    });
    expect(container.querySelector('[data-editor-toolbar="table"]')).toBeNull();
    props = { ...props, showTableToolbar: true };
    await act(async () => root.render(<NoteEditor {...props} />));
    expect(container.querySelector('[data-editor-toolbar="table"]')).not.toBeNull();
    props = { ...props, showTableToolbar: false };
    await act(async () => root.render(<NoteEditor {...props} />));
    await settle();
    expect(container.querySelector('[data-editor-toolbar="table"]')).toBeNull();
  });

  it('keeps a table toolbar dismissed while editing that table, and reopens on reentry or another table', async () => {
    props = { ...props, note: { ...props.note!, content: '<p>Outside</p><table><tr><td><p>First cell</p></td><td><p>Other cell</p></td></tr></table><p>Between</p><table><tr><td><p>Second table</p></td></tr></table>' } };
    await render();
    const selectText = (text: string) => {
      editor.state.doc.descendants((node, pos) => {
        if (node.isTextblock && node.textContent === text) editor.commands.setTextSelection(pos + 1);
      });
    };
    await act(async () => selectText('First cell'));
    await settle();
    expect(container.querySelector('[data-editor-toolbar="table"]')).not.toBeNull();
    const selection = editor.state.selection;
    const html = editor.getHTML();
    const close = () => container.querySelector<HTMLButtonElement>('[aria-label="Ocultar barra de tabla"]')!.click();
    await act(async () => close());
    await settle();
    expect(container.querySelector('[data-editor-toolbar="table"]')).toBeNull();
    expect(editor.state.selection.eq(selection)).toBe(true);
    expect(editor.getHTML()).toBe(html);
    expect(editor.can().undo()).toBe(false);
    expect(setSetting).not.toHaveBeenCalled();

    await act(async () => { editor.commands.insertContent('New '); });
    await act(async () => selectText('Other cell'));
    await settle();
    expect(container.querySelector('[data-editor-toolbar="table"]')).toBeNull();
    await act(async () => { selectText('Outside'); selectText('Other cell'); });
    await settle();
    expect(container.querySelector('[data-editor-toolbar="table"]')).not.toBeNull();
    await act(async () => close());
    await settle();
    await act(async () => selectText('Second table'));
    expect(container.querySelector('[data-editor-toolbar="table"]')).not.toBeNull();
  });
});
