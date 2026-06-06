import { useState, useEffect, useRef } from 'react';
import { ThemeId } from '../types';
import { THEMES, isColorfulTheme, getPreviewColor } from '../themes';
import { Language, TRANSLATIONS } from '../languages';
import { X, Lock, Shield, FolderOpen, Palette, Monitor, Trash2, Eye, EyeOff, Download, Upload, Languages, Volume2, RefreshCw, Sparkles, Settings } from 'lucide-react';
import { playSynthSound } from '../utils/audio';
import { DialogHost, DialogOptions } from './ConfirmDialog';
import { useInputContextMenu } from '../hooks/useInputContextMenu';

interface Props {
  language: Language;
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
  tabsWidthMode: 'normal' | 'wide';
  onTabsWidthModeChange: (v: 'normal' | 'wide') => void;
  showMinimap: boolean;
  onShowMinimapChange: (v: boolean) => void;
  showWordCounter: boolean;
  onShowWordCounterChange: (v: boolean) => void;
}

type Tab = 'general' | 'appearance' | 'security' | 'maintenance' | 'about';

export default function SettingsModal({ 
  language, onLanguageChange,
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
  onClose, onLock,
  tabsWidthMode, onTabsWidthModeChange,
  showMinimap, onShowMinimapChange,
  showWordCounter, onShowWordCounterChange,
}: Props) {
  const [tab, setTab] = useState<Tab>('general');
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [pwdMessage, setPwdMessage] = useState('');
  const [pwdError, setPwdError] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);
  const [closeToTray, setCloseToTray] = useState(false);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [autoStart, setAutoStart] = useState(false);
  const [autoCheckUpdates, setAutoCheckUpdates] = useState(false);
  const [updateCheckStatus, setUpdateCheckStatus] = useState<'idle' | 'checking' | 'up-to-date' | 'available'>('idle');

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

  const t = TRANSLATIONS[language];

  useEffect(() => {
    const loadSettings = async () => {
      const val = await window.cyberNotesAPI.getSetting('close_to_tray');
      setCloseToTray(val === 'true');
      const minVal = await window.cyberNotesAPI.getSetting('minimize_to_tray');
      setMinimizeToTray(minVal === 'true');
      const isAutoStart = await window.cyberNotesAPI.getAutoStart();
      setAutoStart(isAutoStart);
      const autoCheck = await window.cyberNotesAPI.getSetting('auto_check_updates');
      setAutoCheckUpdates(autoCheck === 'true');
    };
    loadSettings();
  }, []);

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

  const handleToggleAutoCheckUpdates = async (val: boolean) => {
    setAutoCheckUpdates(val);
    await window.cyberNotesAPI.setSetting('auto_check_updates', val.toString());
  };

  const handleCheckForUpdates = async () => {
    setUpdateCheckStatus('checking');
    try {
      const result = await window.cyberNotesAPI.checkForUpdates();
      setUpdateCheckStatus(result ? 'available' : 'up-to-date');
    } catch {
      setUpdateCheckStatus('idle');
    }
  };

  const handleSetPassword = async () => {
    setPwdMessage('');
    setPwdError(false);

    if (newPwd.length < 4) {
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

      await window.cyberNotesAPI.setPassword(newPwd);
      setPwdMessage(language === 'es' ? '✓ Contraseña guardada correctamente' : '✓ Password saved successfully');
      setPwdError(false);
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
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
    setPwdMessage(language === 'es' ? '✓ Contraseña eliminada' : '✓ Password removed');
    setPwdError(false);
    setCurrentPwd('');
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: bgImage ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9998,
      backdropFilter: bgImage ? 'blur(2px)' : 'blur(4px)',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="animate-fade-in"
        style={{
          background: 'var(--bg-modal)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          width: 560,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 32px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '20px 24px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <h2 style={{ fontSize: 'calc(18px * var(--ui-scale))', fontWeight: 700, color: 'var(--text-primary)' }}>⚙️ {language === 'es' ? 'Ajustes' : 'Settings'}</h2>
          <button className="btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, padding: '16px 24px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {[
            { id: 'general' as Tab, label: language === 'es' ? 'General' : 'General', icon: <Settings size={14} /> },
            { id: 'appearance' as Tab, label: language === 'es' ? 'Apariencia' : 'Appearance', icon: <Sparkles size={14} /> },
            { id: 'security' as Tab, label: language === 'es' ? 'Seguridad' : 'Security', icon: <Shield size={14} /> },
            { id: 'maintenance' as Tab, label: language === 'es' ? 'Mantenimiento' : 'Maintenance', icon: <FolderOpen size={14} /> },
            { id: 'about' as Tab, label: language === 'es' ? 'Acerca de' : 'About', icon: <Monitor size={14} /> },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 14px',
                borderRadius: '8px 8px 0 0',
                border: 'none',
                background: tab === t.id ? 'var(--bg-active)' : 'transparent',
                color: tab === t.id ? 'var(--accent-light)' : 'var(--text-muted)',
                fontWeight: tab === t.id ? 600 : 400,
                fontSize: 13,
                cursor: 'pointer',
                borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all var(--transition)',
              }}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>

          {/* ── GENERAL ── */}
          {tab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {language === 'es' ? 'Comportamiento' : 'Behavior'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {language === 'es' ? 'Idioma de la interfaz' : 'Interface Language'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {language === 'es' ? 'Selecciona tu idioma preferido para toda la aplicación' : 'Select your preferred language for the application UI'}
                      </span>
                    </div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Cerrar a la bandeja de sistema' : 'Close to system tray'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Al presionar X, la app se mantendrá activa en la bandeja' : 'Pressing X keeps the app active in the system tray'}</span>
                    </div>
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Minimizar a la bandeja de sistema' : 'Minimize to system tray'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Al minimizar, ocultar la app de la barra de tareas' : 'Minimizing hides the app from the taskbar'}</span>
                    </div>
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
                  }} onClick={() => handleToggleAutoStart(!autoStart)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Iniciar con Windows (minimizado)' : 'Start with Windows (minimized)'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'La app se abrirá en la bandeja al arrancar el equipo' : 'The app starts minimized to tray on system boot'}</span>
                    </div>
                    <div className={`custom-switch ${autoStart ? 'active' : ''}`} />
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
                  }} onClick={() => onRememberLastNoteChange(!rememberLastNote)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Restaurar sesión de pestañas' : 'Restore latest tabs session'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'La app se reabrirá con todas tus pestañas y la nota activa de la sesión anterior' : 'The app reopens with all your tabs and active note from the last session'}</span>
                    </div>
                    <div className={`custom-switch ${rememberLastNote ? 'active' : ''}`} />
                  </label>

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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Ancho de pestañas' : 'Tab Width'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Elige el tamaño horizontal de las pestañas en el editor' : 'Choose the horizontal size of tabs in the editor'}</span>
                    </div>
                    <select 
                      value={tabsWidthMode}
                      onChange={(e) => onTabsWidthModeChange(e.target.value as 'normal' | 'wide')}
                      className="input"
                      style={{ fontSize: 12, background: 'var(--bg-app)', cursor: 'pointer', width: 120, padding: '6px 8px' }}
                    >
                      <option value="normal">{language === 'es' ? 'Normal' : 'Normal'}</option>
                      <option value="wide">{language === 'es' ? 'Ancho (+40%)' : 'Wide (+40%)'}</option>
                    </select>
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
                  }} onClick={() => onShowLineCounterChange(!showLineCounter)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Mostrar contador de líneas' : 'Show line counter'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Muestra la línea y columna actual en el editor' : 'Display current line and column in the editor'}</span>
                    </div>
                    <div className={`custom-switch ${showLineCounter ? 'active' : ''}`} />
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
                  }} onClick={() => onShowLineGutterChange(!showLineGutter)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Líneas numeradas (gutter)' : 'Line numbers (gutter)'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Muestra la numeración de líneas al costado izquierdo del editor' : 'Show line numbers on the left side of the editor'}</span>
                    </div>
                    <div className={`custom-switch ${showLineGutter ? 'active' : ''}`} />
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
                  }} onClick={() => onShowMinimapChange(!showMinimap)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>🗺️ {language === 'es' ? 'Minimapa' : 'Minimap'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Muestra un minimapa del documento para navegación rápida' : 'Show a document minimap for quick navigation'}</span>
                    </div>
                    <div className={`custom-switch ${showMinimap ? 'active' : ''}`} />
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
                  }} onClick={() => onShowWordCounterChange(!showWordCounter)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}># {language === 'es' ? 'Contador de palabras' : 'Word counter'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Muestra palabras, caracteres y tiempo de lectura en la barra de estado' : 'Show words, characters and reading time in the status bar'}</span>
                    </div>
                    <div className={`custom-switch ${showWordCounter ? 'active' : ''}`} />
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
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Autoguardado' : 'Autosave'}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Guardar automáticamente al editar. Si se desactiva, usa el botón Guardar en el editor.' : 'Save changes automatically as you type. If disabled, save changes manually.'}</span>
                    </div>
                    <div 
                      className={`custom-switch ${autosaveEnabled ? 'active' : ''}`}
                      onClick={() => onAutosaveEnabledChange(!autosaveEnabled)}
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
                    <label style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      width: '100%',
                    }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Desactivar Bloq Mayús por inactividad' : 'Auto-unlock Caps Lock on inactivity'}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{language === 'es' ? 'Desactiva físicamente el Bloq Mayús tras un periodo ajustable de inactividad de teclado en el editor' : 'Physically turns off Caps Lock after a configurable period of keyboard inactivity in the editor'}</span>
                      </div>
                      <div 
                        className={`custom-switch ${autoUnlockCapsLock ? 'active' : ''}`}
                        onClick={() => onAutoUnlockCapsLockChange(!autoUnlockCapsLock)}
                        style={{ flexShrink: 0 }}
                      />
                    </label>

                    {autoUnlockCapsLock && (
                      <div style={{
                        marginTop: 4,
                        padding: '10px 14px',
                        background: 'var(--bg-notelist)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{language === 'es' ? 'Tiempo de inactividad' : 'Inactivity timeout'}</span>
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
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{language === 'es' ? 'Sonido de Bloq Mayús' : 'Caps Lock Sound'}</span>
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
                            style={{ gap: 4, fontSize: 12, padding: '6px 10px' }}
                            title={language === 'es' ? 'Probar sonido' : 'Test sound'}
                          >
                            <Volume2 size={14} />
                            {language === 'es' ? 'Escuchar' : 'Preview'}
                          </button>
                        </div>

                        {/* Sound Scope Selection */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{language === 'es' ? 'Ámbito del sonido' : 'Sound Scope'}</span>
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
            </div>
          )}

          {/* ── APPEARANCE ── */}
          {tab === 'appearance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {language === 'es' ? 'Tema visual' : 'Visual Theme'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {THEMES.map(theme => (
                    <button
                      key={theme.id}
                      onClick={() => onThemeChange(theme.id as ThemeId)}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 'var(--radius-md)',
                        border: currentTheme === theme.id ? `2px solid var(--accent)` : '1px solid var(--border)',
                        background: currentTheme === theme.id ? 'var(--accent-dim)' : 'var(--bg-surface)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        transition: 'all var(--transition)',
                        boxShadow: currentTheme === theme.id ? '0 0 12px var(--accent-glow)' : 'none',
                      }}
                    >
                      <div style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: getPreviewColor(theme.id, currentTheme === theme.id ? colorIntensity : 50),
                        flexShrink: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                      }}>
                        {theme.emoji}
                      </div>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>{theme.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          {currentTheme === theme.id ? (language === 'es' ? '● Activo' : '● Active') : (language === 'es' ? 'Click para activar' : 'Click to activate')}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{
                padding: '16px',
                background: 'var(--bg-surface)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                opacity: isColorfulTheme(currentTheme) ? 1 : 0.4,
                pointerEvents: isColorfulTheme(currentTheme) ? 'auto' : 'none',
                transition: 'opacity var(--transition)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{language === 'es' ? 'Intensidad de color' : 'Color Intensity'}</span>
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

              <div className="divider" />

              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {language === 'es' ? 'Fondo Personalizado' : 'Custom Background'}
                </h3>
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
            </div>
          )}

          {/* ── SECURITY ── */}
          {tab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {language === 'es' 
                  ? 'La contraseña protege el acceso a la app. Deja los campos vacíos si no quieres contraseña.' 
                  : 'The password protects access to the app. Leave fields empty if you do not want a password.'}
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showPwd ? 'text' : 'password'}
                    value={currentPwd}
                    onChange={e => setCurrentPwd(e.target.value)}
                    placeholder={language === 'es' ? 'Contraseña actual (si tienes una)' : 'Current password (if you have one)'}
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

                <input
                  type={showPwd ? 'text' : 'password'}
                  value={newPwd}
                  onChange={e => setNewPwd(e.target.value)}
                  placeholder={language === 'es' ? 'Nueva contraseña' : 'New password'}
                  className="input"
                  onContextMenu={inputMenu.onContextMenu}
                />

                <input
                  type={showPwd ? 'text' : 'password'}
                  value={confirmPwd}
                  onChange={e => setConfirmPwd(e.target.value)}
                  placeholder={language === 'es' ? 'Confirmar nueva contraseña' : 'Confirm new password'}
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
                      : (language === 'es' ? 'Guardar contraseña' : 'Save password')}
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={handleRemovePassword}
                    title={language === 'es' ? 'Eliminar contraseña' : 'Delete password'}
                    style={{ gap: 6 }}
                  >
                    <Trash2 size={14} />
                    {language === 'es' ? 'Quitar' : 'Remove'}
                  </button>
                </div>
              </div>

              <div className="divider" />

              <button
                className="btn btn-ghost"
                onClick={() => { onClose(); onLock(); }}
                style={{ gap: 8, fontSize: 'calc(13px * var(--ui-scale))', justifyContent: 'flex-start' }}
              >
                <Lock size={14} />
                {language === 'es' ? 'Bloquear app ahora' : 'Lock app now'}
              </button>

              <div className="divider" />

              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {language === 'es' ? 'Auto-bloqueo por inactividad' : 'Auto-lock on inactivity'}
                </h3>
                <div style={{ 
                  padding: '16px',
                  background: 'var(--bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12
                }}>
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
            </div>
          )}

          {/* ── MAINTENANCE ── */}
          {tab === 'maintenance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Updates */}
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {language === 'es' ? 'Actualizaciones' : 'Updates'}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    gap: 12,
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {t.maintenance.checkUpdates}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {t.maintenance.checkUpdatesDesc}
                      </span>
                      {updateCheckStatus !== 'idle' && (
                        <span style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: updateCheckStatus === 'checking' ? 'var(--accent-light)'
                            : updateCheckStatus === 'up-to-date' ? 'var(--success)'
                            : '#f59e0b',
                          marginTop: 2,
                        }}>
                          {updateCheckStatus === 'checking'
                            ? t.maintenance.checking
                            : updateCheckStatus === 'up-to-date'
                              ? t.maintenance.upToDate
                              : t.maintenance.updateAvailable}
                        </span>
                      )}
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={handleCheckForUpdates}
                      disabled={updateCheckStatus === 'checking'}
                      style={{ gap: 6, fontSize: 12, padding: '8px 14px', whiteSpace: 'nowrap' }}
                    >
                      <RefreshCw size={13} className={updateCheckStatus === 'checking' ? 'spin' : ''} />
                      {t.maintenance.checkNow}
                    </button>
                  </div>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    background: 'var(--bg-surface)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                  }} onClick={() => handleToggleAutoCheckUpdates(!autoCheckUpdates)}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>
                        {t.maintenance.autoCheckUpdates}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {t.maintenance.autoCheckUpdatesDesc}
                      </span>
                    </div>
                    <div className={`custom-switch ${autoCheckUpdates ? 'active' : ''}`} />
                  </label>
                </div>
              </div>

              <div className="divider" />

              {/* Tools & Data */}
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {language === 'es' ? 'Herramientas y Datos' : 'Tools & Data'}
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    className="btn btn-ghost"
                    onClick={() => window.cyberNotesAPI.openDevTools()}
                    style={{ gap: 8, fontSize: 13 }}
                  >
                    <Monitor size={15} />
                    {language === 'es' ? 'Abrir consola' : 'Open console'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => window.cyberNotesAPI.openDataFolder()}
                    style={{ gap: 8, fontSize: 13 }}
                  >
                    <FolderOpen size={15} />
                    {language === 'es' ? 'Carpeta de datos' : 'Data folder'}
                  </button>
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
                    style={{ gap: 8, fontSize: 'calc(13px * var(--ui-scale))' }}
                  >
                    <Download size={15} />
                    {language === 'es' ? 'Exportar Backup (JSON)' : 'Export Backup (JSON)'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ gap: 8, fontSize: 13, color: 'var(--warning)' }}
                    onClick={async () => {
                      const proceed = await showDialog({
                        variant: 'warning',
                        confirm: true,
                        title: language === 'es' ? 'Importar backup' : 'Import backup',
                        message: language === 'es' ? 'Importar un backup mezclará los datos con los actuales. ¿Deseas continuar?' : 'Importing a backup will merge data with current notes. Do you want to continue?',
                      });
                      if (!proceed) return;
                      const ok = await window.cyberNotesAPI.importData();
                      if (ok) {
                        await showDialog({
                          variant: 'success',
                          title: language === 'es' ? 'Importación completada' : 'Import complete',
                          message: language === 'es' ? 'Datos importados correctamente. La aplicación se recargará.' : 'Data successfully imported. The application will reload.',
                        });
                        window.location.reload();
                      }
                    }}
                  >
                    <Upload size={15} />
                    {language === 'es' ? 'Importar Backup' : 'Import Backup'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── ABOUT ── */}
          {tab === 'about' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
                <img 
                  src="icon.png" 
                  alt="CyberNotes Icon" 
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 20,
                    boxShadow: '0 0 32px var(--accent-glow)',
                  }} 
                />
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-primary)' }}>CyberNotes</h2>
                <p style={{ color: 'var(--text-muted)', marginTop: 6, fontSize: 13 }}>{language === 'es' ? 'Versión 1.5.1' : 'Version 1.5.1'}</p>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', maxWidth: 300, lineHeight: 1.7 }}>
                {language === 'es' 
                  ? 'Tu app de notas personal. Offline, privada, y rápida.\nConstruida con Electron + React + TipTap.' 
                  : 'Your personal notes app. Offline, private, and fast.\nBuilt with Electron + React + TipTap.'}
              </p>
            </div>
          )}
        </div>
      </div>

      <DialogHost language={language} options={dialog} onResolve={resolveDialog} />
      {inputMenu.menu}
    </div>
  );
}
