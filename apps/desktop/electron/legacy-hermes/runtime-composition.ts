// Extracted verbatim from main.ts (see docs/desktop-megafile-decomposition.md).
// main.ts keeps only the startup/lifecycle statement sequence; the accessors at the
// bottom exist so main can read/write the few mutable bindings the sequence needs.

import fs from 'node:fs'
import path from 'node:path'

import {
  session
} from 'electron'

import {
  backendConnectionState,
  backendPool,
  connectRegistryBackend,
  decryptRemoteHeaders,
  DESKTOP_MANAGED_SSH_RECOVERY_PATH,
  encryptDesktopSecret,
  evictLruPoolBackends,
  localBackendSpawnCoordinator,
  managedConnectionUpdateGate,
  managedPrimaryRestoreOwners,
  managedSshConfig,
  pendingForegroundSpawns,
  poolLimits,
  poolMaxBackends,
  primaryProfileKey,
  promotePoolEntry,
  readDesktopConnectionConfig,
  readDesktopConnectionsRegistry,
  readManagedSshRecoveryRecords,
  remoteWsHeaderStore,
  setBackendStartFailure,
  setRemoteReauthFailure,
  sshBootstrapCoordinator,
  sshConnections,
  sshRememberLog,
  sshScopeKey,
  startHermes,
  startPoolIdleReaper,
  stopBackendChild,
  terminalIpc,
  updateBootProgress,
  waitForHermes,
} from '../composition/bootstrap-env-composition'
import {
  writeSecretFileAtomic
} from '../host-capabilities/filesystem/hardening'
import { createSshProbeConnection } from '../host-capabilities/platform/ssh-connection'
import {
  modeIsRemoteLike,
  remoteRequestMatchesBaseUrl
} from '../legacy-hermes/connection-config'
import {
  backendScopeKey,
  backendScopePrefix
} from '../legacy-hermes/connection-registry'
import { resolveDesktopRemoteRoute } from '../legacy-hermes/desktop-remote-route'
import {
  assertManagedUpdatePreflightClear,
  executeManagedRemoteUpdate,
  managedSshRecoveryScopes,
  managedSshScopeRole,
  recoverManagedSshScopes,
  type RemoteUpdateTarget,
  runManagedSshUpdate,
  validateCorrelationId,
  waitForManagedRemoteClearance,
  waitForManagedSshBootstrapFence
} from '../legacy-hermes/managed-ssh-update'
import { clampPoolLimits } from '../legacy-hermes/pool-limits'
import {
  type LocalBackendSpawnPriority
} from '../legacy-hermes/pool-spawn-coordinator'
import * as remoteLifecycle from '../legacy-hermes/remote-lifecycle'
import {
  RemoteLivenessTracker,
  RemoteRevalidationCoordinator
} from '../legacy-hermes/remote-liveness'
import {
  applyRemoteRequestHeaders
} from '../legacy-hermes/remote-ws-headers'
import {
  detectRemotePlatform,
  probeWindowsRemote,
  terminateOwnedWindowsDashboardForUpdate
} from '../legacy-hermes/windows-remote-lifecycle'

import {
  persistPoolLimits,
} from './paths'

export const remoteLiveness = new RemoteLivenessTracker()

export const remoteRevalidation = new RemoteRevalidationCoordinator()

export function applySpawnPriority(scopeKey: string, spawnPriority: LocalBackendSpawnPriority): () => void {
  if (spawnPriority !== 'foreground') {
    return () => undefined
  }

  const existing = backendPool.get(scopeKey)

  if (existing) {
    promotePoolEntry(existing)
  } else {
    pendingForegroundSpawns.add(scopeKey)
  }

  return () => void pendingForegroundSpawns.delete(scopeKey)
}

export function setPoolLimits(raw) {
  setPoolLimits(clampPoolLimits(raw))
  persistPoolLimits(poolLimits)
  localBackendSpawnCoordinator.setLimit(poolLimits.maxBackends)
  evictLruPoolBackends(poolMaxBackends())
  startPoolIdleReaper()

  return { ...poolLimits }
}

export const MAX_BOOTSTRAP_REPAIR_SOFT_ATTEMPTS = 3

export let remoteHeaderRulesInstalled = false

export function headersForRemoteRequest(requestUrl) {
  const exactWsHeaders = remoteWsHeaderStore.headersFor(requestUrl)

  if (exactWsHeaders && Object.keys(exactWsHeaders).length > 0) {
    return exactWsHeaders
  }

  const config = readDesktopConnectionConfig()

  if (modeIsRemoteLike(config.mode) && config.remote?.url) {
    const headers = decryptRemoteHeaders(config.remote.headers)

    if (Object.keys(headers).length > 0 && remoteRequestMatchesBaseUrl(requestUrl, config.remote.url)) {
      return headers
    }
  }

  return {}
}

export function installRemoteHeaderRules() {
  if (remoteHeaderRulesInstalled) {
    return
  }

  remoteHeaderRulesInstalled = true
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    applyRemoteRequestHeaders(details, callback, headersForRemoteRequest)
  })
}

export const managedConnectionUpdates = new Map<string, Promise<any>>()

export const managedConnectionRecoveries = new Map<string, Promise<void>>()

export function writeManagedSshRecoveryRecords(records) {
  fs.mkdirSync(path.dirname(DESKTOP_MANAGED_SSH_RECOVERY_PATH), { recursive: true })
  writeSecretFileAtomic(
    DESKTOP_MANAGED_SSH_RECOVERY_PATH,
    JSON.stringify({ version: 1, records, updatedAt: new Date().toISOString() }, null, 2)
  )
}

export function persistManagedSshRecovery(source, correlationId, scopes) {
  const prefix = backendScopePrefix(source.id)
  const recoveryScopes = managedSshRecoveryScopes(scopes, prefix)

  const records = readManagedSshRecoveryRecords().filter(record => record.connectionId !== source.id)
  records.push({
    connectionId: source.id,
    correlationId: validateCorrelationId(correlationId),
    createdAt: new Date().toISOString(),
    phase: 'prepared',
    scopes: recoveryScopes,
    // Registry secrets are already safeStorage envelopes. Persist the exact
    // connection snapshot so crash recovery does not silently switch hosts or
    // credentials after a Settings edit.
    source
  })
  writeManagedSshRecoveryRecords(records)
}

export function markManagedSshRecoveryLaunching(connectionId, correlationId) {
  const records = readManagedSshRecoveryRecords()

  const index = records.findIndex(
    record => record.connectionId === connectionId && record.correlationId === correlationId
  )

  if (index < 0) {
    throw new Error('Managed SSH recovery record disappeared before remote update launch.')
  }

  records[index] = { ...records[index], phase: 'launching' }
  writeManagedSshRecoveryRecords(records)
}

export function clearManagedSshRecovery(connectionId, correlationId) {
  const records = readManagedSshRecoveryRecords()

  const remaining = records.filter(
    record => record.connectionId !== connectionId || record.correlationId !== correlationId
  )

  if (remaining.length === records.length) {
    return
  }

  if (remaining.length > 0) {
    writeManagedSshRecoveryRecords(remaining)
  } else {
    try {
      fs.unlinkSync(DESKTOP_MANAGED_SSH_RECOVERY_PATH)
    } catch (error: any) {
      if (error?.code !== 'ENOENT') {
        throw error
      }
    }
  }
}

export function resetBootProgressForReconnect() {
  updateBootProgress(
    {
      error: null,
      message: 'Restarting desktop connection',
      phase: 'backend.resolve',
      progress: 4,
      running: true
    },
    { allowDecrease: true }
  )
}

export function resetHermesConnection({ soft = false } = {}) {
  setBackendStartFailure(null)
  setRemoteReauthFailure(null)
  remoteLiveness.clear()
  const hermesProcess = backendConnectionState.invalidate()
  stopBackendChild(hermesProcess)

  if (!soft) {
    resetBootProgressForReconnect()
  }
}

export async function ensureManagedSshBackend(source, profile, correlationId) {
  return ensureManagedSshBackendAtKey(source, profile, backendScopeKey(source.id, profile), correlationId)
}

export async function ensureManagedSshBackendAtKey(source, profile, key, correlationId, tokenPersistenceSource = '') {
  managedConnectionUpdateGate.assertCanDial(source.id, correlationId)
  const existing = backendPool.get(key)

  if (existing) {
    existing.lastActiveAt = Date.now()

    return existing.connectionPromise
  }

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
    managedSshConfig(source, profile),
    null,
    correlationId,
    tokenPersistenceSource
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

export async function restoreManagedPrimarySshBackend(source, profile, correlationId) {
  managedConnectionUpdateGate.assertCanDial(source.id, correlationId)
  const profileKey = String(profile || '').trim() || 'default'

  if (managedPrimaryRestoreOwners.size > 0 && !managedPrimaryRestoreOwners.has(source.id)) {
    throw new Error('Another managed SSH primary restore is already in progress.')
  }

  managedPrimaryRestoreOwners.set(source.id, { correlationId, profile: profileKey, source })
  backendConnectionState.invalidate()

  try {
    return await startHermes()
  } finally {
    if (managedPrimaryRestoreOwners.get(source.id)?.correlationId === correlationId) {
      managedPrimaryRestoreOwners.delete(source.id)
    }
  }
}

export async function captureManagedSshScopes(source) {
  const prefix = backendScopePrefix(source.id)
  const config = readDesktopConnectionConfig()
  const registry = readDesktopConnectionsRegistry()

  const routeForProfile = profile =>
    resolveDesktopRemoteRoute({
      config,
      env: {
        token: process.env.HERMES_DESKTOP_REMOTE_TOKEN,
        url: process.env.HERMES_DESKTOP_REMOTE_URL
      },
      profile,
      registry
    })

  const pooled = [...backendPool.entries()]
    .filter(([key]) => {
      const state = sshConnections.get(key)
      const route = routeForProfile(String(key))

      return (
        managedSshScopeRole({
          connectionId: source.id,
          key: String(key),
          prefix,
          routeConnectionId: route?.kind === 'ssh' ? route.connectionId : '',
          state
        }) === 'pool'
      )
    })
    .map(([key, entry]) => ({
      drained: false,
      entry,
      forwardRestored: false,
      key,
      profile: String(key).startsWith(prefix) ? String(key).slice(prefix.length) || 'default' : String(key),
      registryScoped: String(key).startsWith(prefix),
      reuseToken: '',
      state: null,
      unsafeDrainFailure: false
    }))

  const pooledKeys = new Set(pooled.map(scope => scope.key))

  const primary = [...sshConnections.entries()]
    .filter(
      ([key, state]) =>
        !pooledKeys.has(key) &&
        managedSshScopeRole({ connectionId: source.id, key: String(key), prefix, state }) === 'primary'
    )
    .map(([key, state]) => ({
      drained: false,
      entry: { connectionPromise: backendConnectionState.getPromise() },
      forwardRestored: false,
      key,
      primary: true,
      profile: String(primaryProfileKey() || 'default'),
      reuseToken: '',
      state,
      unsafeDrainFailure: false
    }))

  const primaryPromise = backendConnectionState.getPromise()
  const primaryProfile = String(primaryProfileKey() || 'default')
  const primaryRoute = routeForProfile(primaryProfile)

  if (
    primary.length === 0 &&
    primaryPromise &&
    primaryRoute?.kind === 'ssh' &&
    primaryRoute.connectionId === source.id
  ) {
    primary.push({
      drained: false,
      entry: { connectionPromise: primaryPromise },
      forwardRestored: false,
      key: primaryRoute.source === 'profile' ? sshScopeKey(primaryProfile) : sshScopeKey(null),
      primary: true,
      profile: primaryProfile,
      reuseToken: '',
      state: null,
      unsafeDrainFailure: false
    })
  }

  if (primary.length > 1) {
    throw new Error('Managed SSH update found multiple primary scopes; refusing an ambiguous drain.')
  }

  const captured: any[] = [...pooled, ...primary]

  // An already-started bootstrap may not have published sshConnections yet.
  // Join every bootstrap qualified to this registry id. Its final boundary
  // rechecks the managed gate and exact-terminates any serve it created, so no
  // pre-claim dial can publish while the updater mutates the remote install.
  await waitForManagedSshBootstrapFence(sshBootstrapCoordinator.active, source.id)

  for (const scope of captured) {
    try {
      const descriptor: any = await scope.entry.connectionPromise

      // Every independently spawned profile has its own random served token.
      // Keep it on the scope—not one mutable connection snapshot—so restore
      // can authenticate/reuse the exact process it captured.
      scope.reuseToken = String(descriptor?.token || '')
    } catch (error: any) {
      if (error?.unsafeManagedBootstrap === true) {
        throw error
      }
      // A still-pending pooled scope remains part of the restore worklist even
      // if its original dial loses the race with the update gate.
    }

    scope.state = sshConnections.get(scope.key) || null
  }

  return captured
}

export function remoteUpdateTargetFromState(state): RemoteUpdateTarget {
  if (!state?.ssh || !state?.hermesPath || !state?.hermesHome) {
    throw new Error('The managed SSH scope does not carry a complete remote runtime identity.')
  }

  if (!['Darwin', 'Linux', 'Windows'].includes(state.remotePlatform)) {
    throw new Error(`Unsupported managed SSH update platform: ${state.remotePlatform || 'unknown'}.`)
  }

  return {
    ssh: state.ssh,
    platform: state.remotePlatform,
    hermesPath: state.hermesPath,
    hermesHome: state.hermesHome,
    ...(state.pythonPath ? { pythonPath: state.pythonPath } : {})
  }
}

export async function openManagedSshUpdateTransport(
  source
): Promise<{ close: () => Promise<void>; target: RemoteUpdateTarget }> {
  const config = managedSshConfig(source)

  if (!config) {
    throw new Error(`SSH connection "${source.label}" has no host configured.`)
  }

  const ssh = createSshProbeConnection(
    { host: config.host, user: config.user, port: config.port, keyPath: config.keyPath },
    { rememberLog: sshRememberLog }
  )

  await ssh.open()

  try {
    const platform: any = await detectRemotePlatform(ssh, config.remoteHermesPath || '')

    if (platform.os === 'Windows') {
      const runtime = platform.hermesPath ? platform : await probeWindowsRemote(ssh, config.remoteHermesPath || '')

      return {
        close: () => ssh.close(),
        target: {
          ssh,
          platform: 'Windows',
          hermesPath: runtime.hermesPath,
          hermesHome: runtime.hermesHome,
          pythonPath: runtime.python
        }
      }
    }

    const hermesPath = await remoteLifecycle.locateHermes(ssh, config.remoteHermesPath || '')
    const hermesHome = await remoteLifecycle.probeRemoteHermesHome(ssh)

    return {
      close: () => ssh.close(),
      target: { ssh, platform: platform.os, hermesPath, hermesHome }
    }
  } catch (error) {
    await ssh.close()
    throw error
  }
}

export async function drainManagedSshScope(scope) {
  const state = scope.state
  let forwardClosed = false

  try {
    if (!state) {
      return
    }

    terminalIpc.disposeTerminalSessionsForSshScope(scope.key)

    if (state.localPort && state.remotePort) {
      await state.ssh.cancelForward(state.localPort, state.remotePort)
      forwardClosed = true
    }

    const expected = {
      ownershipId: state.ownershipId,
      pid: state.pid,
      spawnNonce: state.spawnNonce,
      profile: state.remoteProfile || '',
      hermesPath: state.hermesPath,
      hermesHome: state.hermesHome,
      startedAt: state.startedAt,
      creationTimeNs: state.creationTimeNs,
      creationTime: state.creationTime
    }

    if (state.remotePlatform === 'Windows') {
      await terminateOwnedWindowsDashboardForUpdate(
        state.ssh,
        { hermesPath: state.hermesPath, hermesHome: state.hermesHome, python: state.pythonPath },
        expected
      )
    } else if (state.remotePlatform === 'Linux' || state.remotePlatform === 'Darwin') {
      await remoteLifecycle.terminateOwnedDashboardForUpdate(state.ssh, expected)
    } else {
      throw new Error(`Unsupported managed SSH update platform: ${state.remotePlatform || 'unknown'}.`)
    }
  } catch (error: any) {
    // Ownership refusal is a no-kill result. Keep the original pool/state and
    // restore its exact forward in place; routing it through generic stale
    // cleanup could discard the create-time fence that just refused the kill.
    scope.unsafeDrainFailure = true

    if (state && state.localPort && state.remotePort && scope.reuseToken) {
      try {
        // A failed cancel may mean the old tunnel is still healthy. Prove that
        // exact token first; only recreate the forward when cancellation was
        // confirmed, avoiding a duplicate-bind attempt that masks recovery.
        if (!forwardClosed) {
          await waitForHermes(`http://127.0.0.1:${state.localPort}`, scope.reuseToken, undefined, 'token')
        } else {
          await state.ssh.forward(state.localPort, state.remotePort)
          await waitForHermes(`http://127.0.0.1:${state.localPort}`, scope.reuseToken, undefined, 'token')
        }

        scope.forwardRestored = true
      } catch (restoreError: any) {
        error.message = `${error.message} The original forward also failed to recover: ${restoreError?.message || restoreError}`
      }
    }

    throw error
  } finally {
    if (!scope.unsafeDrainFailure) {
      scope.drained = true

      if (scope.primary) {
        backendConnectionState.invalidate()
      } else if (backendPool.get(scope.key) === scope.entry) {
        backendPool.delete(scope.key)
      }

      if (state && sshConnections.get(scope.key) === state) {
        sshConnections.delete(scope.key)
      }
    }
  }
}

export async function updateManagedSshConnection(source, correlationId) {
  const sourceSnapshot = { ...source }
  const scopes = await captureManagedSshScopes(sourceSnapshot)
  let ephemeral: null | { close: () => Promise<void>; target: RemoteUpdateTarget } = null
  let launchAttempted = false
  const firstState = scopes.find(scope => scope.state)?.state

  const target = firstState
    ? remoteUpdateTargetFromState(firstState)
    : (ephemeral = await openManagedSshUpdateTransport(sourceSnapshot)).target

  return runManagedSshUpdate({
    connectionId: source.id,
    correlationId,
    scopes,
    preflightRemote: () => assertManagedUpdatePreflightClear(target, correlationId),
    drainScope: drainManagedSshScope,
    updateRemote: () =>
      executeManagedRemoteUpdate(target, correlationId, {}, async () => {
        markManagedSshRecoveryLaunching(source.id, correlationId)
        launchAttempted = true
      }),
    awaitRestoreClearance: () =>
      waitForManagedRemoteClearance(target, correlationId, { requireTerminal: launchAttempted }),
    closeTransports: async () => {
      const transports = new Set<any>(
        scopes
          .filter(scope => scope.drained)
          .map(scope => scope.state?.ssh)
          .filter(Boolean)
      )

      await Promise.allSettled([...transports].map(ssh => ssh.close()))

      if (ephemeral) {
        await ephemeral.close()
      }
    },
    restoreScope: scope => {
      if (scope.unsafeDrainFailure) {
        if (!scope.forwardRestored) {
          throw new Error(`The original ${scope.profile} SSH forward could not be restored safely.`)
        }

        return scope.entry.connectionPromise
      }

      const scopedSource = scope.reuseToken
        ? { ...sourceSnapshot, token: encryptDesktopSecret(scope.reuseToken) }
        : sourceSnapshot

      if (scope.primary) {
        return restoreManagedPrimarySshBackend(scopedSource, scope.profile, correlationId)
      }

      return scope.registryScoped
        ? ensureManagedSshBackend(scopedSource, scope.profile, correlationId)
        : ensureManagedSshBackendAtKey(scopedSource, scope.profile, scope.key, correlationId, 'profile')
    },
    prepareRecovery: async () => persistManagedSshRecovery(sourceSnapshot, correlationId, scopes),
    completeRecovery: async () => clearManagedSshRecovery(source.id, correlationId),
    releaseGate: () => managedConnectionUpdateGate.release(source.id, correlationId)
  })
}

export async function recoverManagedSshUpdate(record) {
  const connectionId = record.connectionId

  if (managedConnectionRecoveries.has(connectionId) || managedConnectionUpdates.has(connectionId)) {
    return
  }

  const recoveryCorrelation = record.correlationId

  if (!managedConnectionUpdateGate.claim(connectionId, recoveryCorrelation)) {
    return
  }

  const operation = (async () => {
    let transport: null | { close: () => Promise<void>; target: RemoteUpdateTarget } = null

    try {
      transport = await openManagedSshUpdateTransport(record.source)

      const results = await recoverManagedSshScopes<any>({
        scopes: record.scopes,
        awaitClearance: () =>
          waitForManagedRemoteClearance(transport!.target, record.correlationId, {
            requireTerminal: record.phase === 'launching'
          }),
        afterClearance: async () => {
          await transport!.close()
          transport = null
        },
        restoreScope: scope =>
          scope.kind === 'primary'
            ? restoreManagedPrimarySshBackend(record.source, scope.profile, recoveryCorrelation)
            : scope.kind === 'legacy'
              ? ensureManagedSshBackendAtKey(record.source, scope.profile, scope.key, recoveryCorrelation, 'profile')
              : ensureManagedSshBackend(record.source, scope.profile, recoveryCorrelation),
        completeRecovery: async () => clearManagedSshRecovery(connectionId, record.correlationId)
      })

      if (results.every(result => result.status === 'fulfilled')) {
        sshRememberLog(
          `[ssh-update] restored ${record.scopes.length} scope(s) from durable recovery for ${connectionId}`
        )
      } else {
        const failures = results.filter(result => result.status === 'rejected').length
        sshRememberLog(
          `[ssh-update] durable recovery for ${connectionId} left ${failures} scope(s) pending; will retry next launch`
        )
      }
    } catch (error: any) {
      sshRememberLog(
        `[ssh-update] durable recovery for ${connectionId} remains pending: ${String(error?.message || error)}`
      )
    } finally {
      if (transport) {
        await transport.close().catch(() => undefined)
      }

      managedConnectionUpdateGate.release(connectionId, recoveryCorrelation)
      managedConnectionRecoveries.delete(connectionId)
    }
  })()

  managedConnectionRecoveries.set(connectionId, operation)
  await operation
}

export function getRemoteHeaderRulesInstalled() {
  return remoteHeaderRulesInstalled
}

export function setRemoteHeaderRulesInstalled(value: any) {
  remoteHeaderRulesInstalled = value
}
