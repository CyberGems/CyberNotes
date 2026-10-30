// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import CharacterMapModal from './CharacterMapModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../utils/glyphSupport', () => ({
  SYMBOL_FONT_FAMILY: '"Inter", sans-serif',
  loadGlyphSupport: vi.fn().mockResolvedValue((value: string) => value !== '\u0378' && value !== '🫠'),
}));
vi.mock('./Tooltip', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock('./NativeGlyph', () => ({ default: ({ value }: { value: string }) => <svg className="picker-glyph"><text>{value}</text></svg> }));
afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

it.each(['es', 'en'] as const)('filters unsupported recents and Unicode searches while retaining insertion (%s)', async language => {
  localStorage.setItem('cybernotes-character-map-recents-v1', JSON.stringify(['\u0378', '🫠', 'Ω']));
  sessionStorage.setItem('cybernotes-character-map-view-v1', JSON.stringify({ category: 'recent', gridScrollTop: {}, modalHeight: null }));
  const insertContent = vi.fn();
  const chain = { focus: () => chain, setTextSelection: () => chain, insertContent: (text: unknown) => { insertContent(text); return chain; }, run: () => true };
  const editor = { state: { selection: { from: 1, to: 1 }, doc: { content: { size: 10 } } }, chain: () => chain, commands: { focus: vi.fn() }, isDestroyed: false } as unknown as Editor;
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<CharacterMapModal editor={editor} language={language} uiScale={1} onClose={vi.fn()} />));
    const modal = document.querySelector('.character-map-modal')!;
    const buttons = modal.querySelectorAll<HTMLButtonElement>('.character-map-grid button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Ω');
    expect(buttons[0].querySelector('.picker-glyph')).not.toBeNull();
    await act(async () => buttons[0].click());
    expect(insertContent).toHaveBeenLastCalledWith({ type: 'text', text: 'Ω' });
    const input = modal.querySelector<HTMLInputElement>('.character-map-search input')!;
    const search = async (value: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await search('U+0378');
    expect(modal.querySelectorAll('.character-map-grid button')).toHaveLength(0);
    expect(modal.querySelector('.character-map-empty')?.textContent).toContain(language === 'es' ? 'compatibles' : 'supported');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(insertContent).toHaveBeenCalledTimes(1);
    await search('U+221E');
    expect(modal.querySelector('.character-map-grid button')?.textContent).toBe('∞');
    await act(async () => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(insertContent).toHaveBeenLastCalledWith({ type: 'text', text: '∞' });
  } finally {
    await act(async () => root.unmount()); host.remove();
  }
});
