import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import tls from 'node:tls'
import { pathToFileURL } from 'node:url'

import {
  app,
  BrowserWindow,
  dialog,
  net as electronNet,
  Menu,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  safeStorage,
  screen,
  session
} from 'electron'

import {
  closePreviewWatchers,
  dispatchRegistryApiRequest,
  expandUserPath,
  extensionForMimeType,
  fetchLinkTitle,
  getDataUrlReadMaxMb,
  getJsonForBackend,
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
  TITLE_BYTE_BUDGET,
  TITLE_USER_AGENT,
  watchDirectory,
  watchPreviewFile,
} from './composition/api-proxy-composition'
import {
  _clearNativeTokens,
  _storeNativeTokens,
  activeSshTerminalTarget,
  applyUpdates,
  backendConnectionState,
  backendDialClaims,
  backendPool,
  backendShutdown,
  broadcastBootstrapEvent,
  closePetOverlay,
  createSessionWindow,
  createWindow,
  decryptDesktopSecret,
  decryptRemoteHeaders,
  DEFAULT_UPDATE_BRANCH,
  defaultProjectDirConfigPath,
  DESKTOP_LOG_PATH,
  DEV_CDP,
  directoryExists,
  ensureBackend,
  ensureNativeAccessToken,
  ensureRegistryBackend,
  ensureTerminalBackend,
  exitAfterBackendShutdown,
  fetchJson,
  fetchJsonForBackend,
  fetchJsonViaOauthSession,
  fetchPublicJson,
  fileExists,
  findOnPath,
  gatewayAuthProviders,
  get_rendererReadyForDeepLink,
  getBackendStartFailure,
  getBootProgressState,
  getBootstrapAbortController,
  getBootstrapFailure,
  getBootstrapRepairAttempt,
  getBootstrapRepairRequested,
  getBootstrapState,
  getF12Blocked,
  getFirstRunSetupGate,
  getIsQuittingForHandoff,
  getMainWindow,
  getOauthSession,
  getOauthSessionForUrl,
  getPetOverlayWindow,
  getPoolLimits,
  getPreviewShortcutActive,
  getRemoteReauthFailure,
  getWindowsNoSandboxRelaunchAttempted,
  getWindowsSandboxFallbackActive,
  getWindowsSandboxFallbackSticky,
  GLASS_SUPPORTED,
  globalRemoteActive,
  hasLiveOauthSession,
  hasNativeSession,
  HERMES_HOME,
  INSTALL_STAMP,
  IS_MAC,
  IS_PACKAGED,
  IS_WINDOWS,
  IS_WSL,
  isPackagedInstallPath,
  isPrimaryInstance,
  lastContextMenuPoint,
  loadInstallStamp,
  managedConnectionUpdateGate,
  managedPrimaryRestoreOwners,
  mintGatewayWsTicket,
  openExternalUrl,
  PASSWORD_STORE,
  postJsonNoAuth,
  primaryBackendIsRemote,
  primaryProfileKey,
  PROFILE_NAME_RE,
  profileDeletionGate,
  profileHasRemoteOverride,
  readActiveDesktopProfile,
  readDefaultProjectDir,
  readDesktopConnectionConfig,
  readDesktopConnectionsRegistry,
  readDesktopUpdateConfig,
  readManagedSshRecoveryRecords,
  readWindowState,
  rememberRemoteWsHeaders,
  REMOTE_DISPLAY_REASON,
  resetBootstrapSnapshot,
  resolveGitBinary,
  resolveHermesCwd,
  resolveRemoteBackend,
  resolveUpdateRoot,
  secretStoragePolicy,
  set_rendererReadyForDeepLink,
  setAndPersistZoomLevel,
  setBackendStartFailure,
  setBootstrapFailure,
  setBootstrapRepairAttempt,
  setBootstrapRepairRequested,
  setF12Blocked,
  setPreviewShortcutActive,
  setRemoteReauthFailure,
  setWindowsNoSandboxRelaunchAttempted,
  setWindowsSandboxFallbackActive,
  setWindowsSandboxFallbackReason,
  setWindowsSandboxFallbackSticky,
  SKIP_QUIT_CONFIRM,
  spawnPriorityFrom,
  sshBootstrapCoordinator,
  sshConnections,
  sshRememberLog,
  sshScopeKey,
  startHermes,
  stopPoolBackend,
  streamThrottle,
  teardownSshConnection,
  terminalIpc,
  TRANSLUCENCY_SUPPORTED,
  USER_DATA_OVERRIDE,
  wakeIndicatorController,
  windowConnectionRoutes,
  writeActiveDesktopProfile,
  writeDesktopConnectionConfig,
  writeDesktopConnectionsRegistry,
  writeDesktopUpdateConfig,
} from './composition/bootstrap-env-composition'
import {
  discoverCloudAgents,
  hasLivePortalSession,
  hasOauthSessionCookie,
  hasPortalAccessToken,
  openOauthLoginWindow,
  openPortalLoginWindow,
  renewPortalAccessSilently,
  resolvePortalBaseUrl,
} from './host-capabilities/credentials/cloud-oauth'
import {
  applySecretStorageEncryption,
  broadcastConnectionsChanged,
  coerceDesktopConnectionConfig,
  connectionInstallIds,
  migrateLegacyEncryptedSecretsOnce,
  probeSecureTokenStorage,
  sanitizeDesktopConnectionConfig,
  sanitizeRegistryConnection,
  saveRegistryConnection,
  stopRegistryConnectionBackends,
} from './legacy-hermes/connections-composition'
import {
  _extractDeepLink,
  get_pendingDeepLink,
  handleDeepLink,
  HERMES_PROTOCOL,
  registerDeepLinkProtocol,
  set_pendingDeepLink,
} from './app/deep-link-composition'
import { registerApiProxyIpc } from './ipc/api-proxy-ipc'
import { registerBackendIpc } from './ipc/backend-ipc'
import { registerConnectionIpc } from './ipc/connection-ipc'
import { registerFilesIpc } from './ipc/files-ipc'
import { registerPreviewIpc } from './ipc/preview-ipc'
import { registerSystemIpc } from './ipc/system-ipc'
import { registerThemeIpc } from './ipc/theme-ipc'
import { registerWindowIpc } from './ipc/window-ipc'
import {
  cancelScheduledDesktopLogFlush,
  flushDesktopLogBufferSync,
  initDesktopLogBuffer,
  rememberLog
} from './app/log-buffer'
import {
  initMediaProtocolBridge
} from './host-capabilities/preview/media-bridge'
import {
  resolveHermesVersion,
} from './legacy-hermes/paths'
import {
  applySpawnPriority,
  installRemoteHeaderRules,
  managedConnectionRecoveries,
  managedConnectionUpdates,
  MAX_BOOTSTRAP_REPAIR_SOFT_ATTEMPTS,
  recoverManagedSshUpdate,
  remoteLiveness,
  remoteRevalidation,
  resetHermesConnection,
  setPoolLimits,
  updateManagedSshConnection,
} from './legacy-hermes/runtime-composition'
import {
  checkUpdates,
  getUninstallSummary,
  runDesktopUninstall,
} from './update/updates-composition'
import {
  getTranslucencyState,
  writePersistedTranslucency
} from './windows/window-theme'
import {
  browserWindows,
  buildApplicationMenu,
  closeHudWindow,
  closeQuickEntryWindow,
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
  persistHudState,
  quickEntryShortcut,
  readHudState,
  setHudSessionId,
  setHudWindow,
  setQuickEntryLastState,
  setQuickEntryWindow,
  spawnBrowserWindow,
} from './windows/windows-composition'
import { ensureWslWindowsFonts } from './host-capabilities/platform/wsl-fonts'
import { describeDevCdpDecision } from './app/dev-cdp'
import { installEmbedReferer } from './security/embed-referer'
import { createEventDeduper } from './app/event-dedupe'
import {
  installFoundInPageForwarder
} from './windows/find-in-page'
import { registerMcpOauthCallbackIpc } from './host-capabilities/credentials/mcp-oauth-callback-ipc'
import { registerFsIpc } from './host-capabilities/filesystem/fs-ipc'
import {
  enableBasicPasswordStoreEncryption,
  resolveReadableFileForIpc,
  resolveRequestedPathForIpc
} from './host-capabilities/filesystem/hardening'
import { registerGitIpc } from './host-capabilities/git/git-ipc'
import { ensureLoginShellPath } from './host-capabilities/platform/shell-path'
import { createSshProbeConnection, pickLocalPort } from './host-capabilities/platform/ssh-connection'
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
import { setActiveGatewayProfile, setWslBridgeProfileState } from './host-capabilities/platform/wsl-path-bridge'
import { type FaviconIo, resolveFavicon } from './host-capabilities/preview/favicon'
import { createMediaProtocolHandler, MEDIA_PROTOCOL } from './host-capabilities/preview/media-protocol'
import { PreviewReachRegistry } from './host-capabilities/preview/preview-reach'
import { applyHudResetBounds, defaultHudBounds } from './windows/hud-geometry'
import { registerHudIpc } from './ipc/hud-ipc'
import { destroyKeepaliveAgents } from './legacy-hermes/api-transport'
import { sshQuitShouldBlock } from './legacy-hermes/connection-apply'
import {
  authModeFromStatus,
  buildGatewayWsUrlWithTicket,
  connectionScopeKey,
  modeIsRemoteLike,
  normalizeRemoteBaseUrl,
  normalizeSshConfig,
  normAuthMode,
  resolveTestWsUrl
} from './legacy-hermes/connection-config'
import {
  backendScopeKey,
  parseBackendScopeKey,
  rememberSshEnumeration,
  resolveRegistryLocalRoute,
  shouldDeferLocalEnumeration,
  shouldRetrySshInventory
} from './legacy-hermes/connection-registry'
import type { RosterProfileMetadata } from './legacy-hermes/connection-registry'
import { probeGatewayWebSocket } from './legacy-hermes/gateway-ws-probe'
import {
  refusedManagedSshUpdate,
  waitForManagedUpdateOperations
} from './legacy-hermes/managed-ssh-update'
import { poolTouchKeys } from './legacy-hermes/pool-touch-scope'
import * as remoteLifecycle from './legacy-hermes/remote-lifecycle'
import {
  attachPowerResumeRemoteRevalidation,
  revalidatePooledRemoteBackends,
  revalidateSuspectPooledRemoteBackends
} from './legacy-hermes/remote-liveness'
import {
  createRegistryGatewayWsUrlHandler
} from './legacy-hermes/remote-ws-headers'
import { fetchRosterSourceData } from './legacy-hermes/roster-source-fetch'
import {
  detectRemotePlatform,
  helper
} from './legacy-hermes/windows-remote-lifecycle'
import { ensureMainWindow } from './windows/main-window-lifecycle'
import { registerNativeNotifications } from './ipc/notification-ipc'
import { registerPetOverlayIpc } from './ipc/pet-overlay-ipc'
import { createKeepAwake } from './app/power-save'
import { sanitizeQuickEntrySettings } from './windows/quick-entry'
import { type ActiveWork, mergeActiveWork, quitPromptFor } from './app/quit-guard'
import {
  instanceWindowBounds
} from './windows/session-windows'
import {
  computeWindowOptions
} from './windows/window-state'



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

function continueFirstRunLocalBootstrap() {
  getFirstRunSetupGate().continueLocal()
}

function abandonFirstRunSetupChoiceForRemoteApply() {
  const gate = getFirstRunSetupGate()

  if (!gate.hasWaiter()) {
    return false
  }

  const resumedGatedConnection = gate.abandonForRemoteApply()

  if (resumedGatedConnection) {
    broadcastBootstrapEvent({ type: 'dismissed' })
  }

  return resumedGatedConnection
}

let _ghBinaryCache = null

function resolveGhBinary() {
  if (_ghBinaryCache) {
    return _ghBinaryCache
  }

  const candidates = []

  if (IS_WINDOWS) {
    candidates.push(path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'GitHub CLI', 'gh.exe'))

    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'gh.exe'))
    }
  } else {
    const home = app.getPath('home')
    candidates.push('/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh', path.join(home, '.local', 'bin', 'gh'))
  }

  _ghBinaryCache = candidates.find(fileExists) || findOnPath('gh') || 'gh'

  return _ghBinaryCache
}

function registerMediaProtocol() {
  const handler = createMediaProtocolHandler({
    ensureRemoteBearer: baseUrl => ensureNativeAccessToken(baseUrl).catch(() => null),
    fetchLocal: (resolvedPath, headers, method) =>
      electronNet.fetch(pathToFileURL(resolvedPath).toString(), {
        bypassCustomProtocolHandlers: true,
        credentials: 'omit',
        headers,
        method
      }),
    fetchRemote: (url, headers, method) =>
      electronNet.fetch(url, {
        bypassCustomProtocolHandlers: true,
        credentials: 'omit',
        headers,
        method
      }),
    fetchRemoteWithCookies: (url, headers, method) => {
      const oauthSession = getOauthSessionForUrl(url)

      if (!getOauthSession()) {
        throw new Error('OAuth session partition is unavailable.')
      }

      return getOauthSession().fetch(url, {
        bypassCustomProtocolHandlers: true,
        credentials: 'include',
        headers,
        method
      })
    },
    resolveLocalFile: async filePath => {
      const { resolvedPath } = await resolveReadableFileForIpc(filePath, { purpose: 'Media stream' })

      return resolvedPath
    },
    // Claim-guarded (#90812): a media stream load can race a renderer's own
    // reconnect dial for the same (connectionId, profile) scope; coalescing
    // here avoids bootstrapping a second SSH tunnel / remote dashboard.
    resolveRemoteConnection: ({ connectionId, profile }) =>
      backendDialClaims.run(backendScopeKey(connectionId, profile), () =>
        connectionId ? ensureRegistryBackend(connectionId, profile) : ensureBackend(profile)
      )
  })

  protocol.handle(MEDIA_PROTOCOL, handler)
}

let quitPromptOpen = false

let quitConfirmedWithActiveWork = false

function sanitizeWorkspaceCwd(cwd) {
  const trimmed = typeof cwd === 'string' ? cwd.trim() : ''

  if (!trimmed || isPackagedInstallPath(trimmed)) {
    return { cwd: resolveHermesCwd(), sanitized: Boolean(trimmed) }
  }

  try {
    const resolved = path.resolve(trimmed)

    if (directoryExists(resolved)) {
      return { cwd: resolved, sanitized: false }
    }
  } catch {
    // Fall through to the resolved default.
  }

  return { cwd: resolveHermesCwd(), sanitized: Boolean(trimmed) }
}

function writeDefaultProjectDir(dir) {
  const target = defaultProjectDirConfigPath()
  const payload = dir ? JSON.stringify({ dir: path.resolve(dir) }, null, 2) : JSON.stringify({}, null, 2)

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, payload, 'utf8')
  } catch (error) {
    rememberLog(`[settings] write default project dir failed: ${error.message}`)
  }
}

const FAVICON_CACHE_PATH = path.join(app.getPath('userData'), 'favicon-cache.json')

const FAVICON_CACHE_LIMIT = 400

const FAVICON_TTL_MS = 30 * 24 * 60 * 60 * 1000

const FAVICON_MISS_TTL_MS = 12 * 60 * 60 * 1000

const FAVICON_TIMEOUT_MS = 6000

const FAVICON_MAX_BYTES = 256 * 1024

const FAVICON_WRITE_DEBOUNCE_MS = 3000

let faviconCache: Map<string, { at: number; icon: string }> | null = null

let faviconWriteTimer: null | ReturnType<typeof setTimeout> = null

const faviconInflight = new Map<string, Promise<string>>()

function faviconCacheKey(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./i, '').toLowerCase()
  } catch {
    return ''
  }
}

function loadFaviconCache(): Map<string, { at: number; icon: string }> {
  if (faviconCache) {
    return faviconCache
  }

  faviconCache = new Map()

  try {
    const raw = JSON.parse(fs.readFileSync(FAVICON_CACHE_PATH, 'utf8'))

    for (const [host, entry] of Object.entries(raw?.icons ?? {})) {
      const at = Number((entry as { at?: number })?.at)
      const icon = String((entry as { icon?: string })?.icon ?? '')

      if (Number.isFinite(at) && Date.now() - at < (icon ? FAVICON_TTL_MS : FAVICON_MISS_TTL_MS)) {
        faviconCache.set(host, { at, icon })
      }
    }
  } catch {
    // No cache yet, or it's unreadable — resolving again is the whole cost.
  }

  return faviconCache
}

function saveFaviconCacheSoon() {
  if (faviconWriteTimer) {
    return
  }

  faviconWriteTimer = setTimeout(() => {
    faviconWriteTimer = null

    try {
      const icons = Object.fromEntries(loadFaviconCache())

      fs.writeFileSync(FAVICON_CACHE_PATH, JSON.stringify({ icons }), 'utf8')
    } catch {
      // Cache is an optimization; failing to persist it costs one refetch.
    }
  }, FAVICON_WRITE_DEBOUNCE_MS)

  faviconWriteTimer.unref?.()
}

async function faviconFetch(url: string, accept: string) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS)

  try {
    return await electronNet.fetch(url, {
      // Same browser-shaped identity the title fetcher uses: a plain Electron
      // UA gets a challenge page from anything behind a bot wall.
      headers: { Accept: accept, 'Accept-Language': 'en-US,en;q=0.7', 'User-Agent': TITLE_USER_AGENT },
      redirect: 'follow',
      signal: controller.signal
    })
  } finally {
    clearTimeout(timer)
  }
}

const faviconIo: FaviconIo = {
  fetchImage: async url => {
    const response = await faviconFetch(url, 'image/avif,image/webp,image/svg+xml,image/*;q=0.8,*/*;q=0.5')

    if (!response.ok) {
      return null
    }

    const buffer = await response.arrayBuffer()

    if (buffer.byteLength === 0 || buffer.byteLength > FAVICON_MAX_BYTES) {
      return null
    }

    return { bytes: new Uint8Array(buffer), mime: response.headers.get('content-type') ?? '' }
  },
  fetchText: async url => {
    const response = await faviconFetch(url, 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5')

    return response.ok ? (await response.text()).slice(0, TITLE_BYTE_BUDGET * 2) : ''
  }
}

function resolveFaviconCached(rawUrl: string): Promise<string> {
  const key = faviconCacheKey(String(rawUrl || '').trim())

  if (!key) {
    return Promise.resolve('')
  }

  const cache = loadFaviconCache()
  const hit = cache.get(key)

  if (hit && Date.now() - hit.at < (hit.icon ? FAVICON_TTL_MS : FAVICON_MISS_TTL_MS)) {
    return Promise.resolve(hit.icon)
  }

  const inflight = faviconInflight.get(key)

  if (inflight) {
    return inflight
  }

  const pending = resolveFavicon(rawUrl, faviconIo)
    .catch(() => '')
    .then(icon => {
      if (cache.size >= FAVICON_CACHE_LIMIT) {
        cache.delete(cache.keys().next().value)
      }

      cache.set(key, { at: Date.now(), icon })
      saveFaviconCacheSoon()
      faviconInflight.delete(key)

      return icon
    })

  faviconInflight.set(key, pending)

  return pending
}

async function writeComposerImage(buffer, ext = '.png', name = '') {
  const rawExt = String(ext || '.png')
    .trim()
    .toLowerCase()

  const normalizedExt = rawExt.startsWith('.') ? rawExt : `.${rawExt}`
  const safeExt = /^\.[a-z0-9]{1,5}$/.test(normalizedExt) ? normalizedExt : '.png'
  const dir = path.join(app.getPath('userData'), 'composer-images')
  await fs.promises.mkdir(dir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const random = crypto.randomBytes(3).toString('hex')

  const baseName = String(name || '')
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, '')

  const safeName = (baseName || '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80)

  const fileName = safeName ? `${safeName}_${random}${safeExt}` : `composer_${stamp}_${random}${safeExt}`
  const filePath = path.join(dir, fileName)
  await fs.promises.writeFile(filePath, buffer)

  return filePath
}

function sendPowerResume() {
  if (!getMainWindow() || getMainWindow().isDestroyed()) {
    return
  }

  const { webContents } = getMainWindow()

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:power-resume')
}

let powerResumeRegistered = false

let onBatteryPower: boolean | null = null

function broadcastBatteryState(next: boolean) {
  if (onBatteryPower === next) {
    return
  }

  onBatteryPower = next

  for (const win of BrowserWindow.getAllWindows()) {
    const { webContents } = win

    if (webContents && !webContents.isDestroyed()) {
      webContents.send('hermes:power-battery', next)
    }
  }
}

function registerPowerResumeListeners() {
  if (powerResumeRegistered) {
    return
  }

  powerResumeRegistered = true

  try {
    // 'resume' covers sleep/wake; 'unlock-screen' covers lock/unlock without a
    // full suspend. Either can drop an idle socket.
    powerMonitor.on('resume', sendPowerResume)
    powerMonitor.on('unlock-screen', sendPowerResume)
    powerMonitor.on('on-battery', () => broadcastBatteryState(true))
    powerMonitor.on('on-ac', () => broadcastBatteryState(false))
    onBatteryPower = powerMonitor.isOnBatteryPower()
    // Pooled remote/SSH backends are also suspect after a wake (#93910): the
    // renderer nudge above only re-drives the PRIMARY socket, while pooled
    // tunnels have no renderer loop of their own. Bounded + coalesced inside;
    // never a hot loop.
    attachPowerResumeRemoteRevalidation({
      log: rememberLog,
      powerMonitor,
      revalidate: () => revalidateSuspectPoolAfterResume()
    })
  } catch {
    // powerMonitor is unavailable before app 'ready' on some platforms; the
    // caller registers after 'ready', so this should not normally throw.
  }
}

function installDownloadHandling() {
  session.defaultSession.on('will-download', (_event, item) => {
    const suggested = item.getFilename() || 'download'
    const hasExtension = Boolean(path.extname(suggested))
    const extension = hasExtension ? '' : extensionForMimeType(item.getMimeType())
    const filename = `${suggested}${extension}`

    try {
      item.setSaveDialogOptions({
        title: 'Save File',
        defaultPath: path.join(app.getPath('downloads'), filename),
        filters:
          extension || /^image\//i.test(item.getMimeType() || '')
            ? [
                { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            : undefined
      })
    } catch {
      // No Downloads directory to offer — keep Chromium's default prompt.
    }
  })
}

async function clearOauthSession(baseUrl) {
  const sess = getOauthSessionForUrl(baseUrl)

  if (!sess) {
    return
  }

  try {
    const cookies = await sess.cookies.get(baseUrl ? { url: baseUrl } : {})
    await Promise.all(
      cookies.map(c => {
        const scheme = c.secure ? 'https' : 'http'
        const cookieUrl = `${scheme}://${c.domain.replace(/^\./, '')}${c.path || '/'}`

        return sess.cookies.remove(cookieUrl, c.name).catch(() => undefined)
      })
    )
  } catch {
    // Best effort — a stale cookie self-expires anyway.
  }
}

async function freshGatewayWsUrl(profile) {
  // Mint for the requested profile's backend, NOT always the primary. The
  // renderer re-mints right before every gateway.connect(); when swapping to a
  // pooled profile we must return THAT backend's ws URL, otherwise the connect
  // silently lands back on the primary (default) backend and writes sessions to
  // the wrong profile's DB. A null/empty profile resolves to the primary, so
  // legacy callers and single-profile users are unchanged.
  const connection = await ensureBackend(profile)

  if (connection.authMode === 'oauth') {
    const ticket = await mintGatewayWsTicket(connection.baseUrl, connection.headers)
    const wsUrl = buildGatewayWsUrlWithTicket(connection.baseUrl, ticket)

    rememberRemoteWsHeaders(wsUrl, connection.headers)

    return wsUrl
  }

  // Local/token: the cached wsUrl already carries the (long-lived) token.
  rememberRemoteWsHeaders(connection.wsUrl, connection.headers)

  return connection.wsUrl
}

async function cloudAgentSilentSignIn(dashboardUrl) {
  const baseUrl = normalizeRemoteBaseUrl(dashboardUrl)

  // Pre-req: a live portal session must exist, or this would surface an
  // interactive prompt rather than a silent cascade. Discovery already gates on
  // this, but a selection can arrive after the session lapsed.
  if (!(await hasLivePortalSession())) {
    const err = new Error('Your Hermes Cloud session has expired. Sign in to Hermes Cloud again.') as any
    err.needsCloudLogin = true
    throw err
  }

  // The cascade rides the portal's auto-approve, which needs the short-lived
  // access state just like discovery. If only renewal material survived the
  // restart, mint a fresh access token first so the hidden cascade window
  // auto-SSOs instead of stalling on an interactive chooser (#73495).
  if (!(await hasPortalAccessToken())) {
    await renewPortalAccessSilently()
  }

  await openOauthLoginWindow(baseUrl, { silent: true })

  return { baseUrl, connected: await hasOauthSessionCookie(baseUrl) }
}

function sanitizeConnectionsRegistry(registry = readDesktopConnectionsRegistry()) {
  // Same keyring signal the v1 sanitize exposes: lets the Connections panel
  // offer the plain-text opt-in on keyring-less Linux instead of failing.
  // Policy-aware: never touches safeStorage while encryption is opted out.
  const secureTokenStorage = probeSecureTokenStorage()

  return {
    version: registry.version,
    primary: registry.primary,
    launchMode: registry.launchMode,
    lastUsed: registry.lastUsed,
    secureTokenStorage,
    connections: registry.connections.map(sanitizeRegistryConnection),
    // Surface quarantined-entry NOTICES only (reason + best-effort label) —
    // the raw entries can carry token envelopes and stay in the file (#94246).
    quarantined: (registry.quarantined || []).map(q => ({
      reason: String(q?.reason || 'unknown'),
      label:
        q && q.entry && typeof q.entry === 'object' && typeof (q.entry as any).label === 'string'
          ? (q.entry as any).label
          : ''
    }))
  }
}

let managedUpdateQuitWait: Promise<void> | null = null

let managedUpdateQuitWaitDone = false

function assertCanMutateManagedPrimaryRouting() {
  const durableIds = readManagedSshRecoveryRecords().map(record => record.connectionId)

  const ids = new Set([
    ...managedConnectionUpdates.keys(),
    ...managedConnectionRecoveries.keys(),
    ...managedPrimaryRestoreOwners.keys(),
    ...durableIds
  ])

  if (ids.size > 0) {
    const error: any = new Error(
      `Primary connection routing cannot change while managed SSH update recovery is pending for ${[...ids].join(', ')}.`
    )

    error.code = 'managed-update-in-progress'
    throw error
  }
}

let sshQuitTeardownDone = false

let sshQuitTeardownPromise: Promise<void> | null = null

let backendQuitTeardownDone = false

const previewReachByWebContents = new Map<number, { registry: PreviewReachRegistry; scope: string }>()

async function resetPreviewReach(webContentsId?: number) {
  if (typeof webContentsId === 'number') {
    const current = previewReachByWebContents.get(webContentsId)

    previewReachByWebContents.delete(webContentsId)

    if (current) {
      await current.registry.closeAll()
    }

    return
  }

  const open = [...previewReachByWebContents.values()]

  previewReachByWebContents.clear()
  await Promise.allSettled(open.map(entry => entry.registry.closeAll()))
}

async function reachablePreviewUrl(webContentsId: number, rawUrl: string): Promise<string> {
  let target = activeSshTerminalTarget(webContentsId)

  if (target === 'pending') {
    await ensureTerminalBackend(webContentsId).catch(() => undefined)
    target = activeSshTerminalTarget(webContentsId)
  }

  if (!target || target === 'pending') {
    // No SSH transport behind this renderer's gateway. Another window's
    // forward must never be reused for this preview.
    await resetPreviewReach(webContentsId)

    return rawUrl
  }

  const { scope, ssh } = target as { scope: string; ssh: any }
  let reach = previewReachByWebContents.get(webContentsId)

  if (!reach || reach.scope !== scope) {
    await resetPreviewReach(webContentsId)
    reach = { registry: new PreviewReachRegistry(), scope }
    previewReachByWebContents.set(webContentsId, reach)
  }

  try {
    const rewritten = await reach.registry.resolve(rawUrl, {
      cancel: (localPort, remotePort) => ssh.cancelForward(localPort, remotePort),
      forward: (localPort, remotePort, remoteHost) => ssh.forward(localPort, remotePort, remoteHost),
      isCurrent: () => sshConnections.get(scope)?.ssh === ssh,
      // pickLocalPort predates the typed surface here and infers `unknown`.
      pickLocalPort: () => pickLocalPort() as Promise<number>
    })

    return rewritten || rawUrl
  } catch (error: any) {
    sshRememberLog(`preview reach failed for ${rawUrl}: ${error?.message || error}`)

    return rawUrl
  }
}

async function probeRemoteAuthMode(rawUrl) {
  // Determine how a remote gateway expects callers to authenticate, WITHOUT
  // sending any credentials. ``/api/status`` is public on every Hermes
  // gateway (it backs the portal liveness probe) and reports:
  //   auth_required: true  → OAuth gate is engaged (cookie + ws-ticket auth)
  //   auth_required: false → loopback/--insecure: legacy session-token auth
  // ``/api/auth/providers`` (also public, only meaningful when gated) gives
  // the human-facing provider name(s) for the login button label.
  //
  // The settings UI calls this as the user types a URL so it can render an
  // OAuth login button vs a session-token entry box. Network/parse failures
  // surface as ``reachable: false`` rather than throwing, so a half-typed or
  // unreachable URL degrades to "can't tell yet" instead of a hard error.
  const baseUrl = normalizeRemoteBaseUrl(rawUrl)

  let status

  try {
    status = await fetchPublicJson(`${baseUrl}/api/status`, { timeoutMs: 8_000 })
  } catch (error: any) {
    return {
      baseUrl,
      reachable: false,
      authMode: 'unknown',
      providers: [],
      version: null,
      error: error instanceof Error ? error.message : String(error)
    }
  }

  const authRequired = authModeFromStatus(status) === 'oauth'
  let providers = []

  if (authRequired) {
    // Best-effort: a gated gateway exposes the registered providers so the
    // button can read "Sign in with Nous Research" instead of a generic
    // label, and so a username/password provider can be distinguished from
    // an OAuth-redirect one (``supports_password``). A failure here doesn't
    // change the auth mode, so swallow it.
    try {
      const body = (await fetchPublicJson(`${baseUrl}/api/auth/providers`, { timeoutMs: 8_000 })) as any

      if (Array.isArray(body?.providers)) {
        providers = body.providers
          .filter(p => p && typeof p === 'object')
          .map(p => ({
            name: String(p.name || ''),
            displayName: String(p.display_name || p.name || ''),
            supportsPassword: Boolean(p.supports_password)
          }))
          .filter(p => p.name)
      }
    } catch {
      // Provider listing is optional metadata; the auth mode is already known.
    }
  }

  return {
    baseUrl,
    reachable: true,
    authMode: authRequired ? 'oauth' : 'token',
    providers,
    version: status?.version || null,
    error: null
  }
}

async function testDesktopConnectionConfig(input: any = {}) {
  if (input.mode === 'ssh') {
    const sshConfig = normalizeSshConfig({
      mode: 'ssh',
      host: input.sshHost,
      user: input.sshUser,
      port: input.sshPort,
      keyPath: input.sshKeyPath,
      remoteHermesPath: input.sshRemoteHermesPath
    })

    if (!sshConfig) {
      return { reachable: false, sshError: 'unreachable', error: 'SSH host is required.' }
    }

    const ssh = createSshProbeConnection(
      { host: sshConfig.host, user: sshConfig.user, port: sshConfig.port, keyPath: sshConfig.keyPath },
      { rememberLog: sshRememberLog }
    )

    try {
      // One bounded retry on TIMEOUT only: a cold Windows backend's first
      // PowerShell exec can exceed the budget (observed live), and a timeout is
      // indeterminate — unlike auth/host-key/unreachable, which are verdicts.
      let attempt = 0

      for (;;) {
        try {
          await ssh.open()
          const platform: any = await detectRemotePlatform(ssh, sshConfig.remoteHermesPath || '')
          let hermesPath
          let hermesVersion
          let supported

          if (platform.os === 'Windows') {
            const runtime = platform
            hermesPath = runtime.hermesPath
            const inspection = await helper(ssh, runtime, 'inspect', [runtime.hermesPath])
            hermesVersion = inspection.version
            supported = inspection.supported
          } else {
            hermesPath = await remoteLifecycle.locateHermes(ssh, sshConfig.remoteHermesPath || '')
            hermesVersion = await remoteLifecycle.probeHermesVersion(ssh, hermesPath)
            supported = await remoteLifecycle.remoteSupportsSshOwnership(ssh, hermesPath)
          }

          if (!supported) {
            return {
              reachable: false,
              sshError: 'update-required',
              error: 'Update Hermes on the remote host before connecting with Desktop SSH.'
            }
          }

          return {
            reachable: true,
            sshError: null,
            error: null,
            remotePlatform: `${platform.os}/${platform.arch}`,
            remoteHermesPath: hermesPath,
            remoteHermesVersion: hermesVersion,
            host: sshConfig.user ? `${sshConfig.user}@${sshConfig.host}` : sshConfig.host
          }
        } catch (error: any) {
          if (error?.kind === 'timeout' && attempt === 0) {
            attempt += 1
            sshRememberLog('[ssh] test probe timed out once; retrying')

            continue
          }

          throw error
        }
      }
    } catch (error: any) {
      return { reachable: false, sshError: error.kind || 'unknown', error: error.message }
    } finally {
      try {
        await ssh.close()
      } catch {
        void 0
      }
    }
  }

  const config = coerceDesktopConnectionConfig(input, readDesktopConnectionConfig(), { persistToken: false })
  const key = connectionScopeKey(input.profile)
  // The block under test: a per-profile entry or the global remote. Coerce has
  // already normalized the URL and resolved token inheritance for the scope.
  const block = key ? config.profiles?.[key] || null : config.remote

  const wantRemote =
    modeIsRemoteLike(block?.mode) || (!key && modeIsRemoteLike(config.mode)) || (modeIsRemoteLike(input.mode) && block)

  // Test ``/api/status`` through the connection's real auth path. Self-hosted
  // gateways may protect it, and an anonymous success/failure would not prove
  // that the OAuth cookie/native bearer or configured token is reusable. For
  // a remote config we normalize the URL from the input; for local we fall
  // back to the resolved/started backend.
  let baseUrl
  let token = null
  let authMode = 'token'
  let testHeaders = {}

  if (wantRemote && block?.url) {
    baseUrl = normalizeRemoteBaseUrl(block.url)
    authMode = normAuthMode(block.authMode)
    testHeaders = decryptRemoteHeaders(block.headers)

    if (authMode !== 'oauth') {
      token = decryptDesktopSecret(block.token)
    }
  } else {
    const remote = (await resolveRemoteBackend(key)) || (await startHermes())
    baseUrl = remote.baseUrl
    token = remote.token
    authMode = normAuthMode(remote.authMode)
    testHeaders = remote.headers || {}
  }

  const status = (await fetchConnectionStatus(baseUrl, authMode, token, testHeaders)) as any

  // The HTTP status check above proves the backend is reachable, but the chat
  // surface only works once the renderer's live WebSocket to ``/api/ws``
  // connects — a separate transport with separate server-side guards (Host/
  // Origin, ws-ticket/token auth). Validating only the HTTP side produced a
  // false-positive "reachable" while the real boot still failed with "Could not
  // connect to Hermes gateway". Mirror the renderer's connect here so the test
  // reflects the full path the app actually uses.
  const wsUrl = await resolveTestWsUrl(baseUrl, authMode, token, {
    mintTicket: url => mintGatewayWsTicket(url, testHeaders)
  })

  // Skip the WS leg only when the runtime genuinely lacks a WebSocket (so an
  // older Electron/Node never fails the test spuriously); Electron's main
  // process ships a global WebSocket on every supported version.
  if (wsUrl && typeof globalThis.WebSocket === 'function') {
    const probe = await probeGatewayWebSocket(wsUrl, { WebSocketImpl: globalThis.WebSocket, headers: testHeaders })

    if (!probe.ok) {
      throw new Error(
        `Reached the gateway over HTTP, but the live WebSocket (/api/ws) connection failed: ${probe.reason} ` +
          'The HTTP check can pass while the WebSocket is blocked by a proxy, firewall, or gateway auth/origin guard.'
      )
    }
  }

  return {
    ok: true,
    baseUrl,
    version: status?.version || null
  }
}

async function fetchConnectionStatus(baseUrl, authMode, token, headers = {}) {
  const url = `${baseUrl}/api/status`

  if (authMode === 'oauth') {
    // Native PKCE bearer first, OAuth session cookies second — the same two
    // credentials real traffic uses, in the same order. A refresh failure is
    // NOT a silent downgrade to an anonymous probe: the cookie path is still
    // an authenticated request, and if neither credential works the probe
    // fails, which is the correct answer for a gateway we cannot reach with
    // the credentials we hold.
    const nativeAt = await ensureNativeAccessToken(baseUrl).catch(() => null)

    if (nativeAt) {
      return fetchJson(url, null, { timeoutMs: 8_000, bearer: nativeAt, headers })
    }

    return fetchJsonViaOauthSession(url, { timeoutMs: 8_000, headers })
  }

  return fetchJson(url, token, { timeoutMs: 8_000, headers })
}

function sendConnectionApplied() {
  if (!getMainWindow() || getMainWindow().isDestroyed()) {
    return
  }

  const { webContents } = getMainWindow()

  if (!webContents || webContents.isDestroyed()) {
    return
  }

  webContents.send('hermes:connection:applied')
}

async function resumeManagedSshRecoveries() {
  await Promise.allSettled(readManagedSshRecoveryRecords().map(record => recoverManagedSshUpdate(record)))
}

function touchPoolBackend(profile) {
  for (const key of poolTouchKeys(profile)) {
    const entry = backendPool.get(key)

    if (entry) {
      entry.lastActiveAt = Date.now()

      return
    }
  }
}

function createBrowserWindow(tabId) {
  return browserWindows.openOrFocus(tabId, () => spawnBrowserWindow(tabId))
}

export function nextInstanceBounds() {
  const source = BrowserWindow.getFocusedWindow() || getMainWindow()
  const fallback = computeWindowOptions(readWindowState(), screen.getAllDisplays())
  const base = source && !source.isDestroyed() ? source.getBounds() : null

  return instanceWindowBounds(base, fallback)
}

function resetHudWindowLayout(): boolean {
  if (!getHudWindow() || getHudWindow().isDestroyed()) {
    return false
  }

  const win = getHudWindow()
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const bounds = defaultHudBounds(display?.workArea)

  if (!applyHudResetBounds(win, bounds)) {
    rememberLog('[hud-state] reset layout failed while applying native bounds')

    return false
  }

  persistHudState()

  return true
}

export function hudBounds() {
  // Remembered spot first — validated against the LIVE displays so a HUD
  // parked on an unplugged monitor comes back on-screen instead of lost.
  const saved = readHudState()

  if (saved) {
    const onScreen = screen.getAllDisplays().some(d => {
      const a = d.workArea

      return (
        saved.x < a.x + a.width - 40 &&
        saved.x + saved.width > a.x + 40 &&
        saved.y < a.y + a.height - 40 &&
        saved.y + saved.height > a.y + 40
      )
    })

    if (onScreen) {
      return saved
    }
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display?.workArea

  return defaultHudBounds(area)
}

const QUICK_ENTRY_CONFIG_PATH = path.join(app.getPath('userData'), 'quick-entry.json')

function readQuickEntrySettings() {
  try {
    return sanitizeQuickEntrySettings(JSON.parse(fs.readFileSync(QUICK_ENTRY_CONFIG_PATH, 'utf8')))
  } catch {
    // Missing / unreadable / malformed → shipped defaults (enabled, default chord).
    return sanitizeQuickEntrySettings(undefined)
  }
}

function writeQuickEntrySettings(settings) {
  try {
    fs.mkdirSync(path.dirname(QUICK_ENTRY_CONFIG_PATH), { recursive: true })
    fs.writeFileSync(QUICK_ENTRY_CONFIG_PATH, JSON.stringify(settings, null, 2), 'utf8')
  } catch (error) {
    rememberLog(`[quick-entry] write failed: ${error.message}`)
  }
}

function applyQuickEntrySettings(settings) {
  const state = quickEntryShortcut.apply(settings)

  if (!settings.enabled) {
    // Turning the feature off must not leave an orphan always-on-top window.
    if (getQuickEntryWindow() && !getQuickEntryWindow().isDestroyed()) {
      getQuickEntryWindow().close()
    }

    setQuickEntryWindow(null)
  }

  if (state.error === 'taken') {
    rememberLog(`[quick-entry] shortcut ${state.shortcut} is already taken by another application`)
  } else if (state.error === 'invalid') {
    rememberLog(`[quick-entry] shortcut ${state.shortcut} is not a valid accelerator`)
  }

  return { ...state, enabled: settings.enabled }
}

const windowConnectionRouteOwners = new Set<number>()

function revalidatePool() {
  return revalidatePooledRemoteBackends({
    entries: backendPool.entries(),
    log: rememberLog,
    probe: (connection, path, options) => fetchJsonForBackend(connection, path, options),
    stopBackend: stopPoolBackend,
    tracker: remoteLiveness
  })
}

function redialPoolBackendAfterResume(poolKey: string) {
  const { connectionId, profile } = parseBackendScopeKey(poolKey)

  return backendDialClaims.run(poolKey, () =>
    connectionId ? ensureRegistryBackend(connectionId, profile) : ensureBackend(profile)
  )
}

const suspectPoolSweepScope = {}

function revalidateSuspectPoolAfterResume() {
  return remoteRevalidation.run(suspectPoolSweepScope, () =>
    revalidateSuspectPooledRemoteBackends({
      entries: backendPool.entries(),
      log: rememberLog,
      probe: (connection, path, options) => fetchJsonForBackend(connection, path, options),
      rebuild: poolKey => redialPoolBackendAfterResume(poolKey),
      retire: async poolKey => {
        await stopPoolBackend(poolKey)
        // The pool key doubles as the SSH scope for registry SSH backends and
        // resolves through sshScopeKey() for bare-profile remotes; both
        // teardown calls no-op when the scope holds no SSH state.
        await sshBootstrapCoordinator.cancelAndWait(poolKey)
        await teardownSshConnection(poolKey)
      },
      tracker: remoteLiveness
    })
  )
}

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
  resetHudLayout: resetHudWindowLayout,
  setHudSessionId: value => {
    setHudSessionId(value)
  }
})

const sshRosterCache = new Map<string, string[]>()

const sshInventoryAttemptedAt = new Map<string, number>()

const SSH_INVENTORY_RETRY_MS = 60_000

const INSTALL_ID_TTL_MS = 5 * 60_000

const INSTALL_ID_NEGATIVE_TTL_MS = 60_000

function rememberConnectionInstallId(connectionId: string, statusBody: any) {
  const raw = statusBody && typeof statusBody === 'object' ? statusBody.install_id : undefined
  const id = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
  connectionInstallIds.set(connectionId, { id, ts: Date.now() })

  return id
}

async function probeConnectionInstallId(connectionId: string, descriptor: any): Promise<string | undefined> {
  const cached = connectionInstallIds.get(connectionId)

  if (cached && Date.now() - cached.ts < (cached.id ? INSTALL_ID_TTL_MS : INSTALL_ID_NEGATIVE_TTL_MS)) {
    return cached.id
  }

  try {
    const status: any = await getJsonForBackend(descriptor, '/api/status', { timeoutMs: 8_000 })

    return rememberConnectionInstallId(connectionId, status)
  } catch {
    // Keep any previously-known id (identity is stable; a transient fetch
    // failure must not flap the roster collapse), but do not cache a MISS
    // over it.
    if (cached?.id) {
      return cached.id
    }

    connectionInstallIds.set(connectionId, { id: undefined, ts: Date.now() })

    return undefined
  }
}

async function probeSshProfileInventory(connection) {
  if (
    !shouldRetrySshInventory(
      sshRosterCache.has(connection.id),
      sshInventoryAttemptedAt.get(connection.id),
      Date.now(),
      SSH_INVENTORY_RETRY_MS
    )
  ) {
    return
  }

  sshInventoryAttemptedAt.set(connection.id, Date.now())

  const sshConfig = normalizeSshConfig({
    mode: 'ssh',
    host: connection.host,
    user: connection.user,
    port: connection.port,
    keyPath: connection.keyPath,
    remoteHermesPath: connection.remoteHermesPath
  })

  if (!sshConfig) {
    return
  }

  const ssh = createSshProbeConnection(
    { host: sshConfig.host, user: sshConfig.user, port: sshConfig.port, keyPath: sshConfig.keyPath },
    { rememberLog: sshRememberLog }
  )

  try {
    await ssh.open()
    const profiles = await remoteLifecycle.listRemoteHermesProfiles(ssh)

    if (profiles.length > 0) {
      sshRosterCache.set(connection.id, profiles)
    }
  } catch (error: any) {
    sshRememberLog(`[ssh] profile inventory failed for ${connection.id}: ${error?.message || error}`)
  } finally {
    try {
      await ssh.close()
    } catch {
      void 0
    }
  }
}

async function enumerateRegistryAgentSources(registry = readDesktopConnectionsRegistry()) {
  // One dead source must not wedge the whole roster: ensureRegistryBackend on
  // an unreachable remote can block up to the 45s readiness timeout, and the
  // Bot Mode poll runs every 5s — each poll queued behind the dead dial, so
  // the renderer painted stale rows for the entire outage (and the roster IPC
  // hung >30s in live repro). Bound each source's enumeration; a timeout is
  // reported like any other unreachable source and retried on the next poll.
  const perSourceTimeoutMs = 10_000

  const withEnumerationDeadline = async <T>(work: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null

    try {
      return await Promise.race([
        work,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('roster enumeration timed out')), perSourceTimeoutMs)
        })
      ])
    } finally {
      if (timer !== null) {
        clearTimeout(timer)
      }
    }
  }

  return Promise.all(
    registry.connections.map(async connection => {
      let raw: {
        connection: typeof connection
        error?: string
        installId?: string
        profiles: null | string[]
        profileMetadata?: Record<string, RosterProfileMetadata>
      }

      try {
        // SSH roster listing must never spawn a dashboard. A stale
        // sshConnections key used to fall into ensureRegistryBackend and
        // respawn Spark/Mini every Bot Mode poll (~5s), then the mux died
        // (ECONNRESET / liveness probe drop).
        if (connection.kind === 'ssh') {
          await probeSshProfileInventory(connection)
          raw = { connection, profiles: null, error: 'connect-on-demand' }
        } else {
          // Same connect-on-demand courtesy for the forced-local path: when
          // the primary route is remote, enumerating "This device" would
          // SPAWN a local backend this user has never asked for — a phantom
          // `default` agent that also forces -device handle disambiguation
          // onto the real one (remote-gateway-only desktops showed their main
          // agent twice, Aug 17 2026). Enumerate the local source only when
          // it is the delegate route (local-primary desktops, unchanged
          // behavior) or a forced-local child is ALREADY pooled (the user
          // opened one).
          if (connection.kind === 'local') {
            const localRoute = resolveRegistryLocalRoute('default', {
              globalRemote: globalRemoteActive(),
              profileRemoteOverride: Boolean(profileHasRemoteOverride(primaryProfileKey()))
            })

            if (shouldDeferLocalEnumeration(localRoute, backendPool.keys(), connection.id)) {
              return { connection, profiles: null, error: 'connect-on-demand' }
            }
          }

          // Claim-guarded (#90812): this ~5s roster poll can race a renderer's
          // own reconnect dial for the same connection; coalescing avoids
          // bootstrapping a second SSH tunnel / remote dashboard.
          const descriptor: any = await withEnumerationDeadline(
            Promise.resolve(
              backendDialClaims.run(backendScopeKey(connection.id, null), () =>
                ensureRegistryBackend(connection.id, null)
              )
            )
          )

          const { body, installId } = await fetchRosterSourceData(
            () => getJsonForBackend(descriptor, '/api/profiles', { timeoutMs: 8_000 }),
            () => probeConnectionInstallId(connection.id, descriptor)
          )

          // The install-id probe is TTL-cached, so the 5s roster poll usually
          // pays zero extra requests; on a miss it runs beside /api/profiles.

          const profiles = Array.isArray(body?.profiles)
            ? body.profiles.map(p => String(p?.name || '').trim()).filter(Boolean)
            : []

          const profileMetadata = Array.isArray(body?.profiles)
            ? Object.fromEntries(
                body.profiles
                  .map(profile => {
                    const name = String(profile?.name || '').trim()

                    if (!name) {
                      return null
                    }

                    const metadata: RosterProfileMetadata = {}

                    if (typeof profile?.display_name === 'string' && profile.display_name.trim()) {
                      metadata.display_name = profile.display_name.trim()
                    }

                    if (typeof profile?.title === 'string' && profile.title.trim()) {
                      metadata.title = profile.title.trim()
                    }

                    if (profile?.ui_meta && typeof profile.ui_meta === 'object') {
                      metadata.ui_meta = profile.ui_meta
                    }

                    if (typeof profile?.has_avatar === 'boolean') {
                      metadata.has_avatar = profile.has_avatar
                    }

                    return [name, metadata] as const
                  })
                  .filter((entry): entry is readonly [string, RosterProfileMetadata] => Boolean(entry))
              )
            : undefined

          // The root HERMES_HOME is an agent too; enumerations that omit it
          // (older backends list only named profiles) still get a default row.
          if (!profiles.includes('default')) {
            profiles.unshift('default')
          }

          raw = {
            connection,
            profiles,
            ...(installId ? { installId } : {}),
            ...(profileMetadata ? { profileMetadata } : {})
          }
        }
      } catch (error: any) {
        raw = { connection, profiles: null, error: String(error?.message || error) }
      }

      if (raw.profiles && raw.profiles.length > 0) {
        sshRosterCache.set(connection.id, raw.profiles)
      }

      const remembered = rememberSshEnumeration(raw, sshRosterCache.get(connection.id), connection.kind)

      return {
        connection,
        ...remembered,
        ...(raw.installId ? { installId: raw.installId } : {}),
        ...(raw.profileMetadata ? { profileMetadata: raw.profileMetadata } : {})
      }
    })
  )
}

const registryGatewayWsUrlHandler = createRegistryGatewayWsUrlHandler({
  ensureBackend: ensureRegistryBackend,
  mintTicket: mintGatewayWsTicket,
  buildTicketUrl: buildGatewayWsUrlWithTicket,
  rememberHeaders: rememberRemoteWsHeaders
})

async function requestManagedSshUpdate(rawId) {
  const connectionId = String(rawId || '').trim()
  const existing = managedConnectionUpdates.get(connectionId)

  if (existing) {
    return existing
  }

  const correlationId = crypto.randomUUID()
  const registry = readDesktopConnectionsRegistry()
  const source = registry.connections.find(connection => connection.id === connectionId)

  if (!source) {
    return refusedManagedSshUpdate(connectionId, correlationId, `No connection with id "${connectionId}".`)
  }

  if (source.kind !== 'ssh') {
    return refusedManagedSshUpdate(
      connectionId,
      correlationId,
      'Only registered Desktop-managed SSH connections can use this update lifecycle.'
    )
  }

  if (!managedConnectionUpdateGate.claim(connectionId, correlationId)) {
    return refusedManagedSshUpdate(connectionId, correlationId, 'A managed update is already in progress.')
  }

  const operation = (async () => {
    try {
      return await updateManagedSshConnection(source, correlationId)
    } catch (error: any) {
      return refusedManagedSshUpdate(connectionId, correlationId, String(error?.message || error))
    } finally {
      managedConnectionUpdateGate.release(connectionId, correlationId)
      managedConnectionUpdates.delete(connectionId)
    }
  })()

  managedConnectionUpdates.set(connectionId, operation)

  return operation
}

async function postJsonForBackend(descriptor, path, body, opts: any = {}) {
  return fetchJsonForBackend(descriptor, path, { ...opts, body: body ?? {}, method: 'POST' })
}

const claimedAmbientCue = createEventDeduper()

registerNativeNotifications({ getMainWindow: () => getMainWindow(), focusWindow })

const PLUGIN_SOURCE_MAX_BYTES = 16 * 1024 * 1024

const activeWorkByWebContents = new Map<number, ActiveWork>()

function updateStreamThrottleFromActiveWork() {
  streamThrottle.update(mergeActiveWork(activeWorkByWebContents.values()).count > 0)
}

let translucencyWriteTimer = null

function scheduleTranslucencyWrite() {
  if (translucencyWriteTimer) {
    clearTimeout(translucencyWriteTimer)
  }

  translucencyWriteTimer = setTimeout(() => {
    translucencyWriteTimer = null
    writePersistedTranslucency(getTranslucencyState())
  }, 250)
}

app.on('before-quit', () => {
  if (translucencyWriteTimer) {
    clearTimeout(translucencyWriteTimer)
    translucencyWriteTimer = null
    writePersistedTranslucency(getTranslucencyState())
  }
})

app.on('will-quit', () => {
  destroyKeepaliveAgents()
})

const KEEP_AWAKE_CONFIG_PATH = path.join(app.getPath('userData'), 'keep-awake.json')

const keepAwake = createKeepAwake(powerSaveBlocker)

function readPersistedKeepAwake() {
  try {
    return JSON.parse(fs.readFileSync(KEEP_AWAKE_CONFIG_PATH, 'utf8')).on === true
  } catch {
    return false
  }
}

const DISABLE_F12_CONFIG_PATH = path.join(app.getPath('userData'), 'disable-f12.json')

function readPersistedDisableF12() {
  try {
    return JSON.parse(fs.readFileSync(DISABLE_F12_CONFIG_PATH, 'utf8')).on === true
  } catch {
    return false
  }
}

const foundInPageForwarders = new Map<number, () => void>()

function ensureFoundInPageForwarder(sender: Electron.WebContents): void {
  if (foundInPageForwarders.has(sender.id)) {
    return
  }

  const uninstall = installFoundInPageForwarder(sender)
  foundInPageForwarders.set(sender.id, uninstall)

  sender.once('destroyed', () => {
    foundInPageForwarders.get(sender.id)?.()
    foundInPageForwarders.delete(sender.id)
  })
}

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
  getOnBatteryPower: () => onBatteryPower,
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
  wakeIndicatorController,
  getQuickEntryWindow: () => getQuickEntryWindow(),
  getQuickEntryLastState: () => getQuickEntryLastState(),
  setQuickEntryLastState: value => (setQuickEntryLastState(value)),
  readQuickEntrySettings,
  writeQuickEntrySettings,
  hideQuickEntryWindow,
  quickEntryShortcut,
  applyQuickEntrySettings,
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
  scheduleTranslucencyWrite,
})

registerPreviewIpc({
  openExternalUrl,
  openPreviewInBrowser,
  fetchLinkTitle,
  resolveFaviconCached,
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
  installDownloadHandling()
  registerMediaProtocol()
  installEmbedReferer()
  installRemoteHeaderRules()
  registerDeepLinkProtocol()

  ensureWslWindowsFonts()
  configureSpellChecker()
  registerPowerResumeListeners()
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
  applyQuickEntrySettings(readQuickEntrySettings())

  if (IS_MAC) {
    const reposition = () => wakeIndicatorController.reposition()

    screen.on('display-added', reposition)

    screen.on('display-metrics-changed', reposition)

    screen.on('display-removed', reposition)
  }

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

function configureSpellChecker() {
  try {
    const defaultSession = session.defaultSession

    if (!defaultSession || typeof defaultSession.setSpellCheckerLanguages !== 'function') {
      return
    }

    const available = defaultSession.availableSpellCheckerLanguages || []
    const locale = (app.getLocale && app.getLocale()) || 'en-US'
    const candidates = [locale, locale.split('-')[0], 'en-US', 'en']
    const chosen = candidates.find(lang => available.includes(lang)) || 'en-US'

    defaultSession.setSpellCheckerLanguages([chosen])
  } catch (error) {
    rememberLog(`Spellchecker setup failed: ${error.message}`)
  }
}

function heldQuitForActiveWork(event: Electron.Event): boolean {
  if (SKIP_QUIT_CONFIRM || quitConfirmedWithActiveWork || quitPromptOpen) {
    return false
  }

  const prompt = quitPromptFor(mergeActiveWork(activeWorkByWebContents.values()), getIsQuittingForHandoff())
  const parent = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]

  if (!prompt || !parent || parent.isDestroyed()) {
    return false
  }

  event.preventDefault()
  quitPromptOpen = true

  void dialog
    .showMessageBox(parent, {
      buttons: ['Keep Running', 'Quit Anyway'],
      cancelId: 0,
      defaultId: 0,
      detail: prompt.detail,
      message: prompt.message,
      type: 'question'
    })
    .then(({ response }) => {
      quitPromptOpen = false

      if (response === 1) {
        quitConfirmedWithActiveWork = true
        app.quit()
      }
    })
    .catch(() => {
      // A dialog we can't show must not become a quit we can't perform.
      quitPromptOpen = false
      quitConfirmedWithActiveWork = true
      app.quit()
    })

  return true
}

app.on('before-quit', event => {
  // Runs ahead of every teardown below, so "Keep Running" leaves the app
  // exactly as it was.
  if (heldQuitForActiveWork(event)) {
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
  wakeIndicatorController.close()

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
