import { useState, type FormEvent } from 'react';
import { UserRound } from 'lucide-react';
import { Language } from '../languages';

interface Props {
  language: Language;
  initialName?: string | null;
  onSave: (name: string) => void | Promise<void>;
  onSkip: () => void | Promise<void>;
}

export default function WelcomeNameModal({ language, initialName, onSave, onSkip }: Props) {
  const [name, setName] = useState(initialName || '');
  const isSpanish = language === 'es';

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void onSave(name.trim());
  };

  return (
    <div
      className="welcome-name-overlay"
      role="presentation"
      onClick={() => void onSkip()}
    >
      <form
        className="welcome-name-card"
        onSubmit={handleSubmit}
        onClick={event => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-name-title"
      >
        <div className="welcome-name-icon" aria-hidden="true">
          <UserRound size={22} />
        </div>
        <div className="welcome-name-copy">
          <h2 id="welcome-name-title">
            {isSpanish ? 'Hagamos CyberNotes más tuyo' : 'Make CyberNotes feel more like yours'}
          </h2>
          <p>
            {isSpanish
              ? 'Elige el nombre que usaremos para saludarte. Puedes cambiarlo después desde Ajustes.'
              : 'Choose the name we should use to greet you. You can change it later from Settings.'}
          </p>
        </div>
        <label className="welcome-name-field">
          <span>{isSpanish ? 'Tu nombre' : 'Your name'}</span>
          <input
            className="input"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder={isSpanish ? 'Por ejemplo, Carlos' : 'For example, Carlos'}
            autoFocus
            autoComplete="name"
          />
        </label>
        <div className="welcome-name-actions">
          <button type="button" className="btn btn-ghost" onClick={() => void onSkip()}>
            {isSpanish ? 'Más tarde' : 'Not now'}
          </button>
          <button type="submit" className="btn btn-primary">
            {isSpanish ? 'Guardar nombre' : 'Save name'}
          </button>
        </div>
      </form>
    </div>
  );
}
