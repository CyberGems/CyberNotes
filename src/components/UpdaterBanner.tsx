import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Download, Rocket, X, RefreshCw, Info, ChevronDown, ChevronUp, Sparkles, ExternalLink, SkipForward } from 'lucide-react';
import { Language, TRANSLATIONS } from '../languages';
import type { UpdateStatus } from '../types';
import Tooltip from './Tooltip';

type Status = { state: 'idle' } | UpdateStatus;

const SKIP_KEY = 'cybernotes_skipped_update_version';
const PREVIEW_KEY = 'cybernotes_update_preview_enabled';
const PREVIEW_VERSION = '0.0.0-preview';
const PREVIEW_NOTES: Record<Language, string> = {
  es: '- Vista previa del aviso de actualización.\n- Comprueba el botón, el diseño y los controles sin una actualización real.\n- Descargar y reiniciar solo simulan sus estados, sin modificar la app.',
  en: '- Update notice preview.\n- Check the button, layout and controls without a real update.\n- Download and restart only simulate their states without changing the app.',
};
const RELEASES_REPO = 'CyberGems/CyberNotes';

function readPreviewEnabled(): boolean {
  try { return localStorage.getItem(PREVIEW_KEY) === 'true'; }
  catch { return false; }
}

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

/** Recorta el cuerpo del release al idioma de la UI (réplica del piloto de CyberClock). */
export function extractReleaseSection(markdown: string, language: Language): string {
  if (!markdown) return '';
  if (language === 'es') {
    // Bloque <details> en español de la plantilla bilingüe.
    const m = markdown.match(/<details>[\s\S]*?<summary>[\s\S]*?(?:espa\u00f1ol|spanish)[\s\S]*?<\/summary>([\s\S]*?)<\/details>/i);
    const content = m?.[1]?.trim();
    if (content) return content;
  }
  // Inglés (o releases antiguos sin bloque ES): quitar los details en español
  // para no mezclar idiomas en el aviso.
  return markdown.replace(/<details>[\s\S]*?<summary>[\s\S]*?(?:espa\u00f1ol|spanish)[\s\S]*?<\/summary>[\s\S]*?<\/details>/gi, '');
}

export function parseChangelogPeek(markdown?: string, language: Language = 'en'): { items: string[]; totalCount: number } {
  if (!markdown) return { items: [], totalCount: 0 };
  const scoped = extractReleaseSection(markdown, language);
  if (!scoped.trim()) return { items: [], totalCount: 0 };
  // Las notas pueden llegar como markdown crudo o ya renderizadas a HTML
  // (p. ej. <p align>, <a target="_blank"> del cuerpo del release). El despojo
  // de etiquetas es a nivel documento para cubrir tags partidos en líneas.
  const textOnly = scoped
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

export default function UpdaterBanner({ language, onNoticeChange, openNonce = 0 }: {
  language: Language;
  onNoticeChange?: (version: string | null) => void;
  openNonce?: number;
}) {
  const t = TRANSLATIONS[language].updater;
  const [updateStatus, setStatus] = useState<Status>({ state: 'idle' });
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [updateReleaseNotes, setReleaseNotes] = useState<string | undefined>();
  const [releaseUrl, setReleaseUrl] = useState<string>('');
  const [autoCheckUpdates, setAutoCheckUpdates] = useState<boolean | null>(null);
  const [skippedVersion, setSkippedVersion] = useState(readSkippedVersion);
  const [previewEnabled, setPreviewEnabled] = useState(readPreviewEnabled);
  const previewEnabledRef = useRef(previewEnabled);
  const [previewStatus, setPreviewStatus] = useState<Status>({ state: 'available', version: PREVIEW_VERSION });
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const lastVersionRef = useRef('');
  const status = previewEnabled ? previewStatus : updateStatus;
  const dismissed = previewEnabled ? previewDismissed : updateDismissed;
  const releaseNotes = previewEnabled ? PREVIEW_NOTES[language] : updateReleaseNotes;

  const togglePreview = useCallback((enabled?: boolean) => {
    const next = enabled ?? !previewEnabledRef.current;
    previewEnabledRef.current = next;
    setPreviewEnabled(next);
    setPreviewDismissed(false);
    setPreviewStatus({ state: 'available', version: PREVIEW_VERSION });
    try {
      if (next) localStorage.setItem(PREVIEW_KEY, 'true');
      else localStorage.removeItem(PREVIEW_KEY);
    } catch (error) {
      console.warn('[Updater preview] Could not save the preview preference:', error);
    }
    return next;
  }, []);

  useEffect(() => {
    window.__CYBERNOTES_TOGGLE_UPDATE_PREVIEW__ = togglePreview;
    return () => {
      if (window.__CYBERNOTES_TOGGLE_UPDATE_PREVIEW__ === togglePreview) {
        delete window.__CYBERNOTES_TOGGLE_UPDATE_PREVIEW__;
      }
    };
  }, [togglePreview]);

  const currentVersion = status.state === 'available' || status.state === 'downloaded' || status.state === 'installing' || status.state === 'downloading'
    ? (status.version || '')
    : '';

  const noticeVersion = (previewEnabled || autoCheckUpdates) && currentVersion && (previewEnabled || skippedVersion !== currentVersion)
    ? currentVersion : null;

  useEffect(() => {
    onNoticeChange?.(noticeVersion);
  }, [noticeVersion, onNoticeChange]);

  useEffect(() => {
    if (openNonce > 0) {
      if (previewEnabled) setPreviewDismissed(false);
      else setUpdateDismissed(false);
    }
  }, [openNonce]);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const off = window.cyberNotesAPI.onSettingChanged(({ key, value }) => {
      if (key !== 'auto_check_updates') return;
      receivedEvent = true;
      setAutoCheckUpdates(value !== 'false');
    });
    void window.cyberNotesAPI.getSetting('auto_check_updates').then(value => {
      if (active && !receivedEvent) setAutoCheckUpdates(value !== 'false');
    }).catch(() => {
      // Keep the title-bar notice hidden until its setting can be confirmed.
    });
    return () => { active = false; off(); };
  }, []);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;

    const applyStatus = (s: UpdateStatus) => {
      let next: Status = s;
      if (next.state === 'error' && isNetworkOrOfflineError(next.message)) {
        return;
      }
      if (next.state === 'available') {
        if (readSkippedVersion() === next.version) return;
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
        setUpdateDismissed(false);
      }
      if (next.state === 'not-available') {
        setStatus({ state: 'idle' });
        return;
      }
      setStatus(next);
    };

    const off = window.cyberNotesAPI.onUpdateStatus((status) => {
      receivedEvent = true;
      applyStatus(status);
    });

    void window.cyberNotesAPI.getUpdateStatus()
      .then((status) => {
        if (active && !receivedEvent && status) applyStatus(status);
      })
      .catch(() => { /* The event subscription remains available if the snapshot cannot be read. */ });

    return () => {
      active = false;
      off();
    };
  }, []);

  useEffect(() => {
    if (previewEnabled || updateStatus.state !== 'available' || !updateStatus.version) return;
    if (updateReleaseNotes) return;
    let cancelled = false;
    fetch(`https://api.github.com/repos/${RELEASES_REPO}/releases/tags/v${updateStatus.version}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        if (data?.body) setReleaseNotes(data.body);
        if (data?.html_url) setReleaseUrl(data.html_url);
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [previewEnabled, updateStatus, updateReleaseNotes]);

  const dismiss = useCallback(() => {
    if (previewEnabled) setPreviewDismissed(true);
    else setUpdateDismissed(true);
  }, [previewEnabled]);

  // Sin reinicio automático: tras descargar, el usuario decide con
  // Reiniciar ahora o Más tarde. Nada se descarga ni instala sin su clic.
  const handleLater = useCallback(() => {
    dismiss();
    if (!previewEnabled) window.cyberNotesAPI.cancelAutoInstall?.();
  }, [dismiss, previewEnabled]);

  const handleNow = useCallback(() => {
    if (previewEnabled) { togglePreview(false); return; }
    window.cyberNotesAPI.installUpdate();
  }, [previewEnabled, togglePreview]);

  const handleDismiss = useCallback(() => {
    dismiss();
    if (!previewEnabled && status.state === 'downloaded') {
      window.cyberNotesAPI.cancelAutoInstall?.();
    }
  }, [dismiss, previewEnabled, status.state]);

  const handleSkip = useCallback((version: string) => {
    if (previewEnabled) { togglePreview(false); return; }
    try {
      localStorage.setItem(SKIP_KEY, version);
    } catch { /* ignore */ }
    setSkippedVersion(version);
    setUpdateDismissed(true);
    window.cyberNotesAPI.cancelAutoInstall?.();
  }, [previewEnabled, togglePreview]);

  const handleDownload = useCallback(() => {
    if (previewEnabled) {
      setPreviewStatus({ state: 'downloaded', version: PREVIEW_VERSION });
      return;
    }
    try {
      localStorage.removeItem(SKIP_KEY);
    } catch { /* ignore */ }
    setSkippedVersion(null);
    const version = currentVersion;
    setStatus({ state: 'downloading', percent: 0, version });
    void window.cyberNotesAPI.downloadUpdate();
  }, [currentVersion, previewEnabled]);

  const { items: peekItems, totalCount } = useMemo(
    () => parseChangelogPeek(releaseNotes, language),
    [releaseNotes, language],
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
      data-update-preview={previewEnabled || undefined}
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
        boxShadow: 'var(--shadow-elevated, 0 14px 36px rgba(0, 0, 0, 0.55), 0 0 16px var(--accent-glow))',
        borderRadius: 12,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        backdropFilter: 'blur(12px)',
        userSelect: 'none',
        WebkitUserSelect: 'none',
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
          </div>
        </div>

        <Tooltip label={t.dismiss} placement="top">
        <button
          type="button"
          className="btn-icon"
          style={{ width: 24, height: 24, borderRadius: 6 }}
          onClick={handleDismiss}
          aria-label={t.dismiss}
        >
          <X size={13} />
        </button>
        </Tooltip>
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
                background: 'var(--inset-bg, rgba(0, 0, 0, 0.25))',
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
                onClick={() => { if (!previewEnabled) void window.cyberNotesAPI.openExternal(cardUrl); }}
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

