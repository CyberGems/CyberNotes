export interface NoteSelectionRect {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Measure card bounds in scroll-content coordinates, including virtual rows. */
export function measureNoteSelectionRects(container: HTMLElement, virtualIds: string[], rowHeight: number): NoteSelectionRect[] {
  const viewport = container.getBoundingClientRect();
  const rects = new Map<string, NoteSelectionRect>();
  for (const card of container.querySelectorAll<HTMLElement>('.note-item[data-note-id]')) {
    const bounds = card.getBoundingClientRect();
    rects.set(card.dataset.noteId!, {
      id: card.dataset.noteId!,
      left: bounds.left - viewport.left + container.scrollLeft,
      right: bounds.right - viewport.left + container.scrollLeft,
      top: bounds.top - viewport.top + container.scrollTop,
      bottom: bounds.bottom - viewport.top + container.scrollTop,
    });
  }
  const firstIndex = virtualIds.findIndex(id => rects.has(id));
  if (firstIndex !== -1) {
    const first = rects.get(virtualIds[firstIndex])!;
    const start = first.top - firstIndex * rowHeight;
    virtualIds.forEach((id, index) => {
      const top = start + index * rowHeight;
      rects.set(id, { ...first, id, top, bottom: top + first.bottom - first.top });
    });
  }
  return [...rects.values()];
}
