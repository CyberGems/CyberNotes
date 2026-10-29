// @vitest-environment jsdom
import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { DOMParser } from '@tiptap/pm/model';
import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
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
    const firstDoc = editor.state.doc;
    loadEditorContent(editor, '<h2>Second note</h2>');
    loadEditorContent(editor, '<p><strong>First</strong> note</p>');

    expect(editor.state.doc).toBe(firstDoc);
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

  it('renders once per switch and notifies toolbars after resetting history and selection', () => {
    const editor = makeEditor();
    loadEditorContent(editor, '<p><strong>First</strong> note</p>');
    editor.commands.insertContent('Edited ');
    expect(editor.can().undo()).toBe(true);
    const render = vi.spyOn(editor.view, 'updateState');
    const toolbarStates: { undo: boolean; bold: boolean; from: number }[] = [];
    editor.on('transaction', () => toolbarStates.push({
      undo: editor.can().undo(), bold: editor.isActive('bold'), from: editor.state.selection.from,
    }));
    loadEditorContent(editor, '<h2>Second note</h2>');
    expect(render).toHaveBeenCalledTimes(1);
    loadEditorContent(editor, '<p><strong>First</strong> note</p>');
    expect(render).toHaveBeenCalledTimes(2);
    expect(toolbarStates).toEqual([
      { undo: false, bold: false, from: 1 },
      { undo: false, bold: true, from: 1 },
    ]);
  });

  it('still applies appended plugin transforms and resets their state on each load', () => {
    const key = new PluginKey<number>('hydrationTransform');
    const extension = Extension.create({
      name: 'hydrationTransform',
      addProseMirrorPlugins() {
        return [new Plugin({
          key,
          state: { init: () => 0, apply: (_tr, count) => count + 1 },
          appendTransaction: (transactions, _old, state) => {
            if (transactions.some(tr => tr.getMeta('hydrationTransform'))) return null;
            if (!transactions.some(tr => tr.docChanged)) return null;
            if (state.doc.textContent.endsWith('!')) return null;
            return state.tr.insertText('!', state.doc.content.size - 1)
              .setMeta('hydrationTransform', true);
          },
        })];
      },
    });
    const editor = new Editor({ extensions: [StarterKit, extension] });
    editors.push(editor);
    loadEditorContent(editor, '<p>First</p>');
    expect(editor.getText()).toBe('First!');
    expect(key.getState(editor.state)).toBe(0);
    expect(editor.can().undo()).toBe(false);
    loadEditorContent(editor, '<p>Second</p>');
    expect(editor.getText()).toBe('Second!');
    expect(editor.can().undo()).toBe(false);
    loadEditorContent(editor, '<p>First</p>');
    expect(editor.getText()).toBe('First!');
    expect(key.getState(editor.state)).toBe(0);
  });

  it('matches the previous loader for lists, marks, code and repaired table structure', () => {
    const extensions = [StarterKit, Table, TableRow, TableHeader, TableCell];
    const editor = new Editor({ extensions });
    const reference = new Editor({ extensions });
    editors.push(editor, reference);
    const fixtures = [
      '<ul><li><p><strong>Bold</strong> and <em>italic</em></p></li><li><p>Next</p></li></ul>',
      '<pre><code>first\n  second</code></pre><blockquote><p>Quote</p></blockquote>',
      '<table><tbody><tr><th>Header</th><th>Other</th></tr><tr><td>Short row</td></tr></tbody></table>',
    ];
    for (const content of [...fixtures, ...fixtures]) {
      reference.chain().setMeta('addToHistory', false).setContent(content, false).run();
      reference.view.updateState(EditorState.create({ doc: reference.state.doc, plugins: reference.state.plugins }));
      loadEditorContent(editor, content);
      expect(editor.getJSON()).toEqual(reference.getJSON());
      expect(editor.state.selection.toJSON()).toEqual(reference.state.selection.toJSON());
    }
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

  it('keeps dozens of visited notes parsed and evicts the least recently used at the limit', () => {
    const editor = makeEditor();
    const parse = vi.spyOn(DOMParser.prototype, 'parse');
    for (let i = 0; i < 64; i++) loadEditorContent(editor, `<p>Note ${i}</p>`);
    for (let i = 0; i < 64; i++) loadEditorContent(editor, `<p>Note ${i}</p>`);
    expect(parse).toHaveBeenCalledTimes(64);
    loadEditorContent(editor, '<p>Note 0</p>');
    loadEditorContent(editor, '<p>Note 64</p>');
    loadEditorContent(editor, '<p>Note 0</p>');
    expect(parse).toHaveBeenCalledTimes(65);
    loadEditorContent(editor, '<p>Note 1</p>');
    expect(parse).toHaveBeenCalledTimes(66);
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
