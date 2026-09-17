import { describe, it, expect } from 'vitest';
import { TRANSLATIONS } from './languages';

function keysOf(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    keysOf(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('TRANSLATIONS parity', () => {
  it('es and en share exactly the same keys', () => {
    const es = new Set(keysOf(TRANSLATIONS.es));
    const en = new Set(keysOf(TRANSLATIONS.en));
    const missingInEn = [...es].filter((k) => !en.has(k));
    const missingInEs = [...en].filter((k) => !es.has(k));
    expect({ missingInEn, missingInEs }).toEqual({ missingInEn: [], missingInEs: [] });
  });
});
