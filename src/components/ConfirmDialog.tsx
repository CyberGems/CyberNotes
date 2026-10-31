import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Info, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Language } from '../languages';
import {
  KeyHint,
  EnterGlyph,
  modalCardMotion,
  modalOverlayMotion,
  modalOverlayStyle,
  useModalKeys,
} from './ModalActions';

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

function dialogAccent(variant: DialogVariant) {
  return `color-mix(in srgb, ${ACCENTS[variant]} var(--status-color-share, 100%), var(--text-primary))`;
}

function VariantIcon({ variant }: { variant: DialogVariant }) {
  const color = dialogAccent(variant);
  const common = { size: 22, color, style: { filter: `drop-shadow(0 0 6px color-mix(in srgb, ${color} 60%, transparent))` } };
  if (variant === 'warning') return <AlertTriangle {...common} />;
  if (variant === 'success') return <CheckCircle2 {...common} />;
  return <Info {...common} />;
}

export default function ConfirmDialog({
  language, message, title, confirm = false, variant = 'info',
  confirmLabel, cancelLabel, onResolve,
}: Props) {
  const accent = dialogAccent(variant);
  const okText = confirmLabel ?? (confirm
    ? (language === 'es' ? 'Continuar' : 'Continue')
    : (language === 'es' ? 'Aceptar' : 'OK'));
  const cancelText = cancelLabel ?? (language === 'es' ? 'Cancelar' : 'Cancel');

  useModalKeys({
    enabled: true,
    onEsc: () => onResolve(false),
    onEnter: () => onResolve(true),
  });

  return createPortal(
    <motion.div
      {...modalOverlayMotion}
      style={{ ...modalOverlayStyle, zIndex: 100001 }}
      onClick={() => onResolve(false)}
    >
      <motion.div
        {...modalCardMotion}
        className="glass-effect confirm-dialog-card"
        style={{
          width: 'calc(400px * var(--ui-scale))',
          maxWidth: 'calc(100vw - 24px)',
          maxHeight: 'calc(100dvh - 24px)',
          overflowY: 'auto',
          overflowWrap: 'anywhere',
          background: 'rgba(var(--dialog-rgb, 15, 15, 22), 0.95)',
          border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
          borderRadius: 'var(--radius-lg)',
          padding: '24px 28px',
          boxShadow: `var(--shadow-elevated, 0 20px 50px rgba(0,0,0,0.6), 0 0 30px color-mix(in srgb, ${accent} 5%, transparent))`,
          display: 'flex', flexDirection: 'column', gap: 20,
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12, flexShrink: 0,
            background: `color-mix(in srgb, ${accent} 10%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
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

        <div className="modal-actions">
          {confirm && (
            <button
              type="button"
              className="modal-action-btn is-cancel"
              onClick={() => onResolve(false)}
            >
              {cancelText}
              <KeyHint>Esc</KeyHint>
            </button>
          )}
          <button
            type="button"
            className={`modal-action-btn ${confirm && variant === 'warning' ? 'is-danger' : 'is-save'}`}
            autoFocus
            onClick={() => onResolve(true)}
          >
            {okText}
            <EnterGlyph />
          </button>
        </div>
      </motion.div>
    </motion.div>,
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
