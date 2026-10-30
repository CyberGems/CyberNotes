export const NOTE_DRAG_MIME = 'application/cybernotes-note';
export const NOTE_IDS_DRAG_MIME = 'application/x-cybernotes-note-ids';
export const NOTE_DROP_RESULT_EVENT = 'cybernotes:note-drop-result';

export interface NoteDropResult {
  movedIds: string[];
  failedIds: string[];
}

export function writeNoteDragData(data: DataTransfer, draggedId: string, selectedIds: string[]): void {
  data.setData('text/plain', draggedId);
  data.setData(NOTE_DRAG_MIME, draggedId);
  data.setData(NOTE_IDS_DRAG_MIME, JSON.stringify([...new Set(selectedIds)]));
  data.effectAllowed = 'move';
}

export function readNoteDragIds(data: Pick<DataTransfer, 'getData'>): string[] {
  const multiple = data.getData(NOTE_IDS_DRAG_MIME);
  if (multiple) {
    try {
      const ids: unknown = JSON.parse(multiple);
      if (!Array.isArray(ids) || !ids.length || !ids.every(id => typeof id === 'string' && id.length > 0 && id.length <= 100)) return [];
      return [...new Set(ids as string[])];
    } catch {
      // A malformed group must never fall back to moving just its first note.
      return [];
    }
  }
  const single = data.getData(NOTE_DRAG_MIME) || data.getData('text/plain');
  return single && single.length <= 100 ? [single] : [];
}
