export interface MinimapMetrics {
  total: number;
  view: number;
  top: number;
  contentHeight: number;
  scale: number;
  height: number;
}

const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));

export function getMinimapGeometry({ total, view, top, contentHeight, scale, height }: MinimapMetrics) {
  const maxScroll = Math.max(0, total - view);
  const scaledHeight = contentHeight * scale;
  const extent = Math.min(height, Math.max(8, scaledHeight));
  const indicatorHeight = Math.min(extent, Math.max(8, view * scale));
  const travel = Math.max(0, extent - indicatorHeight);
  const ratio = maxScroll > 0 ? clamp(top, maxScroll) / maxScroll : 0;
  return {
    maxScroll, indicatorHeight, travel,
    indicatorTop: ratio * travel,
    pan: ratio * Math.max(0, scaledHeight - height),
  };
}

function copyBlock(source: Node): Node {
  const copy = source.cloneNode(true);
  if (!(copy instanceof Element)) return copy;
  copy.querySelectorAll('iframe').forEach(frame => {
    const placeholder = copy.ownerDocument.createElement('div');
    placeholder.className = 'minimap-media-ph';
    placeholder.textContent = '▶';
    frame.replaceWith(placeholder);
  });
  for (const element of [copy, ...copy.querySelectorAll('.ProseMirror-selectednode,[data-placeholder]')]) {
    element.classList.remove('ProseMirror-selectednode');
    if (element.hasAttribute('data-placeholder')) {
      element.removeAttribute('data-placeholder');
      element.classList.remove('is-editor-empty', 'is-empty');
    }
  }
  return copy;
}

/** Mirror changed top-level blocks, including asynchronous React node-view updates. */
export function createMinimapMirror(source: HTMLElement, target: HTMLElement, onChange: () => void) {
  const copies = new Map<Node, Node>();
  const dirty = new Set<Node>();
  const collect = (records: MutationRecord[]) => {
    let changed = false;
    for (const record of records) {
      if (record.target === source) {
        if (record.type === 'childList') changed = true;
        continue;
      }
      let block = record.target;
      while (block.parentNode && block.parentNode !== source) block = block.parentNode;
      if (block.parentNode === source) {
        dirty.add(block);
        changed = true;
      }
    }
    return changed;
  };
  const observer = new MutationObserver(records => {
    if (collect(records)) onChange();
  });
  observer.observe(source, { subtree: true, childList: true, characterData: true, attributes: true });

  return {
    source, target,
    flush(): boolean {
      collect(observer.takeRecords());
      const blocks = Array.from(source.childNodes);
      const live = new Set<Node>(blocks);
      let changed = false;
      for (const [block, copy] of copies) {
        if (live.has(block)) continue;
        copy.parentNode?.removeChild(copy);
        copies.delete(block);
        changed = true;
      }
      const next = blocks.map(block => {
        const previous = copies.get(block);
        if (previous && !dirty.has(block)) return previous;
        const copy = copyBlock(block);
        if (previous?.parentNode === target) target.replaceChild(copy, previous);
        copies.set(block, copy);
        changed = true;
        return copy;
      });
      dirty.clear();
      // Insertions, deletions and moves retain all unaffected preview nodes.
      let cursor = target.firstChild;
      for (const copy of next) {
        if (copy === cursor) cursor = cursor.nextSibling;
        else {
          target.insertBefore(copy, cursor);
          changed = true;
        }
      }
      while (cursor) {
        const following = cursor.nextSibling;
        target.removeChild(cursor);
        cursor = following;
        changed = true;
      }
      return changed;
    },
    destroy() {
      observer.disconnect();
      copies.clear();
      dirty.clear();
    },
  };
}
