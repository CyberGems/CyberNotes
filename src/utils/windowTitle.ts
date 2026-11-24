const APP_NAME = 'CyberNotes';

/** Keep the native window title aligned with the active note and its save state. */
export function setWindowTitle(context?: string | null, dirty = false): void {
  const title = context ? `${APP_NAME} · ${context}${dirty ? '*' : ''}` : APP_NAME;
  if (document.title !== title) document.title = title;
}
