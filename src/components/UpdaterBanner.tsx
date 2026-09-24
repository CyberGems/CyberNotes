import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Download, Rocket, X, RefreshCw, Info, ChevronDown, ChevronUp, Sparkles, ExternalLink, SkipForward } from 'lucide-react';
import { Language, TRANSLATIONS } from '../languages';

type Status =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string; releaseNotes?: string; releaseUrl?: string }
  | { state: 'downloading'; percent: number; version?: string }
  | { state: 'downloaded'; version: string }
  | { state: 'installing'; version: string }
  | { state: 'error'; message: string };

const AUTO_RESTART_SEC = 8;
const SKIP_KEY = 'cybernotes_skipped_update_version';
const RELEASES_REPO = 'CyberGems/CyberNotes';

function isNetworkOrOfflineError(msg?: string): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  if (!msg) return false;
  const lower = msg.toLowerCase();
  return (
    lower.includes('err_internet_disconnected') ||
    lower.includes('err_connection_reset') ||
    lower.includes('err_name_not_resolved') ||
    lower.includes('err_network_changed') ||
    lower.includes('err_connection_refused') ||
    lower.includes('err_connection_timed_out') ||
    lower.includes('err_address_unreachable') ||
    lower.includes('enotfound') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('etimedout') ||
    lower.includes('ehostunreach') ||
    lower.includes('enetunreach') ||
    lower.includes('fetch failed') ||
    lower.includes('offline') ||
    lower.includes('network')
  );
}

function readSkippedVersion(): string | null {
  try {
    return localStorage.getItem(SKIP_KEY);
  } catch {
    return null;
  }
}

export function parseChangelogPeek(markdown?: string): { items: string[]; totalCount: number } {
  if (!markdown) return { items: [], totalCount: 0 };
  // Las notas pueden llegar como markdown crudo o ya renderizadas a HTML
  // (p. ej. <p align>, <a target="_blank"> del cuerpo del release). El despojo
  // de etiquetas es a nivel documento para cubrir tags partidos en líneas.
  const textOnly = markdown
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)));
  const cleanInline = (text: string): string => text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/:\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Restos sin contenido legible: URLs peladas, etc.
  const isJunk = (text: string): boolean => {
    if (!text) return true;
    if (/^https?:\/\/\S+$/i.test(text)) return true;
    return false;
  };
  const lines = textOnly.split(/\r?\n/);
  const allHighlights: string[] = [];
  let inHighlightsSection = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (/^###?\s.*(?:highlights|features|novedades|what's new|cambios)/i.test(line)) {
      inHighlightsSection = true;
      continue;
    }

    if (
      inHighlightsSection &&
      /^###?\s.*(?:downloads|packages|virustotal|assets|descargas|instrucciones)/i.test(line)
    ) {
      break;
    }

    if (rawLine.startsWith('- ') || rawLine.startsWith('* ')) {
      const text = rawLine.replace(/^[-*]\s+/, '').trim();
      const cleaned = cleanInline(text);

      if (
        !isJunk(cleaned) &&
        !cleaned.toLowerCase().includes('recommended installer') &&
        !cleaned.toLowerCase().includes('setup installer')
      ) {
        allHighlights.push(cleaned);
      }
    }
  }

  if (allHighlights.length === 0) {
    for (const raw of lines) {
      const line = raw.trim();
      if (line.startsWith('- ') || line.startsWith('* ')) {
        const cleaned = cleanInline(line.replace(/^[-*]\s+/, ''));
        if (
          !isJunk(cleaned) &&
          !cleaned.toLowerCase().includes('recommended installer') &&
          !cleaned.toLowerCase().includes('setup installer')
        ) {
          allHighlights.push(cleaned);
        }
      }
    }
  }

  if (allHighlights.length === 0) {
    for (const raw of lines) {
      const line = raw.trim();
      if (line && !line.startsWith('#') && !line.startsWith('---') && !line.startsWith('|')) {
        const cleaned = cleanInline(line);
        if (!isJunk(cleaned) && cleaned.length > 10) {
          allHighlights.push(cleaned);
          if (allHighlights.length >= 2) break;
        }
      }
    }
  }

  return {
    items: allHighlights.slice(0, 4),
    totalCount: allHighlights.length,
  };
}

export default function UpdaterBanner({ language }: { language: Language }) {
  const t = TRANSLATIONS[language].updater;
  const [status, setStatus] = useState<Status>({ state: 'idle' });
  const [countdown, setCountdown] = useState(AUTO_RESTART_SEC);
  const [dismissed, setDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState<string | undefined>();
  const [releaseUrl, setReleaseUrl] = useState<string>('');
  const lastVersionRef = useRef('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // true cuando la descarga en curso la inició el usuario (botón Descargar):
  // en ese caso no hay reinicio automático, solo botón Reiniciar ahora.
  const userDownloadRef = useRef(false);

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const currentVersion = status.state === 'available' || status.state === 'downloaded' || status.state === 'installing' || status.state === 'downloading'
    ? (status.version || '')
    : '';

  useEffect(() => {
    const off = window.cyberNotesAPI.onUpdateStatus((s: any) => {
      let next = s as Status;
      if (next.state === 'error' && isNetworkOrOfflineError(next.message)) {
        return;
      }
      if (next.state === 'available') {
        if (readSkippedVersion() === next.version) return;
        userDownloadRef.current = false;
        lastVersionRef.current = next.version;
        setReleaseNotes(next.releaseNotes);
        setReleaseUrl(next.releaseUrl || `https://github.com/${RELEASES_REPO}/releases/tag/v${next.version}`);
      }
      if (next.state === 'downloaded' || next.state === 'installing') {
        lastVersionRef.current = next.version || lastVersionRef.current;
      }
      if (next.state === 'downloading') {
        next = { ...next, version: next.version || lastVersionRef.current };
      }
      if (next.state === 'downloading' || next.state === 'downloaded' || next.state === 'installing' || next.state === 'available' || next.state === 'error') {
        setDismissed(false);
      }
      if (next.state === 'not-available' as any) {
        setStatus({ state: 'idle' });
        clearTimers();
        return;
      }
      setStatus(next);
      if (next.state !== 'downloaded') {
        clearTimers();
      }
    });
    return () => { off(); clearTimers(); };
  }, [clearTimers]);

  useEffect(() => {
    if (status.state !== 'available' || !status.version) return;
    if (releaseNotes) return;
    let cancelled = false;
    fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/tags/v${status.version}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data?.body) setReleaseNotes(data.body);
        if (data?.html_url) setReleaseUrl(data.html_url);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [status, releaseNotes]);

  useEffect(() => {
    // Sin countdown cuando la descarga la pidió el usuario: él decide cuándo
    // reiniciar con los botones. El countdown solo corre en ciclos automáticos.
    if (status.state !== 'downloaded' || dismissed || userDownloadRef.current) {
      clearTimers();
      return;
    }
    setCountdown(AUTO_RESTART_SEC);
    intervalRef.current = setInterval(() => {
      setCountdown((c) => Math.max(0, c - 1));
    }, 1000);
    timerRef.current = setTimeout(() => {
      window.cyberNotesAPI.installUpdate();
    }, AUTO_RESTART_SEC * 1000);
    return clearTimers;
  }, [status, dismissed, clearTimers]);

  const handleLater = useCallback(() => {
    clearTimers();
    setDismissed(true);
    window.cyberNotesAPI.cancelAutoInstall?.();
  }, [clearTimers]);

  const handleNow = useCallback(() => {
    clearTimers();
    window.cyberNotesAPI.installUpdate();
  }, [clearTimers]);

  const handleDismiss = useCallback(() => {
    clearTimers();
    setDismissed(true);
    if (status.state === 'downloaded') {
      window.cyberNotesAPI.cancelAutoInstall?.();
    }
  }, [clearTimers, status.state]);

  const handleSkip = useCallback((version: string) => {
    try {
      localStorage.setItem(SKIP_KEY, version);
    } catch { /* ignore */ }
    clearTimers();
    setDismissed(true);
    window.cyberNotesAPI.cancelAutoInstall?.();
  }, [clearTimers]);

  const handleDownload = useCallback(() => {
    try {
      localStorage.removeItem(SKIP_KEY);
    } catch { /* ignore */ }
    userDownloadRef.current = true;
    const version = currentVersion;
    setStatus({ state: 'downloading', percent: 0, version });
    void window.cyberNotesAPI.downloadUpdate();
  }, [currentVersion]);

  const { items: peekItems, totalCount } = useMemo(
    () => parseChangelogPeek(releaseNotes),
    [releaseNotes],
  );
  const remainingCount = Math.max(0, totalCount - peekItems.length);

  if (dismissed) return null;

  const showCard = status.state === 'available'
    || status.state === 'downloading'
    || status.state === 'downloaded'
    || status.state === 'installing'
    || status.state === 'error';

  if (!showCard) return null;

  if (status.state === 'error' && isNetworkOrOfflineError(status.message)) {
    return null;
  }

  const title = status.state === 'available'
    ? t.available
    : status.state === 'downloading'
      ? t.downloading.replace(' {percent}%', '').replace('{percent}%', '')
      : status.state === 'downloaded'
        ? t.downloaded.replace('{version}', status.version)
        : status.state === 'installing'
          ? t.installing
          : t.error;

  const cardUrl = releaseUrl || (currentVersion
    ? `https://github.com/${RELEASES_REPO}/releases/tag/v${currentVersion}`
    : `https://github.com/${RELEASES_REPO}/releases`);

  return (
    <div
      role="dialog"
      aria-label={t.available}
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        // Sobre los modales de la app (20000) para seguir visible y clicable
        // cuando se consulta desde Acerca de; bajo menús y confirmaciones.
        zIndex: 25000,
        width: 390,
        maxWidth: 'calc(100vw - 48px)',
        background: 'linear-gradient(145deg, var(--bg-modal), var(--bg-surface))',
        border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))',
        boxShadow: '0 14px 36px rgba(0, 0, 0, 0.55), 0 0 16px var(--accent-glow)',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background: status.state === 'error'
                ? 'var(--bg-surface)'
                : status.state === 'downloaded'
                  ? 'rgba(34,197,94,0.14)'
                  : 'color-mix(in srgb, var(--accent) 15%, transparent)',
              border: status.state === 'downloaded'
                ? '1px solid rgba(34,197,94,0.35)'
                : '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: status.state === 'downloaded' ? 'var(--success)' : 'var(--accent)',
              flexShrink: 0,
            }}
          >
            {status.state === 'downloading' || status.state === 'installing'
              ? <RefreshCw size={15} className="spin" />
              : status.state === 'downloaded'
                ? <Rocket size={15} />
                : status.state === 'error'
                  ? <Info size={15} style={{ color: 'var(--text-secondary)' }} />
                  : <Sparkles size={15} />}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)' }}>
                {title}
              </span>
              {currentVersion && status.state !== 'error' && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--accent)',
                    background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                    padding: '1px 6px',
                    borderRadius: 4,
                    lineHeight: '16px',
                  }}
                >
                  v{currentVersion}
                </span>
              )}
            </div>
            {status.state === 'downloaded' && !userDownloadRef.current && (
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                {t.restartingIn.replace('{sec}', String(countdown))}
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="btn-icon"
          style={{ width: 24, height: 24, borderRadius: 6 }}
          onClick={handleDismiss}
          title={t.dismiss}
          aria-label={t.dismiss}
        >
          <X size={13} />
        </button>
      </div>

      {(status.state === 'available' || status.state === 'downloading') && (
        <div
          style={{
            background: 'color-mix(in srgb, var(--bg-surface) 80%, black)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '9px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.6px',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {t.whatsNew}
          </div>

          {peekItems.length > 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                maxHeight: 125,
                overflowY: 'auto',
              }}
            >
              {peekItems.map((item, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 6,
                    fontSize: 11.5,
                    color: 'var(--text-secondary)',
                    lineHeight: 1.4,
                  }}
                >
                  <span
                    style={{
                      color: 'var(--accent)',
                      fontSize: 10,
                      lineHeight: '17px',
                      userSelect: 'none',
                    }}
                  >
                    •
                  </span>
                  <span style={{ wordBreak: 'break-word' }}>{item}</span>
                </div>
              ))}

              {remainingCount > 0 && (
                <div
                  style={{
                    fontSize: 10.5,
                    color: 'var(--text-muted)',
                    fontStyle: 'italic',
                    marginTop: 2,
                  }}
                >
                  {t.moreInFullNotes.replace('{count}', String(remainingCount))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              {TRANSLATIONS[language].about.releasesTooltip}
            </div>
          )}
        </div>
      )}

      {status.state === 'downloading' && (
        <div style={{ padding: '2px 0 0' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 11,
              marginBottom: 6,
            }}
          >
            <span style={{ color: 'var(--text-muted)' }}>{t.downloadBtn}...</span>
            <span style={{ fontWeight: 700, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>
              {status.percent}%
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: 5,
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                height: '100%',
                width: `${Math.max(2, Math.min(100, status.percent))}%`,
                background: 'linear-gradient(90deg, var(--accent), var(--accent-light))',
                borderRadius: 999,
                transition: 'width 0.2s ease-out',
              }}
            />
          </div>
        </div>
      )}

      {status.state === 'downloaded' && (
        <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 500 }}>
          {t.restartAndApply}
        </div>
      )}

      {status.state === 'error' && (
        <>
          {status.message && (
            <button
              type="button"
              onClick={() => setShowDetails(prev => !prev)}
              className="btn btn-ghost"
              style={{
                padding: '3px 8px',
                fontSize: 11,
                color: 'var(--text-muted)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                alignSelf: 'flex-start',
              }}
            >
              {showDetails ? t.hideDetails : t.details}
              {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
          {showDetails && status.message && (
            <div
              style={{
                padding: '6px 10px',
                borderRadius: 6,
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border)',
                fontFamily: 'var(--font-mono)',
                fontSize: 10.5,
                color: 'var(--text-muted)',
                wordBreak: 'break-word',
                maxHeight: 90,
                overflowY: 'auto',
                lineHeight: 1.4,
              }}
            >
              {status.message}
            </div>
          )}
        </>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 2,
          gap: 6,
        }}
      >
        {status.state === 'available' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
                onClick={() => window.cyberNotesAPI.openExternal(cardUrl)}
                title={t.viewReleaseNotes}
              >
                <ExternalLink size={12} />
                <span>{t.viewRelease}</span>
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                style={{
                  padding: '3px 8px',
                  fontSize: 11,
                  height: 26,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  color: 'var(--text-muted)',
                }}
                onClick={() => handleSkip(currentVersion)}
                title={t.skipUpdate}
              >
                <SkipForward size={12} />
                <span>{t.skipUpdate}</span>
              </button>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{
                padding: '4px 12px',
                fontSize: 11,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
                flexShrink: 0,
              }}
              onClick={handleDownload}
            >
              <Download size={13} />
              <span>{t.downloadBtn}</span>
            </button>
          </>
        ) : status.state === 'downloading' ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '3px 8px', fontSize: 11, height: 24 }}
              onClick={handleDismiss}
            >
              {t.dismiss}
            </button>
          </div>
        ) : status.state === 'downloaded' ? (
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', gap: 6 }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '3px 8px', fontSize: 11, height: 26 }}
              onClick={handleLater}
            >
              {t.later}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{
                padding: '4px 12px',
                fontSize: 11,
                height: 26,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
              }}
              onClick={handleNow}
            >
              <RefreshCw size={13} />
              <span>{t.restartNow}</span>
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%' }}>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ padding: '3px 8px', fontSize: 11, height: 24 }}
              onClick={handleDismiss}
            >
              {t.dismiss}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

