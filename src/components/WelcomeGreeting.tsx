import type { CSSProperties } from 'react';
import { Language, TRANSLATIONS } from '../languages';

interface WelcomeGreetingProps {
  language: Language;
  name?: string | null;
  showName?: boolean;
  className?: string;
  style?: CSSProperties;
}

function formatDisplayName(rawName: string): string {
  const lastSegment = rawName.trim().split(/[\\/@]/).pop()?.trim() || '';
  return lastSegment
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map(part => `${part.charAt(0).toLocaleUpperCase()}${part.slice(1).toLocaleLowerCase()}`)
    .join(' ');
}

export function getWelcomeGreeting(language: Language, name?: string | null, showName = true): string {
  const general = TRANSLATIONS[language].general;
  if (!showName) return general.welcomeBack;

  const displayName = name ? formatDisplayName(name) : '';
  if (!displayName) return general.welcomeBack;

  const hour = new Date().getHours();
  const key = hour < 12
    ? 'welcomeMorning'
    : hour < 18
      ? 'welcomeAfternoon'
      : 'welcomeEvening';

  return general[key].replace('{name}', displayName);
}

export default function WelcomeGreeting({
  language,
  name,
  showName = true,
  className,
  style,
}: WelcomeGreetingProps) {
  return (
    <div
      className={`welcome-greeting${className ? ` ${className}` : ''}`}
      style={style}
      aria-label={getWelcomeGreeting(language, name, showName)}
    >
      <span className="welcome-greeting-dot" aria-hidden="true" />
      <span>{getWelcomeGreeting(language, name, showName)}</span>
    </div>
  );
}
