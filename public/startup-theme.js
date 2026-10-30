'use strict';

// Runs before the loader's first paint, using the saved palette from Electron.
try {
  const appearance = window.cyberNotesAPI?.getStartupAppearance?.();
  if (appearance) {
    const root = document.documentElement;
    root.dataset.theme = appearance.theme;
    root.style.colorScheme = appearance.colorScheme;
    root.lang = appearance.language;
    for (const [key, value] of Object.entries(appearance.vars)) {
      if (key.startsWith('--') && typeof value === 'string') root.style.setProperty(key, value);
    }
  }
} catch (error) {
  console.error('Could not read the startup appearance:', error);
}
