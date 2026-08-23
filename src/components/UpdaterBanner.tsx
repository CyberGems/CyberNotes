import { useEffect, useState, useRef, useCallback } from 'react';
import { Download, Rocket, X, RefreshCw } from 'lucide-react';
import { Language, TRANSLATIONS } from '../languages';

type Status =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'installing'; version: string }
  | { state: 'error'; message: string };

const AUTO_RESTART_SEC = 8;

export default function UpdaterBanner({ language }: { language: Language }) {
  const t = TRANSLATIONS[language].updater;
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [countdown, setCountdown] = useState(AUTO_RESTART_SEC);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  useEffect(() => {
    const off = window.cyberNotesAPI.onUpdateStatus((s: any) => {
      const next = s as Status;
      if (next.state === 'downloading' || next.state === 'downloaded' || next.state === 'installing' || next.state === 'available' || next.state === 'error') {
        setDismissed(false);
      }
      if (next.state === 'not-available' as any) {
        setStatus({ state: 'idle' });
        clearTimers();
        return;
      }
      setStatus(next);
      if (next.state !== 'downloaded') {
        clearTimers();
      }
    });
    return () => { off(); clearTimers(); };
  }, [clearTimers]);

  useEffect(() => {
    if (status.state !== 'downloaded' || dismissed) {
      clearTimers();
      return;
    }
    setCountdown(AUTO_RESTART_SEC);
    intervalRef.current = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    timerRef.current = setTimeout(() => {
      window.cyberNotesAPI.installUpdate();
    }, AUTO_RESTART_SEC * 1000);
    return clearTimers;
  }, [status, dismissed, clearTimers]);

  const handleLater = useCallback(() => {
    clearTimers();
    setDismissed(true);
    window.cyberNotesAPI.cancelAutoInstall?.();
  }, [clearTimers]);

  const handleNow = useCallback(() => {
    clearTimers();
    window.cyberNotesAPI.installUpdate();
  }, [clearTimers]);

  const handleDismissError = useCallback(() => {
    setStatus({ state: 'idle' });
    setDismissed(true);
  }, []);

  if (dismissed) return null;

  if (status.state === 'downloading') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          minWidth: 360,
          maxWidth: 'min(92vw, 480px)',
          padding: '10px 14px',
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--bg-modal) 94%, var(--accent) 6%)',
          border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))',
          boxShadow: '0 12px 32px rgba(0,0,0,0.45), 0 0 20px var(--accent-glow)',
          backdropFilter: 'blur(12px)',
          pointerEvents: 'auto',
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--accent-dim)', border: '1px solid var(--accent)', flexShrink: 0,
        }}>
          <Download size={14} className="spin" style={{ color: 'var(--accent-light)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {t.downloading.replace('{percent}', String(status.percent))}
          </div>
          <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.max(2, status.percent)}%`,
              background: 'var(--accent)',
              borderRadius: 2,
              transition: 'width 0.4s ease',
              boxShadow: '0 0 8px var(--accent-glow)',
            }} />
          </div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-light)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
          {status.percent}%
        </span>
      </div>
    );
  }

  if (status.state === 'downloaded') {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'fixed',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minWidth: 380,
          maxWidth: 'min(92vw, 520px)',
          padding: '10px 12px 10px 14px',
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--bg-modal) 94%, var(--success) 6%)',
          border: '1px solid color-mix(in srgb, var(--success) 35%, var(--border))',
          boxShadow: '0 12px 32px rgba(0,0,0,0.45), 0 0 20px rgba(34,197,94,0.18)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <div style={{
          width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.35)', flexShrink: 0,
        }}>
          <Rocket size={14} style={{ color: 'var(--success)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
            {t.downloaded.replace('{version}', status.version)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
            {t.restartingIn.replace('{sec}', String(countdown))}
          </div>
          <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${((AUTO_RESTART_SEC - countdown) / AUTO_RESTART_SEC) * 100}%`,
              background: 'var(--success)',
              transition: 'width 1s linear',
            }} />
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={handleNow} style={{ padding: '7px 12px', fontSize: 12, flexShrink: 0 }}>
          {t.restartNow}
        </button>
        <button type="button" className="btn btn-ghost" onClick={handleLater} style={{ padding: '7px 10px', fontSize: 12, flexShrink: 0 }}>
          {t.later}
        </button>
      </div>
    );
  }

  if (status.state === 'installing') {
    return (
      <div
        role="status"
        style={{
          position: 'fixed',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 16px',
          borderRadius: 12,
          background: 'var(--bg-modal)',
          border: '1px solid var(--accent)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
        }}
      >
        <RefreshCw size={14} className="spin" style={{ color: 'var(--accent)' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{t.installing}</span>
      </div>
    );
  }

  if (status.state === 'error') {
    return (
      <div
        role="status"
        style={{
          position: 'fixed',
          bottom: 14,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px 10px 14px',
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--bg-modal) 94%, var(--danger) 6%)',
          border: '1px solid color-mix(in srgb, var(--danger) 35%, var(--border))',
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
          maxWidth: 'min(92vw, 520px)',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)', flex: 1 }}>{t.error}: {status.message}</span>
        <button type="button" className="btn-icon" onClick={handleDismissError} aria-label="Cerrar"><X size={14} /></button>
      </div>
    );
  }

  return null;
}
