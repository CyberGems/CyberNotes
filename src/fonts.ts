export type EditorFontId = 'inter' | 'jetbrains-mono' | 'merriweather' | 'outfit' | 'system';

export interface EditorFont {
  id: EditorFontId;
  name: string;
  nameEs: string;
  nameEn: string;
  category: 'sans' | 'mono' | 'serif';
  categoryLabelEs: string;
  categoryLabelEn: string;
  family: string;
  descriptionEs: string;
  descriptionEn: string;
  sample: string;
}

export const EDITOR_FONTS: EditorFont[] = [
  {
    id: 'inter',
    name: 'Inter',
    nameEs: 'Inter (Sans-serif)',
    nameEn: 'Inter (Sans-serif)',
    category: 'sans',
    categoryLabelEs: 'Sans-serif',
    categoryLabelEn: 'Sans-serif',
    family: "'Inter', system-ui, -apple-system, sans-serif",
    descriptionEs: 'Limpia, moderna y neutra. Predeterminada de CyberNotes.',
    descriptionEn: 'Clean, modern and neutral. CyberNotes default.',
    sample: 'Aa Bb Gg 123 · CyberNotes',
  },
  {
    id: 'jetbrains-mono',
    name: 'JetBrains Mono',
    nameEs: 'JetBrains Mono (Código)',
    nameEn: 'JetBrains Mono (Code)',
    category: 'mono',
    categoryLabelEs: 'Monoespacio',
    categoryLabelEn: 'Monospace',
    family: "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
    descriptionEs: 'Espaciado fijo de alta legibilidad, ideal para notas técnicas y markdown.',
    descriptionEn: 'Fixed-width clarity, ideal for technical notes and markdown.',
    sample: 'const note = { id: 102 };',
  },
  {
    id: 'merriweather',
    name: 'Merriweather',
    nameEs: 'Merriweather (Serif)',
    nameEn: 'Merriweather (Serif)',
    category: 'serif',
    categoryLabelEs: 'Serif editorial',
    categoryLabelEn: 'Editorial Serif',
    family: "'Merriweather', Georgia, 'Times New Roman', serif",
    descriptionEs: 'Estilo editorial y literario, descansada para largas sesiones de redacción.',
    descriptionEn: 'Editorial and literary style, comfortable for extended writing.',
    sample: 'Aa Bb Gg 123 · Historias & ideas',
  },
  {
    id: 'outfit',
    name: 'Outfit',
    nameEs: 'Outfit (Geométrica)',
    nameEn: 'Outfit (Geometric)',
    category: 'sans',
    categoryLabelEs: 'Geométrica',
    categoryLabelEn: 'Geometric',
    family: "'Outfit', system-ui, sans-serif",
    descriptionEs: 'Trazos circulares modernos y estética estilizada de alta definición.',
    descriptionEn: 'Modern circular curves and sleek high-definition aesthetics.',
    sample: 'Aa Bb Gg 123 · Cyberpunk future',
  },
  {
    id: 'system',
    name: 'Sistema',
    nameEs: 'Nativa del Sistema (Segoe UI)',
    nameEn: 'System Native (Segoe UI)',
    category: 'sans',
    categoryLabelEs: 'Nativa del SO',
    categoryLabelEn: 'OS Native',
    family: "'Segoe UI', system-ui, -apple-system, sans-serif",
    descriptionEs: 'Integración nativa con la apariencia tipográfica de Windows.',
    descriptionEn: 'Native integration with Windows typography.',
    sample: 'Aa Bb Gg 123 · Sistema operativo',
  },
];

export const DEFAULT_EDITOR_FONT: EditorFontId = 'inter';

export function applyEditorFont(fontId: string) {
  const font = EDITOR_FONTS.find(f => f.id === fontId) || EDITOR_FONTS[0];
  document.documentElement.style.setProperty('--font-editor', font.family);
}
