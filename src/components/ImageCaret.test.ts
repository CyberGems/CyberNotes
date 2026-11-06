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

  describe('Click handling on selected image', () => {
    it('positions caret to the right of the image when clicking to its right', () => {
      const editor = new Editor({
        extensions: [
          StarterKit,
          Image.configure({ inline: true, allowBase64: true }),
          ImageCaret,
        ],
        content: '<p><img src="data:image/png;base64,123" /></p><p></p>',
      });

      // Select the image via NodeSelection at pos 1
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);

      // Mock bounding box for image: left: 50, right: 250, top: 20, bottom: 200
      const img = editor.view.dom.querySelector('img')!;
      img.getBoundingClientRect = () => ({
        left: 50,
        right: 250,
        top: 20,
        bottom: 200,
        width: 200,
        height: 180,
        x: 50,
        y: 20,
        toJSON: () => {},
      });

      // Click to the right of the image: x = 300, y = 100
      const handled = editor.view.someProp('handleClick', f =>
        f(editor.view, 1, {
          button: 0,
          clientX: 300,
          clientY: 100,
          target: editor.view.dom.querySelector('p')!,
          shiftKey: false,
          altKey: false,
          ctrlKey: false,
          metaKey: false,
        } as unknown as MouseEvent)
      );

      expect(handled).toBe(true);
      expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
      // Pos 2 is inside paragraph after the image
      expect(editor.state.selection.from).toBe(2);
      expect(editor.state.selection.to).toBe(2);

      editor.destroy();
    });

    it('positions caret to the left of the image when clicking to its left', () => {
      const editor = new Editor({
        extensions: [
          StarterKit,
          Image.configure({ inline: true, allowBase64: true }),
          ImageCaret,
        ],
        content: '<p><img src="data:image/png;base64,123" /></p><p></p>',
      });

      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);

      const img = editor.view.dom.querySelector('img')!;
      img.getBoundingClientRect = () => ({
        left: 100,
        right: 300,
        top: 20,
        bottom: 200,
        width: 200,
        height: 180,
        x: 100,
        y: 20,
        toJSON: () => {},
      });

      // Click to the left of the image: x = 40, y = 100
      const handled = editor.view.someProp('handleClick', f =>
        f(editor.view, 1, {
          button: 0,
          clientX: 40,
          clientY: 100,
          target: editor.view.dom.querySelector('p')!,
          shiftKey: false,
          altKey: false,
          ctrlKey: false,
          metaKey: false,
        } as unknown as MouseEvent)
      );

      expect(handled).toBe(true);
      expect(editor.state.selection).not.toBeInstanceOf(NodeSelection);
      // Pos 1 is inside paragraph before the image
      expect(editor.state.selection.from).toBe(1);
      expect(editor.state.selection.to).toBe(1);

      editor.destroy();
    });

    it('does NOT intercept clicks directly on the image element itself', () => {
      const editor = new Editor({
        extensions: [
          StarterKit,
          Image.configure({ inline: true, allowBase64: true }),
          ImageCaret,
        ],
        content: '<p><img src="data:image/png;base64,123" /></p>',
      });

      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));
      const img = editor.view.dom.querySelector('img')!;

      const handled = editor.view.someProp('handleClick', f =>
        f(editor.view, 1, {
          button: 0,
          clientX: 150,
          clientY: 100,
          target: img,
          shiftKey: false,
          altKey: false,
          ctrlKey: false,
          metaKey: false,
        } as unknown as MouseEvent)
      );

      expect(handled).toBeFalsy();
      expect(editor.state.selection).toBeInstanceOf(NodeSelection);

      editor.destroy();
    });
  });

  describe('Keyboard navigation around inline images', () => {
    it('collapses selected image to the left on Escape or ArrowLeft', () => {
      const editor = new Editor({
        extensions: [
          StarterKit,
          Image.configure({ inline: true, allowBase64: true }),
          ImageCaret,
        ],
        content: '<p><img src="data:image/png;base64,123" /></p>',
      });

      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));

      const handledEsc = editor.view.someProp('handleKeyDown', f =>
        f(editor.view, new KeyboardEvent('keydown', { key: 'Escape' }))
      );
      expect(handledEsc).toBe(true);
      expect(editor.state.selection.from).toBe(1);

      // Re-select and test ArrowLeft
      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));
      const handledLeft = editor.view.someProp('handleKeyDown', f =>
        f(editor.view, new KeyboardEvent('keydown', { key: 'ArrowLeft' }))
      );
      expect(handledLeft).toBe(true);
      expect(editor.state.selection.from).toBe(1);

      editor.destroy();
    });

    it('collapses selected image to the right on ArrowRight', () => {
      const editor = new Editor({
        extensions: [
          StarterKit,
          Image.configure({ inline: true, allowBase64: true }),
          ImageCaret,
        ],
        content: '<p><img src="data:image/png;base64,123" /></p>',
      });

      editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, 1)));

      const handledRight = editor.view.someProp('handleKeyDown', f =>
        f(editor.view, new KeyboardEvent('keydown', { key: 'ArrowRight' }))
      );
      expect(handledRight).toBe(true);
      expect(editor.state.selection.from).toBe(2);

      editor.destroy();
    });

    it('jumps across the image with Ctrl+ArrowRight when cursor is before the image', () => {
      const editor = new Editor({
        extensions: [
          StarterKit,
          Image.configure({ inline: true, allowBase64: true }),
          ImageCaret,
        ],
        content: '<p><img src="data:image/png;base64,123" /></p>',
      });

      editor.commands.setTextSelection(1);
      const handled = editor.view.someProp('handleKeyDown', f =>
        f(editor.view, new KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true }))
      );
      expect(handled).toBe(true);
      expect(editor.state.selection.from).toBe(2);

      editor.destroy();
    });

    it('jumps across the image with Ctrl+ArrowLeft when cursor is after the image', () => {
      const editor = new Editor({
        extensions: [
          StarterKit,
          Image.configure({ inline: true, allowBase64: true }),
          ImageCaret,
        ],
        content: '<p><img src="data:image/png;base64,123" /></p>',
      });

      editor.commands.setTextSelection(2);
      const handled = editor.view.someProp('handleKeyDown', f =>
        f(editor.view, new KeyboardEvent('keydown', { key: 'ArrowLeft', ctrlKey: true }))
      );
      expect(handled).toBe(true);
      expect(editor.state.selection.from).toBe(1);

      editor.destroy();
    });
  });
});
