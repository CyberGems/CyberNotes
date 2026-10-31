import { describe, expect, it } from 'vitest';
import { preferredAppLanguage } from './lang';

describe('preferred app language', () => {
  it.each([
    [['es-CR', 'en-US'], 'es'],
    [['EN-us', 'es-ES'], 'en'],
    [['fr-FR', 'es-MX', 'en-US'], 'es'],
    [['fr-FR', 'de-DE'], 'en'],
    [[], 'en'],
  ] as const)('uses the first supported preferred language from %s', (languages, expected) => {
    expect(preferredAppLanguage(languages)).toBe(expected);
  });
});
