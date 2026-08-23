import { useState, useEffect, useCallback, useRef } from 'react';
import { ThemeId } from './types';
import { applyThemeVars } from './themes';
import { Language } from './languages';
import LockScreen from './components/LockScreen';
import MainApp from './components/MainApp';

type AppView = 'loading' | 'lock' | 'app';

export default function App() {
  const [view, setView] = useState<AppView>('loading');
  const [theme, setTheme] = useState<ThemeId>('cyber-dark');
  const [colorIntensity, setColorIntensity] = useState(50);
  const [language, setLanguage] = useState<Language>('en');
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [glassBlur, setGlassBlur] = useState(0);
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [privacyShield, setPrivacyShield] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(0);
  const [hasPassword, setHasPassword] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const hasPasswordRef = useRef<boolean>(false);
  const autoLockMinutesRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  hasPasswordRef.current = hasPassword;
  autoLockMinutesRef.current = autoLockMinutes;

  const handleLock = useCallback(() => {
    setPrivacyShield(false);
    setView('lock');
    window.cyberNotesAPI.setSessionLocked(true);
    window.cyberNotesAPI.ackSessionLocked();
  }, []);

  const handleUnlock = useCallback(() => {
    lastActivityRef.current = Date.now();
    setPrivacyShield(false);
    setView('app');
    window.cyberNotesAPI.setSessionLocked(false);
  }, []);

  // Cargar tema, intensidad, auto-bloqueo y estado de contraseña guardados
  useEffect(() => {
    const init = async () => {
      try {
        const s = await window.cyberNotesAPI.getSettings([
          'theme', 'colorIntensity', 'language',
          'bg_image', 'glass_blur', 'bg_opacity',
          'auto_lock_minutes',
        ]);
        
        let t = s.theme ? (s.theme as ThemeId) : 'cyber-dark';
        let i = s.colorIntensity ? parseInt(s.colorIntensity) : 50;
        let l = s.language ? (s.language as Language) : 'en';
        let autoLock = s.auto_lock_minutes ? parseInt(s.auto_lock_minutes) : 0;

        setTheme(t);
        setColorIntensity(i);
        setLanguage(l);
        setAutoLockMinutes(Number.isFinite(autoLock) ? autoLock : 0);
        applyThemeVars(t, i);
        if (s.bg_image) setBgImage(s.bg_image);
        if (s.glass_blur) setGlassBlur(parseFloat(s.glass_blur));
        if (s.bg_opacity) setBgOpacity(parseFloat(s.bg_opacity));

        const hp = await window.cyberNotesAPI.hasPassword();
        setHasPassword(hp);
        if (hp) {
          setView('lock');
          await window.cyberNotesAPI.setSessionLocked(true);
        } else {
          setView('app');
          await window.cyberNotesAPI.setSessionLocked(false);
        }
      } catch (err) {
        console.error('Init error:', err);
        setView('app');
      }
    };
    init();
  }, []);

  // Sincronización de eventos de bloqueo forzado y escudo de privacidad
  useEffect(() => {
    const offForceLock = window.cyberNotesAPI.onForceLock(() => {
      handleLock();
    });

    const offShieldEnable = window.cyberNotesAPI.onShieldEnable?.(() => {
      if (hasPasswordRef.current) {
        setPrivacyShield(true);
      }
    });

    const offShieldDisable = window.cyberNotesAPI.onShieldDisable?.(() => {
      setPrivacyShield(false);
    });

    const offSettingChanged = window.cyberNotesAPI.onSettingChanged?.((data) => {
      if (data.key === 'password_hash') {
        const hp = data.value === 'set';
        setHasPassword(hp);
      } else if (data.key === 'auto_lock_minutes') {
        const mins = parseInt(data.value) || 0;
        setAutoLockMinutes(mins);
      }
    });

    return () => {
      offForceLock();
      if (offShieldEnable) offShieldEnable();
      if (offShieldDisable) offShieldDisable();
      if (offSettingChanged) offSettingChanged();
    };
  }, [handleLock]);

  // Detección síncrona de visibilidad y foco (Wall-clock check)
  useEffect(() => {
    const checkIdleAndLock = () => {
      if (hasPasswordRef.current && autoLockMinutesRef.current > 0) {
        const elapsed = Date.now() - lastActivityRef.current;
        if (elapsed >= autoLockMinutesRef.current * 60 * 1000) {
          handleLock();
          return true;
        }
      }
      return false;
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (hasPasswordRef.current) {
          setPrivacyShield(true);
        }
      } else if (document.visibilityState === 'visible') {
        const locked = checkIdleAndLock();
        if (!locked) {
          setPrivacyShield(false);
        }
      }
    };

    const handleFocus = () => {
      const locked = checkIdleAndLock();
      if (!locked) {
        setPrivacyShield(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [handleLock]);

  // Temporizador de actividad del usuario en primer plano
  useEffect(() => {
    if (view !== 'app' || !hasPassword || autoLockMinutes <= 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    let lastReset = 0;
    const resetTimer = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      if (now - lastReset >= 1000) {
        lastReset = now;
        window.cyberNotesAPI.reportActivity();
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        handleLock();
      }, autoLockMinutes * 60 * 1000);
    };

    const events = ['mousedown', 'mousemove', 'keydown', 'wheel', 'touchstart'];
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach(e => window.removeEventListener(e, resetTimer));
    };
  }, [view, hasPassword, autoLockMinutes, handleLock]);

  const handleThemeChange = useCallback(async (t: ThemeId) => {
    setTheme(t);
    applyThemeVars(t, colorIntensity);
    await window.cyberNotesAPI.setSetting('theme', t);
  }, [colorIntensity]);

  const handleIntensityChange = useCallback(async (v: number) => {
    setColorIntensity(v);
    applyThemeVars(theme, v);
    await window.cyberNotesAPI.setSetting('colorIntensity', v.toString());
  }, [theme]);

  const handleLanguageChange = useCallback(async (lang: Language) => {
    setLanguage(lang);
    await window.cyberNotesAPI.setSetting('language', lang);
  }, []);

  const handleAutoLockChange = useCallback(async (v: number) => {
    setAutoLockMinutes(v);
    await window.cyberNotesAPI.setSetting('auto_lock_minutes', v.toString());
  }, []);

  if (view === 'loading') {
    return (
      <div style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-app)',
      }}>
        <div style={{ color: 'var(--accent)', fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>
          CyberNotes
        </div>
      </div>
    );
  }

  if (view === 'lock') {
    return (
      <LockScreen
        language={language}
        onUnlock={handleUnlock}
        bgImage={bgImage}
        glassBlur={glassBlur}
        bgOpacity={bgOpacity}
      />
    );
  }

  return (
    <>
      <MainApp
        language={language}
        onLanguageChange={handleLanguageChange}
        currentTheme={theme}
        onThemeChange={handleThemeChange}
        colorIntensity={colorIntensity}
        onIntensityChange={handleIntensityChange}
        onLock={handleLock}
        autoLockMinutes={autoLockMinutes}
        onAutoLockChange={handleAutoLockChange}
      />
      {privacyShield && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 999999,
            background: 'var(--bg-app, #0d0d14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            userSelect: 'none',
            pointerEvents: 'all',
          }}
        >
          <div style={{ color: 'var(--accent, #6366f1)', fontSize: 28, fontWeight: 700, letterSpacing: -1 }}>
            CyberNotes
          </div>
        </div>
      )}
    </>
  );
}
