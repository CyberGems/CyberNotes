// @vitest-environment jsdom
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { DOMParser } from '@tiptap/pm/model';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEditorContent } from './editorContent';

describe('loading tab content', () => {
  const editors: Editor[] = [];
  function makeEditor() {
    const editor = new Editor({ extensions: [StarterKit] });
    editors.push(editor);
    return editor;
  }

  afterEach(() => {
    editors.splice(0).forEach(editor => editor.destroy());
    vi.restoreAllMocks();
  });

  it('reuses parsed HTML when returning to a tab, without emitting save updates', () => {
    const editor = makeEditor();
    const parse = vi.spyOn(DOMParser.prototype, 'parse');
    const update = vi.fn();
    const transaction = vi.fn();
    editor.on('update', update);
    editor.on('transaction', transaction);

    loadEditorContent(editor, '<p><strong>First</strong> note</p>');
    loadEditorContent(editor, '<h2>Second note</h2>');
    loadEditorContent(editor, '<p><strong>First</strong> note</p>');

    expect(editor.getHTML()).toBe('<p><strong>First</strong> note</p>');
    expect(parse).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(update).not.toHaveBeenCalled();
  });

  it('loads changed drafts and restored content without reusing an older revision', () => {
    const editor = makeEditor();
    loadEditorContent(editor, '<p>Saved</p>');
    editor.commands.insertContentAt(6, ' edit');
    const draft = editor.getHTML();
    loadEditorContent(editor, '<p>Other note</p>');
    loadEditorContent(editor, draft);
    expect(editor.getText()).toBe('Saved edit');
    loadEditorContent(editor, '<p>Saved</p>');
    expect(editor.getText()).toBe('Saved');
  });

  it('clears Undo/Redo on cache hits and never restores another note', () => {
    const editor = makeEditor();
    loadEditorContent(editor, '<p>First</p>');
    editor.commands.insertContentAt(6, ' edit');
    expect(editor.can().undo()).toBe(true);
    loadEditorContent(editor, '<p>Second</p>');
    expect(editor.can().undo()).toBe(false);
    editor.commands.insertContentAt(7, ' edit');
    editor.commands.undo();
    expect(editor.can().redo()).toBe(true);
    loadEditorContent(editor, '<p>First</p>');
    expect(editor.can().undo()).toBe(false);
    expect(editor.can().redo()).toBe(false);
    expect(editor.commands.undo()).toBe(false);
    expect(editor.getText()).toBe('First');
    editor.commands.insertContentAt(6, ' new');
    editor.commands.undo();
    expect(editor.getText()).toBe('First');
  });

  it('supports legacy JSON notes, empty notes and text beginning with a brace', () => {
    const editor = makeEditor();
    const json = JSON.stringify({ type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'Legacy note' }] },
    ] });
    loadEditorContent(editor, json);
    expect(editor.getText()).toBe('Legacy note');
    loadEditorContent(editor, '');
    expect(editor.isEmpty).toBe(true);
    loadEditorContent(editor, json);
    expect(editor.getText()).toBe('Legacy note');
    loadEditorContent(editor, '{plain text}');
    expect(editor.getText()).toBe('{plain text}');
  });

  it('keeps parsed documents local to each editor schema', () => {
    const first = makeEditor();
    const second = makeEditor();
    const parse = vi.spyOn(DOMParser.prototype, 'parse');
    loadEditorContent(first, '<p>Shared source</p>');
    loadEditorContent(second, '<p>Shared source</p>');
    expect(parse).toHaveBeenCalledTimes(2);
    expect(second.state.doc.type.schema).toBe(second.schema);
  });

  it('evicts the least recently used document when eight notes are cached', () => {
    const editor = makeEditor();
    const parse = vi.spyOn(DOMParser.prototype, 'parse');
    for (let i = 0; i < 8; i++) loadEditorContent(editor, `<p>Note ${i}</p>`);
    loadEditorContent(editor, '<p>Note 0</p>');
    loadEditorContent(editor, '<p>Note 8</p>');
    loadEditorContent(editor, '<p>Note 0</p>');
    expect(parse).toHaveBeenCalledTimes(9);
    loadEditorContent(editor, '<p>Note 1</p>');
    expect(parse).toHaveBeenCalledTimes(10);
  });

  it('bounds the total cached source size and does not retain oversized notes', () => {
    const editor = makeEditor();
    // Comments count toward retained source size, but do not create a huge DOM.
    const large = `<p>Large</p><!--${'x'.repeat(1_100_000)}-->`;
    const oversized = `<p>Oversized</p><!--${'x'.repeat(2_000_000)}-->`;
    const parse = vi.spyOn(DOMParser.prototype, 'parse');
    loadEditorContent(editor, large);
    loadEditorContent(editor, large.replace('Large', 'Other'));
    loadEditorContent(editor, large);
    expect(parse).toHaveBeenCalledTimes(3);
    loadEditorContent(editor, oversized);
    loadEditorContent(editor, oversized);
    expect(parse).toHaveBeenCalledTimes(5);
    expect(editor.getText()).toBe('Oversized');
    loadEditorContent(editor, large);
    expect(parse).toHaveBeenCalledTimes(5);
  });
});
