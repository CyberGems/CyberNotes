import { useId } from 'react';
import { FileText, PanelLeft, Plus } from 'lucide-react';
import type { Language } from '../languages';

export default function EditorEmptyState({ language, onCreateNote, onShowNotes }: { language: Language; onCreateNote?: () => void; onShowNotes?: () => void }) {
  const isEs = language === 'es';
  const titleId = useId();
  return (
    <section className="editor-empty-state" aria-labelledby={titleId}>
      <div className="editor-empty-content">
        <div className="editor-empty-art" aria-hidden="true">
          <span className="editor-empty-sheet is-back" />
          <span className="editor-empty-sheet is-front"><FileText size={34} strokeWidth={1.25} /></span>
        </div>
        <span className="editor-empty-eyebrow">{isEs ? 'TU ESPACIO DE ESCRITURA' : 'YOUR WRITING SPACE'}</span>
        <h1 id={titleId}>{isEs ? 'Ninguna nota seleccionada' : 'No note selected'}</h1>
        <p>{isEs ? 'Elige una nota de la lista o de tus pestañas para continuar, o comienza con una idea nueva.' : 'Choose a note from the list or your tabs to continue, or start with a new idea.'}</p>
        <div className="editor-empty-actions">
        {onCreateNote && <button type="button" className="btn btn-primary editor-empty-create" onClick={onCreateNote}>
          <Plus size={15} aria-hidden="true" />
          {isEs ? 'Nueva nota' : 'New note'}
          <kbd>Ctrl+N</kbd>
        </button>}
        {onShowNotes && <button type="button" className="btn btn-ghost" onClick={onShowNotes}>
          <PanelLeft size={15} aria-hidden="true" /> {isEs ? 'Ver notas' : 'Browse notes'}
        </button>}
        </div>
      </div>
    </section>
  );
}
