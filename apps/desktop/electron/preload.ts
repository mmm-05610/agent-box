import { contextBridge, ipcRenderer } from 'electron'
contextBridge.exposeInMainWorld('extensionCatalog', {
  read: () => ipcRenderer.invoke('extensions:catalog'),
})
contextBridge.exposeInMainWorld('projectDirectory', {
  choose: (): Promise<string | undefined> => ipcRenderer.invoke('projects:choose-directory'),
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
