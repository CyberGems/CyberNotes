// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  CustomTextStyle,
  FONT_SIZE_OPTIONS,
  WORD_FONT_SIZE_OPTIONS,
  getSelectionFontSizes,
} from './NoteEditor';

function makeEditor(content: string) {
  return new Editor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      CustomTextStyle,
    ],
    content,
  });
}

describe('listas de tamaños', () => {
  it('el tamaño base 15 está disponible en ambas listas', () => {
    expect(FONT_SIZE_OPTIONS).toContain('15');
    expect(WORD_FONT_SIZE_OPTIONS).toContain('15');
  });

  it('las listas mantienen el orden ascendente', () => {
    const asNumbers = (list: string[]) => list.map((v) => Number(v));
    expect(asNumbers(FONT_SIZE_OPTIONS)).toEqual([...asNumbers(FONT_SIZE_OPTIONS)].sort((a, b) => a - b));
    expect(asNumbers(WORD_FONT_SIZE_OPTIONS)).toEqual([...asNumbers(WORD_FONT_SIZE_OPTIONS)].sort((a, b) => a - b));
  });
});

describe('getSelectionFontSizes', () => {
  it('detecta un único tamaño cuando toda la selección comparte marca', () => {
    const editor = makeEditor('<p><span style="font-size: 18px">Hola</span></p>');
    editor.commands.setTextSelection({ from: 1, to: 5 });
    expect(getSelectionFontSizes(editor, 15)).toEqual([18]);
    editor.destroy();
  });

  it('detecta tamaños mixtos cuando la selección abarca marcas distintas', () => {
    const editor = makeEditor(
      '<p><span style="font-size: 18px">Hola</span><span style="font-size: 24px"> mundo</span></p>',
    );
    editor.commands.setTextSelection({ from: 1, to: 12 });
    const sizes = getSelectionFontSizes(editor, 15);
    expect(sizes.length).toBe(2);
    expect(sizes.sort((a, b) => a - b)).toEqual([18, 24]);
    editor.destroy();
  });

  it('el texto sin marca propia usa el tamaño base del editor', () => {
    const editor = makeEditor('<p>Hola</p>');
    editor.commands.setTextSelection({ from: 1, to: 5 });
    expect(getSelectionFontSizes(editor, 15)).toEqual([15]);
    editor.destroy();
  });

  it('el texto sin marca propia dentro de un encabezado hereda su tamaño', () => {
    const editor = makeEditor('<h1>Titulo</h1>');
    editor.commands.setTextSelection({ from: 1, to: 7 });
    expect(getSelectionFontSizes(editor, 15)).toEqual([30]);
    editor.destroy();
  });

  it('el texto en <code> hereda 0.9em del tamaño base', () => {
    const editor = makeEditor('<p>Texto <code>codigo</code> normal</p>');
    editor.commands.setTextSelection({ from: 1, to: 18 });
    // La selección abarca texto normal (15px) y código (13.5px -> 14px redondeado)
    const sizes = getSelectionFontSizes(editor, 15);
    expect(sizes.length).toBe(2);
    expect(sizes.sort((a, b) => a - b)).toEqual([14, 15]);
    editor.destroy();
  });

  it('el texto en <blockquote> hereda el tamaño base (1em)', () => {
    const editor = makeEditor('<blockquote>cita</blockquote>');
    editor.commands.setTextSelection({ from: 1, to: 5 });
    expect(getSelectionFontSizes(editor, 15)).toEqual([15]);
    editor.destroy();
  });

  it('el texto en un bloque de código hereda 0.9em (pre + code)', () => {
    const editor = makeEditor('<pre>codigo bloque</pre>');
    editor.commands.setTextSelection({ from: 1, to: 13 });
    // pre usa 0.9em y el <code> interno otro 0.9em: 15 * 0.81 = 12.15 -> 12
    expect(getSelectionFontSizes(editor, 15)).toEqual([12]);
    editor.destroy();
  });

  it('una selección vacía no reporta tamaños', () => {
    const editor = makeEditor('<p>Hola</p>');
    editor.commands.setTextSelection(1);
    expect(getSelectionFontSizes(editor, 15)).toEqual([]);
    editor.destroy();
  });
});
