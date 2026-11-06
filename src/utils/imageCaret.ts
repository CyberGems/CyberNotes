import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, NodeSelection, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export const imageCaretPluginKey = new PluginKey('imageCaret');

/**
 * Renders a Word-style font-height blinking caret next to inline images,
 * preventing Chromium's default behavior of stretching the native caret
 * to the entire line-box height of the image.
 *
 * Also provides Word-style navigation and click handling for inline images:
 * - Clicking to the right/left of a selected image positions the caret next to it
 * - ArrowLeft / ArrowRight on a selected image collapses the caret to its left/right
 * - Ctrl + ArrowLeft / ArrowRight next to an image jumps across it
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
          handleClick(view, _pos, event) {
            if (event.button !== 0 || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) {
              return false;
            }
            const { selection } = view.state;
            if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') {
              return false;
            }
            if (event.target instanceof HTMLElement && event.target.closest('[data-editor-toolbar], button, input, select')) {
              return false;
            }
            if (event.target instanceof HTMLElement && event.target.tagName === 'IMG') {
              return false;
            }

            const imageDom = (view.nodeDOM(selection.from) as HTMLElement | null) ||
              view.dom.querySelector<HTMLElement>('.ProseMirror-selectednode');
            if (!imageDom) return false;

            const rect = imageDom.getBoundingClientRect();
            // Vertical tolerance: within the vertical bounds of the image line
            const isVerticallyAligned = (rect.height === 0 && rect.width === 0) ||
              (event.clientY >= rect.top - 8 && event.clientY <= rect.bottom + 8);
            if (!isVerticallyAligned) return false;

            const imagePos = selection.from;
            let targetPos: number | null = null;
            if (event.clientX > rect.right) {
              targetPos = imagePos + selection.node.nodeSize;
            } else if (event.clientX < rect.left) {
              targetPos = imagePos;
            }

            if (targetPos !== null) {
              view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, targetPos)));
              view.focus();
              return true;
            }

            return false;
          },
          handleKeyDown(view, event) {
            const { selection } = view.state;

            // Esc o Flechas con imagen seleccionada: colapsar caret al lado correspondiente (estilo Word)
            if (selection instanceof NodeSelection && selection.node.type.name === 'image') {
              if (event.key === 'Escape' || (event.key === 'ArrowLeft' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey)) {
                event.preventDefault();
                view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selection.from)));
                view.focus();
                return true;
              }
              if (event.key === 'ArrowRight' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
                view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, selection.from + selection.node.nodeSize)));
                view.focus();
                return true;
              }
            }

            // Ctrl + Flechas junto a una imagen en línea: saltar al otro lado de la imagen
            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && selection.empty && selection.$from) {
              const { $from } = selection;
              if (event.key === 'ArrowRight' && $from.nodeAfter?.type.name === 'image') {
                event.preventDefault();
                view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $from.pos + $from.nodeAfter.nodeSize)));
                view.focus();
                return true;
              }
              if (event.key === 'ArrowLeft' && $from.nodeBefore?.type.name === 'image') {
                event.preventDefault();
                view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $from.pos - $from.nodeBefore.nodeSize)));
                view.focus();
                return true;
              }
            }

            return false;
          },
        },
      }),
    ];
  },
});
