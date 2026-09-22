import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('extensionCatalog', {
  read: () => ipcRenderer.invoke('extensions:catalog'),
})
