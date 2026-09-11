/**
 * legacy-hermes/pool-revalidation.ts
 *
 * Keeping the pooled remote/SSH backends honest: probe them, drop the dead ones,
 * and re-dial or retire what a sleep/wake left suspect.
 *
 * Moved verbatim out of `main.ts` (E5c). A pooled entry backed by a remote host
 * has no child process, so the 'exit' handler that clears a dead LOOPBACK backend
 * never fires, and the renderer's keepalive touch keeps the idle reaper off it —
 * without this the pool serves a descriptor for an unreachable host indefinitely.
 *
 * The sweep is coalesced through the shared revalidation coordinator and bounded
 * inside; it is never a hot loop.
 */

import { rememberLog } from '../app/log-buffer'
import {
  backendDialClaims,
  backendPool,
  ensureBackend,
  ensureRegistryBackend,
  fetchJsonForBackend,
  sshBootstrapCoordinator,
  stopPoolBackend,
  teardownSshConnection
} from '../composition/bootstrap-env-composition'

import { parseBackendScopeKey } from './connection-registry'
import { poolTouchKeys } from './pool-touch-scope'
import { revalidatePooledRemoteBackends, revalidateSuspectPooledRemoteBackends } from './remote-liveness'
import { remoteLiveness, remoteRevalidation } from './runtime-composition'

export function touchPoolBackend(profile) {
  for (const key of poolTouchKeys(profile)) {
    const entry = backendPool.get(key)

    if (entry) {
      entry.lastActiveAt = Date.now()

      return
    }
  }
}

export function revalidatePool() {
  return revalidatePooledRemoteBackends({
    entries: backendPool.entries(),
    log: rememberLog,
    probe: (connection, path, options) => fetchJsonForBackend(connection, path, options),
    stopBackend: stopPoolBackend,
    tracker: remoteLiveness
  })
}

export function redialPoolBackendAfterResume(poolKey: string) {
  const { connectionId, profile } = parseBackendScopeKey(poolKey)

  return backendDialClaims.run(poolKey, () =>
    connectionId ? ensureRegistryBackend(connectionId, profile) : ensureBackend(profile)
  )
}

export const suspectPoolSweepScope = {}

export function revalidateSuspectPoolAfterResume() {
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
