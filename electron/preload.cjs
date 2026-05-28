const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  pickFolders: () => ipcRenderer.invoke('dialog:pickFolders'),
  pickBackgroundImage: () => ipcRenderer.invoke('dialog:pickBackgroundImage'),
  pickLyricFile: () => ipcRenderer.invoke('dialog:pickLyricFile'),
  pickDownloadDirectory: () => ipcRenderer.invoke('dialog:pickDownloadDirectory'),
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (payload) => ipcRenderer.invoke('data:save', payload),
  scanFolders: (folders) => ipcRenderer.invoke('scan:folders', folders),
  rescanTrack: (trackPath) => ipcRenderer.invoke('scan:singleTrack', trackPath),
  readTextFile: (filePath) => ipcRenderer.invoke('file:readText', filePath),
  readTextFileWithEncoding: (filePath, encoding) => ipcRenderer.invoke('file:readTextWithEncoding', filePath, encoding),
  writeTextFile: (filePath, content) => ipcRenderer.invoke('file:writeText', filePath, content),
  readImageDataUrl: (filePath) => ipcRenderer.invoke('file:readImageDataUrl', filePath),
  readTrackCoverDataUrl: (filePath) => ipcRenderer.invoke('track:readCoverDataUrl', filePath),
  installLyricForTrack: (trackPath, lyricPath) => ipcRenderer.invoke('lyrics:installForTrack', trackPath, lyricPath),
  setLyricDownloadTarget: (trackPath) => ipcRenderer.invoke('lyrics:setDownloadTarget', trackPath),
  clearLyricDownloadTarget: () => ipcRenderer.invoke('lyrics:clearDownloadTarget'),
  openLyricFinderWindow: (payload) => ipcRenderer.invoke('lyrics:openFinderWindow', payload),
  shiftAndSaveLyrics: (lyricPath, offsetSec) => ipcRenderer.invoke('lyrics:shiftAndSave', lyricPath, offsetSec),
  showItemInFolder: (filePath) => ipcRenderer.invoke('file:showInFolder', filePath),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  readAudioBuffer: (filePath) => ipcRenderer.invoke('audio:readBuffer', filePath),
  testAiConnection: (config) => ipcRenderer.invoke('ai:testConnection', config),
  recommendDiscoverSongs: (payload) => ipcRenderer.invoke('ai:recommendDiscoverSongs', payload),
  testCloudConnection: (config) => ipcRenderer.invoke('cloud:testConnection', config),
  getDefaultDownloadDirectory: () => ipcRenderer.invoke('cloud:getDefaultDownloadDirectory'),
  searchCloudSongs: (payload) => ipcRenderer.invoke('cloud:searchSongs', payload),
  getCloudSongDetail: (payload) => ipcRenderer.invoke('cloud:getSongDetail', payload),
  getCloudSongUrl: (payload) => ipcRenderer.invoke('cloud:getSongUrl', payload),
  getCloudSongLyric: (payload) => ipcRenderer.invoke('cloud:getSongLyric', payload),
  scrapeCloudTrack: (payload) => ipcRenderer.invoke('cloud:scrapeTrack', payload),
  scrapeCloudLibrary: (payload) => ipcRenderer.invoke('cloud:scrapeLibrary', payload),
  readCloudImageDataUrl: (url) => ipcRenderer.invoke('cloud:readImageDataUrl', url),
  downloadCloudSong: (payload) => ipcRenderer.invoke('cloud:downloadSong', payload),
  getCloudDownloadTasks: () => ipcRenderer.invoke('cloud:getDownloadTasks'),
  pauseCloudDownload: (taskId) => ipcRenderer.invoke('cloud:pauseDownload', taskId),
  resumeCloudDownload: (taskId) => ipcRenderer.invoke('cloud:resumeDownload', taskId),
  cancelCloudDownload: (taskId) => ipcRenderer.invoke('cloud:cancelDownload', taskId),
  deleteCloudDownloadTask: (taskId) => ipcRenderer.invoke('cloud:deleteDownloadTask', taskId),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowToggleMaximize: () => ipcRenderer.invoke('window:toggleMaximize'),
  windowIsMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  windowClose: () => ipcRenderer.invoke('window:close'),
  showLyricsWindow: () => ipcRenderer.invoke('lyrics:showWindow'),
  hideLyricsWindow: () => ipcRenderer.invoke('lyrics:hideWindow'),
  updateLyricsWindow: (payload) => ipcRenderer.invoke('lyrics:update', payload),
  setLyricsWindowOptions: (options) => ipcRenderer.invoke('lyrics:setOptions', options),
  onLyricsMinimized: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('lyrics:minimized', handler);
    return () => ipcRenderer.removeListener('lyrics:minimized', handler);
  },
  onLyricDownloaded: (cb) => {
    const handler = (_, payload) => cb(payload);
    ipcRenderer.on('lyrics:downloaded', handler);
    return () => ipcRenderer.removeListener('lyrics:downloaded', handler);
  },
  onCloudDownloadProgress: (cb) => {
    const handler = (_, payload) => cb(payload);
    ipcRenderer.on('cloud:download-progress', handler);
    return () => ipcRenderer.removeListener('cloud:download-progress', handler);
  },
  onCloudDownloadDone: (cb) => {
    const handler = (_, payload) => cb(payload);
    ipcRenderer.on('cloud:download-done', handler);
    return () => ipcRenderer.removeListener('cloud:download-done', handler);
  },
  onCloseBehaviorUpdated: (cb) => {
    const handler = (_, behavior) => cb(behavior);
    ipcRenderer.on('settings:closeBehavior', handler);
    return () => ipcRenderer.removeListener('settings:closeBehavior', handler);
  },
  onWindowMaximizedChanged: (cb) => {
    const handler = (_, maximized) => cb(!!maximized);
    ipcRenderer.on('window:maximizedChanged', handler);
    return () => ipcRenderer.removeListener('window:maximizedChanged', handler);
  }
});
