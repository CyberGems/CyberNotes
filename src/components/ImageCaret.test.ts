// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { NodeSelection } from '@tiptap/pm/state';
import type { DecorationSet } from '@tiptap/pm/view';
import { ImageCaret, imageCaretPluginKey } from '../utils/imageCaret';

function getPlugin(editor: Editor) {
  const plugin = editor.state.plugins.find(p => (p as any).key === (imageCaretPluginKey as any).key);
  if (!plugin) throw new Error('Plugin not found');
  return plugin;
}

function getDecos(editor: Editor): DecorationSet {
  const plugin = getPlugin(editor);
  const fn = plugin.props.decorations as any;
  return fn ? fn.call(plugin, editor.state) : ({} as DecorationSet);
}

function getAttrs(editor: Editor): { [name: string]: string } {
  const plugin = getPlugin(editor);
  const fn = plugin.props.attributes as any;
  return typeof fn === 'function' ? fn.call(plugin, editor.state) : {};
}

describe('ImageCaret Extension', () => {
  it('adds widget decoration and has-image-caret class when cursor is before an inline image', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        Image.configure({ inline: true, allowBase64: true }),
        ImageCaret,
      ],
      content: '<p><img src="data:image/png;base64,123" /></p>',
    });

    // Pos 1 is inside <p> before <img>
    editor.commands.setTextSelection(1);

    const decos = getDecos(editor);
    const found = decos.find();
    expect(found.length).toBe(1);
    expect((found[0] as any).type.toDOM.className).toContain('editor-image-caret is-before');

    const attrs = getAttrs(editor);
    expect(attrs.class).toBe('has-image-caret');

    editor.destroy();
  });

  it('adds widget decoration when cursor is after an inline image', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        Image.configure({ inline: true, allowBase64: true }),
        ImageCaret,
      ],
      content: '<p><img src="data:image/png;base64,123" /></p>',
    });

    // Pos 2 is inside <p> after <img>
    editor.commands.setTextSelection(2);

    const decos = getDecos(editor);
    const found = decos.find();
    expect(found.length).toBe(1);
    expect((found[0] as any).type.toDOM.className).toContain('editor-image-caret is-after');

    editor.destroy();
  });

  it('does NOT add decoration when cursor is in plain text', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        Image.configure({ inline: true, allowBase64: true }),
        ImageCaret,
      ],
      content: '<p>Hello world</p>',
    });

    editor.commands.setTextSelection(3);

    const decos = getDecos(editor);
    const found = decos.find();
    expect(found.length).toBe(0);

    const attrs = getAttrs(editor);
    expect(attrs.class).toBeUndefined();

    editor.destroy();
  });

  it('does NOT add decoration when image is selected via NodeSelection', () => {
    const editor = new Editor({
      extensions: [
        StarterKit,
        Image.configure({ inline: true, allowBase64: true }),
        ImageCaret,
      ],
      content: '<p><img src="data:image/png;base64,123" /></p>',
    });

    // NodeSelection at pos 1 selects the image itself
    const nodeSel = NodeSelection.create(editor.state.doc, 1);
    editor.view.dispatch(editor.state.tr.setSelection(nodeSel));

    const decos = getDecos(editor);
    const found = decos.find();
    expect(found.length).toBe(0);

    const attrs = getAttrs(editor);
    expect(attrs.class).toBeUndefined();

    editor.destroy();
  });
});
