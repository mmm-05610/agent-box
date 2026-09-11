import {
  hostLabelFromBaseUrl,
  modeIsRemoteLike,
  normalizeRemoteHeaders,
  normalizeSshConfig,
  normAuthMode
} from './connection-config'

import type { ConnectionRegistry, RegistryConnection} from './identity';
import { LOCAL_CONNECTION_ID, REGISTRY_VERSION, uniqueLabel } from './identity'
import { connectionIdForLabel, localEntry } from './schema'

/** V1 connection-config to v2 registry migration. */

export function migrateV1ToRegistry(v1: unknown): ConnectionRegistry {
  const config = v1 && typeof v1 === 'object' ? (v1 as Record<string, any>) : {}
  const connections: RegistryConnection[] = [localEntry()]
  const byFingerprint = new Map<string, RegistryConnection>()

  const addRemoteLike = (block: Record<string, any>, kind: 'cloud' | 'remote'): null | RegistryConnection => {
    const url = String(block?.url || '').trim()

    if (!url) {
      return null
    }

    const fingerprint = `${kind}:${url}`
    const existing = byFingerprint.get(fingerprint)

    if (existing) {
      return existing
    }

    const label = uniqueLabel(
      hostLabelFromBaseUrl(url) || (kind === 'cloud' ? 'Hermes Cloud' : 'Remote gateway'),
      connections.map(c => c.label)
    )

    const entry: RegistryConnection = {
      id: connectionIdForLabel(
        label,
        connections.map(c => c.id)
      ),
      kind,
      label,
      url,
      authMode: normAuthMode(block.authMode)
    }

    if (block.token !== undefined) {
      entry.token = block.token
    }

    const v1Headers = normalizeRemoteHeaders(block.headers)

    if (Object.keys(v1Headers).length > 0) {
      entry.headers = v1Headers
    }

    const name = String(block.name || '').trim()

    if (kind === 'cloud' && name) {
      entry.name = name
    }

    const org = String(block.org || '').trim()

    if (kind === 'cloud' && org) {
      entry.org = org
    }

    connections.push(entry)
    byFingerprint.set(fingerprint, entry)

    return entry
  }

  const addSsh = (block: Record<string, any>): null | RegistryConnection => {
    const ssh = normalizeSshConfig({ ...block, mode: 'ssh' })

    if (!ssh) {
      return null
    }

    const fingerprint = `ssh:${ssh.user || ''}@${ssh.host}:${ssh.port || 22}`
    const existing = byFingerprint.get(fingerprint)

    if (existing) {
      return existing
    }

    const label = uniqueLabel(
      ssh.host,
      connections.map(c => c.label)
    )

    const { mode: _mode, ...sshFields } = ssh

    const entry: RegistryConnection = {
      id: connectionIdForLabel(
        label,
        connections.map(c => c.id)
      ),
      kind: 'ssh',
      label,
      ...sshFields
    }

    connections.push(entry)
    byFingerprint.set(fingerprint, entry)

    return entry
  }

  // Global connection → an entry + the primary designation.
  let primary = LOCAL_CONNECTION_ID
  const globalMode = config.mode

  if (modeIsRemoteLike(globalMode)) {
    const entry = addRemoteLike(config.remote || {}, globalMode === 'cloud' ? 'cloud' : 'remote')

    if (entry) {
      primary = entry.id
    }
  } else if (globalMode === 'ssh') {
    const entry = addSsh(config.remote || {})

    if (entry) {
      primary = entry.id
    }
  }

  // Per-profile overrides → additional registered sources (deduped).
  const profiles = config.profiles && typeof config.profiles === 'object' ? config.profiles : {}

  for (const block of Object.values(profiles) as Record<string, any>[]) {
    if (!block || typeof block !== 'object') {
      continue
    }

    if (modeIsRemoteLike(block.mode)) {
      addRemoteLike(block, block.mode === 'cloud' ? 'cloud' : 'remote')
    } else if (block.mode === 'ssh') {
      addSsh(block)
    } else if (block.mode === 'local' && block.savedSsh) {
      addSsh(block.savedSsh)
    }
  }

  return { version: REGISTRY_VERSION, primary, launchMode: 'primary', lastUsed: primary, connections }
}

/** Insert or replace by id. Input must already be normalized/validated. */
