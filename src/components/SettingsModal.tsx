import { useState, useEffect, useRef, useCallback, Fragment, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ThemeId, type UsageStats } from '../types';
import { THEMES, isColorfulTheme, getPreviewColor } from '../themes';
import { EditorFontId, EDITOR_FONTS } from '../fonts';
import { TOOLBAR_ITEMS, type ToolbarItemDef } from './NoteEditor';
import { Language } from '../languages';
import { Lock, Shield, FolderOpen, Palette, Trash2, Eye, EyeOff, Download, Upload, Languages, Volume2, Settings, SlidersHorizontal, Database, RotateCcw, X, Pin, Type, Archive, Minus, Power, Keyboard, PanelLeft, Rows3, Map, Hash, Save, Image, Droplets, Clock3, HardDrive, LockKeyhole, ShieldCheck, StickyNote, Copy, Check, KeyRound, History, LayoutGrid, Sparkles, BarChart3, Info, Folder, Flame, Sigma, FilePlus2, Plus, Layers } from 'lucide-react';
import { playSynthSound } from '../utils/audio';
import { DialogHost, DialogOptions } from './ConfirmDialog';
import Tooltip from './Tooltip';
import { useInputContextMenu } from '../hooks/useInputContextMenu';

interface Props {
  language: Language;
  displayName?: string | null;
  onDisplayNameChange?: (name: string) => void | Promise<void>;
  onLanguageChange: (lang: Language) => void;
  currentTheme: ThemeId;
  onThemeChange: (t: ThemeId) => void;
  colorIntensity: number;
  onIntensityChange: (v: number) => void;
  bgImage: string | null;
  onBgImageChange: (url: string | null) => void;
  glassBlur: number;
  onBlurChange: (v: number) => void;
  bgOpacity: number;
  onOpacityChange: (v: number) => void;
  autoLockMinutes: number;
  onAutoLockChange: (v: number) => void;
  rememberLastNote: boolean;
  onRememberLastNoteChange: (v: boolean) => void;
  showLineCounter: boolean;
  onShowLineCounterChange: (v: boolean) => void;
  showLineGutter: boolean;
  onShowLineGutterChange: (v: boolean) => void;
  autosaveEnabled: boolean;
  onAutosaveEnabledChange: (v: boolean) => void;
  autoUnlockCapsLock: boolean;
  onAutoUnlockCapsLockChange: (v: boolean) => void;
  autoUnlockCapsLockTimeout: number;
  onAutoUnlockCapsLockTimeoutChange: (v: number) => void;
  capsLockSound: string;
  onCapsLockSoundChange: (v: string) => void;
  capsLockSoundScope: string;
  onCapsLockSoundScopeChange: (v: string) => void;
  onClose: () => void;
  onLock: () => void;
  onOpenAbout?: () => void;
  onOpenTrayPin?: (isAutomatic?: boolean) => void;
  tabsWidthMode: 'normal' | 'wide';
  onTabsWidthModeChange: (v: 'normal' | 'wide') => void;
  editorFont?: EditorFontId;
  onEditorFontChange?: (font: EditorFontId) => void;
  showMinimap: boolean;
  onShowMinimapChange: (v: boolean) => void;
  showWordCounter: boolean;
  onShowWordCounterChange: (v: boolean) => void;
  showFloatingToolbar: boolean;
  onShowFloatingToolbarChange: (v: boolean) => void;
  hiddenToolbarIds: string[];
  onHiddenToolbarIdsChange: (ids: string[]) => void;
  initialTab?: Tab;
}

type Tab = 'general' | 'appearance' | 'security' | 'maintenance' | 'stats';

/** Atajo global por defecto (misma fuente que electron/main.ts). */
const DEFAULT_TOGGLE_HOTKEY = 'Alt+Shift+N';

const DISMISSIBLE_CONFIRMATION_KEYS = [
  'confirm_move_note_to_trash_dismissed',
  'confirm_leave_note_dismissed',
] as const;

type SettingsIconTone = 'accent' | 'warning' | 'danger' | 'success';

function SettingsIcon({
  icon,
  tone = 'accent',
  variant = 'row',
}: {
  icon: ReactNode;
  tone?: SettingsIconTone;
  variant?: 'row' | 'heading';
}) {
  return (
    <span
      className={`settings-icon settings-icon-${variant} settings-icon-${tone}`}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

function SettingsHeading({
  icon,
  tone = 'accent',
  children,
}: {
  icon: ReactNode;
  tone?: SettingsIconTone;
  children: ReactNode;
}) {
  return (
    <h3 className="settings-section-heading">
      <SettingsIcon icon={icon} tone={tone} variant="heading" />
      <span>{children}</span>
    </h3>
  );
}

function SettingsOptionCopy({
  icon,
  tone = 'accent',
  children,
}: {
  icon: ReactNode;
  tone?: SettingsIconTone;
  children: ReactNode;
}) {
  return (
    <div className="settings-option-copy">
      <SettingsIcon icon={icon} tone={tone} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

function UsageTiles({ stats, language }: { stats: UsageStats; language: Language }) {
  const locale = language === 'es' ? 'es-ES' : 'en-US';
  const fmt = (n: number) => new Intl.NumberFormat(locale).format(n);
  const fmt1 = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(n);
  const tiles = [
    {
      icon: <Layers size={14} />, value: fmt(stats.createdTotal),
      label: language === 'es' ? 'Creadas' : 'Created',
      tip: language === 'es' ? 'Notas creadas desde que se empezaron a contar' : 'Notes created since counting started',
    },
    {
      icon: <Type size={14} />, value: fmt(stats.totals.words),
      label: language === 'es' ? 'Palabras' : 'Words',
      tip: language === 'es' ? 'Palabras en todas tus notas' : 'Words across all notes',
    },
    {
      icon: <Folder size={14} />, value: fmt(stats.totals.folders),
      label: language === 'es' ? 'Carpetas' : 'Folders',
      tip: language === 'es' ? 'Carpetas creadas' : 'Created folders',
    },
    {
      icon: <StickyNote size={14} />, value: fmt(stats.stickiesTotal),
      label: language === 'es' ? 'Flotantes' : 'Floating',
      tip: language === 'es' ? 'Notas flotantes creadas' : 'Floating notes created',
    },
    {
      icon: <Image size={14} />, value: fmt(stats.totals.images),
      label: language === 'es' ? 'Imágenes' : 'Images',
      tip: language === 'es' ? 'Imágenes en tus notas' : 'Images in your notes',
    },
    {
      icon: <Flame size={14} />, value: fmt(stats.currentStreak),
      label: language === 'es' ? 'Racha (días)' : 'Streak (days)',
      sub: language === 'es' ? `récord ${fmt(stats.longestStreak)}` : `best ${fmt(stats.longestStreak)}`,
      tip: language === 'es' ? 'Días seguidos abriendo la app' : 'Consecutive days opening the app',
    },
    {
      icon: <KeyRound size={14} />, value: fmt(stats.totalUnlocks),
      label: language === 'es' ? 'Desbloqueos' : 'Unlocks',
      tip: language === 'es' ? 'Veces que desbloqueaste la app' : 'Times you unlocked the app',
    },
    {
      icon: <Sigma size={14} />, value: fmt1(stats.avgWords),
      label: language === 'es' ? 'Promedio' : 'Average',
      tip: language === 'es' ? 'Palabras por nota en promedio' : 'Average words per note',
    },
    {
      icon: <FilePlus2 size={14} />, value: fmt(stats.newWeek),
      label: language === 'es' ? 'Nuevas (7 días)' : 'New (7 days)',
      tip: language === 'es' ? 'Notas creadas en los últimos 7 días' : 'Notes created in the last 7 days',
    },
  ];
  const firstOpen = stats.firstOpen ? new Date(`${stats.firstOpen}T12:00:00`) : null;
  const firstOpenText = firstOpen && !Number.isNaN(firstOpen.getTime())
    ? firstOpen.toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })
    : '—';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {tiles.map((tile) => (
          <Tooltip key={tile.label} placement="top" label={tile.tip}>
            <div
              style={{
                background: 'var(--bg-app)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)', padding: '10px 8px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}
            >
              <span style={{ color: 'var(--accent-light)', display: 'inline-flex', opacity: 0.9 }}>
                {tile.icon}
              </span>
              <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                {tile.value}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
                {tile.label}
              </span>
              {tile.sub && (
                <span style={{ fontSize: 9.5, color: 'var(--text-muted)', opacity: 0.8 }}>
                  {tile.sub}
                </span>
              )}
            </div>
          </Tooltip>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center' }}>
        {language === 'es' ? 'En uso desde' : 'In use since'} {firstOpenText}
        {' · '}
        {language === 'es'
          ? `${fmt(stats.activeDays)} días activos · ${fmt(stats.totalOpens)} aperturas`
          : `${fmt(stats.activeDays)} active days · ${fmt(stats.totalOpens)} opens`}
      </div>
    </div>
  );
}

export default function SettingsModal({ 
  language, displayName, onDisplayNameChange, onLanguageChange,
  currentTheme, onThemeChange, colorIntensity, onIntensityChange, 
  bgImage, onBgImageChange, glassBlur, onBlurChange, bgOpacity, onOpacityChange,
  autoLockMinutes, onAutoLockChange,
  rememberLastNote, onRememberLastNoteChange,
  showLineCounter, onShowLineCounterChange,
  showLineGutter, onShowLineGutterChange,
  autosaveEnabled, onAutosaveEnabledChange,
  autoUnlockCapsLock, onAutoUnlockCapsLockChange,
  autoUnlockCapsLockTimeout, onAutoUnlockCapsLockTimeoutChange,
  capsLockSound, onCapsLockSoundChange,
  capsLockSoundScope, onCapsLockSoundScopeChange,
  onClose, onLock, onOpenAbout, onOpenTrayPin,
  tabsWidthMode, onTabsWidthModeChange,
  editorFont = 'inter', onEditorFontChange,
  showMinimap, onShowMinimapChange,
  showWordCounter, onShowWordCounterChange,
  showFloatingToolbar, onShowFloatingToolbarChange,
  hiddenToolbarIds, onHiddenToolbarIdsChange,
  initialTab = 'general',
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [appVersion, setAppVersion] = useState('');
  const [hasPassword, setHasPassword] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdMessage, setPwdMessage] = useState('');
  const [pwdError, setPwdError] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [recHas, setRecHas] = useState(false);
  const [recCode, setRecCode] = useState<string | null>(null);
  const [recAck, setRecAck] = useState(false);
  const [recHint, setRecHint] = useState('');
  const [recMessage, setRecMessage] = useState('');
  const [recError, setRecError] = useState(false);
  const [recLoading, setRecLoading] = useState(false);
  const [authMethod, setAuthMethod] = useState<'password' | 'pin'>('password');
  const [storedMethod, setStoredMethod] = useState<'password' | 'pin' | null>(null);
  const [showRecDialog, setShowRecDialog] = useState(false);
  const [recDialogMode, setRecDialogMode] = useState<'first' | 'regen'>('first');
  const [closeToTray, setCloseToTray] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [toggleHotkey, setToggleHotkey] = useState(DEFAULT_TOGGLE_HOTKEY);
  const [stickyRestoreOnStartup, setStickyRestoreOnStartup] = useState(true);
  const [stickySkipTaskbar, setStickySkipTaskbar] = useState(true);
  const [stickyLockAction, setStickyLockAction] = useState<'hide' | 'shield'>('hide');
  const [dismissedConfirmationCount, setDismissedConfirmationCount] = useState(0);
  const [restoreNoticesFeedback, setRestoreNoticesFeedback] = useState(false);
  const restoreNoticesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (restoreNoticesTimerRef.current) clearTimeout(restoreNoticesTimerRef.current);
  }, []);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [autoBackupHours, setAutoBackupHours] = useState('24');
  const [autoBackupKeep, setAutoBackupKeep] = useState('7');
  const [autoBackupLast, setAutoBackupLast] = useState<string | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [isCapturingHotkey, setIsCapturingHotkey] = useState(false);
  const [hotkeyError, setHotkeyError] = useState<string | null>(null);
  const [hotkeyPreview, setHotkeyPreview] = useState<string | null>(null);
  const hotkeyInputRef = useRef<HTMLInputElement>(null);
  const [hasSavedChanges, setHasSavedChanges] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const initialSnapshotRef = useRef<string | null>(null);

  const handleToggleStickyRestore = async (val: boolean) => {
    setStickyRestoreOnStartup(val);
    await window.cyberNotesAPI.setSetting('sticky_restore_on_startup', val ? 'true' : 'false');
  };

  const [showSuitePromo, setShowSuitePromo] = useState(true);

  const handleToggleSuitePromo = async (val: boolean) => {
    setShowSuitePromo(val);
    await window.cyberNotesAPI.setSetting('show_suite_promo', val ? 'true' : 'false');
  };

  const [usageStatsOn, setUsageStatsOn] = useState(true);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageError, setUsageError] = useState(false);
  const [usageExpanded, setUsageExpanded] = useState(false);

  const handleToggleUsageStats = async (val: boolean) => {
    setUsageStatsOn(val);
    await window.cyberNotesAPI.setSetting('usage_stats_enabled', val ? 'true' : 'false');
    if (!val) {
      await window.cyberNotesAPI.purgeUsageStats().catch(() => {});
      setUsageStats(null);
    }
  };

  const handleLoadUsageStats = useCallback(async () => {
    setUsageExpanded(true);
    await window.cyberNotesAPI.setSetting('usage_stats_expanded', 'true').catch(() => {});
    setUsageLoading(true);
    setUsageError(false);
    try {
      const res = await window.cyberNotesAPI.getUsageStats();
      if (res?.ok && res.stats) {
        setUsageStats(res.stats);
      } else {
        setUsageError(true);
      }
    } catch {
      setUsageError(true);
    } finally {
      setUsageLoading(false);
    }
  }, []);

  const handleHideUsageStats = useCallback(async () => {
    setUsageExpanded(false);
    setUsageStats(null);
    await window.cyberNotesAPI.setSetting('usage_stats_expanded', 'false').catch(() => {});
  }, []);

  const handleResetUsageStats = async () => {
    const proceed = await showDialog({
      variant: 'warning',
      confirm: true,
      title: language === 'es' ? 'Restablecer estadísticas' : 'Reset statistics',
      message: language === 'es'
        ? 'Se borrarán aperturas, días, rachas y totales acumulados. Esta acción no se puede deshacer.'
        : 'Opens, days, streaks and accumulated totals will be deleted. This cannot be undone.',
      confirmLabel: language === 'es' ? 'Restablecer' : 'Reset',
    });
    if (!proceed) return;
    await window.cyberNotesAPI.purgeUsageStats().catch(() => {});
    usageAutoRef.current = true;
    setUsageStats(null);
  };

  // Auto-mostrar al entrar a la pestaña si así quedó la última vez.
  const usageAutoRef = useRef(false);
  useEffect(() => {
    if (tab === 'stats' && usageStatsOn && usageExpanded && !usageStats && !usageLoading && !usageAutoRef.current) {
      usageAutoRef.current = true;
      void handleLoadUsageStats();
    }
  }, [tab, usageStatsOn, usageExpanded, usageStats, usageLoading, handleLoadUsageStats]);

  const handleToggleStickySkipTaskbar = async (val: boolean) => {
    setStickySkipTaskbar(val);
    await window.cyberNotesAPI.setSetting('sticky_skip_taskbar', val ? 'true' : 'false');
  };

  const handleChangeStickyLockAction = async (val: 'hide' | 'shield') => {
    setStickyLockAction(val);
    await window.cyberNotesAPI.setSetting('sticky_lock_action', val);
  };

  const handleRestoreDismissedConfirmations = async () => {
    await Promise.all(DISMISSIBLE_CONFIRMATION_KEYS.map((key) => window.cyberNotesAPI.setSetting(key, 'false')));
    setDismissedConfirmationCount(0);
    setHasSavedChanges(true);
    setRestoreNoticesFeedback(true);
    if (restoreNoticesTimerRef.current) clearTimeout(restoreNoticesTimerRef.current);
    restoreNoticesTimerRef.current = setTimeout(() => {
      setRestoreNoticesFeedback(false);
      restoreNoticesTimerRef.current = null;
    }, 2200);
  };

  const handleToggleAutoBackup = async (val: boolean) => {
    setAutoBackupEnabled(val);
    await window.cyberNotesAPI.setSetting('auto_backup_enabled', val ? 'true' : 'false');
  };

  const handleAutoBackupHours = async (val: string) => {
    setAutoBackupHours(val);
    await window.cyberNotesAPI.setSetting('auto_backup_hours', val);
  };

  const handleAutoBackupKeep = async (val: string) => {
    setAutoBackupKeep(val);
    await window.cyberNotesAPI.setSetting('auto_backup_keep', val);
  };

  const handleBackupNow = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const res = await window.cyberNotesAPI.backupNow();
      if (res?.ok) {
        await showDialog({
          variant: 'success',
          title: language === 'es' ? 'Respaldo completado' : 'Backup complete',
          message: language === 'es'
            ? `Copia guardada como ${res.file || 'respaldo.db'}.`
            : `Backup saved as ${res.file || 'backup.db'}.`,
        });
      } else {
        await showDialog({
          variant: 'warning',
          title: language === 'es' ? 'Respaldo fallido' : 'Backup failed',
          message: language === 'es'
            ? 'No se pudo crear la copia. Revisa el registro para más detalles.'
            : 'Could not create the backup. Check the log for details.',
        });
      }
    } finally {
      setBackupBusy(false);
    }
  };

  const formatBackupDate = (iso: string | null): string => {
    if (!iso) return language === 'es' ? 'Nunca' : 'Never';
    try {
      return new Intl.DateTimeFormat(language === 'es' ? 'es-ES' : 'en-US', {
        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  };

  // Diálogo personalizado (reemplaza alert/confirm nativos)
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const dialogResolver = useRef<((accepted: boolean) => void) | null>(null);

  const showDialog = (options: DialogOptions) => new Promise<boolean>(resolve => {
    dialogResolver.current = resolve;
    setDialog(options);
  });

  const resolveDialog = (accepted: boolean) => {
    setDialog(null);
    dialogResolver.current?.(accepted);
    dialogResolver.current = null;
  };

  const inputMenu = useInputContextMenu(language);

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    const offBackup = window.cyberNotesAPI.onBackupCompleted?.((info) => {
      setAutoBackupLast(info.at);
    });
    return () => { offBackup?.(); };
  }, []);

  useEffect(() => {
    window.cyberNotesAPI.hasPassword().then(setHasPassword);
    window.cyberNotesAPI.hasRecoveryCode?.().then(setRecHas).catch(() => {});
    window.cyberNotesAPI.getSetting('password_hint').then(v => { if (v) setRecHint(v); }).catch(() => {});
    window.cyberNotesAPI.getSetting('auth_method').then(v => { if (v === 'pin' || v === 'password') { setAuthMethod(v); setStoredMethod(v); } }).catch(() => {});
    window.cyberNotesAPI.getVersions?.().then(v => {
      if (v?.app) setAppVersion(v.app);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const loadSettings = async () => {
      const val = await window.cyberNotesAPI.getSetting('close_to_tray');
      const ctt = val === 'true';
      setCloseToTray(ctt);      const minVal = await window.cyberNotesAPI.getSetting('minimize_to_tray');
      const mtt = minVal === 'true';
      setMinimizeToTray(mtt);
      const suiteVal = await window.cyberNotesAPI.getSetting('show_suite_promo');
      setShowSuitePromo(suiteVal !== 'false');
      const usageVal = await window.cyberNotesAPI.getSetting('usage_stats_enabled');
      setUsageStatsOn(usageVal !== 'false');
      const usageExpandedVal = await window.cyberNotesAPI.getSetting('usage_stats_expanded');
      if (usageExpandedVal === 'true') setUsageExpanded(true);
      const isAutoStart = await window.cyberNotesAPI.getAutoStart();
      setAutoStart(isAutoStart);
      const hkVal = await window.cyberNotesAPI.getSetting('toggle_hotkey');
      const legacyHk = await window.cyberNotesAPI.getSetting('toggle_hotkey_enabled');
      let currentHk = 'Alt+Shift+N';
      if (hkVal !== null) {
        currentHk = hkVal === 'disabled' ? '' : hkVal;
      } else if (legacyHk === 'false') {
        currentHk = '';
      }
      setToggleHotkey(currentHk);

      const sStickyRestore = await window.cyberNotesAPI.getSetting('sticky_restore_on_startup');
      setStickyRestoreOnStartup(sStickyRestore !== 'false');
      const sStickySkip = await window.cyberNotesAPI.getSetting('sticky_skip_taskbar');
      setStickySkipTaskbar(sStickySkip !== 'false');
      const sStickyLock = await window.cyberNotesAPI.getSetting('sticky_lock_action');
      setStickyLockAction((sStickyLock as any) || 'hide');
      const dismissedConfirmations = await window.cyberNotesAPI.getSettings([...DISMISSIBLE_CONFIRMATION_KEYS]);
      setDismissedConfirmationCount(
        DISMISSIBLE_CONFIRMATION_KEYS.filter((key) => dismissedConfirmations[key] === 'true').length
      );

      const backupSettings = await window.cyberNotesAPI.getSettings([
        'auto_backup_enabled', 'auto_backup_hours', 'auto_backup_keep', 'auto_backup_last',
      ]);
      setAutoBackupEnabled(backupSettings.auto_backup_enabled !== 'false');
      if (backupSettings.auto_backup_hours) setAutoBackupHours(backupSettings.auto_backup_hours);
      if (backupSettings.auto_backup_keep) setAutoBackupKeep(backupSettings.auto_backup_keep);
      setAutoBackupLast(backupSettings.auto_backup_last);

      initialSnapshotRef.current = JSON.stringify({
        language, currentTheme, colorIntensity, bgImage, glassBlur, bgOpacity,
        autoLockMinutes, rememberLastNote, showLineCounter, showLineGutter,
        autosaveEnabled, autoUnlockCapsLock, autoUnlockCapsLockTimeout,
        capsLockSound, capsLockSoundScope, tabsWidthMode, editorFont, showMinimap, showWordCounter,
        closeToTray: ctt, minimizeToTray: mtt, autoStart: isAutoStart, toggleHotkey: currentHk,
        stickyRestoreOnStartup: sStickyRestore !== 'false',
        stickySkipTaskbar: sStickySkip !== 'false',
        stickyLockAction: (sStickyLock as any) || 'hide'
      });
      setLoaded(true);
    };
    loadSettings();
  }, []);

  useEffect(() => {
    if (!loaded || !initialSnapshotRef.current) return;
    const currentSnapshot = JSON.stringify({
      language, currentTheme, colorIntensity, bgImage, glassBlur, bgOpacity,
      autoLockMinutes, rememberLastNote, showLineCounter, showLineGutter,
      autosaveEnabled, autoUnlockCapsLock, autoUnlockCapsLockTimeout,
      capsLockSound, capsLockSoundScope, tabsWidthMode, editorFont, showMinimap, showWordCounter,
      closeToTray, minimizeToTray, autoStart, toggleHotkey,
      stickyRestoreOnStartup, stickySkipTaskbar, stickyLockAction
    });
    if (currentSnapshot !== initialSnapshotRef.current) {
      setHasSavedChanges(true);
    }
  }, [
    loaded,
    language, currentTheme, colorIntensity, bgImage, glassBlur, bgOpacity,
    autoLockMinutes, rememberLastNote, showLineCounter, showLineGutter,
    autosaveEnabled, autoUnlockCapsLock, autoUnlockCapsLockTimeout,
    capsLockSound, capsLockSoundScope, tabsWidthMode, editorFont, showMinimap, showWordCounter,
    closeToTray, minimizeToTray, autoStart, toggleHotkey,
    stickyRestoreOnStartup, stickySkipTaskbar, stickyLockAction
  ]);

  useEffect(() => {
    if (!isCapturingHotkey) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (hotkeyInputRef.current && !hotkeyInputRef.current.contains(e.target as Node)) {
        setIsCapturingHotkey(false);
        setHotkeyPreview(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isCapturingHotkey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (dialog) return;
      if (isCapturingHotkey) return;

      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Enter') {
        const target = e.target as HTMLElement | null;
        const isTextInput = target && (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        );
        if (isTextInput) return;

        // If focus is specifically on an explicit action button (.btn), let Enter trigger that button
        if (target && target.tagName === 'BUTTON' && target.classList.contains('btn')) {
          return;
        }

        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isCapturingHotkey, dialog]);

  const navItems: { id: Tab; label: string; icon: ReactNode; separator?: boolean }[] = [
    { id: 'general', label: language === 'es' ? 'General' : 'General', icon: <SlidersHorizontal size={13} /> },
    { id: 'appearance', label: language === 'es' ? 'Apariencia' : 'Appearance', icon: <Palette size={13} /> },
    { id: 'security', label: language === 'es' ? 'Seguridad' : 'Security', icon: <Shield size={13} /> },
    { id: 'maintenance', label: language === 'es' ? 'Respaldo y Datos' : 'Backup & Data', icon: <Database size={13} /> },
    { id: 'stats', label: language === 'es' ? 'Estadísticas' : 'Statistics', icon: <BarChart3 size={13} />, separator: true },
  ];

  const handleToggleTray = async (val: boolean) => {
    setCloseToTray(val);
    await window.cyberNotesAPI.setSetting('close_to_tray', val.toString());
  };

  const handleToggleMinimizeToTray = async (val: boolean) => {
    setMinimizeToTray(val);
    await window.cyberNotesAPI.setSetting('minimize_to_tray', val.toString());
  };

  const handleToggleAutoStart = async (val: boolean) => {
    setAutoStart(val);
    await window.cyberNotesAPI.setAutoStart(val);
  };

  const handleSetHotkey = async (val: string) => {
    setHotkeyError(null);
    setHotkeyPreview(null);
    setToggleHotkey(val);
    await window.cyberNotesAPI.setSetting('toggle_hotkey', val.trim() || 'disabled');
    await window.cyberNotesAPI.setSetting('toggle_hotkey_enabled', val.trim() ? 'true' : 'false');
  };

  const handleClearHotkey = async () => {
    setHotkeyError(null);
    setHotkeyPreview(null);
    setToggleHotkey('');
    setIsCapturingHotkey(false);
    await window.cyberNotesAPI.setSetting('toggle_hotkey', 'disabled');
    await window.cyberNotesAPI.setSetting('toggle_hotkey_enabled', 'false');
  };

  const handleRestoreHotkey = async () => {
    setIsCapturingHotkey(false);
    await handleSetHotkey(DEFAULT_TOGGLE_HOTKEY);
  };

  /** Texto en vivo de los modificadores retenidos durante la captura. */
  const formatHeldHotkeyPreview = (e: React.KeyboardEvent<HTMLInputElement>): string | null => {
    const mods: string[] = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Meta');
    if (mods.length === 0) return null;
    return `${mods.join(' + ')} + …`;
  };

  const handleHotkeyKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isCapturingHotkey) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.key === 'Escape') {
      setHotkeyError(null);
      setHotkeyPreview(null);
      setIsCapturingHotkey(false);
      return;
    }

    if (e.key === 'Backspace' || e.key === 'Delete') {
      handleClearHotkey();
      return;
    }

    const modKeys = ['Control', 'Alt', 'Shift', 'Meta', 'OS'];
    if (modKeys.includes(e.key)) {
      setHotkeyPreview(formatHeldHotkeyPreview(e));
      return;
    }

    const mods: string[] = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    if (e.metaKey) mods.push('Meta');

    let key = e.key;
    if (key.length === 1) key = key.toUpperCase();
    else if (key.startsWith('Arrow')) key = key.replace('Arrow', '');
    else if (key === ' ') key = 'Space';

    // Un atajo global sin Ctrl/Alt/Win secuestra teclas de todas las apps.
    // Shift solo se acepta con teclas no imprimibles (F1-F12, flechas, etc.).
    const hasStrongModifier = e.ctrlKey || e.altKey || e.metaKey;
    const isNonPrintable = /^(F\d{1,2}|Up|Down|Left|Right|Home|End|PageUp|PageDown|Insert|Tab|Enter|Space)$/.test(key);
    if (!hasStrongModifier && !isNonPrintable) {
      setHotkeyError(language === 'es'
        ? 'Agrega Ctrl, Alt o Win: Shift solo no vale para un atajo global.'
        : 'Add Ctrl, Alt or Win: Shift alone is not valid for a global shortcut.');
      return;
    }

    const parts = mods.concat(key);
    const acc = parts.join('+');
    handleSetHotkey(acc);
    setIsCapturingHotkey(false);
  };

  const handleHotkeyKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isCapturingHotkey) return;
    setHotkeyPreview(formatHeldHotkeyPreview(e));
  };

  const handleSetPassword = async () => {
    setPwdMessage('');
    setPwdError(false);

    const isPin = authMethod === 'pin';
    if (isPin) {
      if (!/^\d{4,8}$/.test(newPwd.trim())) {
        setPwdMessage(language === 'es' ? 'El PIN debe tener de 4 a 8 dígitos' : 'PIN must be 4 to 8 digits');
        setPwdError(true);
        return;
      }
    } else if (newPwd.length < 4) {
      setPwdMessage(language === 'es' ? 'La contraseña debe tener al menos 4 caracteres' : 'Password must be at least 4 characters long');
      setPwdError(true);
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdMessage(language === 'es' ? 'Las contraseñas no coinciden' : 'Passwords do not match');
      setPwdError(true);
      return;
    }

    setPwdLoading(true);
    try {
      // Verificar contraseña actual si existe
      const hasPassword = await window.cyberNotesAPI.hasPassword();
      if (hasPassword) {
        if (!currentPwd) {
          setPwdMessage(language === 'es' ? 'Ingresa tu contraseña actual' : 'Enter your current password');
          setPwdError(true);
          return;
        }
        const ok = await window.cyberNotesAPI.verifyPassword(currentPwd);
        if (!ok) {
          setPwdMessage(language === 'es' ? 'Contraseña actual incorrecta' : 'Incorrect current password');
          setPwdError(true);
          return;
        }
      }

      // Mismo método y mismo secreto: no hay nada que cambiar (y no se
      // genera otro código). Cambiar de método con el mismo secreto sí procede.
      const candidate = authMethod === 'pin' ? newPwd.trim() : newPwd;
      if (storedMethod === authMethod && hasPassword && await window.cyberNotesAPI.verifyPassword(candidate)) {
        setPwdMessage(authMethod === 'pin'
          ? (language === 'es' ? 'Ya estás usando este PIN' : 'Already using this PIN')
          : (language === 'es' ? 'Ya estás usando esta contraseña' : 'Already using this password'));
        setPwdError(false);
        setCurrentPwd('');
        setNewPwd('');
        setConfirmPwd('');
        setPwdLoading(false);
        return;
      }

      const saved = await window.cyberNotesAPI.setPassword(newPwd, authMethod);
      if (!saved) {
        setPwdMessage(language === 'es' ? 'No se pudo guardar (revisa el formato)' : 'Could not save (check the format)');
        setPwdError(true);
        return;
      }
      setStoredMethod(authMethod);
      setHasPassword(true);
      setPwdMessage(language === 'es' ? '✓ Contraseña guardada correctamente' : '✓ Password saved successfully');
      setHasSavedChanges(true);
      setPwdError(false);
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      // Sin código de recuperación: mostrarlo en grande de una vez, como CyberPaste.
      const hasCode = await window.cyberNotesAPI.hasRecoveryCode?.().catch(() => false);
      setRecHas(!!hasCode);
      if (!hasCode) {
        try {
          const code = await window.cyberNotesAPI.generateRecoveryCode();
          setRecCode(code);
          setRecAck(false);
          setRecDialogMode('first');
          setShowRecDialog(true);
        } catch {
          /* el centro de recuperación de la tarjeta queda disponible */
        }
      }
    } catch {
      setPwdMessage(language === 'es' ? 'Error al guardar la contraseña' : 'Error saving password');
      setPwdError(true);
    } finally {
      setPwdLoading(false);
    }
  };

  const handleRemovePassword = async () => {
    const proceed = await showDialog({
      variant: 'warning',
      confirm: true,
      title: language === 'es' ? 'Eliminar contraseña' : 'Remove password',
      message: language === 'es' ? '¿Eliminar la contraseña de acceso? La app quedará sin protección.' : 'Remove lock password? The app will no longer be protected.',
      confirmLabel: language === 'es' ? 'Eliminar' : 'Remove',
    });
    if (!proceed) return;
    const ok = await window.cyberNotesAPI.verifyPassword(currentPwd);
    if (!ok) {
      setPwdMessage(language === 'es' ? 'Contraseña actual incorrecta' : 'Incorrect current password');
      setPwdError(true);
      return;
    }
    await window.cyberNotesAPI.removePassword();
    setHasPassword(false);
    setStoredMethod(null);
    setRecHas(false);
    setRecCode(null);
    setRecAck(false);
    setRecHint('');
    setPwdMessage(language === 'es' ? '✓ Contraseña eliminada' : '✓ Password removed');
    setHasSavedChanges(true);
    setPwdError(false);
    setCurrentPwd('');
  };

  const handleGenerateRecoveryCode = async () => {
    setRecMessage('');
    setRecError(false);
    // El código abre la app entera: si hay contraseña, exigirla primero.
    if (hasPassword) {
      if (!currentPwd) {
        setRecMessage(language === 'es' ? 'Ingresa tu contraseña actual primero' : 'Enter your current password first');
        setRecError(true);
        return;
      }
      const ok = await window.cyberNotesAPI.verifyPassword(currentPwd);
      if (!ok) {
        setRecMessage(language === 'es' ? 'Contraseña actual incorrecta' : 'Incorrect current password');
        setRecError(true);
        return;
      }
    }
    setRecLoading(true);
    try {
      const code = await window.cyberNotesAPI.generateRecoveryCode();
      setRecCode(code);
      setRecAck(false);
      setRecDialogMode(recHas ? 'regen' : 'first');
      setShowRecDialog(true);
    } catch {
      setRecMessage(language === 'es' ? 'No se pudo generar el código' : 'Could not generate the code');
      setRecError(true);
    } finally {
      setRecLoading(false);
    }
  };

  const handleSaveRecoveryCode = async (): Promise<boolean> => {
    if (!recCode || !recAck) return false;
    setRecLoading(true);
    try {
      const ok = await window.cyberNotesAPI.setRecoveryCode(recCode);
      if (!ok) throw new Error('save failed');
      setRecHas(true);
      setRecCode(null);
      setRecAck(false);
      setRecMessage(language === 'es' ? '✓ Código de recuperación guardado' : '✓ Recovery code saved');
      setRecError(false);
      setHasSavedChanges(true);
      return true;
    } catch {
      setRecMessage(language === 'es' ? 'Error al guardar el código' : 'Error saving the code');
      setRecError(true);
      return false;
    } finally {
      setRecLoading(false);
    }
  };

  const handleCopyRecoveryCode = async () => {
    if (!recCode) return;
    try {
      await navigator.clipboard.writeText(recCode);
      setRecMessage(language === 'es' ? '✓ Código copiado' : '✓ Code copied');
      setRecError(false);
    } catch {
      /* portapapeles no disponible: el código sigue visible para copiarlo a mano */
    }
  };

  const handleSaveHint = async () => {
    setRecLoading(true);
    try {
      await window.cyberNotesAPI.setSetting('password_hint', recHint.trim());
      setRecMessage(language === 'es' ? '✓ Pista guardada' : '✓ Hint saved');
      setRecError(false);
      setHasSavedChanges(true);
    } catch {
      setRecMessage(language === 'es' ? 'Error al guardar la pista' : 'Error saving the hint');
      setRecError(true);
    } finally {
      setRecLoading(false);
    }
  };

  return (
    <>
    <div className="panel-overlay" onClick={onClose}>
      <div
        className="panel settings-panel"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={language === 'es' ? 'Ajustes' : 'Settings'}
      >
        <div className="settings-header">
          <div className="settings-header-title">
            <Settings size={15} />
            <span>{language === 'es' ? 'Ajustes' : 'Settings'}</span>
          </div>
          <Tooltip label={language === 'es' ? 'Cerrar' : 'Close'} placement="bottom">
          <button
            type="button"
            className="settings-header-close"
            onClick={onClose}
            aria-label={language === 'es' ? 'Cerrar' : 'Close'}
          >
            <X size={15} />
          </button>
          </Tooltip>
        </div>
        <div className="settings-layout">
          <aside className="settings-nav">
            <div className="settings-nav-items">
              {navItems.map(item => (
                <Fragment key={item.id}>
                  {item.separator && (
                    <div style={{ height: 1, background: 'var(--border)', margin: '6px 10px', opacity: 0.7 }} />
                  )}
                  <button
                    type="button"
                    className={`settings-nav-btn${tab === item.id ? ' active' : ''}`}
                    onClick={() => setTab(item.id)}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                </Fragment>
              ))}
            </div>
            <div className="settings-nav-footer">
              {hasSavedChanges && (
                <div className="config-autosave-pill" aria-live="polite">
                  <span className="config-autosave-dot" aria-hidden="true" />
                  <span>{language === 'es' ? 'Guardado' : 'Saved'}</span>
                </div>
              )}
              <button type="button" className="settings-nav-close" onClick={onClose}>
                <span>{language === 'es' ? 'Cerrar' : 'Close'}</span>
                <svg className="config-close-enter" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 10.5 L7 5.2 L4.8 9 L14.6 9 L14.6 2.5 L17.4 2.5 L17.4 9 A2.8 2.8 0 0 1 14.6 11.8 L4.8 11.8 L7 15.8 Z" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>
          </aside>

          <div className="settings-content">

          {/* ── GENERAL ── */}
          {tab === 'general' && (
            <>
            <div className="settings-card settings-general-card">
                <SettingsHeading icon={<SlidersHorizontal />}>
                  {language === 'es' ? 'Preferencias' : 'Preferences'}
                </SettingsHeading>
                <div className="settings-general-stack" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Language Selector Dropdown */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    gap: 12
                  }}>
                    <SettingsOptionCopy icon={<Languages />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {language === 'es' ? 'Idioma de la interfaz' : 'Interface Language'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {language === 'es' ? 'Selecciona tu idioma preferido para toda la aplicación' : 'Select your preferred language for the application UI'}
                      </span>
                    </SettingsOptionCopy>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, position: 'relative' }}>
                      <Languages size={15} style={{ color: 'var(--accent)', opacity: 0.8 }} />
                      <select 
                        value={language}
                        onChange={(e) => onLanguageChange(e.target.value as Language)}
                        className="input"
                        style={{
                          background: 'var(--bg-app)',
                          cursor: 'pointer',
                          padding: '6px 12px',
                          fontSize: 12,
                          width: 120,
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)'
                        }}
                      >
                        <option value="es">Español</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                  </div>

                  {/* Welcome name */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    gap: 16,
                  }}>
                    <SettingsOptionCopy icon={<Type />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {language === 'es' ? 'Nombre para saludos' : 'Greeting name'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {language === 'es'
                          ? 'Se usará para personalizar los saludos de CyberNotes'
                          : 'Used to personalize CyberNotes greetings'}
                      </span>
                    </SettingsOptionCopy>
                    <div style={{ flex: '0 0 auto', alignSelf: 'stretch', display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                    <input
                      className="input"
                      value={displayName || ''}
                      onChange={event => { void onDisplayNameChange?.(event.target.value); }}
                      placeholder={language === 'es' ? 'Tu nombre' : 'Your name'}
                      aria-label={language === 'es' ? 'Nombre para saludos' : 'Greeting name'}
                      style={{
                        width: 180,
                        maxWidth: '100%',
                        height: 32,
                        minHeight: 32,
                        maxHeight: 32,
                        background: 'var(--bg-app)',
                        padding: '7px 10px',
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    />
                    </div>
                  </div>

                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer'
                  }} onClick={() => handleToggleTray(!closeToTray)}>
                    <SettingsOptionCopy icon={<Archive />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Cerrar a la bandeja de sistema' : 'Close to system tray'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Al presionar X, la app se mantendrá activa en la bandeja' : 'Pressing X keeps the app active in the system tray'}</span>
                    </SettingsOptionCopy>
                    <div className={`custom-switch ${closeToTray ? 'active' : ''}`} />
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer'
                  }} onClick={() => handleToggleMinimizeToTray(!minimizeToTray)}>
                    <SettingsOptionCopy icon={<Minus />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Minimizar a la bandeja de sistema' : 'Minimize to system tray'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Al minimizar, ocultar la app de la barra de tareas' : 'Minimizing hides the app from the taskbar'}</span>
                    </SettingsOptionCopy>
                    <div className={`custom-switch ${minimizeToTray ? 'active' : ''}`} />
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer'
                  }} onClick={() => handleToggleSuitePromo(!showSuitePromo)}>
                    <SettingsOptionCopy icon={<Sparkles />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Recomendaciones de la suite' : 'Suite recommendations'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Tira en Acerca de y entrada en el menú de bandeja' : 'About strip and tray menu entry'}</span>
                    </SettingsOptionCopy>
                    <div className={`custom-switch ${showSuitePromo ? 'active' : ''}`} />
                  </label>

                  {(closeToTray || minimizeToTray) && (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => onOpenTrayPin?.(false)}
                      style={{
                        padding: '9px 14px',
                        fontSize: 12,
                        gap: 8,
                        justifyContent: 'flex-start',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-surface)',
                      }}
                    >
                      <Pin size={14} style={{ color: 'var(--accent)' }} />
                      <span>{language === 'es' ? 'Mantener visible en la bandeja del sistema...' : 'Keep visible in the system tray...'}</span>
                    </button>
                  )}

                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer'
                  }} onClick={() => handleToggleAutoStart(!autoStart)}>
                    <SettingsOptionCopy icon={<Power />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Iniciar con Windows (minimizado)' : 'Start with Windows (minimized)'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'La app se abrirá en la bandeja al arrancar el equipo' : 'The app starts minimized to tray on system boot'}</span>
                    </SettingsOptionCopy>
                    <div className={`custom-switch ${autoStart ? 'active' : ''}`} />
                  </label>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}>
                    <SettingsOptionCopy icon={<ShieldCheck />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {language === 'es' ? 'Avisos omitidos' : 'Dismissed warnings'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {language === 'es'
                          ? 'Vuelve a mostrar las confirmaciones que marcaste como no mostrar más'
                          : 'Show again the confirmations you chose not to display'}
                      </span>
                    </SettingsOptionCopy>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleRestoreDismissedConfirmations}
                      disabled={dismissedConfirmationCount === 0}
                      style={{
                        gap: 7,
                        fontSize: 'calc(12px * var(--ui-scale))',
                        flexShrink: 0,
                        padding: '7px 11px',
                        border: restoreNoticesFeedback
                          ? '1px solid color-mix(in srgb, var(--success) 55%, transparent)'
                          : '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)',
                        background: restoreNoticesFeedback
                          ? 'color-mix(in srgb, var(--success) 14%, transparent)'
                          : 'var(--bg-surface)',
                        color: restoreNoticesFeedback ? 'var(--success)' : undefined,
                        boxShadow: restoreNoticesFeedback
                          ? '0 0 12px color-mix(in srgb, var(--success) 30%, transparent)'
                          : undefined,
                      }}
                    >
                      {restoreNoticesFeedback ? <Check size={14} /> : <RotateCcw size={14} />}
                      {restoreNoticesFeedback
                        ? (language === 'es' ? 'Avisos restaurados' : 'Warnings restored')
                        : (language === 'es' ? 'Restaurar avisos' : 'Restore warnings')}
                    </button>
                  </div>

                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}>
                    <SettingsOptionCopy icon={<Keyboard />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {language === 'es' ? 'Atajo global de ventana' : 'Global window shortcut'}
                      </span>
                      <span style={{ fontSize: 11, color: hotkeyError ? 'var(--danger)' : 'var(--text-muted)' }}>
                        {hotkeyError ?? (language === 'es'
                          ? 'Atajo global para mostrar/ocultar CyberNotes. Clic para asignar, Esc para cancelar.'
                          : 'Global shortcut to show/hide CyberNotes. Click to set, Esc to cancel.')}
                      </span>
                    </SettingsOptionCopy>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <input
                        ref={hotkeyInputRef}
                        type="text"
                        readOnly
                        value={isCapturingHotkey ? (hotkeyPreview ?? '') : (toggleHotkey || '')}
                        placeholder={
                          isCapturingHotkey
                            ? (language === 'es' ? 'Pulsa las teclas…' : 'Press keys…')
                            : (toggleHotkey ? toggleHotkey : (language === 'es' ? 'Desactivado' : 'Disabled'))
                        }
                        onClick={() => { setHotkeyError(null); setHotkeyPreview(null); setIsCapturingHotkey(true); }}
                        onKeyDown={handleHotkeyKeyDown}
                        onKeyUp={handleHotkeyKeyUp}
                        style={{
                          background: 'var(--bg-app)',
                          color: toggleHotkey ? 'var(--accent-light)' : 'var(--text-muted)',
                          border: isCapturingHotkey ? '1px solid var(--accent)' : '1px solid var(--border)',
                          padding: '6px 10px',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11.5,
                          fontWeight: 600,
                          minWidth: 120,
                          maxWidth: 160,
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          textAlign: 'center',
                          letterSpacing: '0.04em',
                          outline: 'none',
                          boxShadow: isCapturingHotkey ? '0 0 12px var(--accent-glow)' : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={handleRestoreHotkey}
                        title={`${language === 'es' ? 'Restaurar predeterminada' : 'Restore default'} (${DEFAULT_TOGGLE_HOTKEY})`}
                        style={{
                          fontSize: 11.5,
                          padding: '6px 8px',
                          color: 'var(--text-muted)',
                          background: 'var(--bg-app)',
                          border: '1px solid var(--border)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        <RotateCcw size={14} />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={handleClearHotkey}
                        title={language === 'es' ? 'Limpiar atajo' : 'Clear shortcut'}
                        style={{
                          fontSize: 11.5,
                          padding: '6px 10px',
                          color: 'var(--text-muted)',
                          background: 'var(--bg-app)',
                          border: '1px solid var(--border)',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-primary)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                      >
                        {language === 'es' ? 'Limpiar' : 'Clear'}
                      </button>
                    </div>
                  </div>

                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer'
                  }} onClick={() => onRememberLastNoteChange(!rememberLastNote)}>
                    <SettingsOptionCopy icon={<Rows3 />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Restaurar sesión de pestañas' : 'Restore latest tabs session'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'La app se reabrirá con todas tus pestañas y la nota activa de la sesión anterior' : 'The app reopens with all your tabs and active note from the last session'}</span>
                    </SettingsOptionCopy>
                    <div className={`custom-switch ${rememberLastNote ? 'active' : ''}`} />
                  </label>

                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer'
                  }} onClick={() => onAutosaveEnabledChange(!autosaveEnabled)}>
                    <SettingsOptionCopy icon={<Save />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Autoguardado' : 'Autosave'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Guardar automáticamente al editar. Si se desactiva, usa el botón Guardar en el editor.' : 'Save changes automatically as you type. If disabled, save changes manually.'}</span>
                    </SettingsOptionCopy>
                    <div 
                      className={`custom-switch ${autosaveEnabled ? 'active' : ''}`}
                    />
                  </label>

                  <div style={{
                    display: 'flex', 
                    flexDirection: 'column',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    gap: 12,
                  }}>
                    <label
                      className="settings-caps-lock-toggle-row"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        width: '100%',
                      }}
                    >
                      <SettingsOptionCopy icon={<Keyboard />}>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Desactivar Bloq Mayús por inactividad' : 'Auto-unlock Caps Lock on inactivity'}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Desactiva físicamente el Bloq Mayús tras un periodo ajustable de inactividad de teclado en el editor' : 'Physically turns off Caps Lock after a configurable period of keyboard inactivity in the editor'}</span>
                      </SettingsOptionCopy>
                      <div 
                        className={`custom-switch ${autoUnlockCapsLock ? 'active' : ''}`}
                        onClick={() => onAutoUnlockCapsLockChange(!autoUnlockCapsLock)}
                        style={{ flexShrink: 0 }}
                      />
                    </label>

                    {autoUnlockCapsLock && (
                      <div
                        className="settings-caps-lock-details"
                        style={{
                          marginTop: 4,
                          padding: '10px 14px',
                          background: 'var(--bg-notelist)',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                            <Clock3 size={13} aria-hidden="true" />
                            {language === 'es' ? 'Tiempo de inactividad' : 'Inactivity timeout'}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--accent-light)', fontWeight: 700 }}>
                            {(() => {
                              const CAPS_LOCK_STEPS = [5, 10, 15, 30, 45, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
                              const CAPS_LOCK_LABELS = language === 'es' 
                                ? ['5s', '10s', '15s', '30s', '45s', '1m', '2m', '5m', '10m', '15m', '30m', '1h', '2h', '3h', '6h', '12h', '24h'] 
                                : ['5s', '10s', '15s', '30s', '45s', '1m', '2m', '5m', '10m', '15m', '30m', '1h', '2h', '3h', '6h', '12h', '24h'];
                              const idx = CAPS_LOCK_STEPS.indexOf(autoUnlockCapsLockTimeout);
                              return idx !== -1 ? CAPS_LOCK_LABELS[idx] : '8s';
                            })()}
                          </span>
                        </div>
                        <input 
                          type="range"
                          min="0"
                          max="16"
                          step="1"
                          value={(() => {
                            const CAPS_LOCK_STEPS = [5, 10, 15, 30, 45, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
                            const idx = CAPS_LOCK_STEPS.indexOf(autoUnlockCapsLockTimeout);
                            return idx !== -1 ? idx : 1;
                          })()}
                          onChange={(e) => {
                            const CAPS_LOCK_STEPS = [5, 10, 15, 30, 45, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
                            const idx = parseInt(e.target.value);
                            onAutoUnlockCapsLockTimeoutChange(CAPS_LOCK_STEPS[idx]);
                          }}
                          style={{ width: '100%', accentColor: 'var(--accent)', cursor: 'pointer' }}
                        />

                        {/* Sound Selection */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                            <Volume2 size={13} aria-hidden="true" />
                            {language === 'es' ? 'Sonido de Bloq Mayús' : 'Caps Lock Sound'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select 
                            value={capsLockSound}
                            onChange={(e) => onCapsLockSoundChange(e.target.value)}
                            className="input"
                            style={{ flex: 1, fontSize: 12, background: 'var(--bg-app)', cursor: 'pointer' }}
                          >
                            <option value="off">{language === 'es' ? 'Silenciar (Sin sonido)' : 'Muted (No sound)'}</option>
                            <option value="mechanical-click">{language === 'es' ? 'Click Mecánico ⌨️' : 'Mechanical Click ⌨️'}</option>
                            <option value="cyber-beep">{language === 'es' ? 'Chirp Cyber-Beep 🔊' : 'Cyber-Beep Chirp 🔊'}</option>
                            <option value="digital-chime">{language === 'es' ? 'Chime Digital 🎵' : 'Digital Chime 🎵'}</option>
                            <option value="glitch-blip">{language === 'es' ? 'Blip de Glitch ⚡' : 'Glitch Blip ⚡'}</option>
                          </select>
                          <button
                            className="btn btn-ghost"
                            onClick={() => playSynthSound(capsLockSound)}
                            style={{ gap: 4, fontSize: 12, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}
                            title={language === 'es' ? 'Probar sonido' : 'Test sound'}
                          >
                            <Volume2 size={14} />
                            {language === 'es' ? 'Escuchar' : 'Preview'}
                          </button>
                        </div>

                        {/* Sound Scope Selection */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-secondary)' }}>
                            <Volume2 size={13} aria-hidden="true" />
                            {language === 'es' ? 'Ámbito del sonido' : 'Sound Scope'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <select 
                            value={capsLockSoundScope}
                            onChange={(e) => onCapsLockSoundScopeChange(e.target.value)}
                            className="input"
                            style={{ flex: 1, fontSize: 12, background: 'var(--bg-app)', cursor: 'pointer' }}
                          >
                            <option value="app">{language === 'es' ? 'Solo dentro de la app 📱' : 'Only inside the app 📱'}</option>
                            <option value="global">{language === 'es' ? 'Global en el sistema 🌍' : 'Global in the system 🌍'}</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
            </div>
            <div className="settings-card settings-floating-card">
              <SettingsHeading icon={<StickyNote />}>
                {language === 'es' ? 'Notas flotantes' : 'Floating Notes'}
              </SettingsHeading>
              <div className="settings-option-stack">
                <label className="settings-option-row" onClick={() => handleToggleStickyRestore(!stickyRestoreOnStartup)}>
                  <SettingsOptionCopy icon={<History />}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {language === 'es' ? 'Restaurar notas flotantes al iniciar' : 'Restore floating notes on startup'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {language === 'es' ? 'Vuelve a abrir en el escritorio las notas flotantes que estaban activas al cerrar' : 'Reopens active desktop floating notes when CyberNotes starts'}
                    </span>
                  </SettingsOptionCopy>
                  <div className={`custom-switch ${stickyRestoreOnStartup ? 'active' : ''}`} />
                </label>

                <label className="settings-option-row" onClick={() => handleToggleStickySkipTaskbar(!stickySkipTaskbar)}>
                  <SettingsOptionCopy icon={<LayoutGrid />}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {language === 'es' ? 'Notas flotantes en modo widget' : 'Floating notes as desktop widgets'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {language === 'es' ? 'Oculta las notas flotantes de la barra de tareas para no saturarla' : 'Hides floating notes from the taskbar to avoid cluttering it'}
                    </span>
                  </SettingsOptionCopy>
                  <div className={`custom-switch ${stickySkipTaskbar ? 'active' : ''}`} />
                </label>

                <div className="settings-option-row">
                  <SettingsOptionCopy icon={<ShieldCheck />}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {language === 'es' ? 'Bloqueo de notas flotantes' : 'Floating notes session lock action'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {language === 'es'
                        ? 'Elige si las notas se ocultan o permanecen visibles con una capa opaca desenfocada mientras CyberNotes está bloqueado.'
                        : 'Choose whether notes are hidden or remain visible behind an opaque, blurred layer while CyberNotes is locked.'}
                    </span>
                  </SettingsOptionCopy>
                  <select
                    value={stickyLockAction}
                    onChange={(e) => handleChangeStickyLockAction(e.target.value as 'hide' | 'shield')}
                    className="input settings-option-select"
                  >
                    <option value="hide">{language === 'es' ? 'Ocultar mientras esté bloqueado' : 'Hide while locked'}</option>
                    <option value="shield">{language === 'es' ? 'Mantener visibles con una capa opaca desenfocada' : 'Keep visible with an opaque, blurred layer'}</option>
                  </select>
                </div>
              </div>
            </div>
            </>
          )}

          {/* ── APPEARANCE ── */}
          {tab === 'appearance' && (
            <>
            <div className="settings-card">
                <SettingsHeading icon={<Palette />}>
                  {language === 'es' ? 'Tema visual' : 'Visual Theme'}
                </SettingsHeading>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {THEMES.map(theme => {
                    const isCurrent = currentTheme === theme.id;
                    const ledColor = getPreviewColor(theme.id, isCurrent ? colorIntensity : 65);
                    const themeName = language === 'es' ? (theme.nameEs || theme.name) : (theme.nameEn || theme.name);

  return (
                      <button
                        key={theme.id}
                        onClick={() => onThemeChange(theme.id as ThemeId)}
                        style={{
                          padding: '13px 16px',
                          borderRadius: 'var(--radius-md)',
                          border: isCurrent ? `2px solid var(--accent)` : '1px solid var(--border)',
                          background: isCurrent ? 'var(--accent-dim)' : 'var(--bg-surface)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          transition: 'all var(--transition)',
                          boxShadow: isCurrent ? '0 0 14px var(--accent-glow)' : 'none',
                        }}
                      >
                        {/* Hardware LED socket */}
                        <div style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.08), rgba(0, 0, 0, 0.5))',
                          border: isCurrent ? `1.5px solid ${ledColor}88` : '1px solid rgba(255, 255, 255, 0.12)',
                          boxShadow: isCurrent
                            ? `0 0 12px ${ledColor}40, inset 0 2px 4px rgba(0, 0, 0, 0.7)`
                            : 'inset 0 2px 4px rgba(0, 0, 0, 0.6)',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {/* Noticeably large illuminated LED diode (16px vs 8px in tabs) */}
                          <span
                            style={{
                              width: 16,
                              height: 16,
                              borderRadius: '50%',
                              background: `radial-gradient(circle at 35% 35%, #ffffff 0%, ${ledColor} 46%, rgba(0, 0, 0, 0.6) 100%)`,
                              boxShadow: isCurrent
                                ? `0 0 16px ${ledColor}, 0 0 6px ${ledColor}, inset 0 1px 2px rgba(255, 255, 255, 0.95)`
                                : `0 0 8px ${ledColor}aa, inset 0 1px 1.5px rgba(255, 255, 255, 0.65)`,
                              border: '1px solid rgba(255, 255, 255, 0.3)',
                              display: 'inline-block',
                              flexShrink: 0,
                              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                            }}
                          />
                        </div>
                        <div style={{ textAlign: 'left', minWidth: 0, flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {themeName}
                          </div>
                          <div style={{ fontSize: 11, color: isCurrent ? 'var(--accent-light)' : 'var(--text-muted)' }}>
                            {isCurrent ? (language === 'es' ? '● Activo' : '● Active') : (language === 'es' ? 'Click para activar' : 'Click to activate')}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
            </div>

            <div className="settings-card">
                <SettingsHeading icon={<Droplets />}>
                  {language === 'es' ? 'Intensidad de color' : 'Color Intensity'}
                </SettingsHeading>
              <div style={{
                opacity: isColorfulTheme(currentTheme) ? 1 : 0.4,
                pointerEvents: isColorfulTheme(currentTheme) ? 'auto' : 'none',
                transition: 'opacity var(--transition)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Intensidad' : 'Intensity'}</span>
                  <span style={{ fontSize: 13, color: 'var(--accent-light)', fontWeight: 700, background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 4 }}>
                    {colorIntensity}%
                  </span>
                </div>
                <input 
                  type="range" min="0" max="100" step="5" 
                  value={colorIntensity}
                  onChange={(e) => onIntensityChange(parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  <span>{language === 'es' ? 'Suave' : 'Soft'}</span>
                  <span>{language === 'es' ? 'Intenso' : 'Vibrant'}</span>
                </div>
                {!isColorfulTheme(currentTheme) && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8, fontStyle: 'italic' }}>
                    {language === 'es' ? `No aplica para ${currentTheme === 'graphite' ? 'Graphite' : 'Light'}` : `Not applicable for ${currentTheme === 'graphite' ? 'Graphite' : 'Light'}`}
                  </div>
                )}
              </div>
            </div>

            <div className="settings-card">
                <SettingsHeading icon={<Image />}>
                  {language === 'es' ? 'Fondo Personalizado' : 'Custom Background'}
                </SettingsHeading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{
                      width: 80,
                      height: 50,
                      borderRadius: 8,
                      background: bgImage ? `url("${bgImage}")` : 'var(--bg-surface)',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      border: '1px solid var(--border)',
                      flexShrink: 0
                    }} />
                    <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                      <button 
                        className="btn btn-primary" 
                        style={{ flex: 1, fontSize: 12 }}
                        onClick={async () => {
                          const url = await window.cyberNotesAPI.selectAndSaveImage();
                          if (url) onBgImageChange(url);
                        }}
                      >
                        {language === 'es' ? 'Cambiar imagen' : 'Change image'}
                      </button>
                      {bgImage && (
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '8px 12px' }}
                          onClick={() => onBgImageChange(null)}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-primary)' }}>{language === 'es' ? 'Efecto Glass (Desenfoque)' : 'Glass Blur Effect'}</span>
                        <span style={{ color: 'var(--accent-light)' }}>{glassBlur}px</span>
                      </div>
                      <input 
                        type="range" min="0" max="40" step="1" 
                        value={glassBlur} onChange={(e) => onBlurChange(parseInt(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                      />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-primary)' }}>{language === 'es' ? 'Opacidad del Overlay' : 'Overlay Opacity'}</span>
                        <span style={{ color: 'var(--accent-light)' }}>{Math.round(bgOpacity * 100)}%</span>
                      </div>
                      <input 
                        type="range" min="0" max="0.95" step="0.05" 
                        value={bgOpacity} onChange={(e) => onOpacityChange(parseFloat(e.target.value))}
                        style={{ width: '100%', accentColor: 'var(--accent)' }}
                      />
                    </div>
                  </div>
                </div>
            </div>

            <div className="settings-card settings-editor-card">
              <SettingsHeading icon={<PanelLeft />}>
                {language === 'es' ? 'Editor' : 'Editor'}
              </SettingsHeading>
              <div className="settings-option-stack">
                <div className="settings-option-row">
                  <SettingsOptionCopy icon={<PanelLeft />}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {language === 'es' ? 'Ancho de pestañas' : 'Tab Width'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {language === 'es' ? 'Elige el tamaño horizontal de las pestañas en el editor' : 'Choose the horizontal size of tabs in the editor'}
                    </span>
                  </SettingsOptionCopy>
                  <select
                    value={tabsWidthMode}
                    onChange={(e) => onTabsWidthModeChange(e.target.value as 'normal' | 'wide')}
                    className="input settings-option-select"
                  >
                    <option value="normal">{language === 'es' ? 'Normal' : 'Normal'}</option>
                    <option value="wide">{language === 'es' ? 'Ancho (+30%)' : 'Wide (+30%)'}</option>
                  </select>
                </div>

                <label className="settings-option-row" onClick={() => onShowLineCounterChange(!showLineCounter)}>
                  <SettingsOptionCopy icon={<Rows3 />}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {language === 'es' ? 'Mostrar contador de líneas' : 'Show line counter'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {language === 'es' ? 'Muestra la línea y columna actual en el editor' : 'Display current line and column in the editor'}
                    </span>
                  </SettingsOptionCopy>
                  <div className={`custom-switch ${showLineCounter ? 'active' : ''}`} />
                </label>

                <label className="settings-option-row" onClick={() => onShowLineGutterChange(!showLineGutter)}>
                  <SettingsOptionCopy icon={<Hash />}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {language === 'es' ? 'Líneas numeradas (gutter)' : 'Line numbers (gutter)'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {language === 'es' ? 'Muestra la numeración de líneas al costado izquierdo del editor' : 'Show line numbers on the left side of the editor'}
                    </span>
                  </SettingsOptionCopy>
                  <div className={`custom-switch ${showLineGutter ? 'active' : ''}`} />
                </label>

                <label className="settings-option-row" onClick={() => onShowMinimapChange(!showMinimap)}>
                  <SettingsOptionCopy icon={<Map />}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {language === 'es' ? 'Minimapa' : 'Minimap'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {language === 'es' ? 'Muestra un minimapa del documento para navegación rápida' : 'Show a document minimap for quick navigation'}
                    </span>
                  </SettingsOptionCopy>
                  <div className={`custom-switch ${showMinimap ? 'active' : ''}`} />
                </label>

                <label className="settings-option-row" onClick={() => onShowWordCounterChange(!showWordCounter)}>
                  <SettingsOptionCopy icon={<Hash />}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {language === 'es' ? 'Contador de palabras' : 'Word counter'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {language === 'es' ? 'Muestra palabras, caracteres y tiempo de lectura en la barra de estado' : 'Show words, characters and reading time in the status bar'}
                    </span>
                  </SettingsOptionCopy>
                  <div className={`custom-switch ${showWordCounter ? 'active' : ''}`} />
                </label>

                <label className="settings-option-row" onClick={() => onShowFloatingToolbarChange(!showFloatingToolbar)}>
                  <SettingsOptionCopy icon={<Sparkles />}>
                    <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {language === 'es' ? 'Barra flotante de formato' : 'Floating format toolbar'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      {language === 'es' ? 'Muestra la mini barra al seleccionar texto en el editor' : 'Show the mini toolbar when selecting text in the editor'}
                    </span>
                  </SettingsOptionCopy>
                  <div className={`custom-switch ${showFloatingToolbar ? 'active' : ''}`} />
                </label>
              </div>
            </div>

            <div className="settings-card">
              <SettingsHeading icon={<SlidersHorizontal />}>
                {language === 'es' ? 'Barra de herramientas' : 'Toolbar'}
              </SettingsHeading>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '-4px 0 12px' }}>
                {language === 'es'
                  ? 'Elige qué botones se ven en la barra. Los ocultos viven en el menú Más (···). También puedes ocultarlos con clic derecho sobre cada botón.'
                  : 'Choose which buttons appear in the toolbar. Hidden ones live in the More (···) menu. You can also hide them by right-clicking each button.'}
              </p>
              <div className="settings-option-stack">
                {(() => {
                  const knownHidden = hiddenToolbarIds.filter((x): x is ToolbarItemDef['id'] =>
                    TOOLBAR_ITEMS.some((d) => d.id === x));
                  const visibleItems = TOOLBAR_ITEMS.filter((d) => !knownHidden.includes(d.id));
                  const hiddenItems = TOOLBAR_ITEMS.filter((d) => knownHidden.includes(d.id));
                  const chipStyle = (active: boolean): React.CSSProperties => ({
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7,
                    padding: '6px 8px 6px 10px',
                    borderRadius: 8,
                    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: active ? 'var(--accent-dim)' : 'var(--bg-surface)',
                    color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all var(--transition)',
                  });
                  const renderChip = (item: ToolbarItemDef, active: boolean) => {
                    const Icon = item.icon;
                    const itemName = language === 'es' ? item.labelEs : item.labelEn;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onHiddenToolbarIdsChange(
                            active
                              ? [...knownHidden, item.id]
                              : knownHidden.filter((x) => x !== item.id),
                          );
                        }}
                        title={active
                          ? (language === 'es' ? `Ocultar ${itemName}` : `Hide ${itemName}`)
                          : (language === 'es' ? `Mostrar ${itemName}` : `Show ${itemName}`)}
                        style={chipStyle(active)}
                        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.2)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.filter = ''; }}
                      >
                        <Icon size={13} style={{ flexShrink: 0 }} />
                        <span style={{ whiteSpace: 'nowrap' }}>{itemName}</span>
                        <span
                          aria-hidden="true"
                          style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: 16, height: 16, borderRadius: 4,
                            background: active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.05)',
                            flexShrink: 0,
                          }}
                        >
                          {active ? <X size={11} /> : <Plus size={11} />}
                        </span>
                      </button>
                    );
                  };
                  const bayStyle: React.CSSProperties = {
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    padding: 10,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                  };
                  const bayTitleStyle: React.CSSProperties = {
                    fontSize: 11, fontWeight: 700, letterSpacing: '0.05em',
                    textTransform: 'uppercase', color: 'var(--text-muted)', margin: '2px 2px 0',
                  };
                  const emptyHint = language === 'es' ? 'Vacía' : 'Empty';
                  return (
                    <>
                      <div>
                        <div style={bayTitleStyle}>
                          {language === 'es' ? `En la barra (${visibleItems.length})` : `In toolbar (${visibleItems.length})`}
                        </div>
                        <div style={{ ...bayStyle, marginTop: 6 }}>
                          {visibleItems.length === 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 6px' }}>{emptyHint}</span>
                          )}
                          {visibleItems.map((item) => renderChip(item, true))}
                        </div>
                      </div>
                      <div>
                        <div style={bayTitleStyle}>
                          {language === 'es' ? `Ocultos en Más (${hiddenItems.length})` : `Hidden in More (${hiddenItems.length})`}
                        </div>
                        <div style={{ ...bayStyle, marginTop: 6 }}>
                          {hiddenItems.length === 0 && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', padding: '4px 6px' }}>{emptyHint}</span>
                          )}
                          {hiddenItems.map((item) => renderChip(item, false))}
                        </div>
                      </div>
                    </>
                  );
                })()}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onHiddenToolbarIdsChange([])}
                  disabled={hiddenToolbarIds.length === 0}
                  style={{ alignSelf: 'flex-end', fontSize: 12, opacity: hiddenToolbarIds.length === 0 ? 0.4 : 1 }}
                >
                  <RotateCcw size={13} />
                  {language === 'es' ? 'Restablecer botones' : 'Reset buttons'}
                </button>
              </div>
            </div>

            <div className="settings-card">
              <SettingsHeading icon={<Type />}>
                {language === 'es' ? 'Tipografía del Editor' : 'Editor Typography'}
              </SettingsHeading>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '-4px 0 12px' }}>
                {language === 'es'
                  ? 'Fuente base de todo el editor. Aplica a las notas completas, salvo el texto con fuente elegida desde la barra.'
                  : 'Base font for the whole editor. Applies to entire notes, except text with a font picked from the toolbar.'}
              </p>
              {(() => {
                const activeFont = EDITOR_FONTS.find(f => f.id === (editorFont || 'inter')) || EDITOR_FONTS[0];
                return (
                  <>
                    <div role="radiogroup" aria-label={language === 'es' ? 'Tipografía del Editor' : 'Editor Typography'} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {EDITOR_FONTS.map(font => {
                        const isCurrent = (editorFont || 'inter') === font.id;
                        const fontName = language === 'es' ? font.nameEs : font.nameEn;
                        const categoryLabel = language === 'es' ? font.categoryLabelEs : font.categoryLabelEn;

                        return (
                          <button
                            key={font.id}
                            type="button"
                            role="radio"
                            aria-checked={isCurrent}
                            onClick={() => onEditorFontChange?.(font.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 10,
                              width: '100%',
                              padding: '8px 12px',
                              borderRadius: 'var(--radius-md)',
                              border: isCurrent ? '1px solid var(--accent)' : '1px solid var(--border)',
                              background: isCurrent ? 'var(--accent-dim)' : 'var(--bg-surface)',
                              boxShadow: isCurrent ? '0 0 10px var(--accent-glow)' : 'none',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'all var(--transition)',
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: 8,
                                height: 8,
                                flexShrink: 0,
                                borderRadius: '50%',
                                background: isCurrent ? 'var(--accent-light)' : 'transparent',
                                border: isCurrent ? 'none' : '1px solid var(--text-muted)',
                                boxShadow: isCurrent ? '0 0 6px var(--accent-glow)' : 'none',
                              }}
                            />
                            <span style={{
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              fontFamily: font.family,
                              fontSize: 14,
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                            }}>
                              {fontName}
                            </span>
                            <span style={{
                              flexShrink: 0,
                              fontSize: 10,
                              fontWeight: 700,
                              padding: '1px 6px',
                              borderRadius: 4,
                              background: isCurrent ? 'var(--accent)' : 'rgba(255, 255, 255, 0.08)',
                              color: isCurrent ? 'var(--text-on-accent)' : 'var(--text-muted)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.04em',
                            }}>
                              {categoryLabel}
                            </span>
                            <span style={{ flexShrink: 0, fontSize: 11, color: isCurrent ? 'var(--accent-light)' : 'var(--text-muted)' }}>
                              {isCurrent ? (language === 'es' ? '● Activa' : '● Active') : (language === 'es' ? 'Elegir' : 'Select')}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                      background: 'rgba(0, 0, 0, 0.25)',
                    }}>
                      <div style={{
                        fontFamily: activeFont.family,
                        fontSize: 16,
                        color: 'var(--text-primary)',
                      }}>
                        {activeFont.sample}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 6 }}>
                        {language === 'es' ? activeFont.descriptionEs : activeFont.descriptionEn}
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
            </>
          )}

          {/* ── SECURITY ── */}
          {tab === 'security' && (
            <>
            <div className="settings-card">
              <SettingsHeading icon={<LockKeyhole />}>
                {language === 'es' ? 'Contraseña' : 'Password'}
              </SettingsHeading>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '-4px 0 12px' }}>
                {hasPassword
                  ? (language === 'es' 
                      ? 'La contraseña protege el acceso a la app. Ingresa tu contraseña actual para cambiarla o quitarla.' 
                      : 'The password protects access to the app. Enter your current password to change or remove it.')
                  : (language === 'es' 
                      ? 'La contraseña protege el acceso a la app. Define una contraseña para habilitar la protección.' 
                      : 'The password protects access to the app. Set a password to enable protection.')}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                  {language === 'es' ? 'Método de desbloqueo' : 'Unlock method'}
                  <select
                    value={authMethod}
                    onChange={e => setAuthMethod(e.target.value === 'pin' ? 'pin' : 'password')}
                    className="input"
                    style={{ background: 'var(--bg-app)', cursor: 'pointer' }}
                  >
                    <option value="password">{language === 'es' ? 'Contraseña' : 'Password'}</option>
                    <option value="pin">{language === 'es' ? 'PIN (4 a 8 dígitos)' : 'PIN (4 to 8 digits)'}</option>
                  </select>
                </label>
                {hasPassword && (
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPwd ? 'text' : 'password'}
                      value={currentPwd}
                      onChange={e => setCurrentPwd(storedMethod === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value)}
                      inputMode={storedMethod === 'pin' ? 'numeric' : undefined}
                      placeholder={storedMethod === 'pin'
                        ? (language === 'es' ? 'PIN actual' : 'Current PIN')
                        : (language === 'es' ? 'Contraseña actual' : 'Current password')}
                      className="input"
                      style={{ paddingRight: 36 }}
                      onContextMenu={inputMenu.onContextMenu}
                    />
                    <button
                      type="button"
                      className="btn-icon"
                      onClick={() => setShowPwd(!showPwd)}
                      style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}
                      tabIndex={-1}
                    >
                      {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                )}

                <input
                  type={showPwd ? 'text' : 'password'}
                  value={newPwd}
                  onChange={e => setNewPwd(authMethod === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value)}
                  inputMode={authMethod === 'pin' ? 'numeric' : undefined}
                  placeholder={authMethod === 'pin'
                    ? (language === 'es' ? 'Nuevo PIN (4 a 8 dígitos)' : 'New PIN (4 to 8 digits)')
                    : (language === 'es' ? 'Nueva contraseña' : 'New password')}
                  className="input"
                  onContextMenu={inputMenu.onContextMenu}
                />

                <input
                  type={showPwd ? 'text' : 'password'}
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(authMethod === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 8) : e.target.value)}
                  inputMode={authMethod === 'pin' ? 'numeric' : undefined}
                  placeholder={authMethod === 'pin'
                    ? (language === 'es' ? 'Confirmar PIN' : 'Confirm PIN')
                    : (language === 'es' ? 'Confirmar nueva contraseña' : 'Confirm new password')}
                  className="input"
                  onKeyDown={e => { if (e.key === 'Enter') handleSetPassword(); }}
                  onContextMenu={inputMenu.onContextMenu}
                />

                {pwdMessage && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: pwdError ? 'var(--danger-dim)' : 'rgba(34,197,94,0.12)',
                    color: pwdError ? 'var(--danger)' : 'var(--success)',
                    fontSize: 12,
                  }}>
                    {pwdMessage}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-primary"
                    onClick={handleSetPassword}
                    disabled={pwdLoading}
                    style={{ flex: 1, gap: 6 }}
                  >
                    <Lock size={14} />
                    {pwdLoading
                      ? (language === 'es' ? 'Guardando...' : 'Saving...')
                      : (authMethod === 'pin'
                        ? (language === 'es' ? 'Guardar PIN' : 'Save PIN')
                        : (language === 'es' ? 'Guardar contraseña' : 'Save password'))}
                  </button>
                  {hasPassword && (
                    <Tooltip
                      label={language === 'es' ? 'Eliminar contraseña' : 'Delete password'}
                      placement="top"
                    >
                    <button
                      className="btn btn-danger"
                      onClick={handleRemovePassword}
                      aria-label={language === 'es' ? 'Eliminar contraseña' : 'Delete password'}
                      style={{ gap: 6 }}
                    >
                      <Trash2 size={14} />
                      {language === 'es' ? 'Quitar' : 'Remove'}
                    </button>
                    </Tooltip>
                  )}
                </div>
              </div>

              {hasPassword && (
                <>
                  <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />

                  <button
                    className="btn btn-ghost"
                    onClick={() => { onClose(); onLock(); }}
                    style={{ gap: 8, fontSize: 'calc(13px * var(--ui-scale))', justifyContent: 'flex-start', width: '100%', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}
                  >
                    <Lock size={14} />
                    {language === 'es' ? 'Bloquear ahora' : 'Lock now'}
                  </button>
                </>
              )}
            </div>

            <div className="settings-card">
              <SettingsHeading icon={<KeyRound />}>
                {language === 'es' ? 'Código de recuperación' : 'Recovery code'}
              </SettingsHeading>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: '-4px 0 12px' }}>
                {language === 'es'
                  ? 'Si olvidas tu contraseña, este código es la única forma de volver a entrar. Guárdalo fuera de este equipo.'
                  : 'If you forget your password, this code is the only way back in. Store it away from this computer.'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {!hasPassword && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                    {language === 'es'
                      ? 'Define primero una contraseña o PIN arriba para poder generar un código.'
                      : 'Set a password or PIN above first to generate a code.'}
                  </p>
                )}

                {hasPassword && !recHas && (
                  <button
                    className="btn btn-ghost"
                    onClick={handleGenerateRecoveryCode}
                    disabled={recLoading}
                    style={{ gap: 6, justifyContent: 'flex-start', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}
                  >
                    <KeyRound size={14} />
                    {language === 'es' ? 'Generar código de recuperación' : 'Generate recovery code'}
                  </button>
                )}

                {recHas && (
                  <>
                    <div style={{ fontSize: 12, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Check size={14} />
                      {language === 'es' ? 'Código de recuperación configurado' : 'Recovery code configured'}
                    </div>
                    <button
                      className="btn btn-ghost"
                      onClick={handleGenerateRecoveryCode}
                      disabled={recLoading}
                      style={{ gap: 6, justifyContent: 'flex-start', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}
                    >
                      <RotateCcw size={14} />
                      {language === 'es' ? 'Regenerar código' : 'Regenerate code'}
                    </button>
                  </>
                )}

                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

                <input
                  value={recHint}
                  onChange={e => setRecHint(e.target.value)}
                  maxLength={120}
                  placeholder={language === 'es' ? 'Pista opcional (visible en el login)' : 'Optional hint (shown at login)'}
                  aria-label={language === 'es' ? 'Pista de contraseña' : 'Password hint'}
                  className="input"
                  onContextMenu={inputMenu.onContextMenu}
                />
                <button
                  className="btn btn-ghost"
                  onClick={handleSaveHint}
                  disabled={recLoading}
                  style={{ gap: 6, alignSelf: 'flex-start', fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', padding: '6px 12px' }}
                >
                  <Save size={14} />
                  {language === 'es' ? 'Guardar pista' : 'Save hint'}
                </button>

                {recMessage && (
                  <div style={{
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    background: recError ? 'var(--danger-dim)' : 'rgba(34,197,94,0.12)',
                    color: recError ? 'var(--danger)' : 'var(--success)',
                    fontSize: 12,
                  }}>
                    {recMessage}
                  </div>
                )}
              </div>
            </div>

            <div className="settings-card">
                <SettingsHeading icon={<ShieldCheck />}>
                  {language === 'es' ? 'Auto-bloqueo por inactividad' : 'Auto-lock on inactivity'}
                </SettingsHeading>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ color: 'var(--accent)', opacity: 0.8 }}><Shield size={18} /></div>
                    <select 
                      value={autoLockMinutes}
                      onChange={(e) => onAutoLockChange(parseInt(e.target.value))}
                      className="input"
                      style={{ flex: 1, background: 'var(--bg-app)', cursor: 'pointer' }}
                    >
                      <option value="0">{language === 'es' ? 'Nunca (Desactivado)' : 'Never (Disabled)'}</option>
                      <option value="1">{language === 'es' ? 'Después de 1 minuto' : 'After 1 minute'}</option>
                      <option value="5">{language === 'es' ? 'Después de 5 minutos' : 'After 5 minutes'}</option>
                      <option value="15">{language === 'es' ? 'Después de 15 minutos' : 'After 15 minutes'}</option>
                      <option value="30">{language === 'es' ? 'Después de 30 minutos' : 'After 30 minutes'}</option>
                      <option value="60">{language === 'es' ? 'Después de 1 hora' : 'After 1 hour'}</option>
                      <option value="120">{language === 'es' ? 'Después de 2 horas' : 'After 2 hours'}</option>
                      <option value="240">{language === 'es' ? 'Después de 4 horas' : 'After 4 hours'}</option>
                      <option value="480">{language === 'es' ? 'Después de 8 horas' : 'After 8 hours'}</option>
                      <option value="720">{language === 'es' ? 'Después de 12 horas' : 'After 12 hours'}</option>
                      <option value="1440">{language === 'es' ? 'Después de 24 horas' : 'After 24 hours'}</option>
                    </select>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                    {language === 'es' 
                      ? 'La aplicación se bloqueará automáticamente si no detecta actividad del ratón o teclado durante el tiempo seleccionado.' 
                      : 'The application will lock automatically if no mouse or keyboard activity is detected for the selected period.'}
                  </p>
                </div>
            </div>
            </>
          )}

          {/* ── ESTADÍSTICAS / STATISTICS ── */}
          {tab === 'stats' && (
            <>
            <div className="settings-card">
              <SettingsHeading icon={<BarChart3 />}>
                {language === 'es' ? 'Estadísticas de uso' : 'Usage statistics'}
                <Tooltip
                  label={language === 'es'
                    ? 'Tus estadísticas nunca salen de esta app: sin cuentas, sin red, sin telemetría.'
                    : 'Your stats never leave this app: no accounts, no network, no telemetry.'}
                  placement="top"
                >
                  <span
                    style={{ display: 'inline-flex', marginLeft: 7, color: 'var(--text-muted)', cursor: 'help', verticalAlign: '1px' }}
                    onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent-light)'; }}
                    onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                  >
                    <Info size={13} />
                  </span>
                </Tooltip>
              </SettingsHeading>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                cursor: 'pointer',
                marginBottom: 10,
              }} onClick={() => handleToggleUsageStats(!usageStatsOn)}>
                <SettingsOptionCopy icon={<BarChart3 />}>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Contar estadísticas' : 'Count statistics'}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Aperturas y días activos' : 'Opens and active days'}</span>
                </SettingsOptionCopy>
                <div className={`custom-switch ${usageStatsOn ? 'active' : ''}`} />
              </label>

              {usageStatsOn && (
                !usageStats ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={handleLoadUsageStats}
                      disabled={usageLoading}
                      style={{ gap: 6, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}
                    >
                      <BarChart3 size={14} />
                      {usageLoading
                        ? (language === 'es' ? 'Calculando...' : 'Calculating...')
                        : (language === 'es' ? 'Mostrar estadísticas' : 'Show statistics')}
                    </button>
                    {usageError && (
                      <div style={{
                        padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--danger-dim)', color: 'var(--danger)', fontSize: 12,
                      }}>
                        {language === 'es' ? 'No se pudieron calcular' : 'Could not calculate'}
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <UsageTiles stats={usageStats} language={language} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={handleHideUsageStats}
                        style={{ gap: 6, fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', padding: '6px 12px' }}
                      >
                        {language === 'es' ? 'Ocultar' : 'Hide'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={handleResetUsageStats}
                        style={{ gap: 6, fontSize: 12, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', padding: '6px 12px' }}
                      >
                        <RotateCcw size={14} />
                        {language === 'es' ? 'Restablecer estadísticas' : 'Reset statistics'}
                      </button>
                    </div>
                  </>
                )
              )}

              {!usageStatsOn && (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0 }}>
                  {language === 'es'
                    ? 'Desactivado: no se registra nada y se borró el historial guardado.'
                    : 'Disabled: nothing is recorded and saved history was deleted.'}
                </p>
              )}
            </div>
            </>
          )}

          {/* ── RESPALDO Y DATOS / BACKUP & DATA ── */}
          {tab === 'maintenance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>              {/* Card 1: Copias de seguridad (Exportar / Importar) */}
              <div className="settings-card">
                <SettingsHeading icon={<Database />}>
                  {language === 'es' ? 'Copias de Seguridad' : 'Backups'}
                </SettingsHeading>
                <p className="setting-desc" style={{ marginBottom: 16 }}>
                  {language === 'es'
                    ? 'Exporta o restaura todas tus notas, carpetas y configuraciones en formato JSON estándar.'
                    : 'Export or restore all your notes, folders, and settings in standard JSON format.'}
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* Export Item */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                      <span style={{ fontSize: 'calc(13px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {language === 'es' ? 'Exportar copia de seguridad' : 'Export backup'}
                      </span>
                      <span style={{ fontSize: 'calc(11.5px * var(--ui-scale))', color: 'var(--text-secondary)' }}>
                        {language === 'es'
                          ? 'Genera un archivo JSON descargable con todo el contenido actual.'
                          : 'Create a downloadable JSON file with all current content.'}
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost"
                      onClick={async () => {
                        const ok = await window.cyberNotesAPI.exportData();
                        if (ok) await showDialog({
                          variant: 'success',
                          title: language === 'es' ? 'Exportación completada' : 'Export complete',
                          message: language === 'es' ? 'Datos exportados exitosamente.' : 'Data successfully exported.',
                        });
                      }}
                      style={{ gap: 8, fontSize: 'calc(12.5px * var(--ui-scale))', flexShrink: 0, padding: '8px 14px', color: 'var(--warning)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}
                    >
                      <Upload size={15} />
                      {language === 'es' ? 'Exportar' : 'Export'}
                    </button>
                  </div>

                  {/* Import Item */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                      <span style={{ fontSize: 'calc(13px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {language === 'es' ? 'Importar copia de seguridad' : 'Import backup'}
                      </span>
                      <span style={{ fontSize: 'calc(11.5px * var(--ui-scale))', color: 'var(--text-secondary)' }}>
                        {language === 'es'
                          ? 'Combina notas y carpetas desde un archivo JSON previo.'
                          : 'Merge notes and folders from a previous JSON file.'}
                      </span>
                    </div>
                    <button
                      className="btn btn-ghost"
                      style={{ gap: 8, fontSize: 'calc(12.5px * var(--ui-scale))', flexShrink: 0, padding: '8px 14px', color: 'var(--warning)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}
                      onClick={async () => {
                        const proceed = await showDialog({
                          variant: 'warning',
                          confirm: true,
                          title: language === 'es' ? 'Importar backup' : 'Import backup',
                          message: language === 'es'
                            ? 'Importar un backup mezclará los datos con los actuales. ¿Deseas continuar?'
                            : 'Importing a backup will merge data with current notes. Do you want to continue?',
                        });
                        if (!proceed) return;
                        const ok = await window.cyberNotesAPI.importData();
                        if (ok) {
                          await showDialog({
                            variant: 'success',
                            title: language === 'es' ? 'Importación completada' : 'Import complete',
                            message: language === 'es'
                              ? 'Datos importados correctamente. La aplicación se recargará.'
                              : 'Data successfully imported. The application will reload.',
                          });
                          window.location.reload();
                        }
                      }}
                    >
                      <Download size={15} />
                      {language === 'es' ? 'Importar' : 'Import'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Card 2: Respaldo automático programado */}
              <div className="settings-card">
                <SettingsHeading icon={<Archive />}>
                  {language === 'es' ? 'Respaldo automático' : 'Automatic backup'}
                </SettingsHeading>
                <p className="setting-desc" style={{ marginBottom: 16 }}>
                  {language === 'es'
                    ? 'Copia la base de datos a una carpeta local cada cierto tiempo y conserva las copias más recientes.'
                    : 'Copies the database to a local folder on a schedule and keeps the most recent copies.'}
                </p>

                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => window.cyberNotesAPI.openBackupsFolder()}
                  style={{
                    gap: 8, justifyContent: 'flex-start',
                    padding: '9px 14px', fontSize: 'calc(12.5px * var(--ui-scale))',
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)', marginBottom: 12,
                  }}
                >
                  <FolderOpen size={15} style={{ color: 'var(--accent)' }} />
                  <span>{language === 'es' ? 'Abrir carpeta de respaldos' : 'Open backups folder'}</span>
                </button>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer'
                  }} onClick={() => handleToggleAutoBackup(!autoBackupEnabled)}>
                    <SettingsOptionCopy icon={<Archive />}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {language === 'es' ? 'Respaldo programado' : 'Scheduled backup'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {language === 'es' ? 'Crear copias automáticamente en segundo plano' : 'Create copies automatically in the background'}
                      </span>
                    </SettingsOptionCopy>
                    <div className={`custom-switch ${autoBackupEnabled ? 'active' : ''}`} />
                  </label>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ color: 'var(--accent)', opacity: 0.8 }}><Clock3 size={18} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {language === 'es' ? 'Frecuencia' : 'Frequency'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {language === 'es' ? 'Cada cuánto se crea una copia' : 'How often a copy is created'}
                      </span>
                    </div>
                    <select
                      value={autoBackupHours}
                      onChange={(e) => handleAutoBackupHours(e.target.value)}
                      className="input"
                      disabled={!autoBackupEnabled}
                      style={{ background: 'var(--bg-app)', cursor: 'pointer', padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                    >
                      <option value="6">{language === 'es' ? 'Cada 6 horas' : 'Every 6 hours'}</option>
                      <option value="12">{language === 'es' ? 'Cada 12 horas' : 'Every 12 hours'}</option>
                      <option value="24">{language === 'es' ? 'Cada día' : 'Every day'}</option>
                      <option value="168">{language === 'es' ? 'Cada semana' : 'Every week'}</option>
                    </select>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ color: 'var(--accent)', opacity: 0.8 }}><Database size={18} /></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {language === 'es' ? 'Copias conservadas' : 'Copies kept'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {language === 'es' ? 'Las más antiguas se eliminan solas' : 'Oldest ones are deleted automatically'}
                      </span>
                    </div>
                    <select
                      value={autoBackupKeep}
                      onChange={(e) => handleAutoBackupKeep(e.target.value)}
                      className="input"
                      disabled={!autoBackupEnabled}
                      style={{ background: 'var(--bg-app)', cursor: 'pointer', padding: '6px 12px', fontSize: 12, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
                    >
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="7">7</option>
                      <option value="14">14</option>
                      <option value="30">30</option>
                    </select>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                      <span style={{ fontSize: 'calc(13px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {language === 'es' ? 'Último respaldo' : 'Last backup'}
                      </span>
                      <span style={{ fontSize: 'calc(11.5px * var(--ui-scale))', color: 'var(--text-secondary)' }}>
                        {formatBackupDate(autoBackupLast)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button
                      className="btn btn-ghost"
                      onClick={handleBackupNow}
                      disabled={backupBusy}
                      style={{ gap: 8, fontSize: 'calc(12.5px * var(--ui-scale))', padding: '8px 14px', color: 'var(--warning)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}
                      >
                        <Upload size={15} />
                        {backupBusy
                          ? (language === 'es' ? 'Respaldando...' : 'Backing up...')
                          : (language === 'es' ? 'Respaldar ahora' : 'Back up now')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 3: Almacenamiento Local */}
              <div className="settings-card">
                <SettingsHeading icon={<HardDrive />}>
                  {language === 'es' ? 'Almacenamiento Local' : 'Local Storage'}
                </SettingsHeading>
                <p className="setting-desc" style={{ marginBottom: 16 }}>
                  {language === 'es'
                    ? 'CyberNotes almacena toda tu información localmente en tu equipo sin sincronización en la nube.'
                    : 'CyberNotes stores all your information locally on your computer with no cloud syncing.'}
                </p>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                    <span style={{ fontSize: 'calc(13px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {language === 'es' ? 'Carpeta de datos de la aplicación' : 'Application data folder'}
                    </span>
                    <span style={{ fontSize: 'calc(11.5px * var(--ui-scale))', color: 'var(--text-secondary)' }}>
                      {language === 'es'
                        ? 'Accede directamente a los archivos de base de datos SQLite y directorio de imágenes locales.'
                        : 'Directly access SQLite database files and local images directory.'}
                    </span>
                  </div>
                  <button
                    className="btn btn-ghost"
                    onClick={() => window.cyberNotesAPI.openDataFolder()}
                    style={{ gap: 8, fontSize: 'calc(12.5px * var(--ui-scale))', flexShrink: 0, padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)' }}
                  >
                    <FolderOpen size={15} />
                    {language === 'es' ? 'Abrir carpeta' : 'Open folder'}
                  </button>
                </div>
              </div>

              {/* Card 4: Restablecer Ajustes de Fábrica */}
              <div className="settings-card">
                <SettingsHeading icon={<RotateCcw />} tone="danger">
                  {language === 'es' ? 'Restablecer Ajustes' : 'Reset Settings'}
                </SettingsHeading>
                <p className="setting-desc" style={{ marginBottom: 16 }}>
                  {language === 'es'
                    ? 'Restaura todos los ajustes de configuración de la app a sus valores originales de fábrica sin borrar tus notas ni carpetas.'
                    : 'Restores all application settings to their original factory values without deleting your notes or folders.'}
                </p>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
                    <span style={{ fontSize: 'calc(13px * var(--ui-scale))', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {language === 'es' ? 'Restablecer a valores de fábrica' : 'Reset to factory defaults'}
                    </span>
                    <span style={{ fontSize: 'calc(11.5px * var(--ui-scale))', color: 'var(--text-secondary)' }}>
                      {language === 'es'
                        ? 'Tema, interfaz, atajos y preferencias volverán a su estado inicial.'
                        : 'Theme, interface, shortcuts, and preferences will return to initial state.'}
                    </span>
                  </div>
                  <button
                    className="btn btn-danger"
                    onClick={async () => {
                      const proceed = await showDialog({
                        variant: 'warning',
                        confirm: true,
                        title: language === 'es' ? 'Restablecer ajustes' : 'Reset settings',
                        message: language === 'es'
                          ? '¿Estás seguro de restablecer todos los ajustes de fábrica? Tus notas y carpetas se conservarán intactas.'
                          : 'Are you sure you want to reset all settings to factory defaults? Your notes and folders will remain intact.',
                      });
                      if (!proceed) return;
                      await window.cyberNotesAPI.resetSettings?.();
                      window.location.reload();
                    }}
                    style={{ gap: 8, fontSize: 'calc(12.5px * var(--ui-scale))', flexShrink: 0, padding: '8px 14px' }}
                  >
                    <RotateCcw size={15} />
                    {language === 'es' ? 'Restablecer' : 'Reset'}
                  </button>
                </div>
              </div>
            </div>
          )}

          </div>
        </div>
        <Tooltip
          label={language === 'es' ? 'Acerca de CyberNotes' : 'About CyberNotes'}
          placement="top"
        >
        <button
          type="button"
          className="config-brand-footer"
          onClick={() => {
            onClose();
            onOpenAbout?.();
          }}
          aria-label={language === 'es' ? 'Acerca de CyberNotes' : 'About CyberNotes'}
        >
          <div className="config-brand-line">
            <img className="config-brand-icon" src="icon.png" alt="" aria-hidden="true" draggable={false} />
            <span>CyberNotes <span className="config-brand-version">v{appVersion || '1.12.0'}</span></span>
          </div>
          <span className="config-brand-copyright">© 2026 CyberGems</span>
        </button>
        </Tooltip>
      </div>
    </div>

      <DialogHost language={language} options={dialog} onResolve={resolveDialog} />
      {showRecDialog && recCode && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={language === 'es' ? 'Código de recuperación' : 'Recovery code'}
          onClick={e => {
            e.stopPropagation();
            if (recDialogMode === 'regen') { setRecCode(null); setRecAck(false); setShowRecDialog(false); }
          }}
          style={{
            position: 'fixed', inset: 0, zIndex: 50000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(4, 4, 10, 0.72)', padding: 20,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420, borderRadius: 14, padding: 24,
              background: 'linear-gradient(160deg, var(--bg-modal), var(--bg-app))',
              border: '1px solid color-mix(in srgb, var(--accent) 35%, var(--border))',
              boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
              display: 'flex', flexDirection: 'column', gap: 12, position: 'relative',
            }}
          >
            {recDialogMode === 'regen' && (
              <button
                type="button"
                className="btn-icon"
                onClick={() => { setRecCode(null); setRecAck(false); setShowRecDialog(false); }}
                aria-label={language === 'es' ? 'Cerrar' : 'Close'}
                style={{ position: 'absolute', top: 12, right: 12, width: 28, height: 28 }}
              >
                <X size={15} />
              </button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: '50%',
                background: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                color: 'var(--accent-light)', flexShrink: 0,
              }}>
                <KeyRound size={17} />
              </span>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {language === 'es' ? 'Guarda tu código de recuperación' : 'Save your recovery code'}
              </h3>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              {recDialogMode === 'regen'
                ? (language === 'es'
                  ? 'Este código reemplazará al anterior al continuar.'
                  : 'This code will replace the previous one on continue.')
                : (language === 'es'
                  ? 'Es la única forma de volver a entrar si olvidas tu contraseña. No se volverá a mostrar.'
                  : 'It is the only way back in if you forget your password. It will not be shown again.')}
            </p>
            <div style={{
              padding: '12px 14px', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-app)', border: '1px dashed var(--accent)',
              fontFamily: 'var(--font-mono)', fontSize: 17, fontWeight: 700,
              letterSpacing: '0.08em', textAlign: 'center', color: 'var(--text-primary)',
              userSelect: 'text', WebkitUserSelect: 'text',
            }}>
              {recCode}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={handleCopyRecoveryCode} style={{ gap: 6, flex: 1, border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', background: 'var(--bg-surface)', padding: '8px 12px' }}>
                <Copy size={14} />
                {language === 'es' ? 'Copiar' : 'Copy'}
              </button>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-primary)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={recAck}
                onChange={e => setRecAck(e.target.checked)}
                style={{ marginTop: 2, accentColor: 'var(--accent)' }}
              />
              {language === 'es'
                ? 'Lo guardé en un lugar seguro fuera de este equipo.'
                : 'I stored it somewhere safe away from this computer.'}
            </label>
            <button
              className="btn btn-primary"
              disabled={!recAck || recLoading}
              onClick={async () => {
                const ok = await handleSaveRecoveryCode();
                if (ok) setShowRecDialog(false);
              }}
              style={{ gap: 6, width: '100%' }}
            >
              <Check size={14} />
              {language === 'es' ? 'Continuar' : 'Continue'}
            </button>
          </div>
        </div>,
        document.body,
      )}
      {inputMenu.menu}
    </>
  );
}
