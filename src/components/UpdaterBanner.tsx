import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Rocket, X, RefreshCw, Sparkles, ExternalLink } from 'lucide-react';
import { Language, TRANSLATIONS } from '../languages';
import type { PendingUpdate, UpdateStatus } from '../types';
import Tooltip from './Tooltip';

const SKIP_KEY = 'cybernotes_skipped_update_version';
const PREVIEW_KEY = 'cybernotes_update_preview_enabled';
const PREVIEW_VERSION = '0.0.0-preview';
const PREVIEW_SIZE_BYTES = 92000000;
const PREVIEW_NOTES: Record<Language, string> = {
  es: '- Vista previa del aviso de actualización.\n- Comprueba el botón, el diseño y los controles sin una actualización real.\n- Descargar y reiniciar solo simulan sus estados, sin modificar la app.',
  en: '- Update notice preview.\n- Check the button, layout and controls without a real update.\n- Download and restart only simulate their states without changing the app.',
};
const RELEASES_REPO = 'CyberGems/CyberNotes';

function readPreviewEnabled(): boolean {
  try { return localStorage.getItem(PREVIEW_KEY) === 'true'; }
  catch { return false; }
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
  // El bloque de instalación es furniture de la página del release: el updater
  // es automático, así que el aviso no necesita las indicaciones de SmartScreen.
  const stripInstallBlock = (text: string): string =>
    text
      .replace(/^#{2,4}\s*⚠️\s*(?:Before you install|Antes de instalar)[\s\S]*?\n---/gim, '')
      .replace(/^#{2,4}\s*⚠️\s*(?:Before you install|Antes de instalar)[\s\S]*$/gim, '');
  if (language === 'es') {
    // Bloque <details> en español de la plantilla bilingüe.
    const m = markdown.match(/<details>[\s\S]*?<summary>[\s\S]*?(?:espa\u00f1ol|spanish)[\s\S]*?<\/summary>([\s\S]*?)<\/details>/i);
    const content = m?.[1]?.trim();
    if (content) return stripInstallBlock(content);
  }
  // Inglés (o releases antiguos sin bloque ES): quitar los details en español
  // para no mezclar idiomas en el aviso.
  return stripInstallBlock(markdown.replace(/<details>[\s\S]*?<summary>[\s\S]*?(?:espa\u00f1ol|spanish)[\s\S]*?<\/summary>[\s\S]*?<\/details>/gi, ''));
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

export type UpdateNoticeRequest = { version?: string };

export default function UpdaterBanner({ language, onNoticeChange, openRequest, beforeInstall }: {
  language: Language;
  onNoticeChange?: (version: string | null) => void;
  openRequest?: UpdateNoticeRequest | null;
  beforeInstall?: () => Promise<boolean>;
}) {
  const t = TRANSLATIONS[language].updater;
  const [updateStatus, setUpdateStatus] = useState<PendingUpdate | null>(null);
  const [hiddenStage, setHiddenStage] = useState<string | null>(null);
  const [manualVersion, setManualVersion] = useState<string | null>(null);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState<boolean | null>(null);
  const [skippedVersion, setSkippedVersion] = useState(readSkippedVersion);
  const [previewEnabled, setPreviewEnabled] = useState(readPreviewEnabled);
  const previewEnabledRef = useRef(previewEnabled);
  const [previewStatus, setPreviewStatus] = useState<PendingUpdate>({ state: 'available', version: PREVIEW_VERSION });
  const [previewHiddenStage, setPreviewHiddenStage] = useState<string | null>(null);
  const [preparingInstall, setPreparingInstall] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const focusRequest = useRef<UpdateNoticeRequest | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const status = previewEnabled ? previewStatus : updateStatus;
  const currentVersion = status?.version ?? null;
  const visibleVersion = previewEnabled || (currentVersion !== null && (
    manualVersion === currentVersion || (autoCheckUpdates && skippedVersion !== currentVersion)
  )) ? currentVersion : null;
  const stage = status?.state === 'installing' ? 'downloaded' : status?.state;
  const stageKey = visibleVersion && stage ? `${visibleVersion}:${stage}` : null;
  const dismissed = stageKey === (previewEnabled ? previewHiddenStage : hiddenStage);

  const togglePreview = useCallback((enabled?: boolean) => {
    const next = enabled ?? !previewEnabledRef.current;
    previewEnabledRef.current = next;
    setPreviewEnabled(next);
    setPreviewHiddenStage(null);
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

  useEffect(() => {
    if (!previewEnabled || previewStatus.state !== 'downloading') return;
    const timer = setInterval(() => {
      setPreviewStatus(current => {
        if (current.state !== 'downloading') return current;
        const percent = current.percent + 20;
        if (percent >= 100) return { version: current.version, state: 'downloaded' };
        return { ...current, percent, transferred: PREVIEW_SIZE_BYTES * percent / 100 };
      });
    }, 400);
    return () => clearInterval(timer);
  }, [previewEnabled, previewStatus.state]);

  useEffect(() => {
    onNoticeChange?.(visibleVersion);
  }, [visibleVersion, onNoticeChange]);

  useEffect(() => {
    if (!openRequest) return;
    if (openRequest.version) {
      setManualVersion(openRequest.version);
      if (previewEnabledRef.current) togglePreview(false);
    }
    focusRequest.current = openRequest;
    setHiddenStage(null);
    setPreviewHiddenStage(null);
  }, [openRequest, togglePreview]);

  useEffect(() => {
    if (!cardRef.current || !focusRequest.current || dismissed) return;
    if (focusRequest.current.version && focusRequest.current.version !== visibleVersion) return;
    focusRequest.current = null;
    if (document.activeElement instanceof HTMLElement && !cardRef.current.contains(document.activeElement)) {
      returnFocus.current = document.activeElement;
      cardRef.current.focus();
    }
  }, [openRequest, visibleVersion, dismissed]);

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
    }).catch(error => console.warn('[Updater] Could not read the update preference:', error));
    return () => { active = false; off(); };
  }, []);

  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const applyStatus = (next: UpdateStatus) => {
      if (next.state === 'not-available') {
        setUpdateStatus(null);
        setManualVersion(null);
        setHiddenStage(null);
      } else {
        setUpdateStatus(next);
        setManualVersion(version => version === next.version ? version : null);
      }
    };
    const off = window.cyberNotesAPI.onUpdateStatus(next => {
      receivedEvent = true;
      applyStatus(next);
    });
    void window.cyberNotesAPI.getUpdateStatus().then(snapshot => {
      if (active && !receivedEvent && snapshot) applyStatus(snapshot);
    }).catch(error => console.warn('[Updater] Could not read the update status:', error));
    return () => { active = false; off(); };
  }, []);

  useEffect(() => {
    if (!status) return;
    setActionError(null);
  }, [status?.state, currentVersion]);

  const releaseNotes = previewEnabled ? PREVIEW_NOTES[language] : status?.releaseNotes;
  const { items: peekItems, totalCount } = useMemo(
    () => parseChangelogPeek(releaseNotes, language),
    [releaseNotes, language],
  );

  if (!status || !stageKey || dismissed) return null;

  const { version } = status;
  const githubUrl = status.releaseUrl || `https://github.com/${RELEASES_REPO}/releases/tag/v${version}`;
  const title = {
    available: t.available,
    downloading: status.state === 'downloading' && status.cancelling ? t.cancelling : t.downloading,
    downloaded: t.downloaded,
    installing: t.installing,
  }[status.state];
  const downloading = status.state === 'downloading';
  const installing = status.state === 'installing' || preparingInstall;
  const failure = (status.state === 'available' && status.downloadFailed && t.downloadFailed)
    || (status.state === 'downloaded' && status.installError === 'unsaved' && t.unsaved)
    || (status.state === 'downloaded' && status.installError === 'failed' && t.installFailed);

  const dismiss = () => {
    if (previewEnabled) setPreviewHiddenStage(stageKey);
    else setHiddenStage(stageKey);
    returnFocus.current?.focus();
    returnFocus.current = null;
  };

  const runAction = async (action: () => Promise<void>, errorMessage: string) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      console.error('[Updater] Could not complete the requested action:', error);
      setActionError(errorMessage);
    }
  };

  const skip = () => {
    if (previewEnabled) {
      togglePreview(false);
    } else {
      dismiss();
      try { localStorage.setItem(SKIP_KEY, version); }
      catch (error) { console.warn('[Updater] Could not persist the skipped version:', error); }
      setSkippedVersion(version);
      setManualVersion(null);
    }
  };

  const download = () => {
    if (previewEnabled) {
      setPreviewStatus({ state: 'downloading', version, percent: 0, transferred: 0, total: PREVIEW_SIZE_BYTES });
      return;
    }
    if (skippedVersion === version) {
      try { localStorage.removeItem(SKIP_KEY); }
      catch (error) { console.warn('[Updater] Could not clear the skipped version:', error); }
      setSkippedVersion(null);
    }
    setManualVersion(version);
    void runAction(() => window.cyberNotesAPI.downloadUpdate(version), t.downloadFailed);
  };

  const cancel = () => {
    if (previewEnabled) {
      setPreviewStatus({ state: 'available', version });
      return;
    }
    void runAction(() => window.cyberNotesAPI.cancelUpdateDownload(version), t.cancelFailed);
  };

  const install = async () => {
    if (previewEnabled) {
      togglePreview(false);
      return;
    }
    setPreparingInstall(true);
    try {
      await runAction(async () => {
        if (beforeInstall && !await beforeInstall()) {
          setActionError(t.saveFailed);
          return;
        }
        await window.cyberNotesAPI.installUpdate(version);
      }, t.installFailed);
    } finally {
      setPreparingInstall(false);
    }
  };

  const remainingCount = totalCount - peekItems.length;
  const formatSize = (bytes: number) => new Intl.NumberFormat(language, {
    style: 'unit', unit: 'megabyte', maximumFractionDigits: 1,
  }).format(bytes / 1000000);

  return (
    <div
      className="update-notice"
      ref={cardRef}
      tabIndex={-1}
      role="dialog"
      aria-labelledby="update-notice-title"
      data-update-preview={previewEnabled || undefined}
      onKeyDown={event => {
        if (event.key === 'Escape' && !installing) {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <div className="update-notice-header">
        <span className="update-notice-icon" aria-hidden="true">
          {downloading || installing ? <RefreshCw size={16} className="spin" />
            : status.state === 'downloaded' ? <Rocket size={16} /> : <Sparkles size={16} />}
        </span>
        <h2 id="update-notice-title">{title} <span>v{version}</span></h2>
        <Tooltip label={downloading ? t.background : t.dismiss} placement="top">
          <button
            type="button"
            className="btn-icon"
            onClick={dismiss}
            disabled={installing}
            aria-label={downloading ? t.background : t.dismiss}
          >
            <X size={15} />
          </button>
        </Tooltip>
      </div>

      <section className="update-release-notes" aria-label={t.whatsNew}>
        <h3>{t.whatsNew}</h3>
        {peekItems.length > 0 ? (
          <>
            <ul>{peekItems.map((item, index) => <li key={index}>{item}</li>)}</ul>
            {remainingCount > 0 && (
              <p>{t.moreInFullNotes.replace('{count}', String(remainingCount))}</p>
            )}
          </>
        ) : <p>{status.notesLoading ? t.notesLoading : t.notesUnavailable}</p>}
      </section>

      {downloading && (
        <div className="update-notice-progress">
          <div>
            <span id="update-progress-label">{t.progress}</span>
            <span>{status.transferred !== undefined && status.total
              ? `${formatSize(status.transferred)} / ${formatSize(status.total)}`
              : `${status.percent}%`}</span>
          </div>
          <progress max={100} value={status.percent} aria-labelledby="update-progress-label" />
        </div>
      )}

      {(actionError || failure) && <p className="update-notice-error" role="alert">{actionError || failure}</p>}

      <div className="update-notice-actions">
        {status.state === 'available' && (
          <>
            <button type="button" className="btn btn-ghost" onClick={() => {
              if (!previewEnabled) void runAction(async () => {
                if (!await window.cyberNotesAPI.openExternal(githubUrl)) {
                  setActionError(t.openFailed);
                }
              }, t.openFailed);
            }}>
              <ExternalLink size={13} aria-hidden="true" />
              {t.viewRelease}
            </button>
            <button type="button" className="btn btn-ghost" onClick={skip}>{t.skipUpdate}</button>
            <button type="button" className="btn btn-ghost" onClick={dismiss}>{t.later}</button>
            <button type="button" className="btn btn-primary" onClick={download}>{t.updateNow}</button>
          </>
        )}
        {downloading && (
          <>
            <button type="button" className="btn btn-ghost" onClick={dismiss}>{t.background}</button>
            <button type="button" className="btn btn-ghost" onClick={cancel} disabled={status.cancelling}>{t.cancelDownload}</button>
          </>
        )}
        {status.state === 'downloaded' && (
          <>
            <button type="button" className="btn btn-ghost" onClick={dismiss} disabled={preparingInstall}>{t.later}</button>
            <button type="button" className="btn btn-primary" onClick={install} disabled={preparingInstall}>{t.restartNow}</button>
          </>
        )}
      </div>
    </div>
  );
}
