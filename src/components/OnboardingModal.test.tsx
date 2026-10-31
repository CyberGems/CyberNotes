// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OnboardingModal from './OnboardingModal';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('first-run setup', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  const finishOnboarding = vi.fn();
  const windowForceClose = vi.fn();
  const button = (label: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes(label))!;

  beforeEach(() => {
    finishOnboarding.mockReset();
    windowForceClose.mockReset();
    vi.stubGlobal('cyberNotesAPI', { finishOnboarding, windowForceClose });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => root.render(<OnboardingModal initialLanguage="en" initialTheme="cyber-dark" />));
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('submits the chosen language, theme and optional name and lets the user retry a failure', async () => {
    finishOnboarding.mockResolvedValue({ ok: false });
    await act(async () => button('Español').click());
    expect(container.textContent).toContain('Las notas de bienvenida se crearán en este idioma.');
    await act(async () => button('Gris').click());
    const input = container.querySelector('input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(input, '  Carlos  '); input.dispatchEvent(new Event('input', { bubbles: true })); });
    await act(async () => button('Comenzar').click());
    expect(finishOnboarding).toHaveBeenCalledWith({ language: 'es', theme: 'graphite', name: 'Carlos' });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Inténtalo de nuevo');
    expect(button('Comenzar').disabled).toBe(false);
  });

  it('skips the name on Escape while retaining the selected language and theme', async () => {
    finishOnboarding.mockResolvedValue({ ok: false });
    await act(async () => button('Español').click());
    await act(async () => button('Claro').click());
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(finishOnboarding).toHaveBeenCalledWith({ language: 'es', theme: 'light', name: '' });
  });

  it('previews themes locally and keeps the example name as a placeholder', async () => {
    const rootTheme = document.documentElement.dataset.theme;
    await act(async () => button('Español').click());
    const input = container.querySelector('input')!;
    expect(input.placeholder).toBe('Usuario');
    expect(input.value).toBe('');
    expect(container.textContent).toContain('Tu nombre (opcional)');
    expect(container.querySelector('#onboarding-name-help')?.textContent).toContain('saludos personalizados');
    await act(async () => button('Claro').click());
    expect(container.querySelector<HTMLElement>('.onboarding-overlay')?.dataset.theme).toBe('light');
    expect(container.querySelector<HTMLElement>('.onboarding-overlay')?.style.getPropertyValue('--bg-modal')).toBe('#ffffff');
    expect(document.documentElement.dataset.theme).toBe(rootTheme);
    finishOnboarding.mockResolvedValue({ ok: false });
    await act(async () => button('Comenzar').click());
    expect(finishOnboarding).toHaveBeenCalledWith({ language: 'es', theme: 'light', name: '' });
  });

  it('closes the application directly while first-run setup is active', async () => {
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click());
    expect(windowForceClose).toHaveBeenCalledOnce();
    expect(finishOnboarding).not.toHaveBeenCalled();
  });

  it.each(['start', 'skip', 'escape', 'close'])('closes the preview with %s without saving', async action => {
    const onClosePreview = vi.fn();
    await act(async () => root.render(<OnboardingModal initialLanguage="en" initialTheme="cyber-dark" onClosePreview={onClosePreview} />));
    await act(async () => button('Español').click());
    await act(async () => button('Claro').click());
    expect(container.textContent).toContain('Vista previa: tus elecciones no se guardarán.');
    await act(async () => {
      if (action === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      else if (action === 'close') container.querySelector<HTMLButtonElement>('[aria-label="Cerrar"]')!.click();
      else button(action === 'start' ? 'Comenzar' : 'Omitir').click();
    });
    expect(onClosePreview).toHaveBeenCalledOnce();
    expect(finishOnboarding).not.toHaveBeenCalled();
    expect(windowForceClose).not.toHaveBeenCalled();
  });
});
