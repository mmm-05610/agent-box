import { execFileSync, spawn } from 'node:child_process'
// Extracted verbatim from main.ts (see docs/desktop-megafile-decomposition.md).
// main.ts keeps only the startup/lifecycle statement sequence; the accessors at the
// bottom exist so main can read/write the few mutable bindings the sequence needs.
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  app,
  BrowserWindow,
  dialog,
  net as electronNet,
  webContents as electronWebContents,
  nativeTheme,
  safeStorage,
  screen,
  session,
  shell
} from 'electron'

import { classifyActiveRuntime } from '../legacy-hermes/active-runtime-state'
import { jsonAgentFor, withRetry } from '../legacy-hermes/api-transport'
import { appIconCandidates, resolveAppIcon } from '../windows/app-icon'
import { dashboardFallbackArgs, sourceDeclaresServe } from '../legacy-hermes/backend-command'
import {
  hermesBackendEnv,
  hermesLocalWsUrl,
  hermesPrimaryConnectionDescriptor,
  hermesProfiledConnectionDescriptor,
  hermesServeArgs
} from '../legacy-hermes/lifecycle'
import { buildDesktopBackendEnv, hermesManagedNodePathEntries, normalizeHermesHomeRoot } from '../legacy-hermes/backend-env'
import {
  isReauthRequiredError,
  makeNousCloudBackendDownError,
  makeUnsignedOauthError,
  waitForHermesReady
} from '../legacy-hermes/backend-health'
import { backendCommandMatches, createBackendOwnership, createBackendShutdownCoordinator } from '../legacy-hermes/backend-ownership'
import {
  canImportHermesCli,
  execProbeSync,
  HERMES_EXECUTABLE_NOT_FOUND,
  PROBE_TIMEOUT_MS,
  shouldTrustHermesOverride,
  verifyHermesCli
} from '../legacy-hermes/backend-probes'
import { waitForDashboardPortAnnouncement } from '../legacy-hermes/backend-ready'
import { isPidAliveWindows, waitForBackendRelease } from '../legacy-hermes/backend-release-gate'
import {
  isHostKeyChangedBootFailure,
  isRetryableRemoteBootFailure,
  shouldLatchBackendStartFailure,
  shouldLatchHostKeyChangedFailure,
  shouldLatchRemoteReauthFailure
} from '../legacy-hermes/backend-start-failure'
import {
  detectRemoteDisplay,
  isWindowsBinaryPathInWsl,
  isWslEnvironment,
  resolveLinuxPasswordStore
} from '../host-capabilities/platform/bootstrap-platform'
import { runBootstrap } from '../legacy-hermes/bootstrap-runner'
import { detectBundleSwap } from '../update/bundle-swap'
import { teardownSshState } from '../legacy-hermes/connection-apply'
import {
  buildGatewayWsUrl,
  buildGatewayWsUrlWithTicket,
  connectionScopeKey,
  cookiesHaveLiveSession,
  gatewayTicketFailure,
  hostLabelFromBaseUrl,
  modeIsRemoteLike,
  normalizeRemoteBaseUrl,
  normalizeRemoteHeaders,
  normalizeSshConfig,
  normAuthMode,
  profileHasRemoteConnection,
  profileRemoteOverride,
  profileSshOverride,
  resolveProfileBackendRoute,
  resolveRemoteSshDashboardProfile,
  withTransientRetries
} from '../legacy-hermes/connection-config'
import {
  backendScopeKey,
  migrateV1ToRegistry,
  normalizeRegistry,
  reconcileRegistryDrift,
  registrySourceOwnsPrimaryBackend,
  resolveRegistryLocalRoute,
  reuseMatchingPrimarySshBackend,
  upsertConnection
} from '../legacy-hermes/connection-registry'
import { describeCrashReason } from '../app/crash-forensics'
import { adoptServedDashboardToken } from '../legacy-hermes/dashboard-token'
import { loadOrCreateInstallationId, sshOwnershipId } from '../app/desktop-installation'
import { resolveDesktopRemoteRoute, v1SshTerminalPoolKey } from '../legacy-hermes/desktop-remote-route'
import {
  resolveRemovableAppPath
} from '../update/desktop-uninstall'
import { resolveDevCdpPort } from '../app/dev-cdp'
import { findGitBash as _findGitBash } from '../host-capabilities/platform/find-git-bash'
import {
  installFindShortcut
} from '../windows/find-in-page'
import { createFirstRunSetupGate } from '../legacy-hermes/first-run-setup-gate'
import { startGatewaysAfterUpdateAbort, stopGatewayBeforeUpdate } from '../legacy-hermes/gateway-stop-before-update'
import { probeGatewayWebSocket } from '../legacy-hermes/gateway-ws-probe'
import { readAndConsumeHandoffResult } from '../update/handoff-result'
import {
  DEFAULT_FETCH_TIMEOUT_MS,
  encryptDesktopSecret as encryptDesktopSecretStrict,
  resolveRequestedPathForIpc,
  resolveTimeoutMs,
  SAFE_STORAGE_ENCODING,
  tightenSecretFileMode,
  writeSecretFileAtomic
} from '../host-capabilities/filesystem/hardening'
import {
  fenceManagedSshBootstrapPublication,
  ManagedConnectionUpdateGate,
  managedSshTokenPersistencePlan,
  validateCorrelationId
} from '../legacy-hermes/managed-ssh-update'
import {
  oauthGuardMayHardFail,
  oauthSessionIsLive,
  oauthTicketFailureAuthMessage,
  resolveJsonBody,
  resolveReadinessProbeAuth
} from '../host-capabilities/credentials/native-auth-decisions'
import {
  nativeRefreshUrl,
  type NativeTokenSet,
  parseTokenResponse,
  tokenNeedsRefresh
} from '../host-capabilities/credentials/native-oauth'
import { loadNativeTokenSet, type NativeTokenStoreIo, persistNativeTokenSet } from '../host-capabilities/credentials/native-token-store'
import { serializeJsonBody, setJsonRequestHeaders } from '../host-capabilities/credentials/oauth-net-request'
import { LEGACY_OAUTH_PARTITION, resolveOauthPartition } from '../host-capabilities/credentials/oauth-partition'
import { createParentStartMarkerResolver, electronProcessStartMarker, parentWatchdogEnv } from '../legacy-hermes/parent-process-identity'
import {
  pendingNotice as pendingPluginCompatNotice,
  recordDismissed as recordPluginCompatDismissed
} from '../legacy-hermes/plugin-compat-notice'
import { selectPoolEvictions } from '../legacy-hermes/pool-eviction'
import { clampPoolLimits, parsePoolLimits, POOL_LIMITS_DEFAULTS } from '../legacy-hermes/pool-limits'
import {
  isBackgroundSlotWaitTimeout,
  LocalBackendSpawnCoordinator,
  type LocalBackendSpawnPriority,
  type LocalBackendSpawnRequest,
  releaseLocalBackendSlotAfterExit
} from '../legacy-hermes/pool-spawn-coordinator'
import { createPoolStopper } from '../legacy-hermes/pool-stop'
import {
  createPrimaryRemoteConnection,
  FirstRunSetupResetError,
  runPrimaryBackendStartup
} from '../legacy-hermes/primary-backend-startup'
import { stopChildProcess as stopBackendChildImpl, stopProcessTreesForUpdate } from '../process/child-stop'
import { createConnectionState } from '../process/connection-state'
import {
  claimDecision,
  execText,
  isPidOnlyStartMarker,
  pidOnlyStartMarker,
  probeStartMarker,
  type ProcessIdentityDeps,
  processStartMarker,
  REAP_PROBE_TIMEOUT_MS
} from '../process/identity'
import { InFlightClaims } from '../process/inflight-claim'
import { createOutputTail, type ProcessOutputTail } from '../process/output-tail'
import {
  assertLocalProfileCanStart,
  ProfileDeletionGate
} from '../legacy-hermes/profile-delete-routing'
import { migrateActiveProfileIfMissing as migrateActiveProfileIfMissingPure } from '../legacy-hermes/profile-migration'
import * as remoteLifecycle from '../legacy-hermes/remote-lifecycle'
import {
  ensureHealthyPooledRemoteBackendForDispatch,
  RemoteRevalidationCoordinator
} from '../legacy-hermes/remote-liveness'
import {
  createRemoteWsHeaderStore
} from '../legacy-hermes/remote-ws-headers'
import { missingRendererAssets } from '../app/renderer-bundle'
import { loadRendererLoadErrorPage } from '../windows/renderer-load-error-page'
import { attachRendererConsoleCapture } from '../app/renderer-log'
import {
  classifyStoredSecret,
  readSecretStoragePolicy,
  SECRET_STORAGE_POLICY_FILE,
  type SecretStoragePolicy
} from '../host-capabilities/credentials/secret-storage-policy'
import {
  buildSessionWindowUrl,
  chatWindowWebPreferences,
  createSessionWindowRegistry,
  SESSION_WINDOW_MIN_HEIGHT,
  SESSION_WINDOW_MIN_WIDTH
} from '../windows/session-windows'
import { ensureLoginShellPath } from '../host-capabilities/platform/shell-path'
import { createBootstrapCoordinator, sshConfigFingerprint } from '../legacy-hermes/ssh-bootstrap-coordinator'
import { pickLocalPort, redactSecrets, SshConnection } from '../host-capabilities/platform/ssh-connection'
import { createStreamThrottle } from '../windows/stream-throttle'
import { registerTerminalIpc } from '../host-capabilities/terminal/terminal-ipc'
import { nativeOverlayWidth as computeNativeOverlayWidth } from '../windows/titlebar-overlay-width'
import {
  glassSupportedOn,
  translucencySupportedOn
} from '../windows/translucency'
import { waitForUpdateClearance } from '../update/update-gate'
import { readLiveUpdateMarker, updateHandoffConflict, writeUpdateMarker } from '../update/update-marker'
import { isOfficialSshRemote, OFFICIAL_REPO_HTTPS_URL } from '../update/update-remote'
import {
  collectRelaunchArgs,
  observeUpdaterHandoff,
  resolvePosixScriptHandoff,
  resolveStagedUpdaterBinary,
  resolveUpdateScriptHandoff,
  sandboxFallbackFromEnv,
  spawnUpdaterProcess,
  stagedUpdaterSupportsPrewrittenMarker,
  windowsUpdatePrerequisiteError,
  wrapHandoffForDetachedConsole
} from '../update/updater-process'
import {
  formatBlockerMessage,
  formatProbeFailedMessage,
  scanVenvBlockers,
  stopSafeVenvBlockers
} from '../legacy-hermes/venv-blocker-scan'
import { isHermesOwnedVenvDaemon } from '../legacy-hermes/venv-holder-select'
import { createWakeIndicatorWindowController } from '../windows/wake-indicator-window'
import {
  registrySshPoolScopeByConnectionId,
  registrySshScopeForWindowRoute,
  WindowConnectionRouteRegistry
} from '../legacy-hermes/window-connection-route'
import { createWindowOpenHandler } from '../security/window-open-policy'
import { installWindowRendererLifecycle } from '../windows/window-renderer-lifecycle'
import { createWindowRevealController } from '../windows/window-reveal'
import {
  bindGeometryPersistence,
  computeWindowOptions,
  debounce,
  sanitizeWindowState,
  MIN_HEIGHT as WINDOW_MIN_HEIGHT,
  MIN_WIDTH as WINDOW_MIN_WIDTH
} from '../windows/window-state'
import { hiddenWindowsChildOptions } from '../host-capabilities/platform/windows-child-options'
import {
  buildPathExtCandidates,
  chooseUpdaterArgs,
  getVenvSitePackagesEntries,
  resolveVenvHermesCommand
} from '../legacy-hermes/windows-hermes-path'
import {
  connectWindowsRemote,
  detectRemotePlatform,
  terminateOwnedWindowsDashboardForUpdate
} from '../legacy-hermes/windows-remote-lifecycle'
import {
  alreadyHasNoSandbox,
  buildNoSandboxRelaunchArgs,
  fallbackMarker,
  markerAfterSuccessfulBoot,
  type SandboxFallbackReason,
  shouldRelaunchForRendererSandboxCrashLoop,
  writeSandboxMarker
} from '../host-capabilities/platform/windows-sandbox-fallback'
import { readWindowsUserEnvVar } from '../host-capabilities/platform/windows-user-env'
import { isPackagedInstallPath as isPackagedInstallPathUnderRoots } from '../security/workspace-cwd'
import { setActiveGatewayProfile, setWslBridgeProfileState } from '../host-capabilities/platform/wsl-path-bridge'
import {
  applyZoomLevel,
  DEFAULT_ZOOM_LEVEL,
  installZoomReassertOnNavigation,
  installZoomReassertOnWindowEvents,
  ZOOM_STEP,
  ZOOM_STORAGE_KEY,
  zoomWiringForWindowKind
} from '../windows/zoom'

import {
  getRecentHermesLogLines,
  rememberLog
} from '../app/log-buffer'
import {
  headersForRemoteRequest,
} from '../legacy-hermes/runtime-composition'
import {
  applyTitleBarOverlay,
  chatWindowSurfaceOptions,
  getTitleBarOverlayOptions,
  translucencyBackedWindows
} from '../windows/window-theme'

export const USER_DATA_OVERRIDE = process.env.HERMES_DESKTOP_USER_DATA_DIR

export const DEV_SERVER = process.env.HERMES_DESKTOP_DEV_SERVER

export const IS_PACKAGED = app.isPackaged || Boolean(process.env.HERMES_DESKTOP_IS_PACKAGED)

export const IS_MAC = process.platform === 'darwin'

export const IS_WINDOWS = process.platform === 'win32'

export const IS_WSL = isWslEnvironment()

export const DARWIN_MAJOR = IS_MAC ? Number.parseInt(os.release(), 10) || 0 : 0

export const GLASS_SUPPORTED = glassSupportedOn(process.platform, os.release())

export const TRANSLUCENCY_SUPPORTED = translucencySupportedOn(process.platform)

export const APP_ROOT = app.getAppPath()

export let f12Blocked = false

export const PRELOAD_PATH = path.join(APP_ROOT, 'dist', 'electron-preload.js')

export const REMOTE_DISPLAY_REASON = detectRemoteDisplay()

export const DEV_CDP = resolveDevCdpPort({ env: process.env, isPackaged: IS_PACKAGED, devServer: DEV_SERVER })

export const PASSWORD_STORE = resolveLinuxPasswordStore()

export let windowsSandboxFallbackActive = false

export let windowsSandboxFallbackSticky = false

export let windowsSandboxFallbackReason: SandboxFallbackReason = 'boot-loop'

export let windowsNoSandboxRelaunchAttempted = false

export const SOURCE_REPO_ROOT = path.resolve(APP_ROOT, '../..')

export const INSTALL_STAMP_SCHEMA_VERSION = 1

export function loadInstallStamp() {
  // Try packaged location first (resources/install-stamp.json), then the
  // dev/local build output (apps/desktop/build/install-stamp.json) so
  // someone running `npm run start` after a local `npm run build` also
  // sees a stamp without needing a packaged build.
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'install-stamp.json') : null,
    path.join(APP_ROOT, 'build', 'install-stamp.json')
  ].filter(Boolean)

  for (const p of candidates) {
    try {
      const raw = fs.readFileSync(p, 'utf8')
      const parsed = JSON.parse(raw)

      if (parsed && typeof parsed === 'object' && typeof parsed.commit === 'string' && parsed.commit.length >= 7) {
        if (parsed.schemaVersion !== INSTALL_STAMP_SCHEMA_VERSION) {
          console.warn(
            `[hermes] install-stamp.json schemaVersion ${parsed.schemaVersion} != expected ${INSTALL_STAMP_SCHEMA_VERSION}; ignoring`
          )

          continue
        }

        return Object.freeze({
          schemaVersion: parsed.schemaVersion,
          commit: parsed.commit,
          branch: parsed.branch || null,
          builtAt: parsed.builtAt || null,
          dirty: Boolean(parsed.dirty),
          source: parsed.source || null,
          path: p
        })
      }
    } catch (e) {
      console.warn(`[hermes] install-stamp.json found at ${p} , but parsing failed with ${e}`)
      // Either ENOENT or malformed JSON; try the next candidate
    }
  }

  return null
}

export const INSTALL_STAMP = loadInstallStamp()

export function resolveHermesHome() {
  if (process.env.HERMES_HOME) {
    return normalizeHermesHomeRoot(process.env.HERMES_HOME)
  }

  if (USER_DATA_OVERRIDE) {
    return path.join(path.resolve(USER_DATA_OVERRIDE), 'hermes-home')
  }

  if (IS_WINDOWS) {
    // A GUI app launched from Explorer inherits the environment block captured
    // at login, so a HERMES_HOME set via `setx` AFTER login is invisible in
    // process.env even though the CLI (a fresh shell) sees it. Without this the
    // backend silently falls back to %LOCALAPPDATA%\hermes and reports "No
    // inference provider configured" despite a valid configured home (#45471).
    // Consult the live User-scoped registry value before the default below.
    const fromRegistry = readWindowsUserEnvVar('HERMES_HOME')

    if (fromRegistry) {
      return normalizeHermesHomeRoot(fromRegistry)
    }
  }

  if (IS_WINDOWS && process.env.LOCALAPPDATA) {
    const localappdata = path.join(process.env.LOCALAPPDATA, 'hermes')
    const legacy = path.join(app.getPath('home'), '.hermes')

    // Migrate transparently to LOCALAPPDATA, but honour an existing legacy
    // ~/.hermes setup (no LOCALAPPDATA install yet) so users don't lose state.
    if (!directoryExists(localappdata) && directoryExists(legacy)) {
      return legacy
    }

    return localappdata
  }

  return path.join(app.getPath('home'), '.hermes')
}

export const HERMES_HOME = resolveHermesHome()

export const DESKTOP_LOG_PATH = path.join(HERMES_HOME, 'logs', 'desktop.log')

export function pathWithHermesManagedNode(...entries) {
  const managed = hermesManagedNodePathEntries(HERMES_HOME).filter(directoryExists)

  return [...managed, ...entries, process.env.PATH].filter(Boolean).join(path.delimiter)
}

export const ACTIVE_HERMES_ROOT = path.join(HERMES_HOME, 'hermes-agent')

export const VENV_ROOT = path.join(ACTIVE_HERMES_ROOT, 'venv')

export const BOOTSTRAP_COMPLETE_MARKER = path.join(ACTIVE_HERMES_ROOT, '.hermes-bootstrap-complete')

export const BOOTSTRAP_MARKER_SCHEMA_VERSION = 1

export const DESKTOP_CONNECTION_CONFIG_PATH = path.join(app.getPath('userData'), 'connection.json')

export const DESKTOP_CONNECTIONS_REGISTRY_PATH = path.join(app.getPath('userData'), 'connections.json')

export const DESKTOP_INSTALLATION_PATH = path.join(app.getPath('userData'), 'desktop-installation.json')

export const DESKTOP_UPDATE_CONFIG_PATH = path.join(app.getPath('userData'), 'updates.json')

export const DESKTOP_WINDOW_STATE_PATH = path.join(app.getPath('userData'), 'window-state.json')

export const DESKTOP_BACKEND_OWNERSHIP_PATH = path.join(app.getPath('userData'), 'backend-ownership.json')

export const DESKTOP_MANAGED_SSH_RECOVERY_PATH = path.join(app.getPath('userData'), 'managed-ssh-update-recovery.json')

export const DESKTOP_PROFILE_CONFIG_PATH = path.join(app.getPath('userData'), 'active-profile.json')

export const PROFILE_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

export const DEFAULT_UPDATE_BRANCH = 'main'

export const BOOT_FAKE_MODE = process.env.HERMES_DESKTOP_BOOT_FAKE === '1'

export const BOOT_FAKE_ERROR = process.env.HERMES_DESKTOP_BOOT_FAKE_ERROR || ''

export const SKIP_QUIT_CONFIRM = process.env.HERMES_DESKTOP_SKIP_QUIT_CONFIRM === '1'

export const BOOT_FAKE_STEP_MS = (() => {
  const raw = Number.parseInt(String(process.env.HERMES_DESKTOP_BOOT_FAKE_STEP_MS || ''), 10)

  if (!Number.isFinite(raw) || raw <= 0) {
    return 650
  }

  return Math.max(120, raw)
})()

export const APP_NAME = process.env.HERMES_DESKTOP_APP_NAME || 'Hermes'

export const HUD_WINDOW_TITLE = `${APP_NAME} HUD`

export const TITLEBAR_HEIGHT = 34

export const MACOS_TRAFFIC_LIGHTS_HEIGHT = 14

export const WINDOW_BUTTON_POSITION = {
  x: 24,
  y: TITLEBAR_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2
}

export const APP_ICON_PATHS = appIconCandidates({
  isWindows: IS_WINDOWS,
  appRoot: APP_ROOT,
  resourcesPath: process.resourcesPath,
  unpackedPathFor
})

export const MEDIA_MIME_TYPES = {
  '.avi': 'video/x-msvideo',
  '.bmp': 'image/bmp',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.m4a': 'audio/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg; codecs=opus',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp'
}

export let mainWindow = null

export const backendConnectionState = createConnectionState<ReturnType<typeof spawn>, any>()

export const registryDispatchRevalidation = new RemoteRevalidationCoordinator()

export const backendDialClaims = new InFlightClaims()

export let softRehomeInProgress = false

export const backendPool = new Map()

export const profileDeletionGate = new ProfileDeletionGate()

export const POOL_LIMITS_PATH = path.join(app.getPath('userData'), 'pool-limits.json')

export function readPersistedPoolLimits() {
  try {
    const limits = parsePoolLimits(fs.readFileSync(POOL_LIMITS_PATH, 'utf8'))
    rememberLog(
      `[pool-limits] loaded from ${POOL_LIMITS_PATH}: maxBackends=${limits.maxBackends}, idleMs=${limits.idleMs}`
    )

    return limits
  } catch {
    // No persisted file yet — fall back to the legacy env vars so scripted
    // setups keep working. Log which source won: a silently-ignored env var
    // here costs a scripted-setup user a debugging session.
    const fromEnv = clampPoolLimits({
      maxBackends: Number(process.env.HERMES_DESKTOP_POOL_MAX) || undefined,
      idleMs: Number(process.env.HERMES_DESKTOP_POOL_IDLE_MS) || undefined
    })

    if (fromEnv.maxBackends !== POOL_LIMITS_DEFAULTS.maxBackends || fromEnv.idleMs !== POOL_LIMITS_DEFAULTS.idleMs) {
      rememberLog(
        `[pool-limits] no saved file; using env-var overrides: maxBackends=${fromEnv.maxBackends}, idleMs=${fromEnv.idleMs}`
      )
    } else {
      rememberLog('[pool-limits] no saved file and no env overrides; using defaults')
    }

    return fromEnv
  }
}

export let poolLimits = readPersistedPoolLimits()

export const localBackendSpawnCoordinator = new LocalBackendSpawnCoordinator(poolLimits.maxBackends)

export const POOL_SLOT_WAIT_MS = 30_000

export function spawnPriorityFrom(value: unknown): LocalBackendSpawnPriority {
  return value === 'foreground' ? 'foreground' : 'background'
}

export const pendingForegroundSpawns = new Set<string>()

export function takeForegroundSpawn(...poolKeys: string[]): boolean {
  let marked = false

  for (const poolKey of poolKeys) {
    marked = pendingForegroundSpawns.delete(poolKey) || marked
  }

  return marked
}

export function promotePoolEntry(entry: any): void {
  entry.spawnPriority = 'foreground'
  entry.localBackendSpawnRequest?.promote?.('foreground')
}

export function logPoolSpawnFailure(label: string, error: unknown): void {
  if (isBackgroundSlotWaitTimeout(error)) {
    rememberLog(`Profile backend ${label} slot wait timed out (background); will retry on the next hydration`)
  } else {
    rememberLog(
      `Hermes backend for profile ${label} failed to start: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

export function poolMaxBackends() {
  return poolLimits.maxBackends
}

export function poolIdleMs() {
  return poolLimits.idleMs
}

export const POOL_KEEPALIVE_FRESH_MS = Math.max(
  120_000,
  Number(process.env.HERMES_DESKTOP_POOL_KEEPALIVE_FRESH_MS) || 4 * 60_000
)

export let poolIdleReaper = null

export let backendOrphanReapPromise = null

export const RENDERER_RELOAD_WINDOW_MS = 60_000

export const RENDERER_RELOAD_MAX = 3

export const rendererReloadTimesRef: { current: number[] } = { current: [] }

export let bootstrapFailure = null

export let backendStartFailure = null

export let remoteReauthFailure = null

export let bootstrapAbortController = null

export let bootstrapRepairRequested = false

export let bootstrapRepairAttempt = 0

export let connectionConfigCache = null

export let connectionConfigCacheMtime = null

export let connectionRegistryCache = null

export let connectionRegistryCacheMtime = null

export const remoteWsHeaderStore = createRemoteWsHeaderStore()

export let previewShortcutActive = false

export let nativeThemeListenerInstalled = false

export let bootProgressState = {
  error: null,
  errorCode: null,
  fakeMode: BOOT_FAKE_MODE,
  isCloudBackendDown: false,
  message: 'Waiting to start Hermes backend',
  phase: 'idle',
  progress: 0,
  retryable: false,
  running: false,
  statusCode: null,
  timestamp: Date.now()
}

export function loadWindowUrl(win, url, label) {
  win.loadURL(url).catch(error => rememberLog(`${label} failed to load: ${describeCrashReason(error)}`))
}

export function openExternalUrl(rawUrl) {
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

  // `file://` URLs come from the artifacts panel (the renderer can't open
  // them itself because Chromium blocks file:// navigation from the app
  // origin). Hand them to `shell.openPath`, which dispatches to the OS
  // file association. If the OS can't open it (`error` is a non-empty
  // string), fall back to revealing the file in the system file manager.
  if (parsed.protocol === 'file:') {
    let localPath

    try {
      localPath = resolveRequestedPathForIpc(parsed.toString(), { purpose: 'Open external file' })
    } catch {
      return false
    }

    void shell
      .openPath(localPath)
      .then(error => {
        if (!error) {
          return
        }

        rememberLog(`[file] openPath failed: ${error}; revealing in folder instead`)

        try {
          shell.showItemInFolder(localPath)
        } catch (revealError) {
          rememberLog(`[file] showItemInFolder failed: ${revealError.message}`)
        }
      })
      .catch(error => rememberLog(`[file] openPath rejected: ${error.message}`))

    return true
  }

  if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
    return false
  }

  const url = parsed.toString()

  if (IS_WSL) {
    rememberLog(`[link] opening via WSL→Windows: ${url}`)

    const proc = spawn('cmd.exe', ['/c', 'start', '""', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })

    proc.on('error', error => {
      rememberLog(`[link] cmd.exe start failed: ${error.message}; falling back to xdg-open`)
      shell.openExternal(url).catch(fallback => rememberLog(`[link] xdg-open failed: ${fallback.message}`))
    })
    proc.unref()

    return true
  }

  shell.openExternal(url).catch(error => rememberLog(`[link] openExternal failed: ${error.message}`))

  return true
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function clampBootProgress(value) {
  const numeric = Number(value)

  if (!Number.isFinite(numeric)) {
    return 0
  }

  return Math.max(0, Math.min(100, Math.round(numeric)))
}

export function broadcastBootProgress() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const { webContents } = mainWindow

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:boot-progress', bootProgressState)
}

export const BOOTSTRAP_LOG_RING_MAX = 500

export let bootstrapState = {
  active: false,
  manifest: null,
  stages: {},
  error: null,
  log: [],
  startedAt: null,
  completedAt: null,
  setupChoice: null,
  unsupportedPlatform: null
}

export let firstRunSetupGate = null

export function broadcastBootstrapEvent(ev) {
  if (ev.type === 'manifest') {
    bootstrapState.manifest = ev
    bootstrapState.active = true
    bootstrapState.setupChoice = null
    bootstrapState.startedAt = bootstrapState.startedAt || Date.now()
    bootstrapState.stages = {}

    for (const stage of ev.stages || []) {
      bootstrapState.stages[stage.name] = { state: 'pending', json: null, durationMs: null, error: null }
    }
  } else if (ev.type === 'stage') {
    bootstrapState.stages[ev.name] = {
      state: ev.state,
      durationMs: ev.durationMs ?? null,
      json: ev.json ?? null,
      error: ev.error ?? null
    }
  } else if (ev.type === 'log') {
    bootstrapState.log.push({ ts: Date.now(), stage: ev.stage || null, line: ev.line, stream: ev.stream || 'stdout' })

    if (bootstrapState.log.length > BOOTSTRAP_LOG_RING_MAX) {
      bootstrapState.log.splice(0, bootstrapState.log.length - BOOTSTRAP_LOG_RING_MAX)
    }
  } else if (ev.type === 'complete') {
    bootstrapState.active = false
    bootstrapState.completedAt = Date.now()
    bootstrapState.error = null
    bootstrapState.unsupportedPlatform = null
  } else if (ev.type === 'failed') {
    bootstrapState.active = false
    bootstrapState.error = ev.error || 'unknown error'
    bootstrapState.setupChoice = null
  } else if (ev.type === 'unsupported-platform') {
    bootstrapState.active = false
    bootstrapState.setupChoice = null
    bootstrapState.unsupportedPlatform = {
      platform: ev.platform,
      activeRoot: ev.activeRoot,
      installCommand: ev.installCommand,
      docsUrl: ev.docsUrl
    }
  } else if (ev.type === 'setup-choice') {
    bootstrapState.active = false
    bootstrapState.error = null
    bootstrapState.manifest = null
    bootstrapState.stages = {}
    bootstrapState.setupChoice = ev.active
      ? {
          platform: ev.platform,
          activeRoot: ev.activeRoot
        }
      : null
    bootstrapState.unsupportedPlatform = null
  } else if (ev.type === 'dismissed') {
    resetBootstrapSnapshot()
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const { webContents } = mainWindow

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:bootstrap:event', ev)
}

export function resetBootstrapSnapshot() {
  bootstrapState = {
    active: false,
    manifest: null,
    stages: {},
    error: null,
    log: [],
    startedAt: null,
    completedAt: null,
    setupChoice: null,
    unsupportedPlatform: null
  }
}

export function promptFirstRunSetupChoice(backend) {
  broadcastBootstrapEvent({
    type: 'setup-choice',
    active: true,
    platform: backend.platform || process.platform,
    activeRoot: backend.activeRoot || ACTIVE_HERMES_ROOT
  })
}

export function hideFirstRunSetupChoice() {
  if (bootstrapState.setupChoice) {
    broadcastBootstrapEvent({ type: 'setup-choice', active: false })
  }
}

export function getFirstRunSetupGate() {
  if (!firstRunSetupGate) {
    firstRunSetupGate = createFirstRunSetupGate({
      hideChoice: hideFirstRunSetupChoice,
      log: rememberLog,
      onStuck: (_backend, stuckAfterMs) => {
        updateBootProgress(
          {
            error: null,
            message: `Still waiting for first-run setup choice after ${Math.round(stuckAfterMs / 1000)} seconds`,
            phase: 'bootstrap.choice',
            progress: 12,
            running: true
          },
          { allowDecrease: true }
        )
      },
      promptChoice: promptFirstRunSetupChoice
    })
  }

  return firstRunSetupGate
}

export async function waitForFirstRunSetupChoice(backend) {
  const gate = getFirstRunSetupGate()

  if (!gate.shouldGate(backend)) {
    return 'continue-local'
  }

  updateBootProgress(
    {
      // Record the typed cause as soon as we know there is no executable, which
      // is HERE — the gate is consulted before ensureRuntime() runs, so a boot
      // that parks awaiting the install choice would otherwise never surface
      // why it is not connecting. `error` stays null: this state is recoverable
      // by design, not a failure.
      errorCode: backend.errorCode ?? HERMES_EXECUTABLE_NOT_FOUND,
      error: null,
      message: 'Waiting for first-run setup choice',
      phase: 'bootstrap.choice',
      progress: 12,
      running: true
    },
    { allowDecrease: true }
  )

  return gate.wait(backend)
}

export function updateBootProgress(update, options: { allowDecrease?: boolean } = {}) {
  const previousErrorCode = bootProgressState.errorCode

  const nextProgressRaw =
    typeof update.progress === 'number' ? clampBootProgress(update.progress) : bootProgressState.progress

  const nextProgress = options.allowDecrease ? nextProgressRaw : Math.max(bootProgressState.progress, nextProgressRaw)

  bootProgressState = {
    ...bootProgressState,
    ...update,
    error: update.error === undefined ? bootProgressState.error : update.error,
    // Sticky by design: `errorCode` names the CAUSE of a failure, so a later
    // generic error update (the boot catch sets only `error`) must not erase it.
    // Success paths clear it explicitly by passing `errorCode: null`.
    errorCode: update.errorCode === undefined ? bootProgressState.errorCode : update.errorCode,
    fakeMode: BOOT_FAKE_MODE || Boolean(update.fakeMode),
    progress: nextProgress,
    // `retryable` rides with `error`: it survives updates that preserve the
    // error and resets alongside a new/cleared error unless explicitly set.
    retryable:
      update.retryable === undefined
        ? update.error === undefined && Boolean(bootProgressState.retryable)
        : Boolean(update.retryable),
    timestamp: Date.now()
  }

  if (update.message) {
    rememberLog(`[boot] ${update.message}`)
  }

  // Make a typed failure cause auditable: the code otherwise only travels to
  // the renderer over IPC, leaving desktop.log unable to say WHY a boot failed.
  // Log transitions only, so a sticky code is not repeated on every update.
  if (bootProgressState.errorCode && bootProgressState.errorCode !== previousErrorCode) {
    rememberLog(`[boot] errorCode=${bootProgressState.errorCode}`)
  }

  broadcastBootProgress()
}

export async function advanceBootProgress(phase, message, progress) {
  updateBootProgress({
    phase,
    message,
    progress,
    running: true,
    error: null
  })

  if (BOOT_FAKE_MODE) {
    await sleep(BOOT_FAKE_STEP_MS)
  }
}

export function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

export function directoryExists(filePath) {
  try {
    return fs.statSync(filePath).isDirectory()
  } catch {
    return false
  }
}

export const UPDATE_WAIT_TIMEOUT_MS = 20 * 60 * 1000

export const UPDATE_WAIT_POLL_MS = 1000

export const UPDATE_HANDOFF_DWELL_MS = 2500

export function updateGateDeps() {
  return {
    hasLiveMarker: () => Boolean(readLiveUpdateMarker(HERMES_HOME)),
    isUpdateInFlight: () => updateInFlight
  }
}

export const BUNDLE_SWAP_RELAUNCH_FLAG = '--hermes-bundle-swap-relaunched'

export const BUNDLE_SWAP_RELAUNCH_FAILSAFE_MS = 15_000

export function relaunchIntoSwappedBundle() {
  if (!IS_PACKAGED || process.argv.includes(BUNDLE_SWAP_RELAUNCH_FLAG)) {
    return false
  }

  if (!detectBundleSwap(INSTALL_STAMP, loadInstallStamp())) {
    return false
  }

  rememberLog('[updates] app bundle was swapped during the update; relaunching into the new build')

  try {
    app.relaunch({
      args: [...buildNoSandboxRelaunchArgs(process.argv.slice(1)), BUNDLE_SWAP_RELAUNCH_FLAG]
    })
  } catch (err) {
    rememberLog(`[updates] bundle-swap relaunch failed: ${err?.message || err}; continuing with the current build`)

    return false
  }

  void exitAfterBackendShutdown(0)

  return true
}

export async function waitForUpdateToFinish() {
  let announced = false

  const outcome = await waitForUpdateClearance(updateGateDeps(), {
    onWaitTick: async reason => {
      if (!announced) {
        announced = true
        rememberLog(`[updates] update in progress (${reason}); deferring backend start until it finishes`)
      }

      await advanceBootProgress(
        'backend.update-wait',
        'An update is finishing — Hermes will start automatically when it completes…',
        12
      )
    },
    pollMs: UPDATE_WAIT_POLL_MS,
    timeoutMs: UPDATE_WAIT_TIMEOUT_MS
  })

  // The detached hand-off script (scripts/desktop-update/windows.ps1) runs hidden;
  // its result file is the ONLY way the user learns a detached update
  // failed. Consume it exactly once, here, right where boot passes the
  // update gate — success gets a log line, failure gets a real dialog
  // (previously a failed detached update was indistinguishable from
  // "nothing happened").
  try {
    const result = readAndConsumeHandoffResult(HERMES_HOME)

    if (result && result.ok && result.manual) {
      // Update landed but the user must act (reopen/reinstall/sandbox). On
      // machines with no shim browser and no notifier this dialog is the
      // FIRST time the message is visible — it must not be a log line.
      rememberLog(`[updates] detached update finished with manual action (branch ${result.branch}): ${result.message}`)
      dialog.showMessageBox({
        type: 'warning',
        title: 'Hermes update',
        message: 'The update finished, but needs one more step',
        detail: result.message
      })
    } else if (result && result.ok) {
      rememberLog(`[updates] detached update finished OK (branch ${result.branch})`)
    } else if (result) {
      rememberLog(`[updates] detached update FAILED (exit ${result.exitCode}): ${result.message}`)
      dialog.showErrorBox(
        'Hermes update did not finish',
        `${result.message}\n\nDetails: ${path.join(HERMES_HOME, 'logs', 'desktop-update-handoff.log')}`
      )
    }
  } catch (err) {
    rememberLog(`[updates] could not read hand-off result: ${err.message}`)
  }

  if (outcome === 'clear') {
    return false
  }

  if (outcome === 'timeout') {
    rememberLog('[updates] update still in progress after wait timeout; starting backend anyway')
  } else if (relaunchIntoSwappedBundle()) {
    await advanceBootProgress('backend.update-restart', 'Restarting Hermes to load the updated app…', 14)
    // Park while the scheduled exit lands so this stale build never starts a
    // backend; the failsafe below only runs if the exit somehow does not.
    await new Promise(resolve => setTimeout(resolve, BUNDLE_SWAP_RELAUNCH_FAILSAFE_MS))
    rememberLog(
      `[updates] relaunch did not land within ${BUNDLE_SWAP_RELAUNCH_FAILSAFE_MS}ms; continuing with the current build`
    )
  } else {
    rememberLog('[updates] update finished; proceeding with backend start')
  }

  return true
}

export function unpackedPathFor(filePath) {
  return filePath.replace(/app\.asar(?=$|[\\/])/, 'app.asar.unpacked')
}

export function findOnPath(command) {
  if (!command) {
    return null
  }

  if (path.isAbsolute(command) || command.includes(path.sep) || (IS_WINDOWS && command.includes('/'))) {
    if (!fileExists(command)) {
      return null
    }

    if (isWindowsBinaryPathInWsl(command, { isWsl: IS_WSL })) {
      return null
    }

    return command
  }

  const pathEntries = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)

  // On Windows, try PATHEXT extensions BEFORE the bare (empty-extension) name.
  // A real command must resolve via its .exe/.cmd (Windows command-resolution
  // semantics consult PATHEXT); an extensionless file — e.g. a Git-Bash
  // shell-script shim named `hermes` — must not shadow `hermes.cmd`/`hermes.exe`.
  // The empty entry is kept LAST so callers that already include the extension
  // (py.exe, pwsh.exe, powershell.exe) still resolve.
  const extensions = buildPathExtCandidates(process.env.PATHEXT, IS_WINDOWS)

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`)

      if (fileExists(candidate)) {
        return candidate
      }
    }
  }

  return null
}

export function isCommandScript(command) {
  return IS_WINDOWS && /\.(cmd|bat)$/i.test(command || '')
}

export function unwrapWindowsVenvHermesCommand(command, backendArgs) {
  return resolveVenvHermesCommand(command, backendArgs, {
    isWindows: IS_WINDOWS,
    isCommandScript,
    fileExists,
    directoryExists,
    canImportHermesCli,
    getVenvPython,
    getVenvSitePackagesEntries,
    buildDesktopBackendEnv,
    hermesHome: HERMES_HOME,
    resolvePath: (...segments) => path.resolve(...segments),
    dirname: p => path.dirname(p),
    basename: p => path.basename(p),
    rememberLog
  })
}

export const _serveSupportCache = new Map()

export function backendSupportsServe(backend) {
  if (!backend || !backend.command) {
    return true
  }

  const key = `${backend.command}::${backend.root || ''}`

  if (_serveSupportCache.has(key)) {
    return _serveSupportCache.get(key)
  }

  let supported = null

  if (backend.root) {
    try {
      const src = fs.readFileSync(path.join(backend.root, 'hermes_cli', 'subcommands', 'dashboard.py'), 'utf8')
      supported = sourceDeclaresServe(src)
    } catch {
      supported = null // source unreadable — fall through to the probe
    }
  }

  if (supported === null) {
    try {
      const prefix = backend.args && backend.args[0] === '-m' ? backend.args.slice(0, 2) : []
      // Same cold-Windows Python-startup class as the runtime probes
      // (#61764/#72632/#72707): `serve --help` imports at least as much as
      // `hermes --version` (~10.5s measured cold), and a false negative here
      // is cached for the process lifetime, silently routing a modern
      // runtime through the legacy `dashboard` form. Share the probe budget
      // and its timeout-only retry instead of a thinner local bound.
      execProbeSync(backend.command, [...prefix, 'serve', '--help'], {
        cwd: backend.root || undefined,
        env: { ...process.env, HERMES_HOME, ...(backend.env || {}) },
        timeout: PROBE_TIMEOUT_MS,
        stdio: 'ignore',
        // `.cmd`/`.bat` shim backends carry shell: true in their descriptor
        // (see resolveHermesBackend step 4); execFileSync of a .cmd without
        // shell throws EINVAL on modern Node, which the catch below would
        // mis-cache as "serve unsupported" for the process lifetime.
        shell: Boolean(backend.shell),
        windowsHide: true
      })
      supported = true
    } catch {
      supported = false
    }
  }

  _serveSupportCache.set(key, supported)
  rememberLog(
    `[backend] \`serve\` ${supported ? 'supported' : 'unsupported → routing via legacy `dashboard`'} for ${backend.label || key}`
  )

  return supported
}

export function getBackendArgsForRuntime(backend) {
  return backendSupportsServe(backend) ? backend.args : dashboardFallbackArgs(backend.args)
}

export function normalizeExecutablePathForCompare(commandPath) {
  if (!commandPath) {
    return null
  }

  let resolved = path.resolve(String(commandPath))

  try {
    resolved = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved)
  } catch {
    // Fallback to path.resolve() above.
  }

  return IS_WINDOWS ? resolved.toLowerCase() : resolved
}

export function looksLikeDesktopAppBinary(commandPath) {
  if (!IS_WINDOWS || !commandPath) {
    return false
  }

  const normalizedCandidate = normalizeExecutablePathForCompare(commandPath)
  const normalizedCurrentExec = normalizeExecutablePathForCompare(process.execPath)

  if (normalizedCandidate && normalizedCurrentExec && normalizedCandidate === normalizedCurrentExec) {
    return true
  }

  let resolved = path.resolve(String(commandPath))

  try {
    resolved = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved)
  } catch {
    // Keep resolved path fallback.
  }

  const resourcesDir = path.join(path.dirname(resolved), 'resources')

  return (
    fileExists(path.join(resourcesDir, 'app.asar')) || directoryExists(path.join(resourcesDir, 'app.asar.unpacked'))
  )
}

export function isHermesSourceRoot(root) {
  return directoryExists(root) && fileExists(path.join(root, 'hermes_cli', 'main.py'))
}

export function findPythonForRoot(root) {
  const override = process.env.HERMES_DESKTOP_PYTHON

  if (override && fileExists(override)) {
    return override
  }

  const relativePaths = IS_WINDOWS
    ? [path.join('.venv', 'Scripts', 'python.exe'), path.join('venv', 'Scripts', 'python.exe')]
    : [path.join('.venv', 'bin', 'python'), path.join('venv', 'bin', 'python')]

  for (const relativePath of relativePaths) {
    const candidate = path.join(root, relativePath)

    if (fileExists(candidate)) {
      return candidate
    }
  }

  return findSystemPython()
}

export function findSystemPython() {
  if (!IS_WINDOWS) {
    // POSIX systems: PATH lookup is safe.
    for (const command of ['python3', 'python']) {
      const candidate = findOnPath(command)

      if (candidate) {
        return candidate
      }
    }

    return null
  }

  // Windows: PATH-based detection has TWO landmines we have to dodge.
  //
  //  (1) The Microsoft Store "Python stub" lives at
  //      %LOCALAPPDATA%\Microsoft\WindowsApps\python.exe and is on PATH
  //      by default on modern Windows. It's a redirector that opens the
  //      Store window if no Store Python is installed. Running it for
  //      `-m venv` would either succeed (real Store install — fine) or
  //      pop the Store dialog (bad UX during boot).
  //  (2) `py.exe` (Python launcher) is missing from per-user installs
  //      that didn't check the launcher option, so PATH-only checks
  //      miss real Python 3.13 installs (user-reported case).
  //
  // We also restrict ourselves to Python 3.11–3.13. 3.14 is the latest
  // CPython but several Hermes deps (notably pywinpty's Rust-built
  // windows_x86_64_msvc crate) don't yet publish 3.14 wheels, and
  // `pip install -e .` falls back to source-build, which fails without
  // a Rust toolchain. install.ps1 sidesteps this by pinning to 3.11
  // via uv; until we add the same uv-managed Python pathway here, the
  // simplest fix is to refuse 3.14 detection and let the NSIS prereq
  // page offer to install 3.11 alongside.
  //
  // Strategy: probe in three passes, in order from most-precise to
  // least-precise, and ONLY use PATH lookup as a last resort after
  // confirming the candidate isn't the WindowsApps redirector.
  //
  //  Pass 1: PEP 514 registry — every standards-compliant Python
  //          installer registers itself at SOFTWARE\Python\PythonCore.
  //          The MS Store stub does NOT register here, so a hit means
  //          a real Python install. Versions are explicit so we
  //          inherently filter 3.14 out.
  //  Pass 2: Filesystem probe of standard install locations
  //          (Program Files, LocalAppData\Programs\Python). Same
  //          version filtering by directory name.
  //  Pass 3: PATH lookup of `py.exe` (the launcher itself never
  //          triggers the Store) — but call it with a version flag so
  //          we resolve to a SPECIFIC supported version, not whatever
  //          py.exe's default is (which on a 3.14-only box would be
  //          3.14).

  const SUPPORTED_VERSIONS = ['3.11', '3.12', '3.13']
  const SUPPORTED_VERSIONS_NO_DOT = ['311', '312', '313']

  // Pass 1: registry. Use `reg query` since main process doesn't have
  // a reliable in-process registry API across all electron versions.
  for (const hive of ['HKLM', 'HKCU']) {
    for (const version of SUPPORTED_VERSIONS) {
      try {
        const out = execFileSync(
          'reg',
          ['query', `${hive}\\SOFTWARE\\Python\\PythonCore\\${version}\\InstallPath`, '/ve', '/reg:64'],
          // Registry reads are near-instant; the bound only exists so a
          // pathologically wedged reg.exe can't hang the synchronous boot
          // resolver forever (this ran unbounded before).
          hiddenWindowsChildOptions({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5_000 })
        )

        // Output format: "    (Default)    REG_SZ    C:\Path\To\Python\"
        const match = out.match(/REG_SZ\s+(.+?)\s*$/m)

        if (match) {
          const installPath = match[1].trim()
          const pythonExe = path.join(installPath, 'python.exe')

          if (fileExists(pythonExe)) {
            return pythonExe
          }
        }
      } catch {
        // Key not present — try next.
      }
    }
  }

  // Pass 2: filesystem probe of standard locations.
  const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
  const localAppData = process.env.LOCALAPPDATA || ''

  for (const versionDir of SUPPORTED_VERSIONS_NO_DOT) {
    const systemWide = path.join(programFiles, `Python${versionDir}`, 'python.exe')

    if (fileExists(systemWide)) {
      return systemWide
    }

    if (localAppData) {
      const perUser = path.join(localAppData, 'Programs', 'Python', `Python${versionDir}`, 'python.exe')

      if (fileExists(perUser)) {
        return perUser
      }
    }
  }

  // Pass 3: py.exe with explicit version flag. The launcher itself is
  // safe to invoke (no Store popup) and `py -3.13 -c "import sys;
  // print(sys.executable)"` resolves to the actual python.exe path of
  // the requested version. We try in version-priority order so the
  // first hit wins.
  const pyExe = findOnPath('py.exe')

  if (pyExe) {
    for (const version of SUPPORTED_VERSIONS) {
      try {
        const out = execFileSync(
          pyExe,
          [`-${version}`, '-c', 'import sys; print(sys.executable)'],
          hiddenWindowsChildOptions({
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            // Bare interpreter startup — much lighter than the hermes-import
            // probes, but still python.exe under cold cache / AV scan, so
            // share the probe budget rather than running unbounded (this
            // synchronous exec previously had no timeout at all).
            timeout: PROBE_TIMEOUT_MS
          })
        )

        const candidate = out.trim()

        if (candidate && fileExists(candidate)) {
          return candidate
        }
      } catch {
        // py couldn't find that version — try next.
      }
    }
  }

  // We deliberately do NOT fall back to plain `python.exe` on PATH.
  // Without a way to verify the version safely (running `python -V`
  // risks the Microsoft Store popup), accepting whatever's there
  // could land us on 3.14 and trigger the Rust-build-from-source
  // failure. Better to return null and let the NSIS prereq page
  // offer to install a known-good 3.11 via winget.
  return null
}

export function findGitBash() {
  return _findGitBash({
    isWindows: IS_WINDOWS,
    env: process.env,
    fileExists,
    findOnPath
  })
}

export function getVenvPython(venvRoot) {
  return path.join(venvRoot, IS_WINDOWS ? path.join('Scripts', 'python.exe') : path.join('bin', 'python'))
}

export function venvRootForPython(python: string, root: string) {
  const parent = path.dirname(python)
  const binName = path.basename(parent).toLowerCase()

  if (binName !== 'bin' && binName !== 'scripts') {
    return null
  }

  const candidate = path.dirname(parent)
  const relative = path.relative(root, candidate)

  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null
  }

  return candidate
}

export function makeDashboardReadyFile() {
  const dir = path.join(app.getPath('userData'), 'backend-ready')
  fs.mkdirSync(dir, { recursive: true })

  return path.join(dir, `dashboard-${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.json`)
}

export let _gitBinaryCache = null

export function resolveGitBinary() {
  if (_gitBinaryCache) {
    return _gitBinaryCache
  }

  if (!IS_WINDOWS) {
    _gitBinaryCache = findOnPath('git') || 'git'

    return _gitBinaryCache
  }

  const localAppData = process.env.LOCALAPPDATA || ''
  const candidates = []

  if (localAppData) {
    candidates.push(path.join(localAppData, 'hermes', 'git', 'cmd', 'git.exe'))
    candidates.push(path.join(localAppData, 'hermes', 'git', 'bin', 'git.exe'))
  }

  candidates.push(path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Git', 'cmd', 'git.exe'))
  candidates.push(path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Git', 'cmd', 'git.exe'))

  if (localAppData) {
    candidates.push(path.join(localAppData, 'Programs', 'Git', 'cmd', 'git.exe'))
  }

  _gitBinaryCache = candidates.find(fileExists) || findOnPath('git') || 'git'

  return _gitBinaryCache
}

export function recentHermesLog() {
  return getRecentHermesLogLines(20).join('\n')
}

export function readDesktopUpdateConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DESKTOP_UPDATE_CONFIG_PATH, 'utf8'))
    const branch = typeof parsed?.branch === 'string' ? parsed.branch.trim() : ''

    return { branch: branch || DEFAULT_UPDATE_BRANCH }
  } catch {
    return { branch: DEFAULT_UPDATE_BRANCH }
  }
}

export function writeFileAtomic(targetPath, data, encoding?: BufferEncoding) {
  const tmp = targetPath + '.tmp'
  fs.writeFileSync(tmp, data, encoding)
  fs.renameSync(tmp, targetPath)
}

export function writeDesktopUpdateConfig(config) {
  fs.mkdirSync(path.dirname(DESKTOP_UPDATE_CONFIG_PATH), { recursive: true })
  writeFileAtomic(DESKTOP_UPDATE_CONFIG_PATH, JSON.stringify(config, null, 2))
}

export function readWindowState(): ReturnType<typeof sanitizeWindowState> {
  try {
    return sanitizeWindowState(JSON.parse(fs.readFileSync(DESKTOP_WINDOW_STATE_PATH, 'utf8')))
  } catch {
    return null
  }
}

export function persistWindowState() {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.isMinimized()) {
    return
  }

  try {
    const { x, y, width, height } = mainWindow.getNormalBounds()
    fs.mkdirSync(path.dirname(DESKTOP_WINDOW_STATE_PATH), { recursive: true })
    writeFileAtomic(
      DESKTOP_WINDOW_STATE_PATH,
      JSON.stringify({ x, y, width, height, isMaximized: mainWindow.isMaximized() }, null, 2)
    )
  } catch (err) {
    rememberLog(`[window-state] persist failed: ${err?.message || err}`)
  }
}

export const schedulePersistWindowState = debounce(persistWindowState, 250)

export const DESKTOP_ZOOM_STATE_PATH = path.join(app.getPath('userData'), 'zoom-state.json')

export function readZoomState() {
  try {
    const raw = JSON.parse(fs.readFileSync(DESKTOP_ZOOM_STATE_PATH, 'utf8'))
    const level = Number(raw?.zoomLevel)

    return Number.isFinite(level) ? level : null
  } catch {
    return null
  }
}

export function writeZoomState(zoomLevel) {
  try {
    fs.mkdirSync(path.dirname(DESKTOP_ZOOM_STATE_PATH), { recursive: true })
    writeFileAtomic(DESKTOP_ZOOM_STATE_PATH, JSON.stringify({ zoomLevel }, null, 2))
  } catch (error) {
    rememberLog(`[zoom] json persist failed: ${error?.message || error}`)
  }
}

export function resolveUpdateRoot() {
  const candidates = [
    process.env.HERMES_DESKTOP_HERMES_ROOT && path.resolve(process.env.HERMES_DESKTOP_HERMES_ROOT),
    !IS_PACKAGED && isHermesSourceRoot(SOURCE_REPO_ROOT) ? SOURCE_REPO_ROOT : null,
    isHermesSourceRoot(ACTIVE_HERMES_ROOT) ? ACTIVE_HERMES_ROOT : null
  ].filter(Boolean)

  return candidates.find(c => directoryExists(path.join(c, '.git'))) || candidates[0] || ACTIVE_HERMES_ROOT
}

export function runGit(args, options: any = {}): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      resolveGitBinary(),
      IS_WINDOWS ? ['-c', 'windows.appendAtomically=false', ...args] : args,
      hiddenWindowsChildOptions({
        cwd: options.cwd,
        env: { ...process.env, ...((options.env || {}) as any), GIT_TERMINAL_PROMPT: '0' },
        stdio: ['ignore', 'pipe', 'pipe']
      })
    )

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => {
      const text = chunk.toString()
      stdout += text
      options.onLine?.('stdout', text)
    })
    child.stderr.on('data', chunk => {
      const text = chunk.toString()
      stderr += text
      options.onLine?.('stderr', text)
    })
    child.once('error', reject)
    child.once('exit', code => resolve({ code, stdout, stderr }))
  })
}

export async function getOriginUrl(updateRoot) {
  const origin = await runGit(['remote', 'get-url', 'origin'], { cwd: updateRoot })

  return origin.code === 0 ? origin.stdout.trim() : ''
}

export function emitUpdateProgress(payload) {
  const merged = { stage: 'idle', message: '', percent: null, error: null, ...payload, at: Date.now() }
  rememberLog(`[updates] ${merged.stage}: ${merged.message || merged.error || ''}`)

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('hermes:updates:progress', merged)
  }
}

export async function resolveHealedBranch(updateRoot, branch) {
  if (!branch || branch === 'main') {
    return branch || 'main'
  }

  const originUrl = await getOriginUrl(updateRoot)
  const remote = isOfficialSshRemote(originUrl) ? OFFICIAL_REPO_HTTPS_URL : 'origin'
  const probe = await runGit(['ls-remote', '--exit-code', '--heads', remote, branch], { cwd: updateRoot })

  if (probe.code !== 2) {
    return branch
  }

  rememberLog(`[updates] origin/${branch} is gone (merged?); falling back to main`)
  const config = readDesktopUpdateConfig()

  if (config.branch !== 'main') {
    writeDesktopUpdateConfig({ ...config, branch: 'main' })
  }

  return 'main'
}

export let updateInFlight = false

export let isQuittingForHandoff = false

export function resolveUpdaterBinary() {
  return resolveStagedUpdaterBinary(HERMES_HOME, { fileExists, isWindows: IS_WINDOWS })
}

export function repairMacUpdaterHelper(updater) {
  if (!IS_MAC || !updater) {
    return
  }

  try {
    execFileSync('/usr/bin/xattr', ['-cr', updater], { stdio: 'ignore' })
  } catch (err) {
    rememberLog(`[updates] macOS updater helper quarantine repair skipped: ${err.message}`)
  }

  try {
    execFileSync('/usr/bin/codesign', ['--verify', updater], { stdio: 'ignore' })

    return
  } catch {
    // Unsigned or invalid helper. Apply a local ad-hoc signature so Gatekeeper
    // does not block the staged updater before it can run.
  }

  try {
    execFileSync('/usr/bin/codesign', ['--force', '--sign', '-', updater], { stdio: 'ignore' })
    rememberLog('[updates] repaired macOS updater helper signature')
  } catch (err) {
    rememberLog(`[updates] macOS updater helper signature repair skipped: ${err.message}`)
  }
}

export function venvHermesShimPath(updateRoot) {
  return IS_WINDOWS
    ? path.join(updateRoot, 'venv', 'Scripts', 'hermes.exe')
    : path.join(updateRoot, 'venv', 'bin', 'hermes')
}

export function isShimLocked(shimPath) {
  if (!IS_WINDOWS) {
    return false
  }

  let fd

  try {
    fd = fs.openSync(shimPath, 'r+')

    return false
  } catch (err) {
    // ENOENT ⇒ not there ⇒ nothing locking it. Anything else (EBUSY/EPERM/
    // EACCES) on Windows means a live handle holds it.
    return err && err.code !== 'ENOENT'
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        void 0
      }
    }
  }
}

export function killHermesOwnedVenvDaemons(updateRoot) {
  if (!IS_WINDOWS) {
    return
  }

  const scriptsDir = path.join(updateRoot, 'venv', 'Scripts')

  let holders = []

  try {
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.CommandLine } | Select-Object ProcessId, ExecutablePath, CommandLine | ConvertTo-Json -Compress'
      ],
      hiddenWindowsChildOptions({ encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 })
    )

    const parsed = JSON.parse(String(out || '[]'))

    holders = (Array.isArray(parsed) ? parsed : [parsed]).filter(p =>
      isHermesOwnedVenvDaemon(p?.ExecutablePath, p?.CommandLine, scriptsDir)
    )
  } catch {
    // Best-effort: the venv-blocker scan downstream is the real backstop.
    return
  }

  for (const holder of holders) {
    const pid = Number(holder?.ProcessId)

    if (Number.isInteger(pid) && pid > 0) {
      rememberLog(`[updates] stopping Hermes-owned venv daemon (hindsight) PID ${pid} before hand-off`)
      forceKillProcessTree(pid)
    }
  }
}

export function forceKillProcessTree(pid) {
  if (!IS_WINDOWS) {
    return
  }

  if (!Number.isInteger(pid) || pid <= 0) {
    return
  }

  try {
    execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], hiddenWindowsChildOptions({ stdio: 'ignore' }))
  } catch {
    // Already gone, or no permission — best effort; the unlock wait below is
    // the real gate.
  }
}

export function writeBackendOwnership(contents) {
  fs.mkdirSync(path.dirname(DESKTOP_BACKEND_OWNERSHIP_PATH), { recursive: true })
  const tempPath = `${DESKTOP_BACKEND_OWNERSHIP_PATH}.${process.pid}.tmp`

  try {
    fs.writeFileSync(tempPath, contents, { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(tempPath, DESKTOP_BACKEND_OWNERSHIP_PATH)
  } finally {
    try {
      fs.rmSync(tempPath, { force: true })
    } catch {
      void 0
    }
  }
}

export async function backendCommandForPid(pid) {
  try {
    const command = IS_WINDOWS ? 'powershell.exe' : 'ps'

    const args = IS_WINDOWS
      ? [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}').CommandLine`
        ]
      : ['-p', String(pid), '-o', 'command=']

    return (await execText(command, args)) || null
  } catch {
    return null
  }
}

export async function processIdentityMatches(identity, timeoutMs: number = 30_000) {
  // Degraded PID-only identity (#93608): the start-marker probe failed while
  // the child was verifiably alive, so only PID liveness can be checked here.
  // backendIdentityMatches layers the command-line check on top before
  // anything destructive relies on the answer.
  if (isPidOnlyStartMarker(identity.startMarker)) {
    try {
      process.kill(identity.pid, 0)

      return true
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code

      return code === 'ESRCH' || code === 'ENOENT' ? false : code === 'EPERM' ? true : undefined
    }
  }

  try {
    return (await hermesProcessStartMarker(identity.pid, timeoutMs)) === identity.startMarker
  } catch (error) {
    return error?.code === 'ENOENT' || error?.code === 'ESRCH' ? false : undefined
  }
}

export async function backendIdentityMatches(identity) {
  const processMatches = await processIdentityMatches(identity, REAP_PROBE_TIMEOUT_MS)

  if (processMatches !== true) {
    return processMatches
  }

  const command = await backendCommandForPid(identity.pid)

  return command === null ? undefined : backendCommandMatches(command)
}

export async function backendParentMatches(entry) {
  if (!Number.isInteger(entry.parentPid) || typeof entry.parentStartMarker !== 'string' || !entry.parentStartMarker) {
    return undefined
  }

  try {
    return (await hermesProcessStartMarker(entry.parentPid, REAP_PROBE_TIMEOUT_MS)) === entry.parentStartMarker
  } catch (error) {
    return error?.code === 'ENOENT' || error?.code === 'ESRCH' ? false : undefined
  }
}

export async function stopOwnedBackend(identity) {
  const matches = await processIdentityMatches(identity, REAP_PROBE_TIMEOUT_MS)

  if (matches === false) {
    return
  }

  if (matches !== true) {
    // Identity probe failed (not confirmed gone): preserve the record so a
    // later launch retries the stop instead of dropping it and leaking the
    // backend. reapOrphans keeps the entry when stop() throws.
    throw new Error(`Could not verify backend PID ${identity.pid} before stopping it.`)
  }

  if (IS_WINDOWS) {
    forceKillProcessTree(identity.pid)
  } else {
    try {
      process.kill(-identity.pid, 'SIGTERM')
    } catch {
      try {
        process.kill(identity.pid, 'SIGTERM')
      } catch {
        return
      }
    }

    const deadline = Date.now() + 1500

    while (Date.now() < deadline) {
      if ((await processIdentityMatches(identity, REAP_PROBE_TIMEOUT_MS)) !== true) {
        return
      }

      await new Promise(resolve => setTimeout(resolve, 50))
    }

    // Revalidate immediately before escalation so PID reuse cannot target a
    // replacement process.
    if ((await processIdentityMatches(identity, REAP_PROBE_TIMEOUT_MS)) === true) {
      try {
        process.kill(-identity.pid, 'SIGKILL')
      } catch {
        process.kill(identity.pid, 'SIGKILL')
      }
    }
  }

  await new Promise(resolve => setTimeout(resolve, 50))
  const remaining = await processIdentityMatches(identity, REAP_PROBE_TIMEOUT_MS)

  if (remaining !== false) {
    throw new Error(`Backend PID ${identity.pid} did not stop cleanly.`)
  }
}

export const backendOwnership = createBackendOwnership({
  matchesIdentity: backendIdentityMatches,
  matchesParent: backendParentMatches,
  stop: stopOwnedBackend,
  store: {
    read: () => {
      try {
        return fs.readFileSync(DESKTOP_BACKEND_OWNERSHIP_PATH, 'utf8')
      } catch {
        return null
      }
    },
    write: writeBackendOwnership,
    // A corrupt ownership file is moved aside instead of being rewritten
    // away by the reap sweep — its records are the only pointer to any
    // still-running backends it described (#89298).
    quarantine: () => {
      const parked = `${DESKTOP_BACKEND_OWNERSHIP_PATH}.corrupt`

      try {
        fs.renameSync(DESKTOP_BACKEND_OWNERSHIP_PATH, parked)
        rememberLog(`Backend ownership file was unreadable; moved to ${parked}`)
      } catch {
        // Nothing to move (or no permission) — the sweep already skipped.
      }
    }
  }
})

// The marker format for the Desktop's OWN process (and for the parent-watchdog
// env derived from it) is mirrored by `hermes_cli/process_identity.py`, so the
// format lives with the Hermes adapter and is injected into the generic probe
// rather than baked into it. Without this the probe would spawn a PowerShell /
// `ps` helper to describe the process it already is.
const hermesSelfMarker: ProcessIdentityDeps['selfMarker'] = pid =>
  electronProcessStartMarker(pid, process.pid, process.getCreationTime?.())

export function hermesProcessStartMarker(pid: number, timeoutMs: number = 30_000): Promise<string> {
  return processStartMarker(pid, timeoutMs, { selfMarker: hermesSelfMarker })
}

export const desktopParentStartMarker = createParentStartMarkerResolver({
  load: () => hermesProcessStartMarker(process.pid),
  onError: error => {
    const detail = error instanceof Error ? error.message : String(error)

    rememberLog(
      `Could not resolve the Desktop process start marker; starting the backend with PID-only parent tracking: ${detail}`
    )
  }
})

export async function claimBackendChild(child, command, profile, nonce, outputTail: ProcessOutputTail | null = null) {
  // Probe/claim policy lives in process/identity.ts (#93608): a marker probe
  // that fails against a LIVE child degrades to PID-only identity — matching
  // createParentStartMarkerResolver — instead of killing a healthy backend
  // over a flaky Get-Process (PS 5.1 cold starts, #87169). Only a child that
  // actually died keeps the fail-closed throw, now carrying its stderr tail.
  const probe = await probeStartMarker(child.pid, pid => hermesProcessStartMarker(pid))
  const decision = claimDecision(child.exitCode === null && !child.killed, probe)

  if (decision.action === 'fail') {
    stopBackendChild(child)
    await waitForBackendExit(child)
    throw new Error(
      `Hermes backend (PID ${child.pid}) died before its identity could be recorded: ${decision.reason}${outputTail?.describe() ?? ''}`
    )
  }

  let startMarker

  if (decision.action === 'degrade') {
    startMarker = pidOnlyStartMarker(child.pid)
    rememberLog(
      `WARNING: process start marker probe failed for live Hermes backend PID ${child.pid}; ` +
        `claiming with PID-only identity instead of stopping it: ${decision.reason}`
    )
  } else {
    startMarker = decision.startMarker
  }

  try {
    const identity = await backendOwnership.claim({
      command,
      nonce,
      pid: child.pid,
      profile,
      startMarker,
      // Record the spawning Electron so reapOrphans can tell an orphaned
      // backend (parent gone) from one owned by a live instance — a live
      // parent's backend is never reaped (#87295).
      parentPid: process.pid,
      parentStartMarker: await desktopParentStartMarker()
    })

    child.hermesBackendIdentity = identity

    return identity
  } catch (error) {
    stopBackendChild(child)
    await waitForBackendExit(child)
    throw new Error(
      `Could not persist ownership for the Hermes backend: ${error.message}${outputTail?.describe() ?? ''}`
    )
  }
}

export function releaseBackendChild(child) {
  const identity = child?.hermesBackendIdentity

  if (!identity) {
    return
  }

  try {
    backendOwnership.release(identity)
  } catch (error) {
    rememberLog(`Could not release backend ownership for PID ${identity.pid}: ${error.message}`)
  }
}

export function reapOrphanedBackendsOnce() {
  if (!backendOrphanReapPromise) {
    backendOrphanReapPromise = backendOwnership
      .reapOrphans()
      .then(pids => {
        if (pids.length) {
          rememberLog(`Reaped orphaned desktop backend PID(s): ${pids.join(', ')}`)
        }
      })
      .catch(error => {
        backendOrphanReapPromise = null
        throw error
      })
  }

  return backendOrphanReapPromise
}

export async function releaseBackendLockForUpdate(updateRoot) {
  return releaseBackendLock(updateRoot, 'updates')
}

export async function releaseBackendLock(updateRoot, tag) {
  if (!IS_WINDOWS) {
    return { unlocked: true }
  }

  const hermesProcess = backendConnectionState.getProcess()

  // Seed the release gate with every PID we are about to signal: the
  // supervised primary backend and all pool backends. The gate waits for
  // these to actually LEAVE the process table, not just for the shim to
  // unlock — the shim probe only covers venv\Scripts\hermes.exe, but the
  // backend is `python.exe -m hermes_cli.main serve`, which need not hold
  // the shim at all (#74805 first-attempt race).
  const initialPids = []

  if (hermesProcess && Number.isInteger(hermesProcess.pid)) {
    initialPids.push(hermesProcess.pid)
  }

  for (const entry of backendPool.values()) {
    if (entry.process && Number.isInteger(entry.process.pid)) {
      initialPids.push(entry.process.pid)
    }
  }

  stopProcessTreesForUpdate(hermesProcess, {
    forceKillProcessTree,
    stopAllPooledChildren: stopAllPoolBackends
  })

  // Stop separately-running messaging gateways (all profiles) BEFORE the
  // release gate. The gateway is launched by the gateway-launcher desktop
  // plugin via /api/gateway/start and is NOT in backendConnectionState or
  // backendPool, so the tree-kills above never see it — on Windows its
  // launcher (venv\Scripts\python.exe) keeps the venv mandatory-locked and
  // the 15s gate aborts the hand-off before the venv-blocker scan's
  // pausable-gateway exemption ever gets a chance (#70337). Delegate to
  // `hermes gateway stop --all`: the CLI discovers every profile's gateway
  // (launcher + worker — gateway.pid records only the uv WORKER, and
  // taskkill /T from the worker never reaches its parent), drains in-flight
  // agents, and force-kills survivors. Best-effort; abort paths restore via
  // startGatewaysAfterUpdateAbort. No-op off Windows.
  stopGatewayBeforeUpdate(venvHermesShimPath(updateRoot), HERMES_HOME)

  // Reap Hermes-OWNED venv daemons the tree-kill above cannot reach: the
  // memory plugin's hindsight daemon is spawned DETACHED (it outlives the
  // backend) yet runs off venv\Scripts\pythonw.exe, keeping venv files
  // mapped past the backend teardown (#75477/#75478). Narrowly scoped
  // (venv-holder-select) — external holders are never killed here.
  killHermesOwnedVenvDaemons(updateRoot)

  const shim = venvHermesShimPath(updateRoot)

  const gate = await waitForBackendRelease(
    initialPids,
    {
      isShimLocked: () => Boolean(isShimLocked(shim)),
      isPidAlive: isPidAliveWindows,
      collectStragglerPids: () => {
        const stragglers = []

        const currentHermesProcess = backendConnectionState.getProcess()

        if (currentHermesProcess && Number.isInteger(currentHermesProcess.pid)) {
          stragglers.push(currentHermesProcess.pid)
        }

        for (const entry of backendPool.values()) {
          if (entry.process && Number.isInteger(entry.process.pid)) {
            stragglers.push(entry.process.pid)
          }
        }

        return stragglers
      },
      killProcessTree: forceKillProcessTree,
      sleep: (ms: number) => new Promise(r => setTimeout(r, ms)),
      now: () => Date.now(),
      log: rememberLog
    },
    tag
  )

  if (gate.unlocked) {
    return { unlocked: true }
  }

  // Do NOT proceed past a held lock: handing off to the updater while another
  // process (a second desktop window, a user terminal, an unkillable child)
  // still maps the venv's files guarantees a half-updated venv — the updater's
  // dependency sync dies on access-denied partway through uninstalls, leaving
  // imports broken (the July 2026 brotlicffi/_sodium.pyd incidents). Failing
  // the update loudly and keeping the app running is strictly better than a
  // bricked install that needs manual venv surgery.
  rememberLog(
    `[${tag}] venv shim still locked after 15s; aborting hand-off (something outside this app holds the venv)`
  )

  return { unlocked: false }
}

export async function applyUpdates(opts: { stopSafeBlockers?: boolean } = {}) {
  if (updateInFlight) {
    throw new Error('An update is already in progress.')
  }

  updateInFlight = true

  try {
    const updater = resolveUpdaterBinary()

    if (!updater && !IS_WINDOWS) {
      // macOS/Linux: hand off to the repo-owned posix script — same shape as
      // Windows (quit → detached orchestrator → `hermes update` → relaunch),
      // minus the venv-lock gauntlet POSIX doesn't need. The old in-app
      // updater (applyUpdatesPosixInApp) is gone with everything it dragged
      // in: the HERMES_DESKTOP_CHILD_PID reaper-exclusion dance (#37532),
      // the in-window rebuild retry, and the relaunch-outcome matrix — the
      // script owns swap/relaunch, and the app is DEAD during the update so
      // there is nothing to reap around. Checkouts that predate the script
      // get the manual `hermes update` card once; their next update pulls it.
      return await applyUpdatesPosixHandoff(opts)
    }

    if (!updater) {
      // No staged updater binary — this is a CLI-installed user (they ran
      // `hermes desktop`, never the Tauri installer that self-copies
      // hermes-setup.exe into HERMES_HOME). On Windows the repo hand-off
      // script serves them just as well as installer users — it only needs
      // PowerShell and the checkout — so fall through to the normal hand-off
      // when the script exists. Only when the checkout predates the script do
      // we surface the manual one-liner.
      const updateRoot = resolveUpdateRoot()

      if (!resolveUpdateScriptHandoff(updateRoot)) {
        // They DO have a working `hermes` on PATH / in the venv, so the
        // correct path is the one-liner in their native medium. We show the
        // EXACT command, branch-pinned to the checkout they're on — bare
        // `hermes update` defaults to main and would silently switch a
        // bb/gui (or any non-main) install off-branch. Mirror the GUI
        // button's contract: append --branch <current> for non-main
        // checkouts, keep it bare for main so the card stays clean.
        let command = 'hermes update'

        try {
          const head = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: updateRoot })
          const current = (head.stdout || '').trim()

          if (head.code === 0 && current && current !== 'HEAD') {
            const branch = await resolveHealedBranch(updateRoot, current)

            if (branch !== 'main') {
              command = `hermes update --branch ${branch}`
            }
          }
        } catch {
          // Best-effort: fall back to bare `hermes update` if branch detection fails.
        }

        rememberLog(`[updates] no staged updater; surfacing manual \`${command}\` for CLI install at ${updateRoot}`)
        emitUpdateProgress({ stage: 'manual', message: command, percent: null })

        return { ok: true, manual: true, command, hermesRoot: updateRoot }
      }

      rememberLog('[updates] no staged updater; using repo hand-off script for CLI install')
    }

    const handoffConflict = updateHandoffConflict(HERMES_HOME)

    if (handoffConflict) {
      // A different updater already owns the marker — most often a previous
      // "Update" click whose updater is still alive and parked mid-run.
      // Spawning another here would overwrite its claim and let two updaters
      // mutate the checkout at once (#75778); refuse instead.
      rememberLog(`[updates] refusing hand-off: ${handoffConflict.message}`)
      emitUpdateProgress({ stage: 'error', message: handoffConflict.message, percent: null })

      return { ok: false, error: 'update-already-running', message: handoffConflict.message }
    }

    emitUpdateProgress({
      stage: 'restart',
      message:
        'Updating Hermes — this window will close and the updater will open. Don’t reopen Hermes yourself; it restarts automatically when the update finishes.',
      percent: 100
    })
    repairMacUpdaterHelper(updater)

    const updateRoot = resolveUpdateRoot()
    const { branch: configuredBranch } = readDesktopUpdateConfig()
    const branch = await resolveHealedBranch(updateRoot, configuredBranch || DEFAULT_UPDATE_BRANCH)
    const updaterArgs = ['--update', '--branch', branch]
    const targetApp = IS_MAC ? runningAppBundle() : null

    if (targetApp) {
      updaterArgs.push('--target-app', targetApp)
    }

    const venvBin = path.join(updateRoot, 'venv', IS_WINDOWS ? 'Scripts' : 'bin')

    // ── Pre-flight state.db integrity guard (#68474) ─────────────────
    // Emergency backup and header verification before the update touches
    // anything.  Runs while the backend is still alive.
    preflightStateDb(HERMES_HOME, rememberLog)

    if (IS_WINDOWS && resolveUpdateScriptHandoff(updateRoot)) {
      const message = windowsUpdatePrerequisiteError(updateRoot)

      if (message) {
        emitUpdateProgress({ stage: 'error', message, percent: null })

        return { ok: false, error: message }
      }
    }

    // Stop our own backend(s) and wait for the venv shim to unlock BEFORE we
    // spawn the updater. Without this the updater races a still-locked
    // hermes.exe (held by the backend child / its grandchildren) and the update
    // bricks. See releaseBackendLockForUpdate for the full failure analysis.
    const lock = await releaseBackendLockForUpdate(updateRoot)

    if (!lock.unlocked) {
      // Something OUTSIDE this app holds the venv (a second window, a user
      // terminal running hermes, an unkillable child). Handing off anyway
      // guarantees a half-updated venv — abort loudly instead and let the
      // user close the holder and retry. Restart our own backend so the app
      // keeps working after the failed attempt.
      const message =
        'Update aborted: another process is holding the Hermes install open ' +
        '(a second Hermes window or a terminal running hermes?). Close it and retry.'

      emitUpdateProgress({ stage: 'error', message, percent: null })
      startHermes().catch(() => {})

      if (IS_WINDOWS) {
        // The pre-gate `gateway stop --all` (#70337) took every profile's
        // gateway down for an update that never happened — bring them back.
        startGatewaysAfterUpdateAbort(venvHermesShimPath(updateRoot))
      }

      return { ok: false, error: message }
    }

    // Preflight: after releasing our own backends, check for remaining
    // Hermes processes running from this venv.  The updater normally refuses
    // when it detects a holder, but because the updater is spawned detached
    // with stdio:ignore, the user never sees that refusal and the update
    // silently fails.  This preflight detects holders early and gives the
    // user an actionable error.  Windows-only; the .pyd lock hazard is a
    // Windows phenomenon.  ALL failures (blocked, missing python, timeout,
    // malformed output, missing psutil) abort the handoff — never proceed
    // to the detached updater when the venv state is unknown.
    if (IS_WINDOWS) {
      let scanOutcome = await scanVenvBlockers(updateRoot)

      if (scanOutcome.kind === 'blocked' && opts.stopSafeBlockers) {
        const stopResult = await stopSafeVenvBlockers(updateRoot, scanOutcome.result)
        rememberLog(
          `[updates] user-approved blocker cleanup: stopped=${stopResult.stopped.join(',') || 'none'} failed=${stopResult.failed.join(',') || 'none'}`
        )
        // Let verified process-tree termination finish unwinding wrapper shells,
        // then make the scanner — not the stale renderer payload — authoritative.
        await new Promise(resolve => setTimeout(resolve, 300))
        scanOutcome = await scanVenvBlockers(updateRoot)
      }

      // Re-scan before aborting on 'blocked' (#74805). Process-table teardown
      // is asynchronous on Windows: even after releaseBackendLock's PID-exit
      // wait, a grandchild the desktop never tracked (or a process an AV /
      // NTFS filter driver is holding in teardown) can stay enumerable for a
      // few more seconds and read as a holder. Each scan already costs
      // seconds (spawns a venv python + psutil sweep), so two retries with a
      // short dwell give the table time to settle without meaningfully
      // delaying the abort path when a REAL holder (a user terminal, second
      // window) is present — that holder is still there on the third scan.
      for (let attempt = 0; scanOutcome.kind === 'blocked' && attempt < 2; attempt++) {
        rememberLog(
          `[updates] venv-blocker scan reported ${scanOutcome.result.processes.length} holder(s); re-scanning after settle (attempt ${attempt + 2}/3)`
        )
        await new Promise(resolve => setTimeout(resolve, 1500))
        scanOutcome = await scanVenvBlockers(updateRoot)
      }

      if (scanOutcome.kind === 'blocked') {
        const message = formatBlockerMessage(scanOutcome.result)

        rememberLog(`[updates] venv-blocked: ${scanOutcome.result.processes.length} process(es) hold the install`)
        emitUpdateProgress({ stage: 'error', message, percent: null })
        startHermes().catch(() => {})
        // Restore the gateways the pre-gate stop took down (#70337 drain
        // semantics): the update aborted, so nothing else will relaunch them.
        startGatewaysAfterUpdateAbort(venvHermesShimPath(updateRoot))

        return { ok: false, error: 'venv-blocked', message, blockers: scanOutcome.result.processes }
      }

      if (scanOutcome.kind === 'probe-failure') {
        const message = formatProbeFailedMessage(scanOutcome.error)

        rememberLog(`[updates] venv-blocker probe failed: ${scanOutcome.error}`)
        emitUpdateProgress({ stage: 'error', message, percent: null })
        startHermes().catch(() => {})
        // Same drain-semantics restore as the venv-blocked abort above.
        startGatewaysAfterUpdateAbort(venvHermesShimPath(updateRoot))

        return { ok: false, error: 'venv-probe-failed', message }
      }
    }

    // Detached so the updater outlives this process — it needs us GONE before
    // `hermes update` will run (the venv shim is locked while we live).
    //
    // Prefer the repo-owned hand-off script over the staged Tauri binary.
    // The staged binary is frozen (no self-update path) and historically runs
    // months-stale updater logic — pre-#67369 cache resolver, pre-#74782
    // marker adoption — producing failures that were fixed on main long ago
    // (2026-08-09 incident). scripts/desktop-update/windows.ps1 ships WITH the
    // checkout, so each `hermes update` refreshes the code that drives the
    // next one. Checkouts that predate the script fall back to the binary
    // path unchanged.
    const scriptHandoff = resolveUpdateScriptHandoff(updateRoot)
    let child

    if (scriptHandoff) {
      const updateStartedAt = Math.floor(Date.now() / 1000)

      // A bare detached+hidden powershell spawn silently dies before -File
      // processing (console-subsystem init failure — see
      // wrapHandoffForDetachedConsole). Route through `cmd start` so the
      // script gets its own minimized console and survives our exit. The
      // wrapper cmd.exe exits immediately, so child.pid is NOT the script's
      // pid — the script claims the update marker itself with its own $PID
      // as its first action, and a relaunched Desktop parks on that.
      const wrapped = wrapHandoffForDetachedConsole(scriptHandoff, [
        '-InstallRoot',
        updateRoot,
        '-Branch',
        branch,
        '-DesktopPid',
        String(process.pid),
        '-RelaunchExe',
        process.execPath
      ])

      child = spawnUpdaterProcess(wrapped.command, wrapped.args, {
        cwd: HERMES_HOME,
        env: {
          ...process.env,
          HERMES_HOME,
          HERMES_UPDATE_STARTED_AT: String(updateStartedAt),
          PATH: pathWithHermesManagedNode(venvBin)
        },
        detached: true,
        stdio: 'ignore'
      })

      // Bridge marker: child.pid is the short-lived cmd.exe WRAPPER, not the
      // script (see wrapHandoffForDetachedConsole). Write it anyway to cover
      // the first moments of the hand-off — the script's step 0 overwrites it
      // with its own live $PID, and if the script never starts the wrapper's
      // dead pid makes the marker read as stale and self-delete (no wedge).
      // The `hermes update` child adopts the SCRIPT's claim via
      // update_lock.py's process-ancestry rule; no mtime heuristics needed.
      if (Number.isInteger(child.pid)) {
        writeUpdateMarker(HERMES_HOME, child.pid, { startedAt: updateStartedAt })
      }

      rememberLog(
        `[updates] launched repo hand-off script: ${scriptHandoff.scriptPath} (branch ${branch}); exiting desktop to release venv shim`
      )
    } else {
      child = spawnUpdaterProcess(updater, updaterArgs, {
        cwd: HERMES_HOME,
        env: {
          ...process.env,
          HERMES_HOME,
          PATH: pathWithHermesManagedNode(venvBin)
        },
        detached: true,
        stdio: 'ignore'
      })

      // Write the update-in-progress marker IMMEDIATELY — before the 2.5s
      // quit dwell. The Tauri updater won't write its own marker for several
      // seconds (window init + manifest), and during that gap our renderer
      // can reconnect and spawn a fresh backend that re-locks .pyd files in
      // the venv. By writing the marker ourselves the renderer's
      // waitForUpdateToFinish() gate sees a live update and parks instead.
      // The updater overwrites this with its own PID later; same format.
      //
      // SKIPPED for pre-#74782 staged updaters: those have no self-PID
      // exclusion, so they read this very marker as a foreign live owner and
      // abort with "Another Hermes update is already running (PID <itself>)" —
      // an unbreakable loop, because the update that would replace the stale
      // binary is the one being refused. Losing the anti-respawn hardening is
      // strictly better than never updating again, and the updater still writes
      // its own marker moments later.
      if (Number.isInteger(child.pid) && stagedUpdaterSupportsPrewrittenMarker(updater)) {
        writeUpdateMarker(HERMES_HOME, child.pid)
      } else if (Number.isInteger(child.pid)) {
        rememberLog(
          `[updates] skipping marker pre-write: staged updater predates self-adopt (${updater}); it would refuse its own claim`
        )
      }

      rememberLog(
        `[updates] launched updater: ${updater} ${updaterArgs.join(' ')}; exiting desktop to release venv shim`
      )
    }

    // Linger on the "updating — don't reopen" overlay long enough for the user
    // to actually read it (and to bridge the gap until the updater's own window
    // appears), THEN quit to release the venv shim. The updater rebuilds and
    // relaunches us when it's done. (#50419 — a 600ms quit looked like a crash
    // and lured users into the #50238 relaunch loop.)
    //
    // The dwell doubles as the hand-off settle window (#66753): watch the
    // detached child for an async spawn `error` (ENOENT/EACCES) or an early
    // non-zero/signal exit. On failure, DON'T quit — the user would be left
    // with no app, no updater, and no evidence. Restart our backend and
    // surface the error instead. The pre-written marker names the dead child
    // pid, so readLiveUpdateMarker self-heals it; no cleanup needed.
    const dwellStartedAt = Date.now()
    const handoffOutcome = await observeUpdaterHandoff(child, UPDATE_HANDOFF_DWELL_MS)

    if (!handoffOutcome.ok) {
      const message = `Update failed to start: ${handoffOutcome.message}. Hermes will keep running — try again, or run \`hermes update\` from a terminal.`

      rememberLog(`[updates] hand-off not viable, aborting quit: ${handoffOutcome.message}`)
      emitUpdateProgress({ stage: 'error', message, percent: null })
      startHermes().catch(() => {})

      if (IS_WINDOWS) {
        // Same drain-semantics restore as the earlier abort paths (#70337).
        startGatewaysAfterUpdateAbort(venvHermesShimPath(updateRoot))
      }

      return { ok: false, error: 'updater-spawn-failed', message }
    }

    isQuittingForHandoff = true
    setTimeout(
      () => {
        app.quit()
      },
      Math.max(0, UPDATE_HANDOFF_DWELL_MS - (Date.now() - dwellStartedAt))
    )

    return { ok: true, handedOff: true, updater }
  } finally {
    updateInFlight = false
  }
}

export async function handOffWindowsBootstrapRecovery(reason) {
  if (!IS_WINDOWS || !IS_PACKAGED) {
    return false
  }

  const updater = resolveUpdaterBinary()

  if (!updater) {
    return false
  }

  const handoffConflict = updateHandoffConflict(HERMES_HOME)

  if (handoffConflict) {
    // Same hazard as applyUpdates (#75778): a live foreign updater already
    // owns the marker. Spawning another here would overwrite its claim and
    // race a second updater over the same install tree. The live updater
    // is already working on this exact install and will restart us when
    // it finishes, so treat this the same as a successful hand-off instead
    // of clobbering it with our own.
    rememberLog(`[bootstrap] refusing recovery hand-off: ${handoffConflict.message}`)
    isQuittingForHandoff = true
    setTimeout(() => {
      app.quit()
    }, UPDATE_HANDOFF_DWELL_MS)

    return true
  }

  const updateRoot = resolveUpdateRoot()
  const { branch: configuredBranch } = readDesktopUpdateConfig()

  const branch = directoryExists(path.join(updateRoot, '.git'))
    ? await resolveHealedBranch(updateRoot, configuredBranch || DEFAULT_UPDATE_BRANCH)
    : configuredBranch || DEFAULT_UPDATE_BRANCH

  const venvBin = path.join(updateRoot, 'venv', IS_WINDOWS ? 'Scripts' : 'bin')
  const venvHermes = path.join(venvBin, IS_WINDOWS ? 'hermes.exe' : 'hermes')
  const venvPython = path.join(venvBin, IS_WINDOWS ? 'python.exe' : 'python')

  // The updater invokes the venv's Hermes launcher, which in turn requires the
  // venv interpreter. A bootstrap-complete marker proves only that setup once
  // finished; it can outlive a manually removed or quarantined venv. Sending a
  // marker-only install through --update dead-ends at "Could not find the hermes
  // CLI" instead of rebuilding the runtime, so only a runnable pair gets the
  // gentle update path. Partial or missing runtimes go through full repair.
  const updaterArgs = chooseUpdaterArgs(
    {
      hasBootstrapMarker: fileExists(path.join(updateRoot, '.hermes-bootstrap-complete')),
      hasVenvHermes: fileExists(venvHermes),
      hasVenvPython: fileExists(venvPython)
    },
    branch
  )

  await releaseBackendLockForUpdate(updateRoot)

  const child = spawnUpdaterProcess(updater, updaterArgs, {
    cwd: HERMES_HOME,
    env: {
      ...process.env,
      HERMES_HOME,
      PATH: pathWithHermesManagedNode(venvBin)
    },
    detached: true,
    stdio: 'ignore'
  })

  // Same marker pre-write as applyUpdates — see comment there. The recovery
  // hand-off has the same window where the renderer can respawn a backend
  // before the updater writes its own marker, and the same stale-updater
  // exclusion: a pre-#74782 binary would refuse its own pre-written claim and
  // strand the very recovery meant to heal the install.
  if (Number.isInteger(child.pid) && stagedUpdaterSupportsPrewrittenMarker(updater)) {
    writeUpdateMarker(HERMES_HOME, child.pid)
  } else if (Number.isInteger(child.pid)) {
    rememberLog(
      `[bootstrap] skipping marker pre-write: staged updater predates self-adopt (${updater}); it would refuse its own claim`
    )
  }

  rememberLog(
    `[bootstrap] handed off ${reason} recovery to updater: ${updater} ${updaterArgs.join(' ')}; exiting desktop to release app.asar`
  )
  // Same dwell as the in-app update hand-off (#50419): give the updater's
  // window time to appear before we vanish, so the recovery doesn't look like
  // a crash and provoke a mid-recovery relaunch. The dwell doubles as the
  // hand-off settle window (#66753): a spawn error or early updater death
  // returns false so the caller falls through to its next recovery path
  // instead of quitting into nothing.
  const dwellStartedAt = Date.now()
  const handoffOutcome = await observeUpdaterHandoff(child, UPDATE_HANDOFF_DWELL_MS)

  if (!handoffOutcome.ok) {
    rememberLog(`[bootstrap] recovery hand-off not viable, staying alive: ${handoffOutcome.message}`)

    return false
  }

  isQuittingForHandoff = true
  setTimeout(
    () => {
      app.quit()
    },
    Math.max(0, UPDATE_HANDOFF_DWELL_MS - (Date.now() - dwellStartedAt))
  )

  return true
}

export function runningAppBundle() {
  if (!IS_MAC) {
    return null
  }

  let dir = path.dirname(app.getPath('exe')) // .../Contents/MacOS

  for (let i = 0; i < 2; i++) {
    dir = path.dirname(dir)
  } // -> .../X.app

  return dir.endsWith('.app') ? dir : null
}

export function preflightStateDb(hermesHome, rememberLog) {
  const stateDbPath = path.join(hermesHome, 'state.db')

  if (!fileExists(stateDbPath)) {
    rememberLog('[updates] state.db pre-flight: not found (fresh install?)')

    return
  }

  try {
    const stat = fs.statSync(stateDbPath)

    if (stat.size > 100) {
      const fd = fs.openSync(stateDbPath, 'r')
      const header = Buffer.alloc(16)

      fs.readSync(fd, header, 0, 16, 0)
      fs.closeSync(fd)

      const expectedHeader = Buffer.from('SQLite format 3\0')
      const headerOk = header.equals(expectedHeader)

      rememberLog(
        `[updates] state.db pre-flight: size=${stat.size}, ` +
          `headerOk=${headerOk}, headerHex=${header.toString('hex')}`
      )

      if (!headerOk) {
        rememberLog(
          '[updates] state.db header is INVALID before update — ' +
            'this indicates pre-existing corruption or a concurrent write issue'
        )
      }

      // Emergency timestamped backup, separate from the Python-level snapshot.
      const ts = new Date().toISOString().replace(/[:.]/g, '-')

      const emergencyPath = path.join(hermesHome, `state.db.pre-update-emergency-${ts}.bak`)

      try {
        fs.copyFileSync(stateDbPath, emergencyPath)
        const emergStat = fs.statSync(emergencyPath)

        rememberLog(`[updates] emergency state.db backup: ${emergencyPath} ` + `(${emergStat.size} bytes)`)

        // Prune to the 2 most recent emergency backups.
        try {
          const homeDir = fs.readdirSync(hermesHome)

          const backups = homeDir
            .filter(
              f =>
                f.startsWith('state.db.pre-update-emergency-') &&
                f.endsWith('.bak') &&
                f !== path.basename(emergencyPath)
            )
            .sort()
            .reverse()

          for (const old of backups.slice(2)) {
            try {
              fs.unlinkSync(path.join(hermesHome, old))
            } catch {
              void 0
            }
          }
        } catch {
          void 0
        }
      } catch (copyErr) {
        rememberLog(`[updates] emergency state.db backup failed: ${copyErr.message}`)
      }
    } else {
      rememberLog(`[updates] state.db too small (${stat.size} bytes) for a valid SQLite database`)
    }
  } catch (statErr) {
    rememberLog(`[updates] could not stat state.db before update: ${statErr.message}`)
  }
}

export async function applyUpdatesPosixHandoff(opts: any) {
  const updateRoot = resolveUpdateRoot()
  const handoff = resolvePosixScriptHandoff(updateRoot)

  if (!handoff) {
    emitUpdateProgress({ stage: 'manual', message: 'hermes update', percent: null })

    return { ok: true, manual: true, command: 'hermes update', hermesRoot: updateRoot }
  }

  const handoffConflict = updateHandoffConflict(HERMES_HOME)

  if (handoffConflict) {
    // Same hazard as the Windows path (#75778): a live foreign updater
    // already owns the marker — refuse rather than double-mutate the tree.
    rememberLog(`[updates] refusing posix hand-off: ${handoffConflict.message}`)
    emitUpdateProgress({ stage: 'error', message: handoffConflict.message, percent: null })

    return { ok: false, error: 'update-already-running', message: handoffConflict.message }
  }

  // ── Pre-flight state.db integrity guard (#68474) ──
  preflightStateDb(HERMES_HOME, rememberLog)

  // Branch-pin so a non-main checkout doesn't get switched to main (and
  // self-heal to main when the pinned branch no longer exists on origin).
  let branch = 'main'

  try {
    const head = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: updateRoot })
    const current = (head.stdout || '').trim()

    if (head.code === 0 && current && current !== 'HEAD') {
      branch = await resolveHealedBranch(updateRoot, current)
    }
  } catch {
    // best effort
  }

  const args = [...handoff.args, '--install-root', updateRoot, '--branch', branch, '--desktop-pid', String(process.pid)]
  const updateStartedAt = Math.floor(Date.now() / 1000)

  // Relaunch target: the running .app bundle on mac (script swaps the
  // rebuilt bundle over it), the running binary elsewhere. The script's gate
  // (an exact port of update-relaunch.ts's decideRelaunchOutcome) relaunches
  // only a binary the rebuild replaced with a launchable sandbox helper —
  // replaying the original launch context (filtered args, cwd, sandbox
  // opt-out) so a deep-link or --no-sandbox launch survives the update.
  const targetApp = IS_MAC ? runningAppBundle() : process.execPath

  if (targetApp) {
    args.push('--relaunch-target', targetApp)
  }

  const relaunchArgs = collectRelaunchArgs(process.argv.slice(1))

  if (!IS_MAC) {
    args.push('--relaunch-cwd', process.cwd())

    if (sandboxFallbackFromEnv(process.env, relaunchArgs)) {
      args.push('--sandbox-fallback')
    }

    if (relaunchArgs.length) {
      args.push('--', ...relaunchArgs)
    }
  }

  const child = spawnUpdaterProcess(handoff.command, args, {
    cwd: HERMES_HOME,
    env: {
      ...process.env,
      HERMES_HOME,
      HERMES_UPDATE_STARTED_AT: String(updateStartedAt),
      PATH: pathWithHermesManagedNode(path.join(updateRoot, 'venv', 'bin'))
    },
    detached: true,
    stdio: 'ignore'
  })

  // Bridge marker (same contract as the Windows hand-off): cover the gap
  // until the script claims the marker with its own pid as step 0. If the
  // script never starts, the dead pid reads as stale and self-deletes.
  if (Number.isInteger(child.pid)) {
    writeUpdateMarker(HERMES_HOME, child.pid, { startedAt: updateStartedAt })
  }

  rememberLog(`[updates] launched posix hand-off: ${handoff.scriptPath} (branch ${branch}); quitting to hand off`)
  emitUpdateProgress({
    stage: 'restart',
    message:
      'Updating Hermes — this window will close. Don’t reopen Hermes yourself; it restarts automatically when the update finishes.',
    percent: 100
  })

  // Settle window (#66753): the reported macOS failure mode is exactly this
  // path — the app quits, bash/posix.sh dies early (or was never spawnable),
  // and the user is left with no app, no updater, and no relaunch. Watch the
  // child through the dwell; on spawn error or early death, stay alive and
  // surface the failure instead of quitting into nothing.
  const dwellStartedAt = Date.now()
  const handoffOutcome = await observeUpdaterHandoff(child, UPDATE_HANDOFF_DWELL_MS)

  if (!handoffOutcome.ok) {
    const message = `Update failed to start: ${handoffOutcome.message}. Hermes will keep running — try again, or run \`hermes update\` from a terminal.`

    rememberLog(`[updates] posix hand-off not viable, aborting quit: ${handoffOutcome.message}`)
    emitUpdateProgress({ stage: 'error', message, percent: null })

    return { ok: false, error: 'updater-spawn-failed', message }
  }

  isQuittingForHandoff = true
  setTimeout(
    () => {
      app.quit()
    },
    Math.max(0, UPDATE_HANDOFF_DWELL_MS - (Date.now() - dwellStartedAt))
  )

  return { ok: true, handedOff: true, updater: handoff.scriptPath }
}

export function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

export function readBootstrapMarker() {
  return readJson(BOOTSTRAP_COMPLETE_MARKER)
}

export function isActiveRuntimeUsable() {
  const venvPython = getVenvPython(VENV_ROOT)

  return (
    isHermesSourceRoot(ACTIVE_HERMES_ROOT) &&
    fileExists(venvPython) &&
    canImportHermesCli(venvPython, {
      env: {
        PYTHONPATH: [ACTIVE_HERMES_ROOT, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter)
      }
    })
  )
}

export function activeRuntimeState() {
  // We DELIBERATELY do NOT verify that the checkout is currently at the
  // pinned commit -- users update via the in-app update path or `hermes
  // update`, which moves HEAD legitimately. The marker only attests "a
  // desktop-managed bootstrap ran here at least once"; runtime usability is
  // what decides whether we can actually launch.
  return classifyActiveRuntime(readBootstrapMarker(), BOOTSTRAP_MARKER_SCHEMA_VERSION, isActiveRuntimeUsable())
}

export function writeBootstrapMarker(payload) {
  fs.mkdirSync(path.dirname(BOOTSTRAP_COMPLETE_MARKER), { recursive: true })

  const merged = {
    schemaVersion: BOOTSTRAP_MARKER_SCHEMA_VERSION,
    pinnedCommit: payload.pinnedCommit || null,
    pinnedBranch: payload.pinnedBranch || null,
    completedAt: new Date().toISOString(),
    desktopVersion: app.getVersion()
  }

  writeFileAtomic(BOOTSTRAP_COMPLETE_MARKER, JSON.stringify(merged, null, 2) + '\n', 'utf8')

  return merged
}

export function resolveWebDist() {
  const override = process.env.HERMES_DESKTOP_WEB_DIST

  if (override && directoryExists(path.resolve(override))) {
    return path.resolve(override)
  }

  const unpackedDist = path.join(unpackedPathFor(APP_ROOT), 'dist')

  if (directoryExists(unpackedDist)) {
    return unpackedDist
  }

  // Final fallback: APP_ROOT/dist. When packaged with asar:true this lives
  // INSIDE app.asar — not a servable filesystem directory — so the embedded
  // dashboard backend 404s on static routes (see #41327, #39472). The durable
  // fix is unpacking dist/ (PR #41411 adds dist/** to asarUnpack so the tier-2
  // unpackedDist above resolves). If we still land here while packaged, log it
  // so the cause isn't silent.
  const fallback = path.join(APP_ROOT, 'dist')

  if (IS_PACKAGED && /app\.asar(?=$|[\\/])/.test(fallback) && !directoryExists(fallback)) {
    rememberLog(
      `[web-dist] dashboard frontend dir resolved to an asar-internal path that ` +
        `is not a real directory: ${fallback}. Static routes will 404. ` +
        `Ensure dist/** is unpacked (asarUnpack) or set HERMES_DESKTOP_WEB_DIST.`
    )
  }

  return fallback
}

export function resolveRendererIndex() {
  const asarIndex = path.join(APP_ROOT, 'dist', 'index.html')
  const webDistIndex = path.join(resolveWebDist(), 'index.html')

  // A packaged build ships dist/ twice: inside app.asar AND — because
  // asarUnpack lists dist/** — beside it in app.asar.unpacked. Prefer the
  // unpacked tree, matching the resolveWebDist()/unpackedPathFor precedent:
  // it is the copy the embedded dashboard serves and the copy a repair
  // rewrites, while pointing the window at the asar-internal index.html is
  // exactly how lazy chunks end up fetched from a path that cannot serve
  // them (#93479). Every window loader shares this resolver (main, overlay,
  // quick), so the ordering fix covers all of them. Dev is unchanged:
  // unpackedPathFor is a no-op outside an asar, so both candidates collapse
  // to APP_ROOT/dist and the original order is preserved.
  const candidates = IS_PACKAGED ? [webDistIndex, asarIndex] : [asarIndex, webDistIndex]
  const present = [...new Set(candidates)].filter(fileExists)

  // index.html and the hashed chunks it names are one generation. An update
  // that replaces only one of the two shipped copies (app.asar vs
  // app.asar.unpacked) leaves a TORN copy: the window loads, then dies on the
  // first lazy import with "Failed to fetch dynamically imported module" and
  // every restart reloads the same torn copy. Prefer a copy whose modules are
  // all present, so the intact generation heals the boot by itself.
  for (const candidate of present) {
    const missing = missingRendererAssets(candidate)

    if (missing.length === 0) {
      return candidate
    }

    rememberLog(
      `[renderer] skipping torn renderer bundle at ${candidate}: ` +
        `${missing.length} module file(s) named by index.html are missing ` +
        `(${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''})`
    )
  }

  if (present.length > 0) {
    // Every copy is torn. Load the first one anyway — the boundary's error is
    // still better than a blank window — but say what is wrong and how to fix
    // it, because no amount of restarting repairs a torn bundle.
    rememberLog(
      `[renderer] every renderer bundle is incomplete (${present.join(', ')}). ` +
        `The last update replaced the app while its files were locked. ` +
        `Repair with: hermes desktop --force-build`
    )

    return present[0]
  }

  // Nothing on disk. A packaged build with no renderer bundle blank-pages with
  // a bare ERR_FILE_NOT_FOUND and no clue why (see #39484). Surface the cause
  // and the fix before Electron loads the missing file.
  rememberLog(
    `[renderer] index.html not found — the desktop app was packaged without a ` +
      `renderer bundle. Tried: ${candidates.join(', ')}. ` +
      `Rebuild with: hermes desktop --force-build`
  )

  return candidates[0]
}

export function isPackagedInstallPath(dir) {
  return isPackagedInstallPathUnderRoots(dir, {
    isPackaged: IS_PACKAGED,
    installRoots: [
      APP_ROOT,
      path.dirname(process.execPath),
      resolveRemovableAppPath(process.execPath, process.platform, process.env)
    ]
  })
}

export function resolveHermesCwd() {
  // In a packaged build, `process.cwd()` resolves to the install root (e.g.
  // `…/win-unpacked` on Windows or `/Applications/Hermes.app/Contents/...`
  // on macOS). Sessions spawned there leave files inside the app bundle
  // and bewilder users when "where did my files go?" is the install dir.
  // The user-configurable default project directory wins over everything,
  // followed by env hints (only honored when packaged if they point at a
  // real directory), then the home dir.
  const candidates = [
    readDefaultProjectDir(),
    process.env.HERMES_DESKTOP_CWD,
    IS_PACKAGED ? null : process.env.INIT_CWD,
    IS_PACKAGED ? null : process.cwd(),
    !IS_PACKAGED ? SOURCE_REPO_ROOT : null,
    app.getPath('home')
  ]

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }

    const resolved = path.resolve(String(candidate))

    if (isPackagedInstallPath(resolved)) {
      continue
    }

    if (directoryExists(resolved)) {
      return resolved
    }
  }

  return app.getPath('home')
}

export const DEFAULT_PROJECT_DIR_CONFIG_FILENAME = 'project-dir.json'

export function defaultProjectDirConfigPath() {
  return path.join(app.getPath('userData'), DEFAULT_PROJECT_DIR_CONFIG_FILENAME)
}

export function readDefaultProjectDir() {
  try {
    const raw = fs.readFileSync(defaultProjectDirConfigPath(), 'utf8')
    const parsed = JSON.parse(raw)

    if (parsed && typeof parsed.dir === 'string' && parsed.dir.trim()) {
      const resolved = path.resolve(parsed.dir)

      if (directoryExists(resolved)) {
        return resolved
      }
    }
  } catch {
    // Missing / unreadable / malformed → fall through to the rest of the
    // candidate chain.
  }

  return null
}

export function createPythonBackend(root, label, backendArgs, options: any = {}) {
  const python = findPythonForRoot(root)

  if (!python) {
    return null
  }

  // The venv whose interpreter we selected is the venv whose site-packages
  // belong on PYTHONPATH — findPythonForRoot may have picked `.venv` over
  // `venv`, and mixing the two crashes the backend on its first native
  // import (see venvRootForPython). Fall back to root/venv only for a
  // system python, where the historical layout is the best guess.
  const venvRoot = venvRootForPython(python, root) ?? path.join(root, 'venv')
  const venvPython = getVenvPython(venvRoot)
  const command = IS_WINDOWS && fileExists(venvPython) ? venvPython : python

  return {
    kind: 'python',
    label,
    command,
    args: ['-m', 'hermes_cli.main', ...backendArgs],
    env: buildDesktopBackendEnv({
      hermesHome: HERMES_HOME,
      pythonPathEntries: [root, ...getVenvSitePackagesEntries(venvRoot)],
      venvRoot
    }),
    root,
    bootstrap: Boolean(options.bootstrap),
    shell: false
  }
}

export function createActiveBackend(backendArgs) {
  const venvPython = getVenvPython(VENV_ROOT)
  const command = fileExists(venvPython) ? venvPython : findSystemPython()

  return {
    kind: 'python',
    label: `Hermes at ${ACTIVE_HERMES_ROOT}`,
    command,
    args: ['-m', 'hermes_cli.main', ...backendArgs],
    env: buildDesktopBackendEnv({
      hermesHome: HERMES_HOME,
      pythonPathEntries: [ACTIVE_HERMES_ROOT, ...getVenvSitePackagesEntries(VENV_ROOT)],
      venvRoot: VENV_ROOT
    }),
    root: ACTIVE_HERMES_ROOT,
    bootstrap: true,
    shell: false
  }
}

export function resolveHermesBackend(backendArgs) {
  // 1. Explicit override -- HERMES_DESKTOP_HERMES_ROOT points at a developer
  //    checkout. Honour it as-is (no bootstrap; the user is driving).
  const overrideRoot = process.env.HERMES_DESKTOP_HERMES_ROOT && path.resolve(process.env.HERMES_DESKTOP_HERMES_ROOT)

  if (overrideRoot && isHermesSourceRoot(overrideRoot)) {
    const backend = createPythonBackend(overrideRoot, `Hermes source at ${overrideRoot}`, backendArgs)

    if (backend) {
      return backend
    }
  }

  // 2. (removed) The app used to fall back to the checkout it was running from
  //    (`SOURCE_REPO_ROOT`) whenever that looked like a Hermes source tree, so
  //    in-repo Python edits were exercised during development. This repository
  //    is now a pure Desktop client and ships no Hermes runtime, so there is
  //    nothing to launch from here. Hermes must come from an external install:
  //    rung 1 (explicit), rung 3 (Desktop-managed) or rung 4 (PATH / explicit
  //    executable). A checkout can still be driven explicitly via
  //    HERMES_DESKTOP_HERMES_ROOT, which is a deliberate deployment choice
  //    rather than an implicit fallback.

  // 3. ACTIVE_HERMES_ROOT — the canonical install at
  //    %LOCALAPPDATA%\\hermes\\hermes-agent (Windows) or ~/.hermes/hermes-agent.
  //    A valid bootstrap marker proves Desktop finished the first-run install
  //    flow, but marker provenance is NOT the same thing as runtime usability:
  //    the CLI can create the exact same repo+venv layout, and older desktop
  //    builds could leave a healthy install behind without the marker. If the
  //    active runtime is usable, launch it directly; only fall through to
  //    bootstrap when the runtime itself is unusable.
  const activeRuntime = activeRuntimeState()

  if (activeRuntime.shouldUseActiveRuntime && !bootstrapRepairRequested) {
    if (!activeRuntime.hasValidMarker) {
      rememberLog(
        `[bootstrap] Active Hermes runtime at ${ACTIVE_HERMES_ROOT} is usable but the bootstrap marker is missing or stale; skipping first-run bootstrap.`
      )
    }

    return createActiveBackend(backendArgs)
  }

  if (bootstrapRepairRequested) {
    rememberLog('[bootstrap] repair requested; bypassing the usable active runtime to re-run the installer')
  }

  // 4. Existing `hermes` on PATH -- installed via install.ps1 / install.sh from
  //    a previous tool-only setup, or pip-installed system-wide. Use it but
  //    do NOT write a bootstrap marker; the user did this themselves and we
  //    don't want to take ownership of an install we didn't perform.
  //    HERMES_DESKTOP_IGNORE_EXISTING=1 forces the bootstrap path for testing.
  if (process.env.HERMES_DESKTOP_IGNORE_EXISTING !== '1') {
    let hermesCommand = null
    const hermesOverride = process.env.HERMES_DESKTOP_HERMES

    if (hermesOverride) {
      const resolvedOverride = findOnPath(hermesOverride)

      if (resolvedOverride) {
        hermesCommand = resolvedOverride
      } else if (!isWindowsBinaryPathInWsl(hermesOverride, { isWsl: IS_WSL })) {
        hermesCommand = hermesOverride
      } else {
        rememberLog(`Ignoring Windows Hermes override under WSL: ${hermesOverride}`)
      }
    } else {
      hermesCommand = findOnPath('hermes')
    }

    if (hermesCommand) {
      if (looksLikeDesktopAppBinary(hermesCommand)) {
        rememberLog(`Ignoring desktop app executable on PATH while resolving Hermes CLI: ${hermesCommand}`)
        hermesCommand = null
      }
    }

    if (hermesCommand) {
      const unwrapped = unwrapWindowsVenvHermesCommand(hermesCommand, backendArgs)

      if (unwrapped) {
        return unwrapped
      }

      // Smoke-test the candidate before trusting it. A `hermes` shim
      // left behind by a half-uninstalled pip install (or a venv
      // entry-point pointing at a deleted interpreter) still resolves
      // via findOnPath but explodes on spawn -- the user then sees a
      // dead backend instead of the first-launch installer. The cheap
      // `--version` probe (see backend-probes.ts) catches that case
      // and lets the resolver fall through to step 6 / bootstrap.
      const shellForProbe = isCommandScript(hermesCommand)

      // HERMES_DESKTOP_HERMES is an explicit deployment override (used by
      // the Nix wrapper), not a discovered PATH candidate. It must not fall
      // through to the install-script bootstrap if the optional probe times
      // out under load; the pinned backend is the only valid runtime there.
      if (shouldTrustHermesOverride(hermesOverride) || verifyHermesCli(hermesCommand, { shell: shellForProbe })) {
        // `unwrapped` above already answered "is this a Windows venv shim?" —
        // it was null (not a shim, or its import probe failed). Do NOT re-run
        // unwrapWindowsVenvHermesCommand here: the second call repeats the
        // same un-memoized import probe, costing up to another full probe
        // timeout on the boot path for an answer we already have.
        return {
          label: `existing Hermes CLI at ${hermesCommand}`,
          command: hermesCommand,
          args: backendArgs,
          bootstrap: false,
          env: {},
          kind: 'command',
          shell: shellForProbe
        }
      }

      rememberLog(
        `Ignoring existing Hermes CLI at ${hermesCommand}: --version probe failed; falling through to bootstrap.`
      )
    }
  }

  // 5. Last-ditch: pip-installed hermes_cli module via system Python.
  //    Same rationale as #4 -- the user installed this; we use it but don't
  //    take ownership.
  const python = findSystemPython()

  if (python) {
    // Same smoke-test rationale as step 4: a system Python in the
    // SUPPORTED_VERSIONS range can be registered (PEP 514) without
    // having hermes_cli installed -- common on dev boxes that have
    // a python.org install from prior unrelated work. Returning that
    // backend hands the spawn step a guaranteed ModuleNotFoundError.
    // Verify the import works before trusting the candidate; on
    // failure, fall through to step 6 so the bootstrap runner pulls
    // a uv-managed 3.11 into %LOCALAPPDATA%\hermes\hermes-agent\venv.
    if (canImportHermesCli(python)) {
      return {
        kind: 'python',
        label: `installed hermes_cli module via ${python}`,
        command: python,
        args: ['-m', 'hermes_cli.main', ...backendArgs],
        bootstrap: false,
        env: {},
        shell: false
      }
    }

    rememberLog(`Ignoring system Python ${python}: hermes_cli is not importable; falling through to bootstrap.`)
  }

  // 6. Nothing usable anywhere -- no explicit executable, no Desktop-managed
  //    install, no `hermes` on PATH, no importable hermes_cli. The result is
  //    TYPED (see HERMES_EXECUTABLE_NOT_FOUND) so the UI can say precisely what
  //    is missing instead of reporting an opaque boot failure.
  //
  //    We deliberately do NOT throw here -- throwing inside
  //    resolveHermesBackend was the old "no payload" path and forced the user
  //    into a dead end. "No install yet" stays a recoverable state: the GUI
  //    drives it through the first-run install, and the typed code rides along
  //    so an unavailable app is still an honest, diagnosable one.
  return {
    kind: 'bootstrap-needed',
    label: 'Hermes Agent not installed yet; bootstrap required',
    command: null,
    args: backendArgs,
    bootstrap: true,
    env: {},
    shell: false,
    errorCode: HERMES_EXECUTABLE_NOT_FOUND,
    // Hints for the bootstrap runner / UI layer:
    activeRoot: ACTIVE_HERMES_ROOT,
    installStamp: INSTALL_STAMP, // may be null in dev
    isPackaged: IS_PACKAGED,
    platform: process.platform
  }
}

export async function ensureRuntime(backend) {
  if (!backend.bootstrap) {
    await advanceBootProgress('runtime.external', `Using ${backend.label}`, 32)

    return backend
  }

  // backend.kind === 'bootstrap-needed' means resolveHermesBackend couldn't
  // find anything to spawn. Hand off to the bootstrap runner which drives the
  // platform installer, writes the bootstrap-complete marker on success, then
  // we re-resolve to get the now-installed backend.
  //
  // Phase 1D status: bootstrap runs but events go to desktop.log only
  // (renderer window isn't created until later in startBackend). Phase 1E
  // will rewire startup to spawn the window first and route bootstrap events
  // to a renderer-side install overlay.
  if (backend.kind === 'bootstrap-needed') {
    rememberLog('[bootstrap] no Hermes install found; starting first-launch bootstrap')

    // Record WHY the ladder exhausted before trying to fix it: if the install
    // is declined or fails, the surface can say "no Hermes executable" instead
    // of an opaque boot error. The code is sticky, and a successful install
    // re-resolves and clears it via the explicit `errorCode: null` on the
    // backend.ready update.
    updateBootProgress({ errorCode: backend.errorCode ?? HERMES_EXECUTABLE_NOT_FOUND })

    if (await handOffWindowsBootstrapRecovery('bootstrap-needed')) {
      const handoffError: Error & { isBootstrapFailure?: boolean; bootstrapHandedOff?: boolean } = new Error(
        'Hermes recovery was handed off to Hermes Setup. The desktop will restart when recovery completes.'
      )

      handoffError.isBootstrapFailure = true
      handoffError.bootstrapHandedOff = true
      bootstrapFailure = handoffError
      throw handoffError
    }

    // Eagerly flip the bootstrap UI state to 'active' so the renderer
    // shows the install overlay BEFORE the runner finishes fetching the
    // manifest (which on slow networks can take tens of seconds and would
    // otherwise leave the user staring at the generic 'Preparing' splash).
    // We emit a synthetic manifest with an empty stages list -- the real
    // manifest event will overwrite it once install.ps1 -Manifest returns.
    try {
      broadcastBootstrapEvent({
        type: 'manifest',
        stages: [],
        protocolVersion: null
      })
    } catch {
      void 0
    }

    bootstrapAbortController = new AbortController()

    // The repair request has been honoured by reaching the installer; clear it
    // so a later boot isn't forced through bootstrap again.
    bootstrapRepairRequested = false
    bootstrapRepairAttempt = 0

    const bootstrapResult = await runBootstrap({
      installStamp: backend.installStamp,
      activeRoot: backend.activeRoot,
      sourceRepoRoot: SOURCE_REPO_ROOT,
      hermesHome: HERMES_HOME,
      logRoot: path.join(HERMES_HOME, 'logs'),
      abortSignal: bootstrapAbortController.signal,
      onEvent: ev => {
        // Tee every bootstrap event to (a) the desktop log for forensics
        // and (b) the renderer for live progress UI. Either may be absent;
        // tolerate both gracefully so a renderer crash doesn't stall the
        // bootstrap and a log-write failure doesn't suppress the UI signal.
        try {
          rememberLog(`[bootstrap] ${JSON.stringify(ev)}`)
        } catch {
          void 0
        }

        try {
          broadcastBootstrapEvent(ev)
        } catch {
          void 0
        }
      },
      writeMarker: writeBootstrapMarker
    })

    bootstrapAbortController = null

    if (bootstrapResult.cancelled) {
      const cancelledError = new Error('Hermes install was cancelled.') as any
      cancelledError.isBootstrapFailure = true
      cancelledError.bootstrapCancelled = true
      bootstrapFailure = cancelledError
      throw cancelledError
    }

    if (!bootstrapResult.ok) {
      const bootstrapError = new Error(
        `Hermes bootstrap failed${bootstrapResult.failedStage ? ` at stage '${bootstrapResult.failedStage}'` : ''}: ` +
          `${bootstrapResult.error || 'unknown error'}. ` +
          `Check ${path.join(HERMES_HOME, 'logs', 'desktop.log')} for the full transcript.`
      ) as any

      bootstrapError.isBootstrapFailure = true
      bootstrapError.failedStage = bootstrapResult.failedStage || null
      // Latch the failure so subsequent startHermes() calls return this
      // same error without re-running install.ps1.  Cleared by the
      // hermes:bootstrap:reset IPC (renderer's "Reload and retry").
      bootstrapFailure = bootstrapError
      throw bootstrapError
    }

    rememberLog('[bootstrap] bootstrap complete; marker written. Re-resolving backend.')

    // Re-resolve now that the install exists. The new resolution lands in
    // step 3 (bootstrap-complete marker) and we recurse to wire venvPython.
    return ensureRuntime(resolveHermesBackend(backend.args))
  }

  // bootstrap=true with a real backend (createActiveBackend path) means we
  // have a checkout and need to ensure the venv-derived Python command is
  // wired into the backend before launch. Same code path the old factory
  // sync flow exited through, minus all the factory/pip/marker machinery
  // (install.ps1 owns those concerns now and the bootstrap-complete marker
  // attests they ran successfully).
  if (!isHermesSourceRoot(ACTIVE_HERMES_ROOT)) {
    throw new Error(
      `Hermes install at ${ACTIVE_HERMES_ROOT} is missing or incomplete. ` +
        'Reinstall via the desktop installer or scripts/install.ps1.'
    )
  }

  // On Windows, preflight Git Bash. Hermes' terminal tool calls bash.exe
  // directly (tools/environments/local.py); without it the agent can't run
  // terminal commands. install.ps1's Stage-Git puts PortableGit at
  // %LOCALAPPDATA%\hermes\git\, which findGitBash() picks up, so for any
  // user who completed the bootstrap this is a no-op. For users who got
  // here via an external `hermes` on PATH, this check still helps.
  if (IS_WINDOWS && !findGitBash()) {
    throw new Error(
      'Git for Windows is required for Hermes on Windows (provides Git Bash, ' +
        "which the agent's terminal tool uses). Install it from " +
        'https://git-scm.com/download/win or run `winget install -e --id Git.Git`, ' +
        'then relaunch Hermes.'
    )
  }

  const venvPython = getVenvPython(VENV_ROOT)

  if (!fileExists(venvPython)) {
    // No venv at the expected location AND no bootstrap-needed sentinel
    // means we have a half-installed checkout: .git exists, source files
    // exist, but venv is missing or broken. This shouldn't happen in
    // normal flow because activeRuntimeState() requires isHermesSourceRoot()
    // plus an importable hermes_cli before it hands back the active runtime.
    // If we hit this, the user (or a deleted venv) broke the invariant; tell
    // them to re-run the install.
    throw new Error(
      `Hermes venv missing at ${VENV_ROOT}. Re-run the desktop installer or ` + '`scripts/install.ps1` to rebuild it.'
    )
  }

  backend.command = getVenvPython(VENV_ROOT)
  backend.label = `Hermes at ${ACTIVE_HERMES_ROOT} (venv: ${VENV_ROOT})`
  updateBootProgress({
    phase: 'runtime.ready',
    message: 'Hermes runtime is ready',
    progress: 82,
    running: true,
    error: null
  })

  return backend
}

export function multipartBody(upload) {
  const boundary = `----hermes-${crypto.randomBytes(12).toString('hex')}`
  const filename = String(upload.filename || 'file').replace(/["\r\n]/g, '_')

  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${upload.contentType || 'application/octet-stream'}\r\n\r\n`
    ),
    Buffer.from(upload.bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ])

  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

export function fetchJson(url, token, options: any = {}) {
  // Retry policy lives in api-transport.ts: idempotent verbs retry on any
  // transient transport error; POST/PUT/DELETE only when the request provably
  // never reached the server (see shouldRetryRequest) — never double-submit.
  return withRetry(
    (requestState: any) =>
      new Promise((resolve, reject) => {
        const { body, contentType } = options.upload
          ? multipartBody(options.upload)
          : {
              body: options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body)),
              contentType: 'application/json'
            }

        const parsed = new URL(url)
        const client = parsed.protocol === 'https:' ? https : http
        const agent = jsonAgentFor(parsed.protocol)
        const timeoutMs = resolveTimeoutMs(options.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS)

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          reject(new Error(`Unsupported Hermes backend URL protocol: ${parsed.protocol}`))

          return
        }

        const req = client.request(
          parsed,
          {
            agent,
            method: options.method || 'GET',
            headers: {
              ...headersForRemoteRequest(url),
              ...(options.headers || {}),
              'Content-Type': contentType,
              'X-Hermes-Session-Token': token,
              // RFC 8252 native flow authenticates the gated gateway with a bearer
              // token instead of the loopback session-token header. When
              // ``options.bearer`` is set we send Authorization: Bearer <token>;
              // the gateway's OAuth gate verifies it via the provider stack with
              // no cookie involved.
              ...(options.bearer ? { Authorization: `Bearer ${options.bearer}` } : {}),
              ...(body ? { 'Content-Length': String(body.length) } : {})
            }
          },
          res => {
            const chunks = []
            res.on('error', reject)
            res.on('data', chunk => chunks.push(chunk))
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8')

              if ((res.statusCode || 500) >= 400) {
                reject(new Error(`${res.statusCode}: ${text || res.statusMessage}`))

                return
              }

              if (!text) {
                resolve(null)

                return
              }

              // A 2xx response whose body is HTML means the request fell through
              // to the SPA index.html (e.g. an unregistered /api path). JSON.parse
              // would throw an opaque `Unexpected token '<'` here, so surface a
              // clear diagnostic with the offending URL instead.
              const looksHtml = /^\s*<(?:!doctype|html)/i.test(text)
              const contentType = String(res.headers['content-type'] || '')

              if (looksHtml || contentType.includes('text/html')) {
                reject(
                  new Error(
                    `Expected JSON from ${url} but got HTML (status ${res.statusCode}). ` +
                      'The endpoint is likely missing on the Hermes backend.'
                  )
                )

                return
              }

              try {
                resolve(JSON.parse(text))
              } catch {
                reject(new Error(`Invalid JSON from ${url} (status ${res.statusCode}): ${text.slice(0, 200)}`))
              }
            })
          }
        )

        req.on('error', reject)
        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error(`Timed out connecting to Hermes backend after ${timeoutMs}ms`))
        })

        // From here the request goes on the wire: a later transport error can no
        // longer prove the server didn't process it, so non-idempotent verbs must
        // not be retried past this point.
        requestState.bodySent = true

        if (body) {
          req.write(body)
        }

        req.end()
      }),
    { method: options.method || 'GET' }
  )
}

export function fetchPublicJson(url, options: any = {}) {
  // Credential-free JSON GET/POST for public gateway endpoints
  // (``/api/status``, ``/api/auth/providers``). Unlike ``fetchJson`` it sends
  // NO ``X-Hermes-Session-Token`` header — used by the auth-mode probe before
  // any credentials exist, and any time we must not leak a token to an
  // endpoint that doesn't need one.
  return withRetry(
    (requestState: any) =>
      new Promise((resolve, reject) => {
        const body = options.body === undefined ? undefined : Buffer.from(JSON.stringify(options.body))
        let parsed

        try {
          parsed = new URL(url)
        } catch (error) {
          reject(new Error(`Invalid URL: ${error.message}`))

          return
        }

        const client = parsed.protocol === 'https:' ? https : http
        const agent = jsonAgentFor(parsed.protocol)
        const timeoutMs = resolveTimeoutMs(options.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS)

        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          reject(new Error(`Unsupported Hermes backend URL protocol: ${parsed.protocol}`))

          return
        }

        const req = client.request(
          parsed,
          {
            agent,
            method: options.method || 'GET',
            headers: {
              ...headersForRemoteRequest(url),
              ...(options.headers || {}),
              'Content-Type': 'application/json',
              ...(body ? { 'Content-Length': String(body.length) } : {})
            }
          },
          res => {
            const chunks = []
            res.on('data', chunk => chunks.push(chunk))
            res.on('end', () => {
              const text = Buffer.concat(chunks).toString('utf8')

              if ((res.statusCode || 500) >= 400) {
                reject(new Error(`${res.statusCode}: ${text || res.statusMessage}`))

                return
              }

              if (!text) {
                resolve(null)

                return
              }

              const looksHtml = /^\s*<(?:!doctype|html)/i.test(text)
              const contentType = String(res.headers['content-type'] || '')

              if (looksHtml || contentType.includes('text/html')) {
                reject(
                  new Error(
                    `Expected JSON from ${url} but got HTML (status ${res.statusCode}). ` +
                      'The endpoint is likely missing on the Hermes backend.'
                  )
                )

                return
              }

              try {
                resolve(JSON.parse(text))
              } catch {
                reject(new Error(`Invalid JSON from ${url} (status ${res.statusCode}): ${text.slice(0, 200)}`))
              }
            })
          }
        )

        req.on('error', reject)
        req.setTimeout(timeoutMs, () => {
          req.destroy(new Error(`Timed out connecting to Hermes backend after ${timeoutMs}ms`))
        })

        // Past this point the request is on the wire — see fetchJson.
        requestState.bodySent = true

        if (body) {
          req.write(body)
        }

        req.end()
      }),
    { method: options.method || 'GET' }
  )
}

export let oauthSession = null

export function requestOptionsWithHeaders(options: any = {}, headers = {}) {
  return {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  }
}

export const gatewayAuthProvidersCache = new Map<string, any[]>()

export async function gatewayAuthProviders(baseUrl, headers = {}) {
  const cached = gatewayAuthProvidersCache.get(baseUrl)

  if (cached) {
    return cached
  }

  let providers = []

  try {
    const body = (await fetchPublicJson(
      `${baseUrl}/api/auth/providers`,
      requestOptionsWithHeaders({ timeoutMs: 8_000 }, headers)
    )) as any

    if (Array.isArray(body?.providers)) {
      providers = body.providers
        .filter(p => p && typeof p === 'object')
        .map(p => ({ name: String(p.name || ''), supportsPassword: Boolean(p.supports_password) }))
        .filter(p => p.name)
    }

    gatewayAuthProvidersCache.set(baseUrl, providers)
  } catch {
    // Optional metadata — an unreadable list keeps the strict guard.
  }

  return providers
}

export async function buildReadinessHealthProbe(baseUrl, authMode, token) {
  const nativeAt = authMode === 'oauth' ? await ensureNativeAccessToken(baseUrl).catch(() => null) : null
  const probeAuth = resolveReadinessProbeAuth(authMode, nativeAt, token)

  if (probeAuth.kind === 'bearer') {
    return {
      // fetchJson takes the bearer via `options.bearer` — a raw `headers`
      // option is ignored, so passing one here would silently probe
      // uncredentialed and reintroduce the 401 loop.
      probeHealth: (url, options: any = {}) => fetchJson(url, null, { ...options, bearer: probeAuth.token }),
      probeIsCredentialed: true
    }
  }

  if (probeAuth.kind === 'cookie') {
    return {
      probeHealth: (url, options: any = {}) => fetchJsonViaOauthSession(url, options),
      probeIsCredentialed: true
    }
  }

  if (probeAuth.kind === 'token' && probeAuth.token) {
    return {
      probeHealth: (url, options: any = {}) => fetchJson(url, probeAuth.token, options),
      probeIsCredentialed: true
    }
  }

  return { probeHealth: fetchPublicJson, probeIsCredentialed: false }
}

export async function waitForHermes(baseUrl, token, signal?, authMode?, headers = {}) {
  const { probeHealth, probeIsCredentialed } = await buildReadinessHealthProbe(baseUrl, authMode, token)

  return waitForHermesReady(baseUrl, {
    token,
    signal,
    fetchPublicJson,
    fetchJson: probeIsCredentialed
      ? (url, _token, options = {}) => probeHealth(url, requestOptionsWithHeaders(options, headers))
      : fetchJson,
    probeHealth: (url, options = {}) => probeHealth(url, requestOptionsWithHeaders(options, headers)),
    probeIsCredentialed
  })
}

export function getWindowButtonPosition(win = mainWindow) {
  if (!IS_MAC) {
    return null
  }

  // Fullscreen hides the traffic lights — treat as no left-side controls so the
  // renderer drops the traffic-light dodge inset and Y nudge.
  if (win?.isFullScreen?.()) {
    return null
  }

  return win?.getWindowButtonPosition?.() || WINDOW_BUTTON_POSITION
}

export function getNativeOverlayWidth() {
  return computeNativeOverlayWidth({ isWindows: IS_WINDOWS, isWsl: IS_WSL, isMac: IS_MAC })
}

export function getWindowState(win = mainWindow) {
  return {
    isFullscreen: Boolean(win?.isFullScreen?.()),
    isMinimized: Boolean(win?.isMinimized?.()),
    isVisible: Boolean(win?.isVisible?.()),
    nativeOverlayWidth: getNativeOverlayWidth(),
    windowButtonPosition: getWindowButtonPosition(win),
    darwinMajor: IS_MAC ? DARWIN_MAJOR : 0
  }
}

export function sendBackendExit(payload) {
  // Intentional soft re-home (gateway mode apply) kills the child on purpose —
  // don't surface the "backend stopped" error toast / boot-failure path.
  if (softRehomeInProgress) {
    return
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const { webContents } = mainWindow

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:backend-exit', payload)
}

export function sendClosePreviewRequested() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const { webContents } = mainWindow

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:close-preview-requested')
}

export function commandFocusedGuest(command: 'back' | 'forward' | 'reload'): boolean {
  const focused = electronWebContents.getFocusedWebContents()

  if (!focused || focused.isDestroyed() || focused.getType() !== 'webview') {
    return false
  }

  const history = focused.navigationHistory

  if (command === 'reload') {
    focused.reload()
  } else if (command === 'back') {
    if (!history.canGoBack()) {
      return true
    }

    history.goBack()
  } else {
    if (!history.canGoForward()) {
      return true
    }

    history.goForward()
  }

  return true
}

export function sendPreviewNavCommand(command: 'back' | 'forward' | 'reload') {
  // The user is inside the page itself — main is the only party that can see
  // that, so act here and never round-trip.
  if (commandFocusedGuest(command)) {
    return
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  const { webContents } = mainWindow

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:preview-nav', command)
}

export function installBrowserNavGestures(window) {
  window.on('swipe', (_event, direction) => {
    if (direction === 'left' || direction === 'right') {
      // Swipe LEFT moves the page left, revealing what's behind it — that's
      // back. Matches Safari, Chrome, and Finder.
      sendPreviewNavCommand(direction === 'left' ? 'back' : 'forward')
    }
  })

  window.on('app-command', (event, command) => {
    if (command !== 'browser-backward' && command !== 'browser-forward') {
      return
    }

    // Claim it either way: unhandled, Chromium walks the HOST document's
    // history, which would navigate the app shell itself.
    event.preventDefault()
    sendPreviewNavCommand(command === 'browser-backward' ? 'back' : 'forward')
  })
}

export function getAppIconPath() {
  // Fail-soft: skip candidates that exist but don't decode (truncated PNG in a
  // packaged app.asar previously crashed createWindow mid-session). Missing
  // every candidate is fine — the window then uses the platform default icon.
  try {
    return resolveAppIcon(APP_ICON_PATHS)
  } catch {
    return undefined
  }
}

export let pluginCompatNoticeShown = false

export async function showPluginCompatNoticeOnce() {
  if (pluginCompatNoticeShown) {
    return
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }

  let notice

  try {
    notice = pendingPluginCompatNotice(HERMES_HOME, app.getPath('userData'))
  } catch (err) {
    rememberLog(`[plugins] compat notice check failed: ${err.message}`)

    return
  }

  if (!notice) {
    return
  }

  pluginCompatNoticeShown = true
  rememberLog(`[plugins] compat notice shown (${notice.key})`)

  try {
    await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: notice.title,
      message: notice.message,
      detail: notice.detail,
      buttons: ['OK'],
      defaultId: 0,
      noLink: true
    })
  } finally {
    try {
      recordPluginCompatDismissed(app.getPath('userData'), notice.key)
    } catch (err) {
      rememberLog(`[plugins] could not persist compat notice dismissal: ${err.message}`)
    }
  }
}

export function sendWindowStateChanged(nextIsFullscreen?: boolean, target = mainWindow) {
  if (!target || target.isDestroyed()) {
    return
  }

  const { webContents } = target

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  const state = getWindowState(target)

  if (typeof nextIsFullscreen === 'boolean') {
    state.isFullscreen = nextIsFullscreen
  }

  webContents.send('hermes:window-state-changed', state)
}

export function toggleDevTools(window) {
  // DevTools is enabled in packaged builds so users can diagnose renderer
  // issues without needing a dev build. Trade-off: tiny attack surface
  // increase versus a much better support story when WS connection or
  // CSP issues surface in the field.
  const { webContents } = window

  if (webContents.isDevToolsOpened()) {
    webContents.closeDevTools()
  } else {
    webContents.openDevTools({ mode: 'detach' })
  }
}

export function installDevToolsShortcut(window) {
  // Only Ctrl+Shift+I (or Cmd+Opt+I on Mac) opens DevTools.
  // F12 is explicitly blocked so Chromium's built-in handler doesn't open it.
  window.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase()

    // F12 opens DevTools by default; block only when the user disabled it.
    if (input.key === 'F12') {
      if (f12Blocked) {
        event.preventDefault()

        return
      }
      // Not blocked — fall through to open DevTools.
    }

    const isInspectShortcut =
      input.key === 'F12' ||
      (IS_MAC && input.meta && input.alt && key === 'i') ||
      (!IS_MAC && input.control && input.shift && key === 'i')

    if (!isInspectShortcut) {
      return
    }

    event.preventDefault()
    toggleDevTools(window)
  })
}

export function installPreviewShortcut(window) {
  window.webContents.on('before-input-event', (event, input) => {
    const key = String(input.key || '').toLowerCase()
    const accel = (IS_MAC ? input.meta : input.control) && !input.alt
    const isCloseTabShortcut = key === 'w' && accel && !input.shift

    // Always claim ⌘W here (the File>Close item deliberately has no
    // accelerator, so nothing else does). The renderer decides tab-vs-window
    // — no `previewShortcutActive` gate, so it works for every closeable tab.
    if (isCloseTabShortcut) {
      event.preventDefault()
      sendClosePreviewRequested()

      return
    }

    // ⌘R rides here rather than on the View menu item for the same reason:
    // the application menu only exists on macOS (it is set to null elsewhere,
    // see #77845), so a menu accelerator would leave Windows and Linux with no
    // way to reload a page at all. ⇧⌘R is left alone — that is `forceReload`,
    // the unconditional whole-window escape hatch.
    if (key === 'r' && accel && !input.shift) {
      event.preventDefault()
      sendPreviewNavCommand('reload')
    }
  })
}

export function setAndPersistZoomLevel(window, zoomLevel) {
  if (!window || window.isDestroyed()) {
    return
  }

  // Apply + notify in one funnel so the settings UI stays in sync, including
  // changes made via the keyboard shortcuts or the View menu.
  const next = applyZoomLevel(window.webContents, zoomLevel)

  // Primary store: main-process JSON (survives crash recovery — #56726).
  writeZoomState(next)
  // Secondary mirror: renderer localStorage (legacy store; kept in sync so a
  // downgrade or JSON read failure still finds a sane value).
  window.webContents
    .executeJavaScript(
      `try { localStorage.setItem(${JSON.stringify(ZOOM_STORAGE_KEY)}, ${JSON.stringify(String(next))}) } catch {
      void 0
    }`
    )
    .catch(error => rememberLog(`[zoom] persist failed: ${error?.message || error}`))
}

export function restorePersistedZoomLevel(window) {
  if (!window || window.isDestroyed()) {
    return
  }

  // Prefer the JSON file — it survives crash recovery wiping Electron's
  // cache/storage folders (#56726). applyZoomLevel notifies the renderer so
  // the Appearance UI Scale control stays in sync.
  const saved = readZoomState()

  if (saved != null) {
    // Drift-guard: skip when this window already shows the persisted level.
    // Blindly re-applying on every resize/move would race the compositor's
    // surface reconfigure during a Wayland resize storm (Cosmic tiled mode
    // fires one whenever a new session window opens — #84818) and keep the
    // renderer notification stream churning for no gain. The settle-verify
    // chain in installZoomReassertOnWindowEvents re-applies only when the
    // window actually drifted from the persisted level.
    const current = window.webContents?.getZoomLevel?.()

    if (current != null && Math.abs(current - saved) < 1e-9) {
      return
    }

    applyZoomLevel(window.webContents, saved)

    return
  }

  // No JSON yet: paint the shipped default immediately so a fresh install
  // doesn't flash Chromium 100%, then try localStorage for pre-JSON installs
  // and overwrite if a legacy value is there.
  applyZoomLevel(window.webContents, DEFAULT_ZOOM_LEVEL)

  window.webContents
    .executeJavaScript(
      `(() => { try { return localStorage.getItem(${JSON.stringify(ZOOM_STORAGE_KEY)}) } catch { return null } })()`
    )
    .then(stored => {
      if (!window || window.isDestroyed()) {
        return
      }

      const level = stored == null ? DEFAULT_ZOOM_LEVEL : Number(stored)
      const applied = applyZoomLevel(window.webContents, level)
      writeZoomState(applied)
    })
    .catch(error => rememberLog(`[zoom] restore failed: ${error?.message || error}`))
}

export function installZoomShortcuts(window) {
  // Override Ctrl/Cmd + +/-/0 with half Chromium's default zoom step (ZOOM_STEP
  // is 0.1 vs Chromium's 0.2). The menu items handle this on macOS (where the
  // menu is always present), but on Linux/Windows the menu is null and
  // Chromium's default handler would use the full 0.2 step, so we intercept
  // here for consistency. Ctrl/Cmd+0 resets to DEFAULT_ZOOM_LEVEL, not Chromium 0.
  window.webContents.on('before-input-event', (event, input) => {
    const mod = IS_MAC ? input.meta : input.control

    if (!mod || input.alt) {
      return
    }

    const key = input.key

    if (key === '0') {
      if (input.shift) {
        return // Ctrl/Cmd+Shift+0 is not a zoom chord — leave it alone
      }

      event.preventDefault()
      setAndPersistZoomLevel(window, DEFAULT_ZOOM_LEVEL)
    } else if (key === '=' || key === '+') {
      // Zoom-in must accept the shift modifier: on US layouts Plus is
      // physically Shift+=, so Cmd+Plus arrives as Cmd+Shift+'+' (or '='
      // depending on platform). The old blanket shift guard silently
      // dropped keyboard zoom-in on macOS (#43517).
      event.preventDefault()
      setAndPersistZoomLevel(window, window.webContents.getZoomLevel() + ZOOM_STEP)
    } else if (key === '-') {
      if (input.shift) {
        return // Shift+'-' is '_' territory on most layouts, not zoom-out
      }

      event.preventDefault()
      setAndPersistZoomLevel(window, window.webContents.getZoomLevel() - ZOOM_STEP)
    }
  })

  // Ctrl/Cmd + mouse wheel — the standard desktop/browser zoom gesture
  // (#40295). Chromium surfaces it as the main-process 'zoom-changed' event
  // (wheel events are DOM-side, so before-input-event never sees them).
  // Route through the same persist+notify funnel as the keyboard shortcuts
  // so wheel zoom survives restarts and the settings Scale control stays in
  // sync, and use the same half step for consistency.
  window.webContents.on('zoom-changed', (event, zoomDirection) => {
    event.preventDefault()
    const delta = zoomDirection === 'in' ? ZOOM_STEP : -ZOOM_STEP
    setAndPersistZoomLevel(window, window.webContents.getZoomLevel() + delta)
  })
}

export const lastContextMenuPoint = new Map<number, { x: number; y: number }>()

export function installContextMenuBridge(window: BrowserWindow) {
  window.webContents.on('context-menu', (_event, params) => {
    lastContextMenuPoint.set(window.webContents.id, { x: params.x, y: params.y })

    const suggestions = Array.isArray(params.dictionarySuggestions) ? params.dictionarySuggestions : []

    if (params.isEditable && params.misspelledWord) {
      window.webContents.send('hermes:context-menu-spellcheck', {
        misspelledWord: params.misspelledWord,
        suggestions
      })
    }
  })
}

export const OAUTH_SESSION_PARTITION = LEGACY_OAUTH_PARTITION

export function getOauthSession() {
  if (oauthSession || !app.isReady()) {
    return oauthSession
  }

  oauthSession = session.fromPartition(OAUTH_SESSION_PARTITION)

  return oauthSession
}

export const oauthSessionsByPartition = new Map()

export function resolveOauthPartitionForUrl(url) {
  try {
    return resolveOauthPartition(url, {
      registry: readDesktopConnectionsRegistry(),
      v1RemoteUrl: readDesktopConnectionConfig()?.remote?.url
    })
  } catch {
    // A broken registry read must never take cookie auth down with it.
    return OAUTH_SESSION_PARTITION
  }
}

export function getOauthSessionForUrl(url) {
  const partition = resolveOauthPartitionForUrl(url)

  if (partition === OAUTH_SESSION_PARTITION) {
    return getOauthSession()
  }

  if (!app.isReady()) {
    return null
  }

  let sess = oauthSessionsByPartition.get(partition)

  if (!sess) {
    sess = session.fromPartition(partition)
    oauthSessionsByPartition.set(partition, sess)
  }

  return sess
}

export const oauthCookieWarmups = new Map()

export function warmOauthCookieStore(url?) {
  const partition = resolveOauthPartitionForUrl(url)
  const pending = oauthCookieWarmups.get(partition)

  if (pending) {
    return pending
  }

  const warmup = (async () => {
    const sess = getOauthSessionForUrl(url)

    if (!sess) {
      // App not ready yet — don't memoize a no-op; let a later call retry.
      oauthCookieWarmups.delete(partition)

      return
    }

    try {
      // flushStorageData() forces Chromium to reconcile the in-memory cookie
      // monster with the on-disk SQLite store; the subsequent get() then reads
      // a populated jar rather than racing the lazy first-access load.
      sess.flushStorageData?.()
      await sess.cookies.get({})
    } catch {
      // Best effort; the real read below re-checks with bounded retries.
    }
  })()

  oauthCookieWarmups.set(partition, warmup)

  return warmup
}

export async function hasLiveOauthSession(baseUrl) {
  const sess = getOauthSessionForUrl(baseUrl)

  if (!sess) {
    return false
  }

  const parsed = new URL(baseUrl)

  const readLive = async () => {
    try {
      const cookies = await sess.cookies.get({ url: baseUrl })

      return cookiesHaveLiveSession(cookies)
    } catch {
      try {
        const cookies = await sess.cookies.get({ domain: parsed.hostname })

        return cookiesHaveLiveSession(cookies)
      } catch {
        return false
      }
    }
  }

  // First read against the (possibly still-hydrating) jar.
  if (await readLive()) {
    return true
  }

  // Cold-start false-negative guard. A `persist:` partition's cookie store
  // loads lazily, so the FIRST read on a fresh boot can come back empty even
  // for a signed-in user — the exact race that produced the transient "Hermes
  // couldn't start / not signed in" overlay that Retry always cleared. Before
  // trusting a negative, force the store to hydrate and re-read a couple of
  // times with a short backoff. A genuinely signed-out user still resolves
  // false quickly (≤ ~180ms); a signed-in user racing the load now wins.
  await warmOauthCookieStore(baseUrl)

  for (const delayMs of [30, 60, 90]) {
    if (await readLive()) {
      return true
    }

    await new Promise(resolve => setTimeout(resolve, delayMs))
  }

  return readLive()
}

export function fetchJsonViaOauthSession(url, options: any = {}) {
  return new Promise((resolve, reject) => {
    const sess = getOauthSessionForUrl(url)

    if (!sess) {
      reject(new Error('OAuth session partition is unavailable.'))

      return
    }

    let parsed

    try {
      parsed = new URL(url)
    } catch (error) {
      reject(new Error(`Invalid URL: ${error.message}`))

      return
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      reject(new Error(`Unsupported Hermes backend URL protocol: ${parsed.protocol}`))

      return
    }

    const body = serializeJsonBody(options.body)
    const timeoutMs = resolveTimeoutMs(options.timeoutMs, DEFAULT_FETCH_TIMEOUT_MS)

    const request = electronNet.request({
      method: options.method || 'GET',
      url,
      session: sess,
      useSessionCookies: true,
      redirect: 'follow'
    } as any)

    setJsonRequestHeaders(request)

    for (const [name, value] of Object.entries({ ...headersForRemoteRequest(url), ...(options.headers || {}) })) {
      request.setHeader(name, String(value))
    }

    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true

      try {
        request.abort()
      } catch {
        // already finished
      }

      reject(new Error(`Timed out connecting to Hermes backend after ${timeoutMs}ms`))
    }, timeoutMs)

    request.on('response', res => {
      const chunks = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        if (timedOut) {
          return
        }

        clearTimeout(timer)
        const text = Buffer.concat(chunks).toString('utf8')
        const statusCode = res.statusCode || 500

        if (statusCode >= 400) {
          const err = new Error(`${statusCode}: ${text || ''}`) as any
          err.statusCode = statusCode
          reject(err)

          return
        }

        if (!text) {
          resolve(null)

          return
        }

        const looksHtml = /^\s*<(?:!doctype|html)/i.test(text)
        const contentType = String(res.headers['content-type'] || res.headers['Content-Type'] || '')

        if (looksHtml || contentType.includes('text/html')) {
          reject(new Error(`Expected JSON from ${url} but got HTML (status ${statusCode}).`))

          return
        }

        try {
          resolve(JSON.parse(text))
        } catch {
          reject(new Error(`Invalid JSON from ${url} (status ${statusCode}): ${text.slice(0, 200)}`))
        }
      })
    })
    request.on('error', error => {
      if (timedOut) {
        return
      }

      clearTimeout(timer)
      reject(error)
    })

    if (body) {
      request.write(body)
    }

    request.end()
  })
}

export const _nativeTokens = new Map<string, NativeTokenSet>()

export function _nativeTokenStorePath() {
  // Co-located with the connection config under userData; one JSON file mapping
  // baseUrl → { encoding, value } safeStorage payloads.
  return path.join(app.getPath('userData'), 'native-oauth-tokens.json')
}

export function _nativeTokenStoreIo(): NativeTokenStoreIo {
  return {
    encrypt: encryptDesktopSecret,
    decrypt: decryptDesktopSecret,
    readStoreText: () => fs.readFileSync(_nativeTokenStorePath(), 'utf8'),
    writeStoreText: (text: string) => {
      fs.mkdirSync(path.dirname(_nativeTokenStorePath()), { recursive: true })
      fs.writeFileSync(_nativeTokenStorePath(), text, { mode: 0o600 })
    },
    rememberLog
  }
}

export function _persistNativeTokens(baseUrl: string, tokens: NativeTokenSet | null) {
  persistNativeTokenSet(baseUrl, tokens, _nativeTokenStoreIo())
}

export function _loadNativeTokens(baseUrl: string): NativeTokenSet | null {
  const cached = _nativeTokens.get(baseUrl)

  if (cached) {
    return cached
  }

  const tokens = loadNativeTokenSet(baseUrl, _nativeTokenStoreIo())

  if (tokens) {
    _nativeTokens.set(baseUrl, tokens)
  }

  return tokens
}

export function _storeNativeTokens(baseUrl: string, tokens: NativeTokenSet) {
  _nativeTokens.set(baseUrl, tokens)
  _persistNativeTokens(baseUrl, tokens)
}

export function _clearNativeTokens(baseUrl: string) {
  _nativeTokens.delete(baseUrl)
  _persistNativeTokens(baseUrl, null)
}

export function hasNativeSession(baseUrl: string): boolean {
  return _loadNativeTokens(baseUrl) !== null
}

export function postJsonNoAuth(url: string, body: unknown, opts: any = {}) {
  // resolveJsonBody passes the object through UNCHANGED — fetchJson owns
  // JSON.stringify. Pre-stringifying here double-encodes the body (a JSON
  // string inside a JSON string), which the gateway's Pydantic model rejects
  // with a 422 "Input should be a valid dictionary" (the native
  // /auth/native/token + /auth/native/refresh legs both go through here).
  return fetchJson(url, null, { method: 'POST', body: resolveJsonBody(body), ...opts })
}

export async function ensureNativeAccessToken(baseUrl: string): Promise<string | null> {
  const tokens = _loadNativeTokens(baseUrl)

  if (!tokens) {
    return null
  }

  if (!tokenNeedsRefresh(tokens, Math.floor(Date.now() / 1000))) {
    return tokens.accessToken
  }

  if (!tokens.refreshToken) {
    // Access token expired and no RT to rotate — force re-login.
    _clearNativeTokens(baseUrl)

    return null
  }

  try {
    const body = await postJsonNoAuth(
      nativeRefreshUrl(baseUrl),
      { refresh_token: tokens.refreshToken, provider: tokens.provider },
      { timeoutMs: 10_000 }
    )

    const rotated = parseTokenResponse(body)
    _storeNativeTokens(baseUrl, rotated)

    return rotated.accessToken
  } catch (error: any) {
    // A 401 means the RT is dead (session_expired) — drop tokens so the UI
    // prompts a fresh native login. A 503/transient keeps them for a retry.
    if (error && error.statusCode === 401) {
      _clearNativeTokens(baseUrl)

      return null
    }

    throw error
  }
}

export async function mintGatewayWsTicket(baseUrl, headers = {}) {
  return withTransientRetries(async () => {
    // Native flow: mint the ticket with the bearer token, no cookie involved.
    const nativeAt = await ensureNativeAccessToken(baseUrl).catch(() => null)

    if (nativeAt) {
      const body = (await fetchJson(`${baseUrl}/api/auth/ws-ticket`, null, {
        method: 'POST',
        timeoutMs: 8_000,
        bearer: nativeAt,
        headers
      })) as any

      const ticket = body?.ticket

      if (!ticket || typeof ticket !== 'string') {
        throw new Error('Gateway did not return a WS ticket.')
      }

      return ticket
    }

    const body = (await fetchJsonViaOauthSession(`${baseUrl}/api/auth/ws-ticket`, {
      method: 'POST',
      timeoutMs: 8_000,
      headers
    })) as any

    const ticket = body?.ticket

    if (!ticket || typeof ticket !== 'string') {
      throw new Error('Gateway did not return a WS ticket.')
    }

    return ticket
  })
}

export const SECRET_STORAGE_POLICY_PATH = path.join(app.getPath('userData'), SECRET_STORAGE_POLICY_FILE)

export const _secretStoragePolicyIo = {
  readText: () => fs.readFileSync(SECRET_STORAGE_POLICY_PATH, 'utf8'),
  writeText: (text: string) => writeSecretFileAtomic(SECRET_STORAGE_POLICY_PATH, text, { encoding: 'utf8' })
}

export let _secretStoragePolicy: SecretStoragePolicy | null = null

export function secretStoragePolicy(): SecretStoragePolicy {
  if (!_secretStoragePolicy) {
    _secretStoragePolicy = readSecretStoragePolicy(_secretStoragePolicyIo)
  }

  return _secretStoragePolicy
}

export function encryptDesktopSecret(value, options = {}) {
  if (!secretStoragePolicy().on) {
    const raw = String(value || '')

    return raw ? { encoding: 'plain', value: raw } : null
  }

  return encryptDesktopSecretStrict(value, safeStorage, options)
}

export function decryptDesktopSecret(secret) {
  if (!secret || typeof secret !== 'object') {
    return ''
  }

  const value = String(secret.value || '')

  if (!value) {
    return ''
  }

  if (secret.encoding === SAFE_STORAGE_ENCODING) {
    // Legacy blob under an opted-out policy: once the one-shot migration pass
    // has run, never touch safeStorage again — a dead keychain would otherwise
    // prompt on every read. Before that pass, decryption is allowed so the
    // migration itself (and this launch's reads) can recover the value.
    if (classifyStoredSecret(secret, secretStoragePolicy()) === 'drop') {
      return ''
    }

    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      return ''
    }
  }

  // Any other encoding (a hand-edited config, or one written by a pre-release
  // build) is returned verbatim on purpose: this fallback is what lets such a
  // config connect at all. Not a plaintext-writing path — nothing in this file
  // persists a token this way.
  return value
}

export function decryptRemoteHeaders(headers) {
  const normalized = normalizeRemoteHeaders(headers)
  const out = {}

  for (const [name, secret] of Object.entries(normalized)) {
    const value = decryptDesktopSecret(secret)

    if (value) {
      out[name] = value
    }
  }

  return out
}

export function rememberRemoteWsHeaders(wsUrl, headers = {}) {
  remoteWsHeaderStore.remember(wsUrl, headers)
}

export function sanitizeConnectionProfiles(raw: Record<string, any>) {
  if (!raw || typeof raw !== 'object') {
    return {}
  }

  const out = {}

  for (const [name, entry] of Object.entries(raw)) {
    if (!entry || typeof entry !== 'object') {
      continue
    }

    if (name !== 'default' && !PROFILE_NAME_RE.test(name)) {
      continue
    }

    if (entry.mode === 'ssh') {
      const ssh = normalizeSshConfig(entry)

      if (ssh) {
        if (entry.token && typeof entry.token === 'object') {
          ssh.token = entry.token
        }

        out[name] = ssh
      }

      continue
    }

    const cleaned: {
      mode: 'remote' | 'local' | 'cloud'
      url?: string
      authMode?: string
      token?: object
      headers?: object
      org?: string
      name?: string
      savedSsh?: object
    } = {
      mode: modeIsRemoteLike(entry.mode) ? entry.mode : 'local'
    }

    if (cleaned.mode === 'local') {
      const savedSsh = normalizeSshConfig(entry.savedSsh)

      if (savedSsh) {
        cleaned.savedSsh = savedSsh
      }
    }

    const url = String(entry.url || '').trim()

    if (url) {
      cleaned.url = url
    }

    cleaned.authMode = normAuthMode(entry.authMode)

    if ((entry as any).token && typeof entry.token === 'object') {
      cleaned.token = entry.token
    }

    const headers = normalizeRemoteHeaders((entry as any).headers)

    if (Object.keys(headers).length > 0) {
      cleaned.headers = headers
    }

    // Preserve the Hermes Cloud org tag on cloud-mode entries so Settings can
    // reopen into the same org for a per-profile cloud connection.
    if (cleaned.mode === 'cloud') {
      const cloudName = String(entry.name || '').trim()

      if (cloudName) {
        cleaned.name = cloudName
      }

      const org = String(entry.org || '').trim()

      if (org) {
        cleaned.org = org
      }
    }

    out[name] = cleaned
  }

  return out
}

export function readDesktopConnectionConfig() {
  // Check if file changed on disk since last read (e.g. modified by another
  // process or an external tool).  Our own writes update the cache inline
  // via writeDesktopConnectionConfig, but external changes would be missed.
  let mtime = null

  try {
    mtime = fs.statSync(DESKTOP_CONNECTION_CONFIG_PATH).mtimeMs
  } catch {
    mtime = null
  }

  if (connectionConfigCache && connectionConfigCacheMtime === mtime) {
    return connectionConfigCache
  }

  let config = { mode: 'local', remote: {}, profiles: {} }

  try {
    const raw = fs.readFileSync(DESKTOP_CONNECTION_CONFIG_PATH, 'utf8')
    // Tighten an install written before this file was owner-only. Every write
    // now goes out at 0600, but a file already on disk keeps its old 0644 bits
    // until something chmods it, and waiting for the user's next Settings save
    // would leave it group/other-readable indefinitely. Runs on a cache miss
    // only (once per launch, plus after an external edit); chmod moves ctime,
    // not mtime, so it cannot invalidate the cache it sits inside.
    //
    // Deliberately BEFORE JSON.parse, not after: a truncated or hand-mangled
    // connection.json still contains the token bytes, and parse throws into the
    // catch below, which swallows the error and falls back to local mode. With
    // the tighten after the parse, exactly the file that is both corrupt AND
    // world-readable would be the one file never tightened — and nothing would
    // ever retry it, because the fallback config is not written back. The chmod
    // needs only the path, so it has no reason to wait for valid JSON.
    tightenSecretFileMode(DESKTOP_CONNECTION_CONFIG_PATH)

    const parsed = JSON.parse(raw)

    // NOT done here: migrating a legacy non-safeStorage token payload to
    // ciphertext at rest. Deferred deliberately — it has to honor the opt-in
    // plaintext choice PR #62319 adds (re-encrypting it converts a portable
    // credential into a keychain-bound one and can lose the token), write
    // through sanitizeConnectionProfiles below rather than persisting raw
    // `parsed`, and tell the user to ROTATE, since every existing backup copy
    // still holds the old secret. Do not add it without those three.

    if (parsed && typeof parsed === 'object') {
      const remote = parsed.remote && typeof parsed.remote === 'object' ? parsed.remote : {}
      // authMode lives on the remote sub-object: 'oauth' (cookie + ws-ticket)
      // or 'token' (legacy static session token). Default to 'token' for
      // backward compatibility with configs written before OAuth support.
      remote.authMode = remote.authMode === 'oauth' ? 'oauth' : 'token'
      config = {
        mode: parsed.mode === 'ssh' ? 'ssh' : modeIsRemoteLike(parsed.mode) ? parsed.mode : 'local',
        remote,
        // Per-profile remote overrides: each profile may point at its own
        // backend (local spawn or its own remote URL). Preserved verbatim so
        // profileRemoteOverride() can resolve them; normalized lazily on save.
        profiles: sanitizeConnectionProfiles(parsed.profiles)
      }
    }
  } catch {
    // Missing or malformed connection settings should fall back to local.
  }

  connectionConfigCache = config
  connectionConfigCacheMtime = mtime

  return config
}

export function writeDesktopConnectionConfig(config) {
  fs.mkdirSync(path.dirname(DESKTOP_CONNECTION_CONFIG_PATH), { recursive: true })
  // Owner-only, not writeFileAtomic: this is the single choke point for every
  // connection.json write (the IPC save/apply handlers and
  // persistSshConnectionToken all land here), and the file carries the
  // safeStorage-encrypted gateway token plus its URL and SSH host/user/keyPath.
  // safeStorage keeps the token opaque; 0600 keeps the whole record — and the
  // fields that are NOT encrypted — off other local accounts, matching
  // native-oauth-tokens.json and desktop-installation.json.
  writeSecretFileAtomic(DESKTOP_CONNECTION_CONFIG_PATH, JSON.stringify(config, null, 2))
  connectionConfigCache = config
  connectionConfigCacheMtime = fs.statSync(DESKTOP_CONNECTION_CONFIG_PATH).mtimeMs
}

export function readDesktopConnectionsRegistry() {
  let mtime = null

  try {
    mtime = fs.statSync(DESKTOP_CONNECTIONS_REGISTRY_PATH).mtimeMs
  } catch {
    mtime = null
  }

  if (connectionRegistryCache && connectionRegistryCacheMtime === mtime) {
    return connectionRegistryCache
  }

  let registry

  if (mtime === null) {
    // First run on this build: import the v1 single-connection config. The v1
    // file is NOT modified or deleted — older builds keep reading it. The
    // migration is deterministic over the v1 input, so even if two processes
    // race the first run (updater relaunch, second window), both derive the
    // same registry and the later atomic write is a no-op content-wise.
    registry = migrateV1ToRegistry(readDesktopConnectionConfig())

    try {
      writeDesktopConnectionsRegistry(registry)
    } catch {
      // Write failed (full disk, read-only userData). Keep the migrated
      // registry in memory so list/save keep working this session instead of
      // hard-failing every hermes:connections:* call.
      connectionRegistryCache = registry
      connectionRegistryCacheMtime = null
    }

    return connectionRegistryCache
  }

  try {
    // Same rationale as connection.json: tighten BEFORE parse so a corrupt
    // file that still holds token bytes gets its mode fixed anyway.
    tightenSecretFileMode(DESKTOP_CONNECTIONS_REGISTRY_PATH)
    registry = normalizeRegistry(JSON.parse(fs.readFileSync(DESKTOP_CONNECTIONS_REGISTRY_PATH, 'utf8')))
  } catch {
    // Whole-file corruption (truncated write, mangled hand-edit). The
    // degraded local-only registry keeps boot working, but the file BYTES are
    // the user's connection data — preserve them in a sidecar BEFORE any
    // later write (drift reconcile, connection save) overwrites the file
    // (#94246: recovery must never be data loss).
    preserveCorruptRegistrySidecar()
    registry = normalizeRegistry(null)
  }

  if (registry?.quarantined?.length) {
    rememberLog(
      `[connections] ${registry.quarantined.length} malformed registry entr${registry.quarantined.length === 1 ? 'y was' : 'ies were'} quarantined (kept under "quarantined" in connections.json); healthy connections loaded normally.`
    )
  }

  // Heal v1 -> v2 drift: the v1 global route names a remote this registry has
  // never heard of, so the live descriptor resolves to no connectionId and the
  // launch pick sends the window somewhere else. Persist so the repair is a
  // one-time event rather than a recomputation on every read; a failed write
  // still returns the healed registry for this session.
  const reconciled = reconcileRegistryDrift(registry, readDesktopConnectionConfig())

  if (reconciled.changed) {
    registry = reconciled.registry

    try {
      writeDesktopConnectionsRegistry(registry)

      return connectionRegistryCache
    } catch {
      connectionRegistryCache = registry
      connectionRegistryCacheMtime = null

      return registry
    }
  }

  connectionRegistryCache = registry
  connectionRegistryCacheMtime = mtime

  return registry
}

export function preserveCorruptRegistrySidecar() {
  try {
    const rawText = fs.readFileSync(DESKTOP_CONNECTIONS_REGISTRY_PATH, 'utf8')

    if (!rawText.trim()) {
      return
    }

    const sidecar = `${DESKTOP_CONNECTIONS_REGISTRY_PATH}.corrupt-${new Date().toISOString().replace(/[:.]/g, '-')}`

    if (!fs.existsSync(sidecar)) {
      fs.writeFileSync(sidecar, rawText, { mode: 0o600 })
    }

    rememberLog(
      `[connections] connections.json could not be parsed; preserved the original file at ${sidecar} and continuing with a local-only registry. No connection data was deleted.`
    )
  } catch {
    // The read itself failed (missing file, permissions) — nothing to save.
  }
}

export function writeDesktopConnectionsRegistry(registry) {
  fs.mkdirSync(path.dirname(DESKTOP_CONNECTIONS_REGISTRY_PATH), { recursive: true })
  // Owner-only for the same reason as connection.json: entries carry
  // safeStorage-encrypted tokens plus URLs and SSH host/user/keyPath.
  writeSecretFileAtomic(DESKTOP_CONNECTIONS_REGISTRY_PATH, JSON.stringify(registry, null, 2))
  connectionRegistryCache = registry
  connectionRegistryCacheMtime = fs.statSync(DESKTOP_CONNECTIONS_REGISTRY_PATH).mtimeMs
}

export function readActiveDesktopProfile() {
  try {
    const raw = fs.readFileSync(DESKTOP_PROFILE_CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const name = parsed && typeof parsed.profile === 'string' ? parsed.profile.trim() : ''

    if (name && (name === 'default' || PROFILE_NAME_RE.test(name))) {
      return name
    }
  } catch {
    // Missing or malformed → no preference.
  }

  return null
}

export function writeActiveDesktopProfile(name) {
  const value = typeof name === 'string' ? name.trim() : ''

  if (value && value !== 'default' && !PROFILE_NAME_RE.test(value)) {
    throw new Error(`Invalid profile name: ${value}`)
  }

  fs.mkdirSync(path.dirname(DESKTOP_PROFILE_CONFIG_PATH), { recursive: true })
  writeFileAtomic(DESKTOP_PROFILE_CONFIG_PATH, JSON.stringify({ profile: value || null }, null, 2))

  return value || null
}

export function isHermesProcess(pid) {
  try {
    process.kill(pid, 0) // signal 0 = existence check, no signal sent
  } catch {
    return false
  }

  // On macOS / Linux, check the command line to avoid PID recycling false positives.
  try {
    const cmdline = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')

    return cmdline.includes('hermes')
  } catch {
    // /proc not available (macOS) — fall back to ps. Use -o args= to inspect
    // the full command line, not just the process name.  -o comm= would return
    // "python3" for any Python process, creating false positives.
    try {
      const { execSync } = require('child_process')
      const out = execSync(`ps -p ${pid} -o args=`, { encoding: 'utf8', timeout: 2000 })

      return out.includes('hermes')
    } catch {
      return false
    }
  }
}

export function migrateActiveProfileIfMissing() {
  migrateActiveProfileIfMissingPure(DESKTOP_PROFILE_CONFIG_PATH, {
    legacyActivePath: path.join(HERMES_HOME, 'active_profile'),
    hermesHome: HERMES_HOME,
    profilesRoot: path.join(HERMES_HOME, 'profiles'),
    existsSync: p => fs.existsSync(p),
    readFileSync: (p, enc) => fs.readFileSync(p, enc),
    statSync: p => fs.statSync(p),
    readdirSync: (p, opts) => fs.readdirSync(p, opts as { withFileTypes: true }),
    isHermesProcess,
    now: () => Date.now(),
    writeJson: (target, decision) => {
      // Mirror writeActiveDesktopProfile's atomic-write + parent-dir-create
      // semantics so the migration produces a file indistinguishable from a
      // user-driven profile switch.
      fs.mkdirSync(path.dirname(target), { recursive: true })
      writeFileAtomic(target, JSON.stringify(decision, null, 2))
    },
    isValidProfileName: p => PROFILE_NAME_RE.test(p)
  })
}

export async function buildRemoteConnection(
  rawUrl,
  authMode,
  token,
  source,
  remoteHost?,
  remoteKind = 'url',
  remoteIdentity?,
  headers?
) {
  const baseUrl = normalizeRemoteBaseUrl(rawUrl)
  const remoteHeaders = decryptRemoteHeaders(headers)
  // For token/oauth remotes the meaningful host is the real backend URL; for
  // SSH remotes the caller passes the entered/resolved host explicitly (the
  // baseUrl is a 127.0.0.1 tunnel and would be useless in the pill).
  const host = remoteHost || hostLabelFromBaseUrl(baseUrl)

  if (authMode === 'oauth') {
    // OAuth gateway: auth comes from EITHER a native bearer token (cookieless
    // RFC 8252 flow) OR the session cookies in the OAuth partition. Liveness is
    // NOT "is the access-token cookie present?" — Portal issues a 24h rotating
    // refresh token (hermes #37247), and the gateway middleware transparently
    // rotates a fresh ~15-min access token from it on the next authenticated
    // request. So a session with an expired AT cookie but a live RT cookie is
    // still perfectly connectable. We early-out only when NEITHER a native
    // token NOR any cookie is present, then mint a ws-ticket (which itself
    // prefers the native bearer) as the authoritative liveness check.
    //
    // The native-token check is essential: the native login stores bearer
    // tokens (no cookie is ever set), so gating solely on hasLiveOauthSession
    // here would reject a freshly-completed native sign-in and loop the UI back
    // into "not signed in" even though mintGatewayWsTicket would succeed with
    // the stored bearer.
    if (
      !oauthSessionIsLive(hasNativeSession(baseUrl), await hasLiveOauthSession(baseUrl)) &&
      oauthGuardMayHardFail(await gatewayAuthProviders(baseUrl, remoteHeaders))
    ) {
      throw makeUnsignedOauthError()
    }

    let ticket

    try {
      ticket = await mintGatewayWsTicket(baseUrl, remoteHeaders)
    } catch (error) {
      // For a Nous-managed Cloud agent, a 502/503/504 from the WS-ticket mint
      // means the backend server itself is down — the actionable Cloud-down
      // error. This boundary runs BEFORE the readiness loop, so without this
      // the ticket wrapper below would swallow the server-fault classification
      // and the renderer would never see isCloudBackendDown. Preserve the
      // existing 401/403 reauth and generic transport behavior for everything
      // else (#85335).
      const cloudError = makeNousCloudBackendDownError(baseUrl, error)

      if (cloudError !== null) {
        throw cloudError
      }

      throw gatewayTicketFailure(
        error,
        oauthTicketFailureAuthMessage(hasNativeSession(baseUrl)),
        'Could not reach the remote Hermes gateway while refreshing its WebSocket ticket. Try reconnecting.'
      )
    }

    const wsUrl = buildGatewayWsUrlWithTicket(baseUrl, ticket)

    rememberRemoteWsHeaders(wsUrl, remoteHeaders)

    return {
      baseUrl,
      mode: 'remote',
      source,
      authMode: 'oauth',
      remoteHost: host || undefined,
      remoteIdentity,
      remoteKind,
      headers: remoteHeaders,
      // No static token in OAuth mode; REST is cookie-authed via the partition.
      token: null,
      wsUrl
    }
  }

  if (!token) {
    throw new Error(
      'Remote Hermes gateway is selected, but no session token is saved. ' +
        'Open Settings → Gateway and save a token, or switch back to Local.'
    )
  }

  const wsUrl = buildGatewayWsUrl(baseUrl, token)

  rememberRemoteWsHeaders(wsUrl, remoteHeaders)

  return {
    baseUrl,
    mode: 'remote',
    source,
    authMode: 'token',
    remoteHost: host || undefined,
    remoteIdentity,
    remoteKind,
    headers: remoteHeaders,
    token,
    wsUrl
  }
}

export const sshConnections = new Map<string, any>()

export const desktopInstallationId = loadOrCreateInstallationId(DESKTOP_INSTALLATION_PATH)

export const managedConnectionUpdateGate = new ManagedConnectionUpdateGate(
  connectionId =>
    readManagedSshRecoveryRecords().find(record => record.connectionId === connectionId)?.correlationId || null
)

export const managedPrimaryRestoreOwners = new Map<string, { correlationId: string; profile: string; source: any }>()

export function readManagedSshRecoveryRecords(): any[] {
  try {
    const stat = fs.lstatSync(DESKTOP_MANAGED_SSH_RECOVERY_PATH)

    if (!stat.isFile() || stat.isSymbolicLink() || !tightenSecretFileMode(DESKTOP_MANAGED_SSH_RECOVERY_PATH)) {
      throw new Error('Managed SSH recovery journal is not a safe owner-only file.')
    }

    const payload = JSON.parse(fs.readFileSync(DESKTOP_MANAGED_SSH_RECOVERY_PATH, 'utf8'))

    if (payload?.version !== 1 || !Array.isArray(payload.records)) {
      throw new Error('Managed SSH recovery journal has an unsupported shape.')
    }

    const valid = payload.records.every(record => {
      if (
        !record ||
        typeof record !== 'object' ||
        typeof record.connectionId !== 'string' ||
        record.source?.kind !== 'ssh' ||
        record.source?.id !== record.connectionId ||
        !['prepared', 'launching'].includes(record.phase) ||
        !Array.isArray(record.scopes) ||
        record.scopes.length > 256
      ) {
        return false
      }

      try {
        validateCorrelationId(record.correlationId)
      } catch {
        return false
      }

      const scopesValid = record.scopes.every(
        scope =>
          scope &&
          typeof scope === 'object' &&
          typeof scope.key === 'string' &&
          scope.key.length <= 256 &&
          typeof scope.profile === 'string' &&
          scope.profile.length > 0 &&
          scope.profile.length <= 128 &&
          ['legacy', 'primary', 'registry'].includes(scope.kind) &&
          (scope.kind === 'primary' || scope.key.length > 0)
      )

      const identities = record.scopes.map(scope => `${scope.kind}\0${scope.key}\0${scope.profile}`)

      return (
        scopesValid &&
        new Set(identities).size === identities.length &&
        record.scopes.filter(scope => scope.kind === 'primary').length <= 1
      )
    })

    if (!valid) {
      throw new Error('Managed SSH recovery journal contains an invalid record.')
    }

    return payload.records
  } catch (cause: any) {
    if (cause?.code === 'ENOENT') {
      return []
    }

    const error: any = new Error(
      'Managed SSH recovery state is unreadable or malformed; refusing connection startup and edits.'
    )

    error.code = 'managed-update-recovery-unavailable'
    error.cause = cause
    throw error
  }
}

export const sshBootstrapCoordinator = createBootstrapCoordinator()

export function sshScopeKey(profile) {
  return connectionScopeKey(profile) || ''
}

export function sshOwnershipKey(profile) {
  return sshOwnershipId(desktopInstallationId, sshScopeKey(profile))
}

export function sshRememberLog(chunk) {
  rememberLog(redactSecrets(String(chunk == null ? '' : chunk)))
}

export async function sshProbeReuseProof(baseUrl, token, spawnNonce) {
  try {
    const proof: any = await fetchJson(`${baseUrl}/api/ssh/ownership`, token)

    return remoteLifecycle.classifySshReuseProof(proof, spawnNonce)
  } catch (error: any) {
    if (/^(401|403|404):/.test(String(error?.message || ''))) {
      return 'authenticated-stale'
    }

    throw error
  }
}

export async function teardownSshConnection(profile) {
  const scope = sshScopeKey(profile)
  const state = sshConnections.get(scope)

  if (!state) {
    return
  }

  sshConnections.delete(scope)

  terminalIpc.disposeTerminalSessionsForSshScope(scope)

  // Kill the owned remote serve --isolated *before* closing the SSH
  // transport. Spawn detaches with setsid/nohup, so closing the tunnel
  // alone leaves the backend at pid 1 holding state.db (#91668).
  // Windows remotes use a different lifecycle (connectWindowsRemote) and
  // are left to a follow-up; POSIX is the leak that OOM'd gateways.
  await teardownSshState(
    {
      ...state,
      ownershipId: state.ownershipId || sshOwnershipKey(profile)
    },
    {
      cleanupRemote:
        state.remotePlatform === 'Windows'
          ? async () => {
              // connectWindowsRemote does not share POSIX lock/kill. Stay
              // silent on the kill path, but leave a log so quit is not a
              // mysterious no-op on Windows remotes.
              sshRememberLog('[ssh] skip remote serve teardown on Windows remotes; POSIX disconnect does not apply')
            }
          : remoteLifecycle.disconnect
    }
  )
}

export function activeSshTerminalTarget(webContentsId?: number) {
  const windowRoute = typeof webContentsId === 'number' ? windowConnectionRoutes.get(webContentsId) : null

  if (windowRoute?.registryScoped && windowRoute.connectionId) {
    const scope = registrySshScopeForWindowRoute(windowRoute, readDesktopConnectionsRegistry())

    if (!scope) {
      return null
    }

    const state = sshConnections.get(scope)

    if (state && state.ssh) {
      return { ssh: state.ssh, scope }
    }

    // The pool's single writer publishes under the per-profile bootstrap key
    // while stamping the entry with its registry connection id (#97345), so a
    // composite-key miss must still resolve the live tunnel by that identity
    // instead of reporting 'pending' forever.
    const pooledScope = registrySshPoolScopeByConnectionId(sshConnections, windowRoute.connectionId)
    const pooledState = pooledScope === null ? null : sshConnections.get(pooledScope)

    return pooledState && pooledState.ssh ? { ssh: pooledState.ssh, scope: pooledScope } : 'pending'
  }

  const profile = windowRoute?.profile ?? primaryProfileKey()
  const config = readDesktopConnectionConfig()

  const route = resolveDesktopRemoteRoute({
    config,
    env: {
      token: process.env.HERMES_DESKTOP_REMOTE_TOKEN,
      url: process.env.HERMES_DESKTOP_REMOTE_URL
    },
    profile,
    registry: readDesktopConnectionsRegistry()
  })

  if (!route || route.kind !== 'ssh') {
    return null
  }

  const scope = v1SshTerminalPoolKey(route, profile)

  const state = sshConnections.get(scope)

  return state && state.ssh ? { ssh: state.ssh, scope } : 'pending'
}

export async function ensureTerminalBackend(webContentsId: number) {
  const windowRoute = windowConnectionRoutes.get(webContentsId)

  // Claim-guarded (#90812): opening a terminal pane can race a renderer's own
  // reconnect dial for the same (connectionId, profile) scope; coalescing
  // here avoids bootstrapping a second SSH tunnel / remote dashboard.
  if (windowRoute?.registryScoped && windowRoute.connectionId) {
    return backendDialClaims.run(backendScopeKey(windowRoute.connectionId, windowRoute.profile), () =>
      ensureRegistryBackend(windowRoute.connectionId, windowRoute.profile)
    )
  }

  const profile = windowRoute?.profile ?? primaryProfileKey()

  return backendDialClaims.run(backendScopeKey(null, profile), () => ensureBackend(profile))
}

export async function effectiveSshConfigFingerprint(sshConfig) {
  const ssh =
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe')
      : 'ssh'

  const args = ['-G']

  if (sshConfig.port) {
    args.push('-p', String(sshConfig.port))
  }

  if (sshConfig.keyPath) {
    args.push('-i', sshConfig.keyPath)
  }

  args.push('--', sshConfig.user ? `${sshConfig.user}@${sshConfig.host}` : sshConfig.host)
  const output = await execText(ssh, args, { timeout: 10_000 })

  return crypto.createHash('sha256').update(output).digest('hex')
}

export async function bootstrapSshConnection(
  profile,
  sshConfig,
  reuseToken,
  source,
  resolvedEffectiveFingerprint?,
  metadata: any = {}
) {
  const scope = sshScopeKey(profile)
  const effectiveConfigFingerprint = resolvedEffectiveFingerprint || (await effectiveSshConfigFingerprint(sshConfig))
  const resolvedConfig = { ...sshConfig, effectiveConfigFingerprint }
  const fingerprint = sshConfigFingerprint(scope, resolvedConfig)

  return sshBootstrapCoordinator.start(
    scope,
    fingerprint,
    lease => bootstrapSshConnectionInner(profile, resolvedConfig, reuseToken, source, metadata, fingerprint, lease),
    metadata
  )
}

export async function rollbackSshBootstrapResult(ssh, result, profile, sshConfig, boundaryError) {
  const cleanupErrors: string[] = []
  const scope = sshScopeKey(profile)

  try {
    const expected = {
      ownershipId: result.ownershipId,
      pid: result.pid,
      spawnNonce: result.spawnNonce,
      profile: resolveRemoteSshDashboardProfile(sshConfig.remoteProfile, profile),
      hermesPath: result.hermesPath,
      hermesHome: result.hermesHome,
      startedAt: result.startedAt,
      creationTimeNs: result.creationTimeNs,
      creationTime: result.creationTime
    }

    if (result.platform?.os === 'Windows') {
      await terminateOwnedWindowsDashboardForUpdate(
        ssh,
        { hermesPath: result.hermesPath, hermesHome: result.hermesHome, python: result.pythonPath },
        expected
      )
    } else if (result.platform?.os === 'Linux' || result.platform?.os === 'Darwin') {
      await remoteLifecycle.terminateOwnedDashboardForUpdate(ssh, expected)
    } else {
      cleanupErrors.push(`unsupported remote platform ${result.platform?.os || 'unknown'}`)
    }
  } catch (error: any) {
    cleanupErrors.push(String(error?.message || error))
  }

  try {
    await ssh.cancelForward(result.localPort, result.remotePort)
  } catch (error: any) {
    cleanupErrors.push(String(error?.message || error))
  }

  try {
    await ssh.close()
  } catch (error: any) {
    cleanupErrors.push(String(error?.message || error))
  }

  if (sshConnections.get(scope)?.ssh === ssh) {
    sshConnections.delete(scope)
  }

  if (cleanupErrors.length > 0) {
    const unsafe: any = new Error(
      `An SSH bootstrap crossed the managed-update gate and its exact owned serve could not be fenced: ${cleanupErrors.join('; ')}`
    )

    unsafe.code = 'managed-update-bootstrap-fence-failed'
    unsafe.unsafeManagedBootstrap = true
    unsafe.cause = boundaryError
    throw unsafe
  }
}

export async function bootstrapSshConnectionInner(profile, sshConfig, reuseToken, source, metadata, fingerprint, lease) {
  const scope = sshScopeKey(profile)
  const hostLabel = sshConfig.user ? `${sshConfig.user}@${sshConfig.host}` : sshConfig.host
  const existing = sshConnections.get(scope)

  if (existing && existing.fingerprint !== fingerprint) {
    await teardownSshConnection(profile)
  }

  let ssh = sshConnections.get(scope)?.ssh

  if (ssh && !(await ssh.isAlive())) {
    try {
      await ssh.close()
    } catch {
      void 0
    }

    ssh = null
    sshConnections.delete(scope)
  }

  const created = !ssh

  let removeForceCleanup = () => {}

  if (created) {
    ssh = new SshConnection(
      { host: sshConfig.host, user: sshConfig.user, port: sshConfig.port, keyPath: sshConfig.keyPath },
      {
        rememberLog: sshRememberLog,
        ownershipId: sshOwnershipKey(profile),
        scope,
        effectiveConfigFingerprint: sshConfig.effectiveConfigFingerprint
      }
    )
    removeForceCleanup = lease.onForceCleanup(() => ssh.close())
    await ssh.open({ signal: lease.signal })
  }

  let result: any

  try {
    if (metadata.registryConnectionId) {
      managedConnectionUpdateGate.assertCanDial(metadata.registryConnectionId, metadata.managedUpdateCorrelation || '')
    }

    const platform = await detectRemotePlatform(ssh, sshConfig.remoteHermesPath || '')
    const lifecycle = platform.os === 'Windows' ? connectWindowsRemote : remoteLifecycle.connect
    result = await lifecycle({
      ssh,
      platform,
      profile: resolveRemoteSshDashboardProfile(sshConfig.remoteProfile, profile),
      remoteHermesPath: sshConfig.remoteHermesPath || '',
      ownershipId: sshOwnershipKey(profile),
      reuseToken: reuseToken || '',
      forward: (localPort, remotePort) => ssh.forward(localPort, remotePort),
      cancelForward: (localPort, remotePort) => ssh.cancelForward(localPort, remotePort),
      pickLocalPort,
      waitForHermes: (baseUrl, token) => waitForHermes(baseUrl, token, lease.signal, 'token'),
      probeReuseProof: sshProbeReuseProof,
      adoptServedToken: adoptServedDashboardToken,
      rememberLog: sshRememberLog,
      signal: lease.signal
    })
  } catch (error: any) {
    if (created) {
      try {
        await ssh.close()
      } catch {
        void 0
      }
    } else {
      // The cached master was reused but the lifecycle probe against it
      // failed ("Could not verify the existing SSH backend"). Keeping the
      // stale entry means every subsequent boot re-attempts through the same
      // wedged master/tunnel and fails identically until the user re-enters
      // the connection details (whose changed fingerprint forces a teardown).
      // Tear it down now so the next attempt — automatic retry included —
      // bootstraps a fresh master, which is exactly what manual re-entry
      // did (#82679).
      try {
        await teardownSshConnection(profile)
      } catch {
        void 0
      }
    }

    const err = new Error(error.message) as any
    err.sshError = error.kind || 'unknown'
    err.isSshBootstrap = true
    throw err
  }

  try {
    lease.assertCurrent()
  } catch (error) {
    await rollbackSshBootstrapResult(ssh, result, profile, sshConfig, error)
    throw error
  }

  await fenceManagedSshBootstrapPublication({
    assertCanPublish: () => {
      if (metadata.registryConnectionId) {
        managedConnectionUpdateGate.assertCanDial(
          metadata.registryConnectionId,
          metadata.managedUpdateCorrelation || ''
        )
      }
    },
    publish: () => {
      persistSshConnectionToken(profile, source, result.token, metadata.registryConnectionId)
      removeForceCleanup()
      sshConnections.set(scope, {
        ssh,
        fingerprint,
        ownershipId: result.ownershipId || sshOwnershipKey(profile),
        localPort: result.localPort,
        remotePort: result.remotePort,
        pid: result.pid,
        host: sshConfig.host,
        hostLabel,
        hermesVersion: result.hermesVersion || '',
        remotePlatform: result.platform?.os || '',
        reused: result.reused,
        spawnNonce: result.spawnNonce,
        creationTimeNs: result.creationTimeNs,
        creationTime: result.creationTime,
        startedAt: result.startedAt,
        hermesPath: result.hermesPath,
        hermesHome: result.hermesHome,
        pythonPath: result.pythonPath,
        remoteProfile: resolveRemoteSshDashboardProfile(sshConfig.remoteProfile, profile),
        registryConnectionId:
          metadata.registryConnectionId ||
          (typeof source === 'string' && source.startsWith('registry:') ? source.slice('registry:'.length) : ''),
        // Never infer primary ownership from a non-composite scope key: legacy
        // per-profile pools also use bare keys. Only startHermes' explicit call
        // site may label a registry-qualified SSH scope as the primary backend.
        primaryRegistryScope: metadata.primaryRegistryScope === true
      })
    },
    rollback: error => rollbackSshBootstrapResult(ssh, result, profile, sshConfig, error)
  })

  sshRememberLog(
    `[ssh] connection ${result.reused ? 'REUSED' : 'spawned'} dashboard: ` +
      `${result.hermesVersion || 'hermes (version unknown)'} at ${result.hermesPath || '?'}`
  )

  const connection = await buildRemoteConnection(
    result.baseUrl,
    'token',
    result.token,
    source,
    hostLabel,
    'ssh',
    result.ownershipId
  )

  return {
    ...connection,
    remoteHermesVersion: result.hermesVersion || '',
    ssh: {
      effectiveConfigFingerprint: sshConfig.effectiveConfigFingerprint,
      host: sshConfig.host,
      keyPath: sshConfig.keyPath,
      port: sshConfig.port,
      remoteHermesPath: sshConfig.remoteHermesPath,
      remoteProfile: sshConfig.remoteProfile,
      user: sshConfig.user
    }
  }
}

export function persistSshConnectionToken(profile, source, token, registryConnectionId = '') {
  try {
    const persistence = managedSshTokenPersistencePlan(source, registryConnectionId)
    const id = persistence.registryConnectionId
    const encrypted = encryptDesktopSecret(token)

    // A primary legacy route can also be qualified with a stable registry id.
    // Mirror the adopted per-serve token to both stores so the next primary
    // launch and a later registry-scoped launch reuse the same owned process.
    if (id) {
      const registry = readDesktopConnectionsRegistry()
      const entry = registry.connections.find(c => c.id === id)

      if (entry && entry.kind === 'ssh') {
        writeDesktopConnectionsRegistry(upsertConnection(registry, { ...entry, token: encrypted }))
      }
    }

    if (!persistence.legacySource) {
      return
    }

    const config = readDesktopConnectionConfig()

    if (persistence.legacySource === 'profile') {
      const key = connectionScopeKey(profile)

      if (key && config.profiles?.[key]?.mode === 'ssh') {
        config.profiles[key].token = encrypted
        writeDesktopConnectionConfig(config)
      }
    } else if (config.mode === 'ssh' && config.remote) {
      config.remote.token = encrypted
      writeDesktopConnectionConfig(config)
    }
  } catch (error: any) {
    sshRememberLog(`[ssh] could not persist served token: ${error.message}`)
  }
}

export async function resolveRemoteBackend(profile, options: { poolKey?: string; primary?: boolean } = {}) {
  const profileKey = String(profile || '').trim() || 'default'

  const managedPrimary = options.primary
    ? [...managedPrimaryRestoreOwners.values()].find(owner => owner.profile === profileKey)
    : null

  if (managedPrimary) {
    // A managed update is restoring the primary: dial the exact connection
    // snapshot the transaction captured, not whatever routing says now.
    const source = managedPrimary.source
    const sshConfig = managedSshConfig(source, profileKey)

    if (!sshConfig) {
      throw new Error(`SSH connection "${source.label}" has no host configured.`)
    }

    managedConnectionUpdateGate.assertCanDial(source.id, managedPrimary.correlationId)

    const currentRoute = resolveDesktopRemoteRoute({
      config: readDesktopConnectionConfig(),
      env: {
        token: process.env.HERMES_DESKTOP_REMOTE_TOKEN,
        url: process.env.HERMES_DESKTOP_REMOTE_URL
      },
      profile: profileKey,
      registry: readDesktopConnectionsRegistry()
    })

    const persistenceSource =
      currentRoute?.kind === 'ssh' && currentRoute.connectionId === source.id
        ? currentRoute.source
        : `registry:${source.id}`

    const connection = await bootstrapSshConnection(
      persistenceSource === 'profile' ? profileKey : null,
      sshConfig,
      decryptDesktopSecret(source.token),
      persistenceSource,
      undefined,
      {
        managedScope: 'primary',
        managedUpdateCorrelation: managedPrimary.correlationId,
        primaryRegistryScope: true,
        registryConnectionId: source.id
      }
    )

    return { ...connection, connectionId: source.id }
  }

  const config = readDesktopConnectionConfig()

  const route = resolveDesktopRemoteRoute({
    config,
    env: {
      token: process.env.HERMES_DESKTOP_REMOTE_TOKEN,
      url: process.env.HERMES_DESKTOP_REMOTE_URL
    },
    profile,
    registry: readDesktopConnectionsRegistry()
  })

  if (!route) {
    return null
  }

  let connection

  if (route.kind === 'ssh') {
    if (route.connectionId) {
      managedConnectionUpdateGate.assertCanDial(route.connectionId)
    }

    connection = await bootstrapSshConnection(
      route.source === 'profile' ? profile : null,
      route.ssh,
      decryptDesktopSecret(route.token),
      route.source,
      undefined,
      {
        managedScope: options.primary ? 'primary' : options.poolKey ? 'pool' : 'transient',
        poolKey: options.poolKey || '',
        primaryRegistryScope: options.primary === true && Boolean(route.connectionId),
        registryConnectionId: route.connectionId || ''
      }
    )
  } else {
    const token =
      route.authMode === 'oauth' ? null : route.source === 'env' ? route.token : decryptDesktopSecret(route.token)

    connection = await buildRemoteConnection(
      route.url,
      route.authMode,
      token,
      route.source,
      undefined,
      route.kind === 'cloud' ? 'cloud' : 'url',
      undefined,
      route.headers
    )
  }

  return route.connectionId ? { ...connection, connectionId: route.connectionId } : connection
}

export function profileHasRemoteOverride(profile) {
  return profileHasRemoteConnection(readDesktopConnectionConfig(), profile)
}

export function globalRemoteActive() {
  if (process.env.HERMES_DESKTOP_REMOTE_URL) {
    return true
  }

  const mode = readDesktopConnectionConfig().mode

  if (modeIsRemoteLike(mode) || mode === 'ssh') {
    return true
  }

  // Registry-primary transport (#91564/#90316): a registered remote/cloud/ssh
  // gateway promoted to primary via connections.json makes the primary
  // backend remote even while the v1 config.mode still says 'local'. Every
  // consumer of this flag ("one remote host serves every profile") must see
  // that, or the local-entry routes delegate into a primary that now dials
  // remote — respawning the exact loopback children the resolver rung in
  // desktop-remote-route.ts eliminates.
  return registryPrimaryIsRemote()
}

export function registryPrimaryIsRemote() {
  try {
    const registry = readDesktopConnectionsRegistry()
    const entry = registry.connections.find(c => c.id === registry.primary)

    return Boolean(entry && (entry.kind === 'remote' || entry.kind === 'cloud' || entry.kind === 'ssh'))
  } catch {
    return false
  }
}

export function primaryBackendIsRemote() {
  return Boolean(profileHasRemoteOverride(primaryProfileKey())) || globalRemoteActive()
}

export function stopBackendChild(child) {
  stopBackendChildImpl(child, { forceKillProcessTree, isWindows: IS_WINDOWS })
}

export async function waitForBackendExit(child, timeoutMs = 5000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return
  }

  const exited = () => child.exitCode !== null || child.signalCode !== null

  const wait = delay =>
    new Promise<void>(resolve => {
      if (exited()) {
        resolve()

        return
      }

      const timer = setTimeout(resolve, delay)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })

  await wait(timeoutMs)

  if (exited()) {
    return
  }

  try {
    if (IS_WINDOWS && Number.isInteger(child.pid)) {
      forceKillProcessTree(child.pid)
    } else if (Number.isInteger(child.pid)) {
      try {
        process.kill(-child.pid, 'SIGKILL')
      } catch {
        child.kill('SIGKILL')
      }
    } else {
      child.kill('SIGKILL')
    }
  } catch {
    return
  }

  // Await the escalation as well; do not let shutdown or failed adoption race
  // a still-running backend.
  await wait(1000)
}

export function primaryProfileKey() {
  return readActiveDesktopProfile() || 'default'
}

export function profileRouteOptions(profile, request?) {
  const config = readDesktopConnectionConfig()
  const sshOverride = profileSshOverride(config, profile)
  const key = connectionScopeKey(profile) || primaryProfileKey()

  return {
    // A desktop profile can be only a client-side routing alias. Keep backend
    // endpoint filters in the SSH target's namespace (e.g. mara → default).
    backendProfile: sshOverride?.remoteProfile,
    globalRemote: globalRemoteActive(),
    primaryProfile: primaryProfileKey(),
    profileRemoteOverride: Boolean(profileRemoteOverride(config, profile) || sshOverride),
    // The primary profile's own backend resolves to a remote host (its
    // per-profile override, env, or global). Unknown sub-profiles on that
    // gateway must route THROUGH it, not spawn local backends (#88296).
    primaryRemoteActive: primaryBackendIsRemote(),
    // A stored per-profile entry (local or remote) — pins this profile to
    // its own backend; absent entries inherit the primary's remote.
    ownEntry: Boolean((config.profiles || {})[key]),
    requestMethod: request?.method,
    requestPath: request?.path
  }
}

export async function ensureBackend(profile, opts: { spawnPriority?: LocalBackendSpawnPriority } = {}) {
  const key = profile && String(profile).trim() ? String(profile).trim() : primaryProfileKey()
  const spawnPriority = spawnPriorityFrom(opts.spawnPriority)

  profileDeletionGate.assertCanStart(key)

  const route = resolveProfileBackendRoute(key, profileRouteOptions(key))

  if (route.backend === 'primary') {
    const connection = await startHermes()
    setWslBridgeProfileState(key, connection.mode !== 'remote')

    // A shared backend still owes the caller its profile scope, so renderer-side
    // WebSocket, filesystem, and cache routing target the selected profile.
    // `sharedPrimary` marks this as the shared-primary route: pooled backends
    // also carry `profile`, so only this descriptor gets the flag.
    return route.descriptorProfile
      ? { ...connection, profile: route.descriptorProfile, sharedPrimary: true }
      : connection
  }

  // A backend for this key may still be dying (idle reap, LRU eviction, a
  // just-finished delete). Wait for its bounded exit before reusing or
  // spawning, so two children never share one profile's HERMES_HOME.
  const stopping = poolStopper.inFlight(key)

  if (stopping) {
    await stopping
  }

  const existing = backendPool.get(key)

  if (existing) {
    existing.lastActiveAt = Date.now()

    if (spawnPriority === 'foreground') {
      promotePoolEntry(existing)
    }

    const connection = await existing.connectionPromise
    setWslBridgeProfileState(key, connection.mode !== 'remote')

    return connection
  }

  evictLruPoolBackends(poolMaxBackends() - 1)

  const entry = {
    process: null,
    port: null,
    token: null,
    connectionPromise: null,
    lastActiveAt: Date.now(),
    remoteBaseUrl: null,
    releaseLocalBackendSlot: null,
    localBackendSlotKey: null,
    localBackendSpawnRequest: null,
    spawnPriority
  }

  entry.connectionPromise = spawnPoolBackend(key, entry).catch(async error => {
    // Land the failure in desktop.log: without this a spawn that dies before
    // its child exists (guard rejection, runtime resolution) leaves no trace
    // beyond renderer-side rejections users never see in a bundle.
    logPoolSpawnFailure(`"${key}"`, error)

    await teardownFailedLocalBackend(key, entry)
    throw error
  })
  backendPool.set(key, entry)
  startPoolIdleReaper()

  const connection = await entry.connectionPromise
  setWslBridgeProfileState(key, connection.mode !== 'remote')

  return connection
}

export async function ensureRegistryBackend(
  connectionId,
  profile,
  managedUpdateCorrelation = '',
  opts: { spawnPriority?: LocalBackendSpawnPriority } = {}
) {
  const spawnPriority = spawnPriorityFrom(opts.spawnPriority)
  const registry = readDesktopConnectionsRegistry()
  const id = String(connectionId || '').trim() || registry.primary
  const source = registry.connections.find(c => c.id === id)

  if (!source) {
    throw new Error(`No connection with id "${id}".`)
  }

  if (source.kind === 'ssh') {
    managedConnectionUpdateGate.assertCanDial(id, managedUpdateCorrelation)
  }

  const profileKey = String(profile ?? '').trim() || 'default'
  let resolvedRegistrySshConfig
  let registryEffectiveFingerprintPromise: null | Promise<string> = null

  const resolveRegistrySshConfig = () => {
    if (source.kind !== 'ssh') {
      return null
    }

    if (!resolvedRegistrySshConfig) {
      resolvedRegistrySshConfig = normalizeSshConfig({
        mode: 'ssh',
        host: source.host,
        user: source.user,
        port: source.port,
        keyPath: source.keyPath,
        remoteHermesPath: source.remoteHermesPath,
        remoteProfile: source.remoteProfile || (profileKey === 'default' ? '' : profileKey)
      })
    }

    return resolvedRegistrySshConfig
  }

  const resolveRegistryEffectiveFingerprint = () => {
    if (!registryEffectiveFingerprintPromise) {
      const sshConfig = resolveRegistrySshConfig()

      registryEffectiveFingerprintPromise = sshConfig
        ? effectiveSshConfigFingerprint(sshConfig)
        : Promise.reject(new Error(`SSH connection "${source.label}" has no host configured.`))
    }

    return registryEffectiveFingerprintPromise
  }

  // The v2 registry is migrated from (but intentionally coexists with) the
  // v1 primary connection config. Reuse the already-booted primary descriptor
  // when both identities match; otherwise a default-profile registry request
  // opens a second SSH dashboard under a different scope and the competing
  // lifecycle probes repeatedly tear down each other's tunnel.
  const primary = await reuseMatchingPrimarySshBackend({
    connectionId: id,
    effectiveFingerprint: resolveRegistryEffectiveFingerprint,
    ensurePrimary: () => ensureBackend(profile, { spawnPriority }),
    profile,
    registry,
    source
  })

  if (primary) {
    return {
      ...primary,
      profile: profileKey,
      connectionId: id
    }
  }

  // The v1 primary and the registry primary can describe the same remote
  // backend beyond the SSH-fingerprint path above (cloud/url remotes have no
  // ssh -G identity). Reuse the already-running primary when the registry
  // resolves its live descriptor back to this exact source id; otherwise one
  // Desktop window starts two isolated servers whose transient runtime ids
  // are not interchangeable.
  if (id === registry.primary && source.kind !== 'local' && source.kind !== 'ssh') {
    const primaryDescriptor = await ensureBackend(profile)

    if (registrySourceOwnsPrimaryBackend(registry, id, primaryDescriptor)) {
      return {
        ...primaryDescriptor,
        profile: profileKey,
        connectionId: id,
        sharedRemote: true
      }
    }
  }

  if (source.kind === 'local') {
    // The registry's 'local' entry means THIS machine's runtime — always.
    // ensureBackend() follows the v1 routing table, which resolves to a
    // REMOTE descriptor when the v1 global mode is remote (or the profile
    // has its own remote override). A migrated remote-mode user would then
    // see the roster's "This device" rows enumerate + dial the remote box
    // (every profile duplicated, -slug handles forced). Delegate only when
    // the v1 route is genuinely local; otherwise spawn/reuse a forced-local
    // child pooled under the composite 'conn:local::<profile>' key so it
    // can't collide with the v1 remote descriptor cached at the bare key.
    profileDeletionGate.assertCanStart(profileKey)

    const localRoute = resolveRegistryLocalRoute(profileKey, {
      globalRemote: globalRemoteActive(),
      profileRemoteOverride: Boolean(profileHasRemoteOverride(profileKey))
    })

    if (localRoute.delegate) {
      return ensureBackend(profile, { spawnPriority })
    }

    const stoppingLocal = poolStopper.inFlight(localRoute.poolKey)

    if (stoppingLocal) {
      await stoppingLocal
    }

    const existingLocal = backendPool.get(localRoute.poolKey)

    if (existingLocal) {
      existingLocal.lastActiveAt = Date.now()

      if (spawnPriority === 'foreground') {
        promotePoolEntry(existingLocal)
      }

      return existingLocal.connectionPromise
    }

    evictLruPoolBackends(poolMaxBackends() - 1)

    const localEntry = {
      process: null,
      port: null,
      token: null,
      connectionPromise: null,
      lastActiveAt: Date.now(),
      remoteBaseUrl: null,
      releaseLocalBackendSlot: null,
      localBackendSlotKey: null,
      localBackendSpawnRequest: null,
      spawnPriority
    }

    localEntry.connectionPromise = spawnPoolBackend(profileKey, localEntry, {
      forceLocal: true,
      poolKey: localRoute.poolKey
    }).catch(async error => {
      // Same trace rule as the v1 pool path: a forced-local child whose spawn
      // rejects before the child exists must still land in desktop.log.
      logPoolSpawnFailure(`"${profileKey}" (forced-local)`, error)

      await teardownFailedLocalBackend(localRoute.poolKey, localEntry)
      throw error
    })
    backendPool.set(localRoute.poolKey, localEntry)
    startPoolIdleReaper()

    return localEntry.connectionPromise
  }

  const key = backendScopeKey(id, profile)
  const existing = backendPool.get(key)

  if (existing) {
    existing.lastActiveAt = Date.now()
    const connectionPromise = existing.connectionPromise

    // A remote process can die while its local SSH forward stays LISTENing.
    // Validate the exact cached descriptor at dispatch time; background
    // revalidation is renderer-driven and may never run while the Bots pane is
    // closed. Concurrent clicks share one retire/reconnect sequence.
    return registryDispatchRevalidation.run(connectionPromise, () =>
      ensureHealthyPooledRemoteBackendForDispatch({
        connectionPromise,
        currentConnectionPromise: () => backendPool.get(key)?.connectionPromise || null,
        probe: (connection, requestPath, options) => fetchJsonForBackend(connection, requestPath, options),
        reconnect: () => ensureRegistryBackend(id, profile),
        retire: async (error: any) => {
          // A late failure from an old descriptor must never tear down a newer
          // entry that another caller has already installed.
          if (backendPool.get(key) !== existing) {
            return
          }

          rememberLog(
            `Pooled remote backend "${key}" failed its dispatch probe (${error?.message || error}); reconnecting on demand.`
          )
          await stopPoolBackend(key)

          if (source.kind === 'ssh') {
            await sshBootstrapCoordinator.cancelAndWait(key)
            await teardownSshConnection(key)
          }
        }
      })
    )
  }

  evictLruPoolBackends(poolMaxBackends() - 1)

  const entry = {
    process: null,
    port: null,
    token: null,
    connectionPromise: null,
    lastActiveAt: Date.now(),
    remoteBaseUrl: null
  }

  entry.connectionPromise = connectRegistryBackend(
    source,
    profile,
    key,
    entry,
    resolveRegistrySshConfig(),
    source.kind === 'ssh' ? resolveRegistryEffectiveFingerprint() : null,
    managedUpdateCorrelation
  ).catch(error => {
    if (backendPool.get(key) === entry) {
      backendPool.delete(key)
    }

    throw error
  })
  backendPool.set(key, entry)
  startPoolIdleReaper()

  return entry.connectionPromise
}

export async function connectRegistryBackend(
  source,
  profile,
  key,
  poolEntry,
  resolvedSshConfig?,
  resolvedEffectiveFingerprint?: null | Promise<string>,
  managedUpdateCorrelation = '',
  tokenPersistenceSource = ''
) {
  const profileKey = String(profile ?? '').trim() || 'default'

  if (source.kind === 'ssh') {
    // The composite key doubles as the ssh scope so each (connection, profile)
    // pair owns its own tunnel + remote dashboard; the profile that re-homes
    // the REMOTE process is the entry's remoteProfile or the requested one —
    // never the composite string.
    const sshConfig = resolvedSshConfig

    if (!sshConfig) {
      throw new Error(`SSH connection "${source.label}" has no host configured.`)
    }

    const connection = await bootstrapSshConnection(
      key,
      sshConfig,
      decryptDesktopSecret(source.token),
      tokenPersistenceSource || `registry:${source.id}`,
      resolvedEffectiveFingerprint ? await resolvedEffectiveFingerprint : undefined,
      {
        managedScope: 'pool',
        managedUpdateCorrelation,
        poolKey: key,
        registryConnectionId: source.id
      }
    )

    poolEntry.remoteBaseUrl = connection.baseUrl

    return {
      ...connection,
      profile: profileKey,
      connectionId: source.id,
      // The remote process runs as this profile; the desktop-side profile key
      // is only the routing label. hermes:api uses it to translate explicit
      // self-profile query filters into the backend's namespace.
      remoteProfile: sshConfig.remoteProfile || '',
      logs: getRecentHermesLogLines(-80),
      ...getWindowState()
    }
  }

  // remote / cloud: one gateway host serves every profile of that source,
  // scoped per request — the descriptor carries the profile + connectionId so
  // renderer-side WS minting and REST scoping target the right agent.
  const token = source.authMode === 'oauth' ? null : decryptDesktopSecret(source.token)

  const connection = await buildRemoteConnection(
    source.url,
    normAuthMode(source.authMode),
    token,
    `registry:${source.id}`,
    undefined,
    source.kind === 'cloud' ? 'cloud' : 'url',
    undefined,
    source.headers
  )

  await waitForHermes(connection.baseUrl, connection.token, undefined, connection.authMode, connection.headers)
  poolEntry.remoteBaseUrl = connection.baseUrl

  return {
    ...connection,
    profile: profileKey,
    connectionId: source.id,
    // One host, many profiles: REST paths must carry ?profile= (same contract
    // as the global-remote shared-primary route).
    sharedRemote: true,
    logs: getRecentHermesLogLines(-80),
    ...getWindowState()
  }
}

export function managedSshConfig(source, profile = '') {
  const profileKey = String(profile ?? '').trim() || 'default'

  return normalizeSshConfig({
    mode: 'ssh',
    host: source.host,
    user: source.user,
    port: source.port,
    keyPath: source.keyPath,
    remoteHermesPath: source.remoteHermesPath,
    remoteProfile: source.remoteProfile || (profileKey === 'default' ? '' : profileKey)
  })
}

export function evictLruPoolBackends(keep) {
  const evictions = selectPoolEvictions(backendPool.entries(), Math.max(0, keep), Date.now(), POOL_KEEPALIVE_FRESH_MS)

  for (const profile of evictions) {
    rememberLog(`Evicting idle profile backend "${profile}" (LRU cap ${poolMaxBackends()})`)
    stopPoolBackend(profile)
  }
}

export function startPoolIdleReaper() {
  if (poolIdleReaper) {
    return
  }

  poolIdleReaper = setInterval(() => {
    const now = Date.now()

    for (const [profile, entry] of [...backendPool.entries()]) {
      if (now - (entry.lastActiveAt || 0) > poolIdleMs()) {
        rememberLog(`Reaping idle profile backend "${profile}" (idle > ${Math.round(poolIdleMs() / 1000)}s)`)
        stopPoolBackend(profile)
      }
    }

    if (backendPool.size === 0 && poolIdleReaper) {
      clearInterval(poolIdleReaper)
      poolIdleReaper = null
    }
  }, 60_000)

  if (typeof poolIdleReaper.unref === 'function') {
    poolIdleReaper.unref()
  }
}

export function releaseLocalBackendSlot(entry: any) {
  if (!entry) {
    return
  }

  const release = entry.releaseLocalBackendSlot
  const request = entry.localBackendSpawnRequest as LocalBackendSpawnRequest | null
  entry.releaseLocalBackendSlot = null
  entry.localBackendSlotKey = null
  entry.localBackendSpawnRequest = null

  if (release) {
    release()
  } else {
    request?.cancel()
  }
}

export function assertPoolEntryStillOwned(poolKey: string, entry: any) {
  if (backendPool.get(poolKey) !== entry) {
    releaseLocalBackendSlot(entry)
    throw new Error(`Profile backend start for "${poolKey}" was cancelled before spawn.`)
  }
}

export const failedLocalBackendTeardowns = new WeakMap<object, Promise<void>>()

export function teardownFailedLocalBackend(poolKey: string, entry: any): Promise<void> {
  const existing = failedLocalBackendTeardowns.get(entry)

  if (existing) {
    return existing
  }

  if (backendPool.get(poolKey) === entry) {
    backendPool.delete(poolKey)
  }

  const child = entry.process

  const teardown = releaseLocalBackendSlotAfterExit(
    () => releaseLocalBackendSlot(entry),
    async () => {
      stopBackendChild(child)
      await waitForBackendExit(child)

      if (child && child.exitCode === null && child.signalCode === null) {
        throw new Error(`Profile backend for "${poolKey}" did not exit; keeping the local slot occupied.`)
      }

      releaseBackendChild(child)
    }
  )

  // Keep the settled promise in the WeakMap for the lifetime of this entry.
  // Error + exit + outer catch may all request cleanup; none may run it twice.
  failedLocalBackendTeardowns.set(entry, teardown)

  return teardown
}

export async function spawnPoolBackend(profile, entry, opts: { forceLocal?: boolean; poolKey?: string } = {}) {
  const poolKey = opts.poolKey || profile

  await reapOrphanedBackendsOnce()
  profileDeletionGate.assertCanStart(profile)

  // A profile may point at its OWN remote backend (connection.json
  // `profiles[name]`), or inherit the app-wide remote (env / global settings).
  // In either case there is no local child to spawn — we just verify the
  // remote is reachable and hand back its connection descriptor. The pool
  // entry keeps `entry.process === null`, which stopPoolBackend/evict already
  // tolerate.
  const remote = opts.forceLocal ? null : await resolveRemoteBackend(profile, { poolKey })
  profileDeletionGate.assertCanStart(profile)

  if (remote) {
    await waitForHermes(remote.baseUrl, remote.token, undefined, remote.authMode, remote.headers)

    // Recorded on the entry so revalidation can probe this descriptor without
    // awaiting connectionPromise, which may still be pending for a sibling.
    entry.remoteBaseUrl = remote.baseUrl

    return {
      ...remote,
      profile,
      logs: getRecentHermesLogLines(-80),
      ...getWindowState()
    }
  }

  // Bound the slot wait BELOW the renderer's backend-boot budget (45s): once
  // the renderer has given up on this spawn, a ticket still queued for the
  // pool-idle window (10 min) would hold the pool key hostage and every
  // later click on the profile would join that stale wait. Failing here
  // surfaces the "all N slots busy" reason instead of a generic boot timeout.
  // The caller stamped entry.spawnPriority from its own request; a foreground
  // dial that joined the claim before this entry existed left a mark instead.
  if (takeForegroundSpawn(poolKey, profile)) {
    entry.spawnPriority = 'foreground'
  }

  const spawnPriority: LocalBackendSpawnPriority = spawnPriorityFrom(entry.spawnPriority)

  const spawnRequest = localBackendSpawnCoordinator.request(poolKey, {
    timeoutMs: POOL_SLOT_WAIT_MS,
    priority: spawnPriority
  })

  entry.localBackendSlotKey = poolKey
  entry.localBackendSpawnRequest = spawnRequest

  if (spawnRequest.queued) {
    rememberLog(
      `Profile backend "${profile}" waiting for a free local slot (${localBackendSpawnCoordinator.activeCount}/${poolMaxBackends()} busy, ${localBackendSpawnCoordinator.queuedCount} queued)`
    )
  }

  entry.releaseLocalBackendSlot = await spawnRequest.acquired

  if (entry.localBackendSpawnRequest === spawnRequest) {
    entry.localBackendSpawnRequest = null
  }

  assertPoolEntryStillOwned(poolKey, entry)

  const token = crypto.randomBytes(32).toString('base64url')

  // Same update mutual exclusion as the primary window's waitForLocalStart
  // (#73822): pool backends spawn from the same venv, so an ungated respawn
  // during applyUpdates' critical section re-locks the venv and trips the
  // venv-blocker preflight. No boot-progress UI here — pool backends boot
  // silently for background profiles — so we only log while parked.
  {
    let poolAnnounced = false

    await waitForUpdateClearance(updateGateDeps(), {
      onWaitTick: reason => {
        if (!poolAnnounced) {
          poolAnnounced = true
          rememberLog(`[updates] update in progress (${reason}); deferring pool backend start for profile "${profile}"`)
        }
      },
      pollMs: UPDATE_WAIT_POLL_MS,
      timeoutMs: UPDATE_WAIT_TIMEOUT_MS
    })
  }

  profileDeletionGate.assertCanStart(profile)

  // Argv assembly is the Hermes adapter's job (legacy-hermes/lifecycle.ts).
  const backendArgs = hermesServeArgs(profile)
  const backend = await ensureRuntime(resolveHermesBackend(backendArgs))
  // Route old runtimes (no `serve`) through the legacy `dashboard --no-open`.
  backend.args = getBackendArgsForRuntime(backend)
  const hermesCwd = resolveHermesCwd()
  const webDist = resolveWebDist()
  const readyFile = backend.readyFile ? makeDashboardReadyFile() : null

  // Guard BEFORE the "Starting" line: a profile that only exists on a remote
  // backend (remote-primary desktop asked for a forced-local child) rejects
  // here, and logging "Starting" first left an orphaned line with no READY
  // and no exit — the exact undiagnosable burst signature in remote-gateway
  // user bundles (Aug 2026, Dash's report).
  assertLocalProfileCanStart(profile, profileDeletionGate, key =>
    directoryExists(path.join(HERMES_HOME, 'profiles', key))
  )
  rememberLog(`Starting Hermes backend for profile "${profile}" via ${backend.label}`)

  const parentStartMarker = await desktopParentStartMarker()
  const backendNonce = crypto.randomBytes(16).toString('hex')
  const parentIdentityEnv = parentWatchdogEnv(process.pid, parentStartMarker, backendNonce)
  assertPoolEntryStillOwned(poolKey, entry)

  const child = spawn(
    backend.command,
    backend.args,
    hiddenWindowsChildOptions({
      cwd: hermesCwd,
      env: hermesBackendEnv({
        backendEnv: backend.env,
        cwd: hermesCwd,
        hermesHome: HERMES_HOME,
        inherited: process.env,
        parentIdentityEnv,
        readyFile,
        sessionToken: token,
        webDist
      }),
      shell: backend.shell,
      stdio: ['ignore', 'pipe', 'pipe']
    })
  )

  entry.process = child
  entry.token = token
  // Buffer stdout+stderr from the instant of spawn (#93608): an early crash's
  // traceback must survive into the claim error and the before-ready exit
  // message instead of a bare exit code. rememberLog attaches later, after
  // the claim, and would miss anything printed before it.
  const outputTail = createOutputTail(undefined, 'backend')
  outputTail.attach(child)

  // Start watching for the READY announcement BEFORE any await (#60323):
  // stdout is already flowing into the tail, and Node streams never replay
  // consumed chunks to late listeners — a sentinel printed while
  // claimBackendChild runs would otherwise be lost forever, timing out a
  // healthy backend. The tail-buffer accessor covers any residual gap.
  const portAnnouncement = waitForDashboardPortAnnouncement(child, {
    bufferedOutput: () => outputTail.text(),
    describeOutputTail: () => outputTail.describe(),
    readyFile
  })

  // Mark handled so an early rejection (child dies during the claim) can't
  // surface as an unhandled rejection before the Promise.race below attaches.
  portAnnouncement.catch(() => {})
  await claimBackendChild(child, `${backend.command} ${backend.args.join(' ')}`, profile, backendNonce, outputTail)
  assertPoolEntryStillOwned(poolKey, entry)

  child.stdout.on('data', rememberLog)
  child.stderr.on('data', rememberLog)

  let ready = false
  let rejectStart = null

  const startFailed = new Promise((_resolve, reject) => {
    rejectStart = reject
  })

  child.once('error', error => {
    rememberLog(`Hermes backend for profile "${profile}" failed to start: ${error.message}`)
    void teardownFailedLocalBackend(poolKey, entry).catch(cleanupError => {
      rememberLog(
        `Hermes backend for profile "${profile}" cleanup failed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`
      )
    })
    rejectStart?.(error)
  })
  child.once('exit', (code, signal) => {
    rememberLog(`Hermes backend for profile "${profile}" exited (${signal || code})`)
    releaseLocalBackendSlot(entry)
    releaseBackendChild(child)

    if (backendPool.get(poolKey) === entry) {
      backendPool.delete(poolKey)
    }

    if (!ready) {
      rejectStart?.(
        new Error(
          `Hermes backend for profile "${profile}" exited before it became ready (${signal || code}).${outputTail.describe()}`
        )
      )
    }
  })

  // Discover the ephemeral port the child bound to
  const port = await Promise.race([portAnnouncement, startFailed])

  if (readyFile) {
    fs.unlink(readyFile, () => {})
  }

  entry.port = port

  const baseUrl = `http://127.0.0.1:${port}`
  // Probe with the token this backend was spawned with
  // (HERMES_DASHBOARD_SESSION_TOKEN). A runtime that gates GET /api/health
  // behind that token would otherwise 401 an anonymous probe forever: the
  // anonymous 401 looks like a pre-/api/health backend, so the probe falls back
  // to /api/status — which the same gate also rejects — and readiness times out
  // against a backend that is actually healthy.
  await Promise.race([waitForHermes(baseUrl, token, undefined, 'token'), startFailed])
  ready = true

  const authToken = await adoptServedDashboardToken(baseUrl, token, {
    childAlive: () => child.exitCode === null && !child.killed,
    label: `Hermes backend for profile "${profile}"`,
    rememberLog
  })

  entry.token = authToken

  // Verify the WebSocket session token before declaring backend ready.
  // HTTP /api/status can pass while WS auth fails (separate transport, separate guards).
  const wsUrl = hermesLocalWsUrl(port, authToken)
  const wsProbe = await probeGatewayWebSocket(wsUrl, { WebSocketImpl: globalThis.WebSocket })

  if (!wsProbe.ok) {
    throw new Error(
      `Hermes backend for profile "${profile}" is HTTP-reachable but the WebSocket (/api/ws) rejected the session token: ${wsProbe.reason}`
    )
  }

  return hermesProfiledConnectionDescriptor({
    baseUrl,
    logs: getRecentHermesLogLines(-80),
    profile,
    token: authToken,
    windowState: getWindowState(),
    wsUrl
  })
}

export const poolStopper = createPoolStopper({
  pool: backendPool,
  stopChild: child => stopBackendChild(child),
  waitForExit: child => waitForBackendExit(child)
})

export async function stopPoolBackend(profile: string) {
  const entry = backendPool.get(profile)
  await poolStopper.stop(profile)
  releaseLocalBackendSlot(entry)
}

export async function stopAllPoolBackends() {
  const entries = [...backendPool.values()]
  await poolStopper.stopAll()
  entries.forEach(releaseLocalBackendSlot)
}

export const backendShutdown = createBackendShutdownCoordinator(async () => {
  const primary = backendConnectionState.invalidate()

  stopBackendChild(primary)
  const pooledStops = stopAllPoolBackends()

  if (poolIdleReaper) {
    clearInterval(poolIdleReaper)
    poolIdleReaper = null
  }

  await Promise.all([waitForBackendExit(primary), pooledStops])
})

export async function exitAfterBackendShutdown(code) {
  await backendShutdown.run()
  app.exit(code)
}

export async function startHermes() {
  // Only the single-instance lock holder may reap/spawn/claim the desktop
  // backend. A lock-losing instance must stay inert even if some path reaches
  // here (e.g. the deferred-quit window before `ready`): its reapOrphans()
  // otherwise SIGTERMs the running instance's live backend (#87295).
  if (!isPrimaryInstance) {
    rememberLog('[boot] non-primary instance: skipping backend machinery')
    throw new Error('Hermes Desktop is already running in another window.')
  }

  await reapOrphanedBackendsOnce()

  // Latched-failure short-circuit: once bootstrap has failed in this
  // process, every subsequent startHermes() call re-throws the same error
  // without re-running install.ps1. This prevents the renderer's
  // ensureGatewayOpen retries (and any other getConnection callers) from
  // restarting a 5-10 minute install loop while the user is still reading
  // the failure overlay.
  if (bootstrapFailure) {
    throw bootstrapFailure
  }

  if (backendStartFailure) {
    throw backendStartFailure
  }

  // A confirmed remote reauth rejection is terminal until the user signs in.
  // Short-circuiting here keeps the boot-failure overlay latched and its
  // "Sign in" button clickable, instead of re-driving boot on every retry.
  if (remoteReauthFailure) {
    throw remoteReauthFailure
  }

  // E2E: simulate a boot failure without breaking the real backend. The boot
  // progresses a few steps, then fails with the given error message.
  if (BOOT_FAKE_ERROR) {
    await advanceBootProgress('backend.resolve', 'Resolving Hermes backend', 8)
    const error = new Error(BOOT_FAKE_ERROR) as any
    error.isBootstrapFailure = true
    bootstrapFailure = error
    throw error
  }

  const existingConnectionPromise = backendConnectionState.getPromise()

  if (existingConnectionPromise) {
    return existingConnectionPromise
  }

  // Seed active-profile.json from legacy signals BEFORE the first
  // profile-dependent read (`primaryBackendIsRemote()` on the next line, then
  // `primaryProfileKey()` inside the connection IIFE below). Without this,
  // remote-mode users whose preference file is missing (first boot after
  // update) resolve primaryProfileKey() to 'default' inside the IIFE, then
  // the remote branch returns and never runs the migration. Runs once;
  // no-op when the preference file already exists.
  migrateActiveProfileIfMissing()

  const connectionAttempt = backendConnectionState.startAttempt()
  const primaryProfile = primaryProfileKey()

  // Legacy path callers without an explicit profile belong to the primary
  // window backend. Profile-scoped callers still pass their key directly.
  setActiveGatewayProfile(primaryProfile)

  // Classify this boot BEFORE the throwing resolve/mint runs: a remote failure
  // must NOT latch (it's transient — see shouldLatchBackendStartFailure), while
  // a local failure latches to break install-restart loops.
  let attemptedRemote = managedPrimaryRestoreOwners.size > 0 || primaryBackendIsRemote()

  const connectionPromise = (async () => {
    const connectRemote = async remote => {
      // resolveRemote() may take arbitrarily long (settings resolve / ws-ticket
      // mint). If a newer attempt started meanwhile (e.g. the user switched
      // remotes and Apply invalidated this attempt), bail before probing.
      if (!backendConnectionState.isCurrentAttempt(connectionAttempt)) {
        throw new Error('Hermes backend start was superseded by a newer connection attempt.')
      }

      await advanceBootProgress('backend.remote', `Connecting to remote Hermes backend at ${remote.baseUrl}`, 24)
      await waitForHermes(remote.baseUrl, remote.token, undefined, remote.authMode, remote.headers)

      // Second async boundary: the health probe itself can outlive the
      // attempt. A late success here must not publish a stale descriptor.
      if (!backendConnectionState.isCurrentAttempt(connectionAttempt)) {
        throw new Error('Hermes backend start was superseded by a newer connection attempt.')
      }

      updateBootProgress({
        phase: 'backend.ready',
        message: 'Remote Hermes backend is ready',
        progress: 94,
        running: true,
        error: null
      })

      return createPrimaryRemoteConnection(remote, getRecentHermesLogLines(-80), getWindowState())
    }

    await advanceBootProgress('backend.resolve', 'Resolving Hermes backend', 8)
    // Resolve for the desktop's primary profile so a per-profile remote
    // override on the active profile is honored (falls back to env / global).

    // GUI launches (Finder/Dock, desktop launchers) inherit a minimal PATH
    // that skips the user's shell profiles. Merge the login-shell PATH into
    // process.env BEFORE resolving the runtime or spawning the backend, so
    // both the Electron-side resolvers and the whole backend subtree (tool
    // availability checks, stdio MCP servers) can find Homebrew-, nvm-, and
    // ~/.local/bin-installed CLIs. Single-flight with the whenReady warmup;
    // failure-hardened — a broken shell profile never blocks boot.
    const loginShellPath = await ensureLoginShellPath()

    if (loginShellPath.applied) {
      rememberLog('[env] merged login-shell PATH into process.env for backend spawn')
    } else if (loginShellPath.reason && !['win32', 'unchanged'].includes(loginShellPath.reason)) {
      rememberLog(`[env] login-shell PATH resolution unavailable (${loginShellPath.reason}); keeping inherited PATH`)
    }

    const token = crypto.randomBytes(32).toString('base64url')
    // Argv assembly is the Hermes adapter's job (legacy-hermes/lifecycle.ts).
    // An unset profile preference keeps the legacy launch so existing installs
    // are unaffected.
    const backendArgs = hermesServeArgs(readActiveDesktopProfile())

    const setup = await runPrimaryBackendStartup({
      connectRemote,
      ensureLocalRuntime: ensureRuntime,
      prepareLocalBackend: async () => {
        await advanceBootProgress('backend.runtime', 'Resolving Hermes runtime', 28)

        return resolveHermesBackend(backendArgs)
      },
      resolveRemote: () => {
        // Classify immediately before each throwing resolve. This callback runs
        // both for an already-saved remote and after first-run remote Apply.
        attemptedRemote = managedPrimaryRestoreOwners.size > 0 || primaryBackendIsRemote()

        return resolveRemoteBackend(primaryProfile, { primary: true })
      },
      waitForDecision: waitForFirstRunSetupChoice,
      // Mutual exclusion with an in-app update (#50238). Remote connections
      // return before this waiter; local starts park until the updater exits.
      waitForLocalStart: waitForUpdateToFinish
    })

    if (setup.kind === 'remote') {
      // Paths from the remote backend belong to a host the Windows desktop
      // cannot open via wsl.exe — disable WSL path bridging so native dialogs
      // and file panels don't spawn wsl.exe (or the interactive install prompt
      // on WSL-less machines) for unresolvable paths. (#66433)
      setWslBridgeProfileState(primaryProfile, false)

      return setup.connection
    }

    // Local WSL backend — paths are bridgeable.
    setWslBridgeProfileState(primaryProfile, true)

    const backend = setup.backend
    // Route old runtimes (no `serve`) through the legacy `dashboard --no-open`.
    backend.args = getBackendArgsForRuntime(backend)
    const hermesCwd = resolveHermesCwd()
    const webDist = resolveWebDist()
    const readyFile = backend.readyFile ? makeDashboardReadyFile() : null

    await advanceBootProgress('backend.spawn', `Starting Hermes backend via ${backend.label}`, 84)
    rememberLog(`Starting Hermes backend via ${backend.label}`)

    const profile = primaryProfileKey()
    const parentStartMarker = await desktopParentStartMarker()
    const backendNonce = crypto.randomBytes(16).toString('hex')
    const parentIdentityEnv = parentWatchdogEnv(process.pid, parentStartMarker, backendNonce)

    const hermesProcess = spawn(
      backend.command,
      backend.args,
      hiddenWindowsChildOptions({
        cwd: hermesCwd,
        env: hermesBackendEnv({
          backendEnv: backend.env,
          cwd: hermesCwd,
          hermesHome: HERMES_HOME,
          inherited: process.env,
          parentIdentityEnv,
          readyFile,
          sessionToken: token,
          webDist
        }),
        shell: backend.shell,
        stdio: ['ignore', 'pipe', 'pipe']
      })
    )

    // Buffer stdout+stderr from the instant of spawn (#93608): an early
    // crash's traceback must survive into the claim error and the
    // before-ready exit message shown by the boot UI. rememberLog attaches
    // later, after the claim, and would miss anything printed before it.
    const primaryOutputTail = createOutputTail(undefined, 'backend')
    primaryOutputTail.attach(hermesProcess)

    // Start watching for the READY announcement BEFORE any await (#60323):
    // claimBackendChild can take seconds (its Windows Get-Process probe cold
    // start alone runs 2-8s) and advanceBootProgress awaits renderer IPC.
    // stdout is already flowing into the tail, and Node streams never replay
    // consumed chunks to late listeners, so a sentinel printed during that
    // window was lost forever — the wait then hit its 90s timeout and a
    // healthy backend was killed (deterministic on Windows, racy on
    // macOS/Linux). The tail-buffer accessor covers any residual gap.
    const portAnnouncement = waitForDashboardPortAnnouncement(hermesProcess, {
      bufferedOutput: () => primaryOutputTail.text(),
      describeOutputTail: () => primaryOutputTail.describe(),
      readyFile
    })

    // Mark handled so an early rejection (child dies during the claim) can't
    // surface as an unhandled rejection before the Promise.race below attaches.
    portAnnouncement.catch(() => {})
    await claimBackendChild(
      hermesProcess,
      `${backend.command} ${backend.args.join(' ')}`,
      profile,
      backendNonce,
      primaryOutputTail
    )
    const processOwner = backendConnectionState.attachProcess(connectionAttempt, hermesProcess)

    if (!processOwner) {
      stopBackendChild(hermesProcess)
      await waitForBackendExit(hermesProcess)
      releaseBackendChild(hermesProcess)
      throw new Error('Hermes backend start was superseded by a newer connection attempt.')
    }

    hermesProcess.stdout.on('data', rememberLog)
    hermesProcess.stderr.on('data', rememberLog)
    let backendReady = false
    let rejectBackendStart = null

    const backendStartFailed = new Promise((_resolve, reject) => {
      rejectBackendStart = reject
    })

    hermesProcess.once('error', error => {
      releaseBackendChild(hermesProcess)

      if (!backendConnectionState.clearForCurrentProcess(processOwner)) {
        rememberLog(`Ignoring stale Hermes backend error: ${error.message}`)
        rejectBackendStart?.(new Error('Hermes backend start was superseded by a newer connection attempt.'))

        return
      }

      rememberLog(`Hermes backend failed to start: ${error.message}`)
      updateBootProgress(
        {
          error: error.message,
          message: `Hermes backend failed to start: ${error.message}`,
          phase: 'backend.error',
          running: false
        },
        { allowDecrease: true }
      )
      sendBackendExit({ code: null, signal: null, error: error.message })
      rejectBackendStart?.(error)
    })
    hermesProcess.once('exit', (code, signal) => {
      releaseBackendChild(hermesProcess)

      if (!backendConnectionState.clearForCurrentProcess(processOwner)) {
        rememberLog(`Ignoring stale Hermes backend exit (${signal || code})`)

        if (!backendReady) {
          rejectBackendStart?.(new Error('Hermes backend start was superseded by a newer connection attempt.'))
        }

        return
      }

      rememberLog(`Hermes backend exited (${signal || code})`)
      sendBackendExit({ code, signal })

      if (!backendReady) {
        const message = `Hermes backend exited before it became ready (${signal || code}).${primaryOutputTail.describe()}`
        updateBootProgress(
          {
            error: message,
            message,
            phase: 'backend.error',
            running: false
          },
          { allowDecrease: true }
        )
        rejectBackendStart?.(
          new Error(
            `Hermes backend exited before it became ready (${signal || code}). Log: ${DESKTOP_LOG_PATH}\n${recentHermesLog()}`
          )
        )
      }
    })

    await advanceBootProgress('backend.port', 'Waiting for Hermes backend to launch', 86)

    // Discover the ephemeral port the child bound to
    const port = await Promise.race([portAnnouncement, backendStartFailed])

    if (readyFile) {
      fs.unlink(readyFile, () => {})
    }

    const baseUrl = `http://127.0.0.1:${port}`
    await advanceBootProgress('backend.wait', 'Waiting for Hermes backend to become ready', 90)
    // Probe with the SAME token we injected into the child (HERMES_DASHBOARD_SESSION_TOKEN
    // above). A runtime that gates /api/health behind its session token would otherwise
    // 401 the credential-free probe forever: the anonymous 401 looks like a pre-/api/health
    // backend, so the probe falls back to /api/status — which that same gate also rejects —
    // and readiness times out against a backend that is actually healthy.
    await Promise.race([waitForHermes(baseUrl, token, undefined, 'token'), backendStartFailed])
    backendReady = true
    backendStartFailure = null

    const authToken = await adoptServedDashboardToken(baseUrl, token, {
      childAlive: () => hermesProcess.exitCode === null && !hermesProcess.killed,
      rememberLog
    })

    // Verify the WebSocket session token before declaring backend ready.
    const wsUrl = hermesLocalWsUrl(port, authToken)
    const wsProbe = await probeGatewayWebSocket(wsUrl, { WebSocketImpl: globalThis.WebSocket })

    if (!wsProbe.ok) {
      throw new Error(
        `Local Hermes backend is HTTP-reachable but the WebSocket (/api/ws) rejected the session token: ${wsProbe.reason}`
      )
    }

    updateBootProgress({
      phase: 'backend.ready',
      message: 'Hermes backend is ready. Finalizing desktop startup',
      progress: 94,
      running: true,
      error: null,
      errorCode: null
    })

    // A successful boot (including a soft restart that the repair-guard
    // chose over a hard reinstall, see #74874) means any in-flight repair
    // attempt counter has been honoured — reset it so the next genuine
    // failure starts fresh from attempt 1 instead of inheriting the
    // accumulated count of the resolved episode.
    bootstrapRepairAttempt = 0

    // The backend's plugin discovery just ran and refreshed HERMES_HOME/.plugin-compat-report.json.
    // Surface it once (per distinct set of affected plugins) after the window is up; never block boot.
    setTimeout(() => void showPluginCompatNoticeOnce(), 1500)

    return hermesPrimaryConnectionDescriptor({
      baseUrl,
      logs: getRecentHermesLogLines(-80),
      token: authToken,
      windowState: getWindowState(),
      wsUrl
    })
  })().catch(async error => {
    if (!backendConnectionState.clearPromiseForAttempt(connectionAttempt)) {
      throw error
    }

    const failedProcess = backendConnectionState.invalidate()
    stopBackendChild(failedProcess)
    await waitForBackendExit(failedProcess)

    if (error instanceof FirstRunSetupResetError) {
      throw error
    }

    const message = error instanceof Error ? error.message : String(error)
    const hostKeyChanged = isHostKeyChangedBootFailure(error)

    // Carry structured Cloud-down metadata through the boot-progress / IPC
    // boundary when present, so the renderer overlay can key on it rather than
    // re-classifying the message string. main owns classification; the renderer
    // only consumes the structured result (#85335).
    const isCloudBackendDown = Boolean(error && typeof error === 'object' && (error as any).isCloudBackendDown === true)

    const statusCode = Number(
      error && typeof error === 'object' && Number.isInteger((error as any).statusCode)
        ? (error as any).statusCode
        : NaN
    )

    // Only latch LOCAL boot failures. A remote failure (lapsed session / mint
    // timeout / host briefly unreachable across sleep) is transient and has no
    // child 'exit' handler to clear the cache — latching it would wedge the app
    // on "session expired" until a full restart, defeating reconnect, the
    // "Sign out & sign in" reload, and the wake-recovery revalidate path.
    if (shouldLatchBackendStartFailure({ attemptedRemote })) {
      backendStartFailure = error instanceof Error ? error : new Error(message)
    }

    // A host-key CHANGE is the terminal exception among remote failures: SSH
    // fails closed until the user verifies the change and clears the stale
    // known_hosts entry, so retrying re-drives the identical doomed boot (one
    // bundle showed 157 consecutive failures over 2.5h). Latch it like a local
    // failure — reset/repair/apply-config clear the latch after the user fixes
    // known_hosts.
    if (shouldLatchHostKeyChangedFailure({ attemptedRemote, isReauth: false, isHostKeyChanged: hostKeyChanged })) {
      backendStartFailure = error instanceof Error ? error : new Error(message)
    }

    // A confirmed reauth rejection latches separately: it can't self-heal, and
    // leaving it unlatched hides the overlay's "Sign in" button on every retry.
    if (shouldLatchRemoteReauthFailure({ attemptedRemote, isReauth: isReauthRequiredError(error) })) {
      remoteReauthFailure = error instanceof Error ? error : new Error(message)
    }

    updateBootProgress(
      {
        error: message,
        isCloudBackendDown: isCloudBackendDown || undefined,
        message: `Desktop boot failed: ${message}`,
        phase: 'backend.error',
        // Renderer contract for the self-heal loop (#82679): a transient
        // REMOTE failure (dropped SSH/HTTP registered connection, mint
        // timeout) is retryable — the renderer re-attempts the boot with
        // bounded backoff. Local failures, confirmed reauth rejections, and
        // host-key changes are not: those end in the recovery overlay /
        // sign-in affordance.
        retryable: isRetryableRemoteBootFailure({
          attemptedRemote,
          isReauth: isReauthRequiredError(error),
          isHostKeyChanged: hostKeyChanged
        }),
        running: false,
        statusCode: Number.isInteger(statusCode) ? statusCode : undefined
      },
      { allowDecrease: true }
    )
    throw error
  })

  backendConnectionState.setPromise(connectionAttempt, connectionPromise)

  return connectionPromise
}

export function wireCommonWindowHandlers(win, { zoom = true }: { zoom?: boolean } = {}) {
  installPreviewShortcut(win)
  installDevToolsShortcut(win)
  installBrowserNavGestures(win)

  // Claim Ctrl/Cmd+F in the main process — on Pop!_OS / GNOME-based Linux
  // distros the Ctrl+F keydown does not reach the renderer's `view.findInPage`
  // binding (#81727). Routing it through `before-input-event` forwards the
  // intent at the earliest observable point. macOS / Windows keep the
  // renderer's own rebindable keybind, so the hook is Linux-only: installing
  // it elsewhere would make Ctrl/Cmd+F un-rebindable and double-open.
  if (process.platform === 'linux') {
    installFindShortcut(win)
  }

  if (zoom) {
    installZoomShortcuts(win)
    // Re-apply persisted zoom on show/restore/resize/cross-display move
    // (Chromium can drop webContents zoom after these window transitions), on
    // EVERY full load — not once, since crash recovery reloads and would
    // outlive a spent `once` listener (#46429) — and after in-page navigation,
    // where Chromium applies the target hash route's own per-URL zoom record
    // (see installZoomReassertOnNavigation; #48658, #38854, #79863).
    const reassertZoom = () => restorePersistedZoomLevel(win)

    installZoomReassertOnWindowEvents(win, reassertZoom)
    installZoomReassertOnNavigation(win.webContents, reassertZoom)
  }

  installContextMenuBridge(win)
  // Always deny, never open as a side effect: GHSA-9f4c-93c8-jc8g. Trusted
  // links arrive via `hermes:openExternal`, not here. See window-open-policy.ts.
  win.webContents.setWindowOpenHandler(
    createWindowOpenHandler(origin => rememberLog(`[window-open] denied: ${origin}`))
  )
  win.webContents.on('will-navigate', (event, url) => {
    if ((DEV_SERVER && url.startsWith(DEV_SERVER)) || (!DEV_SERVER && url.startsWith('file:'))) {
      return
    }

    event.preventDefault()
    openExternalUrl(url)
  })
}

export function wireWindowReveal(win, { show, onRevealed }: { show?: () => void; onRevealed?: () => void } = {}) {
  const controller = createWindowRevealController(
    {
      isDestroyed: () => win.isDestroyed(),
      isVisible: () => win.isVisible(),
      show: show ?? (() => win.show())
    },
    { onRevealed }
  )

  win.once('ready-to-show', controller.reveal)
  win.webContents.once('did-finish-load', controller.scheduleFallback)
  win.on('closed', controller.dispose)

  return controller
}

export const sessionWindows = createSessionWindowRegistry()

export function spawnSecondaryWindow({
  sessionId,
  profile,
  watch
}: { sessionId?: string; profile?: null | string; watch?: boolean } = {}) {
  const icon = getAppIconPath()

  const win = new BrowserWindow({
    width: SESSION_WINDOW_MIN_WIDTH,
    height: SESSION_WINDOW_MIN_HEIGHT,
    minWidth: SESSION_WINDOW_MIN_WIDTH,
    minHeight: SESSION_WINDOW_MIN_HEIGHT,
    title: 'Hermes',
    titleBarStyle: 'hidden',
    titleBarOverlay: getTitleBarOverlayOptions(),
    trafficLightPosition: IS_MAC ? WINDOW_BUTTON_POSITION : undefined,
    ...chatWindowSurfaceOptions(),
    icon,
    // Don't show until the renderer's first themed paint is ready. macOS
    // `vibrancy` ignores `backgroundColor` and paints a translucent OS
    // material (which follows the OS appearance, not the app theme), so a
    // dark-themed app on a light-mode Mac flashes white until the renderer
    // covers it. ready-to-show fires after the boot-time paint in
    // themes/context.tsx, so the window appears already themed.
    show: false,
    webPreferences: chatWindowWebPreferences(PRELOAD_PATH)
  })

  // Chat-surface registration: applyWindowTranslucency swaps this window's
  // backing between opaque-themed and alpha-0 when glass toggles.
  translucencyBackedWindows.add(win)

  if (IS_MAC) {
    win.setWindowButtonPosition?.(WINDOW_BUTTON_POSITION)
  }

  wireWindowReveal(win)

  win.on('enter-full-screen', () => sendWindowStateChanged(true))
  win.on('leave-full-screen', () => sendWindowStateChanged(false))

  streamThrottle.register(win)
  wireCommonWindowHandlers(win, zoomWiringForWindowKind('chat'))
  attachRendererConsoleCapture(win, 'session-window', rememberLog)

  // Renderer lifecycle diagnostics + recovery (#81290): a dead session-window
  // renderer used to log nothing and stay black; now it logs with its window
  // kind and reloads under the shared crash-loop budget, exactly like the
  // primary window, without touching any other window.
  installWindowRendererLifecycle(win, {
    kind: 'secondary',
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

  loadWindowUrl(
    win,
    buildSessionWindowUrl(sessionId, {
      devServer: DEV_SERVER,
      profile,
      rendererIndexPath: DEV_SERVER ? undefined : resolveRendererIndex(),
      watch
    }),
    'Session window'
  )

  return win
}

export function createSessionWindow(sessionId, { profile = null, watch = false } = {}) {
  return sessionWindows.openOrFocus(sessionId, () => spawnSecondaryWindow({ sessionId, profile, watch }))
}

export const wakeIndicatorController = createWakeIndicatorWindowController({
  devServer: DEV_SERVER,
  isMac: IS_MAC,
  loadWindowUrl,
  log: rememberLog,
  preloadPath: PRELOAD_PATH,
  rendererIndex: resolveRendererIndex,
  wireWindow: window => wireCommonWindowHandlers(window, zoomWiringForWindowKind('wakeIndicator'))
})

export let petOverlayWindow = null

export function closePetOverlay() {
  if (petOverlayWindow && !petOverlayWindow.isDestroyed()) {
    petOverlayWindow.close()
  }

  petOverlayWindow = null
}

export function createWindow() {
  const icon = getAppIconPath()
  const savedWindowState = readWindowState()
  mainWindow = new BrowserWindow({
    ...computeWindowOptions(savedWindowState, screen.getAllDisplays()),
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    title: 'Hermes',
    // Frameless title bar on every platform so the renderer can paint the
    // "hide sidebar" button (and other left-side titlebar tools) flush with
    // the top edge — matching the macOS layout where the traffic lights sit
    // inside the same band. On Windows/Linux, titleBarOverlay tells Electron
    // to paint native min/max/close in the top-right of the renderer; on
    // macOS it just reserves a content inset alongside the traffic lights.
    titleBarStyle: 'hidden',
    titleBarOverlay: getTitleBarOverlayOptions(),
    trafficLightPosition: IS_MAC ? WINDOW_BUTTON_POSITION : undefined,
    ...chatWindowSurfaceOptions(),
    icon,
    // Hidden until the first themed paint so macOS `vibrancy` (which ignores
    // `backgroundColor` and follows the OS appearance) can't flash a light
    // material before the renderer paints the app theme. See createSessionWindow.
    show: false,
    // Shared with the secondary session windows (chatWindowWebPreferences);
    // stream-aware throttling is applied per-window via streamThrottle so a
    // live answer keeps painting while the window is blurred or minimized,
    // without pinning visibilityState to 'visible' at idle. See
    // session-windows.ts and stream-throttle.ts.
    webPreferences: chatWindowWebPreferences(PRELOAD_PATH)
  })

  const createdMainWindow = mainWindow

  // Chat-surface registration: see applyWindowTranslucency.
  translucencyBackedWindows.add(mainWindow)

  if (IS_MAC) {
    mainWindow.setWindowButtonPosition?.(WINDOW_BUTTON_POSITION)

    if (icon) {
      app.dock?.setIcon(icon)
    }
  }

  if (!IS_MAC) {
    if (!nativeThemeListenerInstalled) {
      nativeThemeListenerInstalled = true
      nativeTheme.on('updated', () => {
        for (const win of BrowserWindow.getAllWindows()) {
          applyTitleBarOverlay(win)
        }
      })
    }
  }

  if (savedWindowState?.isMaximized) {
    mainWindow.maximize()
  }

  const revealController = wireWindowReveal(createdMainWindow, {
    onRevealed: () => {
      // Persist geometry as soon as the window is visible so a crash before the
      // first clean resize/move/close still captures the restored bounds (#56726).
      schedulePersistWindowState()

      // #38216: clear the mid-boot marker only after a window is actually usable.
      // Keep sticky `fallback` when we launched with --no-sandbox so the next
      // Start Menu click does not re-enter the GPU FATAL crash loop. The marker
      // records the app version so the next update re-probes the sandbox.
      if (IS_WINDOWS) {
        try {
          writeSandboxMarker(
            app.getPath('userData'),
            markerAfterSuccessfulBoot({
              fallbackActive: windowsSandboxFallbackSticky,
              reason: windowsSandboxFallbackReason,
              appVersion: app.getVersion()
            })
          )
        } catch (error) {
          rememberLog(`[sandbox] marker update after main-window reveal failed: ${error?.message || error}`)
        }
      }
    }
  })

  // Under Playwright testing, instantly show the window: `ready-to-show`
  // doesn't fire in some testing envs, and the suite can't wait out the
  // production fallback.
  if (process.env.TEST_WORKER_INDEX !== undefined) {
    revealController.reveal()
  }

  mainWindow.on('will-enter-full-screen', () => sendWindowStateChanged(true))
  mainWindow.on('enter-full-screen', () => sendWindowStateChanged(true))
  mainWindow.on('will-leave-full-screen', () => sendWindowStateChanged(false))
  mainWindow.on('leave-full-screen', () => sendWindowStateChanged(false))
  mainWindow.on('minimize', () => sendWindowStateChanged())
  mainWindow.on('restore', () => sendWindowStateChanged())
  mainWindow.on('hide', () => sendWindowStateChanged())
  mainWindow.on('show', () => sendWindowStateChanged())

  // Reopen where the user left off. close is the backstop, flushed
  // synchronously before the window is gone.
  bindGeometryPersistence(mainWindow, schedulePersistWindowState)
  mainWindow.on('maximize', schedulePersistWindowState)
  mainWindow.on('unmaximize', schedulePersistWindowState)
  mainWindow.on('close', () => schedulePersistWindowState.flush())

  // the closed wrapper remains truthy, so clear only the window this callback owns.
  mainWindow.on('closed', () => {
    closePetOverlay()
    wakeIndicatorController.close()

    if (mainWindow === createdMainWindow) {
      mainWindow = null
      // the replacement renderer must register before queued links can be delivered.
      _rendererReadyForDeepLink = false
    }
  })

  streamThrottle.register(mainWindow)
  wireCommonWindowHandlers(mainWindow, zoomWiringForWindowKind('chat'))

  // Per-window renderer lifecycle diagnostics + recovery (#81290). The reload
  // policy (crashed/oom → bounded reload via the shared rolling budget, then
  // the #38216 Windows sandbox relaunch check on suppression) is the same
  // policy this window used before it moved into the shared helper, so a
  // crashed peer renderer now logs and recovers exactly like the primary one.
  installWindowRendererLifecycle(mainWindow, {
    kind: 'main',
    callbacks: {
      log: rememberLog,
      reload: () => {
        mainWindow.webContents.reload()
      },
      onCrashLoopSuppressed: details => {
        // #38216 renderer flavor (same recovery as #56726, credit @Sahil-SS9):
        // a deterministic Windows renderer crash loop with the sandbox
        // breakpoint signature gets one --no-sandbox relaunch instead of a
        // dead window. Gated on the exit code so unrelated crash loops don't
        // silently drop the sandbox.
        if (
          !shouldRelaunchForRendererSandboxCrashLoop({
            reason: details?.reason,
            exitCode: details?.exitCode,
            alreadyNoSandbox: windowsSandboxFallbackActive || alreadyHasNoSandbox(process.argv, process.env),
            relaunchAttempted: windowsNoSandboxRelaunchAttempted
          })
        ) {
          return
        }

        windowsNoSandboxRelaunchAttempted = true
        windowsSandboxFallbackActive = true
        windowsSandboxFallbackSticky = true
        windowsSandboxFallbackReason = 'renderer-crash-loop'

        try {
          writeSandboxMarker(app.getPath('userData'), fallbackMarker('renderer-crash-loop', app.getVersion()))
        } catch {
          void 0
        }

        rememberLog('[renderer] Windows sandbox crash loop detected; relaunching once with --no-sandbox (#38216)')

        try {
          app.relaunch({ args: buildNoSandboxRelaunchArgs(process.argv.slice(1)) })
          void exitAfterBackendShutdown(0)
        } catch (err) {
          rememberLog(`[renderer] --no-sandbox relaunch failed: ${err?.message || err}`)
        }
      },
      // #95575: a renderer that repeatedly fails to load (torn bundle after
      // an update, file locked by AV, missing index.html) used to sit on a
      // white screen with only a desktop.log line. Once the bounded reload
      // budget is exhausted, put the VISIBLE error page in the window so the
      // user sees what is wrong and how to repair it.
      onFailedLoadBudgetExhausted: details => {
        rememberLog(
          `[renderer:main] load-failure budget exhausted; loading visible error page` +
            `${details?.errorCode === undefined ? '' : ` code=${String(details.errorCode)}`}`
        )
        void loadRendererLoadErrorPage(mainWindow, {
          errorCode: details?.errorCode,
          url: details?.url,
          errorDescription: 'The desktop renderer failed to load repeatedly after the update.',
          repairHint: 'hermes desktop --force-build',
          reloadUrl: DEV_SERVER || pathToFileURL(resolveRendererIndex()).toString()
        })
      }
    },
    reloadWindowMs: RENDERER_RELOAD_WINDOW_MS,
    reloadMax: RENDERER_RELOAD_MAX,
    recentReloadTimesRef: rendererReloadTimesRef,
    reloadOnFailedLoad: true
  })

  // Electron always passes the event first. The canonical (Electron 36+) shape
  // is (event, messageDetails); the deprecated positional shape is
  // (event, level, message, line, sourceId). Handled in renderer-log.ts, which
  // every renderer-content window shares (#79428: crashes in secondary/HUD/
  // quick-entry windows used to vanish without a trace).
  attachRendererConsoleCapture(mainWindow, 'main', rememberLog)

  // #95575: a torn renderer bundle (update replaced the app while its files
  // were locked) loads fine and then dies on the first lazy import — a white
  // screen with no error surface. resolveRendererIndex already logs the torn
  // copies; here we refuse to load one into the PRIMARY window and put the
  // visible repair page in it instead. The Reload button re-attempts the
  // bundle in case the file lock cleared since boot.
  const rendererIndex = DEV_SERVER ? null : resolveRendererIndex()
  const tornAssets = rendererIndex ? missingRendererAssets(rendererIndex) : []

  if (!DEV_SERVER && rendererIndex && tornAssets.length > 0) {
    rememberLog(
      `[renderer] primary window: chosen renderer bundle ${rendererIndex} is incomplete ` +
        `(${tornAssets.length} missing asset(s)); loading visible repair page instead of a white screen`
    )
    void loadRendererLoadErrorPage(mainWindow, {
      errorCode: 'ERR_FILE_NOT_FOUND',
      errorDescription: `The desktop renderer bundle is incomplete after the last update (${tornAssets.length} missing file(s)).`,
      missingAssets: tornAssets,
      repairHint: 'hermes desktop --force-build',
      reloadUrl: pathToFileURL(rendererIndex).toString()
    })
  } else {
    loadWindowUrl(
      mainWindow,
      DEV_SERVER || pathToFileURL(rendererIndex || resolveRendererIndex()).toString(),
      'Renderer'
    )
  }

  // Start the Python backend NOW, in parallel with the renderer load — not on
  // did-finish-load. The backend cold boot (spawn → port announce → /api/status)
  // is the dominant startup cost, and serializing it behind Chromium's load
  // added the whole renderer load time to first-usable-composer. The promise is
  // shared (backendConnectionState), so the renderer's getConnection() joins
  // this in-flight boot instead of duplicating it; early boot-progress events
  // the renderer misses are recovered by its getBootProgress() pull on mount.
  startHermes().catch(error => rememberLog(error.stack || error.message))

  mainWindow.webContents.once('did-finish-load', () => {
    // Zoom restore is handled by wireCommonWindowHandlers (shared with session
    // windows); no need to reapply it here.
    broadcastBootProgress()
    sendWindowStateChanged()
  })
}

export const windowConnectionRoutes = new WindowConnectionRouteRegistry()

export async function fetchJsonForBackend(
  descriptor,
  path,
  opts: { method?: string; body?: unknown; upload?: unknown; timeoutMs?: number } = {}
) {
  const url = `${descriptor.baseUrl}${path}`

  if (descriptor.authMode === 'oauth') {
    // The OAuth cookie path rides electron.net with JSON headers; multipart
    // isn't wired there. Fail loudly rather than corrupting the upload.
    if (opts.upload) {
      throw new Error('File uploads are not supported against OAuth-gated remote backends yet.')
    }

    const nativeAt = await ensureNativeAccessToken(descriptor.baseUrl).catch(() => null)

    if (nativeAt) {
      return fetchJson(url, null, {
        method: opts.method,
        body: opts.body,
        timeoutMs: opts.timeoutMs,
        bearer: nativeAt,
        headers: descriptor.headers
      })
    }

    return fetchJsonViaOauthSession(url, {
      method: opts.method,
      body: opts.body,
      timeoutMs: opts.timeoutMs,
      headers: descriptor.headers
    })
  }

  return fetchJson(url, descriptor.token, {
    method: opts.method,
    body: opts.body,
    upload: opts.upload,
    timeoutMs: opts.timeoutMs,
    headers: descriptor.headers
  })
}

export const streamThrottle = createStreamThrottle()

export const terminalIpc = registerTerminalIpc({
  isWindows: IS_WINDOWS,
  findOnPath,
  rememberLog,
  activeSshTerminalTarget,
  ensureBackend: webContentsId => ensureTerminalBackend(webContentsId),
  getSshConnectionState: scope => sshConnections.get(scope)
})

export const DEEPLINK_SCHEMES = DEV_SERVER ? ['hermes-dev', 'hermes'] : ['hermes']

export let _rendererReadyForDeepLink = false

export const _gotSingleInstanceLock = app.requestSingleInstanceLock()

export const isPrimaryInstance = _gotSingleInstanceLock

export function getF12Blocked() {
  return f12Blocked
}

export function setF12Blocked(value: any) {
  f12Blocked = value
}

export function getWindowsSandboxFallbackActive() {
  return windowsSandboxFallbackActive
}

export function setWindowsSandboxFallbackActive(value: any) {
  windowsSandboxFallbackActive = value
}

export function getWindowsSandboxFallbackSticky() {
  return windowsSandboxFallbackSticky
}

export function setWindowsSandboxFallbackSticky(value: any) {
  windowsSandboxFallbackSticky = value
}

export function getWindowsSandboxFallbackReason() {
  return windowsSandboxFallbackReason
}

export function setWindowsSandboxFallbackReason(value: any) {
  windowsSandboxFallbackReason = value
}

export function getWindowsNoSandboxRelaunchAttempted() {
  return windowsNoSandboxRelaunchAttempted
}

export function setWindowsNoSandboxRelaunchAttempted(value: any) {
  windowsNoSandboxRelaunchAttempted = value
}

export function getMainWindow() {
  return mainWindow
}

export function setMainWindow(value: any) {
  mainWindow = value
}

export function getSoftRehomeInProgress() {
  return softRehomeInProgress
}

export function setSoftRehomeInProgress(value: any) {
  softRehomeInProgress = value
}

export function getPoolLimits() {
  return poolLimits
}

export function setPoolLimits(value: any) {
  poolLimits = value
}

export function getPoolIdleReaper() {
  return poolIdleReaper
}

export function setPoolIdleReaper(value: any) {
  poolIdleReaper = value
}

export function getBackendOrphanReapPromise() {
  return backendOrphanReapPromise
}

export function setBackendOrphanReapPromise(value: any) {
  backendOrphanReapPromise = value
}

export function getBootstrapFailure() {
  return bootstrapFailure
}

export function setBootstrapFailure(value: any) {
  bootstrapFailure = value
}

export function getBackendStartFailure() {
  return backendStartFailure
}

export function setBackendStartFailure(value: any) {
  backendStartFailure = value
}

export function getRemoteReauthFailure() {
  return remoteReauthFailure
}

export function setRemoteReauthFailure(value: any) {
  remoteReauthFailure = value
}

export function getBootstrapAbortController() {
  return bootstrapAbortController
}

export function setBootstrapAbortController(value: any) {
  bootstrapAbortController = value
}

export function getBootstrapRepairRequested() {
  return bootstrapRepairRequested
}

export function setBootstrapRepairRequested(value: any) {
  bootstrapRepairRequested = value
}

export function getBootstrapRepairAttempt() {
  return bootstrapRepairAttempt
}

export function setBootstrapRepairAttempt(value: any) {
  bootstrapRepairAttempt = value
}

export function getConnectionConfigCache() {
  return connectionConfigCache
}

export function setConnectionConfigCache(value: any) {
  connectionConfigCache = value
}

export function getConnectionConfigCacheMtime() {
  return connectionConfigCacheMtime
}

export function setConnectionConfigCacheMtime(value: any) {
  connectionConfigCacheMtime = value
}

export function getConnectionRegistryCache() {
  return connectionRegistryCache
}

export function setConnectionRegistryCache(value: any) {
  connectionRegistryCache = value
}

export function getConnectionRegistryCacheMtime() {
  return connectionRegistryCacheMtime
}

export function setConnectionRegistryCacheMtime(value: any) {
  connectionRegistryCacheMtime = value
}

export function getPreviewShortcutActive() {
  return previewShortcutActive
}

export function setPreviewShortcutActive(value: any) {
  previewShortcutActive = value
}

export function getNativeThemeListenerInstalled() {
  return nativeThemeListenerInstalled
}

export function setNativeThemeListenerInstalled(value: any) {
  nativeThemeListenerInstalled = value
}

export function getBootProgressState() {
  return bootProgressState
}

export function setBootProgressState(value: any) {
  bootProgressState = value
}

export function getBootstrapState() {
  return bootstrapState
}

export function setBootstrapState(value: any) {
  bootstrapState = value
}

export function get_gitBinaryCache() {
  return _gitBinaryCache
}

export function set_gitBinaryCache(value: any) {
  _gitBinaryCache = value
}

export function getUpdateInFlight() {
  return updateInFlight
}

export function setUpdateInFlight(value: any) {
  updateInFlight = value
}

export function getIsQuittingForHandoff() {
  return isQuittingForHandoff
}

export function setIsQuittingForHandoff(value: any) {
  isQuittingForHandoff = value
}

export function getPluginCompatNoticeShown() {
  return pluginCompatNoticeShown
}

export function setPluginCompatNoticeShown(value: any) {
  pluginCompatNoticeShown = value
}

export function get_secretStoragePolicy() {
  return _secretStoragePolicy
}

export function set_secretStoragePolicy(value: any) {
  _secretStoragePolicy = value
}

export function getPetOverlayWindow() {
  return petOverlayWindow
}

export function setPetOverlayWindow(value: any) {
  petOverlayWindow = value
}

export function get_rendererReadyForDeepLink() {
  return _rendererReadyForDeepLink
}

export function set_rendererReadyForDeepLink(value: any) {
  _rendererReadyForDeepLink = value
}
