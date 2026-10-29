// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import type { Editor } from '@tiptap/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import NoteEditor from './NoteEditor';

vi.mock('@tiptap/react', async importOriginal => {
  const original = await importOriginal<typeof import('@tiptap/react')>();
  return { ...original, BubbleMenu: () => null };
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('NoteEditor image clipboard actions', () => {
  const scrollToDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTo');
  const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
  const execCommandDescriptor = Object.getOwnPropertyDescriptor(document, 'execCommand');
  const arrayBufferDescriptor = Object.getOwnPropertyDescriptor(File.prototype, 'arrayBuffer');
  const source = 'file:///notes/images/example.png';
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;
  let editor: Editor;
  let contextData: (data: unknown) => void;
  let finishCopy: (copied: boolean) => void;
  const writeImageToClipboard = vi.fn();
  const read = vi.fn();
  const readText = vi.fn();
  const execCommand = vi.fn();
  const saveImageBinary = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    writeImageToClipboard.mockReset().mockImplementation(() => new Promise<boolean>(resolve => { finishCopy = resolve; }));
    read.mockReset().mockResolvedValue([{ types: ['image/png'] }]);
    readText.mockReset().mockResolvedValue('');
    execCommand.mockReset().mockReturnValue(false);
    saveImageBinary.mockReset().mockResolvedValue('file:///notes/images/pasted.png');
    vi.stubGlobal('cyberNotesAPI', {
      setUnsavedChanges: vi.fn(), writeImageToClipboard, saveImageBinary,
      onContextMenuData: (callback: typeof contextData) => { contextData = callback; return () => {}; },
    });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read, readText } });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    Object.defineProperty(Element.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
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
    for (const [target, key, descriptor] of [
      [Element.prototype, 'scrollTo', scrollToDescriptor],
      [navigator, 'clipboard', clipboardDescriptor],
      [document, 'execCommand', execCommandDescriptor],
      [File.prototype, 'arrayBuffer', arrayBufferDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else Reflect.deleteProperty(target, key);
    }
  });

  async function render(language: 'es' | 'en' = 'es') {
    const props: ComponentProps<typeof NoteEditor> = {
      language,
      note: { id: 'image-note', title: 'Image', content: `<img src="${source}"><p>After</p>`,
        preview: '', folder_id: null, pinned: 0, created_at: '2026-01-01', updated_at: '2026-01-01' },
      onSave: vi.fn(), onCreateNote: vi.fn(), layoutMode: 1, onToggleLayout: vi.fn(),
      showLineCounter: false, showFloatingToolbar: false, showMinimap: false,
    };
    await act(async () => root.render(<NoteEditor {...props} />));
    const dom = container.querySelector<HTMLElement>('.tiptap')!;
    editor = (dom as HTMLElement & { editor: Editor }).editor;
    editor.view.setProps({ handleScrollToSelection: () => true });
    await act(async () => { editor.commands.setNodeSelection(0); });
    return dom;
  }

  async function openMenu() {
    await act(async () => {
      editor.view.dom.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
      contextData({ x: 30, y: 30, imageSrc: source });
    });
  }

  function menuButton(label: string) {
    const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent === label);
    expect(button).toBeDefined();
    return button!;
  }

  it.each([['es', 'Cortar'], ['en', 'Cut']] as const)('copies natively before a menu cut in %s', async (language, label) => {
    await render(language);
    await openMenu();
    await act(async () => { menuButton(label).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    expect(writeImageToClipboard).toHaveBeenCalledExactlyOnceWith(source);
    expect(editor.getHTML()).toContain(source);
    expect(execCommand).not.toHaveBeenCalledWith('cut');
    await act(async () => { finishCopy(true); });
    expect(editor.getHTML()).not.toContain('<img');
    expect(editor.getText()).toBe('After');
  });

  it('intercepts the native cut event used by Ctrl+X', async () => {
    const dom = await render();
    const event = new Event('cut', { bubbles: true, cancelable: true });
    await act(async () => { dom.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(writeImageToClipboard).toHaveBeenCalledExactlyOnceWith(source);
    expect(editor.getHTML()).toContain(source);
    await act(async () => { finishCopy(true); });
    expect(editor.getHTML()).not.toContain('<img');
  });

  it('enables paste for an image-only clipboard and uses the native paste handler', async () => {
    await render();
    await openMenu();
    expect(readText).not.toHaveBeenCalled();
    expect(menuButton('Pegar').disabled).toBe(false);
    execCommand.mockReturnValue(true);
    await act(async () => { menuButton('Pegar').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    expect(execCommand).toHaveBeenCalledWith('paste');
  });

  it('saves and inserts the clipboard image if native paste is unavailable', async () => {
    await render();
    const bytes = new Uint8Array([1, 2, 3]);
    const blob = new Blob([bytes], { type: 'image/png' });
    read.mockResolvedValue([{ types: ['image/png'], getType: vi.fn().mockResolvedValue(blob) }]);
    Object.defineProperty(File.prototype, 'arrayBuffer', { configurable: true, value: vi.fn().mockResolvedValue(bytes.buffer) });
    await openMenu();
    await act(async () => { menuButton('Pegar').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true })); });
    expect(saveImageBinary).toHaveBeenCalledWith(bytes, 'image/png');
    expect(editor.getHTML()).toContain('file:///notes/images/pasted.png');
  });
});
