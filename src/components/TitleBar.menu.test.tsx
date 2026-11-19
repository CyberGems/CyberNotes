// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import TitleBar from './TitleBar';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('./Tooltip', () => ({
  default: ({ children }: { children: React.ReactNode }) => children,
  TooltipShortcut: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock('./WelcomeGreeting', () => ({ default: () => null }));

describe('More menu', () => {
  it('opens each section as a flyout and keeps the menu within a short viewport', async () => {
    Object.defineProperty(window, 'cyberNotesAPI', {
      configurable: true,
      value: { isMaximized: vi.fn().mockResolvedValue(false), onMaximizedState: () => () => {} },
    });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 560 });
    const onSaveNote = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(
        <TitleBar
          language="es"
          currentNoteId="note-1"
          onSaveNote={onSaveNote}
        />,
      ));
      await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', altKey: true })));

      const menu = document.querySelector<HTMLElement>('[role="menu"][aria-label="Más opciones"]');
      expect(menu).not.toBeNull();
      expect(menu!.style.overflowY).toBe('auto');
      expect(menu!.style.maxHeight).toContain('100vh');
      expect(menu!.style.boxSizing).toBe('border-box');

      // The main list holds only the section triggers plus the app actions.
      for (const label of ['Nota actual', 'Exportar', 'Ajustes rápidos', 'Ayuda']) {
        expect(menu!.textContent).toContain(label);
      }
      expect(menu!.textContent).not.toContain('Aplicación');
      expect(menu!.textContent).not.toContain('Notas recientes');

      const mainButtons = [...menu!.querySelectorAll<HTMLButtonElement>(':scope > button.menu-item')];
      expect(mainButtons.some(button => button.textContent === 'Bloquear')).toBe(true);
      expect(mainButtons[mainButtons.length - 1]?.textContent).toContain('Salir de CyberNotes');

      // Section rows live in the flyout, not in the menu itself.
      const noteHeader = [...menu!.querySelectorAll<HTMLButtonElement>('.more-menu-section-toggle')]
        .find(button => button.textContent?.includes('Nota actual'))!;
      expect(noteHeader.getAttribute('aria-haspopup')).toBe('menu');
      await act(async () => noteHeader.click());

      const flyout = document.querySelector<HTMLElement>('.more-menu-flyout');
      expect(flyout).not.toBeNull();
      expect(flyout!.getAttribute('role')).toBe('menu');
      expect(flyout!.getAttribute('aria-label')).toBe('Nota actual');

      const save = [...flyout!.querySelectorAll('button')].find(button => button.textContent?.includes('Guardar nota'));
      expect(save).toBeDefined();
      await act(async () => save!.click());
      expect(onSaveNote).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
