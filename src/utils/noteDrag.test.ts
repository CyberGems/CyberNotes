import { describe, expect, it, vi } from 'vitest';
import { NOTE_DRAG_MIME, NOTE_IDS_DRAG_MIME, readNoteDragIds, writeNoteDragData } from './noteDrag';

describe('note drag payloads', () => {
  const reader = (values: Record<string, string>) => ({ getData: (type: string) => values[type] ?? '' });

  it('carries the full selection while retaining the dragged note for legacy consumers', () => {
    const setData = vi.fn();
    const data = { setData, effectAllowed: 'none' } as unknown as DataTransfer;
    writeNoteDragData(data, 'second', ['first', 'second', 'first']);
    expect(setData).toHaveBeenCalledWith('text/plain', 'second');
    expect(setData).toHaveBeenCalledWith(NOTE_DRAG_MIME, 'second');
    expect(setData).toHaveBeenCalledWith(NOTE_IDS_DRAG_MIME, '["first","second"]');
    expect(data.effectAllowed).toBe('move');
  });

  it('reads each note once from a group and preserves single-note payloads', () => {
    expect(readNoteDragIds(reader({ [NOTE_IDS_DRAG_MIME]: '["first","second","first"]' }))).toEqual(['first', 'second']);
    expect(readNoteDragIds(reader({ [NOTE_DRAG_MIME]: 'first' }))).toEqual(['first']);
    expect(readNoteDragIds(reader({ 'text/plain': 'first' }))).toEqual(['first']);
  });

  it.each(['invalid', '[]', '{}', '["first",null]', '["first",42]', '[""]'])('rejects an invalid group instead of moving only its legacy note: %s', value => {
    expect(readNoteDragIds(reader({ [NOTE_IDS_DRAG_MIME]: value, [NOTE_DRAG_MIME]: 'first', 'text/plain': 'first' }))).toEqual([]);
  });
});
