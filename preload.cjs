const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aperture', {
  saveFolder: () => ipcRenderer.invoke('save-folder'),
  openOutput: () => ipcRenderer.invoke('open-output'),
  getProfile: () => ipcRenderer.invoke('profile-get'),
  setProfile: (patch) => ipcRenderer.invoke('profile-set', patch),
  win: (action) => ipcRenderer.send('win', action),
});
