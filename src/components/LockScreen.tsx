import { useState, useRef, useEffect, type CSSProperties, type FormEvent } from 'react';
import { Lock, Eye, EyeOff, Minus, Square, X, CaseSensitive } from 'lucide-react';
import { Language, TRANSLATIONS } from '../languages';
import { useInputContextMenu } from '../hooks/useInputContextMenu';
import Tooltip from './Tooltip';
import WelcomeGreeting from './WelcomeGreeting';

interface Props {
  language: Language;
  onUnlock: () => void;
  bgImage?: string | null;
  glassBlur?: number;
  bgOpacity?: number;
}

export default function LockScreen({
  language,
  onUnlock,
  bgImage = null,
  glassBlur = 0,
  bgOpacity = 0.5,
}: Props) {
  const t = TRANSLATIONS[language];
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [hasPassword, setHasPassword] = useState(true);
  const [capsOn, setCapsOn] = useState(false);
  const [appVersion, setAppVersion] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputMenu = useInputContextMenu(language);

  useEffect(() => {
    window.cyberNotesAPI.hasPassword().then(setHasPassword);
    window.cyberNotesAPI.getVersions().then(v => setAppVersion(v?.app || '')).catch(() => {});
    window.cyberNotesAPI.isMaximized?.().then(setIsMaximized).catch(() => {});
    const unsub = window.cyberNotesAPI.onMaximizedState?.((max) => setIsMaximized(max));
    return () => { unsub?.(); };
  }, []);

  useEffect(() => {
    const syncCaps = async () => {
      try {
        if (window.cyberNotesAPI?.checkCapsLock) {
          setCapsOn(await window.cyberNotesAPI.checkCapsLock());
        }
      } catch { /* ignore */ }
    };
    void syncCaps();

    const fromEvent = (e: KeyboardEvent) => {
      if (e.getModifierState) setCapsOn(e.getModifierState('CapsLock'));
    };
    window.addEventListener('keydown', fromEvent, true);
    window.addEventListener('keyup', fromEvent, true);
    window.addEventListener('focus', syncCaps);
    return () => {
      window.removeEventListener('keydown', fromEvent, true);
      window.removeEventListener('keyup', fromEvent, true);
      window.removeEventListener('focus', syncCaps);
    };
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (hasPassword && !password.trim()) return;

    setLoading(true);
    setError('');

    try {
      const ok = await window.cyberNotesAPI.verifyPassword(password);
      if (ok) {
        onUnlock();
      } else {
        setError(t.lockScreen.incorrectPassword);
        setShaking(true);
        setPassword('');
        setTimeout(() => {
          setShaking(false);
          inputRef.current?.focus();
        }, 400);
      }
    } catch {
      setError(t.lockScreen.verifyError);
    } finally {
      setLoading(false);
    }
  };

  const hasBg = !!bgImage;

  const titleBarStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 'var(--titlebar-height, 40px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: '0 10px',
    zIndex: 10,
    userSelect: 'none',
    WebkitAppRegion: 'drag',
  } as CSSProperties;

  const noDragStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    WebkitAppRegion: 'no-drag',
  } as CSSProperties;
  return (
    <div
      className={`lock-screen-root ${hasBg ? 'has-bg' : ''}`}
      style={{
        height: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 42%), radial-gradient(circle at 15% 18%, color-mix(in srgb, var(--accent-light) 7%, transparent) 0%, transparent 28%), var(--bg-app)',
        position: 'relative',
        overflow: 'hidden',
        ['--glass-blur' as string]: `${glassBlur}px`,
        ['--bg-overlay-opacity' as string]: String(bgOpacity),
      }}
    >
      <style>{`
        @keyframes lockOrbit {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes lockOrbitReverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes lockLogoPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 12px var(--accent-glow)); }
          50% { transform: scale(1.035); filter: drop-shadow(0 0 22px var(--accent-glow)); }
        }
        @keyframes lockCardIn {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .lock-screen-card {
          animation: lockCardIn 0.38s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .lock-screen-orbit {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          pointer-events: none;
        }
        .lock-screen-orbit-primary {
          border: 2px solid color-mix(in srgb, var(--accent) 18%, transparent);
          border-top-color: var(--accent);
          border-right-color: color-mix(in srgb, var(--accent) 58%, transparent);
          box-shadow: 0 0 16px color-mix(in srgb, var(--accent-glow) 75%, transparent);
          animation: lockOrbit 2.2s linear infinite;
        }
        .lock-screen-orbit-secondary {
          inset: 6px;
          border: 1px dashed color-mix(in srgb, var(--accent-light) 36%, transparent);
          animation: lockOrbitReverse 7s linear infinite;
        }
        .lock-screen-icon {
          animation: lockLogoPulse 2.8s ease-in-out infinite;
        }
        .lock-screen-submit {
          background: linear-gradient(135deg, var(--accent), var(--accent-light));
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-light) 35%, transparent), 0 0 18px var(--accent-glow);
        }
        .lock-screen-submit:hover {
          background: linear-gradient(135deg, var(--accent-light), var(--accent));
          box-shadow: 0 0 0 1px var(--accent-light), 0 0 26px var(--accent-glow);
          transform: translateY(-1px);
        }
        .lock-screen-submit:active {
          transform: translateY(0);
        }
        .lock-screen-submit:disabled {
          opacity: 0.68;
          box-shadow: none;
          transform: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .lock-screen-card,
          .lock-screen-orbit,
          .lock-screen-icon {
            animation: none;
          }
        }
      `}</style>
      {hasBg && (
        <img
          src={bgImage!}
          alt=""
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', display: 'block', pointerEvents: 'none', zIndex: 0,
          }}
        />
      )}
      {hasBg && <div className="app-overlay-layer" style={{ zIndex: 0 }} />}

      {/* Ambient glow (subtle when wallpaper is present) */}
      <div style={{
        position: 'absolute',
        width: 600,
        height: 600,
        borderRadius: '50%',
        background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 70%)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        opacity: hasBg ? 0.18 : 0.4,
        zIndex: 0,
      }} />

      {/* Title bar: drag region + window controls */}
      <div
        style={titleBarStyle}
        onDoubleClick={(e) => {
          if (!(e.target as HTMLElement).closest('button, [data-no-drag]')) {
            window.cyberNotesAPI.windowMaximizeToggle();
          }
        }}
      >
        <div data-no-drag style={noDragStyle}>
          <Tooltip placement="bottom" label={t.lockScreen.minimize}>
            <button
              type="button"
              className="btn-icon"
              onClick={() => window.cyberNotesAPI.windowMinimize()}
              style={{ width: 28, height: 28 }}
            >
              <Minus size={12} />
            </button>
          </Tooltip>
          <Tooltip placement="bottom" label={isMaximized ? (language === 'es' ? 'Restaurar' : 'Restore') : t.lockScreen.maximize}>
            <button
              type="button"
              className="btn-icon"
              onClick={() => window.cyberNotesAPI.windowMaximizeToggle()}
              style={{ width: 28, height: 28 }}
              aria-label={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20"/>
                  <polyline points="20 10 14 10 14 4"/>
                  <line x1="14" y1="10" x2="21" y2="3"/>
                  <line x1="10" y1="14" x2="3" y2="21"/>
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"/>
                  <polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/>
                  <line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              )}
            </button>
          </Tooltip>
          <Tooltip placement="bottom" label={t.lockScreen.close}>
            <button
              type="button"
              className="btn-icon"
              onClick={() => window.cyberNotesAPI.windowClose()}
              style={{ width: 28, height: 28, color: 'var(--text-muted)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
            >
              <X size={13} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Card */}
      <div
        className={`${shaking ? 'animate-shake' : 'lock-screen-card'} glass-effect`}
        style={{
          background: hasBg ? 'var(--bg-modal)' : 'var(--bg-surface)',
          border: '1px solid color-mix(in srgb, var(--accent) 28%, var(--border))',
          borderRadius: 'var(--radius-lg)',
          padding: '48px 40px 28px',
          width: 380,
          maxWidth: 'calc(100vw - 32px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 34px color-mix(in srgb, var(--accent-glow) 70%, transparent)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', width: 84, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div className="lock-screen-orbit lock-screen-orbit-primary" />
            <div className="lock-screen-orbit lock-screen-orbit-secondary" />
            <img
              src="icon.png"
              className="lock-screen-icon"
              style={{
                width: 56,
                height: 56,
                display: 'block',
              }}
              alt="Logo"
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h1 style={{
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: -0.5,
              margin: 0,
              background: 'linear-gradient(135deg, var(--text-primary) 35%, var(--accent-light) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              CyberNotes
            </h1>
          </div>
        </div>

        <WelcomeGreeting
          language={language}
          showName={false}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--accent-light)',
            animationDelay: '120ms',
          }}
        />

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!hasPassword && (
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
              {t.lockScreen.noPassword}
            </p>
          )}
          {hasPassword && (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, textAlign: 'center' }}>
                {t.lockScreen.enterPassword}
              </p>
              <div style={{ position: 'relative' }}>
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onContextMenu={inputMenu.onContextMenu}
                  placeholder={t.lockScreen.placeholderPassword}
                  autoFocus
                  className="input"
                  style={{ paddingRight: 40, fontSize: 15 }}
                  disabled={loading}
                  onKeyDown={e => {
                    if (e.getModifierState) setCapsOn(e.getModifierState('CapsLock'));
                  }}
                  onKeyUp={e => {
                    if (e.getModifierState) setCapsOn(e.getModifierState('CapsLock'));
                  }}
                />
                <Tooltip
                  placement="top"
                  label={showPassword ? t.lockScreen.hidePassword : t.lockScreen.showPassword}
                >
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="btn-icon"
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                    tabIndex={-1}
                    aria-label={showPassword ? t.lockScreen.hidePassword : t.lockScreen.showPassword}
                  >
                    {showPassword
                      ? <EyeOff size={16} color="var(--text-muted)" />
                      : <Eye size={16} color="var(--text-muted)" />}
                  </button>
                </Tooltip>
              </div>
            </>
          )}

          {hasPassword && capsOn && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--warning, #f59e0b)',
                background: 'color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent)',
                border: '1px solid color-mix(in srgb, var(--warning, #f59e0b) 35%, transparent)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <CaseSensitive size={14} />
              <span>{t.lockScreen.capsLockOn}</span>
            </div>
          )}

          {error && (
            <div style={{
              color: 'var(--danger)',
              fontSize: 12,
              textAlign: 'center',
              background: 'var(--danger-dim)',
              padding: '8px 12px',
              borderRadius: 'var(--radius-sm)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary lock-screen-submit"
            disabled={loading}
            style={{ width: '100%', padding: '10px', fontSize: 14, fontWeight: 600 }}
          >
            {loading ? (
              <span style={{ opacity: 0.7 }}>{t.lockScreen.verifying}</span>
            ) : (
              <>
                <Lock size={15} />
                {hasPassword ? t.lockScreen.unlock : t.lockScreen.enter}
              </>
            )}
          </button>
        </form>

        {appVersion && (
          <div style={{
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            opacity: 0.65,
            userSelect: 'none',
          }}>
            {t.lockScreen.version.replace('{version}', appVersion)}
          </div>
        )}
      </div>

      {inputMenu.menu}
    </div>
  );
}
