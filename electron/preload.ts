import { contextBridge, ipcRenderer } from 'electron';

// ─── CyberNotes API Bridge ─────────────────────────────────────────────────
// Expone funciones seguras al renderer (React)

contextBridge.exposeInMainWorld('cyberNotesAPI', {
  // -- Ventana --
  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximizeToggle: () => ipcRenderer.invoke('window-maximize-toggle'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  onMaximizedState: (callback: (isMax: boolean) => void) => {
    const listener = (_e: any, isMax: boolean) => callback(isMax);
    ipcRenderer.on('window:maximized-state', listener);
    return () => ipcRenderer.removeListener('window:maximized-state', listener);
  },
  windowClose: () => ipcRenderer.invoke('window-close'),
  windowForceClose: () => ipcRenderer.invoke('window-force-close'),
  openDevTools: () => ipcRenderer.invoke('open-dev-tools'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  replaceMisspelling: (word: string) => ipcRenderer.invoke('replace-misspelling', word),
  addToDictionary: (word: string) => ipcRenderer.invoke('add-to-dictionary', word),
  writeImageToClipboard: (url: string) => ipcRenderer.invoke('clipboard:writeImage', url),
  unlockCapsLock: () => ipcRenderer.invoke('unlock-caps-lock'),
  checkCapsLock: () => ipcRenderer.invoke('check-caps-lock'),
  onContextMenuData: (callback: (data: any) => void) => {
    const listener = (_e: any, data: any) => callback(data);
    ipcRenderer.on('context-menu-data', listener);
    return () => ipcRenderer.removeListener('context-menu-data', listener);
  },
  onStatusBarUrl: (callback: (url: string) => void) => {
    const listener = (_e: any, url: string) => callback(url);
    ipcRenderer.on('status-bar-url', listener);
    return () => ipcRenderer.removeListener('status-bar-url', listener);
  },
  onSettingChanged: (callback: (data: { key: string, value: string }) => void) => {
    const listener = (_e: any, data: any) => callback(data);
    ipcRenderer.on('setting-changed', listener);
    return () => ipcRenderer.removeListener('setting-changed', listener);
  },
  onGlobalCapsLockChanged: (callback: (active: boolean) => void) => {
    const listener = (_e: any, active: boolean) => callback(active);
    ipcRenderer.on('global-caps-lock-changed', listener);
    return () => ipcRenderer.removeListener('global-caps-lock-changed', listener);
  },
  onOpenSettings: (callback: (tab?: string) => void) => {
    const listener = (_e: any, tab?: string) => callback(tab);
    ipcRenderer.on('open-settings', listener);
    return () => ipcRenderer.removeListener('open-settings', listener);
  },
  onOpenAbout: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('open-about', listener);
    return () => ipcRenderer.removeListener('open-about', listener);
  },
  openTaskbarSettings: () => ipcRenderer.invoke('open-taskbar-settings'),
  onOpenTrayPin: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('open-tray-pin', listener);
    return () => ipcRenderer.removeListener('open-tray-pin', listener);
  },
  onConfirmUnsavedExit: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('confirm-unsaved-exit', listener);
    return () => ipcRenderer.removeListener('confirm-unsaved-exit', listener);
  },
  respondUnsavedExit: (discard: boolean) => ipcRenderer.invoke('confirm-unsaved-exit-response', discard),

  // -- Session lock (privacy: no note flash from tray after idle) --
  reportActivity: () => ipcRenderer.invoke('session:activity'),
  setSessionLocked: (locked: boolean) => ipcRenderer.invoke('session:set-locked', locked),
  isSessionLocked: () => ipcRenderer.invoke('session:is-locked'),
  ackSessionLocked: () => ipcRenderer.send('session:locked'),
  onForceLock: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('session:force-lock', listener);
    return () => ipcRenderer.removeListener('session:force-lock', listener);
  },
  onShieldEnable: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('session:shield-enable', listener);
    return () => ipcRenderer.removeListener('session:shield-enable', listener);
  },
  onShieldDisable: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('session:shield-disable', listener);
    return () => ipcRenderer.removeListener('session:shield-disable', listener);
  },

  // -- Auth --
  hasPassword: () => ipcRenderer.invoke('auth:hasPassword'),
  setPassword: (password: string) => ipcRenderer.invoke('auth:setPassword', password),
  verifyPassword: (password: string) => ipcRenderer.invoke('auth:verifyPassword', password),
  removePassword: () => ipcRenderer.invoke('auth:removePassword'),

  // -- Unsaved Changes --
  setUnsavedChanges: (val: boolean) => ipcRenderer.invoke('window:unsavedChanges:set', val),

  // -- Settings --
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  getSettings: (keys: string[]) => ipcRenderer.invoke('settings:getMany', keys),
  setSetting: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  setAutoStart: (enable: boolean) => ipcRenderer.invoke('settings:setAutoStart', enable),
  getAutoStart: () => ipcRenderer.invoke('settings:getAutoStart'),

  // -- Folders --
  getFolders: () => ipcRenderer.invoke('folders:getAll'),
  createFolder: (folder: any) => ipcRenderer.invoke('folders:create', folder),
  updateFolder: (folder: any) => ipcRenderer.invoke('folders:update', folder),
  deleteFolder: (id: string) => ipcRenderer.invoke('folders:delete', id),

  // -- Notes --
  getAllNotes: () => ipcRenderer.invoke('notes:getAll'),
  getNotesByFolder: (folderId: string | null) => ipcRenderer.invoke('notes:getByFolder', folderId),
  getNoteById: (id: string) => ipcRenderer.invoke('notes:getById', id),
  saveNote: (note: any) => ipcRenderer.invoke('notes:save', note),
  deleteNote: (id: string) => ipcRenderer.invoke('notes:delete', id),
  searchNotes: (query: string) => ipcRenderer.invoke('notes:search', query),
  getTrashNotes: () => ipcRenderer.invoke('notes:getTrash'),
  searchTrashNotes: (query: string) => ipcRenderer.invoke('notes:searchTrash', query),
  getTrashCount: () => ipcRenderer.invoke('notes:getTrashCount'),
  restoreNote: (id: string) => ipcRenderer.invoke('notes:restore', id),
  restoreAllTrash: () => ipcRenderer.invoke('notes:restoreAll'),
  purgeNote: (id: string) => ipcRenderer.invoke('notes:purge', id),
  emptyTrash: () => ipcRenderer.invoke('notes:emptyTrash'),

  // -- Images --
  selectAndSaveImage: () => ipcRenderer.invoke('images:selectAndSave'),

  // -- Import / Export --
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),

  // -- Updates / About --
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  cancelAutoInstall: () => ipcRenderer.invoke('update:cancelAutoInstall'),
  onUpdateStatus: (callback: (status: any) => void) => {
    const listener = (_e: any, status: any) => callback(status);
    ipcRenderer.on('update:status', listener);
    return () => ipcRenderer.removeListener('update:status', listener);
  },
  getVersions: () => ipcRenderer.invoke('app:getVersions'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // -- Sticky Notes --
  openStickyNote: (noteId: string) => ipcRenderer.invoke('sticky:open', noteId),
  closeStickyNote: (noteId: string) => ipcRenderer.invoke('sticky:close', noteId),
  toggleStickyAlwaysOnTop: (noteId: string) => ipcRenderer.invoke('sticky:toggleAlwaysOnTop', noteId),
  getStickyConfig: (noteId: string) => ipcRenderer.invoke('sticky:getConfig', noteId),
  saveStickyConfig: (noteId: string, config: any) => ipcRenderer.invoke('sticky:saveConfig', noteId, config),
  moveStickyWindow: (noteId: string, x: number, y: number) =>
    ipcRenderer.send('sticky:move', noteId, x, y),
  getOpenStickyNotes: () => ipcRenderer.invoke('sticky:getOpenList'),
  focusMainWindowWithNote: (noteId: string) => ipcRenderer.invoke('sticky:focusMain', noteId),
  toggleAllStickyNotes: (show?: boolean) => ipcRenderer.invoke('sticky:toggleAll', show),
  createAndOpenStickyNote: () => ipcRenderer.invoke('sticky:createAndOpen'),
  onNoteUpdated: (callback: (note: any) => void) => {
    const listener = (_e: any, note: any) => callback(note);
    ipcRenderer.on('note:updated', listener);
    return () => ipcRenderer.removeListener('note:updated', listener);
  },
  onNoteDeleted: (callback: (noteId: string) => void) => {
    const listener = (_e: any, noteId: string) => callback(noteId);
    ipcRenderer.on('note:deleted', listener);
    return () => ipcRenderer.removeListener('note:deleted', listener);
  },
  onStickyListChanged: (callback: (openIds: string[]) => void) => {
    const listener = (_e: any, openIds: string[]) => callback(openIds);
    ipcRenderer.on('sticky:list-changed', listener);
    return () => ipcRenderer.removeListener('sticky:list-changed', listener);
  },
  onStickyFocusNote: (callback: (noteId: string) => void) => {
    const listener = (_e: any, noteId: string) => callback(noteId);
    ipcRenderer.on('sticky:focus-note', listener);
    return () => ipcRenderer.removeListener('sticky:focus-note', listener);
  },
});
