import { useState, useEffect } from 'react';
import { Pin, X, ExternalLink, Check } from 'lucide-react';
import { Language } from '../languages';

interface Props {
  language: Language;
  onClose: () => void;
  isAutomatic?: boolean;
}

const TRAY_PIN_DISMISSED_KEY = 'cybernotes_tray_pin_reminder_dismissed';

export function isTrayPinReminderDismissed(): boolean {
  try {
    return localStorage.getItem(TRAY_PIN_DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function dismissTrayPinReminder(): void {
  try {
    localStorage.setItem(TRAY_PIN_DISMISSED_KEY, 'true');
  } catch {
    // localStorage may be unavailable
  }
}

export default function TrayPinModal({ language, onClose, isAutomatic = false }: Props) {
  const isEs = language === 'es';
  const [dontShowAgain, setDontShowAgain] = useState(isAutomatic);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dontShowAgain, isAutomatic]);

  const handleClose = () => {
    if (dontShowAgain) {
      dismissTrayPinReminder();
    }
    onClose();
  };

  const handleOpenSettings = async () => {
    if (dontShowAgain) {
      dismissTrayPinReminder();
    }
    setErrorMsg(null);
    try {
      const res = await window.cyberNotesAPI.openTaskbarSettings();
      if (res && res.success === false) {
        setErrorMsg(isEs ? 'No se pudo abrir la configuración de iconos de Windows.' : 'Could not open Windows tray icon settings.');
        return;
      }
      onClose();
    } catch (e) {
      console.error('Failed to open taskbar settings:', e);
      setErrorMsg(isEs ? 'No se pudo abrir la configuración de iconos de Windows.' : 'Could not open Windows tray icon settings.');
    }
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal tray-pin-modal"
        role="dialog"
        aria-modal="true"
        aria-label={isEs ? 'Mantener visible en la bandeja del sistema' : 'Keep visible in the system tray'}
        onClick={e => e.stopPropagation()}
        style={{
          width: 470,
          maxWidth: '92vw',
          background: 'var(--bg-modal)',
          border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))',
          borderRadius: 'var(--radius-lg, 12px)',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.55)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--bg-app) 75%, var(--bg-modal))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'var(--text-primary)', fontWeight: 700, fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            <Pin size={16} style={{ color: 'var(--accent)' }} />
            <span>{isEs ? 'Mantener visible en la bandeja del sistema' : 'Keep visible in the system tray'}</span>
          </div>
          <button
            type="button"
            className="settings-header-close"
            onClick={handleClose}
            aria-label={isEs ? 'Cerrar' : 'Close'}
            title={isEs ? 'Cerrar' : 'Close'}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 22px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Hero description */}
          <div
            style={{
              display: 'flex',
              gap: 14,
              padding: '14px 16px',
              borderRadius: 'var(--radius-md, 8px)',
              background: 'color-mix(in srgb, var(--accent) 8%, var(--bg-surface))',
              border: '1px solid color-mix(in srgb, var(--accent) 22%, var(--border))',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '8px',
                background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                color: 'var(--accent)',
              }}
            >
              <Pin size={20} />
            </div>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-primary)' }}>
              {isEs
                ? 'Windows puede colocar los iconos nuevos detrás del menú desplegable de la barra de tareas. Usa la Configuración de Windows para que CyberNotes permanezca siempre visible junto al reloj.'
                : 'Windows may place new tray icons behind the overflow menu. Use Windows Settings to choose whether CyberNotes stays visible next to the clock.'}
            </p>
          </div>

          {/* Steps */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'var(--bg-app)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                1
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
                {isEs ? 'Abre la Configuración de Windows.' : 'Open Windows Settings.'}
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  color: 'var(--bg-app)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 800,
                  flexShrink: 0,
                }}
              >
                2
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--text-primary)' }}>
                {isEs
                  ? 'Busca CyberNotes en los iconos del área de notificación y actívalo.'
                  : 'Find CyberNotes under the notification area icons and enable it.'}
              </span>
            </div>
          </div>

          {/* Don't show again checkbox */}
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              cursor: 'pointer',
              userSelect: 'none',
              marginTop: 4,
            }}
          >
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={e => setDontShowAgain(e.target.checked)}
              style={{ display: 'none' }}
            />
            <div
              style={{
                width: 17,
                height: 17,
                borderRadius: 4,
                border: `1.5px solid ${dontShowAgain ? 'var(--accent)' : 'var(--border)'}`,
                background: dontShowAgain ? 'var(--accent)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
            >
              {dontShowAgain && <Check size={12} style={{ color: 'var(--bg-app)', strokeWidth: 3 }} />}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {isEs ? 'No volver a mostrar este recordatorio' : "Don't show this reminder again"}
            </span>
          </label>

          {errorMsg && (
            <div
              style={{
                fontSize: 11.5,
                color: '#ef4444',
                padding: '8px 12px',
                borderRadius: '6px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
              }}
            >
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 20px',
            borderTop: '1px solid var(--border)',
            background: 'color-mix(in srgb, var(--bg-app) 55%, var(--bg-modal))',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleClose}
            style={{ padding: '7px 16px', fontSize: 12 }}
          >
            {isEs ? 'Listo' : 'Got it'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenSettings}
            style={{ padding: '7px 16px', fontSize: 12, gap: 7 }}
          >
            <span>{isEs ? 'Abrir configuración de Windows' : 'Open Windows Settings'}</span>
            <ExternalLink size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
