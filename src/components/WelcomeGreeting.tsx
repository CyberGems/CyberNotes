import { useEffect, useState, type CSSProperties } from 'react';
import { Sunrise, Sun, MoonStar } from 'lucide-react';
import { Language, TRANSLATIONS } from '../languages';

interface WelcomeGreetingProps {
  language: Language;
  name?: string | null;
  showName?: boolean;
  showDateTime?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function formatDisplayName(rawName: string | null | undefined): string | null {
  if (!rawName) return null;
  const lastSegment = rawName.trim().split(/[\\/@]/).pop()?.trim() || '';
  if (!lastSegment) return null;
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

function getDateTimeParts(language: Language, now: Date): { time: string; date: string } {
  const locale = language === 'es' ? 'es-ES' : 'en-US';
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(now);
  const date = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(now);
  return { time, date };
}

type TimeOfDay = 'morning' | 'afternoon' | 'evening';

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour < 12) return 'morning';
  if (hour < 19) return 'afternoon';
  return 'evening';
}

export default function WelcomeGreeting({
  language,
  name,
  showName = true,
  showDateTime = true,
  className,
  style,
}: WelcomeGreetingProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const msToNextMinute = 60000 - (Date.now() % 60000) + 500;
    let interval: ReturnType<typeof setInterval> | undefined;
    const timeout = setTimeout(() => {
      setNow(new Date());
      interval = setInterval(() => setNow(new Date()), 60000);
    }, msToNextMinute);
    return () => {
      clearTimeout(timeout);
      if (interval) clearInterval(interval);
    };
  }, []);

  const greeting = getWelcomeGreeting(language, name, showName);
  const { time, date } = showDateTime ? getDateTimeParts(language, now) : { time: '', date: '' };
  const ariaLabel = showDateTime ? `${greeting}, ${time}, ${date}` : greeting;
  const timeOfDay = getTimeOfDay(now.getHours());
  const TimeIcon = timeOfDay === 'morning' ? Sunrise : timeOfDay === 'afternoon' ? Sun : MoonStar;

  return (
    <div
      className={`welcome-greeting${className ? ` ${className}` : ''}`}
      style={style}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <TimeIcon size={13} strokeWidth={1.8} className="welcome-greeting-icon" aria-hidden="true" />
      <span className="welcome-greeting-text">{greeting}</span>
      {showDateTime && (
        <span className="welcome-greeting-datetime" aria-hidden="true">
          <span className="welcome-greeting-sep">·</span>
          <span>{time}</span>
          <span className="welcome-greeting-sep">·</span>
          <span style={{ textTransform: 'capitalize' }}>{date}</span>
        </span>
      )}
    </div>
  );
}
