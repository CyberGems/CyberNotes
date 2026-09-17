// Logica pura del respaldo automatico (sin fs ni Electron): testeable en Vitest.

export const AUTO_BACKUP_INTERVALS_HOURS: readonly number[] = [6, 12, 24, 168];
export const AUTO_BACKUP_KEEP_OPTIONS: readonly number[] = [3, 5, 7, 14, 30];
export const DEFAULT_AUTO_BACKUP_HOURS = 24;
export const DEFAULT_AUTO_BACKUP_KEEP = 7;
export const BACKUP_FILE_PREFIX = 'cybernotes-backup-';

/** Normaliza el intervalo guardado; cualquier valor raro vuelve al diario. */
export function parseBackupHours(value: unknown): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  return AUTO_BACKUP_INTERVALS_HOURS.includes(n) ? n : DEFAULT_AUTO_BACKUP_HOURS;
}

/** Normaliza la retencion guardada; cualquier valor raro vuelve a 7 copias. */
export function parseBackupKeep(value: unknown): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  return AUTO_BACKUP_KEEP_OPTIONS.includes(n) ? n : DEFAULT_AUTO_BACKUP_KEEP;
}

/** True si nunca hubo respaldo, la fecha es invalida o ya paso el intervalo. */
export function isBackupDue(lastIso: string | null | undefined, nowMs: number, hours: number): boolean {
  if (!lastIso) return true;
  const last = Date.parse(lastIso);
  if (!Number.isFinite(last)) return true;
  return nowMs - last >= hours * 3_600_000;
}

/** Nombre ordenable y seguro para filesystems: cybernotes-backup-2026-09-18T07-30-00.db */
export function backupFileName(at: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${BACKUP_FILE_PREFIX}${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}T${p(at.getHours())}-${p(at.getMinutes())}-${p(at.getSeconds())}.db`;
}

export function isBackupFile(name: unknown): boolean {
  return typeof name === 'string' && name.startsWith(BACKUP_FILE_PREFIX) && name.endsWith('.db');
}

/** Las mas antiguas que sobran (orden alfabetico = orden cronologico). */
export function selectBackupsToPrune(files: string[], keep: number): string[] {
  const sorted = [...files].filter(isBackupFile).sort();
  return sorted.slice(0, Math.max(0, sorted.length - Math.max(0, keep)));
}
