import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('extensionCatalog', {
  read: () => ipcRenderer.invoke('extensions:catalog'),
})
// Frameless window chrome exists only on Windows/Linux; macOS keeps the native title bar.
if (process.platform !== 'darwin') contextBridge.exposeInMainWorld('desktopWindow', {
  minimize: () => ipcRenderer.invoke('window:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('window:toggle-maximize'),
  close: () => ipcRenderer.invoke('window:close'),
  isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  onChromeState: (listener: (maximized: boolean) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized)
    ipcRenderer.on('window:chrome-state', handler)
    return () => ipcRenderer.off('window:chrome-state', handler)
  },
})
contextBridge.exposeInMainWorld('agentNative', {
  open: (adapterId: string) => ipcRenderer.invoke('agent-native:open', adapterId),
  send: (instanceId: string, frame: unknown) => ipcRenderer.invoke('agent-native:send', instanceId, frame),
  close: (instanceId: string) => ipcRenderer.invoke('agent-native:close', instanceId),
  subscribe: (listener: (event: { instanceId: string; frame?: unknown; error?: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: { instanceId: string; frame?: unknown; error?: string }) => listener(payload)
    ipcRenderer.on('agent-native:event', handler)
    return () => ipcRenderer.off('agent-native:event', handler)
  },
})
