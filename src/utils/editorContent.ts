import { createDocument, type Editor } from '@tiptap/core';
import type { Node } from '@tiptap/pm/model';
import { EditorState, NodeSelection, Selection, TextSelection } from '@tiptap/pm/state';
import { GapCursor } from '@tiptap/pm/gapcursor';

// Keep recently visited documents parsed, without retaining an unbounded copy
// of every note or large embedded images. Each editor has its own schema/cache.
const MAX_DOCUMENTS = 64;
const MAX_SOURCE_LENGTH = 2_000_000;
interface ContentCache {
  documents: Map<string, Node>;
  sourceLength: number;
}
const caches = new WeakMap<Editor, ContentCache>();

/**
 * Computes the initial selection for a loaded document.
 * When the document starts with text, a regular TextSelection inside the first textblock is returned.
 * If the document starts with a non-text block (e.g. an image), we place a GapCursor at the start
 * rather than selecting the node itself (NodeSelection). This prevents auto-selecting the image,
 * which would immediately deploy its floating toolbar and risk accidental deletion on keypress.
 */
export function getInitialSelection(doc: Node): Selection {
  const atStart = Selection.atStart(doc);
  if (atStart instanceof NodeSelection) {
    const $pos0 = doc.resolve(0);
    const isValidGap = (GapCursor as unknown as { valid?: (pos: typeof $pos0) => boolean }).valid;
    if (typeof isValidGap === 'function' && isValidGap($pos0)) {
      return new GapCursor($pos0);
    }
    let textSel: Selection | null = null;
    doc.descendants((node, pos) => {
      if (!textSel && node.isTextblock) {
        textSel = TextSelection.create(doc, pos + 1);
        return false;
      }
      return !textSel;
    });
    if (textSel) return textSel;
  }
  return atStart;
}

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

  // Apply the same replacement and plugin transforms as setContent, then reset
  // history BEFORE updating the view. Rendering the intermediate state forced
  // two DOM/selection/layout passes and notified toolbars with the old history.
  const previous = editor.state;
  const doc = cached ?? createDocument(content, editor.schema, {}, {
    errorOnInvalidContent: editor.options.enableContentCheck,
  });
  const transaction = previous.tr
    .replaceWith(0, previous.doc.content.size, doc)
    .setMeta('addToHistory', false)
    .setMeta('preventUpdate', true);
  transaction.setSelection(getInitialSelection(transaction.doc));
  const appliedDoc = previous.apply(transaction).doc;
  const finalDoc = appliedDoc.eq(doc) ? doc : appliedDoc;
  const initialSelection = getInitialSelection(finalDoc);
  const next = EditorState.create({
    // Retain the immutable root too, so document-keyed line/format caches can
    // survive a return to this tab. Keep plugin repairs when they changed it.
    doc: finalDoc,
    selection: initialSelection,
    plugins: previous.plugins,
  });

  editor.emit('beforeTransaction', { editor, transaction, nextState: next });
  editor.view.updateState(next);
  editor.emit('transaction', { editor, transaction });
  if (!previous.selection.eq(next.selection)) {
    editor.emit('selectionUpdate', { editor, transaction });
  }

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
}
