/** Minimal window controls; no filesystem or unrestricted IPC is exposed. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chatWindow', {
  onHistoryChanged: (listener) => {
    const handler = () => listener();
    ipcRenderer.on('whale:history-changed', handler);
    return () => ipcRenderer.removeListener('whale:history-changed', handler);
  },
  importMusic: () => ipcRenderer.invoke('whale:music-import'),
  minimize: () => ipcRenderer.invoke('whale:window', 'minimize'),
  close: () => ipcRenderer.invoke('whale:window', 'close'),
});
