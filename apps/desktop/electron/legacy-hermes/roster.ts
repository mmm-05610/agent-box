import type { ConnectionKind, RegistryConnection} from './identity';
import { agentHandle } from './identity'
import { pickCanonicalConnection } from './schema'

/** Agent roster: ssh inventory memory, remote profile listings, roster build. */

export interface ConnectionAgents {
  connection: RegistryConnection
  /** Profile names enumerated from the connection, or null when unreachable /
   * connect-on-demand (ssh not yet dialed). */
  profiles: null | string[]
  /** Credential-free profile metadata from the same connection. Kept separate
   * from `profiles` so old enumerators can continue returning names only. */
  profileMetadata?: Record<string, RosterProfileMetadata>
  /** Present when profiles is null: why enumeration was skipped. */
  error?: string
  /** Stable backend identity from the connection's /api/status (`install_id`).
   * Two connections reporting the same id are the SAME physical install
   * registered under two addresses (hostname + Tailscale IP), so the roster
   * collapses their rows. Absent on older backends → no collapse (fully
   * backward compatible). */
  installId?: string
}

export interface RosterAgent {
  connectionId: string
  connectionKind: ConnectionKind
  connectionLabel: string
  profile: string
  /** Backend profile when the registry route maps the Desktop profile name. */
  targetProfile?: string
  /** Bare profile name, or `<profile>-<label-slug>` when the profile name
   * exists on more than one registered source (the @name-device rule). */
  handle: string
  /** Rich metadata for this exact connection + profile, when enumerated. */
  profileMetadata?: RosterProfileMetadata
}

export interface RosterProfileMetadata {
  display_name?: string
  title?: string
  ui_meta?: Record<string, unknown>
  has_avatar?: boolean
}

/**
 * Roster enumeration skips undialed sources (connect-on-demand) and reports
 * unreachable ones with `profiles: null`. Reuse the last successful profile
 * list so Bot Mode does not go empty (or drop to a partial roster) the moment
 * a source is briefly unreachable — SSH tunnels drop on sleep/wake, and a
 * remote gateway bounce (VPS restart) otherwise erased its bots from the
 * roster until the next successful enumeration ("my 4 bots show as 2", Aug
 * 2026 bundle). Never-seen SSH sources still get a `default` seed so the
 * device is clickable; never-seen remote sources stay empty (no seed) since
 * an unreachable URL is not evidence a backend exists there.
 */
export function rememberSshEnumeration(
  enumeration: Pick<ConnectionAgents, 'error' | 'profiles'>,
  cached: null | string[] | undefined,
  kind: ConnectionKind
): Pick<ConnectionAgents, 'error' | 'profiles'> {
  if (enumeration.profiles && enumeration.profiles.length > 0) {
    return enumeration
  }

  if (kind === 'local') {
    return enumeration
  }

  if (cached && cached.length > 0) {
    return { profiles: cached, error: enumeration.error }
  }

  if (kind === 'ssh' && enumeration.error === 'connect-on-demand') {
    return { profiles: ['default'], error: 'connect-on-demand' }
  }

  return enumeration
}

/** Whether an undialed SSH source should be inventoried again. Cached
 *  successes never retry. Failures retry after `retryAfterMs` so a cold box
 *  does not stay seeded as `default` until the user hits Test. */
export function shouldRetrySshInventory(
  hasCache: boolean,
  lastAttemptMs: null | number | undefined,
  nowMs: number,
  retryAfterMs = 60_000
): boolean {
  if (hasCache) {
    return false
  }

  if (lastAttemptMs == null) {
    return true
  }

  return nowMs - lastAttemptMs >= retryAfterMs
}

const PROFILE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/

/** Turn `ls ~/.hermes/profiles` output into roster names. Always includes
 *  `default`. Drops rollback snapshots and junk lines. */
export function parseRemoteProfileListing(text: string): string[] {
  const names = new Set<string>(['default'])

  for (const raw of String(text || '').split(/\r?\n/)) {
    const name = raw.trim()

    if (!name || name.startsWith('.') || name.endsWith('.rollback-old')) {
      continue
    }

    if (!PROFILE_NAME_RE.test(name)) {
      continue
    }

    names.add(name)
  }

  return ['default', ...[...names].filter(name => name !== 'default').sort()]
}

/**
 * Flatten per-connection profile enumerations into the union roster, applying
 * the duplicate-handle rule ONCE across all sources. Pure so the disambiguation
 * policy is testable without IPC; main.ts feeds it live enumerations.
 */
export function buildAgentRoster(
  enumerations: ConnectionAgents[],
  opts: { primaryConnectionId?: string } = {}
): RosterAgent[] {
  // A connection can transiently report the same profile more than once (or
  // arrive twice while registry state is reconciling). A roster row represents
  // one routable identity, so collapse strictly by connection + profile before
  // counting names for @name-device disambiguation.
  const identities = new Map<
    string,
    {
      connection: RegistryConnection
      installId?: string
      order: number
      profile: string
      profileMetadata?: RosterProfileMetadata
    }
  >()

  let order = 0

  for (const { connection, installId, profiles, profileMetadata } of enumerations) {
    for (const profile of profiles || []) {
      const name = String(profile || '').trim() || 'default'
      const key = `${connection.id}\0${name}`

      if (!identities.has(key)) {
        identities.set(key, {
          connection,
          installId,
          order,
          profile: name,
          ...(profileMetadata?.[name] ? { profileMetadata: profileMetadata[name] } : {})
        })
      }
    }

    order += 1
  }

  // Backend-identity collapse: two connections reporting the same install_id
  // are the SAME physical install registered under two addresses, so their
  // (install, profile) rows are one bot, not two. Connections without an id
  // (older backends, undialed ssh) keep a per-connection key — no collapse.
  const backends = new Map<
    string,
    { connection: RegistryConnection; order: number; profile: string; profileMetadata?: RosterProfileMetadata }[]
  >()

  for (const { connection, installId, order: rank, profile, profileMetadata } of identities.values()) {
    const key = installId ? `id:${installId}\0${profile}` : `conn:${connection.id}\0${profile}`
    const group = backends.get(key)

    if (group) {
      group.push({ connection, order: rank, profile, profileMetadata })
    } else {
      backends.set(key, [{ connection, order: rank, profile, profileMetadata }])
    }
  }

  const rows = [...backends.values()].map(group => pickCanonicalConnection(group, opts.primaryConnectionId))

  // The @name-device duplicate-handle rule runs AFTER the collapse, so a
  // profile that only *looked* duplicated (one box, two addresses) keeps its
  // bare name once the rows are recognized as one backend.
  const counts = new Map<string, number>()

  for (const { profile } of rows) {
    counts.set(profile, (counts.get(profile) || 0) + 1)
  }

  const roster: RosterAgent[] = []

  for (const { connection, profile, profileMetadata } of rows) {
    roster.push({
      connectionId: connection.id,
      connectionKind: connection.kind,
      connectionLabel: connection.label,
      profile,
      targetProfile: connection.remoteProfile || profile,
      handle: agentHandle(profile, connection.label, (counts.get(profile) || 0) > 1),
      ...(profileMetadata ? { profileMetadata } : {})
    })
  }

  return roster
}

/** Deterministic route priority for same-backend rows: local is definitionally
 * this box; ssh beats HTTP remotes; cloud last. */
