// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomTextStyle, FloatingFontSizeSelect, getSelectionFontSizes } from './NoteEditor';
import type { Language } from '../languages';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('floating font size menu', () => {
  let editor: Editor;
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const scrollDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  beforeEach(() => {
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    editor?.destroy();
    container.remove();
    vi.restoreAllMocks();
    if (scrollDescriptor) Object.defineProperty(Element.prototype, 'scrollIntoView', scrollDescriptor);
    else delete (Element.prototype as Partial<Element>).scrollIntoView;
  });
  function mount(content: string, from: number, to: number, language: Language = 'es') {
    editor = new Editor({
      extensions: [StarterKit, CustomTextStyle], content,
      // jsdom has no browser layout for scrolling Undo's selection into view.
      editorProps: { handleScrollToSelection: () => true },
    });
    editor.commands.setTextSelection({ from, to });
    render(language);
  }
  function render(language: Language) {
    act(() => root.render(<>
      <EditorContent editor={editor} />
      <div onMouseDown={event => event.preventDefault()}>
        <FloatingFontSizeSelect editor={editor} language={language} />
      </div>
    </>));
  }
  const trigger = () => container.querySelector<HTMLButtonElement>('[data-floating-font-size]')!;
  const menu = () => document.querySelector<HTMLElement>('[data-floating-font-menu]');
  function key(value: string) {
    act(() => { trigger().dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); });
  }

  it('shows inherited size and opens or cancels without changing the document', () => {
    mount('<h1>Title</h1>', 1, 6);
    const html = editor.getHTML();
    const updated = vi.fn();
    editor.on('update', updated);
    expect(trigger().textContent).toContain('30');
    act(() => trigger().click());
    expect(menu()?.querySelector('[aria-selected="true"]')?.textContent).toBe('30');
    expect(menu()?.querySelector('input')).toBeNull();
    expect(editor.getHTML()).toBe(html);
    key('ArrowDown');
    key('Escape');
    expect(menu()).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(editor.getHTML()).toBe(html);
    expect(updated).not.toHaveBeenCalled();
  });

  it('shows mixed sizes in both languages without normalizing them when opened', () => {
    mount('<p><span style="font-size: 18px">Hello</span><span style="font-size: 24px"> world</span></p>', 1, 12);
    const html = editor.getHTML();
    expect(trigger().textContent).toContain('Mixto');
    act(() => trigger().click());
    expect(menu()?.querySelector('[aria-selected="true"]')).toBeNull();
    key('Escape');
    render('en');
    expect(trigger().textContent).toContain('Mixed');
    act(() => trigger().click());
    expect(menu()?.getAttribute('aria-label')).toBe('Font size');
    expect(editor.getHTML()).toBe(html);
  });

  it('applies the chosen size to the selection, preserves other formatting and supports Undo', () => {
    mount('<p>Before <strong>target</strong> after</p>', 8, 14);
    const html = editor.getHTML();
    act(() => trigger().click());
    const option = Array.from(menu()!.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(button => button.textContent === '24')!;
    act(() => option.click());
    expect(menu()).toBeNull();
    expect(editor.state.selection.from).toBe(8);
    expect(editor.state.selection.to).toBe(14);
    expect(getSelectionFontSizes(editor, 15)).toEqual([24]);
    expect(editor.isActive('bold')).toBe(true);
    expect(editor.state.doc.nodeAt(1)?.marks).toEqual([]);
    act(() => { editor.commands.undo(); });
    expect(editor.getHTML()).toBe(html);
  });

  it('displays custom sizes already set in the editor and supports keyboard choice and reset', () => {
    mount('<p><span style="font-size: 23px">Custom</span></p>', 1, 7);
    expect(trigger().textContent).toContain('23');
    key('ArrowDown');
    expect(menu()?.querySelector('[aria-selected="true"]')?.textContent).toBe('23');
    key('ArrowDown');
    key('Enter');
    expect(getSelectionFontSizes(editor, 15)).toEqual([24]);
    key('ArrowDown');
    key('End');
    key('Enter');
    expect(editor.getAttributes('textStyle').fontSize).toBeUndefined();
    expect(getSelectionFontSizes(editor, 15)).toEqual([15]);
  });

  it('dismisses on selection changes or outside presses without stealing focus', () => {
    mount('<p>Hello world</p>', 1, 6);
    act(() => trigger().click());
    act(() => { editor.commands.setTextSelection({ from: 7, to: 12 }); });
    expect(menu()).toBeNull();
    const html = editor.getHTML();
    act(() => trigger().click());
    const input = document.createElement('input');
    document.body.append(input);
    act(() => {
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      input.focus();
    });
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(input);
    expect(editor.getHTML()).toBe(html);
    input.remove();
  });
});
