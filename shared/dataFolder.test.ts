import { describe, it, expect } from 'vitest';
import {
  SEED_NOTE_IDS,
  isPristineSeedProfile,
  buildFileUrlRewrite,
} from './dataFolder';

describe('isPristineSeedProfile', () => {
  it('detecta un perfil recien sembrado (solo las notas demo)', () => {
    expect(isPristineSeedProfile([...SEED_NOTE_IDS])).toBe(true);
  });

  it('detecta el perfil demo en cualquier orden', () => {
    expect(isPristineSeedProfile([...SEED_NOTE_IDS].reverse())).toBe(true);
  });

  it('rechaza un perfil con notas de usuario', () => {
    expect(isPristineSeedProfile([...SEED_NOTE_IDS, 'mynote-1'])).toBe(false);
  });

  it('rechaza un perfil al que le falta una nota demo', () => {
    expect(isPristineSeedProfile(SEED_NOTE_IDS.slice(1))).toBe(false);
  });

  it('rechaza perfiles vacios o con ids distintos', () => {
    expect(isPristineSeedProfile([])).toBe(false);
    expect(isPristineSeedProfile(['mynote-1'])).toBe(false);
  });
});

describe('buildFileUrlRewrite', () => {
  it('reescribe URLs file:/// de la carpeta vieja a la nueva (rutas Windows)', () => {
    const { from, to } = buildFileUrlRewrite(
      'C:\\Users\\CARLOS\\AppData\\Roaming\\cyber-notes',
      'C:\\Users\\CARLOS\\AppData\\Roaming\\CyberNotes',
    );
    expect(from).toBe('file:///C:/Users/CARLOS/AppData/Roaming/cyber-notes/');
    expect(to).toBe('file:///C:/Users/CARLOS/AppData/Roaming/CyberNotes/');
  });

  it('incluye la barra final para no capturar carpetas vecinas', () => {
    const { from } = buildFileUrlRewrite('C:\\datos\\cyber-notes', 'C:\\datos\\CyberNotes');
    expect(from.endsWith('/')).toBe(true);
    expect('file:///C:/datos/cyber-notes-old/img.png'.includes(from)).toBe(false);
  });
});
