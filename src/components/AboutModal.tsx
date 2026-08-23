import { useState, useEffect, useRef, useCallback, type MouseEvent } from 'react';
import {
  X, Github, RefreshCw, Download, CheckCircle2,
  CircleDot, Tag, ClipboardCopy, Check,
} from 'lucide-react';
import { Language, TRANSLATIONS } from '../languages';
import Tooltip from './Tooltip';

const REPO_URL = 'https://github.com/CyberGems/CyberNotes';

type AppVersions = {
  app: string;
  electron: string;
  chrome: string;
  node: string;
  platform: string;
  arch: string;
  osRelease: string;
  osType: string;
};

type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

function platformLabel(platform: string): string {
  if (platform === 'win32') return 'Windows';
  if (platform === 'darwin') return 'macOS';
  if (platform === 'linux') return 'Linux';
  return platform;
}

interface Props {
  language: Language;
  onClose: () => void;
}

export default function AboutModal({ language, onClose }: Props) {
  const t = TRANSLATIONS[language].about;
  const [versions, setVersions] = useState<AppVersions | null>(null);
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [diagCopied, setDiagCopied] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.cyberNotesAPI.getVersions().then((v) => setVersions(v as AppVersions));
    window.cyberNotesAPI.getSetting('auto_check_updates').then((val) => {
      // Default on when unset (matches CyberFeeds / first-run UX)
      setAutoUpdate(val !== 'false');
    });
    const off = window.cyberNotesAPI.onUpdateStatus((s) => setStatus(s as UpdateStatus));
    return () => {
      off();
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const appVersion = versions?.app || '';

  const handleCheck = async () => {
    setStatus({ state: 'checking' });
    try {
      const res = await window.cyberNotesAPI.checkForUpdates();
      if (!res?.ok) {
        setStatus({ state: 'error', message: res?.error || 'Update check failed' });
        return;
      }
      setStatus(prev =>
        prev.state === 'checking'
          ? { state: 'not-available', version: res.version || appVersion }
          : prev
      );
    } catch (e) {
      setStatus({ state: 'error', message: String((e as Error)?.message || e) });
    }
  };

  const handleDownload = async () => {
    await window.cyberNotesAPI.downloadUpdate();
  };

  const handleInstall = () => {
    window.cyberNotesAPI.installUpdate();
  };

  const handleToggleAutoUpdate = async (val: boolean) => {
    setAutoUpdate(val);
    await window.cyberNotesAPI.setSetting('auto_check_updates', val.toString());
  };

  const handleClose = (e?: MouseEvent) => {
    e?.stopPropagation();
    onClose();
  };

  const handleCopyDiagnostics = useCallback(async () => {
    if (!versions) return;
    const lines = [
      `CyberNotes ${versions.app}`,
      `Electron: ${versions.electron}`,
      `Chrome: ${versions.chrome}`,
      `Node: ${versions.node}`,
      `OS: ${platformLabel(versions.platform)} ${versions.osRelease} (${versions.arch})`,
      `Locale: ${language}`,
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setDiagCopied(true);
      if (copiedTimer.current) clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setDiagCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }, [versions, language]);

  return (
    <div className="modal-overlay" onClick={() => handleClose()}>
      <div
        className="modal about-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t.title}
        onClick={e => e.stopPropagation()}
        style={{
          width: 440,
          maxHeight: 'min(90vh, 640px)',
          background: 'linear-gradient(160deg, var(--bg-modal), var(--bg-app))',
          border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))',
          overflow: 'hidden',
        }}
      >
        <div className="modal-header" style={{ border: 'none', padding: '16px 16px 0', flexShrink: 0 }}>
          <div style={{ flex: 1 }} />
          <Tooltip label={t.close} placement="left">
            <button
              type="button"
              className="btn-icon"
              onClick={handleClose}
              aria-label={t.close}
            >
              <X size={16} />
            </button>
          </Tooltip>
        </div>

        <div className="modal-body about-modal-body" style={{ textAlign: 'center', padding: '0 28px 20px', overflowY: 'auto' }}>
          <div style={{ position: 'relative', width: 72, height: 72, margin: '0 auto 16px' }}>
            <div style={{
              position: 'absolute', inset: -4,
              background: 'var(--accent-dim)',
              borderRadius: '50%',
              filter: 'blur(12px)',
            }} />
            <img
              src="icon.png"
              alt="CyberNotes"
              style={{
                position: 'relative',
                width: 72,
                height: 72,
                borderRadius: 18,
                border: '1px solid var(--accent)',
                boxShadow: '0 0 18px var(--accent-glow)',
              }}
            />
          </div>

          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 4px' }}>
            Cyber<span style={{ color: 'var(--accent)' }}>Notes</span>
          </h1>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 14,
          }}>
            {t.version.replace('{version}', appVersion || '…')}
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: 24 }}>
            {t.desc}
          </p>

          <div style={{ textAlign: 'left' }}>
            <div style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent)',
              marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ height: 1, flex: 1, background: 'var(--accent-dim)' }} />
              {t.maintenance}
              <div style={{ height: 1, flex: 1, background: 'var(--accent-dim)' }} />
            </div>

            <UpdateStatusLine status={status} t={t} />

            <div className="about-maintenance">
              {status.state === 'available' ? (
                <button type="button" className="btn btn-primary about-action-btn" onClick={handleDownload}>
                  <Download size={14} />
                  <span>{t.downloadBtn}</span>
                </button>
              ) : status.state === 'downloaded' ? (
                <button type="button" className="btn btn-primary about-action-btn" onClick={handleInstall}>
                  <CheckCircle2 size={14} />
                  <span>{t.installBtn}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-ghost about-action-btn"
                  onClick={handleCheck}
                  disabled={status.state === 'checking' || status.state === 'downloading'}
                >
                  <RefreshCw size={14} className={status.state === 'checking' ? 'spin' : ''} />
                  <span>{t.checkUpdates}</span>
                </button>
              )}

              <button
                type="button"
                className={`btn btn-ghost about-action-btn about-diag-btn${diagCopied ? ' is-copied' : ''}`}
                onClick={handleCopyDiagnostics}
                disabled={!versions}
              >
                {diagCopied ? <Check size={14} /> : <ClipboardCopy size={14} />}
                <span>{diagCopied ? t.diagnosticsCopied : t.copyDiagnostics}</span>
              </button>

              <label
                className="about-auto-update"
                style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                onClick={() => handleToggleAutoUpdate(!autoUpdate)}
              >
                <div className={`custom-switch ${autoUpdate ? 'active' : ''}`} />
                <span>{t.autoUpdates}</span>
              </label>
            </div>
          </div>
        </div>

        <div className="about-modal-footer">
          <Tooltip label={t.websiteTooltip} placement="top">
            <button
              type="button"
              className="about-footer-brand"
              onClick={() => window.cyberNotesAPI.openExternal('https://cybergems.org')}
              aria-label={t.websiteTooltip}
            >
              © CyberGems • 2026
            </button>
          </Tooltip>
          <div className="about-footer-links">
            <Tooltip label={t.githubTooltip} placement="top">
              <button
                type="button"
                className="btn-icon"
                style={{ width: 28, height: 28 }}
                onClick={() => window.cyberNotesAPI.openExternal(REPO_URL)}
                aria-label={t.githubTooltip}
              >
                <Github size={14} />
              </button>
            </Tooltip>
            <Tooltip label={t.issuesTooltip} placement="top">
              <button
                type="button"
                className="btn-icon"
                style={{ width: 28, height: 28 }}
                onClick={() => window.cyberNotesAPI.openExternal(`${REPO_URL}/issues`)}
                aria-label={t.issuesTooltip}
              >
                <CircleDot size={14} />
              </button>
            </Tooltip>
            <Tooltip label={t.releasesTooltip} placement="top">
              <button
                type="button"
                className="btn-icon"
                style={{ width: 28, height: 28 }}
                onClick={() => window.cyberNotesAPI.openExternal(`${REPO_URL}/releases`)}
                aria-label={t.releasesTooltip}
              >
                <Tag size={14} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  );
}

function UpdateStatusLine({
  status,
  t,
}: {
  status: UpdateStatus;
  t: (typeof TRANSLATIONS)['en']['about'];
}) {
  if (status.state === 'idle') return null;
  if (status.state === 'downloading') {
    return (
      <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
        {t.statuses.downloading.replace('{percent}', String(status.percent))}
      </div>
    );
  }

  const map: Record<string, { text: string; color: string }> = {
    checking: { text: t.statuses.checking, color: 'var(--text-secondary)' },
    'not-available': { text: t.statuses.latest, color: 'var(--success)' },
    available: { text: t.statuses.available, color: 'var(--accent)' },
    downloaded: { text: t.statuses.downloaded, color: 'var(--success)' },
    error: { text: t.statuses.error, color: 'var(--danger)' },
  };
  const info = map[status.state];
  if (!info) return null;

  return (
    <div style={{ textAlign: 'center', fontSize: 12, color: info.color, marginBottom: 10 }}>
      {info.text}
      {status.state === 'error' && status.message && (
        <div style={{ marginTop: 4, fontSize: 10, color: 'var(--text-muted)', wordBreak: 'break-word' }}>
          {status.message}
        </div>
      )}
    </div>
  );
}
