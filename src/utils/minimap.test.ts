// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createMinimapMirror, getMinimapGeometry } from './minimap';

describe('minimap viewport geometry', () => {
  it('shows the actual scaled viewport when a long preview pans', () => {
    const geometry = getMinimapGeometry({ total: 5000, view: 600, top: 2200, contentHeight: 5000, scale: 0.1, height: 300 });
    expect(geometry.indicatorHeight).toBe(60);
    expect(geometry.pan).toBe(100);
    expect(geometry.indicatorTop).toBe(2200 * 0.1 - geometry.pan);
    expect(geometry.indicatorTop + geometry.indicatorHeight).toBeLessThanOrEqual(300);
  });

  it('covers the entire preview when the document fits in the editor', () => {
    const geometry = getMinimapGeometry({ total: 600, view: 600, top: 0, contentHeight: 150, scale: 0.1, height: 300 });
    expect(geometry).toEqual({ maxScroll: 0, indicatorHeight: 15, travel: 0, indicatorTop: 0, pan: 0 });
  });

  it('keeps both ends aligned for a preview shorter than its panel', () => {
    const metrics = { total: 2000, view: 600, contentHeight: 2000, scale: 0.1, height: 300 };
    const start = getMinimapGeometry({ ...metrics, top: -20 });
    const end = getMinimapGeometry({ ...metrics, top: 1800 });
    expect(start.indicatorTop).toBe(0);
    expect(end.indicatorTop + end.indicatorHeight).toBe(200);
    expect(end.pan).toBe(0);
  });
});

describe('incremental rich minimap mirror', () => {
  it('updates edited content while retaining all unaffected blocks', () => {
    const source = document.createElement('div');
    const target = document.createElement('div');
    source.innerHTML = '<p>First <strong>rich</strong> paragraph</p><blockquote><p>Quote</p></blockquote><p>Last</p>';
    const mirror = createMinimapMirror(source, target, vi.fn());
    mirror.flush();
    const [first, quote, last] = Array.from(target.children);
    source.querySelector('strong')!.firstChild!.textContent = 'edited';
    mirror.flush();
    expect(target.firstChild).not.toBe(first);
    expect(target.children[1]).toBe(quote);
    expect(target.children[2]).toBe(last);
    expect(target.innerHTML).toBe(source.innerHTML);
    expect(source.children[1]).not.toBe(quote);
    expect(mirror.flush()).toBe(false);
    mirror.destroy();
  });

  it('retains blocks through insertion, deletion and reordering without stale content', () => {
    const source = document.createElement('div');
    const target = document.createElement('div');
    source.innerHTML = '<p>First</p><p>Second</p><p>Third</p>';
    const mirror = createMinimapMirror(source, target, vi.fn());
    mirror.flush();
    const third = target.children[2];
    source.firstChild!.remove();
    source.prepend(source.lastChild!);
    source.insertAdjacentHTML('beforeend', '<p><em>Inserted</em></p>');
    mirror.flush();
    expect(target.innerHTML).toBe(source.innerHTML);
    expect(target.firstChild).toBe(third);
    source.innerHTML = '<p>Another note</p>';
    mirror.flush();
    expect(target.innerHTML).toBe('<p>Another note</p>');
    mirror.destroy();
  });

  it('observes late node-view changes and stops observing when hidden or unmounted', async () => {
    const source = document.createElement('div');
    const target = document.createElement('div');
    const changed = vi.fn();
    source.innerHTML = '<div class="copyable-block"></div>';
    const mirror = createMinimapMirror(source, target, changed);
    mirror.flush();
    source.firstElementChild!.innerHTML = '<pre><code>Ready after React renders</code></pre>';
    await Promise.resolve();
    expect(changed).toHaveBeenCalledOnce();
    mirror.flush();
    expect(target.querySelector('code')!.textContent).toBe('Ready after React renders');
    mirror.destroy();
    source.firstElementChild!.textContent = 'Hidden update';
    await Promise.resolve();
    expect(changed).toHaveBeenCalledOnce();
  });
});
