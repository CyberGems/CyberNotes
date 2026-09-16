import { Language } from '../languages';

interface AppLoaderProps {
  language?: Language;
  isShield?: boolean;
  message?: string;
}

export default function AppLoader({ language = 'en', isShield = false, message }: AppLoaderProps) {
  const defaultMessage = isShield
    ? (language === 'es' ? 'Restaurando sesión...' : 'Restoring session...')
    : (language === 'es' ? 'Iniciando...' : 'Starting...');

  const displayMessage = message || defaultMessage;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999999,
        background: 'radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--accent, #269bb5) 16%, transparent) 0%, color-mix(in srgb, var(--bg-app, #0d0e18) 96%, transparent) 55%, #08090e 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        pointerEvents: 'all',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes cyberSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes cyberPulse {
          0%, 100% { transform: scale(1); filter: drop-shadow(0 0 14px var(--accent-glow, rgba(38, 155, 181, 0.4))); }
          50% { transform: scale(1.04); filter: drop-shadow(0 0 24px var(--accent-glow, rgba(38, 155, 181, 0.7))); }
        }
        @keyframes cyberRunner {
          0% { left: -40%; width: 30%; }
          50% { left: 30%; width: 50%; }
          100% { left: 100%; width: 30%; }
        }
        @keyframes cyberFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Top drag strip so user can move window during loading */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 'var(--titlebar-height, 38px)',
          WebkitAppRegion: 'drag',
        } as React.CSSProperties}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          animation: 'cyberFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Logo Container with Orbit Ring */}
        <div style={{ position: 'relative', width: 84, height: 84, minWidth: 84, minHeight: 84, flex: '0 0 84px', aspectRatio: '1 / 1', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          {/* Glowing orbital ring */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '2px solid rgba(255, 255, 255, 0.06)',
              borderTopColor: 'var(--accent, #269bb5)',
              borderRightColor: 'color-mix(in srgb, var(--accent, #269bb5) 35%, transparent)',
              animation: 'cyberSpin 1.8s linear infinite',
            }}
          />

          {/* Secondary faint counter-orbit ring */}
          <div
            style={{
              position: 'absolute',
              inset: 6,
              borderRadius: '50%',
              border: '1px dashed color-mix(in srgb, var(--accent-light, #8bd8e2) 35%, transparent)',
              animation: 'cyberSpin 6s linear infinite reverse',
            }}
          />

          {/* App Icon */}
          <img
            src="icon.png"
            alt="CyberNotes"
            style={{
              width: 52,
              height: 52,
              display: 'block',
              animation: 'cyberPulse 2.6s ease-in-out infinite',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            background: 'linear-gradient(135deg, #ffffff 40%, var(--accent-light, #8bd8e2) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            marginBottom: 6,
          }}
        >
          CyberNotes
        </div>

        {/* Subtitle / Status message */}
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--text-muted, #94a3b8)',
            letterSpacing: '0.03em',
            marginBottom: 18,
            minHeight: 18,
          }}
        >
          {displayMessage}
        </div>

        {/* Modern Indeterminate Runner Bar */}
        <div
          style={{
            width: 140,
            height: 3,
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.08)',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent, var(--accent, #269bb5), var(--accent-light, #8bd8e2), transparent)',
              boxShadow: '0 0 10px var(--accent-glow, rgba(38, 155, 181, 0.6))',
              borderRadius: 999,
              animation: 'cyberRunner 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite',
            }}
          />
        </div>
      </div>
    </div>
  );
}
