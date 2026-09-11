// IPC surface extracted from main.ts. Channel names, payloads and error
// semantics unchanged; state authority stays with main.ts via this deps object.

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  net as electronNet,
  webContents as electronWebContents,
  globalShortcut,
  ipcMain,
  Menu,
  nativeTheme,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  safeStorage,
  screen,
  session,
  shell,
  systemPreferences
} from 'electron'
import { type FaviconIo, resolveFavicon } from '../../favicon'
import { fetchMarketplaceThemes, searchMarketplaceThemes } from '../../vscode-marketplace'

export interface RegisterPreviewIpcDeps {
  openExternalUrl: any
  reachablePreviewUrl: any
  openPreviewInBrowser: any
  fetchLinkTitle: any
  resolveFaviconCached: any
}

export function registerPreviewIpc({ openExternalUrl, reachablePreviewUrl, openPreviewInBrowser, fetchLinkTitle, resolveFaviconCached }: RegisterPreviewIpcDeps) {
ipcMain.handle('hermes:openExternal', (_event, url) => {
  if (!openExternalUrl(url)) {
    throw new Error('Invalid external URL')
  }
})

ipcMain.handle('hermes:preview:reach', async (event, url) => reachablePreviewUrl(event.sender.id, String(url || '')))

ipcMain.handle('hermes:openPreviewInBrowser', async (_event, url) => {
  if (!(await openPreviewInBrowser(url))) {
    throw new Error('Invalid preview URL')
  }
})

ipcMain.handle('hermes:fetchLinkTitle', (_event, url) => fetchLinkTitle(url))

ipcMain.handle('hermes:resolveFavicon', (_event, url) => resolveFaviconCached(url))

ipcMain.handle('hermes:vscode-theme:fetch', async (_event, id) => fetchMarketplaceThemes(String(id || '')))

ipcMain.handle('hermes:vscode-theme:search', async (_event, query) => searchMarketplaceThemes(String(query || ''), 20))
}
