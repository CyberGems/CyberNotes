// ─── Tipos compartidos de CyberNotes ──────────────────────────────────────

export interface UsageStats {
  firstOpen: string | null;
  totalOpens: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  totalUnlocks: number;
  avgWords: number;
  newWeek: number;
  totals: {
    notes: number;
    words: number;
    folders: number;
    favorites: number;
    images: number;
  };
}

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
  deleted_at?: string | null;
}

export interface NoteDraft {
  note_id: string;
  title: string;
  content: string;
  base_updated_at: string;
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
      isMaximized?: () => Promise<boolean>;
      onMaximizedState?: (callback: (isMax: boolean) => void) => () => void;
      windowClose: () => Promise<void>;
      windowForceClose: () => Promise<void>;
      openDevTools: () => Promise<void>;
      openDataFolder: () => Promise<void>;
      openLogsFolder: () => Promise<void>;
      reportRendererError: (message: string) => Promise<boolean>;
      // Auth
      hasPassword: () => Promise<boolean>;
      setPassword: (password: string, method?: string) => Promise<boolean>;
      verifyPassword: (password: string) => Promise<boolean>;
      removePassword: () => Promise<boolean>;
      generateRecoveryCode: () => Promise<string>;
      hasRecoveryCode: () => Promise<boolean>;
      setRecoveryCode: (code: string) => Promise<boolean>;
      verifyRecoveryCode: (code: string) => Promise<{ ok: boolean; retryAfterMs: number }>;
      getUsageStats: () => Promise<{ ok: boolean; stats?: UsageStats; error?: string }>;
      purgeUsageStats: () => Promise<{ ok: boolean; error?: string }>;
      // Unsaved Changes
      setUnsavedChanges: (val: boolean) => Promise<void>;
      // Session lock
      reportActivity: () => Promise<boolean>;
      setSessionLocked: (locked: boolean) => Promise<boolean>;
      isSessionLocked: () => Promise<boolean>;
      ackSessionLocked: () => void;
      onForceLock: (callback: () => void) => () => void;
      onShieldEnable: (callback: () => void) => () => void;
      onShieldDisable: (callback: () => void) => () => void;
      // Settings
      getSetting: (key: string) => Promise<string | null>;
      getSettings: (keys: string[]) => Promise<Record<string, string | null>>;
      setSetting: (key: string, value: string) => Promise<boolean>;
      resetSettings: () => Promise<boolean>;
      setAutoStart: (enable: boolean) => Promise<boolean>;
      getAutoStart: () => Promise<boolean>;
      // Folders
      getFolders: () => Promise<Folder[]>;
      createFolder: (folder: Folder) => Promise<Folder>;
      updateFolder: (folder: Partial<Folder> & { id: string }) => Promise<boolean>;
      deleteFolder: (id: string) => Promise<number>;
      // Notes
      getAllNotes: () => Promise<Note[]>;
      getNotesByFolder: (folderId: string | null) => Promise<Note[]>;
      getNoteById: (id: string) => Promise<Note | null>;
      saveNote: (note: Note) => Promise<Note>;
      getDrafts: () => Promise<NoteDraft[]>;
      saveDraft: (draft: NoteDraft, flushNow?: boolean) => Promise<boolean>;
      deleteDraft: (noteId: string) => Promise<boolean>;
      deleteNote: (id: string) => Promise<boolean>;
      searchNotes: (query: string) => Promise<Note[]>;
      getTrashNotes: () => Promise<Note[]>;
      searchTrashNotes: (query: string) => Promise<Note[]>;
      getTrashCount: () => Promise<number>;
      restoreNote: (id: string) => Promise<Note | null>;
      restoreAllTrash: () => Promise<Note[]>;
      purgeNote: (id: string) => Promise<boolean>;
      emptyTrash: () => Promise<number>;
      // Import / Export
      exportData: () => Promise<boolean>;
      importData: () => Promise<boolean>;
      // Automatic backups
      backupNow: () => Promise<{ ok: boolean; file?: string }>;
      listBackups: () => Promise<Array<{ file: string; size: number; mtime: string }>>;
      openBackupsFolder: () => Promise<void>;
      onBackupCompleted: (callback: (info: { at: string; file: string }) => void) => () => void;
      exportNotePdf: (title: string, html: string) => Promise<boolean>;
      printDocument: (title: string, html: string) => Promise<boolean>;
      // Updates / About
      checkForUpdates: () => Promise<{ ok: boolean; version?: string; error?: string }>;
      downloadUpdate: () => Promise<{ ok: boolean; error?: string }>;
      installUpdate: () => Promise<void>;
      cancelAutoInstall: () => Promise<boolean>;
      onUpdateStatus: (callback: (status: {
        state: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'installing' | 'error';
        version?: string;
        percent?: number;
        message?: string;
        releaseNotes?: string;
        releaseUrl?: string;
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
      getUserName: () => Promise<string | null>;
      openExternal: (url: string) => Promise<boolean>;
      // Assets
      selectAndSaveImage: () => Promise<string | null>;
      // Events
      onStatusBarUrl: (callback: (url: string) => void) => () => void;
      onContextMenuData: (callback: (data: any) => void) => () => void;
      onSettingChanged: (callback: (data: { key: string, value: string }) => void) => () => void;
      onGlobalCapsLockChanged: (callback: (active: boolean) => void) => () => void;
      onOpenSettings: (callback: (tab?: string) => void) => () => void;
      onOpenAbout: (callback: (opts?: { checkUpdates?: boolean }) => void) => () => void;
      onOpenTrayPin: (callback: () => void) => () => void;
      openTaskbarSettings: () => Promise<{ success: boolean; method: 'native' | 'uri' }>;
      onConfirmUnsavedExit: (callback: () => void) => () => void;
      respondUnsavedExit: (discard: boolean) => Promise<void>;
      onConfirmFirstClose: (callback: () => void) => () => void;
      respondFirstClose: (action: 'tray' | 'quit', remember: boolean) => Promise<boolean>;
      // Spellcheck
      replaceMisspelling: (word: string) => Promise<void>;
      addToDictionary: (word: string) => Promise<void>;
      writeImageToClipboard: (url: string) => Promise<boolean>;
      // Keyboard
      unlockCapsLock: () => Promise<boolean>;
      checkCapsLock: () => Promise<boolean>;
      checkNumLock: () => Promise<boolean>;
      toggleCapsLock: () => Promise<boolean>;
      toggleNumLock: () => Promise<boolean>;
      // Sticky Notes
      openStickyNote: (noteId: string) => Promise<boolean>;
      closeStickyNote: (noteId: string) => Promise<boolean>;
      toggleStickyAlwaysOnTop: (noteId: string) => Promise<boolean>;
      getStickyConfig: (noteId: string) => Promise<{ color: string; opacity: number; pinned_top: boolean; zoom: number }>;
      saveStickyConfig: (noteId: string, config: { color?: string; opacity?: number; pinned_top?: boolean; zoom?: number }) => Promise<boolean>;
      setStickyWindowChrome: (noteId: string, color: string, opacity: number) => void;
      beginStickyDrag: (noteId: string) => void;
      dragStickyWindow: (noteId: string) => void;
      endStickyDrag: (noteId: string) => void;
      getOpenStickyNotes: () => Promise<string[]>;
      focusMainWindowWithNote: (noteId: string) => Promise<void>;
      toggleAllStickyNotes: (show?: boolean) => Promise<boolean>;
      createAndOpenStickyNote: () => Promise<string>;
      revealStickyNote: (noteId: string) => Promise<boolean>;
      onNoteUpdated: (callback: (note: Note) => void) => () => void;
      onNoteDeleted: (callback: (noteId: string) => void) => () => void;
      onStickyListChanged: (callback: (openIds: string[]) => void) => () => void;
      onStickyFocusNote: (callback: (noteId: string) => void) => () => void;
      onStickyAttention: (callback: () => void) => () => void;
    };
  }
}

export interface StickyNoteConfig {
  color: string;
  opacity: number;
  pinned_top: boolean;
}
