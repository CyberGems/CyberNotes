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
  const button = (label: string) => Array.from(container.querySelectorAll('button')).find(item => item.textContent?.includes(label))!;

  beforeEach(() => {
    finishOnboarding.mockReset();
    vi.stubGlobal('cyberNotesAPI', { finishOnboarding });
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
  });
});
