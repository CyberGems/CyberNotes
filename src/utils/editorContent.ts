import type { Editor } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { EditorState } from '@tiptap/pm/state';

// Keep recently visited documents parsed, without retaining an unbounded copy
// of every note or large embedded images. Each editor has its own schema/cache.
const MAX_DOCUMENTS = 8;
const MAX_SOURCE_LENGTH = 2_000_000;
interface ContentCache {
  documents: Map<string, Node>;
  sourceLength: number;
}
const caches = new WeakMap<Editor, ContentCache>();

/** Load a note without adding it to Undo/Redo or emitting an autosave update. */
export function loadEditorContent(editor: Editor, raw: string): void {
  let cache = caches.get(editor);
  if (!cache) {
    cache = { documents: new Map(), sourceLength: 0 };
    caches.set(editor, cache);
  }
  const source = raw || '';
  const cached = cache.documents.get(source);
  let content: string | object = cached ?? source;
  if (!cached && source.trim().startsWith('{')) {
    try {
      content = JSON.parse(source);
    } catch {
      /* HTML / plain text */
    }
  }

  // Use the normal TipTap transaction path so plugins and subscribers still run.
  // ProseMirror nodes are immutable: a cached node can be reused after editing.
  editor.chain().setMeta('addToHistory', false).setContent(content, false).run();

  if (source.length <= MAX_SOURCE_LENGTH) {
    if (cached) {
      cache.documents.delete(source);
    } else {
      cache.sourceLength += source.length;
    }
    cache.documents.set(source, editor.state.doc);
    while (cache.documents.size > MAX_DOCUMENTS || cache.sourceLength > MAX_SOURCE_LENGTH) {
      const oldest = cache.documents.keys().next().value!;
      cache.documents.delete(oldest);
      cache.sourceLength -= oldest.length;
    }
  }

  // A tab switch starts with a fresh history, never Undo into another note.
  editor.view.updateState(EditorState.create({
    doc: editor.state.doc,
    plugins: editor.state.plugins,
  }));
}
