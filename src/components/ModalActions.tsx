import { useEffect, type CSSProperties, type ReactNode } from 'react';
import { CornerDownLeft } from 'lucide-react';

export const modalOverlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.12, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] as const } },
};

export const modalCardMotion = {
  initial: { opacity: 0, scale: 0.97, y: 8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.14, ease: [0.22, 1, 0.36, 1] as const } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.1, ease: [0.4, 0, 1, 1] as const } },
};

export const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'var(--overlay-bg, rgba(5, 5, 8, 0.72))',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** Hint de tecla estilo suite (CyberClock): chip kbd con texto o glifo. */
export function KeyHint({ children }: { children: ReactNode }) {
  return <kbd className="modal-key">{children}</kbd>;
}

/** Suite-wide Enter glyph: the lucide return arrow, matching CyberFiles' DialogButton. */
export function EnterGlyph() {
  return (
    <KeyHint>
      <CornerDownLeft className="modal-key-glyph" strokeWidth={2.5} aria-hidden="true" />
    </KeyHint>
  );
}

export function useModalKeys(opts: {
  enabled: boolean;
  onEsc?: () => void;
  onEnter?: () => void;
}) {
  const { enabled, onEsc, onEnter } = opts;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onEsc?.();
        return;
      }
      if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
      if ((e.target as HTMLElement | null)?.tagName === 'BUTTON') return;
      if ((e.target as HTMLElement | null)?.tagName === 'TEXTAREA') return;
      e.preventDefault();
      onEnter?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onEsc, onEnter]);
}
