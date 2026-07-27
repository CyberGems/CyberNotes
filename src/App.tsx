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

  // Cargar tema e intensidad guardados
  useEffect(() => {
    const init = async () => {
      try {
        const s = await window.cyberNotesAPI.getSettings(['theme', 'colorIntensity', 'language']);
        
        let t = s.theme ? (s.theme as ThemeId) : 'cyber-dark';
        let i = s.colorIntensity ? parseInt(s.colorIntensity) : 50;
        let l = s.language ? (s.language as Language) : 'en';

        setTheme(t);
        setColorIntensity(i);
        setLanguage(l);
        applyThemeVars(t, i);

        const hasPassword = await window.cyberNotesAPI.hasPassword();
        setView(hasPassword ? 'lock' : 'app');
      } catch (err) {
        console.error('Init error:', err);
        setView('app');
      }
    };
    init();
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

  const handleUnlock = () => setView('app');

  const handleLock = () => setView('lock');

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
    return <LockScreen language={language} onUnlock={handleUnlock} />;
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
