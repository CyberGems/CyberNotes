import { useEffect, type CSSProperties } from 'react';

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
  background: 'rgba(5, 5, 8, 0.72)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

export function EnterGlyph() {
  return (
    <svg className="modal-key-enter" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M2 10.5 L7 5.2 L4.8 9 L14.6 9 L14.6 2.5 L17.4 2.5 L17.4 9 A2.8 2.8 0 0 1 14.6 11.8 L4.8 11.8 L7 15.8 Z" fill="currentColor" stroke="none" />
    </svg>
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
