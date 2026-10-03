import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import type { Editor } from '@tiptap/react';
import { Search, Sigma, X } from 'lucide-react';
import type { Language } from '../languages';
import { EnterGlyph, KeyHint, modalCardMotion, modalOverlayMotion, modalOverlayStyle, useModalKeys } from './ModalActions';

type CharacterCategory = 'latin' | 'punctuation' | 'brackets' | 'math' | 'currency' | 'arrows' | 'greek' | 'super' | 'shapes' | 'emoji';
type CharacterFilter = 'all' | 'recent' | CharacterCategory;

interface CharacterEntry {
  value: string;
  es: string;
  en: string;
  category: CharacterCategory;
}

const CHARACTER_GROUPS: { id: CharacterCategory; es: string; en: string; entries: [string, string, string][] }[] = [
  { id: 'latin', es: 'Letras', en: 'Letters', entries: [
    ['á', 'a con acento agudo', 'a with acute'], ['Á', 'A con acento agudo', 'A with acute'],
    ['é', 'e con acento agudo', 'e with acute'], ['É', 'E con acento agudo', 'E with acute'],
    ['í', 'i con acento agudo', 'i with acute'], ['ó', 'o con acento agudo', 'o with acute'],
    ['ú', 'u con acento agudo', 'u with acute'], ['ñ', 'eñe minúscula', 'lowercase eñe'],
    ['Ñ', 'Eñe mayúscula', 'uppercase eñe'], ['ü', 'u con diéresis', 'u with diaeresis'],
    ['ç', 'c con cedilla', 'c with cedilla'], ['ß', 'eszett', 'eszett'],
    ['æ', 'ligadura ae minúscula', 'lowercase ae ligature'], ['Æ', 'Ligadura AE mayúscula', 'uppercase AE ligature'],
    ['œ', 'ligadura oe minúscula', 'lowercase oe ligature'], ['Œ', 'Ligadura OE mayúscula', 'uppercase OE ligature'],
    ['ø', 'o barrada minúscula', 'lowercase o with stroke'], ['Ø', 'O barrada mayúscula', 'uppercase O with stroke'],
    ['ł', 'l con barra', 'l with stroke'], ['đ', 'd con barra', 'd with stroke'],
    ['ð', 'eth minúscula', 'lowercase eth'], ['þ', 'thorn minúscula', 'lowercase thorn'],
    ['ı', 'i sin punto', 'dotless i'], ['ə', 'schwa', 'schwa'],
    ['ʃ', 'esh', 'esh'], ['ʒ', 'ezh', 'ezh'], ['ŋ', 'eng', 'eng'], ['ħ', 'h barrada', 'h with stroke'],
  ] },
  { id: 'punctuation', es: 'Puntuación', en: 'Punctuation', entries: [
    ['¿', 'signo de interrogación inicial', 'inverted question mark'], ['¡', 'signo de exclamación inicial', 'inverted exclamation mark'],
    ['«', 'comilla angular de apertura', 'left-pointing double angle quote'], ['»', 'comilla angular de cierre', 'right-pointing double angle quote'],
    ['‹', 'comilla angular simple de apertura', 'single left angle quote'], ['›', 'comilla angular simple de cierre', 'single right angle quote'],
    ['“', 'comilla doble curva de apertura', 'left double quotation mark'], ['”', 'comilla doble curva de cierre', 'right double quotation mark'],
    ['‘', 'comilla simple curva de apertura', 'left single quotation mark'], ['’', 'comilla simple curva de cierre', 'right single quotation mark'],
    ['„', 'comilla doble baja', 'double low quotation mark'], ['…', 'puntos suspensivos', 'ellipsis'],
    ['—', 'raya', 'em dash'], ['–', 'semirraya', 'en dash'], ['‐', 'guion tipográfico', 'hyphen'],
    ['·', 'punto medio', 'middle dot'], ['•', 'viñeta', 'bullet'], ['‣', 'viñeta triangular', 'triangular bullet'],
    ['§', 'signo de sección', 'section sign'], ['¶', 'signo de párrafo', 'pilcrow'],
    ['†', 'daga', 'dagger'], ['‡', 'doble daga', 'double dagger'], ['※', 'marca de referencia', 'reference mark'],
    ['№', 'signo de número', 'numero sign'], ['‰', 'por mil', 'per mille'], ['‱', 'por diez mil', 'per ten thousand'],
    ['′', 'prima', 'prime'], ['″', 'doble prima', 'double prime'], ['‽', 'interrobang', 'interrobang'],
  ] },
  { id: 'brackets', es: 'Paréntesis', en: 'Brackets', entries: [
    ['(', 'paréntesis de apertura', 'opening parenthesis'], [')', 'paréntesis de cierre', 'closing parenthesis'],
    ['[', 'corchete de apertura', 'opening square bracket'], [']', 'corchete de cierre', 'closing square bracket'],
    ['{', 'llave de apertura', 'opening curly brace'], ['}', 'llave de cierre', 'closing curly brace'],
    ['<', 'corchete angular de apertura', 'opening angle bracket'], ['>', 'corchete angular de cierre', 'closing angle bracket'],
    ['⟨', 'paréntesis angular matemático de apertura', 'opening mathematical angle bracket'], ['⟩', 'paréntesis angular matemático de cierre', 'closing mathematical angle bracket'],
    ['〈', 'paréntesis angular de apertura', 'opening angle bracket'], ['〉', 'paréntesis angular de cierre', 'closing angle bracket'],
    ['《', 'corchete angular doble de apertura', 'opening double angle bracket'], ['》', 'corchete angular doble de cierre', 'closing double angle bracket'],
    ['「', 'corchete de esquina de apertura', 'opening corner bracket'], ['」', 'corchete de esquina de cierre', 'closing corner bracket'],
    ['『', 'corchete de esquina doble de apertura', 'opening white corner bracket'], ['』', 'corchete de esquina doble de cierre', 'closing white corner bracket'],
    ['【', 'corchete negro de apertura', 'opening black lenticular bracket'], ['】', 'corchete negro de cierre', 'closing black lenticular bracket'],
    ['〔', 'corchete tortuga de apertura', 'opening tortoise shell bracket'], ['〕', 'corchete tortuga de cierre', 'closing tortoise shell bracket'],
    ['〖', 'corchete blanco de apertura', 'opening white lenticular bracket'], ['〗', 'corchete blanco de cierre', 'closing white lenticular bracket'],
    ['〘', 'corchete blanco de apertura', 'opening white tortoise shell bracket'], ['〙', 'corchete blanco de cierre', 'closing white tortoise shell bracket'],
    ['〚', 'corchete blanco cuadrado de apertura', 'opening white square bracket'], ['〛', 'corchete blanco cuadrado de cierre', 'closing white square bracket'],
    ['⟪', 'corchete angular doble matemático de apertura', 'opening mathematical double angle bracket'], ['⟫', 'corchete angular doble matemático de cierre', 'closing mathematical double angle bracket'],
    ['⦃', 'llave punteada de apertura', 'opening dotted fence'], ['⦄', 'llave punteada de cierre', 'closing dotted fence'],
    ['⦅', 'paréntesis blanco de apertura', 'opening white parenthesis'], ['⦆', 'paréntesis blanco de cierre', 'closing white parenthesis'],
    ['❨', 'paréntesis ornamental de apertura', 'medium left parenthesis ornament'], ['❩', 'paréntesis ornamental de cierre', 'medium right parenthesis ornament'],
    ['❪', 'paréntesis angular ornamental de apertura', 'medium flattened left parenthesis ornament'], ['❫', 'paréntesis angular ornamental de cierre', 'medium flattened right parenthesis ornament'],
    ['❬', 'corchete angular ornamental de apertura', 'medium left-pointing angle bracket ornament'], ['❭', 'corchete angular ornamental de cierre', 'medium right-pointing angle bracket ornament'],
    ['❮', 'corchete angular negro de apertura', 'heavy left-pointing angle quotation mark ornament'], ['❯', 'corchete angular negro de cierre', 'heavy right-pointing angle quotation mark ornament'],
    ['❰', 'corchete angular grueso de apertura', 'heavy left-pointing angle bracket ornament'], ['❱', 'corchete angular grueso de cierre', 'heavy right-pointing angle bracket ornament'],
    ['❲', 'corchete curvo de apertura', 'light left tortoise shell bracket ornament'], ['❳', 'corchete curvo de cierre', 'light right tortoise shell bracket ornament'],
    ['❴', 'llave ornamental de apertura', 'medium left curly bracket ornament'], ['❵', 'llave ornamental de cierre', 'medium right curly bracket ornament'],
  ] },
  { id: 'math', es: 'Matemáticas', en: 'Math', entries: [
    ['±', 'más o menos', 'plus-minus'], ['×', 'multiplicación', 'multiplication'], ['÷', 'división', 'division'],
    ['≠', 'distinto de', 'not equal to'], ['≈', 'aproximadamente igual', 'approximately equal'], ['≡', 'idéntico a', 'identical to'],
    ['≤', 'menor o igual que', 'less than or equal to'], ['≥', 'mayor o igual que', 'greater than or equal to'],
    ['∞', 'infinito', 'infinity'], ['√', 'raíz cuadrada', 'square root'], ['∛', 'raíz cúbica', 'cube root'],
    ['∑', 'sumatoria', 'n-ary summation'], ['∏', 'productoria', 'n-ary product'], ['∫', 'integral', 'integral'],
    ['∂', 'derivada parcial', 'partial differential'], ['∆', 'incremento', 'increment'], ['∇', 'nabla', 'nabla'],
    ['∈', 'pertenece a', 'element of'], ['∉', 'no pertenece a', 'not an element of'], ['∩', 'intersección', 'intersection'],
    ['∪', 'unión', 'union'], ['⊂', 'subconjunto propio', 'proper subset'], ['⊃', 'superconjunto propio', 'proper superset'],
    ['⊆', 'subconjunto o igual', 'subset or equal'], ['⊇', 'superconjunto o igual', 'superset or equal'],
    ['∧', 'conjunción lógica', 'logical and'], ['∨', 'disyunción lógica', 'logical or'], ['¬', 'negación lógica', 'logical not'],
    ['∀', 'para todo', 'for all'], ['∃', 'existe', 'there exists'], ['∴', 'por lo tanto', 'therefore'],
    ['∵', 'porque', 'because'], ['∝', 'proporcional a', 'proportional to'], ['∠', 'ángulo', 'angle'],
    ['⊥', 'perpendicular', 'perpendicular'], ['∥', 'paralelo', 'parallel'], ['°', 'grado', 'degree'],
  ] },
  { id: 'currency', es: 'Monedas', en: 'Currency', entries: [
    ['€', 'euro', 'euro'], ['£', 'libra esterlina', 'pound sterling'], ['¥', 'yen o yuan', 'yen or yuan'],
    ['¢', 'centavo', 'cent'], ['₹', 'rupia india', 'Indian rupee'], ['₽', 'rublo', 'ruble'],
    ['₩', 'won', 'won'], ['₪', 'nuevo séquel', 'new shekel'], ['₫', 'dong', 'dong'],
    ['₱', 'peso', 'peso'], ['₦', 'naira', 'naira'], ['₴', 'grivna', 'hryvnia'],
    ['₡', 'colón', 'colon'], ['₲', 'guaraní', 'guarani'], ['₵', 'cedi', 'cedi'],
    ['₸', 'tenge', 'tenge'], ['₺', 'lira turca', 'Turkish lira'], ['₼', 'manat', 'manat'],
    ['₾', 'lari', 'lari'], ['฿', 'baht', 'baht'], ['₭', 'kip', 'kip'],
  ] },
  { id: 'arrows', es: 'Flechas', en: 'Arrows', entries: [
    ['←', 'flecha izquierda', 'left arrow'], ['↑', 'flecha arriba', 'up arrow'], ['→', 'flecha derecha', 'right arrow'], ['↓', 'flecha abajo', 'down arrow'],
    ['↔', 'flecha izquierda-derecha', 'left-right arrow'], ['↕', 'flecha arriba-abajo', 'up-down arrow'],
    ['↖', 'flecha noroeste', 'northwest arrow'], ['↗', 'flecha noreste', 'northeast arrow'],
    ['↘', 'flecha sureste', 'southeast arrow'], ['↙', 'flecha suroeste', 'southwest arrow'],
    ['⇐', 'doble flecha izquierda', 'left double arrow'], ['⇑', 'doble flecha arriba', 'up double arrow'],
    ['⇒', 'doble flecha derecha', 'right double arrow'], ['⇓', 'doble flecha abajo', 'down double arrow'],
    ['⇔', 'doble flecha izquierda-derecha', 'left-right double arrow'], ['⇕', 'doble flecha arriba-abajo', 'up-down double arrow'],
    ['↩', 'flecha curva a la izquierda', 'leftwards arrow with hook'], ['↪', 'flecha curva a la derecha', 'rightwards arrow with hook'],
    ['↻', 'flecha circular', 'clockwise open circle arrow'], ['↺', 'flecha circular antihoraria', 'anticlockwise open circle arrow'],
    ['⟵', 'flecha larga izquierda', 'long left arrow'], ['⟶', 'flecha larga derecha', 'long right arrow'],
    ['➜', 'flecha de trazo', 'rightwards arrow'], ['➤', 'punta de flecha', 'black right-pointing arrowhead'],
  ] },
  { id: 'greek', es: 'Griego', en: 'Greek', entries: [
    ['α', 'alfa minúscula', 'lowercase alpha'], ['β', 'beta minúscula', 'lowercase beta'], ['γ', 'gamma minúscula', 'lowercase gamma'],
    ['δ', 'delta minúscula', 'lowercase delta'], ['ε', 'épsilon minúscula', 'lowercase epsilon'], ['ζ', 'zeta minúscula', 'lowercase zeta'],
    ['η', 'eta minúscula', 'lowercase eta'], ['θ', 'theta minúscula', 'lowercase theta'], ['ι', 'iota minúscula', 'lowercase iota'],
    ['κ', 'kappa minúscula', 'lowercase kappa'], ['λ', 'lambda minúscula', 'lowercase lambda'], ['μ', 'mu minúscula', 'lowercase mu'],
    ['ν', 'nu minúscula', 'lowercase nu'], ['ξ', 'xi minúscula', 'lowercase xi'], ['ο', 'ómicron minúscula', 'lowercase omicron'],
    ['π', 'pi minúscula', 'lowercase pi'], ['ρ', 'rho minúscula', 'lowercase rho'], ['σ', 'sigma minúscula', 'lowercase sigma'],
    ['ς', 'sigma final', 'final sigma'], ['τ', 'tau minúscula', 'lowercase tau'], ['υ', 'ípsilon minúscula', 'lowercase upsilon'],
    ['φ', 'phi minúscula', 'lowercase phi'], ['χ', 'chi minúscula', 'lowercase chi'], ['ψ', 'psi minúscula', 'lowercase psi'], ['ω', 'omega minúscula', 'lowercase omega'],
    ['Α', 'Alfa mayúscula', 'uppercase alpha'], ['Β', 'Beta mayúscula', 'uppercase beta'], ['Γ', 'Gamma mayúscula', 'uppercase gamma'],
    ['Δ', 'Delta mayúscula', 'uppercase delta'], ['Θ', 'Theta mayúscula', 'uppercase theta'], ['Λ', 'Lambda mayúscula', 'uppercase lambda'],
    ['Π', 'Pi mayúscula', 'uppercase pi'], ['Σ', 'Sigma mayúscula', 'uppercase sigma'], ['Φ', 'Phi mayúscula', 'uppercase phi'],
    ['Ψ', 'Psi mayúscula', 'uppercase psi'], ['Ω', 'Omega mayúscula', 'uppercase omega'],
  ] },
  { id: 'super', es: 'Super y subíndices', en: 'Super & subscript', entries: [
    ['⁰', 'cero superíndice', 'superscript zero'], ['¹', 'uno superíndice', 'superscript one'], ['²', 'dos superíndice', 'superscript two'],
    ['³', 'tres superíndice', 'superscript three'], ['⁴', 'cuatro superíndice', 'superscript four'], ['⁵', 'cinco superíndice', 'superscript five'],
    ['⁶', 'seis superíndice', 'superscript six'], ['⁷', 'siete superíndice', 'superscript seven'], ['⁸', 'ocho superíndice', 'superscript eight'], ['⁹', 'nueve superíndice', 'superscript nine'],
    ['⁺', 'más superíndice', 'superscript plus'], ['⁻', 'menos superíndice', 'superscript minus'], ['⁼', 'igual superíndice', 'superscript equals'],
    ['₀', 'cero subíndice', 'subscript zero'], ['₁', 'uno subíndice', 'subscript one'], ['₂', 'dos subíndice', 'subscript two'],
    ['₃', 'tres subíndice', 'subscript three'], ['₄', 'cuatro subíndice', 'subscript four'], ['₅', 'cinco subíndice', 'subscript five'],
    ['₆', 'seis subíndice', 'subscript six'], ['₇', 'siete subíndice', 'subscript seven'], ['₈', 'ocho subíndice', 'subscript eight'], ['₉', 'nueve subíndice', 'subscript nine'],
    ['₊', 'más subíndice', 'subscript plus'], ['₋', 'menos subíndice', 'subscript minus'], ['₌', 'igual subíndice', 'subscript equals'],
  ] },
  { id: 'shapes', es: 'Formas y signos', en: 'Shapes & marks', entries: [
    ['★', 'estrella rellena', 'black star'], ['☆', 'estrella vacía', 'white star'], ['♥', 'corazón relleno', 'black heart suit'], ['♡', 'corazón vacío', 'white heart suit'],
    ['✓', 'marca de verificación', 'check mark'], ['✔', 'marca de verificación gruesa', 'heavy check mark'], ['✗', 'cruz', 'ballot x'], ['✘', 'cruz gruesa', 'heavy ballot x'],
    ['☑', 'casilla marcada', 'ballot box with check'], ['☒', 'casilla con cruz', 'ballot box with x'], ['⚠', 'advertencia', 'warning sign'], ['ℹ', 'información', 'information source'],
    ['■', 'cuadrado relleno', 'black square'], ['□', 'cuadrado vacío', 'white square'], ['▪', 'cuadrado pequeño', 'black small square'], ['▫', 'cuadrado pequeño vacío', 'white small square'],
    ['●', 'círculo relleno', 'black circle'], ['○', 'círculo vacío', 'white circle'], ['◉', 'círculo con punto', 'fisheye'], ['◎', 'círculos concéntricos', 'bullseye'],
    ['◆', 'rombo relleno', 'black diamond'], ['◇', 'rombo vacío', 'white diamond'], ['▲', 'triángulo arriba', 'black up-pointing triangle'], ['△', 'triángulo arriba vacío', 'white up-pointing triangle'],
    ['▼', 'triángulo abajo', 'black down-pointing triangle'], ['▽', 'triángulo abajo vacío', 'white down-pointing triangle'], ['♪', 'nota musical', 'eighth note'], ['♫', 'notas musicales', 'beamed eighth notes'],
  ] },
  { id: 'emoji', es: 'Emoji', en: 'Emoji', entries: [
    ['😀', 'cara sonriente', 'grinning face'], ['😂', 'cara llorando de risa', 'face with tears of joy'], ['🥹', 'cara conteniendo lágrimas', 'face holding back tears'], ['😍', 'cara con ojos de corazón', 'smiling face with heart-eyes'],
    ['🤔', 'cara pensativa', 'thinking face'], ['🙃', 'cara al revés', 'upside-down face'], ['🔥', 'fuego', 'fire'], ['✨', 'destellos', 'sparkles'],
    ['🎉', 'fiesta', 'party popper'], ['✅', 'casilla completada', 'check mark button'], ['🚀', 'cohete', 'rocket'], ['🧠', 'cerebro', 'brain'],
    ['💡', 'bombilla', 'light bulb'], ['❤️', 'corazón rojo', 'red heart'], ['👍', 'pulgar arriba', 'thumbs up'], ['🙏', 'manos juntas', 'folded hands'],
    ['🫶', 'manos en forma de corazón', 'heart hands'], ['🌟', 'estrella brillante', 'glowing star'], ['📌', 'chincheta', 'pushpin'], ['🎯', 'diana', 'bullseye'],
  ] },
];

const CATEGORY_LABELS: Record<CharacterFilter, { es: string; en: string }> = {
  all: { es: 'Todos', en: 'All' },
  recent: { es: 'Recientes', en: 'Recent' },
  latin: { es: 'Letras', en: 'Letters' },
  punctuation: { es: 'Puntuación', en: 'Punctuation' },
  brackets: { es: 'Paréntesis', en: 'Brackets' },
  math: { es: 'Matemáticas', en: 'Math' },
  currency: { es: 'Monedas', en: 'Currency' },
  arrows: { es: 'Flechas', en: 'Arrows' },
  greek: { es: 'Griego', en: 'Greek' },
  super: { es: 'Super/subíndices', en: 'Super/subscript' },
  shapes: { es: 'Formas', en: 'Shapes' },
  emoji: { es: 'Emoji', en: 'Emoji' },
};

const CHARACTER_ENTRIES: CharacterEntry[] = CHARACTER_GROUPS.flatMap(group =>
  group.entries.map(([value, es, en]) => ({ value, es, en, category: group.id })),
);
const RECENT_STORAGE_KEY = 'cybernotes-character-map-recents-v1';
const VIEW_SESSION_KEY = 'cybernotes-character-map-view-v1';

interface CharacterMapViewState {
  category: CharacterFilter;
  gridScrollTop: Partial<Record<CharacterFilter, number>>;
  modalHeight: number | null;
}

const CHARACTER_FILTERS = new Set<CharacterFilter>([
  'all', 'recent', ...CHARACTER_GROUPS.map(group => group.id),
]);

function readCharacterMapViewState(): CharacterMapViewState {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(VIEW_SESSION_KEY) || 'null');
    if (!value || typeof value !== 'object') {
      return { category: 'all', gridScrollTop: {}, modalHeight: null };
    }
    const stored = value as Partial<CharacterMapViewState>;
    const gridScrollTop: Partial<Record<CharacterFilter, number>> = {};
    if (stored.gridScrollTop && typeof stored.gridScrollTop === 'object') {
      for (const [filter, scrollTop] of Object.entries(stored.gridScrollTop)) {
        if (CHARACTER_FILTERS.has(filter as CharacterFilter) && typeof scrollTop === 'number' && Number.isFinite(scrollTop) && scrollTop >= 0) {
          gridScrollTop[filter as CharacterFilter] = scrollTop;
        }
      }
    }
    const modalHeight = typeof stored.modalHeight === 'number' && Number.isFinite(stored.modalHeight) && stored.modalHeight > 0
      ? stored.modalHeight
      : null;
    return {
      category: CHARACTER_FILTERS.has(stored.category as CharacterFilter) ? stored.category as CharacterFilter : 'all',
      gridScrollTop,
      modalHeight,
    };
  } catch {
    return { category: 'all', gridScrollTop: {}, modalHeight: null };
  }
}

function normalizeSearch(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

function codePointLabel(value: string): string {
  return Array.from(value)
    .map(character => `U+${(character.codePointAt(0) || 0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' · ');
}

function parseCodePoint(query: string): string | null {
  const trimmed = query.trim();
  const hasPrefix = /^(?:u\+|0x)/i.test(trimmed);
  const normalized = trimmed.replace(/^(?:u\+|0x)/i, '');
  if (!/^[0-9a-f]{1,6}$/i.test(normalized) || (!hasPrefix && normalized.length < 3)) return null;
  const codePoint = Number.parseInt(normalized, 16);
  if (
    codePoint > 0x10ffff ||
    (codePoint >= 0xd800 && codePoint <= 0xdfff) ||
    codePoint < 0x20 ||
    (codePoint >= 0x7f && codePoint <= 0x9f) ||
    (codePoint >= 0xfdd0 && codePoint <= 0xfdef) ||
    (codePoint & 0xffff) >= 0xfffe
  ) return null;
  return String.fromCodePoint(codePoint);
}

export default function CharacterMapModal({ editor, language, uiScale, onClose }: {
  editor: Editor;
  language: Language;
  uiScale: number;
  onClose: () => void;
}) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const resizeStartRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const skipActiveGridScrollRef = useRef(false);
  const scrollPersistTimerRef = useRef<number | null>(null);
  const viewStateRef = useRef<CharacterMapViewState | null>(null);
  if (!viewStateRef.current) viewStateRef.current = readCharacterMapViewState();
  const initialViewState = viewStateRef.current;
  const gridScrollPositionsRef = useRef(initialViewState.gridScrollTop);
  const resizeHeightRef = useRef<number | null>(initialViewState.modalHeight);
  const insertionRangeRef = useRef({ from: editor.state.selection.from, to: editor.state.selection.to });
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CharacterFilter>(initialViewState.category);
  const [modalHeight, setModalHeight] = useState<number | null>(initialViewState.modalHeight);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selected, setSelected] = useState<CharacterEntry | null>(null);
  const [recentCharacters, setRecentCharacters] = useState<string[]>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(RECENT_STORAGE_KEY) || '[]');
      return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string').slice(0, 16) : [];
    } catch {
      return [];
    }
  });
  const isSpanish = language === 'es';
  const persistViewState = useCallback((patch: Partial<CharacterMapViewState>) => {
    const current = viewStateRef.current || { category: 'all', gridScrollTop: {}, modalHeight: null };
    const next: CharacterMapViewState = {
      ...current,
      ...patch,
      gridScrollTop: patch.gridScrollTop
        ? { ...current.gridScrollTop, ...patch.gridScrollTop }
        : current.gridScrollTop,
    };
    viewStateRef.current = next;
    try { sessionStorage.setItem(VIEW_SESSION_KEY, JSON.stringify(next)); } catch { /* session storage opcional */ }
  }, []);

  const filteredEntries = useMemo(() => {
    const normalizedQuery = normalizeSearch(query.trim());
    const source = category === 'recent'
      ? recentCharacters.map(value => CHARACTER_ENTRIES.find(entry => entry.value === value) || {
          value,
          es: 'Carácter usado recientemente',
          en: 'Recently used character',
          category: 'latin' as const,
        })
      : CHARACTER_ENTRIES.filter(entry => category === 'all' || entry.category === category);
    const matches = source.filter(entry => {
      if (!normalizedQuery) return true;
      return normalizeSearch(`${entry.value} ${entry.es} ${entry.en} ${codePointLabel(entry.value)}`).includes(normalizedQuery);
    });
    const typedCharacter = parseCodePoint(query);
    if (typedCharacter && !matches.some(entry => entry.value === typedCharacter)) {
      matches.unshift({
        value: typedCharacter,
        es: 'Carácter Unicode',
        en: 'Unicode character',
        category: 'latin',
      });
    }
    return matches;
  }, [category, query, recentCharacters]);

  const close = useCallback(() => {
    if (scrollPersistTimerRef.current !== null) window.clearTimeout(scrollPersistTimerRef.current);
    persistViewState({
      category,
      gridScrollTop: { [category]: query ? gridScrollPositionsRef.current[category] || 0 : gridRef.current?.scrollTop || 0 },
      modalHeight,
    });
    onClose();
    requestAnimationFrame(() => {
      if (!editor.isDestroyed) editor.commands.focus();
    });
  }, [category, editor, modalHeight, onClose, persistViewState, query]);
  useModalKeys({ enabled: true, onEsc: close, onEnter: close });

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    skipActiveGridScrollRef.current = true;
    if (gridRef.current) gridRef.current.scrollTop = query ? 0 : gridScrollPositionsRef.current[category] || 0;
  }, [category, query]);

  useEffect(() => {
    if (skipActiveGridScrollRef.current) {
      skipActiveGridScrollRef.current = false;
      return;
    }
    const buttons = gridRef.current?.querySelectorAll<HTMLButtonElement>('button');
    buttons?.[Math.min(activeIndex, buttons.length - 1)]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, filteredEntries]);

  useEffect(() => () => {
    if (scrollPersistTimerRef.current !== null) window.clearTimeout(scrollPersistTimerRef.current);
  }, []);

  const resizeModalTo = useCallback((height: number) => {
    const maxHeight = Math.max(300, Math.min(780 * uiScale, window.innerHeight - 24));
    const minHeight = Math.min(440 * uiScale, maxHeight);
    const nextHeight = Math.max(minHeight, Math.min(maxHeight, height));
    resizeHeightRef.current = nextHeight;
    setModalHeight(nextHeight);
    return nextHeight;
  }, [uiScale]);

  const beginResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if ((event.pointerType === 'mouse' && event.button !== 0) || !modalRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const startHeight = modalRef.current.getBoundingClientRect().height;
    resizeHeightRef.current = startHeight;
    resizeStartRef.current = { pointerId: event.pointerId, startY: event.clientY, startHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const moveResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    resizeModalTo(start.startHeight + event.clientY - start.startY);
  }, [resizeModalTo]);

  const finishResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    resizeStartRef.current = null;
    persistViewState({ modalHeight: resizeHeightRef.current ?? modalHeight });
  }, [modalHeight, persistViewState]);

  const resizeWithKeyboard = useCallback((event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const currentHeight = modalRef.current?.getBoundingClientRect().height ?? modalHeight ?? 600;
    const nextHeight = resizeModalTo(currentHeight + (event.key === 'ArrowUp' ? 24 : -24));
    persistViewState({ modalHeight: nextHeight });
  }, [modalHeight, persistViewState, resizeModalTo]);

  const insertCharacter = useCallback((entry: CharacterEntry) => {
    if (editor.isDestroyed) return;
    const maxPos = editor.state.doc.content.size;
    const from = Math.max(0, Math.min(insertionRangeRef.current.from, maxPos));
    const to = Math.max(from, Math.min(insertionRangeRef.current.to, maxPos));
    const inserted = editor.chain()
      .focus()
      .setTextSelection({ from, to })
      .insertContent(entry.value)
      .run();
    if (!inserted) return;
    const cursor = editor.state.selection.from;
    insertionRangeRef.current = { from: cursor, to: cursor };
    setSelected(entry);
    setRecentCharacters(current => {
      const next = [entry.value, ...current.filter(value => value !== entry.value)].slice(0, 16);
      try { localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(next)); } catch { /* storage opcional */ }
      return next;
    });
    requestAnimationFrame(() => searchRef.current?.focus({ preventScroll: true }));
  }, [editor]);

  const activeEntry = filteredEntries.length > 0
    ? filteredEntries[Math.min(activeIndex, filteredEntries.length - 1)]
    : null;

  return createPortal(
    <motion.div
      className="modal-overlay character-map-overlay"
      data-leave-guard="modal"
      style={{ ...modalOverlayStyle, zIndex: 10020, '--ui-scale': uiScale.toString() } as CSSProperties}
      initial={modalOverlayMotion.initial}
      animate={modalOverlayMotion.animate}
      exit={modalOverlayMotion.exit}
      onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <motion.div
        className="modal character-map-modal"
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={isSpanish ? 'Mapa de caracteres' : 'Character map'}
        style={{ width: 'calc(720px * var(--ui-scale, 1))', height: modalHeight ? `${modalHeight}px` : undefined, maxWidth: 'calc(100vw - 24px)', maxHeight: 'min(calc(780px * var(--ui-scale, 1)), calc(100vh - 24px))' }}
        initial={modalCardMotion.initial}
        animate={modalCardMotion.animate}
        exit={modalCardMotion.exit}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="modal-header character-map-header">
          <span className="character-map-title-icon"><Sigma size={19} aria-hidden="true" /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2>{isSpanish ? 'Mapa de caracteres' : 'Character map'}</h2>
            <p>{isSpanish ? 'Símbolos, letras y caracteres especiales para tu nota.' : 'Symbols, letters, and special characters for your note.'}</p>
          </div>
          <button type="button" className="btn-icon" onClick={close} aria-label={isSpanish ? 'Cerrar mapa de caracteres' : 'Close character map'}>
            <X size={16} />
          </button>
        </div>

        <div className="modal-body character-map-body">
          <div className="character-map-search" role="search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={event => { setQuery(event.target.value); setActiveIndex(0); }}
              onKeyDown={event => {
                if (event.key === 'ArrowDown' && filteredEntries.length > 0) {
                  event.preventDefault();
                  setActiveIndex(index => (index + 1) % filteredEntries.length);
                } else if (event.key === 'ArrowUp' && filteredEntries.length > 0) {
                  event.preventDefault();
                  setActiveIndex(index => (index - 1 + filteredEntries.length) % filteredEntries.length);
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  if (activeEntry) insertCharacter(activeEntry);
                }
              }}
              placeholder={isSpanish ? 'Buscar por carácter, nombre o código (U+…)' : 'Search character, name, or code (U+…)'}
              aria-label={isSpanish ? 'Buscar caracteres' : 'Search characters'}
              autoComplete="off"
              spellCheck={false}
            />
            {query && <button type="button" className="character-map-clear-search" onClick={() => { setQuery(''); setActiveIndex(0); }} aria-label={isSpanish ? 'Borrar búsqueda' : 'Clear search'}>×</button>}
          </div>

          <div className="character-map-browser">
            <div className="character-map-categories" role="tablist" aria-label={isSpanish ? 'Categorías de caracteres' : 'Character categories'}>
              {(['all', 'recent', ...CHARACTER_GROUPS.map(group => group.id)] as CharacterFilter[]).map(filter => (
                <button
                  key={filter}
                  type="button"
                  role="tab"
                  aria-selected={category === filter}
                  className={category === filter ? 'is-active' : ''}
                  onClick={() => {
                    if (scrollPersistTimerRef.current !== null) window.clearTimeout(scrollPersistTimerRef.current);
                    persistViewState({
                      category: filter,
                      gridScrollTop: { [category]: query ? gridScrollPositionsRef.current[category] || 0 : gridRef.current?.scrollTop || 0 },
                    });
                    setCategory(filter);
                    setActiveIndex(0);
                  }}
                >
                  {CATEGORY_LABELS[filter][isSpanish ? 'es' : 'en']}
                </button>
              ))}
            </div>

            <div
              ref={gridRef}
              className="character-map-grid"
              role="group"
              aria-label={isSpanish ? 'Caracteres disponibles' : 'Available characters'}
              onScroll={event => {
                if (query) return;
                const scrollTop = event.currentTarget.scrollTop;
                gridScrollPositionsRef.current[category] = scrollTop;
                if (scrollPersistTimerRef.current !== null) window.clearTimeout(scrollPersistTimerRef.current);
                scrollPersistTimerRef.current = window.setTimeout(() => {
                  persistViewState({ gridScrollTop: { [category]: scrollTop } });
                  scrollPersistTimerRef.current = null;
                }, 180);
              }}
            >
            {filteredEntries.map((entry, index) => (
              <button
                key={`${entry.value}-${index}`}
                type="button"
                aria-label={`${entry.value}, ${isSpanish ? entry.es : entry.en}, ${codePointLabel(entry.value)}`}
                aria-current={activeIndex === index ? 'true' : undefined}
                className={`${activeIndex === index ? 'is-current' : ''}${selected?.value === entry.value ? ' is-inserted' : ''}`}
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={event => { if (event.detail !== 2) insertCharacter(entry); }}
                onDoubleClick={close}
              >
                {entry.value}
              </button>
            ))}
            {filteredEntries.length === 0 && (
              <div className="character-map-empty">
                {category === 'recent'
                  ? (isSpanish ? 'Los caracteres que insertes aparecerán aquí.' : 'Characters you insert will appear here.')
                  : (isSpanish ? 'No se encontraron caracteres.' : 'No characters found.')}
              </div>
            )}
          </div>
          </div>

          <div className="character-map-details" aria-live="polite">
            {activeEntry ? (
              <>
                <span className="character-map-preview">{activeEntry.value}</span>
                <span className="character-map-detail-copy">
                  <strong>{isSpanish ? activeEntry.es : activeEntry.en}</strong>
                  <code>{codePointLabel(activeEntry.value)}</code>
                </span>
                <span className="character-map-detail-hint">
                  {isSpanish ? 'Enter para insertar' : 'Enter to insert'}
                </span>
              </>
            ) : (
              <span className="character-map-detail-hint">{isSpanish ? 'Elige un carácter para insertarlo en la nota.' : 'Choose a character to insert it into the note.'}</span>
            )}
          </div>
        </div>

        <div className="modal-actions character-map-actions">
          <button type="button" className="modal-action-btn is-cancel" onClick={close}>
            {isSpanish ? 'Cerrar' : 'Close'}
            <KeyHint>Esc</KeyHint>
          </button>
          <button type="button" className="modal-action-btn is-save" onClick={close}>
            {isSpanish ? 'Listo' : 'Done'}
            <EnterGlyph />
          </button>
        </div>
        <div
          className="character-map-resize-handle"
          role="separator"
          aria-orientation="horizontal"
          aria-label={isSpanish ? 'Cambiar altura del mapa de caracteres' : 'Resize character map height'}
          tabIndex={0}
          onPointerDown={beginResize}
          onPointerMove={moveResize}
          onPointerUp={finishResize}
          onPointerCancel={finishResize}
          onKeyDown={resizeWithKeyboard}
        />
      </motion.div>
    </motion.div>,
    document.body,
  );
}
