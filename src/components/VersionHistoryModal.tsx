import { useEffect, useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import type { Language } from '../languages';
import type { Note, NoteRevision, NoteRevisionMeta } from '../types';
import { useModalKeys } from './ModalActions';
import Tooltip from './Tooltip';

interface Props {
  note: Note;
  language: Language;
  onClose: () => void;
  onRestore: (revision: NoteRevision) => void;
}

function excerptOf(html: string, max = 1500): string {
  try {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return ((tmp.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, max);
  } catch {
    return '';
  }
}

function formatWhen(iso: string, language: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const locale = language === 'es' ? 'es-ES' : 'en-US';
  return d.toLocaleString(locale, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Historial de versiones de una nota (fase 1): lista de snapshots locales
 * con vista previa de texto y restauración. Restaurar deja a salvo la
 * versión actual antes de sobrescribir.
 */
export default function VersionHistoryModal({ note, language, onClose, onRestore }: Props) {
  const [items, setItems] = useState<NoteRevisionMeta[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preview, setPreview] = useState<NoteRevision | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useModalKeys({ enabled: true, onEsc: onClose });

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setFailed(false);
    setSelectedId(null);
    setPreview(null);
    window.cyberNotesAPI
      ?.listRevisions(note.id)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok && Array.isArray(res.revisions)) setItems(res.revisions);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [note.id]);

  const selectRevision = (id: number) => {
    setSelectedId(id);
    setPreview(null);
    setPreviewLoading(true);
    window.cyberNotesAPI
      ?.getRevision(id)
      .then((res) => {
        if (res?.ok && res.revision) setPreview(res.revision);
      })
      .catch(() => {})
      .finally(() => setPreviewLoading(false));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={language === 'es' ? 'Historial de versiones' : 'Version history'}
        style={{ width: 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <History size={15} style={{ color: 'var(--accent)' }} />
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
              {language === 'es' ? 'Historial de versiones' : 'Version history'}
            </h2>
          </div>
          <Tooltip label={language === 'es' ? 'Cerrar' : 'Close'} placement="bottom">
            <button type="button" className="settings-header-close" onClick={onClose} aria-label={language === 'es' ? 'Cerrar' : 'Close'}>
              <X size={15} />
            </button>
          </Tooltip>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {items === null && !failed && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '18px 0' }}>
              {language === 'es' ? 'Cargando versiones…' : 'Loading versions…'}
            </p>
          )}
          {failed && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)', textAlign: 'center', padding: '18px 0' }}>
              {language === 'es' ? 'No se pudo leer el historial.' : 'Could not read history.'}
            </p>
          )}
          {items !== null && !failed && items.length === 0 && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: '18px 0', lineHeight: 1.5 }}>
              {language === 'es'
                ? 'Aún no hay versiones. Se guardan solas al editar la nota (máximo una cada 5 minutos, hasta 50).'
                : 'No versions yet. They save automatically while editing (at most one every 5 minutes, up to 50).'}
            </p>
          )}
          {items !== null && !failed && items.length > 0 && (
            <div style={{ display: 'flex', gap: 10, minHeight: 0 }}>
              <div style={{ width: 210, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 320 }}>
                {items.map((item) => {
                  const isCurrent = selectedId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectRevision(item.id)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                        padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                        border: isCurrent ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: isCurrent ? 'var(--accent-dim)' : 'var(--bg-surface)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700 }}>
                        {formatWhen(item.created_at, language)}
                      </span>
                      <span style={{
                        fontSize: 11, color: 'var(--text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%',
                      }}>
                        {(item.title || (language === 'es' ? 'Sin título' : 'Untitled'))}
                        {' · '}
                        {item.words === 1
                          ? (language === 'es' ? '1 palabra' : '1 word')
                          : (language === 'es' ? `${item.words} palabras` : `${item.words} words`)}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div style={{
                flex: 1, minWidth: 0, border: '1px solid var(--border)', borderRadius: 8,
                background: 'rgba(0, 0, 0, 0.25)', padding: '10px 12px',
                display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: 320,
              }}>
                {previewLoading && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                    {language === 'es' ? 'Cargando vista previa…' : 'Loading preview…'}
                  </p>
                )}
                {!previewLoading && !preview && (
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
                    {language === 'es' ? 'Elige una versión para verla.' : 'Pick a version to preview it.'}
                  </p>
                )}
                {!previewLoading && preview && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                      {preview.title || (language === 'es' ? 'Sin título' : 'Untitled')}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {formatWhen(preview.created_at, language)}
                    </div>
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {excerptOf(preview.content) || (language === 'es' ? '(vacía)' : '(empty)')}
                    </p>
                    <div>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => onRestore(preview)}
                        style={{ gap: 6, fontSize: 12 }}
                      >
                        <RotateCcw size={13} />
                        {language === 'es' ? 'Restaurar esta versión' : 'Restore this version'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
