import {
  hostLabelFromBaseUrl,
  modeIsRemoteLike,
  normalizeRemoteBaseUrl,
  normalizeRemoteHeaders,
  normalizeSshConfig,
  normAuthMode
} from '../connection-config'
import {
  ConnectionKind,
  ConnectionRegistry,
  LABEL_MAX,
  LOCAL_CONNECTION_ID,
  QuarantinedRegistryEntry,
  REGISTRY_QUARANTINE_CAP,
  REGISTRY_VERSION,
  RegistryConnection,
  labelKey,
  labelSlug,
  uniqueLabel
} from './identity'

/** Schema normalization: connection input validation, canonical kinds, and
 *  whole-registry normalization. */

const CANONICAL_KIND_PRIORITY: Record<ConnectionKind, number> = { cloud: 3, local: 0, remote: 2, ssh: 1 }

/**
 * Which connection represents a collapsed same-backend roster row: the ACTIVE
 * (primary) connection when it is one of the candidates — the row should route
 * where the window already routes — else the highest kind priority, else the
 * earliest-registered (enumeration order follows registry order).
 */
export function pickCanonicalConnection<T extends { connection: RegistryConnection; order: number }>(
  candidates: T[],
  primaryConnectionId?: string
): T {
  const active = primaryConnectionId ? candidates.find(c => c.connection.id === primaryConnectionId) : undefined

  if (active) {
    return active
  }

  return [...candidates].sort(
    (a, b) =>
      CANONICAL_KIND_PRIORITY[a.connection.kind] - CANONICAL_KIND_PRIORITY[b.connection.kind] || a.order - b.order
  )[0]
}

// ── Fan-out update eligibility ──────────────────────────────────────────────

export interface UpdateEligibility {
  eligible: boolean
  /** Present when not eligible: 'cloud-managed' (platform updates it). */
  reason?: 'cloud-managed'
}

/**
 * Whether "Update all instances" may drive this connection. Hermes Cloud
 * instances are platform-managed — we never run `hermes update` against them.
 * Local, remote, and ssh sources are all eligible (reachability and busy
 * checks happen at dispatch time, not here).
 */
export function updateEligibility(connection: RegistryConnection): UpdateEligibility {
  if (connection.kind === 'cloud') {
    return { eligible: false, reason: 'cloud-managed' }
  }

  return { eligible: true }
}

/** Mint a registry-unique id from a label (slug, then -2/-3… suffixes). */
export function connectionIdForLabel(label: string, taken: Iterable<string>): string {
  const used = new Set([...taken])
  const base = labelSlug(label)

  if (!used.has(base) && base !== LOCAL_CONNECTION_ID) {
    return base
  }

  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`

    if (!used.has(candidate) && candidate !== LOCAL_CONNECTION_ID) {
      return candidate
    }
  }
}

// ── Validation ──────────────────────────────────────────────────────────────

export interface ConnectionInput {
  id?: string
  kind: ConnectionKind
  label: string
  url?: string
  authMode?: string
  token?: unknown
  headers?: Record<string, unknown>
  org?: string
  /** Cloud instance name, separate from the user-editable label. */
  name?: string
  host?: string
  user?: string
  port?: number | string
  keyPath?: string
  remoteHermesPath?: string
  remoteProfile?: string
}

/**
 * Validate + normalize a save payload into a RegistryConnection.
 * Throws with a user-facing message on any violation. `registry` supplies the
 * uniqueness context; when `input.id` matches an existing entry this is an
 * edit and that entry is excluded from the label-collision check.
 */
export function normalizeConnectionInput(input: ConnectionInput, registry: ConnectionRegistry): RegistryConnection {
  const label = String(input.label || '').trim()

  if (!label) {
    throw new Error('Every connection needs a name. Give this instance a device name (e.g. "Homelab", "Work laptop").')
  }

  if (label.length > LABEL_MAX) {
    throw new Error(`Connection name is too long (max ${LABEL_MAX} characters).`)
  }

  const key = labelKey(label)
  const collision = registry.connections.find(c => labelKey(c.label) === key && c.id !== input.id)

  if (collision) {
    throw new Error(`A connection named "${collision.label}" already exists. Connection names must be unique.`)
  }

  const kind = input.kind

  if (kind === 'local') {
    // The local entry is managed by the app; only its label is editable.
    return { id: LOCAL_CONNECTION_ID, kind: 'local', label }
  }

  // The reserved local id can never be claimed by a non-local entry — a
  // crafted IPC payload ({id:'local', kind:'remote', …}) would otherwise
  // replace the local entry via upsert and break the exactly-one-local
  // invariant. connectionIdForLabel never mints 'local'; reject it when
  // supplied, too.
  if (input.id === LOCAL_CONNECTION_ID) {
    throw new Error('The id "local" is reserved for the local connection.')
  }

  const id =
    input.id ||
    connectionIdForLabel(
      label,
      registry.connections.map(c => c.id)
    )

  if (kind === 'ssh') {
    const ssh = normalizeSshConfig({
      mode: 'ssh',
      host: input.host,
      user: input.user,
      port: input.port,
      keyPath: input.keyPath,
      remoteHermesPath: input.remoteHermesPath,
      remoteProfile: input.remoteProfile
    })

    if (!ssh) {
      throw new Error('SSH connections need a host.')
    }

    const { mode: _mode, ...sshFields } = ssh

    // Duplicate prevention (enforced here so a crafted IPC payload can't slip
    // past the editor's check): two ssh entries collide on the same
    // user@host:port + remote profile.
    const sshKey = (c: { host?: string; port?: number; remoteProfile?: string; user?: string }) =>
      `${(c.user || '').toLowerCase()}@${(c.host || '').toLowerCase()}:${c.port ?? 22}::${(c.remoteProfile || '').trim()}`

    const sshDupe = registry.connections.find(c => c.kind === 'ssh' && c.id !== id && sshKey(c) === sshKey(sshFields))

    if (sshDupe) {
      throw new Error(`A connection to this SSH host already exists ("${sshDupe.label}").`)
    }

    const entry: RegistryConnection = { id, kind: 'ssh', label, ...sshFields }

    // Carry the adopted session-token envelope across edits (mirrors the remote
    // branch): dropping it made a label rename wipe the backend's reuse
    // credential and force the reap-and-respawn loop of #103795.
    if (input.token !== undefined) {
      entry.token = input.token
    }

    return entry
  }

  if (kind === 'remote' || kind === 'cloud') {
    // normalizeRemoteBaseUrl throws its own user-facing message on bad input.
    const url = normalizeRemoteBaseUrl(input.url)

    // Duplicate prevention: remote/cloud entries collide on the normalized URL
    // (trimmed, trailing slashes stripped, lowercased) regardless of kind — a
    // cloud entry and a remote entry pointing at the same gateway are dupes.
    const urlKey = (value: string) => value.trim().replace(/\/+$/, '').toLowerCase()

    const urlDupe = registry.connections.find(
      c => (c.kind === 'remote' || c.kind === 'cloud') && c.id !== id && urlKey(c.url || '') === urlKey(url)
    )

    if (urlDupe) {
      throw new Error(`A connection to this gateway URL already exists ("${urlDupe.label}").`)
    }

    const authMode = normAuthMode(input.authMode)
    const entry: RegistryConnection = { id, kind, label, url, authMode }

    // A token is only meaningful for token-auth remotes. Dropping it here is
    // what clears the stale envelope when an entry is switched token→oauth
    // (or is a cloud entry, which authenticates via the portal session) —
    // otherwise dead secret material rides along on the edited entry.
    if (input.token !== undefined && kind === 'remote' && authMode === 'token') {
      entry.token = input.token
    }

    // Extra gateway headers (access-proxy credentials) apply to any
    // remote-shaped entry regardless of auth mode — Cloudflare Access sits in
    // front of both token- and OAuth-gated gateways. Normalization drops
    // transport-/Hermes-managed names; an empty result stores nothing.
    if (input.headers !== undefined) {
      const headers = normalizeRemoteHeaders(input.headers)

      if (Object.keys(headers).length > 0) {
        entry.headers = headers
      }
    }

    const name = String(input.name || '').trim()

    if (kind === 'cloud' && name) {
      entry.name = name
    }

    const org = String(input.org || '').trim()

    if (kind === 'cloud' && org) {
      entry.org = org
    }

    return entry
  }

  throw new Error(`Unknown connection kind: ${String(kind)}`)
}

/**
 * Merge a (possibly partial) edit payload over the stored entry so fields the
 * editor doesn't carry survive a save. Renaming a migrated cloud entry must
 * not drop its `org` (downstream update-fanout uses it to skip
 * platform-managed instances), and renaming an ssh entry must not drop
 * `remoteHermesPath`/`remoteProfile`. Only fields the payload explicitly
 * carries (non-undefined) override; `token` is deliberately NOT merged here —
 * the caller owns secret handling.
 */
export function mergeConnectionInput(input: ConnectionInput, existing?: null | RegistryConnection): ConnectionInput {
  if (!existing || existing.kind !== input.kind) {
    return input
  }

  const merged: ConnectionInput = { ...input }

  const inherit = (field: keyof ConnectionInput & keyof RegistryConnection) => {
    if (merged[field] === undefined && existing[field] !== undefined) {
      ;(merged as unknown as Record<string, unknown>)[field] = existing[field]
    }
  }

  inherit('url')
  inherit('authMode')
  inherit('org')

  if (
    input.kind === 'cloud' &&
    (input.url === undefined || normalizeRemoteBaseUrl(input.url) === normalizeRemoteBaseUrl(existing.url))
  ) {
    inherit('name')
  }

  inherit('host')
  inherit('keyPath')
  inherit('remoteHermesPath')
  inherit('remoteProfile')
  // Headers inherit like other dial fields: an edit payload that omits the
  // field keeps the stored set; an explicit payload (even {}) is
  // authoritative so the editor can clear them.
  inherit('headers')

  // ssh user/port: the editor shows ONE composite host field (user@host:port),
  // and normalizeSshConfig gives explicit user/port fields precedence over the
  // parsed host string. Inheriting stored user/port alongside a NEW host string
  // would resurrect the old values over what the user just typed — so when the
  // payload carries a host, the host string is authoritative and stored
  // user/port are NOT inherited.
  if (input.host === undefined || !String(input.host).trim()) {
    inherit('user')
    inherit('port')
  }

  return merged
}

/**
 * True when an edit changes how a connection is DIALED — endpoint, auth, or
 * ssh routing fields — as opposed to a cosmetic label rename. Callers use
 * this to decide whether live pooled backends / renderer sockets for the
 * connection must be recycled after a save: a label-only edit keeps traffic
 * flowing, while a url/token/host change means everything currently open
 * points at the OLD target and must be torn down and re-dialed.
 */
export function connectionDialFieldsChanged(before: RegistryConnection, after: RegistryConnection): boolean {
  if (before.kind !== after.kind) {
    return true
  }

  const fields: (keyof RegistryConnection)[] = [
    'url',
    'authMode',
    'org',
    'host',
    'user',
    'port',
    'keyPath',
    'remoteHermesPath',
    'remoteProfile'
  ]

  for (const field of fields) {
    if ((before[field] ?? null) !== (after[field] ?? null)) {
      return true
    }
  }

  // Token envelopes are opaque here (main.ts encrypts). An edit that carries
  // no new token inherits the stored envelope verbatim, so structural
  // equality is exact for the label-only case.
  if (JSON.stringify(before.token ?? null) !== JSON.stringify(after.token ?? null)) {
    return true
  }

  // Headers are dial material too: a changed access-proxy credential means
  // every open socket/backend authenticated with the OLD set.
  return JSON.stringify(before.headers ?? null) !== JSON.stringify(after.headers ?? null)
}

// ── Registry-level operations (all pure: return a new registry) ────────────

export function localEntry(label = 'This device'): RegistryConnection {
  return { id: LOCAL_CONNECTION_ID, kind: 'local', label }
}

/**
 * Coerce arbitrary parsed JSON into a valid registry: version stamped, a
 * local entry guaranteed, labels de-duplicated defensively (suffix, never
 * drop), primary always pointing at an existing entry. A hand-edited or
 * corrupt file degrades to a minimal local-only registry rather than
 * throwing at boot.
 */
export function normalizeRegistry(raw: unknown): ConnectionRegistry {
  const parsed = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawConnections = Array.isArray(parsed.connections) ? parsed.connections : []
  const seenLabels = new Set<string>()
  const seenIds = new Set<string>()
  const connections: RegistryConnection[] = []
  const quarantined: QuarantinedRegistryEntry[] = []

  const quarantine = (reason: string, entry: unknown) => {
    if (quarantined.length < REGISTRY_QUARANTINE_CAP) {
      quarantined.push({ reason, entry })
    }
  }

  // Entries quarantined by a previous load are user data too — carry them
  // through every subsequent normalize/write cycle rather than dropping them
  // the first time the file is rewritten.
  if (Array.isArray(parsed.quarantined)) {
    for (const item of parsed.quarantined) {
      if (item && typeof item === 'object' && 'entry' in (item as Record<string, unknown>)) {
        quarantine(
          String((item as Record<string, unknown>).reason || 'unknown'),
          (item as Record<string, unknown>).entry
        )
      }
    }
  }

  // Best-effort plain-data copy for entries that blew up mid-normalization —
  // the raw object may carry whatever poisoned it, so never persist it as-is.
  const safeEntryCopy = (item: unknown) => {
    try {
      return JSON.parse(JSON.stringify(item))
    } catch {
      return { unserializable: true }
    }
  }

  for (const item of rawConnections) {
    if (!item) {
      continue // null/false/'' carry no user data
    }

    if (typeof item !== 'object') {
      // A string/number here is usually a mangled hand-edit — still user data.
      quarantine('entry-malformed', item)

      continue
    }

    // One bad entry must never abort the whole registry load (#94246): any
    // unexpected throw quarantines THIS entry and the loop moves on.
    try {
      const entry = item as Record<string, unknown>
      const kind = entry.kind

      if (kind !== 'local' && kind !== 'remote' && kind !== 'cloud' && kind !== 'ssh') {
        quarantine('entry-unrecognized-kind', item)

        continue
      }

      let label = String(entry.label || '').trim()

      if (!label) {
        // Defensive: registry entries are always written with labels, but a
        // hand-edited file may drop one. Derive rather than discard.
        label =
          kind === 'ssh' ? String(entry.host || 'ssh') : hostLabelFromBaseUrl(String(entry.url || '')) || String(kind)
      }

      label = uniqueLabel(label, seenLabels)

      let id = kind === 'local' ? LOCAL_CONNECTION_ID : String(entry.id || '').trim()

      if (!id || (seenIds.has(id) && kind !== 'local')) {
        id = connectionIdForLabel(label, seenIds)
      }

      if (seenIds.has(id)) {
        continue // second 'local' entry — first one wins
      }

      seenLabels.add(labelKey(label))
      seenIds.add(id)

      const clean: RegistryConnection = { id, kind, label }

      if (kind === 'remote' || kind === 'cloud') {
        const url = String(entry.url || '').trim()

        if (!url) {
          quarantine('entry-missing-url', item)

          continue
        }

        clean.url = url
        clean.authMode = normAuthMode(entry.authMode)

        if (entry.token !== undefined) {
          clean.token = entry.token
        }

        const storedHeaders = normalizeRemoteHeaders(entry.headers)

        if (Object.keys(storedHeaders).length > 0) {
          clean.headers = storedHeaders
        }

        const name = String(entry.name || '').trim()

        if (kind === 'cloud' && name) {
          clean.name = name
        }

        const org = String(entry.org || '').trim()

        if (kind === 'cloud' && org) {
          clean.org = org
        }
      } else if (kind === 'ssh') {
        const ssh = normalizeSshConfig({ ...entry, mode: 'ssh' })

        if (!ssh) {
          quarantine('entry-missing-ssh-host', item)

          continue
        }

        const { mode: _mode, ...sshFields } = ssh
        Object.assign(clean, sshFields)

        // normalizeSshConfig describes only the dial, so the token
        // persistSshConnectionToken() adopted must be carried explicitly (as the
        // remote/cloud branch does). Losing it on a cold read fails the
        // remote-lifecycle reuse gate and reaps a healthy backend (#103795).
        if (entry.token !== undefined) {
          clean.token = entry.token
        }
      }

      connections.push(clean)
    } catch {
      quarantine('entry-normalization-failed', safeEntryCopy(item))
    }
  }

  if (!connections.some(c => c.kind === 'local')) {
    connections.unshift(localEntry())
  }

  const storedPrimary = String(parsed.primary || '').trim()
  const primary = connections.some(c => c.id === storedPrimary) ? storedPrimary : LOCAL_CONNECTION_ID
  const storedLastUsed = String(parsed.lastUsed || '').trim()

  const normalized: ConnectionRegistry = {
    version: REGISTRY_VERSION,
    primary,
    launchMode: parsed.launchMode === 'last-used' ? 'last-used' : 'primary',
    lastUsed: connections.some(c => c.id === storedLastUsed) ? storedLastUsed : primary,
    connections
  }

  if (quarantined.length > 0) {
    normalized.quarantined = quarantined
  }

  return normalized
}

/**
 * One-time import of the v1 connection.json shape (global `mode` + `remote`
 * block + per-profile `profiles` map) into a v2 registry. v1 had no labels,
 * so they are derived (URL host, SSH host, "This device") and uniqued by
 * suffixing. The active v1 global connection becomes the primary. The v1
 * file is left untouched by the caller — old builds keep working.
 *
 * Per-profile override entries become registry connections too (deduped by
 * URL/host against the global block), so a user who had `research` pinned to
 * a second gateway sees both sources registered on first launch.
 */

