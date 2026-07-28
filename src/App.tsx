import { useState, useEffect, useCallback } from 'react';
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

  // Cargar tema e intensidad guardados
  useEffect(() => {
    const init = async () => {
      try {
        const s = await window.cyberNotesAPI.getSettings([
          'theme', 'colorIntensity', 'language',
          'bg_image', 'glass_blur', 'bg_opacity',
        ]);
        
        let t = s.theme ? (s.theme as ThemeId) : 'cyber-dark';
        let i = s.colorIntensity ? parseInt(s.colorIntensity) : 50;
        let l = s.language ? (s.language as Language) : 'en';

        setTheme(t);
        setColorIntensity(i);
        setLanguage(l);
        applyThemeVars(t, i);
        if (s.bg_image) setBgImage(s.bg_image);
        if (s.glass_blur) setGlassBlur(parseFloat(s.glass_blur));
        if (s.bg_opacity) setBgOpacity(parseFloat(s.bg_opacity));

        const hasPassword = await window.cyberNotesAPI.hasPassword();
        if (hasPassword) {
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

  // Main-process force lock (tray restore / idle watcher) — must ack so opacity can rise.
  useEffect(() => {
    const off = window.cyberNotesAPI.onForceLock(() => {
      setView('lock');
      // Defer ack to next frame so LockScreen has committed before the window becomes opaque.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          window.cyberNotesAPI.ackSessionLocked();
        });
      });
    });
    return off;
  }, []);

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

  const handleUnlock = useCallback(() => {
    setView('app');
    window.cyberNotesAPI.setSessionLocked(false);
  }, []);

  const handleLock = useCallback(() => {
    setView('lock');
    window.cyberNotesAPI.setSessionLocked(true);
    window.cyberNotesAPI.ackSessionLocked();
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
    <MainApp
      language={language}
      onLanguageChange={handleLanguageChange}
      currentTheme={theme}
      onThemeChange={handleThemeChange}
      colorIntensity={colorIntensity}
      onIntensityChange={handleIntensityChange}
      onLock={handleLock}
    />
  );
}
