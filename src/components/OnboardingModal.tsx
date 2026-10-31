import { useRef, useState } from 'react';
import { Sparkles, Minus, Maximize2, X } from 'lucide-react';
import type { Language } from '../languages';
import type { ThemeId } from '../types';
import { THEMES } from '../themes';
import { EnterGlyph, KeyHint, useModalKeys } from './ModalActions';
import Tooltip from './Tooltip';

export default function OnboardingModal({ initialLanguage, initialTheme, onClosePreview }: { initialLanguage: Language; initialTheme: ThemeId; onClosePreview?: () => void }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState(false);
  const es = language === 'es';
  const finish = async (skip = false) => {
    if (onClosePreview) { onClosePreview(); return; }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError(false);
    try {
      const result = await window.cyberNotesAPI.finishOnboarding({ language, theme, name: skip ? '' : name.trim() });
      if (!result.ok) throw new Error('Could not complete onboarding');
      window.location.reload();
    } catch { savingRef.current = false; setError(true); setSaving(false); }
  };
  useModalKeys({ enabled: !saving, onEsc: () => void finish(true), onEnter: () => void finish() });
  return <div className="onboarding-overlay">
    <div className="onboarding-titlebar">
      <span>CyberNotes</span>
      <div className="onboarding-window-actions">
        <Tooltip label={es ? 'Minimizar' : 'Minimize'} placement="bottom"><button className="btn-icon titlebar-btn" aria-label={es ? 'Minimizar' : 'Minimize'} onClick={() => void window.cyberNotesAPI.windowMinimize()}><Minus size={14} /></button></Tooltip>
        <Tooltip label={es ? 'Maximizar o restaurar' : 'Maximize or restore'} placement="bottom"><button className="btn-icon titlebar-btn" aria-label={es ? 'Maximizar o restaurar' : 'Maximize or restore'} onClick={() => void window.cyberNotesAPI.windowMaximizeToggle()}><Maximize2 size={14} /></button></Tooltip>
        <Tooltip label={es ? 'Cerrar' : 'Close'} placement="bottom"><button className="btn-icon titlebar-btn close-btn" aria-label={es ? 'Cerrar' : 'Close'} onClick={() => onClosePreview ? onClosePreview() : void window.cyberNotesAPI.windowClose()}><X size={14} /></button></Tooltip>
      </div>
    </div>
    <div className="onboarding-card" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-heading"><span className="settings-icon settings-icon-heading"><Sparkles size={17} /></span>
        <div><h1 id="onboarding-title">{es ? 'Bienvenido a CyberNotes' : 'Welcome to CyberNotes'}</h1>
          <p>{es ? 'Prepara tu espacio. Puedes cambiar estas opciones después en Configuración.' : 'Set up your space. You can change these choices later in Settings.'}</p></div>
      </div>
      <div className="onboarding-body">
        {onClosePreview && <p className="onboarding-preview-notice">{es ? 'Vista previa: tus elecciones no se guardarán.' : 'Preview: your choices will not be saved.'}</p>}
        <fieldset><legend>Idioma / Language</legend><div className="onboarding-languages">
          <button type="button" aria-pressed={language === 'es'} onClick={() => setLanguage('es')}>Español</button>
          <button type="button" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>English</button>
        </div><p>{es ? 'Las notas de bienvenida se crearán en este idioma.' : 'The welcome notes will be created in this language.'}</p></fieldset>
        <fieldset><legend>{es ? 'Tema' : 'Theme'}</legend><div className="onboarding-themes">
          {THEMES.map(item => <button type="button" key={item.id} aria-pressed={theme === item.id} onClick={() => setTheme(item.id)}>
            <span className="settings-theme-preview" aria-hidden="true" style={{ background: item.vars['--bg-app'], borderColor: item.vars['--border'], color: item.vars['--accent'] }}>
              <i style={{ background: item.vars['--bg-surface'] }} /><i /><i />
            </span><span>{es ? item.nameEs || item.name : item.nameEn || item.name}</span>
          </button>)}
        </div></fieldset>
        <label className="onboarding-name"><span>{es ? 'Nombre para saludarte (opcional)' : 'Name for greetings (optional)'}</span>
          <input className="input" value={name} maxLength={80} onChange={event => setName(event.target.value)} autoComplete="name" />
        </label>
        {error && <p role="alert" className="onboarding-error">{es ? 'No se pudo guardar la configuración. Inténtalo de nuevo.' : 'Could not save your settings. Please try again.'}</p>}
      </div>
      <div className="modal-actions">
        <button type="button" className="modal-action-btn is-cancel" disabled={saving} onClick={() => void finish(true)}>{es ? 'Omitir' : 'Skip'}<KeyHint>Esc</KeyHint></button>
        <button type="button" className="modal-action-btn is-save" disabled={saving} onClick={() => void finish()}>{es ? 'Comenzar' : 'Get started'}<EnterGlyph /></button>
      </div>
    </div>
  </div>;
}
