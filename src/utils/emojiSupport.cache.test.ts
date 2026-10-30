// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('./glyphSupport', () => ({
  createGlyphSupportDetector: vi.fn(),
  filterSupportedGlyphs: vi.fn().mockResolvedValue(new Set(['😀', '👩‍💻'])),
}));
import { filterSupportedGlyphs } from './glyphSupport';

let glyphRevision = 1;
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(), fillText: vi.fn(), measureText: () => ({ width: 40 }),
    getImageData: () => ({ data: new Uint8ClampedArray([glyphRevision, 0, 0, 255]) }),
  } as unknown as CanvasRenderingContext2D);
  glyphRevision = 1;
});
afterEach(() => vi.restoreAllMocks());
const values = ['😀', '👩‍💻', '🫠'];
const load = async () => {
  vi.resetModules();
  return (await import('./emojiSupport')).filterSupportedEmojis;
};

it('reuses verified results across module reloads without scanning the catalog', async () => {
  const first = await load();
  expect(await first(values)).toEqual(new Set(['😀', '👩‍💻']));
  const afterRestart = await load();
  expect(await afterRestart(values)).toEqual(new Set(['😀', '👩‍💻']));
  expect(filterSupportedGlyphs).toHaveBeenCalledTimes(1);
});

it('checks again when native font rendering, the catalog or browser engine changes', async () => {
  const filter = await load();
  await filter(values);
  glyphRevision++;
  await filter(values);
  expect(filterSupportedGlyphs).toHaveBeenCalledTimes(2);
  await filter([...values, '❤️']);
  expect(filterSupportedGlyphs).toHaveBeenCalledTimes(3);
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Different Chromium build');
  await filter([...values, '❤️']);
  expect(filterSupportedGlyphs).toHaveBeenCalledTimes(4);
});

it('rechecks malformed or invalid cached values instead of offering unchecked emojis', async () => {
  const filter = await load();
  await filter(values);
  const cached = JSON.parse(localStorage.getItem('cybernotes-emoji-support-v1')!);
  localStorage.setItem('cybernotes-emoji-support-v1', '{broken');
  await filter(values);
  localStorage.setItem('cybernotes-emoji-support-v1', JSON.stringify({ ...cached, supported: ['not-in-catalog'] }));
  await filter(values);
  expect(filterSupportedGlyphs).toHaveBeenCalledTimes(3);
});

it('still checks compatibility when persistent storage is blocked', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
  expect(await (await load())(values)).toEqual(new Set(['😀', '👩‍💻']));
  expect(filterSupportedGlyphs).toHaveBeenCalledTimes(1);
});
