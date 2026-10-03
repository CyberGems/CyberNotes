import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
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

  const t = STRINGS[language];

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role="alert"
          initial={{ opacity: 0, y: 10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          style={{
            position: 'fixed',
            bottom: 20,
            left: 16,
            right: 16,
            margin: '0 auto',
            zIndex: 20000,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: 'max-content',
            maxWidth: 'min(500px, calc(100vw - 32px))',
            padding: '10px 10px 10px 12px',
            borderRadius: 12,
            background: 'linear-gradient(145deg, var(--bg-modal), var(--bg-surface))',
            border: '1px solid color-mix(in srgb, var(--danger) 38%, var(--border))',
            boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            fontSize: 13,
            color: 'var(--text-primary)',
            backdropFilter: 'blur(14px)',
          }}
          className="glass-effect"
        >
          <span
            aria-hidden
            style={{
              width: 26,
              height: 26,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
              borderRadius: 8,
              color: 'var(--danger)',
              background: 'color-mix(in srgb, var(--danger) 14%, transparent)',
            }}
          >
            <AlertTriangle size={15} />
          </span>
          <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>{t.message}</span>
          <button
            type="button"
            onClick={() => setVisible(false)}
            aria-label={t.dismiss}
            className="btn-icon"
            style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, color: 'var(--text-muted)' }}
          >
            <X size={14} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
