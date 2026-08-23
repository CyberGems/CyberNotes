import { useState, useRef, useEffect, type CSSProperties, type FormEvent } from 'react';
import { Lock, Eye, EyeOff, Minus, Square, X, CaseSensitive } from 'lucide-react';
import { Language, TRANSLATIONS } from '../languages';
import { useInputContextMenu } from '../hooks/useInputContextMenu';
import Tooltip from './Tooltip';

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
  const inputRef = useRef<HTMLInputElement>(null);
  const inputMenu = useInputContextMenu(language);

  useEffect(() => {
    window.cyberNotesAPI.hasPassword().then(setHasPassword);
    window.cyberNotesAPI.getVersions().then(v => setAppVersion(v?.app || '')).catch(() => {});
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
      className={hasBg ? 'has-bg' : ''}
      style={{
        height: '100vh',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
        position: 'relative',
        overflow: 'hidden',
        ['--glass-blur' as string]: `${glassBlur}px`,
        ['--bg-overlay-opacity' as string]: String(bgOpacity),
      }}
    >
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
      <div style={titleBarStyle}>
        <div style={noDragStyle}>
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
          <Tooltip placement="bottom" label={t.lockScreen.maximize}>
            <button
              type="button"
              className="btn-icon"
              onClick={() => window.cyberNotesAPI.windowMaximizeToggle()}
              style={{ width: 28, height: 28 }}
            >
              <Square size={11} />
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
        className={`${shaking ? 'animate-shake' : ''} glass-effect`}
        style={{
          background: hasBg ? 'var(--bg-modal)' : 'var(--bg-surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '48px 40px 28px',
          width: 380,
          maxWidth: 'calc(100vw - 32px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
          boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
          position: 'relative',
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <img
            src="icon.png"
            style={{
              width: 64,
              height: 64,
              display: 'block',
            }}
            alt="Logo"
          />
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5, margin: 0 }}>
              CyberNotes
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, marginBottom: 0 }}>
              {hasPassword
                ? t.lockScreen.enterPassword
                : t.lockScreen.noPassword}
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {hasPassword && (
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
            className="btn btn-primary"
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
