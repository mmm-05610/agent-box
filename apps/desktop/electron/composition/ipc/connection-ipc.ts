// IPC surface extracted from main.ts. Channel names, payloads and error
// semantics unchanged; state authority stays with main.ts via this deps object.

import { spawn } from 'node:child_process'
import path from 'node:path'

import {
  ipcMain,
  shell
} from 'electron'

import {
  rememberLog
} from '../../composition/log-buffer'
import { applyConnectionChange } from '../../legacy-hermes/connection-apply'
import {
  authModeFromStatus,
  connectionScopeKey,
  modeIsRemoteLike,
  normalizeRemoteBaseUrl,
  normAuthMode,
  resolveTestWsUrl
} from '../../legacy-hermes/connection-config'
import { applyConnectionConfigAtomically } from '../../legacy-hermes/connection-config-apply'
import {
  backendScopeKey,
  buildAgentRoster,
  reconcileAppliedGlobalConnection,
  removeConnection,
  resolvedConnectionId,
  setConnectionLaunchMode,
  setLastUsedConnection,
  setPrimaryConnection,
  updateEligibility
} from '../../legacy-hermes/connection-registry'
import { probeGatewayWebSocket } from '../../legacy-hermes/gateway-ws-probe'
import {
  resolveLoginStrategy
} from '../../native-oauth'
import { runNativeLogin } from '../../native-oauth-login'
import {
  buildRegistryProfileRoutes,
  isLocalEnumerationFailure,
  localRouteFallbackProfiles,
  undialedSshRouteSeeds
} from '../../legacy-hermes/plugin-profile-routes'
import { rehomePrimaryConnection } from '../../legacy-hermes/primary-connection-rehome'
import {
  revalidateRemoteConnection
} from '../../legacy-hermes/remote-liveness'
import { collectSshConfigHosts, parseSshGOutput } from '../../ssh-config'
import { hiddenWindowsChildOptions } from '../../windows-child-options'

export interface RegisterConnectionIpcDeps {
  backendDialClaims: any
  spawnPriorityFrom: any
  applySpawnPriority: any
  readDesktopConnectionsRegistry: any
  primaryProfileKey: any
  ensureBackend: any
  ensureRegistryBackend: any
  resetPreviewReach: any
  windowConnectionRoutes: any
  windowConnectionRouteOwners: any
  backendConnectionState: any
  remoteLiveness: any
  remoteRevalidation: any
  sshBootstrapCoordinator: any
  sshScopeKey: any
  teardownSshConnection: any
  resetHermesConnection: any
  revalidatePool: any
  fetchJsonForBackend: any
  readDesktopConnectionConfig: any
  sanitizeDesktopConnectionConfig: any
  enumerateRegistryAgentSources: any
  testDesktopConnectionConfig: any
  secretStoragePolicy: any
  applySecretStorageEncryption: any
  sanitizeConnectionsRegistry: any
  saveRegistryConnection: any
  writeDesktopConnectionsRegistry: any
  managedConnectionUpdateGate: any
  broadcastConnectionsChanged: any
  stopRegistryConnectionBackends: any
  assertCanMutateManagedPrimaryRouting: any
  mintGatewayWsTicket: any
  decryptDesktopSecret: any
  decryptRemoteHeaders: any
  coerceDesktopConnectionConfig: any
  fetchConnectionStatus: any
  startHermes: any
  sshRosterCache: any
  sshInventoryAttemptedAt: any
  rememberConnectionInstallId: any
  probeSshProfileInventory: any
  requestManagedSshUpdate: any
  applyUpdates: any
  postJsonForBackend: any
  probeRemoteAuthMode: any
  getRemoteReauthFailure: () => any
  setRemoteReauthFailure: (value: any) => void
  fetchPublicJson: any
  gatewayAuthProviders: any
  hasOauthSessionCookie: any
  openOauthLoginWindow: any
  _storeNativeTokens: any
  postJsonNoAuth: any
  hasLiveOauthSession: any
  clearOauthSession: any
  _clearNativeTokens: any
  hasNativeSession: any
  resolvePortalBaseUrl: any
  hasLivePortalSession: any
  openPortalLoginWindow: any
  discoverCloudAgents: any
  cloudAgentSilentSignIn: any
  writeDesktopConnectionConfig: any
  getBootstrapFailure: () => any
  setBootstrapFailure: (value: any) => void
  abandonFirstRunSetupChoiceForRemoteApply: any
  teardownPrimaryBackendAndWait: any
  sendConnectionApplied: any
  stopPoolBackend: any
}

export function registerConnectionIpc({ backendDialClaims, spawnPriorityFrom, applySpawnPriority, readDesktopConnectionsRegistry, primaryProfileKey, ensureBackend, ensureRegistryBackend, resetPreviewReach, windowConnectionRoutes, windowConnectionRouteOwners, backendConnectionState, remoteLiveness, remoteRevalidation, sshBootstrapCoordinator, sshScopeKey, teardownSshConnection, resetHermesConnection, revalidatePool, fetchJsonForBackend, readDesktopConnectionConfig, sanitizeDesktopConnectionConfig, enumerateRegistryAgentSources, testDesktopConnectionConfig, secretStoragePolicy, applySecretStorageEncryption, sanitizeConnectionsRegistry, saveRegistryConnection, writeDesktopConnectionsRegistry, managedConnectionUpdateGate, broadcastConnectionsChanged, stopRegistryConnectionBackends, assertCanMutateManagedPrimaryRouting, mintGatewayWsTicket, decryptDesktopSecret, decryptRemoteHeaders, coerceDesktopConnectionConfig, fetchConnectionStatus, startHermes, sshRosterCache, sshInventoryAttemptedAt, rememberConnectionInstallId, probeSshProfileInventory, requestManagedSshUpdate, applyUpdates, postJsonForBackend, probeRemoteAuthMode, getRemoteReauthFailure, setRemoteReauthFailure, fetchPublicJson, gatewayAuthProviders, hasOauthSessionCookie, openOauthLoginWindow, _storeNativeTokens, postJsonNoAuth, hasLiveOauthSession, clearOauthSession, _clearNativeTokens, hasNativeSession, resolvePortalBaseUrl, hasLivePortalSession, openPortalLoginWindow, discoverCloudAgents, cloudAgentSilentSignIn, writeDesktopConnectionConfig, getBootstrapFailure, setBootstrapFailure, abandonFirstRunSetupChoiceForRemoteApply, teardownPrimaryBackendAndWait, sendConnectionApplied, stopPoolBackend }: RegisterConnectionIpcDeps) {
ipcMain.handle('hermes:connection', async (_event, profile, extra) => {
  // Coalesce concurrent renderer dials for one profile scope (#90812): the
  // renderer-side reconnect lock is per-window, so two windows waking at once
  // both land here. The claim key mirrors ensureBackend()'s own profile
  // normalization so every spelling of the primary coalesces onto one dial.
  const profileKey = profile && String(profile).trim() ? String(profile).trim() : primaryProfileKey()
  // A user click may join an in-flight hydration claim; the foreground intent
  // is applied to that claim so its slot wait can take the reserved slot.
  const spawnPriority = spawnPriorityFrom(extra?.priority)

  const scopeKey = backendScopeKey(null, profileKey)
  const clearSpawnPriority = applySpawnPriority(scopeKey, spawnPriority)

  let connection

  try {
    connection = await backendDialClaims.run(scopeKey, () => ensureBackend(profile, { spawnPriority }))
  } finally {
    clearSpawnPriority()
  }

  const connectionId = resolvedConnectionId(readDesktopConnectionsRegistry(), connection)

  return connectionId ? { ...connection, connectionId } : connection
})

ipcMain.handle('hermes:connection:for', async (_event, payload) => {
  const { connectionId, profile, priority } = payload && typeof payload === 'object' ? (payload as any) : ({} as any)
  const registry = readDesktopConnectionsRegistry()
  const id = String(connectionId || '').trim() || registry.primary
  const spawnPriority = spawnPriorityFrom(priority)

  // Same single-owner claim as 'hermes:connection', keyed by the composite
  // (connectionId, profile) scope (#90812): concurrent registry dials for one
  // scope share the first spawn instead of bootstrapping duplicate remotes.
  const scopeKey = backendScopeKey(id, profile)
  const clearSpawnPriority = applySpawnPriority(scopeKey, spawnPriority)

  let connection

  try {
    connection = await backendDialClaims.run(scopeKey, () => ensureRegistryBackend(id, profile, '', { spawnPriority }))
  } finally {
    clearSpawnPriority()
  }

  return { ...connection, connectionId: id, registryScoped: true }
})

ipcMain.on('hermes:connection:active-route', (event, route) => {
  const id = event.sender.id
  const previous = windowConnectionRoutes.get(id)
  const next = windowConnectionRoutes.set(id, route)

  if (
    previous?.connectionId !== next?.connectionId ||
    previous?.profile !== next?.profile ||
    previous?.registryScoped !== next?.registryScoped
  ) {
    void resetPreviewReach(id)
  }

  if (!windowConnectionRouteOwners.has(id)) {
    windowConnectionRouteOwners.add(id)
    event.sender.once('destroyed', () => {
      windowConnectionRoutes.delete(id)
      windowConnectionRouteOwners.delete(id)
      void resetPreviewReach(id)
    })
  }
})

ipcMain.handle('hermes:connection:revalidate', async () => {
  const connectionPromise = backendConnectionState.getPromise()

  if (!connectionPromise) {
    await revalidatePool()

    return { ok: true, rebuilt: false }
  }

  // Main and every session pop-out have their own renderer reconnect loop but
  // share this primary connection. Coalesce simultaneous requests so one outage
  // produces one failure observation rather than exhausting the whole streak.
  return remoteRevalidation.run(connectionPromise, async () => {
    const [result] = await Promise.all([
      revalidateRemoteConnection({
        connectionPromise,
        currentConnectionPromise: () => backendConnectionState.getPromise(),
        log: rememberLog,
        probe: (connection, path, options) => fetchJsonForBackend(connection, path, options),
        resetConnection: () => resetHermesConnection({ soft: true }),
        tracker: remoteLiveness
      }),
      revalidatePool()
    ])

    // A rebuilt SSH connection must also tear down its tunnel/master before the
    // renderer re-dials (which only happens after this handler resolves), so the
    // fresh bootstrap can't reattach to a dying transport.
    if (result.rebuilt) {
      const conn = await connectionPromise.catch(() => null)

      if (conn?.remoteKind === 'ssh') {
        const profile = primaryProfileKey()
        await sshBootstrapCoordinator.cancelAndWait(sshScopeKey(profile))
        await teardownSshConnection(profile)
      }
    }

    return result
  })
})

ipcMain.handle('hermes:connection-config:get', async (_event, profile) =>
  sanitizeDesktopConnectionConfig(readDesktopConnectionConfig(), profile)
)

ipcMain.handle('hermes:plugin-profile-routes', async (_event, rawProfileNames) => {
  const fallbackProfileNames = Array.isArray(rawProfileNames)
    ? rawProfileNames
        .filter(name => typeof name === 'string')
        .map(name => name.trim())
        .filter(Boolean)
        .slice(0, 256)
    : []

  const registry = readDesktopConnectionsRegistry()
  const enumerations = await enumerateRegistryAgentSources(registry)
  let agents = buildAgentRoster(enumerations, { primaryConnectionId: registry.primary })

  // Roster enumeration deliberately does not dial connect-on-demand SSH
  // sources. Publish one credential-free seed route so a plugin can be the
  // first caller that opens the tunnel.
  const sshSeeds = undialedSshRouteSeeds(agents, registry.connections)

  if (sshSeeds.length > 0) {
    agents = [
      ...agents,
      ...sshSeeds.map(seed => {
        const source = registry.connections.find(connection => connection.id === seed.connectionId)!

        return {
          connectionId: source.id,
          connectionKind: source.kind,
          connectionLabel: source.label,
          handle: seed.profile,
          profile: seed.profile
        }
      })
    ]
  }

  // A local enumeration can fail while remote/cloud sources succeed. Preserve
  // cached v1 profile names as explicitly-local rows so those valid routes do
  // not disappear and duplicate names remain source-qualified.
  const localSource = registry.connections.find(source => source.kind === 'local')

  const localEnumeration = localSource
    ? enumerations.find(({ connection }) => connection.id === localSource.id)
    : undefined

  const localFallbackProfiles = localSource
    ? localRouteFallbackProfiles(
        agents,
        localSource.id,
        fallbackProfileNames,
        isLocalEnumerationFailure(localEnumeration?.error)
      )
    : []

  if (localSource && localFallbackProfiles.length > 0) {
    agents = [
      ...agents,
      ...localFallbackProfiles.map(profile => ({
        connectionId: localSource.id,
        connectionKind: localSource.kind,
        connectionLabel: localSource.label,
        handle: profile,
        profile
      }))
    ]
  }

  return buildRegistryProfileRoutes({ agents, sources: registry.connections })
})

ipcMain.handle('hermes:ssh-config:hosts', async () => ({ hosts: collectSshConfigHosts() }))

ipcMain.handle('hermes:ssh-config:resolve', async (_event, host) => {
  const value = String(host || '').trim()

  if (!value) {
    throw new Error('SSH host is required.')
  }

  const ssh =
    process.platform === 'win32'
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'OpenSSH', 'ssh.exe')
      : 'ssh'

  return new Promise((resolve, reject) => {
    const child = spawn(ssh, ['-G', '--', value], hiddenWindowsChildOptions({ stdio: ['ignore', 'pipe', 'pipe'] }))
    let stdout = ''
    let stderr = ''

    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('SSH config resolution timed out.'))
    }, 10_000)

    child.stdout.on('data', chunk => {
      stdout += String(chunk)
    })
    child.stderr.on('data', chunk => {
      stderr += String(chunk)
    })
    child.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', code => {
      clearTimeout(timer)

      if (code !== 0) {
        reject(new Error(stderr.trim() || 'Could not resolve SSH host.'))
      } else {
        resolve(parseSshGOutput(stdout))
      }
    })
  })
})

ipcMain.handle('hermes:connection-config:test', async (_event, payload) => testDesktopConnectionConfig(payload))

ipcMain.handle('hermes:secret-storage:get', async () => ({ on: secretStoragePolicy().on }))

ipcMain.handle('hermes:secret-storage:set', async (_event: any, on: any) => applySecretStorageEncryption(on === true))

ipcMain.handle('hermes:connections:list', async () => sanitizeConnectionsRegistry())

ipcMain.handle('hermes:connections:save', async (_event, payload) => {
  const saved = await saveRegistryConnection(payload)

  return { ok: true, connection: saved, registry: sanitizeConnectionsRegistry() }
})

ipcMain.handle('hermes:connections:remove', async (_event, id) => {
  const key = String(id || '')
  managedConnectionUpdateGate.assertCanMutate(key)
  const registry = removeConnection(readDesktopConnectionsRegistry(), key)
  writeDesktopConnectionsRegistry(registry)
  // Tear down anything the removed connection still had running: pooled
  // backends under its composite keys and any ssh tunnel scopes it owned.
  await stopRegistryConnectionBackends(key)
  // And the renderer side: without this push, secondaries scoped to the
  // removed connection keep their WebSocket open (remote/cloud have no local
  // process to kill) and stream ghost events until page reload.
  broadcastConnectionsChanged({ connectionId: key, reason: 'removed' })

  return { ok: true, registry: sanitizeConnectionsRegistry(registry) }
})

ipcMain.handle('hermes:connections:set-primary', async (_event, id) => {
  assertCanMutateManagedPrimaryRouting()
  const registry = setPrimaryConnection(readDesktopConnectionsRegistry(), String(id || ''))
  writeDesktopConnectionsRegistry(registry)

  return { ok: true, registry: sanitizeConnectionsRegistry(registry) }
})

ipcMain.handle('hermes:connections:set-launch-mode', async (_event, mode) => {
  assertCanMutateManagedPrimaryRouting()
  const registry = setConnectionLaunchMode(readDesktopConnectionsRegistry(), String(mode || ''))
  writeDesktopConnectionsRegistry(registry)

  return { ok: true, registry: sanitizeConnectionsRegistry(registry) }
})

ipcMain.handle('hermes:connections:set-last-used', async (_event, id) => {
  const registry = setLastUsedConnection(readDesktopConnectionsRegistry(), String(id || ''))
  writeDesktopConnectionsRegistry(registry)

  return { ok: true, registry: sanitizeConnectionsRegistry(registry) }
})

ipcMain.handle('hermes:connections:test', async (_event, id) => {
  const registry = readDesktopConnectionsRegistry()
  const entry = registry.connections.find(c => c.id === String(id || ''))

  if (!entry) {
    throw new Error(`No connection with id "${String(id || '')}".`)
  }

  // The ssh probe path in testDesktopConnectionConfig never consults v1
  // connection state, so mapping the entry onto it is safe.
  if (entry.kind === 'ssh') {
    const result = await testDesktopConnectionConfig({
      mode: 'ssh',
      sshHost: entry.host,
      sshUser: entry.user,
      sshPort: entry.port,
      sshKeyPath: entry.keyPath,
      sshRemoteHermesPath: entry.remoteHermesPath
    })

    if (result?.reachable) {
      sshInventoryAttemptedAt.delete(entry.id)
      sshRosterCache.delete(entry.id)
      await probeSshProfileInventory(entry)
    }

    return result
  }

  // Remote/cloud/local probe built DIRECTLY from the registry entry. Routing
  // through coerceDesktopConnectionConfig would use v1 connection.json as the
  // `existing` base: an entry with a broken/absent token would inherit the v1
  // global remote's token and send it to THIS entry's URL (cross-host
  // credential transmission + a false "reachable"), and testing the local
  // entry would probe whatever v1's global mode points at instead of the
  // app-managed local backend.
  let baseUrl
  let token = null
  let authMode = 'token'
  let testHeaders = {}

  if (entry.kind === 'local') {
    const local = await startHermes()
    baseUrl = local.baseUrl
    token = local.token
    authMode = normAuthMode(local.authMode)
  } else {
    baseUrl = normalizeRemoteBaseUrl(entry.url)
    authMode = normAuthMode(entry.authMode)
    testHeaders = decryptRemoteHeaders(entry.headers)

    if (authMode !== 'oauth') {
      token = decryptDesktopSecret(entry.token)

      if (!token) {
        throw new Error('This connection has no saved session token. Edit the connection and paste one.')
      }
    }
  }

  const status = (await fetchConnectionStatus(baseUrl, authMode, token, testHeaders)) as any

  // The Test button is the cheapest moment to (re)learn this backend's stable
  // identity for the same-backend roster collapse + Settings hint.
  rememberConnectionInstallId(entry.id, status)

  // Same HTTP+WS two-leg check as testDesktopConnectionConfig: HTTP alone is
  // a false positive when the WebSocket leg is blocked.
  const wsUrl = await resolveTestWsUrl(baseUrl, authMode, token, {
    mintTicket: url => mintGatewayWsTicket(url, testHeaders)
  })

  if (wsUrl && typeof globalThis.WebSocket === 'function') {
    const probe = await probeGatewayWebSocket(wsUrl, { WebSocketImpl: globalThis.WebSocket, headers: testHeaders })

    if (!probe.ok) {
      throw new Error(
        `Reached the gateway over HTTP, but the live WebSocket (/api/ws) connection failed: ${probe.reason} ` +
          'The HTTP check can pass while the WebSocket is blocked by a proxy, firewall, or gateway auth/origin guard.'
      )
    }
  }

  return { ok: true, baseUrl, version: status?.version || null }
})

ipcMain.handle('hermes:agents:roster', async () => {
  const registry = readDesktopConnectionsRegistry()
  const enumerations = await enumerateRegistryAgentSources(registry)

  return {
    agents: buildAgentRoster(enumerations, { primaryConnectionId: registry.primary }),
    // The active gateway owns the renderer's profiles.list — union agents
    // that report THIS connection are the same identities, not extra rows.
    // Expose the primary id so the plugin merger can annotate them in place
    // instead of appending duplicates (remote-only desktops doubled every
    // bot otherwise; see #88344).
    primaryConnectionId: registry.primary,
    sources: enumerations.map(({ connection, error, installId, profiles }) => ({
      connectionId: connection.id,
      label: connection.label,
      kind: connection.kind,
      reachable: profiles !== null,
      ...(installId ? { installId } : {}),
      ...(error ? { error } : {})
    }))
  }
})

ipcMain.handle('hermes:connections:update-managed', async (_event, rawId) => requestManagedSshUpdate(rawId))

ipcMain.handle('hermes:connections:update-all', async (_event, payload) => {
  const registry = readDesktopConnectionsRegistry()

  // Optional renderer-side exclusions: the everything-update flow dispatches
  // the ACTIVE backend through its own detailed-progress path and chains the
  // local client apply LAST (it relaunches the app), so it excludes those ids
  // here to avoid double-dispatch. No payload keeps the Settings button's
  // original all-rows behavior byte-identical.
  const excludeIds = new Set<string>(
    Array.isArray((payload as any)?.excludeIds) ? (payload as any).excludeIds.map((id: unknown) => String(id)) : []
  )

  const results = await Promise.all(
    registry.connections
      .filter(connection => !excludeIds.has(connection.id))
      .map(async connection => {
        const base = { connectionId: connection.id, label: connection.label, kind: connection.kind }
        const eligibility = updateEligibility(connection)

        if (!eligibility.eligible) {
          return { ...base, ok: false, skipped: true, reason: eligibility.reason }
        }

        try {
          if (connection.kind === 'local') {
            // The app-managed runtime updates through the same pipeline as the
            // Settings → Updates button (marker + venv gate + relaunch flow).
            const result: any = await applyUpdates({})

            return { ...base, ok: result?.ok !== false, detail: result?.message || 'update started' }
          }

          if (connection.kind === 'ssh') {
            const result = await requestManagedSshUpdate(connection.id)

            return {
              ...base,
              ok: result.ok,
              detail: result.message,
              managed: result,
              ...(result.ok ? {} : { error: result.error || result.outcome })
            }
          }

          // Claim-guarded (#90812): coalesce with a concurrent renderer dial
          // for the same connection instead of bootstrapping a second backend.
          const descriptor: any = await backendDialClaims.run(backendScopeKey(connection.id, null), () =>
            ensureRegistryBackend(connection.id, null)
          )

          const body: any = await postJsonForBackend(descriptor, '/api/hermes/update', {}, { timeoutMs: 15_000 })

          if (body?.ok === false) {
            // The backend refused (docker/nix/externally-managed installs) —
            // surface ITS message, per-row, instead of failing the batch.
            return {
              ...base,
              ok: false,
              skipped: true,
              reason: body?.error || 'backend-refused',
              detail: body?.message
            }
          }

          return { ...base, ok: true, detail: body?.message || 'update started' }
        } catch (error: any) {
          return { ...base, ok: false, error: String(error?.message || error) }
        }
      })
  )

  return { ok: true, results }
})

ipcMain.handle('hermes:connection-config:probe', async (_event, rawUrl) => probeRemoteAuthMode(rawUrl))

ipcMain.handle('hermes:connection-config:oauth-login', async (_event, rawUrl) => {
  // Capability-gated login (RFC 8252). Probe the gateway's public /api/status
  // for supported auth_flows and /api/auth/providers for provider capabilities:
  //   - all providers support password → always use the embedded login window
  //     (password providers require the dashboard login form; native PKCE
  //     can never complete for that provider shape)
  //   - advertises "native_pkce" AND at least one non-password provider →
  //     run the system-browser + loopback + PKCE flow
  //   - older gateway with no provider metadata → fall back to the auth_flows
  //     check (existing compatibility)
  //   - a failed native login reports the error rather than auto-falling back
  //     to the embedded flow — one sign-in action opens at most one window.
  const baseUrl = normalizeRemoteBaseUrl(rawUrl)

  let statusBody: any = null

  try {
    statusBody = await fetchPublicJson(`${baseUrl}/api/status`, { timeoutMs: 8_000 })
  } catch {
    // Can't read status — fall through to the embedded flow, which has its
    // own error handling and works against any gated gateway.
  }

  const authRequired = statusBody && authModeFromStatus(statusBody) === 'oauth'
  const providers = authRequired ? await gatewayAuthProviders(baseUrl) : []

  const strategy = resolveLoginStrategy(statusBody, { providers })

  if (strategy === 'native') {
    try {
      const tokens = await runNativeLogin(baseUrl, {
        openExternal: url => shell.openExternal(url),
        postJson: (url, body, opts) => postJsonNoAuth(url, body, opts),
        rememberLog
      })

      _storeNativeTokens(baseUrl, tokens)
      // Confirmed sign-in — release the reauth latch so the next
      // startHermes() re-dials instead of replaying the stale rejection.
      setRemoteReauthFailure(null)

      return { ok: true, baseUrl, connected: true }
    } catch (error) {
      rememberLog(`[native-oauth] native login failed (${error instanceof Error ? error.message : String(error)})`)

      return { ok: false, error: error instanceof Error ? error.message : String(error), connected: false }
    }
  }

  // Legacy embedded-webview cookie flow.
  await openOauthLoginWindow(baseUrl)

  const connected = await hasOauthSessionCookie(baseUrl)

  // Only a CONFIRMED sign-in releases the latch. A cancelled/closed login
  // window must leave it set, or the overlay's "Sign in" button starts
  // flickering again on the next retry.
  if (connected) {
    setRemoteReauthFailure(null)
  }

  return { ok: true, baseUrl, connected }
})

ipcMain.handle('hermes:connection-config:oauth-logout', async (_event, rawUrl) => {
  const baseUrl = normalizeRemoteBaseUrl(rawUrl)
  await clearOauthSession(baseUrl)

  // Also drop any native (RFC 8252) bearer tokens for this gateway so a
  // logout clears BOTH auth shapes.
  _clearNativeTokens(baseUrl)

  // Report against the SAME liveness notion the Settings indicator uses
  // (AT-or-RT cookie, or a native token) so a logout that left any session
  // behind is reflected as still-connected rather than silently signed-out.
  const connected = (await hasLiveOauthSession(baseUrl)) || hasNativeSession(baseUrl)

  return { ok: true, connected }
})

ipcMain.handle('hermes:cloud:status', async () => ({
  portalBaseUrl: resolvePortalBaseUrl(),
  signedIn: await hasLivePortalSession()
}))

ipcMain.handle('hermes:cloud:login', async () => {
  await openPortalLoginWindow()

  return { ok: true, signedIn: await hasLivePortalSession() }
})

ipcMain.handle('hermes:cloud:logout', async () => {
  await clearOauthSession(resolvePortalBaseUrl())

  return { ok: true, signedIn: await hasLivePortalSession() }
})

ipcMain.handle('hermes:cloud:discover', async (_event, org) => {
  // Returns { agents } or { needsOrgSelection: true, orgs }. `org` (optional)
  // scopes discovery to a chosen org for multi-org users.
  return discoverCloudAgents(typeof org === 'string' && org ? org : undefined)
})

ipcMain.handle('hermes:cloud:agent-sign-in', async (_event, dashboardUrl) => {
  // Silent per-agent sign-in via the shared portal session. Returns the agent's
  // gateway baseUrl + whether its session cookie landed; the renderer then
  // saves a cloud-mode connection pointed at this dashboardUrl.
  return cloudAgentSilentSignIn(dashboardUrl)
})

ipcMain.handle('hermes:connection-config:save', async (_event, payload) => {
  assertCanMutateManagedPrimaryRouting()
  const config = coerceDesktopConnectionConfig(payload)
  writeDesktopConnectionConfig(config)

  return sanitizeDesktopConnectionConfig(config, payload?.profile)
})

ipcMain.handle('hermes:connection-config:apply', async (_event, payload) => {
  assertCanMutateManagedPrimaryRouting()
  const previousConfig = readDesktopConnectionConfig()
  const previousRegistry = readDesktopConnectionsRegistry()
  const config = coerceDesktopConnectionConfig(payload, previousConfig)

  const key = connectionScopeKey(payload?.profile)
  const scope = key || ''
  const nextRegistry = key ? previousRegistry : reconcileAppliedGlobalConnection(previousRegistry, config)

  await applyConnectionConfigAtomically({
    previousConfig,
    previousRegistry,
    nextConfig: config,
    nextRegistry,
    // Exercise the same authenticated REST + real WebSocket legs before either
    // config file changes. A rejected OAuth session or blocked /api/ws leaves
    // the previous primary/current connection intact.
    preflight: !key && modeIsRemoteLike(config.mode) ? () => testDesktopConnectionConfig(payload) : undefined,
    writeConfig: writeDesktopConnectionConfig,
    writeRegistry: writeDesktopConnectionsRegistry,
    apply: () =>
      applyConnectionChange({
        cancelAndWait: value => sshBootstrapCoordinator.cancelAndWait(value),
        isPrimary: !key || key === primaryProfileKey(),
        rehomePrimary: () =>
          rehomePrimaryConnection({
            clearLocalBootstrapFailure: () => {
              // A remote connection bypasses local runtime/bootstrap failures. Clear
              // the local-install latch so unsupported/failure escape paths can re-home.
              setBootstrapFailure(null)
            },
            mode: config.mode,
            notifyConnectionApplied: sendConnectionApplied,
            resumeFirstRunRemote: abandonFirstRunSetupChoiceForRemoteApply,
            teardownPrimaryBackend: teardownPrimaryBackendAndWait
          }),
        scope,
        sendApplied: sendConnectionApplied,
        stopPool: stopPoolBackend,
        teardownPrimary: () => teardownPrimaryBackendAndWait({ soft: true }),
        teardownSsh: value => teardownSshConnection(value || null)
      })
  })

  return sanitizeDesktopConnectionConfig(config, payload?.profile)
})
}
