// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EditorEdgeToggle from './EditorEdgeToggle';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe.each(['left', 'right'] as const)('%s editor edge control', side => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  let button: HTMLButtonElement;
  const toggle = vi.fn<() => void>();
  const mouse = (type: string, values: MouseEventInit = {}) => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 20, ...values });
    act(() => { button.dispatchEvent(event); });
    return event;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    toggle.mockReset();
    act(() => root.render(<EditorEdgeToggle side={side} expanded offset={50} label="Hide panel" onToggle={toggle} />));
    button = container.querySelector('button')!;
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('accepts deliberate clicks and keyboard activation while preventing mouse focus theft', () => {
    expect(mouse('mousedown', { button: 0, buttons: 1 }).defaultPrevented).toBe(true);
    mouse('mouseup');
    mouse('click', { detail: 1 });
    expect(toggle).toHaveBeenCalledOnce();
    act(() => button.click()); // Native keyboard and assistive clicks have detail=0.
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it('ignores a selection drag that enters and ends over the control', () => {
    mouse('mouseover', { buttons: 1 });
    mouse('mousemove', { buttons: 1 });
    mouse('mouseup');
    mouse('click', { detail: 1 });
    expect(toggle).not.toHaveBeenCalled();
    expect(button.getAttribute('aria-label')).toBe('Hide panel');
  });

  it('cancels activation after dragging or leaving the target', () => {
    mouse('mousedown', { button: 0, buttons: 1 });
    mouse('mousemove', { buttons: 1, clientX: 20 });
    mouse('mouseup');
    mouse('click', { detail: 1, clientX: 20 });
    mouse('mousedown', { button: 0, buttons: 1 });
    mouse('mouseout', { buttons: 1, relatedTarget: document.body });
    mouse('mouseover', { buttons: 1 });
    mouse('mouseup');
    mouse('click', { detail: 1 });
    expect(toggle).not.toHaveBeenCalled();
  });
});
