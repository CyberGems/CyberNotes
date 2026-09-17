/** Normaliza valores de idioma ('es', 'es-ES', 'ES', ...) a booleano. */
export function isSpanish(value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().startsWith('es');
}
