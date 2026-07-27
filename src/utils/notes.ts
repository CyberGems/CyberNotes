import { Note } from '../types';

/** Copia meta para listas: sin content HTML (ahorra memoria y re-renders pesados). */
export function toNoteMeta(note: Note): Note {
  return {
    id: note.id,
    folder_id: note.folder_id,
    title: note.title,
    content: '',
    preview: note.preview || '',
    thumb: note.thumb || '',
    pinned: note.pinned,
    created_at: note.created_at,
    updated_at: note.updated_at,
  };
}

/** Extrae la URL de la primera imagen del HTML/JSON TipTap (al guardar). */
export function extractThumb(content: string | null | undefined): string {
  if (!content || typeof content !== 'string') return '';

  if (content.trim().startsWith('{')) {
    try {
      const doc = JSON.parse(content);
      let foundSrc = '';
      const walk = (node: any) => {
        if (foundSrc) return;
        if (node.type === 'image' && node.attrs?.src) {
          foundSrc = node.attrs.src;
          return;
        }
        if (Array.isArray(node.content)) node.content.forEach(walk);
      };
      if (Array.isArray(doc.content)) doc.content.forEach(walk);
      if (foundSrc) return foundSrc;
    } catch {
      /* fallback HTML */
    }
  }

  const match = content.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return match?.[1] || '';
}

export function extractPreview(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').slice(0, 200).replace(/\s+/g, ' ');
}
