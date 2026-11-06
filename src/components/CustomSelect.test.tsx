// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import CustomSelect from './CustomSelect';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('CustomSelect component', () => {
  let root: ReturnType<typeof createRoot>;
  let container: HTMLDivElement;

  const options = [
    { value: 'es', label: 'Español' },
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'Français', disabled: true },
    { value: 'de', label: 'Deutsch' },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.querySelectorAll('.cfg-select-menu').forEach(el => el.remove());
  });

  it('renders current option label and accessible combobox role', async () => {
    await act(async () => {
      root.render(
        <CustomSelect
          value="es"
          onChange={vi.fn()}
          options={options}
          ariaLabel="Idioma"
        />
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('.cfg-select-trigger')!;
    expect(trigger).not.toBeNull();
    expect(trigger.textContent).toContain('Español');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('opens menu on click and closes on option selection', async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root.render(
        <CustomSelect
          value="es"
          onChange={handleChange}
          options={options}
          ariaLabel="Idioma"
        />
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('.cfg-select-trigger')!;
    await act(async () => {
      trigger.click();
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const menu = document.body.querySelector<HTMLDivElement>('.cfg-select-menu')!;
    expect(menu).not.toBeNull();

    const enOption = [...menu.querySelectorAll<HTMLDivElement>('.cfg-select-option')].find(
      opt => opt.textContent === 'English'
    )!;
    await act(async () => {
      enOption.click();
    });

    expect(handleChange).toHaveBeenCalledWith('en');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('does not select disabled options', async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root.render(
        <CustomSelect
          value="es"
          onChange={handleChange}
          options={options}
          ariaLabel="Idioma"
        />
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('.cfg-select-trigger')!;
    await act(async () => {
      trigger.click();
    });

    const menu = document.body.querySelector<HTMLDivElement>('.cfg-select-menu')!;
    const frOption = [...menu.querySelectorAll<HTMLDivElement>('.cfg-select-option')].find(
      opt => opt.textContent === 'Français'
    )!;

    await act(async () => {
      frOption.click();
    });

    expect(handleChange).not.toHaveBeenCalled();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('supports keyboard navigation with ArrowDown, ArrowUp, and Enter', async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root.render(
        <CustomSelect
          value="es"
          onChange={handleChange}
          options={options}
          ariaLabel="Idioma"
        />
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('.cfg-select-trigger')!;

    // ArrowDown to open
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    // ArrowDown to move to next item ('en')
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    // Enter to select
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledWith('en');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('closes on Escape without selecting', async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root.render(
        <CustomSelect
          value="es"
          onChange={handleChange}
          options={options}
          ariaLabel="Idioma"
        />
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('.cfg-select-trigger')!;
    await act(async () => {
      trigger.click();
    });
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(handleChange).not.toHaveBeenCalled();
  });

  it('jumps to matching option on alphanumeric typing', async () => {
    const handleChange = vi.fn();
    await act(async () => {
      root.render(
        <CustomSelect
          value="es"
          onChange={handleChange}
          options={options}
          ariaLabel="Idioma"
        />
      );
    });

    const trigger = container.querySelector<HTMLButtonElement>('.cfg-select-trigger')!;
    await act(async () => {
      trigger.click();
    });

    // Type 'd' for Deutsch
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', bubbles: true }));
    });

    // Press Enter to confirm
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledWith('de');
  });
});
