// IPC surface extracted from main.ts. Channel names, payloads and error
// semantics unchanged; state authority stays with main.ts via this deps object.

import fs from 'node:fs'
import path from 'node:path'

import {
  app,
  dialog,
  ipcMain,
  shell
} from 'electron'

import {
  flushDesktopLogBufferSync,
  getRecentHermesLogLines,
  rememberLog
} from '../app/log-buffer'
import { formatRendererBoundaryReport } from '../app/renderer-log'
import {
  buildNoSandboxRelaunchArgs
} from '../host-capabilities/platform/windows-sandbox-fallback'
import { detectBundleSwap } from '../update/bundle-swap'

export interface RegisterSystemIpcDeps {
  REMOTE_DISPLAY_REASON: any
  getOnBatteryPower: () => any
  resolveHermesCwd: any
  readDefaultProjectDir: any
  writeDefaultProjectDir: any
  DESKTOP_LOG_PATH: any
  fileExists: any
  readDesktopUpdateConfig: any
  checkUpdates: any
  applyUpdates: any
  DEFAULT_UPDATE_BRANCH: any
  writeDesktopUpdateConfig: any
  IS_PACKAGED: any
  loadInstallStamp: any
  INSTALL_STAMP: any
  resolveUpdateRoot: any
  resolveHermesVersion: any
  detectRendererSkew: any
  exitAfterBackendShutdown: any
  getUninstallSummary: any
  runDesktopUninstall: any
  HERMES_PROTOCOL: any
  get_pendingDeepLink: () => any
  set_pendingDeepLink: (value: any) => void
  get_rendererReadyForDeepLink: () => any
  set_rendererReadyForDeepLink: (value: any) => void
  handleDeepLink: any
}

export function registerSystemIpc({ REMOTE_DISPLAY_REASON, getOnBatteryPower, resolveHermesCwd, readDefaultProjectDir, writeDefaultProjectDir, DESKTOP_LOG_PATH, fileExists, readDesktopUpdateConfig, checkUpdates, applyUpdates, DEFAULT_UPDATE_BRANCH, writeDesktopUpdateConfig, IS_PACKAGED, loadInstallStamp, INSTALL_STAMP, resolveUpdateRoot, resolveHermesVersion, detectRendererSkew, exitAfterBackendShutdown, getUninstallSummary, runDesktopUninstall, HERMES_PROTOCOL, get_pendingDeepLink, set_pendingDeepLink, get_rendererReadyForDeepLink, set_rendererReadyForDeepLink, handleDeepLink }: RegisterSystemIpcDeps) {
ipcMain.handle('hermes:get-remote-display-reason', () => REMOTE_DISPLAY_REASON)

ipcMain.handle('hermes:power-battery:get', () => getOnBatteryPower() === true)

ipcMain.handle('hermes:setting:defaultProjectDir:get', async () => ({
  dir: readDefaultProjectDir(),
  defaultLabel: app.getPath('home'),
  resolvedCwd: resolveHermesCwd()
}))

ipcMain.handle('hermes:setting:defaultProjectDir:set', async (_event, dir) => {
  const next = typeof dir === 'string' && dir.trim() ? dir.trim() : null

  if (next) {
    try {
      fs.mkdirSync(next, { recursive: true })
    } catch (error) {
      throw new Error(`Could not create directory: ${error.message}`)
    }
  }

  writeDefaultProjectDir(next)

  return { dir: next }
})

ipcMain.handle('hermes:setting:defaultProjectDir:pick', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Choose default project directory',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: readDefaultProjectDir() || app.getPath('home')
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true, dir: null }
  }

  return { canceled: false, dir: result.filePaths[0] }
})

ipcMain.handle('hermes:logs:reveal', async () => {
  try {
    await fs.promises.mkdir(path.dirname(DESKTOP_LOG_PATH), { recursive: true })

    if (!fileExists(DESKTOP_LOG_PATH)) {
      await fs.promises.appendFile(DESKTOP_LOG_PATH, '')
    }

    shell.showItemInFolder(DESKTOP_LOG_PATH)

    return { ok: true, path: DESKTOP_LOG_PATH }
  } catch (error) {
    return { ok: false, path: DESKTOP_LOG_PATH, error: error.message }
  }
})

ipcMain.handle('hermes:logs:recent', async () => ({ path: DESKTOP_LOG_PATH, lines: getRecentHermesLogLines(-200) }))

ipcMain.on('hermes:logs:renderer-error', (_event, report) => {
  const { label, boundary, message, componentStack } = report && typeof report === 'object' ? report : {}
  rememberLog(formatRendererBoundaryReport(label, boundary, message, componentStack))
  flushDesktopLogBufferSync()
})

ipcMain.handle('hermes:updates:check', async () =>
  checkUpdates().catch(error => ({
    supported: true,
    branch: readDesktopUpdateConfig().branch,
    error: 'check-failed',
    message: error?.message || String(error),
    fetchedAt: Date.now()
  }))
)

ipcMain.handle('hermes:updates:apply', async (_event, payload) =>
  applyUpdates(payload || {}).catch(error => ({
    ok: false,
    error: 'apply-failed',
    message: error?.message || String(error)
  }))
)

ipcMain.handle('hermes:updates:branch:get', async () => readDesktopUpdateConfig())

ipcMain.handle('hermes:updates:branch:set', async (_event, name) => {
  const branch = typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_UPDATE_BRANCH
  writeDesktopUpdateConfig({ branch })

  return { branch }
})

ipcMain.handle('hermes:version', async () => {
  const skew = await detectRendererSkew()

  return {
    appVersion: resolveHermesVersion(),
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    platform: process.platform,
    hermesRoot: resolveUpdateRoot(),
    bundleOutOfSync: skew.outOfSync,
    bundleCommitsBehind: skew.desktopCommitsBehind,
    // True when the bundle on disk is not the one this process loaded — a
    // plain app restart (no rebuild, no installer) clears the skew above.
    // Packaged only: a dev `--build-only` rewrites build/install-stamp.json
    // under a running `npm start`, which is a rebuild the developer asked for,
    // not a torn install to offer a restart for.
    bundleSwapPending: IS_PACKAGED && detectBundleSwap(INSTALL_STAMP, loadInstallStamp())
  }
})

ipcMain.handle('hermes:app:relaunch', async () => {
  rememberLog('[updates] renderer requested an app relaunch (swapped bundle pending)')
  app.relaunch({ args: buildNoSandboxRelaunchArgs(process.argv.slice(1)) })
  void exitAfterBackendShutdown(0)
})

ipcMain.handle('hermes:uninstall:summary', async () => getUninstallSummary())

ipcMain.handle('hermes:uninstall:run', async (_event, payload) => {
  const mode = payload && typeof payload === 'object' ? payload.mode : payload

  return runDesktopUninstall(String(mode || ''))
})

ipcMain.handle('hermes:deep-link-ready', () => {
  set_rendererReadyForDeepLink(true)

  if (get_pendingDeepLink()) {
    const queued = get_pendingDeepLink()
    set_pendingDeepLink(null)
    handleDeepLink(
      `${HERMES_PROTOCOL}://${queued.kind}/${encodeURIComponent(queued.name)}` +
        (Object.keys(queued.params).length ? '?' + new URLSearchParams(queued.params).toString() : '')
    )
  }

  return { ok: true }
})
}
