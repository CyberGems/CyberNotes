// @vitest-environment jsdom
import { act } from 'react';
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
  { name: 'symbols', Component: CharacterMapModal, storage: 'cybernotes-character-map', query: 'U+221E', names: { es: 'infinito', en: 'infinity' }, value: '∞', edited: 'Ω∞Ω', recents: ['Ω', '∞'] },
  { name: 'emojis', Component: EmojiPickerModal, storage: 'cybernotes-emoji-picker', query: '👩‍💻', names: { es: 'tecnologa', en: 'woman technologist' }, value: '👩‍💻', edited: '👩‍💻❤️👩‍💻', recents: ['👩‍💻', '❤️'] },
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
      const pin = document.querySelector<HTMLButtonElement>(fixture.name === 'emojis' ? '.emoji-picker-mode' : '.character-map-pin')!;
      await act(async () => pin.click());
      if (fixture.name === 'emojis') {
        for (const value of ['👩‍💻', '❤️', '👩‍💻']) {
          await change(search, value);
          await act(async () => document.querySelector<HTMLButtonElement>('[data-emoji-index]')!.click());
        }
        expect([...document.querySelectorAll('.emoji-picker-chip')].map(chip => chip.textContent)).toEqual(['👩‍💻', '❤️', '👩‍💻']);
        expect(inserted).toHaveLength(2);
        await enter(search, true); expect(inserted).toHaveLength(2);
        await enter(search);
      } else {
        await enter(search);
        const batch = document.querySelector<HTMLInputElement>('.character-map-batch-row input')!;
        expect(batch.value).toBe(fixture.value);
        expect(inserted).toHaveLength(2);
        await change(batch, fixture.edited);
        await enter(batch, true); expect(inserted).toHaveLength(2);
        await enter(batch);
      }
      expect(inserted).toEqual([fixture.value, fixture.value, fixture.edited]);
      expect(onClose).toHaveBeenCalledTimes(fixture.name === 'emojis' ? 3 : 1);
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
