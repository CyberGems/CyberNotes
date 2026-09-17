import { Note } from '../types';
import { extractThumbFromContent } from '../../shared/notes';

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
    deleted_at: note.deleted_at ?? null,
  };
}

/** Extrae la URL de la primera imagen del HTML/JSON TipTap (al guardar). */
export function extractThumb(content: string | null | undefined): string {
  return extractThumbFromContent(content);
}

export function extractPreview(html: string): string {
  if (!html) return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').slice(0, 200).replace(/\s+/g, ' ');
}
