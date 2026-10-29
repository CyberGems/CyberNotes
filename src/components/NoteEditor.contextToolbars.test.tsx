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

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal('cyberNotesAPI', { setUnsavedChanges: vi.fn(), setSetting });
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
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
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

  it('honors the persistent toolbar preferences even for new selections', async () => {
    props = { ...props, showFloatingToolbar: false, showImageToolbar: false };
    await render();
    await act(async () => { editor.commands.setNodeSelection(18); });
    expect(container.querySelector('[data-editor-toolbar="image"]')).toBeNull();
    await act(async () => { editor.commands.setTextSelection({ from: 1, to: 7 }); editor.view.focus(); });
    await settle();
    expect(textToolbarVisible()).toBe(false);
  });
});
