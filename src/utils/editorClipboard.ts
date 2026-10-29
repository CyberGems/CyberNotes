import type { Editor } from '@tiptap/core';
import { NodeSelection } from '@tiptap/pm/state';
import { removeImageAt } from './editorImages';

/** Copy the native image before removing its original, including for Ctrl+X. */
export async function cutSelectedImage(editor: Editor): Promise<void> {
  if (editor.isDestroyed || !editor.isEditable) return;
  const { doc, selection } = editor.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return;

  const copied = await window.cyberNotesAPI.writeImageToClipboard(selection.node.attrs.src);
  if (!copied) throw new Error('Could not copy the image to the clipboard. The image was not cut.');

  // Clipboard IPC can finish after the user changes tabs, edits, or moves the
  // selection. Never delete a different document or the new selection.
  if (editor.isDestroyed || !editor.isEditable || editor.state.doc !== doc) return;
  removeImageAt(editor, selection.from, {
    preserveSelection: !editor.state.selection.eq(selection),
    uiEvent: 'cut',
  });
}
