// Extracted verbatim from main.ts (see docs/desktop-megafile-decomposition.md).
// main.ts keeps only the startup/lifecycle statement sequence; the accessors at the
// bottom exist so main can read/write the few mutable bindings the sequence needs.

import path from 'node:path'
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
import {
  cancelScheduledDesktopLogFlush,
  flushDesktopLogBufferSync,
  getRecentHermesLogLines,
  initDesktopLogBuffer,
  rememberLog
} from './log-buffer'
import {
  DEEPLINK_SCHEMES,
  DEV_SERVER,
  _rendererReadyForDeepLink,
  mainWindow,
} from './bootstrap-env-composition'

export const HERMES_PROTOCOL = DEV_SERVER ? 'hermes-dev' : 'hermes'

export let _pendingDeepLink = null

export function _extractDeepLink(argv) {
  if (!Array.isArray(argv)) {
    return null
  }

  return argv.find(a => typeof a === 'string' && DEEPLINK_SCHEMES.some(s => a.startsWith(`${s}://`))) || null
}

export function handleDeepLink(url) {
  if (!url || typeof url !== 'string') {
    return
  }

  let parsed

  try {
    parsed = new URL(url)
  } catch {
    rememberLog(`[deeplink] ignoring malformed url: ${url}`)

    return
  }

  const scheme = parsed.protocol.replace(/:$/, '')

  if (!DEEPLINK_SCHEMES.includes(scheme)) {
    rememberLog(`[deeplink] ignoring scheme ${scheme} (expected ${DEEPLINK_SCHEMES.join(' or ')})`)

    return
  }

  // hermes://blueprint/<key>?slot=val  -> host="blueprint", path="/<key>"
  const kind = parsed.hostname || ''
  const name = decodeURIComponent((parsed.pathname || '').replace(/^\//, ''))
  const params = {}
  parsed.searchParams.forEach((v, k) => {
    params[k] = v
  })
  const payload = { kind, name, params }

  if (!_rendererReadyForDeepLink || !mainWindow || mainWindow.isDestroyed()) {
    _pendingDeepLink = payload

    return
  }

  try {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }

    mainWindow.focus()
    mainWindow.webContents.send('hermes:deep-link', payload)
    rememberLog(`[deeplink] delivered ${kind}/${name}`)
  } catch (err) {
    rememberLog(`[deeplink] delivery failed: ${err.message}`)
  }
}

export function registerDeepLinkProtocol() {
  try {
    if (process.defaultApp && process.argv.length >= 2) {
      // Dev: register with the electron exec path + entry script so the OS can
      // relaunch us with the URL. argv[1] is usually "." when launched via
      // `electron .` from apps/desktop — resolve against cwd.
      const entry = path.resolve(process.argv[1])
      app.setAsDefaultProtocolClient(HERMES_PROTOCOL, process.execPath, [entry])
    } else {
      app.setAsDefaultProtocolClient(HERMES_PROTOCOL)
    }

    rememberLog(`[deeplink] registered ${HERMES_PROTOCOL}:// handler`)
  } catch (err) {
    rememberLog(`[deeplink] protocol registration failed: ${err.message}`)
  }
}

export function get_pendingDeepLink() {
  return _pendingDeepLink
}
export function set_pendingDeepLink(value: any) {
  _pendingDeepLink = value
}
