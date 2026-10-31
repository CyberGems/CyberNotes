/** Initial toolbar selection, persisted only for new or explicitly reset profiles. */
export const DEFAULT_HIDDEN_TOOLBAR_IDS = [
  'copy', 'paste', 'changeCase', 'h1', 'h2', 'alignJustify', 'video', 'characters',
] as const;

/** Profiles without a saved selection retain the historical implicit preference. */
export const LEGACY_HIDDEN_TOOLBAR_IDS = ['h1', 'h2'] as const;
