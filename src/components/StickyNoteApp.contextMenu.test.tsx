// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Note } from '../types';
import StickyNoteApp from './StickyNoteApp';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./GlobalErrorToast', () => ({ default: () => null }));
vi.mock('./Tooltip', () => ({ default: ({ children }: { children: React.ReactNode }) => children }));

const note: Note = {
  id: 'sticky-1',
  folder_id: null,
  title: 'Example title',
  content: '<p>Body</p>',
  preview: 'Body',
  thumb: '',
  pinned: 0,
  created_at: '2026-10-03T00:00:00.000Z',
  updated_at: '2026-10-03T00:00:00.000Z',
  deleted_at: null,
};

describe('floating note title context menu', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens on right click before Electron sends spelling suggestions', async () => {
    let sendContextData: ((data: unknown) => void) | undefined;
    Object.defineProperty(window, 'cyberNotesAPI', {
      configurable: true,
      value: {
        getSettings: vi.fn().mockResolvedValue({}),
        isSessionLocked: vi.fn().mockResolvedValue(false),
        getStickyConfig: vi.fn().mockResolvedValue({ opacity: 0.7 }),
        getNoteById: vi.fn().mockResolvedValue(note),
        setStickyWindowChrome: vi.fn(),
        onNoteUpdated: () => () => {},
        onNoteDeleted: () => () => {},
        onForceLock: () => () => {},
        onContextMenuData: (callback: (data: unknown) => void) => {
          sendContextData = callback;
          return () => {};
        },
      },
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(<StickyNoteApp noteId={note.id} />);
      });
      expect(window.cyberNotesAPI.setStickyWindowChrome).toHaveBeenLastCalledWith(note.id, 'cyber-yellow', 0.7);
      const input = container.querySelector('.sticky-note-header input');
      expect(input).not.toBeNull();

      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        button: 2,
        clientX: 30,
        clientY: 20,
      });
      await act(async () => {
        input!.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(container.querySelector('.sticky-context-menu')?.textContent).toContain('Seleccionar todo');
      expect(window.cyberNotesAPI.setStickyWindowChrome).toHaveBeenLastCalledWith(note.id, 'cyber-yellow', 1);

      await act(async () => {
        sendContextData?.({ x: 30, y: 20, suggestions: ['Example'], misspelledWord: 'Exemple' });
      });
      expect(container.querySelector('.sticky-context-menu')?.textContent).toContain('Exemple');

      await act(async () => window.dispatchEvent(new MouseEvent('click')));
      expect(container.querySelector('.sticky-context-menu')).toBeNull();
      expect(window.cyberNotesAPI.setStickyWindowChrome).toHaveBeenLastCalledWith(note.id, 'cyber-yellow', 0.7);

      const editorBody = container.querySelector('.tiptap');
      expect(editorBody).not.toBeNull();
      await act(async () => {
        editorBody!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 }));
      });
      expect(container.querySelector('.sticky-context-menu')).not.toBeNull();
      expect(window.cyberNotesAPI.setStickyWindowChrome).toHaveBeenLastCalledWith(note.id, 'cyber-yellow', 1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
