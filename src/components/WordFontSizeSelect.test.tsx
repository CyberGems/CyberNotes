// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { CustomTextStyle, WordFontSizeSelect } from './NoteEditor';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./Tooltip', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

function makeEditor(content: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      CustomTextStyle,
    ],
    content,
  });
}

describe('WordFontSizeSelect', () => {
  let container: HTMLDivElement | null = null;
  let editor: Editor | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) {
      act(() => root!.unmount());
      root = null;
    }
    container?.remove();
    container = null;
    editor?.destroy();
    editor = null;
  });

  function render(editorInstance: Editor) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root!.render(
        <WordFontSizeSelect editor={editorInstance} language="es" defaultSize={15} />,
      );
    });
    return container.querySelector('input[data-word-combo="size"]') as HTMLInputElement
      ?? container.querySelector('input') as HTMLInputElement;
  }

  it('muestra el tamaño base 15 cuando el cursor no tiene formato', () => {
    editor = makeEditor('<p>Hola</p>');
    const input = render(editor);
    expect(input.value).toBe('15');
  });

  it('muestra una raya cuando la selección mezcla varios tamaños', () => {
    editor = makeEditor(
      '<p><span style="font-size: 18px">Hola</span><span style="font-size: 24px"> mundo</span></p>',
    );
    editor.commands.setTextSelection({ from: 1, to: 12 });
    const input = render(editor);
    expect(input.value).toBe('-');
  });

  it('muestra el tamaño único cuando toda la selección comparte formato', () => {
    editor = makeEditor('<p><span style="font-size: 24px">Hola mundo</span></p>');
    editor.commands.setTextSelection({ from: 1, to: 11 });
    const input = render(editor);
    expect(input.value).toBe('24');
  });
});
