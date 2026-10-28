// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CopyableBlockquote, CopyableCodeBlock } from './CopyableBlocks';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('copyable editor blocks', () => {
  afterEach(() => {
    document.documentElement.lang = '';
    vi.restoreAllMocks();
  });

  it('copies plain block text without storing the copy controls in note HTML', async () => {
    document.documentElement.lang = 'es';
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const editor = new Editor({
      extensions: [
        StarterKit.configure({ codeBlock: false, blockquote: false }),
        CopyableCodeBlock,
        CopyableBlockquote,
      ],
      content: '<pre><code>const answer = 42;</code></pre><blockquote><p>Primera línea</p><p>Segunda línea</p></blockquote>',
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(<EditorContent editor={editor} />));
      const codeButton = container.querySelector<HTMLButtonElement>('.copyable-code-block .copyable-block-button');
      const quoteButton = container.querySelector<HTMLButtonElement>('.copyable-quote-block .copyable-block-button');
      expect(codeButton?.textContent).toBe('Copiar');
      expect(quoteButton?.textContent).toBe('Copiar');

      await act(async () => codeButton!.click());
      expect(writeText).toHaveBeenLastCalledWith('const answer = 42;');
      await act(async () => quoteButton!.click());
      expect(writeText).toHaveBeenLastCalledWith('Primera línea\nSegunda línea');

      expect(editor.getHTML()).toContain('<pre><code>const answer = 42;</code></pre>');
      expect(editor.getHTML()).toContain('<blockquote><p>Primera línea</p><p>Segunda línea</p></blockquote>');
      expect(editor.getHTML()).not.toContain('Copiar');

      await act(async () => { document.documentElement.lang = 'en'; });
      expect(quoteButton?.textContent).toBe('Copied');
    } finally {
      await act(async () => root.unmount());
      editor.destroy();
      container.remove();
    }
  });
});
