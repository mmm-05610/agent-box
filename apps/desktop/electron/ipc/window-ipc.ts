// IPC surface extracted from main.ts. Channel names, payloads and error
// semantics unchanged; state authority stays with main.ts via this deps object.

import fs from 'node:fs'
import path from 'node:path'

import {
  BrowserWindow,
  webContents as electronWebContents,
  ipcMain,
  systemPreferences
} from 'electron'

import {
  rememberLog
} from '../app/log-buffer'
import { normalizeActiveWork } from '../app/quit-guard'
import { readWindowBelow } from '../host-capabilities/platform/window-below'
import {
  performFindAfterIndexingStarted,
  stopFind
} from '../windows/find-in-page'
import { sanitizeQuickEntrySettings } from '../windows/quick-entry'
import {
  DEFAULT_ZOOM_LEVEL,
  percentToZoomLevel,
  zoomLevelToPercent
} from '../windows/zoom'

export interface RegisterWindowIpcDeps {
  createSessionWindow: any
  createInstanceWindow: any
  createBrowserWindow: any
  setAndPersistZoomLevel: any
  getPreviewShortcutActive: () => any
  setPreviewShortcutActive: (value: any) => void
  IS_MAC: any
  claimedAmbientCue: any
  lastContextMenuPoint: any
  activeWorkByWebContents: any
  updateStreamThrottleFromActiveWork: any
  KEEP_AWAKE_CONFIG_PATH: any
  keepAwake: any
  readQuickEntrySettings: any
  quickEntryShortcut: any
  writeQuickEntrySettings: any
  applyQuickEntrySettings: any
  getMainWindow: () => any
  hideQuickEntryWindow: any
  getQuickEntryWindow: () => any
  getQuickEntryLastState: () => any
  setQuickEntryLastState: (value: any) => void
  getF12Blocked: () => any
  setF12Blocked: (value: any) => void
  DISABLE_F12_CONFIG_PATH: any
  ensureFoundInPageForwarder: any
}

export function registerWindowIpc({ createSessionWindow, createInstanceWindow, createBrowserWindow, setAndPersistZoomLevel, getPreviewShortcutActive, setPreviewShortcutActive, IS_MAC, claimedAmbientCue, lastContextMenuPoint, activeWorkByWebContents, updateStreamThrottleFromActiveWork, KEEP_AWAKE_CONFIG_PATH, keepAwake, readQuickEntrySettings, quickEntryShortcut, writeQuickEntrySettings, applyQuickEntrySettings, getMainWindow, hideQuickEntryWindow, getQuickEntryWindow, getQuickEntryLastState, setQuickEntryLastState, getF12Blocked, setF12Blocked, DISABLE_F12_CONFIG_PATH, ensureFoundInPageForwarder }: RegisterWindowIpcDeps) {
ipcMain.handle('hermes:window:openSession', async (_event, sessionId, opts) => {
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return { ok: false, error: 'invalid-session-id' }
  }

  createSessionWindow(sessionId.trim(), {
    profile: typeof opts?.profile === 'string' ? opts.profile : null,
    watch: opts?.watch === true
  })

  return { ok: true }
})

ipcMain.handle('hermes:window:openInstance', async () => {
  createInstanceWindow()

  return { ok: true }
})

ipcMain.handle('hermes:window:openBrowser', async (_event, tabId) => {
  if (typeof tabId !== 'string' || !tabId.trim()) {
    return { ok: false, error: 'invalid-tab-id' }
  }

  createBrowserWindow(tabId.trim())

  return { ok: true }
})

ipcMain.handle('hermes:zoom:get', event => {
  const window = BrowserWindow.fromWebContents(event.sender)

  const level = window && !window.isDestroyed() ? window.webContents.getZoomLevel() : DEFAULT_ZOOM_LEVEL

  return { level, percent: zoomLevelToPercent(level) }
})

ipcMain.on('hermes:zoom:set-percent', (event, percent) => {
  const window = BrowserWindow.fromWebContents(event.sender)

  if (!window || window.isDestroyed()) {
    return
  }

  setAndPersistZoomLevel(window, percentToZoomLevel(Number(percent)))
})

ipcMain.on('hermes:previewShortcutActive', (_event, active) => {
  setPreviewShortcutActive(Boolean(active))
})

ipcMain.handle('hermes:window:readBelow', async event => {
  const win = BrowserWindow.fromWebContents(event.sender)

  if (!win || win.isDestroyed()) {
    return null
  }

  const titlesAvailable = IS_MAC ? systemPreferences.getMediaAccessStatus?.('screen') === 'granted' : true

  const [x, y] = win.getPosition()
  const [width, height] = win.getSize()

  return readWindowBelow(process.pid, { x, y, width, height }, titlesAvailable)
})

ipcMain.handle('hermes:ambient:claim', (_event, key) => !claimedAmbientCue(String(key ?? '')))

ipcMain.handle('hermes:context-menu:edit', (event, command) => {
  const contents = event.sender

  if (command === 'copy') {
    contents.copy()
  } else if (command === 'cut') {
    contents.cut()
  } else if (command === 'paste') {
    contents.paste()
  } else if (command === 'selectAll') {
    contents.selectAll()
  }
})

ipcMain.handle('hermes:context-menu:copy-image', event => {
  const point = lastContextMenuPoint.get(event.sender.id)

  if (point) {
    event.sender.copyImageAt(point.x, point.y)
  }
})

ipcMain.handle('hermes:context-menu:spellcheck', (event, action) => {
  const kind = action?.kind
  const word = String(action?.word || '')

  if (!word) {
    return
  }

  if (kind === 'replace') {
    event.sender.replaceMisspelling(word)
  } else if (kind === 'add') {
    event.sender.session.addWordToSpellCheckerDictionary(word)
  }
})

ipcMain.handle('hermes:context-menu:guest-add-word', (_event, payload) => {
  const word = String(payload?.word || '')
  const guest = electronWebContents.fromId(Number(payload?.webContentsId))

  if (word && guest && !guest.isDestroyed()) {
    guest.session.addWordToSpellCheckerDictionary(word)
  }
})

ipcMain.on('hermes:active-work', (event, payload) => {
  const id = event.sender.id

  if (!activeWorkByWebContents.has(id)) {
    event.sender.once('destroyed', () => {
      activeWorkByWebContents.delete(id)
      updateStreamThrottleFromActiveWork()
    })
  }

  activeWorkByWebContents.set(id, normalizeActiveWork(payload))
  updateStreamThrottleFromActiveWork()
})

ipcMain.on('hermes:keep-awake', (_event, on) => {
  const enabled = Boolean(on)
  keepAwake.set(enabled)

  try {
    fs.mkdirSync(path.dirname(KEEP_AWAKE_CONFIG_PATH), { recursive: true })
    fs.writeFileSync(KEEP_AWAKE_CONFIG_PATH, JSON.stringify({ on: enabled }, null, 2), 'utf8')
  } catch (error) {
    rememberLog(`[keep-awake] write failed: ${error.message}`)
  }
})

ipcMain.handle('hermes:quick-entry:settings:get', async () => {
  const settings = readQuickEntrySettings()
  const state = quickEntryShortcut.current()

  // Ground truth is what the last apply produced; the shortcut we report is the
  // live one (a saved-but-rejected chord still shows what the user asked for).
  return {
    enabled: settings.enabled,
    error: state.error,
    registered: state.registered,
    shortcut: settings.enabled ? state.shortcut : settings.shortcut
  }
})

ipcMain.handle('hermes:quick-entry:settings:set', async (_event, patch) => {
  const current = readQuickEntrySettings()

  const next = sanitizeQuickEntrySettings({
    enabled: patch?.enabled === undefined ? current.enabled : patch.enabled === true,
    shortcut: typeof patch?.shortcut === 'string' && patch.shortcut.trim() ? patch.shortcut : current.shortcut
  })

  writeQuickEntrySettings(next)

  return applyQuickEntrySettings(next)
})

ipcMain.on('hermes:quick-entry:submit', (_event, payload) => {
  hideQuickEntryWindow()

  const text = typeof payload?.text === 'string' ? payload.text.trim() : ''

  if (!text) {
    return
  }

  if (!getMainWindow() || getMainWindow().isDestroyed()) {
    rememberLog('[quick-entry] dropped a submit: no primary window to route it to')

    return
  }

  // Deliberately does NOT raise/focus the main window — the user asked to fire
  // a prompt from wherever they were, not to be yanked into the app.
  getMainWindow().webContents.send('hermes:quick-entry:submit', {
    target: typeof payload?.target === 'string' && payload.target ? payload.target : 'current',
    text
  })
})

ipcMain.on('hermes:quick-entry:state', (_event, payload) => {
  setQuickEntryLastState(payload ?? null)

  if (getQuickEntryWindow() && !getQuickEntryWindow().isDestroyed()) {
    getQuickEntryWindow().webContents.send('hermes:quick-entry:state', payload)
  }
})

ipcMain.on('hermes:quick-entry:dismiss', () => hideQuickEntryWindow())

ipcMain.on('hermes:devtools:disable-f12', (_event, on) => {
  setF12Blocked(Boolean(on))

  try {
    fs.mkdirSync(path.dirname(DISABLE_F12_CONFIG_PATH), { recursive: true })
    fs.writeFileSync(DISABLE_F12_CONFIG_PATH, JSON.stringify({ on: getF12Blocked() }, null, 2), 'utf8')
  } catch (error) {
    rememberLog(`[disable-f12] write failed: ${error.message}`)
  }
})

ipcMain.handle('hermes:find-in-page', async (event, query, options) => {
  const win = BrowserWindow.fromWebContents(event.sender)

  if (!win || win.isDestroyed()) {
    return { count: 0 }
  }

  ensureFoundInPageForwarder(event.sender)
  await performFindAfterIndexingStarted(win.webContents, query, options)

  // The match count still arrives asynchronously via `found-in-page`; this
  // reply only acknowledges that Chromium has begun returning this request.
  return { count: 0 }
})

ipcMain.handle('hermes:stop-find-in-page', event => {
  const win = BrowserWindow.fromWebContents(event.sender)

  if (!win || win.isDestroyed()) {
    return
  }

  stopFind(win.webContents)
})
}
