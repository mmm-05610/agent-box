import {
  nextInstanceBounds,
  hudBounds,
} from '../main'
// Extracted verbatim from main.ts (see docs/desktop-megafile-decomposition.md).
// main.ts keeps only the startup/lifecycle statement sequence; the accessors at the
// bottom exist so main can read/write the few mutable bindings the sequence needs.

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
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
  BROWSER_WINDOW_HEIGHT,
  BROWSER_WINDOW_MIN_HEIGHT,
  BROWSER_WINDOW_MIN_WIDTH,
  BROWSER_WINDOW_WIDTH,
  buildBrowserWindowUrl
} from '../browser-windows'
import { detectBundleSkew } from '../bundle-skew'
import {
  cancelScheduledDesktopLogFlush,
  flushDesktopLogBufferSync,
  getRecentHermesLogLines,
  initDesktopLogBuffer,
  rememberLog
} from './log-buffer'
import {
  applyTitleBarOverlay,
  applyWindowTranslucency,
  chatWindowSurfaceOptions,
  getTitleBarOverlayOptions,
  getTranslucencyState,
  isHexColor,
  setRendererTitleBarTheme,
  setTranslucencyState,
  THEME_SOURCES,
  translucencyBackedWindows,
  writePersistedThemeSource,
  writePersistedTranslucency
} from './window-theme'
import {
  ATTACHMENT_UPLOAD_DEFAULT_MAX_BYTES,
  clampDataUrlReadMaxMb,
  DATA_URL_READ_DEFAULT_MAX_MB,
  dataUrlReadMaxBytesFromMb,
  DEFAULT_FETCH_TIMEOUT_MS,
  enableBasicPasswordStoreEncryption,
  encryptDesktopSecret as encryptDesktopSecretStrict,
  readFileDataUrlForIpc,
  resolvePersistedRemoteToken,
  resolveReadableFileForIpc,
  resolveRequestedPathForIpc,
  resolveTimeoutMs,
  SAFE_STORAGE_ENCODING,
  TEXT_PREVIEW_SOURCE_MAX_BYTES,
  tightenSecretFileMode,
  writeSecretFileAtomic
} from '../hardening'
import { cursorPointInWindow } from '../hud-cursor'
import { startHudGameOverlayWatch } from '../hud-game-overlay'
import { applyHudElectronOverlay, promoteHudOverlay } from '../hud-overlay'
import { snapHudBounds } from '../hud-snap'
import { createHudSnapShortcut } from '../hud-snap-shortcut'
import { buildHudWindowUrl } from '../hud-url'
import { resolveHudWindowing } from '../hud-windowing'
import { createQuickEntryShortcut, quickEntryWindowBounds, sanitizeQuickEntrySettings } from '../quick-entry'
import { attachRendererConsoleCapture, formatRendererBoundaryReport } from '../renderer-log'
import {
  buildInstanceWindowUrl,
  buildSessionWindowUrl,
  chatWindowWebPreferences,
  createSessionWindowRegistry,
  instanceWindowBounds,
  SESSION_WINDOW_MIN_HEIGHT,
  SESSION_WINDOW_MIN_WIDTH
} from '../session-windows'
import { enumerateWindowsFrontToBack, enumerationFailed, readWindowBelow } from '../window-below'
import { installWindowRendererLifecycle } from '../window-renderer-lifecycle'
import {
  bindGeometryPersistence,
  computeWindowOptions,
  debounce,
  sanitizeWindowState,
  MIN_HEIGHT as WINDOW_MIN_HEIGHT,
  MIN_WIDTH as WINDOW_MIN_WIDTH
} from '../window-state'
import {
  connectWindowsRemote,
  detectRemotePlatform,
  helper,
  probeWindowsRemote,
  terminateOwnedWindowsDashboardForUpdate
} from '../windows-remote-lifecycle'
import {
  applyZoomLevel,
  DEFAULT_ZOOM_LEVEL,
  installZoomReassertOnNavigation,
  installZoomReassertOnWindowEvents,
  percentToZoomLevel,
  ZOOM_STEP,
  ZOOM_STORAGE_KEY,
  zoomLevelToPercent,
  zoomWiringForWindowKind
} from '../zoom'
import {
  APP_NAME,
  DEV_SERVER,
  HUD_WINDOW_TITLE,
  INSTALL_STAMP,
  IS_MAC,
  PRELOAD_PATH,
  RENDERER_RELOAD_MAX,
  RENDERER_RELOAD_WINDOW_MS,
  WINDOW_BUTTON_POSITION,
  getAppIconPath,
  installPreviewShortcut,
  loadWindowUrl,
  mainWindow,
  openExternalUrl,
  petOverlayWindow,
  rendererReloadTimesRef,
  resolveRendererIndex,
  resolveUpdateRoot,
  runGit,
  sendClosePreviewRequested,
  sendPreviewNavCommand,
  sendWindowStateChanged,
  setAndPersistZoomLevel,
  streamThrottle,
  toggleDevTools,
  wireCommonWindowHandlers,
  wireWindowReveal,
  writeFileAtomic,
  getPetOverlayWindow,
  setPetOverlayWindow,
} from './bootstrap-env-composition'
import {
  resolveHermesVersion,
} from './paths-composition'

export async function openPreviewInBrowser(rawUrl) {
  const raw = String(rawUrl || '').trim()

  if (!raw) {
    return false
  }

  let parsed

  try {
    parsed = new URL(raw)
  } catch {
    return false
  }

  if (parsed.protocol === 'file:') {
    let localPath

    try {
      localPath = resolveRequestedPathForIpc(parsed.toString(), { purpose: 'Open preview in browser' })
    } catch {
      return false
    }

    await shell.openExternal(pathToFileURL(localPath).toString())

    return true
  }

  return openExternalUrl(raw)
}

export function sendOpenFolderRequested() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const webContents = mainWindow.webContents

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:open-folder-requested')
}

export function sendOpenUpdatesRequested() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const { webContents } = mainWindow

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:open-updates')

  if (!mainWindow.isVisible()) {
    mainWindow.show()
  }

  mainWindow.focus()
}

export function buildApplicationMenu() {
  const template = []

  const checkForUpdatesItem = {
    label: 'Check for Updates…',
    click: () => sendOpenUpdatesRequested()
  }

  if (IS_MAC) {
    template.push({
      label: APP_NAME,
      submenu: [
        { label: `About ${APP_NAME}`, click: () => showAboutPanelFresh() },
        checkForUpdatesItem,
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push({
    label: 'File',
    submenu: [
      // No accelerator: ⌘⇧N is a rebindable renderer keybind (session.newWindow);
      // a menu accelerator would fight the rebind panel and (on macOS) be
      // swallowed before the renderer sees it. Here purely for discoverability.
      { click: () => createInstanceWindow(), label: 'New Window' },
      // Same no-accelerator rationale: ⌘O is the rebindable renderer keybind
      // (workspace.openFolder). Clicking runs the same open-folder-as-project
      // flow through the renderer.
      { click: () => sendOpenFolderRequested(), label: 'Open Folder…' },
      { type: 'separator' },
      IS_MAC
        ? {
            // NO accelerator: on macOS a registered ⌘W is consumed by the OS
            // menu before the web contents ever sees it (and registerAccelerator
            // false is a no-op on mac — electron#18295). Leaving it off lets the
            // `before-input-event` handler below intercept ⌘W and route it to the
            // renderer's close-active-tab. Clicking the item still closes the tab
            // (or window) via the same request.
            click: () => sendClosePreviewRequested(),
            label: 'Close'
          }
        : { role: 'quit' }
    ]
  })
  template.push({
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      // ⌘⇧V is only wired up by this item existing: an accelerator with no menu
      // entry is never translated into an editor command, so the chord was a
      // no-op in every input in the app. The composer inserts plain text on
      // every paste anyway, so this is the same result as ⌘V there — it's the
      // terminal, preview, and other editable surfaces that need the strip.
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' }
    ]
  })
  template.push({
    label: 'View',
    submenu: [
      // Not `role: 'reload'`: that hard-reloads the RENDERER (every pane, the
      // whole shell) and a focused in-app browser needs ⌘R to mean "reload
      // this page", the way it does in every other browser. ⇧⌘R
      // (`forceReload`) below stays the unconditional escape hatch.
      //
      // No accelerator: ⌘R is claimed in `installPreviewShortcut`, which works
      // on every platform (this menu exists only on macOS). Declaring it here
      // too would fire the item and the input hook for one keypress.
      { click: () => sendPreviewNavCommand('reload'), label: 'Reload' },
      { role: 'forceReload' },
      {
        label: 'Toggle Developer Tools',
        accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
        click: (_menuItem, browserWindow) => toggleDevTools(browserWindow || mainWindow)
      },
      { type: 'separator' },
      {
        label: 'Actual Size',
        accelerator: 'CommandOrControl+0',
        click: () => {
          setAndPersistZoomLevel(mainWindow, DEFAULT_ZOOM_LEVEL)
        }
      },
      {
        label: 'Zoom In',
        accelerator: 'CommandOrControl+Plus',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            setAndPersistZoomLevel(mainWindow, mainWindow.webContents.getZoomLevel() + ZOOM_STEP)
          }
        }
      },
      {
        label: 'Zoom Out',
        accelerator: 'CommandOrControl+-',
        click: () => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            setAndPersistZoomLevel(mainWindow, mainWindow.webContents.getZoomLevel() - ZOOM_STEP)
          }
        }
      },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  })
  template.push({
    label: 'Window',
    submenu: IS_MAC
      ? [{ role: 'minimize' }, { role: 'zoom' }, { role: 'front' }]
      : [{ role: 'minimize' }, { role: 'close' }]
  })
  template.push({
    label: 'Help',
    role: 'help',
    submenu: [checkForUpdatesItem]
  })

  return Menu.buildFromTemplate(template)
}

export function isMediaCapturePermission(permission, details) {
  if (permission === 'audioCapture' || permission === 'videoCapture') {
    return true
  }

  if (permission !== 'media') {
    return false
  }

  const mediaTypes = details?.mediaTypes

  // Windows: mediaTypes is often empty for a capture request. Don't deny on
  // missing metadata.
  if (!Array.isArray(mediaTypes) || mediaTypes.length === 0) {
    return true
  }

  return mediaTypes.includes('audio') || mediaTypes.includes('video')
}

export function installMediaPermissions() {
  // Async request handler: the prompt-style path (most platforms).
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(isMediaCapturePermission(permission, details))
  })

  // Synchronous check handler: Chromium consults this for getUserMedia on
  // Windows in addition to (or instead of) the request handler. Without it,
  // the check defaults to false and capture is denied before the request
  // handler ever runs.
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return (
      permission === 'media' ||
      permission === ('audioCapture' as any) /* todo: is this needed? */ ||
      permission === ('videoCapture' as any)
    )
  })
}

export function focusWindow(win) {
  if (!win || win.isDestroyed()) {
    return
  }

  if (win.isMinimized()) {
    win.restore()
  }

  if (!win.isVisible()) {
    win.show()
  }

  win.focus()
}

export const browserWindows = createSessionWindowRegistry()

export function notifyBrowserPopoutClosed(tabId) {
  if (typeof tabId !== 'string' || !tabId) {
    return
  }

  for (const other of BrowserWindow.getAllWindows()) {
    if (!other.isDestroyed()) {
      other.webContents.send('hermes:browser-popout:closed', tabId)
    }
  }
}

export function spawnBrowserWindow(tabId) {
  const icon = getAppIconPath()

  const win = new BrowserWindow({
    width: BROWSER_WINDOW_WIDTH,
    height: BROWSER_WINDOW_HEIGHT,
    minWidth: BROWSER_WINDOW_MIN_WIDTH,
    minHeight: BROWSER_WINDOW_MIN_HEIGHT,
    title: 'Hermes',
    titleBarStyle: 'hidden',
    titleBarOverlay: getTitleBarOverlayOptions(),
    trafficLightPosition: IS_MAC ? WINDOW_BUTTON_POSITION : undefined,
    ...chatWindowSurfaceOptions(),
    icon,
    show: false,
    webPreferences: chatWindowWebPreferences(PRELOAD_PATH)
  })

  translucencyBackedWindows.add(win)

  if (IS_MAC) {
    win.setWindowButtonPosition?.(WINDOW_BUTTON_POSITION)
  }

  wireWindowReveal(win)

  win.on('enter-full-screen', () => sendWindowStateChanged(true))
  win.on('leave-full-screen', () => sendWindowStateChanged(false))

  streamThrottle.register(win)
  wireCommonWindowHandlers(win, zoomWiringForWindowKind('chat'))
  attachRendererConsoleCapture(win, 'browser-window', rememberLog)

  installWindowRendererLifecycle(win, {
    kind: 'browser',
    callbacks: {
      log: rememberLog,
      reload: () => {
        win.webContents.reload()
      }
    },
    reloadWindowMs: RENDERER_RELOAD_WINDOW_MS,
    reloadMax: RENDERER_RELOAD_MAX,
    recentReloadTimesRef: rendererReloadTimesRef
  })

  win.on('closed', () => notifyBrowserPopoutClosed(tabId))

  loadWindowUrl(
    win,
    buildBrowserWindowUrl(tabId, {
      devServer: DEV_SERVER,
      rendererIndexPath: DEV_SERVER ? undefined : resolveRendererIndex()
    }),
    'Browser window'
  )

  return win
}

export const instanceWindows = new Set<any>()

export function createInstanceWindow() {
  const icon = getAppIconPath()

  const win = new BrowserWindow({
    ...nextInstanceBounds(),
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    title: 'Hermes',
    titleBarStyle: 'hidden',
    titleBarOverlay: getTitleBarOverlayOptions(),
    trafficLightPosition: IS_MAC ? WINDOW_BUTTON_POSITION : undefined,
    ...chatWindowSurfaceOptions(),
    icon,
    show: false,
    webPreferences: chatWindowWebPreferences(PRELOAD_PATH)
  })

  instanceWindows.add(win)

  // Chat-surface registration: see applyWindowTranslucency.
  translucencyBackedWindows.add(win)

  if (IS_MAC) {
    win.setWindowButtonPosition?.(WINDOW_BUTTON_POSITION)
  }

  wireWindowReveal(win)

  // Per-window fullscreen chrome: send this window its own titlebar inset so its
  // traffic lights hide/show independently of the primary.
  win.on('enter-full-screen', () => sendWindowStateChanged(true, win))
  win.on('leave-full-screen', () => sendWindowStateChanged(false, win))

  streamThrottle.register(win)
  wireCommonWindowHandlers(win, zoomWiringForWindowKind('chat'))

  // Renderer lifecycle diagnostics + recovery (#81290), same policy as the
  // primary and session windows: a crashed instance renderer logs with its
  // window kind and reloads under the shared crash-loop budget.
  installWindowRendererLifecycle(win, {
    kind: 'instance',
    callbacks: {
      log: rememberLog,
      reload: () => {
        win.webContents.reload()
      }
    },
    reloadWindowMs: RENDERER_RELOAD_WINDOW_MS,
    reloadMax: RENDERER_RELOAD_MAX,
    recentReloadTimesRef: rendererReloadTimesRef
  })

  win.on('closed', () => {
    instanceWindows.delete(win)
  })

  attachRendererConsoleCapture(win, 'instance', rememberLog)
  loadWindowUrl(
    win,
    buildInstanceWindowUrl({
      devServer: DEV_SERVER,
      rendererIndexPath: DEV_SERVER ? undefined : resolveRendererIndex()
    }),
    'Instance window'
  )

  return win
}

export function petOverlayUrl() {
  if (DEV_SERVER) {
    return `${DEV_SERVER.endsWith('/') ? DEV_SERVER.slice(0, -1) : DEV_SERVER}/?win=overlay#/`
  }

  return `${pathToFileURL(resolveRendererIndex()).toString()}?win=overlay#/`
}

export function spawnPetOverlayWindow(bounds) {
  const win = new BrowserWindow({
    width: Math.max(80, Math.round(bounds?.width || 220)),
    height: Math.max(80, Math.round(bounds?.height || 220)),
    x: Number.isFinite(bounds?.x) ? Math.round(bounds.x) : undefined,
    y: Number.isFinite(bounds?.y) ? Math.round(bounds.y) : undefined,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Windows/Linux need this so the helper window does not get its own
    // taskbar/alt-tab entry. On macOS, cmd-tab is app-level and this can make
    // the whole app look like it vanished when the only newly-created visible
    // window is a frameless overlay. Use NSPanel + Mission Control hiding below
    // instead, leaving the main Hermes app as the Dock/cmd-tab anchor.
    skipTaskbar: !IS_MAC,
    hasShadow: false,
    alwaysOnTop: true,
    // macOS panels are non-activating helper windows and can float over full
    // screen spaces without becoming the app's main switcher window.
    type: IS_MAC ? 'panel' : undefined,
    hiddenInMissionControl: IS_MAC,
    // Non-activating: the overlay must never become the app's key/main window,
    // or it (a frameless, taskbar-skipping panel) becomes the app's switcher
    // anchor and the Hermes icon drops out of cmd/alt-tab — especially when the
    // main window is minimized. We flip this on only while the composer needs
    // the keyboard (see hermes:pet-overlay:set-focusable).
    focusable: false,
    show: false,
    // Fully transparent — the renderer paints only the sprite + bubble.
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: true,
      // Keep the sprite animating + bubble updating while the main window is
      // minimized/blurred — the whole point of the overlay.
      backgroundThrottling: false
    }
  })

  // Float above other apps and follow the user across desktops so the pet is
  // always reachable. `floating` + `type: panel` is the macOS NSPanel path; the
  // more aggressive `screen-saver` level can interfere with normal app/window
  // switching semantics.
  win.setAlwaysOnTop(true, IS_MAC ? 'floating' : 'screen-saver')
  win.setHiddenInMissionControl?.(true)

  try {
    // Electron docs: macOS may transform process type on each
    // setVisibleOnAllWorkspaces() call unless skipTransformProcessType=true,
    // which briefly hides the Dock/cmd-tab presence. Keep Hermes in the normal
    // ForegroundApplication class so shift-clicking the pet never drops the app
    // out of app switchers.
    win.setVisibleOnAllWorkspaces(
      true,
      IS_MAC ? { visibleOnFullScreen: true, skipTransformProcessType: true } : undefined
    )
  } catch {
    // Not supported everywhere — best effort.
  }

  // Pet overlay opts out of global UI zoom (see zoomWiringForWindowKind): it
  // owns its window-fit + scale, and inheriting zoom would crop the sprite.
  wireCommonWindowHandlers(win, zoomWiringForWindowKind('petOverlay'))

  wireWindowReveal(win, { show: () => win.showInactive() })

  // Log-only renderer lifecycle (#81290): a dead overlay must never resurrect
  // itself over the app, but its loss belongs in desktop.log.
  installWindowRendererLifecycle(win, { kind: 'overlay', callbacks: { log: rememberLog } })

  win.on('closed', () => {
    if (petOverlayWindow === win) {
      setPetOverlayWindow(null)
    }

    // If the overlay went away on its own (e.g. ⌘W), tell the main renderer to
    // pop the pet back in so it doesn't stay hidden. Harmless echo when we're
    // the ones who closed it (popInPet already cleared the active flag).
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('hermes:pet-overlay:control', { type: 'pop-in' })
    }
  })

  attachRendererConsoleCapture(win, 'pet-overlay', rememberLog)
  loadWindowUrl(win, petOverlayUrl(), 'Pet overlay')

  return win
}

export function openPetOverlay(bounds) {
  if (petOverlayWindow && !petOverlayWindow.isDestroyed()) {
    if (bounds) {
      petOverlayWindow.setBounds({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.max(80, Math.round(bounds.width)),
        height: Math.max(80, Math.round(bounds.height))
      })
    }

    petOverlayWindow.showInactive()

    return petOverlayWindow
  }

  setPetOverlayWindow(spawnPetOverlayWindow(bounds))

  return petOverlayWindow
}

export let hudWindow = null

export let hudRestoreMainWindow = false

export let hudSessionId = null

export let hudProfile = null

export const HUD_STATE_PATH = path.join(app.getPath('userData'), 'hud-state.json')

export function readHudState() {
  try {
    const raw = JSON.parse(fs.readFileSync(HUD_STATE_PATH, 'utf8'))

    if (
      [raw?.x, raw?.y, raw?.width, raw?.height].every(v => Number.isFinite(v)) &&
      raw.width >= 380 &&
      raw.height >= 160
    ) {
      return raw
    }
  } catch {
    // First run / unreadable — fall through to defaults.
  }

  return null
}

export function persistHudState() {
  if (!hudWindow || hudWindow.isDestroyed()) {
    return
  }

  try {
    const { x, y, width, height } = hudWindow.getNormalBounds()
    fs.mkdirSync(path.dirname(HUD_STATE_PATH), { recursive: true })
    writeFileAtomic(HUD_STATE_PATH, JSON.stringify({ x, y, width, height }, null, 2))
  } catch (err) {
    rememberLog(`[hud-state] persist failed: ${err?.message || err}`)
  }
}

export const schedulePersistHudState = debounce(persistHudState, 250)

export const HUD_CURSOR_POLL_MS = 60

export const HUD_SNAP_ANCHOR_Y = 48

export function hudWindowing() {
  return resolveHudWindowing(process.platform, process.env, process.argv)
}

export function applyHudSnapToPointer() {
  if (!hudWindow || hudWindow.isDestroyed() || !hudWindowing().clientPlacement) {
    return
  }

  const cursor = screen.getCursorScreenPoint()
  const bounds = hudWindow.getBounds()
  const display = screen.getDisplayNearestPoint(cursor)
  const workArea = display?.workArea ?? bounds
  const anchor = { x: Math.round(bounds.width / 2), y: HUD_SNAP_ANCHOR_Y }

  const origin = snapHudBounds(
    cursor,
    anchor,
    { width: bounds.width, height: bounds.height },
    hudWindow.webContents.getZoomFactor(),
    workArea
  )

  // setBounds — NOT setPosition alone: on Windows, a transparent frameless
  // window silently grows ~1px per setPosition call (see move-by handler).
  // On native Wayland the compositor ignores the position half; the snap
  // shortcut is therefore a documented no-op there.
  hudWindow.setBounds({
    x: origin.x,
    y: origin.y,
    width: bounds.width,
    height: bounds.height
  })
}

export const hudSnapShortcut = createHudSnapShortcut(globalShortcut, applyHudSnapToPointer)

export function registerHudSnapShortcut() {
  if (!hudSnapShortcut.register()) {
    rememberLog('[hud] snap shortcut unavailable — CommandOrControl+Shift+G may be owned by another app')
  }
}

export function startHudCursorFeed(win: BrowserWindow) {
  const windowing = hudWindowing()

  if (!windowing.cursorFeed) {
    if (!windowing.ignoreMouse) {
      try {
        win.setIgnoreMouseEvents(false)
      } catch {
        // best effort
      }
    }

    return
  }

  let last: string | null = null

  const timer = setInterval(() => {
    if (win.isDestroyed() || !win.isVisible()) {
      return
    }

    const point = cursorPointInWindow(screen.getCursorScreenPoint(), win.getBounds(), win.webContents.getZoomFactor())

    // Off-window is a real answer (it is what hands the mouse back), so it is
    // sent — once. Only an unchanged answer is dropped, to keep an idle cursor
    // from waking the renderer 16 times a second.
    const key = point ? `${Math.round(point.x)},${Math.round(point.y)}` : 'out'

    if (key === last) {
      return
    }

    last = key
    win.webContents.send('hermes:hud:cursor', point)
  }, HUD_CURSOR_POLL_MS)

  win.on('closed', () => clearInterval(timer))
}

export function startHudGameOverlayFeed(win: BrowserWindow) {
  const titlesAvailable = IS_MAC ? systemPreferences.getMediaAccessStatus?.('screen') === 'granted' : true

  let last = { active: false, app: '' }

  const push = (state: { active: boolean; app: string }) => {
    if (!win.isDestroyed()) {
      win.webContents.send('hermes:hud:game-overlay', state)
    }
  }

  // Replay the latest state to every load of this window. The watch pushes only
  // on CHANGE and its first tick fires the moment the window is created — well
  // before the renderer has mounted its listener — so a HUD opened over a game
  // that is already fullscreen would hear the one and only message before it
  // could receive it, then sit at "no game" forever while main was certain it
  // had reported one. (Same reason quick entry caches its last state push.)
  // did-finish-load also covers HMR full reloads during development.
  win.webContents.on('did-finish-load', () => push(last))

  // The watch gives up after two failed enumerations and never says so, which
  // is how a HUD that cannot see the screen at all — no game cue, and
  // read_window_below failing beside it — leaves nothing in the log to explain
  // itself. Report the reason once; the null keeps the watch's contract.
  let reported = false

  const enumerate = async () => {
    const windows = await enumerateWindowsFrontToBack(process.pid, titlesAvailable)

    if (!enumerationFailed(windows)) {
      return windows
    }

    if (!reported) {
      reported = true
      console.warn(`[hermes] HUD cannot enumerate windows: ${windows.reason}`)
    }

    return null
  }

  const dispose = startHudGameOverlayWatch({
    enumerate,
    displayBounds: () => screen.getDisplayMatching(win.getBounds()).bounds,
    selfPid: process.pid,
    send: state => {
      last = state
      push(state)
    }
  })

  win.on('closed', dispose)
}

export function hudUrl(sessionId, profile) {
  // The profile rides the query string next to `win=hud` (BEFORE the '#', so
  // HashRouter never sees it). The HUD renderer's gateway boot reads it and
  // adopts that backend instead of the primary — without it, a HUD opened on a
  // non-primary profile's conversation resolves the session id against the
  // wrong backend and falls back to the default profile's last session.
  return buildHudWindowUrl(sessionId, {
    devServer: DEV_SERVER,
    profile,
    rendererIndexPath: DEV_SERVER ? undefined : resolveRendererIndex()
  })
}

export function broadcastHudState(open) {
  const payload = { open, sessionId: hudSessionId }

  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('hermes:hud:changed', payload)
    }
  }
}

export function spawnHudWindow(sessionId, profile) {
  const win = new BrowserWindow({
    ...hudBounds(),
    minWidth: 380,
    minHeight: 160,
    title: HUD_WINDOW_TITLE,
    frame: false,
    transparent: true,
    // NOT resizable. A transparent frameless window on Windows keeps a
    // system-level edge resize hot-zone while `resizable` is on — the OS
    // interprets pointer capture near the edge as a resize gesture, so the
    // window grows a few px every drag (worse at >100% DPI scaling). The
    // composer drag calls setPosition, which must move the window, not resize
    // it. Resizing is done by the renderer's edge/corner handles through
    // `hermes:hud:set-bounds`, which flips resizable on for the call — the
    // same pattern the pet overlay uses for its wheel-scale.
    resizable: false,
    // macOS AppKit's constrainFrameRect clamps setBounds to the current
    // display unless this is on. The HUD is moved by renderer-driven
    // setBounds (not a native titlebar drag), so without it the bar cannot
    // be dragged onto another monitor. No-op on Windows/Linux.
    enableLargerThanScreen: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Keep the interactive macOS HUD as an ordinary NSWindow. NSPanel defaults
    // hidesOnDeactivate to true, which removes the HUD while the user works in
    // another app; the floating/all-spaces setup below supplies overlay behavior.
    skipTaskbar: !IS_MAC,
    hasShadow: false,
    alwaysOnTop: true,
    // Clips the vibrancy layer to the HUD's silhouette rather than a hard
    // rectangle — the frost stops where the window's corners do.
    roundedCorners: true,
    // Vibrancy must keep rendering while the window is BLURRED: streaming under
    // another app is the whole feature, and the default 'followWindow' kills
    // the frost the moment something else takes focus.
    visualEffectState: 'active',
    hiddenInMissionControl: IS_MAC,
    show: false,
    backgroundColor: '#00000000',
    // The full chat webPreferences — this window streams a real transcript, so
    // it needs everything a chat window needs (preload bridge, autoplay for
    // voice, the shared throttling contract).
    webPreferences: chatWindowWebPreferences(PRELOAD_PATH)
  })

  applyHudElectronOverlay(win, process.platform)
  win.setHiddenInMissionControl?.(true)

  // Linux intentionally starts on ONE virtual desktop. During a renderer
  // grab, hermes:hud:workspace-transfer temporarily makes the X11 window
  // sticky; releasing it assigns the HUD to KDE's then-current desktop.

  // Streaming into a window that is ALWAYS blurred (the user is in another
  // app) is the entire feature, so it gets the same stream-aware unthrottling
  // every chat window does.
  streamThrottle.register(win)
  wireCommonWindowHandlers(win, zoomWiringForWindowKind('chat'))

  // Remember where the user parks and sizes it (debounced — these fire many
  // times mid-drag).
  bindGeometryPersistence(win, schedulePersistHudState)

  startHudCursorFeed(win)
  startHudGameOverlayFeed(win)

  wireWindowReveal(win, {
    show: () => {
      win.show()
      win.focus()
    },
    onRevealed: () => {
      // Step the app aside: the HUD IS the surface now.
      if (hudRestoreMainWindow && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide()
      }

      // Compositor overlay adapters (Hyprland float+pin today). Electron
      // alwaysOnTop is already set; this is the dialect some WMs actually hear.
      void promoteHudOverlay({ title: HUD_WINDOW_TITLE })
    }
  })

  win.on('closed', () => {
    if (hudWindow === win) {
      hudWindow = null
    }

    // Closed from its own side (⌘W) — closeHudWindow()'s dispose() never ran,
    // so the global snap shortcut would otherwise stay registered (and stuck
    // taken) with no HUD left to apply it to. dispose() is idempotent, so
    // this is safe even if closeHudWindow() already released it.
    hudSnapShortcut.dispose()

    // Put the app back so the user is never left with no surface, and
    // correct every window's toggle.
    restoreMainWindowFromHud()
    broadcastHudState(false)
  })

  attachRendererConsoleCapture(win, 'hud', rememberLog)
  // Log-only lifecycle (#81290): the HUD is a compact auxiliary surface the
  // user can re-toggle; a dead renderer should be diagnosable, not resurrected.
  installWindowRendererLifecycle(win, { kind: 'hud', callbacks: { log: rememberLog } })
  loadWindowUrl(win, hudUrl(sessionId, profile), 'HUD')

  return win
}

export function restoreMainWindowFromHud() {
  if (!hudRestoreMainWindow) {
    return
  }

  hudRestoreMainWindow = false

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
  }
}

export function openHudWindow(sessionId, profile) {
  const profileKey = typeof profile === 'string' && profile.trim() ? profile.trim() : null

  if (hudWindow && !hudWindow.isDestroyed()) {
    // Pointed at another PROFILE: the live renderer is bound to the old
    // profile's backend, and a renderer adopts its backend exactly once at
    // boot — an in-place goto would resolve the id against the wrong backend
    // (the #82285 fallback). Respawn against the right one.
    if (profileKey && hudProfile !== profileKey) {
      const win = hudWindow
      hudWindow = null
      win.removeAllListeners('closed')
      win.destroy()

      hudSessionId = sessionId || null
      hudProfile = profileKey
      hudWindow = spawnHudWindow(sessionId, profileKey)
      broadcastHudState(true)
      registerHudSnapShortcut()

      return hudWindow
    }

    // Already up, but pointed somewhere else — switch it rather than just
    // raising it. Asking for HUD mode from another tab means "put THIS
    // conversation in the HUD", and a plain focus leaves the wrong one there.
    if (sessionId && sessionId !== hudSessionId) {
      hudSessionId = sessionId
      hudWindow.webContents.send('hermes:hud:goto', sessionId)
      // Keep every window's idea of where the HUD is pointed in step, so the
      // toggle keeps reading "switch" vs "dismiss" correctly.
      broadcastHudState(true)
    }

    focusWindow(hudWindow)

    return hudWindow
  }

  hudRestoreMainWindow = Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible())
  hudSessionId = sessionId || null
  hudProfile = profileKey
  hudWindow = spawnHudWindow(sessionId, profileKey)
  broadcastHudState(true)
  registerHudSnapShortcut()

  return hudWindow
}

export function closeHudWindow() {
  hudSnapShortcut.dispose()

  const win = hudWindow
  hudWindow = null

  if (win && !win.isDestroyed()) {
    // Null'd first so the 'closed' handler doesn't broadcast a second time.
    win.removeAllListeners('closed')
    win.close()
  }

  restoreMainWindowFromHud()
  broadcastHudState(false)

  if (mainWindow && !mainWindow.isDestroyed()) {
    focusWindow(mainWindow)
  }
}

export let quickEntryWindow = null

export let quickEntryLastState = null

export function quickEntryUrl() {
  if (DEV_SERVER) {
    return `${DEV_SERVER.endsWith('/') ? DEV_SERVER.slice(0, -1) : DEV_SERVER}/?win=quick#/`
  }

  return `${pathToFileURL(resolveRendererIndex()).toString()}?win=quick#/`
}

export function spawnQuickEntryWindow() {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const bounds = quickEntryWindowBounds(display?.workArea)

  const win = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // Same rationale as the pet overlay: on Windows/Linux keep the helper out
    // of the taskbar/alt-tab list; on macOS use an NSPanel so the frameless
    // capture window never becomes the app's cmd-tab anchor.
    skipTaskbar: !IS_MAC,
    hasShadow: true,
    alwaysOnTop: true,
    type: IS_MAC ? 'panel' : undefined,
    hiddenInMissionControl: IS_MAC,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: true
    }
  })

  win.setAlwaysOnTop(true, IS_MAC ? 'floating' : 'screen-saver')
  win.setHiddenInMissionControl?.(true)

  try {
    win.setVisibleOnAllWorkspaces(
      true,
      IS_MAC ? { visibleOnFullScreen: true, skipTransformProcessType: true } : undefined
    )
  } catch {
    // Not supported everywhere — best effort.
  }

  // Opts out of global UI zoom for the same reason as the pet overlay: it sizes
  // its own OS window and a zoomed composer would overflow it.
  wireCommonWindowHandlers(win, zoomWiringForWindowKind('quickEntry'))

  // Log-only renderer lifecycle (#81290): a dead quick-entry window must never
  // resurrect itself over the app, but its loss belongs in desktop.log.
  installWindowRendererLifecycle(win, { kind: 'quick', callbacks: { log: rememberLog } })

  // Hide on blur. The window must never hold the user's focus captive — losing
  // focus is the cheapest, least surprising dismiss (matches Spotlight).
  win.on('blur', () => {
    if (!win.isDestroyed()) {
      win.hide()
    }
  })

  win.on('closed', () => {
    if (quickEntryWindow === win) {
      quickEntryWindow = null
    }
  })

  // Replay the last known gateway state as soon as the page can hear it — a
  // freshly spawned quick window must not sit "disconnected" when the primary
  // renderer already reported a live gateway.
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed() && quickEntryLastState) {
      win.webContents.send('hermes:quick-entry:state', quickEntryLastState)
    }
  })

  attachRendererConsoleCapture(win, 'quick-entry', rememberLog)
  loadWindowUrl(win, quickEntryUrl(), 'Quick entry')

  return win
}

export function repositionQuickEntryWindow(win) {
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    win.setBounds(quickEntryWindowBounds(display?.workArea))
  } catch (error) {
    rememberLog(`[quick-entry] reposition failed: ${error.message}`)
  }
}

export function showQuickEntryWindow() {
  if (!quickEntryWindow || quickEntryWindow.isDestroyed()) {
    // Reveal the window this call created, not whatever `quickEntryWindow`
    // points at by the time the event lands.
    const win = spawnQuickEntryWindow()
    quickEntryWindow = win

    wireWindowReveal(win, {
      show: () => {
        win.show()
        win.focus()
      }
    })

    return
  }

  repositionQuickEntryWindow(quickEntryWindow)
  quickEntryWindow.show()
  quickEntryWindow.focus()
  // Re-summoned: tell the renderer to clear any stale draft and refocus.
  quickEntryWindow.webContents.send('hermes:quick-entry:shown')
}

export function hideQuickEntryWindow() {
  if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
    quickEntryWindow.hide()
  }
}

export function toggleQuickEntryWindow() {
  if (quickEntryWindow && !quickEntryWindow.isDestroyed() && quickEntryWindow.isVisible()) {
    hideQuickEntryWindow()

    return
  }

  showQuickEntryWindow()
}

export const quickEntryShortcut = createQuickEntryShortcut(globalShortcut, toggleQuickEntryWindow)

export function closeQuickEntryWindow() {
  quickEntryShortcut.dispose()

  if (quickEntryWindow && !quickEntryWindow.isDestroyed()) {
    quickEntryWindow.close()
  }

  quickEntryWindow = null
}

export async function detectRendererSkew() {
  return detectBundleSkew(INSTALL_STAMP, runGit, resolveUpdateRoot())
}

export function showAboutPanelFresh() {
  void detectRendererSkew().then(skew => {
    app.setAboutPanelOptions({
      applicationName: APP_NAME,
      applicationVersion: skew.outOfSync
        ? `${resolveHermesVersion()} — app build out of date, update the desktop app`
        : resolveHermesVersion(),
      copyright: 'Copyright © 2026 Nous Research'
    })
    app.showAboutPanel()
  })
}

export function getHudWindow() {
  return hudWindow
}
export function setHudWindow(value: any) {
  hudWindow = value
}

export function getHudRestoreMainWindow() {
  return hudRestoreMainWindow
}
export function setHudRestoreMainWindow(value: any) {
  hudRestoreMainWindow = value
}

export function getHudSessionId() {
  return hudSessionId
}
export function setHudSessionId(value: any) {
  hudSessionId = value
}

export function getHudProfile() {
  return hudProfile
}
export function setHudProfile(value: any) {
  hudProfile = value
}

export function getQuickEntryWindow() {
  return quickEntryWindow
}
export function setQuickEntryWindow(value: any) {
  quickEntryWindow = value
}

export function getQuickEntryLastState() {
  return quickEntryLastState
}
export function setQuickEntryLastState(value: any) {
  quickEntryLastState = value
}
