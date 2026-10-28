// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TextSelection } from '@tiptap/pm/state';
import { refreshBubbleMenuAfterDrag, wasDragSelection } from './NoteEditor';

describe('wasDragSelection', () => {
  it('un clic simple en el mismo punto no es arrastre', () => {
    expect(wasDragSelection({ x: 100, y: 200 }, { clientX: 100, clientY: 200 })).toBe(false);
  });

  it('un movimiento dentro del umbral de 4px no es arrastre', () => {
    expect(wasDragSelection({ x: 100, y: 200 }, { clientX: 103, clientY: 202 })).toBe(false);
  });

  it('un movimiento horizontal mayor de 4px es arrastre', () => {
    expect(wasDragSelection({ x: 100, y: 200 }, { clientX: 105, clientY: 200 })).toBe(true);
  });

  it('un movimiento vertical mayor de 4px es arrastre', () => {
    expect(wasDragSelection({ x: 100, y: 200 }, { clientX: 100, clientY: 205 })).toBe(true);
  });

  it('sin punto de inicio se asume arrastre', () => {
    expect(wasDragSelection(null, { clientX: 100, clientY: 200 })).toBe(true);
  });

  it('un mouseup fuera de la ventana se asume arrastre', () => {
    expect(wasDragSelection({ x: 100, y: 200 }, { clientX: 0, clientY: 0 })).toBe(true);
  });
});

function makeEditor() {
  return new Editor({
    extensions: [StarterKit.configure({ heading: { levels: [1, 2, 3] } })],
    content: '<p>Hola mundo entero</p>',
  });
}

describe('refreshBubbleMenuAfterDrag', () => {
  it('tras un clic simple no toca la selección (deja que PM la colapse)', () => {
    const editor = makeEditor();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const applied = refreshBubbleMenuAfterDrag(editor, { x: 100, y: 200 }, { clientX: 100, clientY: 200 });
    expect(applied).toBe(false);
    // La selección sigue intacta: el clic simple no debe alterarla.
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(6);
    editor.destroy();
  });

  it('tras un arrastre real colapsa y restaura la selección', () => {
    const editor = makeEditor();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    const applied = refreshBubbleMenuAfterDrag(editor, { x: 100, y: 200 }, { clientX: 140, clientY: 200 });
    expect(applied).toBe(true);
    // La selección sobrevive al ciclo de dos transacciones.
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(6);
    editor.destroy();
  });

  it('no hace nada si la selección está vacía', () => {
    const editor = makeEditor();
    editor.commands.setTextSelection(3);
    const applied = refreshBubbleMenuAfterDrag(editor, { x: 100, y: 200 }, { clientX: 140, clientY: 200 });
    expect(applied).toBe(false);
    editor.destroy();
  });

  it('el clic simple no altera una selección por texto', () => {
    const editor = makeEditor();
    editor.commands.setTextSelection({ from: 1, to: 6 });
    refreshBubbleMenuAfterDrag(editor, { x: 100, y: 200 }, { clientX: 102, clientY: 201 });
    const sel = editor.state.selection;
    expect(sel).toBeInstanceOf(TextSelection);
    expect(sel.from).toBe(1);
    expect(sel.to).toBe(6);
    editor.destroy();
  });
});
