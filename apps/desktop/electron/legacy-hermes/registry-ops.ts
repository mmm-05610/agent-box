import {
  hostLabelFromBaseUrl,
  modeIsRemoteLike,
  normalizeRemoteBaseUrl,
  normalizeSshConfig
} from './connection-config'

import type { ConnectionKind, ConnectionRegistry, RegistryConnection} from './identity';
import { LOCAL_CONNECTION_ID, normalizedSshTarget, uniqueLabel } from './identity'
import { normalizeConnectionInput } from './schema'

/** Registry CRUD, primary/last-used selection, and drift reconciliation. */

export function upsertConnection(registry: ConnectionRegistry, entry: RegistryConnection): ConnectionRegistry {
  const connections = registry.connections.some(c => c.id === entry.id)
    ? registry.connections.map(c => (c.id === entry.id ? entry : c))
    : [...registry.connections, entry]

  return { ...registry, connections }
}

/**
 * Remove a connection. The local entry is not removable; removing the
 * current primary retargets primary to local.
 */
export function removeConnection(registry: ConnectionRegistry, id: string): ConnectionRegistry {
  const target = registry.connections.find(c => c.id === id)

  if (!target) {
    return registry
  }

  if (target.kind === 'local') {
    throw new Error('The local connection cannot be removed.')
  }

  const primary = registry.primary === id ? LOCAL_CONNECTION_ID : registry.primary

  return {
    ...registry,
    primary,
    lastUsed: registry.lastUsed === id ? primary : registry.lastUsed,
    connections: registry.connections.filter(c => c.id !== id)
  }
}

/** Point the window/primary backend at another registered connection. */
export function setPrimaryConnection(registry: ConnectionRegistry, id: string): ConnectionRegistry {
  if (!registry.connections.some(c => c.id === id)) {
    throw new Error(`No connection with id "${id}".`)
  }

  return { ...registry, primary: id }
}

/** Remember the last source the Sessions workspace opened successfully. */
export function setLastUsedConnection(registry: ConnectionRegistry, id: string): ConnectionRegistry {
  if (!registry.connections.some(c => c.id === id)) {
    throw new Error(`No connection with id "${id}".`)
  }

  return { ...registry, lastUsed: id }
}

/**
 * Reconcile a successfully-coerced global v1 connection config into the v2
 * registry. Settings still writes connection.json for compatibility, but an
 * Apply must publish the same primary identity to connections.json in the
 * same transaction or the live remote descriptor has no connectionId.
 *
 * Remote-shaped entries are matched by normalized URL across remote/cloud so
 * changing provenance never duplicates a gateway. Existing identity and
 * user-chosen label win; a Cloud name upgrades only the default host label. Switching to
 * local keeps registered remotes available while moving primary/last-used
 * back to This device.
 */
export function reconcileAppliedGlobalConnection(
  registry: ConnectionRegistry,
  config: Record<string, any>
): ConnectionRegistry {
  const mode = config?.mode

  if (!modeIsRemoteLike(mode)) {
    if (mode === 'local') {
      return { ...registry, primary: LOCAL_CONNECTION_ID, lastUsed: LOCAL_CONNECTION_ID }
    }

    // SSH registry identity is managed by its existing registry editor and
    // migration path. Do not reinterpret or delete it here.
    return registry
  }

  const block = config.remote && typeof config.remote === 'object' ? config.remote : {}
  const url = normalizeRemoteBaseUrl(block.url)

  const existing = registry.connections.find(connection => {
    if (connection.kind !== 'remote' && connection.kind !== 'cloud') {
      return false
    }

    try {
      return normalizeRemoteBaseUrl(connection.url) === url
    } catch {
      return false
    }
  })

  const kind: ConnectionKind = mode === 'cloud' ? 'cloud' : 'remote'

  const hostLabel = hostLabelFromBaseUrl(url) || (kind === 'cloud' ? 'Hermes Cloud' : 'Remote gateway')
  const name = kind === 'cloud' ? String(block.name ?? existing?.name ?? '').trim() : ''

  const label =
    existing && (!name || existing.label !== hostLabel)
      ? existing.label
      : uniqueLabel(
          name || hostLabel,
          registry.connections.filter(connection => connection.id !== existing?.id).map(connection => connection.label)
        )

  const entry = normalizeConnectionInput(
    {
      id: existing?.id,
      kind,
      label,
      url,
      authMode: block.authMode,
      token: block.token,
      headers: block.headers,
      org: block.org,
      name
    },
    registry
  )

  return {
    ...upsertConnection(registry, entry),
    primary: entry.id,
    lastUsed: entry.id
  }
}

/**
 * Heal an already-created registry that never learned about the v1 route it is
 * supposed to be serving.
 *
 * `migrateV1ToRegistry` runs exactly once — only when connections.json does not
 * exist. A user who was local at that moment and configured a remote gateway
 * afterwards (Settings -> Gateway writes connection.json alone) ends up with a
 * live remote that the registry cannot name: `resolvedConnectionId` returns
 * null, `primary` still says `local`, and every launch force-switches the
 * window onto a fresh local backend seconds after boot. Deleting
 * connections.json by hand is the only recovery today.
 *
 * Deliberately narrow: heal ONLY when the v1 global route has no matching
 * registry entry at all. That is the drift state and nothing else. If the
 * route is already registered but `primary` names another source, the user
 * chose that in the Connections panel and we leave it alone.
 *
 * SSH drifts the same way remote does: a v1 global `mode:'ssh'` route (host,
 * no url) written by Settings after the one-shot migration has no registry
 * identity, so `resolvedConnectionId` returns null, `primary` stays `local`,
 * and every launch re-homes the window onto a local backend — and because the
 * heal used to skip SSH entirely, the two files re-drifted after every update
 * relaunch instead of converging once.
 */
export function reconcileRegistryDrift(
  registry: ConnectionRegistry,
  v1: unknown
): { changed: boolean; registry: ConnectionRegistry } {
  const config = v1 && typeof v1 === 'object' ? (v1 as Record<string, any>) : {}
  const unchanged = { changed: false, registry }

  if (config.mode === 'ssh') {
    const ssh = normalizeSshConfig({
      ...(config.remote && typeof config.remote === 'object' ? config.remote : {}),
      mode: 'ssh'
    })

    if (!ssh) {
      // A v1 SSH route without a usable host is not a route we can register.
      return unchanged
    }

    const target = normalizedSshTarget(ssh)

    const alreadyRegistered = registry.connections.some(
      connection =>
        connection.kind === 'ssh' &&
        normalizedSshTarget(connection) === target &&
        (connection.port ?? 22) === (ssh.port ?? 22)
    )

    if (alreadyRegistered) {
      // Route is known; if primary names another source, that is the user's
      // Connections-panel choice, not drift.
      return unchanged
    }

    const { mode: _mode, ...sshFields } = ssh

    let entry: RegistryConnection

    try {
      entry = normalizeConnectionInput(
        {
          kind: 'ssh',
          label: uniqueLabel(
            ssh.host,
            registry.connections.map(connection => connection.label)
          ),
          ...sshFields
        },
        registry
      )
    } catch {
      // Validation failure (e.g. a crafted collision) must not corrupt the
      // registry; the v1 path keeps failing the way it already does.
      return unchanged
    }

    return {
      changed: true,
      registry: { ...upsertConnection(registry, entry), primary: entry.id, lastUsed: entry.id }
    }
  }

  if (!modeIsRemoteLike(config.mode)) {
    return unchanged
  }

  const block = config.remote && typeof config.remote === 'object' ? config.remote : {}

  let url = ''

  try {
    url = normalizeRemoteBaseUrl(block.url)
  } catch {
    // An unparseable v1 URL is not a route we can register. The v1 path keeps
    // failing the way it already does; do not corrupt the registry over it.
    return unchanged
  }

  if (!url) {
    return unchanged
  }

  const alreadyRegistered = registry.connections.some(connection => {
    if (connection.kind !== 'remote' && connection.kind !== 'cloud') {
      return false
    }

    try {
      return normalizeRemoteBaseUrl(connection.url) === url
    } catch {
      return false
    }
  })

  if (alreadyRegistered) {
    return unchanged
  }

  return { changed: true, registry: reconcileAppliedGlobalConnection(registry, config) }
}

/** Choose whether launch restores the explicit primary or the last-used source. */
export function setConnectionLaunchMode(registry: ConnectionRegistry, launchMode: string): ConnectionRegistry {
  if (launchMode !== 'last-used' && launchMode !== 'primary') {
    throw new Error(`Unknown connection launch mode "${String(launchMode)}".`)
  }

  return { ...registry, launchMode }
}
