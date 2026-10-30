import { useEffect, type RefObject } from 'react';
import { isNoteDrag } from '../utils/noteDrag';

/** Keep scrolling during a native note drag, even when the pointer is stationary. */
export function useNoteDragAutoScroll(containerRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let pointer: { x: number; y: number } | null = null;
    let frame: number | null = null;
    let lastTime: number | null = null;
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      pointer = null;
      lastTime = null;
    };
    const tick = (time: number) => {
      frame = null;
      const container = containerRef.current;
      if (!container || !pointer) { stop(); return; }
      const rect = container.getBoundingClientRect();
      if (pointer.x < rect.left || pointer.x > rect.right || pointer.y < rect.top || pointer.y > rect.bottom) { stop(); return; }
      const edge = Math.min(48, rect.height / 3);
      const speed = edge <= 0 ? 0 : pointer.y < rect.top + edge
        ? -840 * (1 - (pointer.y - rect.top) / edge)
        : pointer.y > rect.bottom - edge ? 840 * (1 - (rect.bottom - pointer.y) / edge) : 0;
      if (!speed) { stop(); return; }
      const elapsed = lastTime === null ? 1000 / 60 : Math.min(32, time - lastTime);
      lastTime = time;
      const previous = container.scrollTop;
      container.scrollTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, previous + speed * elapsed / 1000));
      if (container.scrollTop === previous) { stop(); return; }
      frame = requestAnimationFrame(tick);
    };
    const over = (event: DragEvent) => {
      const container = containerRef.current;
      if (!container || !(event.target instanceof Node) || !container.contains(event.target) || !isNoteDrag(event.dataTransfer)) { stop(); return; }
      // Keep a collapsed header still while its delayed expansion is pending.
      if (event.target instanceof Element && event.target.closest('[data-sidebar-section][aria-expanded="false"]')) { stop(); return; }
      event.preventDefault();
      pointer = { x: event.clientX, y: event.clientY };
      if (frame === null) frame = requestAnimationFrame(tick);
    };
    const leave = (event: DragEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect && (event.clientX <= rect.left || event.clientX >= rect.right || event.clientY <= rect.top || event.clientY >= rect.bottom)) stop();
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') stop(); };
    // Capture runs before the individual drop targets stop propagation.
    window.addEventListener('dragover', over, true);
    window.addEventListener('dragleave', leave, true);
    window.addEventListener('drop', stop, true);
    window.addEventListener('dragend', stop);
    window.addEventListener('mouseup', stop);
    window.addEventListener('cybernotes:dragend', stop);
    window.addEventListener('blur', stop);
    window.addEventListener('keydown', key);
    return () => {
      stop();
      window.removeEventListener('dragover', over, true);
      window.removeEventListener('dragleave', leave, true);
      window.removeEventListener('drop', stop, true);
      window.removeEventListener('dragend', stop);
      window.removeEventListener('mouseup', stop);
      window.removeEventListener('cybernotes:dragend', stop);
      window.removeEventListener('blur', stop);
      window.removeEventListener('keydown', key);
    };
  }, [containerRef]);
}
