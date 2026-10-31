/** Minimal window controls; no filesystem or unrestricted IPC is exposed. */
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('chatWindow', {
  minimize: () => ipcRenderer.invoke('whale:window', 'minimize'),
  close: () => ipcRenderer.invoke('whale:window', 'close'),
});
