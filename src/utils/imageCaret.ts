import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const imageCaretPluginKey = new PluginKey('imageCaret');

/**
 * Renders a Word-style font-height blinking caret next to inline images,
 * preventing Chromium's default behavior of stretching the native caret
 * to the entire line-box height of the image.
 */
export const ImageCaret = Extension.create({
  name: 'imageCaret',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: imageCaretPluginKey,
        props: {
          decorations(state) {
            const { selection } = state;
            if (!selection || !selection.empty || !selection.$from) {
              return DecorationSet.empty;
            }
            const { $from } = selection;
            const isBeforeImage = $from.nodeAfter?.type.name === 'image';
            const isAfterImage = !isBeforeImage && $from.nodeBefore?.type.name === 'image';

            if (!isBeforeImage && !isAfterImage) {
              return DecorationSet.empty;
            }

            const caret = document.createElement('span');
            caret.className = `editor-image-caret ${isBeforeImage ? 'is-before' : 'is-after'}`;
            caret.setAttribute('aria-hidden', 'true');

            return DecorationSet.create(state.doc, [
              Decoration.widget($from.pos, caret, {
                side: isBeforeImage ? -1 : 1,
                key: 'image-caret',
              }),
            ]);
          },
          attributes(state): { [name: string]: string } {
            const { selection } = state;
            if (!selection || !selection.empty || !selection.$from) {
              return {};
            }
            const { $from } = selection;
            const isAdjacent = $from.nodeAfter?.type.name === 'image' || $from.nodeBefore?.type.name === 'image';
            return isAdjacent ? { class: 'has-image-caret' } : {};
          },
        },
      }),
    ];
  },
});
