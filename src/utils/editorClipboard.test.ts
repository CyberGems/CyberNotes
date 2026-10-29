// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cutSelectedImage } from './editorClipboard';

describe('cutting an image', () => {
  let editor: Editor;
  let finishCopy: (copied: boolean) => void;
  const source = 'file:///notes/images/example.png';
  const writeImageToClipboard = vi.fn();

  beforeEach(() => {
    writeImageToClipboard.mockReset().mockImplementation(() => new Promise<boolean>(resolve => { finishCopy = resolve; }));
    vi.stubGlobal('cyberNotesAPI', { writeImageToClipboard });
    editor = new Editor({
      extensions: [StarterKit, Image],
      content: `<p>Before</p><img src="${source}"><p>After</p>`,
    });
    editor.commands.setNodeSelection(8);
    editor.view.setProps({ handleScrollToSelection: () => true });
  });

  afterEach(() => {
    editor.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('waits for a successful native image copy before deleting, and supports undo', async () => {
    const original = editor.getHTML();
    const cutting = cutSelectedImage(editor);
    expect(writeImageToClipboard).toHaveBeenCalledExactlyOnceWith(source);
    expect(editor.getHTML()).toBe(original);
    finishCopy(true);
    await cutting;
    expect(editor.getHTML()).toBe('<p>Before</p><p></p><p>After</p>');
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.from).toBe(9);
    expect(editor.commands.undo()).toBe(true);
    expect(editor.getHTML()).toBe(original);
    expect(editor.state.selection).toBeInstanceOf(NodeSelection);
    expect(editor.state.selection.from).toBe(8);
    expect(editor.commands.redo()).toBe(true);
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.from).toBe(9);
  });

  it('keeps the image and reports a failed native copy', async () => {
    const original = editor.getHTML();
    const cutting = cutSelectedImage(editor);
    finishCopy(false);
    await expect(cutting).rejects.toThrow('The image was not cut');
    expect(editor.getHTML()).toBe(original);
    expect(editor.can().undo()).toBe(false);
  });

  it('keeps the image if clipboard IPC rejects', async () => {
    writeImageToClipboard.mockRejectedValue(new Error('Clipboard unavailable'));
    const original = editor.getHTML();
    await expect(cutSelectedImage(editor)).rejects.toThrow('Clipboard unavailable');
    expect(editor.getHTML()).toBe(original);
  });

  it('deletes the original image if the selection moves while copying', async () => {
    const cutting = cutSelectedImage(editor);
    editor.commands.setTextSelection({ from: 1, to: 7 });
    finishCopy(true);
    await cutting;
    expect(editor.getHTML()).toBe('<p>Before</p><p></p><p>After</p>');
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(7);
  });

  it('does not delete content in a different note loaded during the copy', async () => {
    const cutting = cutSelectedImage(editor);
    editor.commands.setContent(`<p>Other note</p><img src="${source}">`);
    const otherNote = editor.getHTML();
    finishCopy(true);
    await cutting;
    expect(editor.getHTML()).toBe(otherNote);
  });

  it('preserves intervening edits to the document', async () => {
    const cutting = cutSelectedImage(editor);
    editor.commands.insertContentAt(1, 'New ');
    const edited = editor.getHTML();
    finishCopy(true);
    await cutting;
    expect(editor.getHTML()).toBe(edited);
  });

  it('does not delete after the editor becomes read only or is destroyed', async () => {
    const original = editor.getHTML();
    const cutting = cutSelectedImage(editor);
    editor.setEditable(false);
    finishCopy(true);
    await cutting;
    expect(editor.getHTML()).toBe(original);

    editor.setEditable(true);
    const secondCut = cutSelectedImage(editor);
    editor.destroy();
    finishCopy(true);
    await expect(secondCut).resolves.toBeUndefined();
  });

  it('leaves text selections and read only images to the existing behavior', async () => {
    editor.setEditable(false);
    await cutSelectedImage(editor);
    expect(writeImageToClipboard).not.toHaveBeenCalled();
    editor.setEditable(true);
    editor.commands.setTextSelection({ from: 1, to: 7 });
    await cutSelectedImage(editor);
    expect(writeImageToClipboard).not.toHaveBeenCalled();
    expect(editor.getText()).toContain('Before');
  });
});
