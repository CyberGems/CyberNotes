// ─── Tipos compartidos de CyberNotes ──────────────────────────────────────

export interface Folder {
  id: string;
  name: string;
  icon: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export interface Note {
  id: string;
  folder_id: string | null;
  title: string;
  /** HTML/JSON TipTap. Vacío en listados meta; completo al abrir con getNoteById. */
  content: string;
  preview: string;
  /** URL de la primera imagen (miniatura de lista); evita parsear content. */
  thumb?: string;
  pinned: number; // 0 | 1
  created_at: string;
  updated_at: string;
}

export type ThemeId = 'cyber-dark' | 'midnight' | 'forest' | 'light' | 'graphite' | 'neon';

export interface Theme {
  id: ThemeId;
  name: string;
  emoji: string;
  vars: Record<string, string>;
}

export type AppView = 'lock' | 'setup' | 'app';

// Window API type
declare global {
  interface Window {
    cyberNotesAPI: {
      // Ventana
      windowMinimize: () => Promise<void>;
      windowMaximizeToggle: () => Promise<void>;
      windowClose: () => Promise<void>;
      windowForceClose: () => Promise<void>;
      openDevTools: () => Promise<void>;
      openDataFolder: () => Promise<void>;
      // Auth
      hasPassword: () => Promise<boolean>;
      setPassword: (password: string) => Promise<boolean>;
      verifyPassword: (password: string) => Promise<boolean>;
      removePassword: () => Promise<boolean>;
      // Unsaved Changes
      setUnsavedChanges: (val: boolean) => Promise<void>;
      // Session lock
      reportActivity: () => Promise<boolean>;
      setSessionLocked: (locked: boolean) => Promise<boolean>;
      ackSessionLocked: () => void;
      onForceLock: (callback: () => void) => () => void;
      onShieldEnable: (callback: () => void) => () => void;
      onShieldDisable: (callback: () => void) => () => void;
      // Settings
      getSetting: (key: string) => Promise<string | null>;
      getSettings: (keys: string[]) => Promise<Record<string, string | null>>;
      setSetting: (key: string, value: string) => Promise<boolean>;
      setAutoStart: (enable: boolean) => Promise<boolean>;
      getAutoStart: () => Promise<boolean>;
      // Folders
      getFolders: () => Promise<Folder[]>;
      createFolder: (folder: Folder) => Promise<Folder>;
      updateFolder: (folder: Partial<Folder> & { id: string }) => Promise<boolean>;
      deleteFolder: (id: string) => Promise<boolean>;
      // Notes
      getAllNotes: () => Promise<Note[]>;
      getNotesByFolder: (folderId: string | null) => Promise<Note[]>;
      getNoteById: (id: string) => Promise<Note | null>;
      saveNote: (note: Note) => Promise<Note>;
      deleteNote: (id: string) => Promise<boolean>;
      searchNotes: (query: string) => Promise<Note[]>;
      // Import / Export
      exportData: () => Promise<boolean>;
      importData: () => Promise<boolean>;
      // Updates / About
      checkForUpdates: () => Promise<{ ok: boolean; version?: string; error?: string }>;
      downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
      installUpdate: () => Promise<void>;
      onUpdateStatus: (callback: (status: {
        state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
        version?: string;
        percent?: number;
        message?: string;
      }) => void) => () => void;
      getVersions: () => Promise<{
        app: string;
        electron: string;
        chrome: string;
        node: string;
        platform: string;
        arch: string;
        osRelease: string;
        osType: string;
      }>;
      openExternal: (url: string) => Promise<boolean>;
      // Assets
      selectAndSaveImage: () => Promise<string | null>;
      // Events
      onStatusBarUrl: (callback: (url: string) => void) => () => void;
      onContextMenuData: (callback: (data: any) => void) => () => void;
      onSettingChanged: (callback: (data: { key: string, value: string }) => void) => () => void;
      onGlobalCapsLockChanged: (callback: (active: boolean) => void) => () => void;
      onOpenSettings: (callback: () => void) => () => void;
      onOpenAbout: (callback: () => void) => () => void;
      onConfirmUnsavedExit: (callback: () => void) => () => void;
      respondUnsavedExit: (discard: boolean) => Promise<void>;
      // Spellcheck
      replaceMisspelling: (word: string) => Promise<void>;
      addToDictionary: (word: string) => Promise<void>;
      writeImageToClipboard: (url: string) => Promise<boolean>;
      // Keyboard
      unlockCapsLock: () => Promise<boolean>;
      checkCapsLock: () => Promise<boolean>;
    };
  }
}
