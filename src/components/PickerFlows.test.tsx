// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import CharacterMapModal from './CharacterMapModal';
import EmojiPickerModal from './EmojiPickerModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../utils/glyphSupport', () => ({ SYMBOL_FONT_FAMILY: 'sans-serif', loadGlyphSupport: vi.fn().mockResolvedValue(() => true) }));
vi.mock('../utils/emojiSupport', () => ({ EMOJI_FONT_FAMILY: 'sans-serif', filterSupportedEmojis: vi.fn().mockResolvedValue(new Set(['😀', '👩‍💻', '❤️'])) }));
vi.mock('./Tooltip', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('./NativeGlyph', () => ({ default: ({ value }: { value: string }) => <span>{value}</span> }));
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
vi.stubGlobal('requestAnimationFrame', () => 0);
afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

const cases = [
  { name: 'symbols', Component: CharacterMapModal, storage: 'cybernotes-character-map', query: 'U+221E', names: { es: 'infinito', en: 'infinity' }, value: '∞', edited: 'Ω∞Ω', batchQueries: ['U+03A9', 'U+221E', 'U+03A9'], batchValues: ['Ω', '∞', 'Ω'], recents: ['Ω', '∞'] },
  { name: 'emojis', Component: EmojiPickerModal, storage: 'cybernotes-emoji-picker', query: '👩‍💻', names: { es: 'tecnologa', en: 'woman technologist' }, value: '👩‍💻', edited: '👩‍💻❤️👩‍💻', batchQueries: ['👩‍💻', '❤️', '👩‍💻'], batchValues: ['👩‍💻', '❤️', '👩‍💻'], recents: ['👩‍💻', '❤️'] },
];
const change = async (input: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
const enter = async (input: HTMLInputElement, isComposing = false) => act(async () => {
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing }));
});

for (const fixture of cases) {
  it.each(['es', 'en'] as const)(`${fixture.name}: search, edited multiple selection, Enter and persisted recents (%s)`, async language => {
    const { Component } = fixture;
    const inserted: string[] = [];
    const selection = { from: 2, to: 4 };
    const selectedRanges: { from: number; to: number }[] = [];
    const chain = { focus: () => chain, setTextSelection: (range: typeof selection) => { selectedRanges.push(range); return chain; },
      insertContent: (content: { text: string }) => { inserted.push(content.text); selection.from += content.text.length; selection.to = selection.from; return chain; }, run: () => true };
    const editor = { state: { selection, doc: { content: { size: 100 } } }, chain: () => chain, commands: { focus: vi.fn() }, isDestroyed: false } as unknown as Editor;
    const onClose = vi.fn();
    const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
    const render = (key: number) => act(async () => root.render(<Component key={key} editor={editor} language={language} uiScale={1} onClose={onClose} />));
    try {
      await render(0);
      let search = document.querySelector<HTMLInputElement>('.character-map-search input')!;
      await change(search, fixture.names[language]);
      expect(document.querySelector('.character-map-grid button')?.textContent).toBe(fixture.value);
      await change(search, fixture.query);
      await enter(search, true);
      expect(inserted).toEqual([]);
      await enter(search);
      expect(inserted).toEqual([fixture.value]);
      expect(selectedRanges[0]).toEqual({ from: 2, to: 4 });
      await enter(search);
      expect(selectedRanges[1]).toEqual({ from: 2 + fixture.value.length, to: 2 + fixture.value.length });
      const pin = document.querySelector<HTMLButtonElement>('.picker-mode')!;
      await act(async () => pin.click());
      for (const value of fixture.batchQueries) {
        await change(search, value);
        await act(async () => document.querySelector<HTMLButtonElement>('.character-map-grid button')!.click());
      }
      expect([...document.querySelectorAll('.picker-chip')].map(chip => chip.textContent)).toEqual(fixture.batchValues);
      expect(inserted).toHaveLength(2);
      await enter(search, true); expect(inserted).toHaveLength(2);
      await enter(search);
      expect(inserted).toEqual([fixture.value, fixture.value, fixture.edited]);
      expect(onClose).toHaveBeenCalledTimes(3);
      expect(JSON.parse(localStorage.getItem(`${fixture.storage}-recents-v1`)!)).toEqual(fixture.recents);
      sessionStorage.setItem(`${fixture.storage}-view-v1`, JSON.stringify({ category: 'recent', scrollTop: {}, gridScrollTop: {} }));
      await render(1);
      const cells = [...document.querySelectorAll<HTMLButtonElement>('.character-map-grid button, [data-emoji-index]')];
      expect(cells.map(cell => cell.textContent)).toEqual(fixture.recents);
      search = document.querySelector<HTMLInputElement>('.character-map-search input')!;
      await change(search, 'no-such-character-xyz');
      expect(document.querySelector('.character-map-empty')?.textContent).toBe(fixture.name === 'emojis'
        ? (language === 'es' ? 'No se encontraron emojis.' : 'No emojis found.')
        : (language === 'es' ? 'No se encontraron caracteres compatibles.' : 'No supported characters found.'));
      await enter(search);
      expect(inserted).toHaveLength(3);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
}

for (const fixture of cases) {
  it(`${fixture.name}: preserves a failed tray, saves confirmed recents before closing and supports double-click insertion`, async () => {
    const { Component } = fixture;
    const insertContent = vi.fn(), onClose = vi.fn(), run = vi.fn().mockReturnValue(true);
    const chain = { focus: () => chain, setTextSelection: () => chain,
      insertContent: (content: unknown) => { insertContent(content); return chain; }, run };
    const editor = { state: { selection: { from: 1, to: 1 }, doc: { content: { size: 100 } } }, chain: () => chain,
      commands: { focus: vi.fn() }, isDestroyed: false } as unknown as Editor;
    function Owner() {
      const [open, setOpen] = useState(true);
      return open ? <Component editor={editor} language="es" uiScale={1} onClose={() => { onClose(); setOpen(false); }} /> : null;
    }
    const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
    const render = (key: string) => act(async () => root.render(<Owner key={key} />));
    try {
      await render('double');
      expect(document.querySelector('.picker-search-row')?.contains(document.querySelector('.picker-mode'))).toBe(true);
      let search = document.querySelector<HTMLInputElement>('.character-map-search input')!;
      await change(search, fixture.query);
      const cell = document.querySelector<HTMLButtonElement>('.character-map-grid button')!;
      await act(async () => cell.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })));
      expect(insertContent).not.toHaveBeenCalled();
      await act(async () => { cell.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 })); cell.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, detail: 2 })); });
      expect(insertContent).toHaveBeenCalledExactlyOnceWith({ type: 'text', text: fixture.value });
      expect(document.querySelector('.character-map-modal')).toBeNull();
      expect(JSON.parse(localStorage.getItem(`${fixture.storage}-recents-v1`)!)).toEqual([fixture.value]);
      await render('tray'); await act(async () => document.querySelector<HTMLButtonElement>('.picker-mode')!.click());
      search = document.querySelector<HTMLInputElement>('.character-map-search input')!;
      for (const value of fixture.batchQueries) {
        await change(search, value); await act(async () => document.querySelector<HTMLButtonElement>('.character-map-grid button')!.click());
      }
      const primary = document.querySelector<HTMLButtonElement>('.modal-action-btn.is-save')!;
      expect([...document.querySelectorAll('.picker-chip')].map(chip => chip.textContent)).toEqual(fixture.batchValues);
      run.mockReturnValue(false); insertContent.mockClear(); onClose.mockClear();
      await act(async () => primary.click());
      expect(onClose).not.toHaveBeenCalled(); expect(document.querySelectorAll('.picker-chip')).toHaveLength(3);
      expect(JSON.parse(localStorage.getItem(`${fixture.storage}-recents-v1`)!)).toEqual([fixture.value]);
      run.mockReturnValue(true); insertContent.mockClear();
      await act(async () => primary.click());
      expect(insertContent).toHaveBeenCalledExactlyOnceWith({ type: 'text', text: fixture.edited });
      expect(onClose).toHaveBeenCalledTimes(1); expect(document.querySelector('.character-map-modal')).toBeNull();
      expect(JSON.parse(localStorage.getItem(`${fixture.storage}-recents-v1`)!)).toEqual(fixture.recents);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
}
