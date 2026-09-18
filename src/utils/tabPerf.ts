/**
 * Sonda de diagnóstico temporal para el cambio de pestañas.
 *
 * Mide en la máquina real: click → inicio de hidratación → fin de hidratación
 * → paint aproximado. Cada switch deja una línea en consola y un registro en
 * `window.__cybernotesTabPerf` para analizar dónde se va el tiempo.
 *
 * Costo despreciable (4 performance.now por switch). Quitar cuando se cierre
 * el caso de lentitud.
 */

export type TabSwitchSource =
  | 'cache'
  | 'draft'
  | 'cleared'
  | 'sync-other'
  | 'async-miss'
  | 'pending'
  | 'unknown';

interface QueuedSwitch {
  noteId: string;
  source: TabSwitchSource;
  tClick: number;
}

interface OpenHydration {
  entry: QueuedSwitch;
  tHydrationStart: number;
}

export interface TabSwitchRecord {
  noteId: string;
  source: TabSwitchSource;
  /** Brecha click → hidratación. Alta (~1s) = vía async/loader/IPC. */
  clickToHydrationMs: number;
  /** Trabajo síncrono de hidratación (setContent + focus + states). */
  hydrationMs: number;
  /** Total click → paint aproximado (doble rAF). */
  clickToPaintMs: number;
  at: string;
}

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    __cybernotesTabPerf?: TabSwitchRecord[];
  }
}

const queue: QueuedSwitch[] = [];
let openHydration: OpenHydration | null = null;

function getBuffer(): TabSwitchRecord[] {
  if (!window.__cybernotesTabPerf) window.__cybernotesTabPerf = [];
  const buf = window.__cybernotesTabPerf;
  if (buf.length > 100) buf.splice(0, buf.length - 100);
  return buf;
}

/** Llamar al inicio del handler de selección (click en tab). */
export function tabSwitchStart(noteId: string, source: TabSwitchSource): void {
  queue.push({ noteId, source, tClick: performance.now() });
  if (queue.length > 10) queue.shift();
}

/** El layout effect resolvió por una vía distinta a la del handler. */
export function tabSwitchResolve(noteId: string, source: TabSwitchSource): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].noteId === noteId) {
      queue[i].source = source;
      return;
    }
  }
}

/** Llamar al empezar la hidratación del editor (layout effect, primer statement). */
export function tabHydrationStart(noteId: string): void {
  let idx = -1;
  for (let i = 0; i < queue.length; i++) {
    if (queue[i].noteId === noteId) {
      idx = i;
      break;
    }
  }
  const entry: QueuedSwitch = idx >= 0 ? queue.splice(idx, 1)[0] : { noteId, source: 'unknown', tClick: performance.now() };
  openHydration = { entry, tHydrationStart: performance.now() };
}

/** Llamar al terminar la hidratación (mismo layout effect, último statement). */
export function tabHydrationEnd(): void {
  const open = openHydration;
  openHydration = null;
  if (!open) return;
  const tHydrationEnd = performance.now();
  const { entry, tHydrationStart } = open;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const tPaint = performance.now();
      const record: TabSwitchRecord = {
        noteId: entry.noteId,
        source: entry.source,
        clickToHydrationMs: Math.round((tHydrationStart - entry.tClick) * 10) / 10,
        hydrationMs: Math.round((tHydrationEnd - tHydrationStart) * 10) / 10,
        clickToPaintMs: Math.round((tPaint - entry.tClick) * 10) / 10,
        at: new Date().toISOString(),
      };
      getBuffer().push(record);
      // eslint-disable-next-line no-console
      console.info(
        `[tab-perf] ${record.noteId.slice(0, 8)} src=${record.source} ` +
          `click→hidrat=${record.clickToHydrationMs}ms hidrat=${record.hydrationMs}ms ` +
          `click→paint≈${record.clickToPaintMs}ms`,
      );
    });
  });
}
