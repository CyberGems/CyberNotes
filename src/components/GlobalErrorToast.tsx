import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { Language } from '../languages';

interface GlobalErrorToastProps {
  language: Language;
}

const STRINGS = {
  es: {
    message: 'Ocurrió un error inesperado. Los detalles se guardaron en el registro.',
    dismiss: 'Descartar',
  },
  en: {
    message: 'An unexpected error occurred. Details were saved to the log.',
    dismiss: 'Dismiss',
  },
} as const;

function describeError(event: ErrorEvent | PromiseRejectionEvent): string {
  try {
    if (event instanceof ErrorEvent) {
      return `${event.message} @ ${event.filename}:${event.lineno}:${event.colno}`;
    }
    const reason = (event as PromiseRejectionEvent).reason;
    return reason instanceof Error ? (reason.stack || reason.message) : String(reason);
  } catch {
    return 'unknown error';
  }
}

/**
 * Toast global de errores no capturados: avisa al usuario y envia
 * el detalle al log del main process (userData/logs).
 */
export default function GlobalErrorToast({ language }: GlobalErrorToastProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = (detail: string) => {
      setVisible(true);
      try {
        window.cyberNotesAPI?.reportRendererError?.(detail)?.catch?.(() => {});
      } catch {
        /* el toast no debe fallar */
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVisible(false), 6000);
    };
    const onError = (e: ErrorEvent) => show(describeError(e));
    const onRejection = (e: PromiseRejectionEvent) => show(describeError(e));
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;
  const t = STRINGS[language];

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 20000,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        maxWidth: 'min(480px, calc(100vw - 32px))',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'var(--bg-modal)',
        border: '1px solid var(--danger)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        fontSize: 13,
        color: 'var(--text-primary)',
      }}
    >
      <AlertTriangle size={16} color="var(--danger)" style={{ flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{t.message}</span>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label={t.dismiss}
        title={t.dismiss}
        className="btn-icon"
        style={{ flexShrink: 0 }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
