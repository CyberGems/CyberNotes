// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNoteDragAutoScroll } from './useNoteDragAutoScroll';
import { NOTE_DRAG_MIME } from '../utils/noteDrag';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  useNoteDragAutoScroll(ref);
  return <div ref={ref}><button onDragOver={event => event.stopPropagation()}>Folder</button><button data-sidebar-section="folders" aria-expanded="false">Folders</button></div>;
}

describe('sidebar auto-scroll during a note drag', () => {
  let root: ReturnType<typeof createRoot>;
  let host: HTMLDivElement;
  let container: HTMLDivElement;
  let callbacks: Map<number, FrameRequestCallback>;
  let nextId: number;
  let time: number;

  beforeEach(() => {
    callbacks = new Map(); nextId = 0; time = 0;
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callbacks.set(++nextId, callback); return nextId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id); });
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
    act(() => root.render(<Harness />));
    container = host.firstElementChild as HTMLDivElement;
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 100, 220, 300));
    Object.defineProperties(container, { clientHeight: { value: 300 }, scrollHeight: { value: 1500 } });
  });
  afterEach(() => {
    act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  });

  function over(y: number, types = [NOTE_DRAG_MIME], target: EventTarget = container.firstElementChild!) {
    const event = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperties(event, { dataTransfer: { value: { types } }, clientX: { value: 30 }, clientY: { value: y } });
    target.dispatchEvent(event);
    return event;
  }
  function frames(count: number) {
    for (let index = 0; index < count; index++) {
      const pending = [...callbacks.values()]; callbacks.clear(); time += 1000 / 60;
      act(() => pending.forEach(callback => callback(time)));
    }
  }

  it('keeps scrolling under a stationary cursor over a child that stops drag propagation', () => {
    expect(over(399).defaultPrevented).toBe(true);
    frames(30);
    expect(container.scrollTop).toBeGreaterThan(350);
    expect(callbacks.size).toBe(1);
    frames(100);
    expect(container.scrollTop).toBe(1200);
    expect(callbacks.size).toBe(0);
    over(101); frames(100);
    expect(container.scrollTop).toBe(0);
    expect(callbacks.size).toBe(0);
  });

  it('accelerates toward the edge and stops when the pointer returns to the middle or leaves the sidebar', () => {
    over(370); frames(10);
    const slow = container.scrollTop;
    container.scrollTop = 0;
    over(399); frames(10);
    expect(container.scrollTop).toBeGreaterThan(slow * 2);
    const previous = container.scrollTop;
    over(250); frames(10);
    expect(container.scrollTop).toBe(previous);
    expect(callbacks.size).toBe(0);
    over(399); frames(2);
    const beforeLeave = container.scrollTop;
    over(399, [NOTE_DRAG_MIME], document.body); frames(10);
    expect(container.scrollTop).toBe(beforeLeave);
    expect(callbacks.size).toBe(0);
  });

  it('ignores text, files and other native drags', () => {
    for (const types of [['text/plain'], ['Files'], []]) {
      expect(over(399, types).defaultPrevented).toBe(false);
      frames(10);
      expect(container.scrollTop).toBe(0);
    }
  });

  it('pauses over a collapsed header so it can expand without scrolling away from the cursor', () => {
    over(399); frames(3);
    const previous = container.scrollTop;
    const header = container.lastElementChild!;
    over(399, [NOTE_DRAG_MIME], header); frames(40);
    expect(container.scrollTop).toBe(previous);
    expect(callbacks.size).toBe(0);
    header.setAttribute('aria-expanded', 'true');
    over(399, [NOTE_DRAG_MIME], header); frames(3);
    expect(container.scrollTop).toBeGreaterThan(previous);
  });

  it.each(['drop', 'dragend', 'mouseup', 'cybernotes:dragend', 'blur', 'Escape', 'dragleave', 'unmount'])('stops pending animation on %s', event => {
    over(399); frames(3);
    const previous = container.scrollTop;
    if (event === 'unmount') act(() => root.render(null));
    else if (event === 'Escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    else if (event === 'dragleave') {
      const leave = new MouseEvent('dragleave', { bubbles: true, clientX: 250, clientY: 399 });
      container.dispatchEvent(leave);
    } else window.dispatchEvent(new Event(event));
    frames(10);
    expect(container.scrollTop).toBe(previous);
    expect(callbacks.size).toBe(0);
  });
});
