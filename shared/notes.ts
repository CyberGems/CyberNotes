/** Extrae la URL de la primera imagen del content (HTML o JSON TipTap). */
export function extractThumbFromContent(content: string | null | undefined): string {
  if (!content || typeof content !== 'string') return '';

  if (content.trim().startsWith('{')) {
    try {
      const doc = JSON.parse(content);
      let foundSrc = '';
      const walk = (node: any) => {
        if (foundSrc) return;
        if (node?.type === 'image' && node.attrs?.src) {
          foundSrc = String(node.attrs.src);
          return;
        }
        if (Array.isArray(node?.content)) node.content.forEach(walk);
      };
      if (Array.isArray(doc?.content)) doc.content.forEach(walk);
      if (foundSrc) return foundSrc;
    } catch {
      /* fallback HTML */
    }
  }

  const match = content.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return match?.[1] || '';
}
