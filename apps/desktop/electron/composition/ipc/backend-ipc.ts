// IPC surface extracted from main.ts. Channel names, payloads and error
// semantics unchanged; state authority stays with main.ts via this deps object.

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
import { recycleOwnedBackend } from '../../backend-recycle'
import { decideBootstrapRepair } from '../../bootstrap-repair-guard'
import { runBootstrap } from '../../bootstrap-runner'
import {
  cancelScheduledDesktopLogFlush,
  flushDesktopLogBufferSync,
  getRecentHermesLogLines,
  initDesktopLogBuffer,
  rememberLog
} from '../../composition/log-buffer'
import {
  apiRequestRegistryConnectionId,
  authModeFromStatus,
  buildGatewayWsUrl,
  buildGatewayWsUrlWithTicket,
  connectionScopeKey,
  cookiesHaveLiveSession,
  cookiesHavePrivyAccessToken,
  cookiesHavePrivySession,
  cookiesHaveSession,
  gatewayTicketFailure,
  gatewayWsUrlIpcResult,
  hostLabelFromBaseUrl,
  localProfileEntry,
  modeIsRemoteLike,
  normalizeRemoteBaseUrl,
  normalizeRemoteHeaders,
  normalizeSshConfig,
  normAuthMode,
  pathForRegistryBackendRequest,
  pathWithGlobalRemoteProfile,
  profileHasRemoteConnection,
  profileRemoteOverride,
  profileSshOverride,
  type RegistryBackendRequestScope,
  remoteRequestMatchesBaseUrl,
  resolveAuthMode,
  resolveProfileApiRequest,
  resolveProfileBackendRoute,
  resolveRemoteSshDashboardProfile,
  resolveTestWsUrl,
  savedProfileSsh,
  tokenPreview,
  withTransientRetries
} from '../../connection-config'

export interface RegisterBackendIpcDeps {
  touchPoolBackend: any
  getPoolLimits: () => any
  setPoolLimits: any
  freshGatewayWsUrl: any
  teardownSshConnection: any
  teardownPrimaryBackendAndWait: any
  sendConnectionApplied: any
  primaryProfileKey: any
  teardownPoolBackendAndWait: any
  getBootstrapFailure: () => any
  setBootstrapFailure: (value: any) => void
  getBackendStartFailure: () => any
  setBackendStartFailure: (value: any) => void
  getRemoteReauthFailure: () => any
  setRemoteReauthFailure: (value: any) => void
  resetBootstrapSnapshot: any
  getFirstRunSetupGate: any
  startHermes: any
  backendConnectionState: any
  getBootstrapRepairRequested: () => any
  setBootstrapRepairRequested: (value: any) => void
  getBootstrapRepairAttempt: () => any
  bumpBootstrapRepairAttempt: () => void
  MAX_BOOTSTRAP_REPAIR_SOFT_ATTEMPTS: any
  resetHermesConnection: any
  continueFirstRunLocalBootstrap: any
  getBootstrapAbortController: () => any
  getBootProgressState: () => any
  getBootstrapState: any
  registryGatewayWsUrlHandler: any
  readActiveDesktopProfile: any
  writeActiveDesktopProfile: any
  HERMES_HOME: any
  getMainWindow: () => any
  assertCanMutateManagedPrimaryRouting: any
}

export function registerBackendIpc({ touchPoolBackend, getPoolLimits, setPoolLimits, freshGatewayWsUrl, teardownSshConnection, teardownPrimaryBackendAndWait, sendConnectionApplied, primaryProfileKey, teardownPoolBackendAndWait, getBootstrapFailure, setBootstrapFailure, getBackendStartFailure, setBackendStartFailure, getRemoteReauthFailure, setRemoteReauthFailure, resetBootstrapSnapshot, getFirstRunSetupGate, startHermes, backendConnectionState, getBootstrapRepairRequested, setBootstrapRepairRequested, bumpBootstrapRepairAttempt, getBootstrapRepairAttempt, MAX_BOOTSTRAP_REPAIR_SOFT_ATTEMPTS, resetHermesConnection, continueFirstRunLocalBootstrap, getBootstrapAbortController, getBootProgressState, getBootstrapState, registryGatewayWsUrlHandler, readActiveDesktopProfile, writeActiveDesktopProfile, HERMES_HOME, getMainWindow, assertCanMutateManagedPrimaryRouting }: RegisterBackendIpcDeps) {
ipcMain.handle('hermes:backend:touch', async (_event, profile) => {
  touchPoolBackend(profile)

  return { ok: true }
})

ipcMain.handle('hermes:pool-limits:get', async () => ({ ...getPoolLimits() }))

ipcMain.handle('hermes:pool-limits:set', async (_event, raw) => {
  const next = setPoolLimits({
    maxBackends: typeof raw?.maxBackends === 'number' ? raw.maxBackends : getPoolLimits().maxBackends,
    idleMs: typeof raw?.idleMs === 'number' ? raw.idleMs : getPoolLimits().idleMs
  })

  return { ok: true, limits: next }
})

ipcMain.handle('hermes:gateway:ws-url', async (_event, profile) => {
  return gatewayWsUrlIpcResult(() => freshGatewayWsUrl(profile))
})

ipcMain.handle('hermes:backend:recycle', async (_event, profile) => {
  // Models-page recovery after a code-skew 503 (#97046): kill the owned
  // SSH serve (if any) before the local child so reconnect cannot reuse a
  // stale lockfile. Soft primary teardown keeps the renderer shell mounted.
  await recycleOwnedBackend({
    notifyApplied: sendConnectionApplied,
    primaryProfile: primaryProfileKey(),
    profile: typeof profile === 'string' ? profile : '',
    teardownPool: teardownPoolBackendAndWait,
    teardownPrimary: () => teardownPrimaryBackendAndWait({ soft: true }),
    teardownSsh: value => teardownSshConnection(value || null)
  })

  return { ok: true }
})

ipcMain.handle('hermes:bootstrap:reset', async () => {
  // Renderer's "Reload and retry" path. Clear the latched failure and
  // reset connection state so the next startHermes() call restarts the
  // full backend flow (including a fresh runBootstrap pass).
  rememberLog('[bootstrap] reset requested by renderer; clearing latched failure')
  await teardownPrimaryBackendAndWait()
  setBootstrapFailure(null)
  setBackendStartFailure(null)
  setRemoteReauthFailure(null)
  getFirstRunSetupGate().resetForRetry()
  resetBootstrapSnapshot()

  return { ok: true }
})

ipcMain.handle('hermes:bootstrap:repair', async () => {
  // Forceful repair: force the next startHermes() through the full installer
  // (refreshing a broken/partial venv) and clear any latched failure + live
  // connection. The renderer reloads afterwards to re-drive the boot flow.
  //
  // We do NOT delete the bootstrap marker here. Repair is also reachable from
  // transient backend errors on a perfectly healthy install, and deleting the
  // marker in that case stranded the app in first-run setup with no way back
  // (#72166). The explicit flag carries the intent instead.
  bumpBootstrapRepairAttempt()

  // Probe the live backend process so the guard can distinguish "venv is
  // genuinely broken" (force reinstall) from "backend is just transiently
  // stalled under GIL pressure" (#74874 — `event loop stalled` followed by
  // `ws ready frame send failed`, then renderer keeps reporting dead).
  const primaryProc = backendConnectionState.getProcess()

  const primaryBackendAlive = Boolean(
    primaryProc &&
    (primaryProc as { exitCode?: number | null }).exitCode === null &&
    (primaryProc as { signalCode?: string | null }).signalCode === null
  )

  const repairDecision = decideBootstrapRepair({
    attempt: getBootstrapRepairAttempt(),
    maxSoftAttempts: MAX_BOOTSTRAP_REPAIR_SOFT_ATTEMPTS,
    primaryBackendAlive
  })

  rememberLog(
    `[bootstrap] repair requested by renderer; forcing reinstall + clearing latched failure ` +
      `(attempt=${repairDecision.attempt}/${MAX_BOOTSTRAP_REPAIR_SOFT_ATTEMPTS}, ` +
      `primaryBackendAlive=${primaryBackendAlive}, ` +
      `hardReinstall=${repairDecision.hardReinstall}): ${repairDecision.reason}`
  )

  // The guard may decide the install is healthy enough that a restart
  // (without touching the venv) is the right answer. Translate that into
  // the existing flag: if the guard said "soft restart", we skip the
  // "bypass active runtime" path inside startHermes() and fall through
  // to the normal restart branch, which just kills the current child
  // and respawns it against the same venv. See #74874 — this is what
  // breaks the infinite reinstall loop the user hit.
  setBootstrapRepairRequested(repairDecision.hardReinstall)
  setBootstrapFailure(null)
  setBackendStartFailure(null)
  setRemoteReauthFailure(null)
  getFirstRunSetupGate().resetForRepair()
  resetHermesConnection()

  return { ok: true }
})

ipcMain.handle('hermes:bootstrap:continue-local', async () => {
  rememberLog('[bootstrap] local install selected by renderer; continuing first-launch bootstrap')
  continueFirstRunLocalBootstrap()

  return { ok: true }
})

ipcMain.handle('hermes:bootstrap:cancel', async () => {
  // Renderer's Cancel button during first-launch install. Abort the running
  // install script (SIGTERM via the runner's abortSignal). runBootstrap
  // resolves with { cancelled: true }, which surfaces the recovery overlay.
  if (getBootstrapAbortController()) {
    try {
      getBootstrapAbortController().abort()
    } catch {
      void 0
    }

    return { ok: true, cancelled: true }
  }

  return { ok: false, cancelled: false }
})

ipcMain.handle('hermes:boot-progress:get', async () => getBootProgressState())

ipcMain.handle('hermes:bootstrap:get', async () => getBootstrapState())

ipcMain.handle('hermes:gateway:ws-url-for', async (_event, payload) => {
  return gatewayWsUrlIpcResult(() => registryGatewayWsUrlHandler(payload))
})

ipcMain.handle('hermes:profile:get', async () => ({ profile: readActiveDesktopProfile() }))

ipcMain.handle('hermes:profile:remember', async (_event, name) => ({
  profile: writeActiveDesktopProfile(name)
}))

ipcMain.handle('hermes:profile:set', async (_event, name) => {
  assertCanMutateManagedPrimaryRouting()
  const next = writeActiveDesktopProfile(name)

  // Switching profiles is a backend re-home: relaunch the dashboard under the
  // new HERMES_HOME. Pool backends keep their own homes, so only the primary
  // is torn down.
  await teardownPrimaryBackendAndWait()
  getMainWindow()?.reload()

  return { profile: next }
})
}
