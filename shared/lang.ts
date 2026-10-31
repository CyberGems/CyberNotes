/** Normaliza valores de idioma ('es', 'es-ES', 'ES', ...) a booleano. */
export function isSpanish(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().startsWith('es');
}

/** Choose the first supported OS language, preserving the user's preference order. */
export function preferredAppLanguage(languages: readonly string[]): 'es' | 'en' {
  for (const language of languages) {
    const match = /^(es|en)(?:[-_]|$)/i.exec(language);
    if (match) return match[1].toLowerCase() as 'es' | 'en';
  }
  return 'en';
}
