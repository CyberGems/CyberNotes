// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { PickerTray, reorderPickerEntries } from './PickerControls';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock('./NativeGlyph', () => ({ default: ({ value }: { value: string }) => <span>{value}</span> }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it.each(['emoji', 'symbol'] as const)('%s tray scrolls continuously at both edges and stops at the centre, outside, on drop, cancellation, blur and unmount', async kind => {
  const frames = new Map<number, FrameRequestCallback>(); let id = 0, time = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (frame: number) => frames.delete(frame));
  const advance = async (count = 30) => act(async () => {
    for (let i = 0; i < count; i++) { time += 16; const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(time)); }
  });
  const initial = Array.from({ length: 80 }, (_, queueId) => ({ queueId, value: String(queueId), es: String(queueId), en: String(queueId) }));
  const reorder = vi.fn();
  function Owner() {
    const [entries, setEntries] = useState(initial);
    return <PickerTray language="es" kind={kind} entries={entries} fontFamily="sans-serif" onRemove={() => {}} onClear={() => {}} focusSearch={() => {}}
      onReorder={(source, target, after) => { reorder(source, target, after); setEntries(current => reorderPickerEntries(current, source, target, after)); }} />;
  }
  const host = document.createElement('div'); document.body.appendChild(host); const root = createRoot(host);
  try {
    await act(async () => root.render(<Owner />));
    const tray = host.querySelector<HTMLElement>('.picker-tray-items')!, chip = host.querySelector<HTMLElement>('.picker-chip')!;
    vi.spyOn(tray, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 100, 400, 100));
    Object.defineProperties(tray, { clientHeight: { value: 100 }, scrollHeight: { value: 1000 }, scrollTop: { writable: true, value: 400 } });
    const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
    const drag = async (target: Element, type: string, y = 150, relatedTarget: EventTarget | null = null) => act(async () => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 20, clientY: y, relatedTarget });
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer }); target.dispatchEvent(event);
    });
    await drag(tray, 'dragover', 198); await advance(); expect(tray.scrollTop).toBe(400); // External drag.
    await drag(chip, 'dragstart'); await drag(chip, 'dragover', 198); await advance(); expect(tray.scrollTop).toBeGreaterThan(500);
    await drag(chip, 'dragover', 102); await advance(); expect(tray.scrollTop).toBeCloseTo(400, 1);
    await drag(chip, 'dragover', 150); await advance(); const centred = tray.scrollTop; await advance(); expect(tray.scrollTop).toBe(centred);
    await drag(chip, 'dragover', 198); await drag(tray, 'dragleave', 201); await advance(); expect(tray.scrollTop).toBe(centred);
    for (const stop of ['dragend', 'blur', 'drop']) {
      await drag(chip, 'dragstart'); await drag(chip, 'dragover', 198);
      if (stop === 'blur') await act(async () => window.dispatchEvent(new Event('blur')));
      else await drag(stop === 'drop' ? tray : chip, stop);
      const before = tray.scrollTop; await advance(); expect(tray.scrollTop).toBe(before); expect(frames.size).toBe(0);
    }
    expect(reorder).toHaveBeenCalledTimes(1); expect(host.querySelectorAll('.picker-chip')).toHaveLength(80);
    await drag(chip, 'dragstart'); tray.scrollTop = 895; await drag(chip, 'dragover', 198); await advance(); expect(tray.scrollTop).toBe(900); expect(frames.size).toBe(0);
    tray.scrollTop = 5; await drag(chip, 'dragover', 102); await advance(); expect(tray.scrollTop).toBe(0); expect(frames.size).toBe(0);
    tray.scrollTop = 400; await drag(chip, 'dragover', 198); expect(frames.size).toBe(1);
    await act(async () => root.unmount()); expect(frames.size).toBe(0);
  } finally { if (host.firstChild) await act(async () => root.unmount()); host.remove(); }
});
