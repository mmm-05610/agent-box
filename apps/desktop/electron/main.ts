import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import tls from 'node:tls'

import {
  app,
  Menu,
  powerMonitor,
  powerSaveBlocker,
  safeStorage
} from 'electron'

import {
  _extractDeepLink,
  get_pendingDeepLink,
  handleDeepLink,
  HERMES_PROTOCOL,
  registerDeepLinkProtocol,
  set_pendingDeepLink,
} from './app/deep-link-composition'
import { describeDevCdpDecision } from './app/dev-cdp'
import { installDownloadHandling as installDownloadHandlingImpl } from './app/downloads'
import { createEventDeduper } from './app/event-dedupe'
import {
  cancelScheduledDesktopLogFlush,
  flushDesktopLogBufferSync,
  initDesktopLogBuffer,
  rememberLog
} from './app/log-buffer'
import {
  DISABLE_F12_CONFIG_PATH,
  KEEP_AWAKE_CONFIG_PATH,
  readPersistedDisableF12,
  readPersistedKeepAwake
} from './app/persisted-flags'
import { createKeepAwake } from './app/power-save'
import { createPowerState } from './app/power-state'
import { type ActiveWork } from './app/quit-guard'
import { createQuitPrompt } from './app/quit-prompt'
import { configureSpellChecker as configureSpellCheckerImpl } from './app/spellcheck'
import { USER_DATA_OVERRIDE } from './app/user-data'
import {
  closePreviewWatchers,
  dispatchRegistryApiRequest,
  expandUserPath,
  extensionForMimeType,
  fetchLinkTitle,
  getDataUrlReadMaxMb,
  handleHermesApiRequest,
  mimeTypeForPath,
  normalizePreviewTarget,
  persistDataUrlReadMaxMb,
  prepareProfileDeleteRequest,
  registryConnectionKind,
  saveGatewayFile,
  saveImageFromUrl,
  stopPreviewFileWatch,
  teardownConnectionScopedProfileBackend,
  teardownPoolBackendAndWait,
  teardownPrimaryBackendAndWait,
  watchDirectory,
  watchPreviewFile,
} from './composition/api-proxy-composition'
import { _clearNativeTokens, _storeNativeTokens, applyUpdates, backendConnectionState, backendDialClaims, backendShutdown, closePetOverlay, createSessionWindow, createWindow, decryptDesktopSecret, decryptRemoteHeaders, DEFAULT_UPDATE_BRANCH, defaultProjectDirConfigPath, DESKTOP_LOG_PATH, DEV_CDP, ensureBackend, ensureNativeAccessToken, ensureRegistryBackend, exitAfterBackendShutdown, fetchJsonForBackend, fetchPublicJson, gatewayAuthProviders, get_rendererReadyForDeepLink, getBackendStartFailure, getBootProgressState, getBootstrapAbortController, getBootstrapFailure, getBootstrapRepairAttempt, getBootstrapRepairRequested, getBootstrapState, getF12Blocked, getFirstRunSetupGate, getIsQuittingForHandoff, getMainWindow, getOauthSession, getOauthSessionForUrl, getPetOverlayWindow, getPoolLimits, getPreviewShortcutActive, getRemoteReauthFailure, getWindowsNoSandboxRelaunchAttempted, getWindowsSandboxFallbackActive, getWindowsSandboxFallbackSticky, GLASS_SUPPORTED, hasLiveOauthSession, hasNativeSession, INSTALL_STAMP, IS_PACKAGED, isPackagedInstallPath, isPrimaryInstance, lastContextMenuPoint, loadInstallStamp, managedConnectionUpdateGate, mintGatewayWsTicket, openExternalUrl, PASSWORD_STORE, postJsonNoAuth, primaryBackendIsRemote, primaryProfileKey, PROFILE_NAME_RE, profileDeletionGate, readActiveDesktopProfile, readDefaultProjectDir, readDesktopConnectionConfig, readDesktopConnectionsRegistry, readDesktopUpdateConfig, rememberRemoteWsHeaders, REMOTE_DISPLAY_REASON, resetBootstrapSnapshot, resolveGitBinary, resolveHermesCwd, resolveUpdateRoot, secretStoragePolicy, set_rendererReadyForDeepLink, setAndPersistZoomLevel, setBackendStartFailure, setBootstrapFailure, setBootstrapRepairAttempt, setBootstrapRepairRequested, setF12Blocked, setPreviewShortcutActive, setRemoteReauthFailure, setWindowsNoSandboxRelaunchAttempted, setWindowsSandboxFallbackActive, setWindowsSandboxFallbackReason, setWindowsSandboxFallbackSticky, SKIP_QUIT_CONFIRM, spawnPriorityFrom, sshBootstrapCoordinator, sshConnections, sshScopeKey, startHermes, stopPoolBackend, streamThrottle, teardownSshConnection, terminalIpc, TRANSLUCENCY_SUPPORTED, windowConnectionRoutes, writeActiveDesktopProfile, writeDesktopConnectionConfig, writeDesktopConnectionsRegistry, writeDesktopUpdateConfig } from './composition/bootstrap-env-composition'
import {
  discoverCloudAgents,
  hasLivePortalSession,
  hasOauthSessionCookie,
  openOauthLoginWindow,
  openPortalLoginWindow,
  resolvePortalBaseUrl,
} from './host-capabilities/credentials/cloud-oauth'
import { registerMcpOauthCallbackIpc } from './host-capabilities/credentials/mcp-oauth-callback-ipc'
import { writeComposerImage } from './host-capabilities/filesystem/composer-image'
import { registerFsIpc } from './host-capabilities/filesystem/fs-ipc'
import { directoryExists, fileExists } from './host-capabilities/filesystem/fs-probe'
import {
  enableBasicPasswordStoreEncryption,
  resolveReadableFileForIpc,
  resolveRequestedPathForIpc
} from './host-capabilities/filesystem/hardening'
import {
  sanitizeWorkspaceCwd as sanitizeWorkspaceCwdImpl,
  writeDefaultProjectDir as writeDefaultProjectDirImpl
} from './host-capabilities/filesystem/project-dir'
import { resolveGhBinary } from './host-capabilities/git/gh-binary'
import { registerGitIpc } from './host-capabilities/git/git-ipc'
import { IS_MAC, IS_WINDOWS, IS_WSL } from './host-capabilities/platform/platform-facts'
import { ensureLoginShellPath } from './host-capabilities/platform/shell-path'
import {
  alreadyHasNoSandbox,
  buildNoSandboxRelaunchArgs,
  decideWindowsSandboxLaunch,
  fallbackMarker,
  grantAllApplicationPackagesAcl,
  markerAfterSuccessfulBoot,
  readSandboxMarker,
  shouldAttemptAclRepair,
  shouldRelaunchForGpuSandboxCrash,
  writeSandboxMarker
} from './host-capabilities/platform/windows-sandbox-fallback'
import { installWindowsSystemCaTrust } from './host-capabilities/platform/windows-system-ca'
import { ensureWslWindowsFonts } from './host-capabilities/platform/wsl-fonts'
import { setActiveGatewayProfile, setWslBridgeProfileState } from './host-capabilities/platform/wsl-path-bridge'
import { createFaviconCache } from './host-capabilities/preview/favicon-cache'
import {
  initMediaProtocolBridge
} from './host-capabilities/preview/media-bridge'
import { registerMediaProtocol as registerMediaProtocolImpl } from './host-capabilities/preview/media-registration'
import { registerApiProxyIpc } from './ipc/api-proxy-ipc'
import { registerBackendIpc } from './ipc/backend-ipc'
import { registerConnectionIpc } from './ipc/connection-ipc'
import { registerFilesIpc } from './ipc/files-ipc'
import { registerHudIpc } from './ipc/hud-ipc'
import { registerNativeNotifications } from './ipc/notification-ipc'
import { registerPetOverlayIpc } from './ipc/pet-overlay-ipc'
import { registerPreviewIpc } from './ipc/preview-ipc'
import { registerSystemIpc } from './ipc/system-ipc'
import { registerThemeIpc } from './ipc/theme-ipc'
import { registerWindowIpc } from './ipc/window-ipc'
import { destroyKeepaliveAgents } from './legacy-hermes/api-transport'
import { cloudAgentSilentSignIn } from './legacy-hermes/cloud-agents'
import { sshQuitShouldBlock } from './legacy-hermes/connection-apply'
import {
  buildGatewayWsUrlWithTicket
} from './legacy-hermes/connection-config'
import {
  backendScopeKey
} from './legacy-hermes/connection-registry'
import { sanitizeConnectionsRegistry } from './legacy-hermes/connections-composition'
import {
  applySecretStorageEncryption,
  broadcastConnectionsChanged,
  coerceDesktopConnectionConfig,
  migrateLegacyEncryptedSecretsOnce,
  sanitizeDesktopConnectionConfig,
  saveRegistryConnection,
  stopRegistryConnectionBackends,
} from './legacy-hermes/connections-composition'
import {
  abandonFirstRunSetupChoiceForRemoteApply,
  continueFirstRunLocalBootstrap
} from './legacy-hermes/first-run-continuation'
import { postJsonForBackend } from './legacy-hermes/gateway-connection'
import {
  clearOauthSession,
  fetchConnectionStatus,
  freshGatewayWsUrl,
  probeRemoteAuthMode,
  sendConnectionApplied,
  testDesktopConnectionConfig
} from './legacy-hermes/gateway-connection'
import { HERMES_HOME } from './legacy-hermes/home'
import {
  assertCanMutateManagedPrimaryRouting,
  requestManagedSshUpdate,
  resumeManagedSshRecoveries
} from './legacy-hermes/managed-requests'
import {
  waitForManagedUpdateOperations
} from './legacy-hermes/managed-ssh-update'
import {
  resolveHermesVersion,
} from './legacy-hermes/paths'
import {
  revalidatePool,
  revalidateSuspectPoolAfterResume,
  touchPoolBackend
} from './legacy-hermes/pool-revalidation'
import { reachablePreviewUrl, resetPreviewReach } from './legacy-hermes/preview-reach'
import {
  attachPowerResumeRemoteRevalidation
} from './legacy-hermes/remote-liveness'
import {
  createRegistryGatewayWsUrlHandler
} from './legacy-hermes/remote-ws-headers'
import {
  applySpawnPriority,
  installRemoteHeaderRules,
  managedConnectionRecoveries,
  managedConnectionUpdates,
  MAX_BOOTSTRAP_REPAIR_SOFT_ATTEMPTS,
  remoteLiveness,
  remoteRevalidation,
  resetHermesConnection,
  setPoolLimits,
} from './legacy-hermes/runtime-composition'
import {
  enumerateRegistryAgentSources,
  probeSshProfileInventory,
  rememberConnectionInstallId,
  sshInventoryAttemptedAt,
  sshRosterCache
} from './legacy-hermes/ssh-inventory'
import { installEmbedReferer } from './security/embed-referer'
import {
  checkUpdates,
  getUninstallSummary,
  runDesktopUninstall,
} from './update/updates-composition'
import { updateStreamThrottleFromActiveWork as updateStreamThrottleImpl } from './windows/active-work-throttle'
import {
  installFoundInPageForwarder
} from './windows/find-in-page'
import { createFoundInPageForwarders } from './windows/found-in-page'
import { ensureMainWindow } from './windows/main-window-lifecycle'
import { createQuickEntrySettings } from './windows/quick-entry-settings'
import { createTranslucencyPersistence } from './windows/translucency-persistence'
import {
  getTranslucencyState,
  writePersistedTranslucency
} from './windows/window-theme'
import {
  buildApplicationMenu,
  closeHudWindow,
  closeQuickEntryWindow,
  createBrowserWindow,
  createInstanceWindow,
  detectRendererSkew,
  focusWindow,
  getHudWindow,
  getQuickEntryLastState,
  getQuickEntryWindow,
  hideQuickEntryWindow,
  hudSnapShortcut,
  installMediaPermissions,
  openHudWindow,
  openPetOverlay,
  openPreviewInBrowser,
  quickEntryShortcut,
  resetHudWindowLayout,
  setHudSessionId,
  setHudWindow,
  setQuickEntryLastState,
  setQuickEntryWindow,
} from './windows/windows-composition'



if (USER_DATA_OVERRIDE) {
  const resolvedUserData = path.resolve(USER_DATA_OVERRIDE)
  fs.mkdirSync(resolvedUserData, { recursive: true })
  app.setPath('userData', resolvedUserData)
}

if (REMOTE_DISPLAY_REASON) {
  app.disableHardwareAcceleration()
  // Belt-and-suspenders for X11/VNC, where the Viz compositor can still glitch
  // with only --disable-gpu: force compositing onto the CPU too.
  app.commandLine.appendSwitch('disable-gpu-compositing')
  console.log(
    `[hermes] remote display detected (${REMOTE_DISPLAY_REASON}); disabling GPU hardware acceleration to prevent flicker`
  )
}

if (DEV_CDP.port) {
  app.commandLine.appendSwitch('remote-debugging-port', String(DEV_CDP.port))
  // Loopback only. Chromium already defaults to 127.0.0.1, but say it out loud
  // so a future edit can't widen it by omission.
  app.commandLine.appendSwitch('remote-debugging-address', '127.0.0.1')
  console.log(
    `[hermes] renderer debugging on http://127.0.0.1:${DEV_CDP.port} — anything that can reach it ` +
      'can run code in the renderer. HERMES_DESKTOP_CDP_PORT=off to disable.'
  )
} else {
  const why = describeDevCdpDecision(DEV_CDP)

  if (why) {
    console.warn(`[hermes] ${why}`)
  }
}

if (IS_WSL && !REMOTE_DISPLAY_REASON && fs.existsSync('/dev/dxg')) {
  app.commandLine.appendSwitch('ignore-gpu-blocklist')
  app.commandLine.appendSwitch('enable-gpu-rasterization')
  app.commandLine.appendSwitch('enable-zero-copy')
  console.log('[hermes] WSL GPU passthrough (/dev/dxg) detected; enabling GPU acceleration')
}

if (PASSWORD_STORE.warning) {
  console.warn(`[hermes] ${PASSWORD_STORE.warning}`)
}

if (PASSWORD_STORE.store) {
  app.commandLine.appendSwitch('password-store', PASSWORD_STORE.store)
  console.log(`[hermes] using password-store backend: ${PASSWORD_STORE.store}`)
}

if (IS_WINDOWS) {
  const windowsUserData = app.getPath('userData')
  const priorMarker = readSandboxMarker(windowsUserData)

  // Best-effort ACL repair, only when the last boot aborted or the fallback is
  // engaged — icacls /T recurses the whole install tree, so healthy launches
  // skip it (the installer already granted the ACE at install time). Repair
  // targets the install dir only: granting AppContainer read on userData would
  // expose Hermes sessions/config to every packaged app on the machine.
  if (shouldAttemptAclRepair(priorMarker)) {
    const exeDir = path.dirname(process.execPath)
    const acl = grantAllApplicationPackagesAcl(exeDir, { execFileSync })

    if (acl.ok) {
      console.log(`[hermes] granted ALL APPLICATION PACKAGES RX on ${exeDir} (#38216)`)
    } else if (acl.error && acl.error !== 'missing-target-or-exec') {
      console.warn(`[hermes] AppContainer ACL grant failed on ${exeDir}: ${acl.error}`)
    }
  }

  const sandboxDecision = decideWindowsSandboxLaunch({
    argv: process.argv,
    env: process.env,
    marker: priorMarker,
    appVersion: app.getVersion()
  })

  setWindowsSandboxFallbackActive(sandboxDecision.enable)
  setWindowsSandboxFallbackSticky(sandboxDecision.nextMarker.state === 'fallback')

  if (sandboxDecision.nextMarker.state === 'fallback' && sandboxDecision.nextMarker.reason) {
    setWindowsSandboxFallbackReason(sandboxDecision.nextMarker.reason)
  }

  if (sandboxDecision.enable && sandboxDecision.reason !== 'already-enabled') {
    app.commandLine.appendSwitch('no-sandbox')
    process.env.ELECTRON_DISABLE_SANDBOX = '1'
    console.log(
      `[hermes] Windows sandbox fallback enabled (${sandboxDecision.reason}); launching with --no-sandbox (#38216)`
    )
  }

  writeSandboxMarker(windowsUserData, sandboxDecision.nextMarker)

  // Catch the first GPU breakpoint death and relaunch before Chromium's
  // "GPU process isn't usable" FATAL abort ends the process with no recovery.
  app.on('child-process-gone', (_event, details) => {
    if (
      !shouldRelaunchForGpuSandboxCrash({
        details,
        alreadyNoSandbox: getWindowsSandboxFallbackActive() || alreadyHasNoSandbox(process.argv, process.env),
        relaunchAttempted: getWindowsNoSandboxRelaunchAttempted()
      })
    ) {
      return
    }

    setWindowsNoSandboxRelaunchAttempted(true)
    setWindowsSandboxFallbackActive(true)
    setWindowsSandboxFallbackSticky(true)
    setWindowsSandboxFallbackReason('gpu-breakpoint')

    try {
      writeSandboxMarker(app.getPath('userData'), fallbackMarker('gpu-breakpoint', app.getVersion()))
    } catch {
      void 0
    }

    console.warn(
      `[hermes] Windows GPU sandbox crashed (exit=${details?.exitCode}); relaunching once with --no-sandbox (#38216)`
    )

    try {
      app.relaunch({ args: buildNoSandboxRelaunchArgs(process.argv.slice(1)) })
      void exitAfterBackendShutdown(0)
    } catch (error) {
      console.error(`[hermes] --no-sandbox relaunch failed: ${error?.message || error}`)
    }
  })
}

app.commandLine.appendSwitch('disable-renderer-backgrounding')

if (INSTALL_STAMP) {
  console.log(
    `[hermes] install stamp: ${INSTALL_STAMP.commit.slice(0, 12)}${INSTALL_STAMP.branch ? ` (${INSTALL_STAMP.branch})` : ''}${INSTALL_STAMP.dirty ? ' [DIRTY]' : ''} from ${INSTALL_STAMP.source || 'unknown'}`
  )
} else if (IS_PACKAGED) {
  // Dev builds without a stamp are normal; packaged builds without one
  // mean the bootstrap won't know what to clone. Surface clearly.
  console.error(
    '[hermes] WARNING: no install-stamp.json found in packaged build. First-launch bootstrap will not have a pinned ref to install.'
  )
}

initDesktopLogBuffer(DESKTOP_LOG_PATH)

initMediaProtocolBridge({ ensureNativeAccessToken })

// ── Composition: bind the extracted modules to this app's singletons ────────
//
// Everything below is wiring, not policy: the behaviour lives in its module, and
// what remains here is which singleton each module is handed. This is the part of
// `main.ts` that is allowed to know every corner of the app.
const faviconCache = createFaviconCache()

const projectDirDeps = {
  configPath: defaultProjectDirConfigPath,
  isPackagedInstallPath,
  log: rememberLog,
  resolveDefaultCwd: resolveHermesCwd
}

const sanitizeWorkspaceCwd = (cwd: unknown) => sanitizeWorkspaceCwdImpl(cwd, projectDirDeps)

const writeDefaultProjectDir = (dir: unknown) => writeDefaultProjectDirImpl(dir as any, projectDirDeps)

const foundInPageForwarders = createFoundInPageForwarders(installFoundInPageForwarder)

const ensureFoundInPageForwarder = (sender: Electron.WebContents) => foundInPageForwarders.ensure(sender)

const quickEntrySettings = createQuickEntrySettings(path.join(app.getPath('userData'), 'quick-entry.json'), {
  applyShortcut: settings => quickEntryShortcut.apply(settings),
  closeWindow: () => {
    const win = getQuickEntryWindow()

    if (win && !win.isDestroyed()) {
      win.close()
    }
  },
  getWindow: getQuickEntryWindow,
  log: rememberLog,
  setWindow: win => setQuickEntryWindow(win)
})


const updateStreamThrottleFromActiveWork = () =>
  updateStreamThrottleImpl({ activeWorkByWebContents, streamThrottle })

const translucencyPersistence = createTranslucencyPersistence({
  getState: getTranslucencyState,
  write: state => writePersistedTranslucency(state as any)
})

const keepAwake = createKeepAwake(powerSaveBlocker)

// Quit sequencing state: which managed-update operation the quit handler is
// already waiting on, and whether that wait finished. Owned here because the
// handler both assigns and reads it; the operation itself lives in
// legacy-hermes/managed-requests.ts.
let managedUpdateQuitWait: Promise<void> | null = null

let managedUpdateQuitWaitDone = false

const activeWorkByWebContents = new Map<number, ActiveWork>()

const quitPrompt = createQuitPrompt({
  activeWorkByWebContents,
  getIsQuittingForHandoff,
  skipQuitConfirm: SKIP_QUIT_CONFIRM
})

const powerState = createPowerState({
  attachRemoteRevalidation: () =>
    attachPowerResumeRemoteRevalidation({
      log: rememberLog,
      powerMonitor,
      revalidate: () => revalidateSuspectPoolAfterResume()
    }),
  getMainWindow,
  log: rememberLog
})





























let sshQuitTeardownDone = false

let sshQuitTeardownPromise: Promise<void> | null = null

let backendQuitTeardownDone = false









const windowConnectionRouteOwners = new Set<number>()

registerPetOverlayIpc({
  getMainWindow: () => getMainWindow(),
  getPetOverlayWindow: () => getPetOverlayWindow(),
  openPetOverlay,
  closePetOverlay
})

const hudIpc = registerHudIpc({
  isMac: IS_MAC,
  getTranslucencyState: () => getTranslucencyState(),
  getHudWindow: () => getHudWindow(),
  openHudWindow,
  closeHudWindow,
  resetHudLayout: () => resetHudWindowLayout(),
  setHudSessionId: value => {
    setHudSessionId(value)
  }
})

const registryGatewayWsUrlHandler = createRegistryGatewayWsUrlHandler({
  ensureBackend: ensureRegistryBackend,
  mintTicket: mintGatewayWsTicket,
  buildTicketUrl: buildGatewayWsUrlWithTicket,
  rememberHeaders: rememberRemoteWsHeaders
})

const claimedAmbientCue = createEventDeduper()

registerNativeNotifications({ getMainWindow: () => getMainWindow(), focusWindow })

const PLUGIN_SOURCE_MAX_BYTES = 16 * 1024 * 1024




app.on('before-quit', () => {
  if (translucencyPersistence.cancelPending()) {
    writePersistedTranslucency(getTranslucencyState())
  }
})

app.on('will-quit', () => {
  destroyKeepaliveAgents()
})








registerFsIpc({
  hermesHome: HERMES_HOME,
  readActiveDesktopProfile,
  expandUserPath,
  resolveRequestedPathForIpc,
  directoryExists,
  resolveGitBinary
})

registerGitIpc({ resolveGitBinary, resolveGhBinary })

registerMcpOauthCallbackIpc()

const disposeTerminalSession = terminalIpc.disposeTerminalSession

if (!isPrimaryInstance) {
  // Hard-exit, not app.quit(): the before-quit teardown coordinator defers a
  // plain quit (event.preventDefault + async backend shutdown), and in that
  // window `ready` still fires — the lock-losing instance then runs the full
  // startup (shortcut registration, createWindow → startHermes), whose
  // reapOrphans() SIGTERMs the running instance's live backend (#87295).
  // app.exit() terminates immediately, before `ready`, so a second launch
  // routes into the running window and never touches backend machinery.
  app.exit(0)
} else {
  app.on('second-instance', (_event, argv) => {
    const url = _extractDeepLink(argv)

    if (url) {
      handleDeepLink(url)
    }

    ensureMainWindow(getMainWindow(), {
      isReady: app.isReady(),
      createWindow,
      focusWindow,
      // deep-link delivery focuses a live window after its renderer is ready.
      focusExisting: !url
    })
  })
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})

registerSystemIpc({
  IS_PACKAGED,
  REMOTE_DISPLAY_REASON,
  loadInstallStamp,
  INSTALL_STAMP,
  DESKTOP_LOG_PATH,
  DEFAULT_UPDATE_BRANCH,
  fileExists,
  readDesktopUpdateConfig,
  writeDesktopUpdateConfig,
  resolveUpdateRoot,
  checkUpdates,
  applyUpdates,
  resolveHermesCwd,
  readDefaultProjectDir,
  writeDefaultProjectDir,
  getOnBatteryPower: () => powerState.isOnBattery(),
  exitAfterBackendShutdown,
  resolveHermesVersion,
  detectRendererSkew,
  getUninstallSummary,
  runDesktopUninstall,
  HERMES_PROTOCOL,
  get_pendingDeepLink: () => get_pendingDeepLink(),
  set_pendingDeepLink: value => (set_pendingDeepLink(value)),
  get_rendererReadyForDeepLink: () => get_rendererReadyForDeepLink(),
  set_rendererReadyForDeepLink: value => (set_rendererReadyForDeepLink(value)),
  handleDeepLink,
})

registerConnectionIpc({
  backendConnectionState,
  remoteLiveness,
  remoteRevalidation,
  backendDialClaims,
  spawnPriorityFrom,
  applySpawnPriority,
  getBootstrapFailure: () => getBootstrapFailure(),
  setBootstrapFailure: value => (setBootstrapFailure(value)),
  getRemoteReauthFailure: () => getRemoteReauthFailure(),
  setRemoteReauthFailure: value => (setRemoteReauthFailure(value)),
  abandonFirstRunSetupChoiceForRemoteApply,
  applyUpdates,
  fetchPublicJson,
  gatewayAuthProviders,
  hasOauthSessionCookie,
  hasLiveOauthSession,
  clearOauthSession,
  openOauthLoginWindow,
  _storeNativeTokens,
  _clearNativeTokens,
  hasNativeSession,
  postJsonNoAuth,
  mintGatewayWsTicket,
  resolvePortalBaseUrl,
  hasLivePortalSession,
  openPortalLoginWindow,
  discoverCloudAgents,
  cloudAgentSilentSignIn,
  secretStoragePolicy,
  applySecretStorageEncryption,
  decryptDesktopSecret,
  decryptRemoteHeaders,
  readDesktopConnectionConfig,
  writeDesktopConnectionConfig,
  readDesktopConnectionsRegistry,
  writeDesktopConnectionsRegistry,
  sanitizeConnectionsRegistry,
  saveRegistryConnection,
  sanitizeDesktopConnectionConfig,
  coerceDesktopConnectionConfig,
  managedConnectionUpdateGate,
  assertCanMutateManagedPrimaryRouting,
  sshBootstrapCoordinator,
  sshScopeKey,
  teardownSshConnection,
  resetPreviewReach,
  probeRemoteAuthMode,
  testDesktopConnectionConfig,
  fetchConnectionStatus,
  resetHermesConnection,
  teardownPrimaryBackendAndWait,
  sendConnectionApplied,
  broadcastConnectionsChanged,
  primaryProfileKey,
  ensureBackend,
  ensureRegistryBackend,
  stopRegistryConnectionBackends,
  stopPoolBackend,
  startHermes,
  windowConnectionRoutes,
  windowConnectionRouteOwners,
  revalidatePool,
  sshRosterCache,
  sshInventoryAttemptedAt,
  rememberConnectionInstallId,
  probeSshProfileInventory,
  enumerateRegistryAgentSources,
  requestManagedSshUpdate,
  postJsonForBackend,
  fetchJsonForBackend,
})

registerBackendIpc({
  HERMES_HOME,
  getMainWindow: () => getMainWindow(),
  backendConnectionState,
  getPoolLimits: () => getPoolLimits(),
  setPoolLimits,
  getBootstrapFailure: () => getBootstrapFailure(),
  setBootstrapFailure: value => (setBootstrapFailure(value)),
  getBackendStartFailure: () => getBackendStartFailure(),
  setBackendStartFailure: value => (setBackendStartFailure(value)),
  getRemoteReauthFailure: () => getRemoteReauthFailure(),
  setRemoteReauthFailure: value => (setRemoteReauthFailure(value)),
  getBootstrapAbortController: () => getBootstrapAbortController(),
  getBootstrapRepairRequested: () => getBootstrapRepairRequested(),
  setBootstrapRepairRequested: value => (setBootstrapRepairRequested(value)),
  getBootstrapRepairAttempt: () => getBootstrapRepairAttempt(),
  bumpBootstrapRepairAttempt: () => {
    setBootstrapRepairAttempt(getBootstrapRepairAttempt() + 1)
  },
  MAX_BOOTSTRAP_REPAIR_SOFT_ATTEMPTS,
  getBootProgressState: () => getBootProgressState(),
  getBootstrapState,
  resetBootstrapSnapshot,
  getFirstRunSetupGate,
  continueFirstRunLocalBootstrap,
  freshGatewayWsUrl,
  readActiveDesktopProfile,
  writeActiveDesktopProfile,
  assertCanMutateManagedPrimaryRouting,
  teardownSshConnection,
  resetHermesConnection,
  teardownPrimaryBackendAndWait,
  sendConnectionApplied,
  primaryProfileKey,
  touchPoolBackend,
  teardownPoolBackendAndWait,
  startHermes,
  registryGatewayWsUrlHandler,
})

registerWindowIpc({
  IS_MAC,
  getF12Blocked: () => getF12Blocked(),
  setF12Blocked: value => (setF12Blocked(value)),
  getMainWindow: () => getMainWindow(),
  getPreviewShortcutActive: () => getPreviewShortcutActive(),
  setPreviewShortcutActive: value => (setPreviewShortcutActive(value)),
  setAndPersistZoomLevel,
  lastContextMenuPoint,
  createSessionWindow,
  createBrowserWindow,
  createInstanceWindow,
  getQuickEntryWindow: () => getQuickEntryWindow(),
  getQuickEntryLastState: () => getQuickEntryLastState(),
  setQuickEntryLastState: value => (setQuickEntryLastState(value)),
  readQuickEntrySettings: () => quickEntrySettings.read(),
  writeQuickEntrySettings: (settings: any) => quickEntrySettings.write(settings),
  hideQuickEntryWindow,
  quickEntryShortcut,
  applyQuickEntrySettings: (settings: any) => quickEntrySettings.apply(settings),
  claimedAmbientCue,
  activeWorkByWebContents,
  updateStreamThrottleFromActiveWork,
  KEEP_AWAKE_CONFIG_PATH,
  keepAwake,
  DISABLE_F12_CONFIG_PATH,
  ensureFoundInPageForwarder,
})

registerApiProxyIpc({
  HERMES_HOME,
  PROFILE_NAME_RE,
  profileDeletionGate,
  ensureBackend,
  prepareProfileDeleteRequest,
  dispatchRegistryApiRequest,
  registryConnectionKind,
  teardownConnectionScopedProfileBackend,
  handleHermesApiRequest,
  getDataUrlReadMaxMb: () => getDataUrlReadMaxMb(),
  persistDataUrlReadMaxMb,
})

registerFilesIpc({
  IS_WINDOWS,
  IS_WSL,
  getMainWindow: () => getMainWindow(),
  sanitizeWorkspaceCwd,
  mimeTypeForPath,
  saveImageFromUrl,
  writeComposerImage,
  normalizePreviewTarget,
  watchPreviewFile,
  stopPreviewFileWatch,
  watchDirectory,
  saveGatewayFile,
  getDataUrlReadMaxMb: () => getDataUrlReadMaxMb(),
  PLUGIN_SOURCE_MAX_BYTES,
})

registerThemeIpc({
  GLASS_SUPPORTED,
  TRANSLUCENCY_SUPPORTED,
  hudIpc,
  scheduleTranslucencyWrite: () => translucencyPersistence.schedule(),
})

registerPreviewIpc({
  openExternalUrl,
  openPreviewInBrowser,
  fetchLinkTitle,
  resolveFaviconCached: (url: string) => faviconCache.resolve(url),
  reachablePreviewUrl,
})

app.whenReady().then(() => {
  // Warm the login-shell PATH resolution immediately so it usually completes
  // before the backend start path awaits the same single-flight promise.
  void ensureLoginShellPath()

  const systemCa = installWindowsSystemCaTrust(tls)

  if (systemCa.applied) {
    rememberLog(
      `[tls] trusting ${systemCa.systemCertificateCount} Windows system CA certificate(s) for backend connections`
    )
  } else if (systemCa.error) {
    rememberLog(`[tls] could not load Windows system CA certificates: ${systemCa.error}`)
  }

  // Keyring-less Linux `--password-store=basic` support. This must run before
  // createWindow() and anything that could touch safeStorage; the narrow
  // platform/switch/guard semantics live in the extracted helper.
  enableBasicPasswordStoreEncryption({
    platform: process.platform,
    passwordStoreSwitch: app.commandLine.getSwitchValue('password-store'),
    safeStorageApi: safeStorage
  })

  // Keychain encryption is opt-in (default OFF). One-shot: rewrite any
  // legacy safeStorage-encrypted secrets as plain so no later launch ever
  // touches the OS keychain unless the user turns encryption on in
  // Settings → Gateway. Must run before createWindow() and the first
  // connection resolution.
  migrateLegacyEncryptedSecretsOnce()

  if (IS_MAC) {
    Menu.setApplicationMenu(buildApplicationMenu())
  } else {
    Menu.setApplicationMenu(null)
  }

  installMediaPermissions()
  installDownloadHandlingImpl({ extensionForMimeType })
  registerMediaProtocolImpl({
    backendScopeKey,
    ensureBackend,
    ensureRegistryBackend,
    ensureRemoteBearer: baseUrl => ensureNativeAccessToken(baseUrl),
    getOauthSession,
    getOauthSessionForUrl,
    resolveReadablePath: async filePath => {
      const { resolvedPath } = await resolveReadableFileForIpc(filePath, { purpose: 'Media stream' })

      return resolvedPath
    },
    runDedupedBackendDial: (scopeKey, dial) => backendDialClaims.run(scopeKey, dial)
  })
  installEmbedReferer()
  installRemoteHeaderRules()
  registerDeepLinkProtocol()

  ensureWslWindowsFonts()
  configureSpellCheckerImpl({ log: rememberLog })
  powerState.register()
  keepAwake.set(readPersistedKeepAwake())
  setF12Blocked(readPersistedDisableF12())
  // Seed this before the first window exists: a picker can open before
  // startHermes() finishes resolving the configured backend.
  const primaryProfile = primaryProfileKey()

  setActiveGatewayProfile(primaryProfile)
  setWslBridgeProfileState(primaryProfile, !primaryBackendIsRemote())
  // Quick Entry's global chord — registered on ready so a cold launch restores
  // it without the renderer visiting Settings. A failed registration is logged
  // here and surfaced in Settings via the IPC state (never silent).
  quickEntrySettings.apply(quickEntrySettings.read())

  // A hard crash can interrupt the in-memory restore loop after exact remote
  // serves were drained. The owner-only recovery journal survives that crash;
  // its worker waits for the install marker to clear, then reopens every scope
  // captured by the original transaction before removing the journal entry.
  void resumeManagedSshRecoveries()
  createWindow()

  // Win/Linux cold start: the launching hermes:// URL is in our own argv.
  const _coldStartLink = _extractDeepLink(process.argv)

  if (_coldStartLink) {
    handleDeepLink(_coldStartLink)
  }

  app.on('activate', () => {
    // Recreate the primary window if it's gone. Guard on mainWindow directly
    // (not just total window count) so a dock click still restores the main
    // window when only secondary session windows remain open.
    if (!getMainWindow() || getMainWindow().isDestroyed()) {
      createWindow()
    } else {
      focusWindow(getMainWindow())
    }
  })
})



app.on('before-quit', event => {
  // Runs ahead of every teardown below, so "Keep Running" leaves the app
  // exactly as it was.
  if (quitPrompt.held(event)) {
    return
  }

  // A detached remote updater can outlive this Electron process. Do not tear
  // down its SSH observer/restore transaction at the generic SSH shutdown
  // deadline: join it first (BEFORE sealing the bootstrap coordinator, whose
  // shutdown would refuse the restore dials), then re-enter before-quit for
  // normal teardown. A crash still fails closed on next launch via the remote
  // install-marker preflight in both POSIX and Windows lifecycle
  // implementations.
  if (
    !managedUpdateQuitWaitDone &&
    (managedUpdateQuitWait || managedConnectionUpdates.size > 0 || managedConnectionRecoveries.size > 0)
  ) {
    event.preventDefault()

    if (!managedUpdateQuitWait) {
      managedUpdateQuitWait = waitForManagedUpdateOperations(() => [
        ...managedConnectionUpdates.values(),
        ...managedConnectionRecoveries.values()
      ]).finally(() => {
        managedUpdateQuitWaitDone = true
        app.quit()
      })
    }

    return
  }

  // A prevented first quit leaves the renderer alive while teardown runs.
  // Seal the SSH coordinator before touching connections so reconnect
  // callbacks cannot recreate a backend for a registration whose app is
  // already quitting (#91668).
  sshBootstrapCoordinator.shutdown()

  if (!backendQuitTeardownDone) {
    event.preventDefault()
    void backendShutdown.run().finally(() => {
      backendQuitTeardownDone = true
      app.quit()
    })
  }

  // backendShutdown.finally() re-enters before-quit. teardownSshConnection
  // already deleted the map entries, so size===0 would skip the kill wait
  // and let window-X quit finish while SSH exec is still running (#91668).
  if (
    sshQuitShouldBlock({
      teardownDone: sshQuitTeardownDone,
      connectionCount: sshConnections.size,
      bootstrapPending: sshBootstrapCoordinator.promises().length,
      inFlight: sshQuitTeardownPromise
    })
  ) {
    event.preventDefault()

    if (!sshQuitTeardownPromise) {
      const scopes = [...sshConnections.keys()]

      const pending = Promise.allSettled([
        ...scopes.map(scope => teardownSshConnection(scope || null)),
        ...sshBootstrapCoordinator.promises()
      ])

      // cleanupStale waits up to 5s for the owned pid to exit (50 * 100ms).
      // The previous 4s race could close SSH first and leave serve --isolated
      // reparented to pid 1. Latch this promise BEFORE those deletes land so
      // a re-entrant quit still waits.
      sshQuitTeardownPromise = Promise.race([pending, new Promise<void>(resolve => setTimeout(resolve, 6_000))]).then(
        async () => {
          await sshBootstrapCoordinator.forceCleanupAll()
        }
      )
    }

    void sshQuitTeardownPromise.then(() => {
      sshQuitTeardownDone = true
      app.quit()
    })
  }

  // Clean quit mid-boot should not trip next-launch --no-sandbox (#38216).
  // FATAL GPU aborts skip before-quit, leaving the `booting` marker in place.
  // Keyed on sticky (not active): a manual --no-sandbox run still records a
  // clean quit, while an engaged fallback keeps its sticky marker.
  if (IS_WINDOWS && !getWindowsSandboxFallbackSticky()) {
    try {
      writeSandboxMarker(app.getPath('userData'), markerAfterSuccessfulBoot({ fallbackActive: false }))
    } catch {
      void 0
    }
  }

  // The always-on-top overlay isn't a "real" app window; close it so a stray
  // pet can't keep the process alive or float over a quit app.
  closePetOverlay()

  // Same for the HUD — an always-on-top panel outliving the app would leave a
  // floating composer with nothing behind it. Close it directly rather than via
  // closeHudWindow(): that also re-shows the main window, which is wrong on the
  // way out (and `hudRestoreMainWindow` may still be armed from entering HUD).
  hudSnapShortcut.dispose()

  if (getHudWindow() && !getHudWindow().isDestroyed()) {
    getHudWindow().removeAllListeners('closed')
    getHudWindow().destroy()
  }

  setHudWindow(null)

  // Same for the Quick Entry composer — and release its global accelerator so a
  // quitting Hermes never keeps another app's chord hostage.
  closeQuickEntryWindow()

  // Quitting mid-install should stop the installer, not orphan it.
  if (getBootstrapAbortController()) {
    try {
      getBootstrapAbortController().abort()
    } catch {
      void 0
    }
  }

  cancelScheduledDesktopLogFlush()

  flushDesktopLogBufferSync()
  closePreviewWatchers()

  // Kill open PTYs before environment teardown to avoid the node-pty#904
  // ThreadSafeFunction SIGABRT race.
  terminalIpc.disposeAllTerminalSessions()

  void backendShutdown.run()
})

app.on('window-all-closed', () => {
  // macOS convention: keep the process alive in the Dock when the user closes
  // the last window. But when we're handing off to a detached updater / swap /
  // uninstall script, the process MUST exit so the script can replace or remove
  // the bundle and relaunch — without this the script's PID-wait spins to its
  // full timeout and the user is left with an invisible app (or an uninstall
  // that appears to do nothing).
  if (process.platform !== 'darwin' || getIsQuittingForHandoff()) {
    app.quit()
  }
})
