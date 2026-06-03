import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Language } from '../languages';

export type DialogVariant = 'info' | 'warning' | 'success';

export interface DialogOptions {
  message: string;
  title?: string;
  /** Si es true, muestra botón de cancelar (modo confirmación). */
  confirm?: boolean;
  variant?: DialogVariant;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface Props extends DialogOptions {
  language: Language;
  onResolve: (accepted: boolean) => void;
}

const ACCENTS: Record<DialogVariant, string> = {
  info: 'var(--accent)',
  warning: '#ea580c',
  success: '#10b981',
};

function VariantIcon({ variant }: { variant: DialogVariant }) {
  const color = ACCENTS[variant];
  const common = { size: 22, color, style: { filter: `drop-shadow(0 0 6px ${color}99)` } };
  if (variant === 'warning') return <AlertTriangle {...common} />;
  if (variant === 'success') return <CheckCircle2 {...common} />;
  return <Info {...common} />;
}

export default function ConfirmDialog({
  language, message, title, confirm = false, variant = 'info',
  confirmLabel, cancelLabel, onResolve,
}: Props) {
  const accent = ACCENTS[variant];
  const okText = confirmLabel ?? (confirm
    ? (language === 'es' ? 'Continuar' : 'Continue')
    : (language === 'es' ? 'Aceptar' : 'OK'));
  const cancelText = cancelLabel ?? (language === 'es' ? 'Cancelar' : 'Cancel');

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(5, 5, 8, 0.8)',
        backdropFilter: 'blur(16px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100001, animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={() => onResolve(false)}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', damping: 26, stiffness: 330 }}
        className="glass-effect"
        style={{
          width: 'calc(400px * var(--ui-scale))',
          background: 'rgba(15, 15, 22, 0.95)',
          border: `1px solid ${accent}4d`,
          borderRadius: 'var(--radius-lg)',
          padding: '24px 28px',
          boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 30px ${accent}0d`,
          display: 'flex', flexDirection: 'column', gap: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: `${accent}1a`, border: `1px solid ${accent}4d`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <VariantIcon variant={variant} />
          </div>
          <div style={{ minWidth: 0, flex: 1, paddingTop: 2 }}>
            {title && (
              <h3 style={{
                fontSize: 'calc(16px * var(--ui-scale))', fontWeight: 700,
                color: 'var(--text-primary)', margin: '0 0 6px 0', letterSpacing: '-0.01em',
              }}>
                {title}
              </h3>
            )}
            <p style={{
              fontSize: 'calc(13px * var(--ui-scale))', color: 'var(--text-secondary)',
              margin: 0, lineHeight: 1.5,
            }}>
              {message}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          {confirm && (
            <button
              className="btn btn-ghost"
              onClick={() => onResolve(false)}
              style={{ padding: '8px 16px', fontWeight: 600 }}
              autoFocus
            >
              {cancelText}
            </button>
          )}
          <button
            className={confirm && variant === 'warning' ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={() => onResolve(true)}
            style={{ padding: '8px 18px', fontWeight: 600 }}
            autoFocus={!confirm}
          >
            {okText}
          </button>
        </div>
      </motion.div>
    </div>,
    document.body
  );
}

/** Wrapper que monta/desmonta el diálogo con animación de salida. */
export function DialogHost({
  language, options, onResolve,
}: { language: Language; options: DialogOptions | null; onResolve: (accepted: boolean) => void }) {
  return (
    <AnimatePresence>
      {options && (
        <ConfirmDialog key="dialog" language={language} {...options} onResolve={onResolve} />
      )}
    </AnimatePresence>
  );
}
