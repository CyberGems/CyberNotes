// Logica pura de la migracion de la carpeta de datos (sin fs ni Electron):
// testeable en Vitest. El lado fs/BD vive en electron/main.ts.

/** Carpeta de datos actual (userData) tras el renombre de la app. */
export const DATA_FOLDER_NAME = 'CyberNotes';
/** Carpeta de datos legacy que dejaba package.json#name = "cyber-notes". */
export const LEGACY_DATA_FOLDER_NAME = 'cyber-notes';
/** Marca escrita en userData cuando la migracion termina con exito. */
export const DATA_MIGRATION_MARKER = '.migrated-from-cyber-notes';

/** Notas que seedInitialDemoContent crea en una instalacion nueva. */
export const SEED_NOTE_IDS: readonly string[] = [
  'welcome-note',
  'cybergems-suite-note',
  'quickstart-note',
  'floating-demo-note',
];

/**
 * True si el perfil destino solo contiene las notas demo iniciales (se creo
 * vacio en un arranque anterior y nunca tuvo datos de usuario).
 */
export function isPristineSeedProfile(noteIds: readonly string[]): boolean {
  return noteIds.length === SEED_NOTE_IDS.length
    && noteIds.every(id => SEED_NOTE_IDS.includes(id));
}

/**
 * Par (from, to) para reescribir URLs file:/// tras mover la carpeta. Con la
 * barra final se evita capturar carpetas vecinas como "cyber-notes-old".
 */
export function buildFileUrlRewrite(oldDir: string, newDir: string): { from: string; to: string } {
  const posix = (p: string): string => p.replace(/\\/g, '/');
  return {
    from: `file:///${posix(oldDir)}/`,
    to: `file:///${posix(newDir)}/`,
  };
}
