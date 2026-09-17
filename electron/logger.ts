import path from 'path';
import fs from 'fs';

/**
 * Logger del main process: archivo diario en userData/logs.
 * Nunca debe lanzar: un fallo de logging no puede tumbar la app.
 */

let logsDir = '';
const MAX_LOG_BYTES = 2 * 1024 * 1024;

function formatErr(err: unknown): string {
  if (err instanceof Error) return err.stack || err.message;
  try {
    return JSON.stringify(err)?.slice(0, 2000) || String(err);
  } catch {
    return String(err);
  }
}

function logFilePath(): string {
  const day = new Date().toISOString().slice(0, 10);
  return path.join(logsDir, `cybernotes-${day}.log`);
}

function rotateIfNeeded(file: string): void {
  try {
    if (fs.statSync(file).size > MAX_LOG_BYTES) fs.renameSync(file, `${file}.1`);
  } catch {
    /* sin archivo todavia */
  }
}

export function writeLog(level: 'info' | 'warn' | 'error', message: string): void {
  if (!logsDir) return;
  try {
    const file = logFilePath();
    rotateIfNeeded(file);
    fs.appendFileSync(file, `[${new Date().toISOString()}] [${level}] ${message}\n`);
  } catch {
    /* logging must never crash the app */
  }
}

/** Errores del renderer (via IPC): se guardan en el mismo archivo. */
export function logRendererError(message: unknown): boolean {
  if (typeof message !== 'string' || !message.trim()) return false;
  writeLog('error', `renderer: ${message.slice(0, 5000)}`);
  return true;
}

export function initLogger(userDataPath: string): void {
  logsDir = path.join(userDataPath, 'logs');
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch {
    /* sin logs si no hay carpeta */
  }
  process.on('uncaughtException', (err) => {
    writeLog('error', `uncaughtException: ${formatErr(err)}`);
  });
  process.on('unhandledRejection', (reason) => {
    writeLog('error', `unhandledRejection: ${formatErr(reason)}`);
  });
}
