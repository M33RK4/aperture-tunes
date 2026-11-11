const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aperture', {
  openPath: (p) => ipcRenderer.invoke('open-path', p),
  openOutput: () => ipcRenderer.invoke('open-output'),
  getProfile: () => ipcRenderer.invoke('profile-get'),
  setProfile: (patch) => ipcRenderer.invoke('profile-set', patch),
  getStats: () => ipcRenderer.invoke('stats-get'),
  setStats: (data) => ipcRenderer.send('stats-set', data),
  win: (action) => ipcRenderer.send('win', action),
  // player <-> mini player / tray
  sendState: (state) => ipcRenderer.send('np-state', state),
  onState: (fn) => ipcRenderer.on('np-state', (e, s) => fn(s)),
  media: (cmd) => ipcRenderer.send('media', cmd),
  onMedia: (fn) => ipcRenderer.on('media', (e, cmd) => fn(cmd)),
  mini: (action) => ipcRenderer.invoke('mini', action),
});
