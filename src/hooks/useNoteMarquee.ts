import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import type { NoteSelectionRect } from '../utils/noteSelection';

interface Gesture {
  pointerId: number;
  x: number;
  y: number;
  clientX: number;
  clientY: number;
  startClientX: number;
  startClientY: number;
  base: Set<string>;
  additive: boolean;
  active: boolean;
  items: NoteSelectionRect[];
}

export function useNoteMarquee(containerRef: RefObject<HTMLDivElement | null>, measure: () => NoteSelectionRect[], onEmptyClick?: () => void) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const boxRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  const measureRef = useRef(measure);
  measureRef.current = measure;
  const emptyClickRef = useRef(onEmptyClick);
  emptyClickRef.current = onEmptyClick;
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef<number | null>(null);
  const ignoreClickRef = useRef(false);
  const clickTimerRef = useRef<number | null>(null);

  const stop = useCallback((restore: boolean) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    if (gesture && containerRef.current?.hasPointerCapture?.(gesture.pointerId)) {
      containerRef.current.releasePointerCapture(gesture.pointerId);
    }
    if (restore && gesture) setSelectedIds(gesture.base);
    if (boxRef.current) boxRef.current.style.display = 'none';
    containerRef.current?.classList.remove('note-list-is-selecting');
  }, [containerRef]);

  const update = useCallback(() => {
    const gesture = gestureRef.current;
    const container = containerRef.current;
    if (!gesture?.active || !container) return;
    const viewport = container.getBoundingClientRect();
    const x = Math.max(0, Math.min(container.clientWidth, gesture.clientX - viewport.left)) + container.scrollLeft;
    const y = Math.max(0, Math.min(container.clientHeight, gesture.clientY - viewport.top)) + container.scrollTop;
    const left = Math.min(gesture.x, x);
    const top = Math.min(gesture.y, y);
    const right = Math.max(gesture.x, x);
    const bottom = Math.max(gesture.y, y);
    const next = new Set(gesture.additive ? gesture.base : []);
    for (const item of gesture.items) {
      if (item.right > left && item.left < right && item.bottom > top && item.top < bottom) next.add(item.id);
    }
    setSelectedIds(previous => previous.size === next.size && [...previous].every(id => next.has(id)) ? previous : next);
    if (boxRef.current) Object.assign(boxRef.current.style, {
      display: 'block', left: `${left - container.scrollLeft}px`, top: `${top - container.scrollTop}px`,
      width: `${right - left}px`, height: `${bottom - top}px`,
    });
  }, [containerRef]);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      gesture.clientX = event.clientX;
      gesture.clientY = event.clientY;
      if (!gesture.active && Math.hypot(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY) > 4) {
        gesture.active = true;
        containerRef.current?.classList.add('note-list-is-selecting');
        const tick = () => {
          const current = gestureRef.current;
          const container = containerRef.current;
          if (!current?.active || !container) return;
          const viewport = container.getBoundingClientRect();
          const edge = Math.min(32, container.clientHeight / 4);
          const speed = current.clientY < viewport.top + edge
            ? -Math.min(18, (viewport.top + edge - current.clientY) * 0.6)
            : current.clientY > viewport.bottom - edge
              ? Math.min(18, (current.clientY - viewport.bottom + edge) * 0.6) : 0;
          if (speed) container.scrollTop = Math.max(0, Math.min(container.scrollHeight - container.clientHeight, container.scrollTop + speed));
          update();
          frameRef.current = requestAnimationFrame(tick);
        };
        frameRef.current = requestAnimationFrame(tick);
      }
      if (gesture.active) {
        event.preventDefault();
        update();
      }
    };
    const up = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture || event.pointerId !== gesture.pointerId) return;
      if (gesture.active) {
        gesture.clientX = event.clientX;
        gesture.clientY = event.clientY;
        update();
        ignoreClickRef.current = true;
        clickTimerRef.current = window.setTimeout(() => { ignoreClickRef.current = false; clickTimerRef.current = null; }, 0);
      } else if (!gesture.additive) {
        setSelectedIds(new Set());
        emptyClickRef.current?.();
      }
      stop(false);
    };
    const cancel = () => stop(true);
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gestureRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      }
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key, true);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current);
    };
  }, [containerRef, stop, update]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    const target = event.target as HTMLElement;
    if (target.closest('.note-item, .note-group-header, button, input, textarea, select, a, [role="button"]')) return;
    const container = containerRef.current;
    if (!container) return;
    const viewport = container.getBoundingClientRect();
    if (event.clientX >= viewport.left + container.clientWidth || event.clientY >= viewport.top + container.clientHeight) return;
    event.preventDefault();
    container.focus({ preventScroll: true });
    if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = null;
    ignoreClickRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      x: event.clientX - viewport.left + container.scrollLeft,
      y: event.clientY - viewport.top + container.scrollTop,
      clientX: event.clientX, clientY: event.clientY,
      startClientX: event.clientX, startClientY: event.clientY,
      base: new Set(selectedRef.current), additive: event.ctrlKey || event.metaKey || event.shiftKey,
      active: false, items: measureRef.current(),
    };
    container.setPointerCapture?.(event.pointerId);
  }, [containerRef]);

  const onClickCapture = useCallback((event: ReactMouseEvent) => {
    if (!ignoreClickRef.current) return;
    ignoreClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const clear = useCallback(() => { stop(false); setSelectedIds(new Set()); }, [stop]);
  return { selectedIds, setSelectedIds, boxRef, onPointerDown, onClickCapture, clear };
}
