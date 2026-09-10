import {
  normalizeRemoteBaseUrl,
  normalizeSshConfig,
  normAuthMode
} from '../connection-config'
import { matchingConnectionId, type StoredRoute } from '../connection-route-identity'


/** Registry identities: ids, labels, scope keys, and resolved descriptors. */

export const REGISTRY_VERSION = 2

export const LOCAL_CONNECTION_ID = 'local'

/** Connection kinds. 'cloud' is remote-shaped (see modeIsRemoteLike) but keeps
 * its provenance so the UI can render the right card and updates can skip
 * platform-managed instances. */
export type ConnectionKind = 'cloud' | 'local' | 'remote' | 'ssh'

export interface RegistryConnection {
  id: string
  kind: ConnectionKind
  /** Required, unique (case-insensitive) display name — the "device name". */
  label: string
  /** remote/cloud: normalized base URL. */
  url?: string
  /** remote/cloud: 'token' | 'oauth'. */
  authMode?: 'oauth' | 'token'
  /** remote: encrypted token envelope (opaque here; main.ts encrypts/decrypts). */
  token?: unknown
  /** remote/cloud: extra gateway headers (Cloudflare Access etc.). Secret
   * envelopes, same shape as `token`; names pre-filtered through
   * normalizeRemoteHeaders. Optional and additive — v2 registries written
   * before this field keep loading unchanged. */
  headers?: Record<string, unknown>
  /** cloud: portal org slug/id the instance was discovered under. */
  org?: string
  /** Cloud instance name, separate from the user-editable label. */
  name?: string
  /** ssh fields (normalizeSshConfig shapes). */
  host?: string
  user?: string
  port?: number
  keyPath?: string
  remoteHermesPath?: string
  remoteProfile?: string
}

/**
 * A registry entry that failed normalization (#94246). The raw entry is USER
 * DATA — it is preserved verbatim here (and re-persisted on every write)
 * instead of being silently dropped, so a malformed/corrupt entry never
 * requires "delete connections.json" recovery and never loses the user's
 * connection material.
 */
export interface QuarantinedRegistryEntry {
  reason: string
  entry: unknown
}

/** Upper bound on preserved quarantine entries so a pathological file cannot
 * grow the registry without limit. Oldest-first within one load pass. */
export const REGISTRY_QUARANTINE_CAP = 20

export interface ConnectionRegistry {
  version: typeof REGISTRY_VERSION
  /** id of the connection that owns the window/primary backend. */
  primary: string
  /** Which saved source Sessions should restore when the app launches. */
  launchMode: 'last-used' | 'primary'
  /** Last source the Sessions workspace successfully opened. Additive in v2
   * so registries written before multi-source switching still normalize. */
  lastUsed: string
  connections: RegistryConnection[]
  /** Entries preserved from a malformed load — absent when empty. */
  quarantined?: QuarantinedRegistryEntry[]
}

// ── Labels and ids ──────────────────────────────────────────────────────────

export const LABEL_MAX = 64

/** Canonical comparison key for label uniqueness. */
export function labelKey(label: string): string {
  return String(label || '')
    .trim()
    .toLowerCase()
}

/**
 * Derive a registry-unique label from a candidate: clamps to LABEL_MAX (a
 * migrated URL host can exceed it, which would fail validation on any later
 * edit) and suffixes " 2" / " 3" / … on collision. The single home of the
 * label-dedup rule — normalizeRegistry and the migration both use it.
 */
export function uniqueLabel(candidate: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map(labelKey))

  // Reserve room for a collision suffix so the suffixed form stays in-bounds.
  const base = String(candidate || '')
    .trim()
    .slice(0, LABEL_MAX - 4)

  if (!used.has(labelKey(base))) {
    return base
  }

  for (let n = 2; ; n += 1) {
    const suffixed = `${base} ${n}`

    if (!used.has(labelKey(suffixed))) {
      return suffixed
    }
  }
}

/** Kebab-slug of a label for ids and @handles. Never empty for a non-empty label. */
export function labelSlug(label: string): string {
  const slug = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  return slug || 'connection'
}

/**
 * The one place the duplicate-agent naming rule lives: a profile that exists
 * on several registered sources renders as `@<profile>-<label-slug>`;
 * a profile unique across the roster keeps its bare name.
 */
export function agentHandle(profile: string, connectionLabel: string, duplicated: boolean): string {
  const name = String(profile || '').trim() || 'default'

  return duplicated ? `${name}-${labelSlug(connectionLabel)}` : name
}

/**
 * Pool key for a backend serving (connection, profile). The local/primary
 * connection keeps the BARE profile key so every legacy pool entry, reaper
 * log line, and touch call stays byte-identical for single-source users;
 * non-local connections get an unambiguous composite (`conn:<id>::<profile>`)
 * that cannot collide with a plain profile name (colons are invalid in
 * profile names).
 *
 * NOTE: the renderer's socket registry uses the twin implementation in
 * apps/shared/src/backend-scope.ts (`@hermes/shared`) — tsconfig project
 * boundaries prevent a single physical module here. The two are pinned
 * byte-identical by the cross-copy contract test in
 * connection-registry.test.ts; change BOTH or that test fails.
 */
export function backendScopeKey(connectionId: null | string | undefined, profile: null | string | undefined): string {
  const profileKey = String(profile ?? '').trim() || 'default'
  const connection = String(connectionId ?? '').trim()

  if (!connection || connection === LOCAL_CONNECTION_ID) {
    return profileKey
  }

  return `conn:${connection}::${profileKey}`
}

/**
 * Inverse of backendScopeKey(): recover (connectionId, profile) from a pool
 * key. A bare profile key (the local/primary scope) maps to a null
 * connectionId. Used by the post-resume rebuild path (#93910) to re-dial a
 * retired pool entry through the same claim-guarded ensure path a renderer
 * would use.
 */
export function parseBackendScopeKey(key: string): { connectionId: null | string; profile: string } {
  const value = String(key ?? '').trim()
  const match = /^conn:(.+?)::(.+)$/.exec(value)

  if (!match) {
    return { connectionId: null, profile: value || 'default' }
  }

  return { connectionId: match[1], profile: match[2] }
}

/** All pool keys owned by a connection share this prefix (used to stop them on remove). */
export function backendScopePrefix(connectionId: string): string {
  return `conn:${String(connectionId).trim()}::`
}

export interface RegistryLocalRoute {
  /** Reuse the legacy v1 ensureBackend path — it already resolves to the
   * app's own local runtime, so single-source behavior stays byte-identical. */
  delegate: boolean
  /** Pool key for the forced-local child when not delegating. */
  poolKey: string
}

export interface ResolvedConnectionSshDescriptor {
  effectiveConfigFingerprint?: string
  host?: string
  keyPath?: string
  port?: number
  remoteHermesPath?: string
  remoteProfile?: string
  user?: string
}

export interface ResolvedConnectionDescriptor {
  authMode?: unknown
  baseUrl?: string
  /** Property presence means this descriptor claims registry qualification.
   * Invalid or retired claims fail closed; only descriptors with no such
   * property may enter the legacy compatibility resolver. */
  connectionId?: unknown
  headers?: Record<string, unknown>
  mode?: 'local' | 'remote'
  org?: unknown
  remoteHost?: string
  remoteKind?: 'cloud' | 'ssh' | 'url'
  ssh?: ResolvedConnectionSshDescriptor
  token?: unknown
}

/**
 * Recover registry identity for a descriptor resolved through the legacy v1
 * profile path. Registry-scoped routes already carry `connectionId`; that
 * exact identity is authoritative only while it names a current registry
 * entry. Only genuinely unqualified descriptors may use compatibility
 * inference, which keeps migrated per-profile remotes truthful until v1 is
 * retired without letting malformed qualification fall through to a weaker
 * endpoint-shaped identity.
 */
export function resolvedConnectionId(
  registry: ConnectionRegistry,
  descriptor: ResolvedConnectionDescriptor
): null | string {
  if (Object.prototype.hasOwnProperty.call(descriptor, 'connectionId')) {
    const explicitConnectionId = descriptor.connectionId

    // Presence is authoritative even when the value is unusable. Never turn
    // a malformed, blank, unknown, or retired registry claim into permission
    // to infer a different source from mutable endpoint metadata.
    if (typeof explicitConnectionId !== 'string' || !explicitConnectionId.trim()) {
      return null
    }

    return registry.connections.some(connection => connection.id === explicitConnectionId) ? explicitConnectionId : null
  }

  if (descriptor.mode === 'local') {
    const localConnections = registry.connections.filter(connection => connection.kind === 'local')

    return localConnections.length === 1 ? localConnections[0].id : null
  }

  if (descriptor.mode !== 'remote') {
    return null
  }

  if (descriptor.remoteKind === 'ssh') {
    if (Object.prototype.hasOwnProperty.call(descriptor, 'ssh')) {
      if (!descriptor.ssh || typeof descriptor.ssh !== 'object') {
        return null
      }

      return matchingConnectionId(registry, { ...descriptor.ssh, kind: 'ssh' }, 'unique') ?? null
    }

    // Old descriptors expose only user@host after the tunnel has discarded
    // port/key/path/profile. That weak shape is compatible only when exactly
    // one registered SSH source even shares the target, and the defaulted
    // route still satisfies the canonical #88922 full-envelope matcher.
    const ssh = normalizeSshConfig({ mode: 'ssh', host: descriptor.remoteHost })

    if (!ssh) {
      return null
    }

    const target = normalizedSshTarget(ssh)

    const coarseMatches = registry.connections.filter(
      connection => connection.kind === 'ssh' && normalizedSshTarget(connection) === target
    )

    if (!target || coarseMatches.length !== 1) {
      return null
    }

    return matchingConnectionId(registry, { kind: 'ssh', ...ssh }, 'unique') ?? null
  }

  const kind = descriptor.remoteKind === 'cloud' ? 'cloud' : descriptor.remoteKind === 'url' ? 'remote' : null

  if (!kind) {
    return null
  }

  let url = ''

  try {
    url = normalizeRemoteBaseUrl(descriptor.baseUrl)
  } catch {
    return null
  }

  const authMode = normAuthMode(descriptor.authMode)

  const route: StoredRoute = {
    authMode,
    headers: descriptor.headers,
    kind,
    org: descriptor.org,
    token: descriptor.token,
    url
  }

  const hasExactEnvelope =
    Object.prototype.hasOwnProperty.call(descriptor, 'authMode') &&
    Object.prototype.hasOwnProperty.call(descriptor, 'headers') &&
    (authMode === 'oauth' || Object.prototype.hasOwnProperty.call(descriptor, 'token')) &&
    (kind === 'remote' || Object.prototype.hasOwnProperty.call(descriptor, 'org'))

  if (!hasExactEnvelope) {
    // A URL alone cannot choose among legal registrations that differ by auth,
    // headers, Cloud organization, or account. Require one coarse candidate
    // before the same full-envelope matcher is allowed to accept the legacy
    // defaults; otherwise zero/multiple candidates fail closed.
    const coarseMatches = registry.connections.filter(connection => {
      if (connection.kind !== kind) {
        return false
      }

      try {
        return normalizeRemoteBaseUrl(connection.url) === url
      } catch {
        return false
      }
    })

    if (coarseMatches.length !== 1) {
      return null
    }
  }

  return matchingConnectionId(registry, route, 'unique') ?? null
}


export function normalizedSshTarget(route: { host?: unknown; port?: unknown; user?: unknown }): null | string {
  const ssh = normalizeSshConfig({ ...route, mode: 'ssh' })

  if (!ssh) {
    return null
  }

  const host = String(ssh.host || '')
    .trim()
    .toLowerCase()

  const user = String(ssh.user || '')
    .trim()
    .toLowerCase()

  return user ? `${user}@${host}` : host
}

/**
 * How the registry's 'local' entry resolves a backend for `profile`.
 *
 * The 'local' entry means THIS machine's runtime — always. The legacy
 * ensureBackend() path instead follows the v1 connection.json routing table,
 * where a global remote mode (or a per-profile remote override) resolves to a
 * REMOTE descriptor. A migrated user whose v1 global mode was remote gets that
 * remote as the registry primary AND keeps the mandatory 'local' entry, so
 * delegating 'local' to the v1 route made the roster's "This device" rows
 * enumerate and dial the remote box: every profile appeared twice (forcing
 * -slug handles) and "local" agents talked to the remote.
 *
 * When the v1 route is already local we delegate (legacy path, byte-identical
 * pool keys). When v1 says remote, the local entry spawns its own genuinely
 * local child under a composite pool key: backendScopeKey('local', p) maps to
 * the BARE profile key by design, and that slot may already hold the v1
 * route's REMOTE descriptor — so the forced-local child pools under the
 * `conn:local::<profile>` form instead (colons are invalid in profile names,
 * so it cannot collide).
 */

