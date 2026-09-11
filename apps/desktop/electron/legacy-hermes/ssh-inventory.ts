/**
 * legacy-hermes/ssh-inventory.ts
 *
 * What each registered SSH connection actually is, and which agent profiles it
 * exposes: the install-id probe and the per-connection profile enumeration that
 * populates the roster.
 *
 * Moved verbatim out of `main.ts` (E5c). Both are cached and both are bounded:
 * the install-id cache has a positive and a NEGATIVE TTL (a host that cannot be
 * probed must not be re-probed on every roster paint), and the inventory carries
 * a retry floor so a failing host is not enumerated in a tight loop.
 */
import { getJsonForBackend } from '../composition/api-proxy-composition'
import {
  backendDialClaims,
  backendPool,
  ensureRegistryBackend,
  globalRemoteActive,
  primaryProfileKey,
  profileHasRemoteOverride,
  readDesktopConnectionsRegistry,
  sshRememberLog
} from '../composition/bootstrap-env-composition'
import { createSshProbeConnection } from '../host-capabilities/platform/ssh-connection'

import { normalizeSshConfig } from './connection-config'
import type { RosterProfileMetadata } from './connection-registry'
import { backendScopeKey } from './connection-registry'
import { connectionInstallIds } from './connections-composition'
import * as remoteLifecycle from './remote-lifecycle'
import { rememberSshEnumeration, shouldRetrySshInventory } from './roster'
import { fetchRosterSourceData } from './roster-source-fetch'
import { resolveRegistryLocalRoute, shouldDeferLocalEnumeration } from './route-resolution'

export const sshRosterCache = new Map<string, string[]>()

export const sshInventoryAttemptedAt = new Map<string, number>()

export const SSH_INVENTORY_RETRY_MS = 60_000

export const INSTALL_ID_TTL_MS = 5 * 60_000

export const INSTALL_ID_NEGATIVE_TTL_MS = 60_000

export function rememberConnectionInstallId(connectionId: string, statusBody: any) {
  const raw = statusBody && typeof statusBody === 'object' ? statusBody.install_id : undefined
  const id = typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
  connectionInstallIds.set(connectionId, { id, ts: Date.now() })

  return id
}

export async function probeConnectionInstallId(connectionId: string, descriptor: any): Promise<string | undefined> {
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

export async function probeSshProfileInventory(connection) {
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

export async function enumerateRegistryAgentSources(registry = readDesktopConnectionsRegistry()) {
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
