import { describe, it, expect } from 'vitest';
import { groupVisualRows, planWrapGuides } from './NoteEditor';

describe('groupVisualRows', () => {
  it('agrupa fragmentos inline del mismo renglón aunque sus tops difieran (links, negritas)', () => {
    const rows = groupVisualRows([
      { top: 100, bottom: 119, left: 70 },
      { top: 103, bottom: 119, left: 200 },
      { top: 100, bottom: 119, left: 260 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].top).toBe(100);
  });

  it('separa renglones con wrap real', () => {
    const rows = groupVisualRows([
      { top: 86, bottom: 105, left: 70 },
      { top: 106, bottom: 125, left: 70 },
    ]);
    expect(rows).toHaveLength(2);
  });

  it('ordena por renglón aunque lleguen desordenados', () => {
    const rows = groupVisualRows([
      { top: 106, bottom: 125, left: 70 },
      { top: 86, bottom: 105, left: 70 },
    ]);
    expect(rows[0].top).toBe(86);
    expect(rows[1].top).toBe(106);
  });

  it('ignora rects degenerados', () => {
    const rows = groupVisualRows([
      { top: 100, bottom: 100, left: 70 },
      { top: 100, bottom: 119, left: 70 },
    ]);
    expect(rows).toHaveLength(1);
  });
});

describe('planWrapGuides', () => {
  it('sin wrap no hay marcas ni línea', () => {
    expect(planWrapGuides([{ top: 100, bottom: 119, left: 70 }])).toEqual({ marks: [], link: null });
  });

  it('un solo renglón de continuación: flecha sin línea', () => {
    const plan = planWrapGuides([
      { top: 86, bottom: 105, left: 70 },
      { top: 106, bottom: 125, left: 70 },
    ]);
    expect(plan.marks).toEqual([(106 + 125) / 2]);
    expect(plan.link).toBeNull();
  });

  it('dos continuaciones: flechas + línea que las conecta', () => {
    const plan = planWrapGuides([
      { top: 86, bottom: 105, left: 70 },
      { top: 106, bottom: 125, left: 70 },
      { top: 126, bottom: 145, left: 70 },
    ]);
    expect(plan.marks).toHaveLength(2);
    expect(plan.link).toEqual({ top: (106 + 125) / 2, height: (126 + 145) / 2 - (106 + 125) / 2 });
  });

  it('omite renglones que no arrancan al borde (texto centrado)', () => {
    const plan = planWrapGuides([
      { top: 86, bottom: 105, left: 200 },
      { top: 106, bottom: 125, left: 320 },
    ]);
    expect(plan).toEqual({ marks: [], link: null });
  });
});
