// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { Editor } from '@tiptap/react';
import EmojiPickerModal from './EmojiPickerModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('../utils/emojiSupport', () => ({
  EMOJI_FONT_FAMILY: '"Segoe UI Emoji", sans-serif',
  filterSupportedEmojis: vi.fn().mockResolvedValue(new Set(['😀', '👩‍💻', '❤️'])),
}));
vi.mock('./Tooltip', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });

afterEach(() => { localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); });

it.each(['es', 'en'] as const)('only offers compatible emojis, filters old recents and inserts native text (%s)', async language => {
  localStorage.setItem('cybernotes-emoji-picker-recents-v1', JSON.stringify(['🫠', '😀']));
  sessionStorage.setItem('cybernotes-emoji-picker-view-v1', JSON.stringify({ category: 'recent', scrollTop: {} }));
  const insertContent = vi.fn();
  const chain = { focus: () => chain, setTextSelection: () => chain, insertContent: (text: unknown) => { insertContent(text); return chain; }, run: () => true };
  const editor = { state: { selection: { from: 1, to: 1 }, doc: { content: { size: 10 } } }, chain: () => chain, commands: { focus: vi.fn() }, isDestroyed: false } as unknown as Editor;
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<EmojiPickerModal editor={editor} language={language} uiScale={1} onClose={vi.fn()} />));
    const modal = document.querySelector('.emoji-picker-modal')!;
    expect(modal.querySelector('.character-map-header p')?.textContent).toBe(language === 'es'
      ? '3 emojis compatibles con este equipo.' : '3 emojis supported on this device.');
    const buttons = modal.querySelectorAll<HTMLButtonElement>('[data-emoji-index]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('😀');
    expect(buttons[0].querySelector('.emoji-picker-glyph')).not.toBeNull();
    await act(async () => buttons[0].click());
    expect(insertContent).toHaveBeenLastCalledWith({ type: 'text', text: '😀' });
  } finally {
    await act(async () => root.unmount()); host.remove();
  }
});
