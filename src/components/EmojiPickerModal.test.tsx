// @vitest-environment jsdom
import { act, useState } from 'react';
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
vi.mock('./NativeGlyph', () => ({ default: ({ value, className }: { value: string; className?: string }) => <svg className={className}><text>{value}</text></svg> }));
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
    expect(modal.querySelector('.character-map-header p')?.textContent).toBe('3 emojis');
    const buttons = modal.querySelectorAll<HTMLButtonElement>('[data-emoji-index]');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('😀');
    expect(buttons[0].querySelector('.emoji-picker-glyph')).not.toBeNull();
    await act(async () => buttons[0].click());
    expect(insertContent).not.toHaveBeenCalled();
    await act(async () => modal.querySelector<HTMLButtonElement>('.modal-action-btn.is-save')!.click());
    expect(insertContent).toHaveBeenCalledExactlyOnceWith({ type: 'text', text: '😀' });
  } finally {
    await act(async () => root.unmount()); host.remove();
  }
});

it.each(['es', 'en'] as const)('closes after Insert succeeds and stays open when insertion fails (%s)', async language => {
  const onClose = vi.fn();
  const run = vi.fn().mockReturnValue(false);
  const insertContent = vi.fn();
  const chain = { focus: () => chain, setTextSelection: () => chain,
    insertContent: (content: unknown) => { insertContent(content); return chain; }, run };
  const editor = { state: { selection: { from: 1, to: 1 }, doc: { content: { size: 10 } } }, chain: () => chain,
    commands: { focus: vi.fn() }, isDestroyed: false } as unknown as Editor;
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<EmojiPickerModal editor={editor} language={language} uiScale={1} onClose={onClose} />));
    const insert = document.querySelector<HTMLButtonElement>('.emoji-picker-modal .modal-action-btn.is-save')!;
    expect(insert.disabled).toBe(true);
    await act(async () => document.querySelector<HTMLButtonElement>('[data-emoji-index]')!.click());
    expect(insertContent).not.toHaveBeenCalled();
    expect(insert.disabled).toBe(false);
    await act(async () => insert.click());
    expect(onClose).not.toHaveBeenCalled();
    expect(localStorage.getItem('cybernotes-emoji-picker-recents-v1')).toBeNull();
    run.mockReturnValue(true);
    insertContent.mockClear();
    await act(async () => insert.click());
    expect(insertContent).toHaveBeenCalledExactlyOnceWith({ type: 'text', text: '😀' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('cybernotes-emoji-picker-recents-v1')!)).toEqual(['😀']);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

const setSearch = async (value: string) => act(async () => {
  const input = document.querySelector<HTMLInputElement>('.character-map-search input')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
});

it.each(['es', 'en'] as const)('edits a tray with repeats, preserves it across filters and mode changes, and confirms once (%s)', async language => {
  localStorage.setItem('cybernotes-emoji-picker-recents-v1', JSON.stringify(['❤️']));
  const insertContent = vi.fn(); const onClose = vi.fn();
  const chain = { focus: () => chain, setTextSelection: () => chain,
    insertContent: (content: unknown) => { insertContent(content); return chain; }, run: () => true };
  const editor = { state: { selection: { from: 1, to: 1 }, doc: { content: { size: 100 } } }, chain: () => chain,
    commands: { focus: vi.fn() }, isDestroyed: false } as unknown as Editor;
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<EmojiPickerModal editor={editor} language={language} uiScale={1} onClose={onClose} />));
    const mode = document.querySelector<HTMLButtonElement>('.picker-mode')!;
    const primary = document.querySelector<HTMLButtonElement>('.emoji-picker-modal .modal-action-btn.is-save')!;
    await act(async () => mode.click());
    expect(mode.getAttribute('aria-pressed')).toBe('true');
    const enqueue = async (value: string, detail = 1) => {
      await setSearch(value);
      await act(async () => document.querySelector<HTMLButtonElement>('[data-emoji-index]')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, detail })));
    };
    const queued = () => [...document.querySelectorAll('.picker-chip')].map(chip => chip.textContent);
    await enqueue('😀'); await enqueue('😀', 2); await enqueue('👩‍💻');
    expect(queued()).toEqual(['😀', '😀', '👩‍💻']);
    expect(primary.textContent).toContain(language === 'es' ? 'Insertar (3)' : 'Insert (3)');
    expect(insertContent).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('cybernotes-emoji-picker-recents-v1')!)).toEqual(['❤️']);
    await act(async () => document.querySelectorAll<HTMLButtonElement>('.picker-chip')[1].click());
    expect(queued()).toEqual(['😀', '👩‍💻']);
    await act(async () => mode.click());
    expect(document.querySelector('.picker-tray')).toBeNull();
    await act(async () => mode.click());
    expect(queued()).toEqual(['😀', '👩‍💻']);
    await act(async () => document.querySelector<HTMLButtonElement>('.picker-clear')!.click());
    expect(queued()).toEqual([]); expect(primary.disabled).toBe(true);
    await enqueue('👩‍💻'); await enqueue('❤️'); await enqueue('👩‍💻');
    await setSearch('no-matches-here');
    await act(async () => document.querySelectorAll<HTMLButtonElement>('.character-map-categories button')[1].click());
    expect(queued()).toEqual(['👩‍💻', '❤️', '👩‍💻']);
    await act(async () => document.querySelector<HTMLInputElement>('.character-map-search input')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })));
    expect(insertContent).not.toHaveBeenCalled();
    await act(async () => primary.click());
    expect(insertContent).toHaveBeenCalledExactlyOnceWith({ type: 'text', text: '👩‍💻❤️👩‍💻' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('cybernotes-emoji-picker-recents-v1')!)).toEqual(['👩‍💻', '❤️']);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('wraps keyboard navigation, confirms a single choice with Enter and cancels a tray without inserting', async () => {
  const insertContent = vi.fn(); const onClose = vi.fn();
  const chain = { focus: () => chain, setTextSelection: () => chain,
    insertContent: (content: unknown) => { insertContent(content); return chain; }, run: () => true };
  const editor = { state: { selection: { from: 1, to: 1 }, doc: { content: { size: 100 } } }, chain: () => chain,
    commands: { focus: vi.fn() }, isDestroyed: false } as unknown as Editor;
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<EmojiPickerModal key="single" editor={editor} language="es" uiScale={1} onClose={onClose} />));
    const search = document.querySelector<HTMLInputElement>('.character-map-search input')!;
    await act(async () => search.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })));
    expect(document.activeElement?.getAttribute('data-emoji-index')).toBe('2');
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    expect(insertContent).toHaveBeenCalledExactlyOnceWith({ type: 'text', text: '👩‍💻' });
    expect(onClose).toHaveBeenCalledTimes(1);
    insertContent.mockClear(); onClose.mockClear();
    await act(async () => root.render(<EmojiPickerModal key="multiple" editor={editor} language="es" uiScale={1} onClose={onClose} />));
    await act(async () => document.querySelector<HTMLButtonElement>('.picker-mode')!.click());
    await setSearch('😀');
    await act(async () => document.querySelector<HTMLButtonElement>('[data-emoji-index]')!.click());
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(insertContent).not.toHaveBeenCalled(); expect(onClose).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('cybernotes-emoji-picker-recents-v1')!)).toEqual(['👩‍💻']);
  } finally { await act(async () => root.unmount()); host.remove(); }
});

it('saves single and batch recents before the parent unmounts the picker', async () => {
  const chain = { focus: () => chain, setTextSelection: () => chain, insertContent: () => chain, run: () => true };
  const editor = { state: { selection: { from: 1, to: 1 }, doc: { content: { size: 100 } } }, chain: () => chain,
    commands: { focus: vi.fn() }, isDestroyed: false } as unknown as Editor;
  function Owner() {
    const [open, setOpen] = useState(true);
    return open ? <EmojiPickerModal editor={editor} language="en" uiScale={1} onClose={() => setOpen(false)} /> : null;
  }
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<Owner key="single" />));
    await setSearch('😀');
    await act(async () => document.querySelector<HTMLButtonElement>('[data-emoji-index]')!.click());
    await act(async () => document.querySelector<HTMLButtonElement>('.modal-action-btn.is-save')!.click());
    expect(document.querySelector('.emoji-picker-modal')).toBeNull();
    expect(JSON.parse(localStorage.getItem('cybernotes-emoji-picker-recents-v1')!)).toEqual(['😀']);
    await act(async () => root.render(<Owner key="batch" />));
    await act(async () => document.querySelector<HTMLButtonElement>('.picker-mode')!.click());
    for (const value of ['👩‍💻', '❤️']) {
      await setSearch(value);
      await act(async () => document.querySelector<HTMLButtonElement>('[data-emoji-index]')!.click());
    }
    await act(async () => document.querySelector<HTMLButtonElement>('.modal-action-btn.is-save')!.click());
    expect(document.querySelector('.emoji-picker-modal')).toBeNull();
    expect(JSON.parse(localStorage.getItem('cybernotes-emoji-picker-recents-v1')!)).toEqual(['❤️', '👩‍💻', '😀']);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
