import type { Editor } from '@tiptap/core';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

/** Keep a text caret at the removed block instead of selecting nearby media. */
export function removeImageAt(editor: Editor, pos: number, options: {
  preserveSelection?: boolean;
  uiEvent?: 'cut' | 'delete';
} = {}): boolean {
  if (editor.isDestroyed || !editor.isEditable) return false;
  const { state } = editor;
  const image = state.doc.nodeAt(pos);
  const paragraph = state.schema.nodes.paragraph;
  if (image?.type.name !== 'image' || !image.isBlock || !paragraph) return false;
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.canReplaceWith($pos.index(), $pos.index() + 1, paragraph)) return false;

  // This replaces one media block, even if it is the quote's only content.
  // Keep TipTap's select-all cleanup from lifting the new paragraph out.
  const tr = state.tr.replaceWith(pos, pos + image.nodeSize, paragraph.create())
    .setMeta('preventClearDocument', true);
  if (!options.preserveSelection) tr.setSelection(TextSelection.create(tr.doc, pos + 1));
  editor.view.dispatch(tr.scrollIntoView().setMeta('uiEvent', options.uiEvent ?? 'delete'));
  return true;
}

export function removeSelectedImage(editor: Editor): boolean {
  if (editor.isDestroyed) return false;
  const selection = editor.state.selection;
  return selection instanceof NodeSelection && selection.node.type.name === 'image'
    ? removeImageAt(editor, selection.from)
    : false;
}
