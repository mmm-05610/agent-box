/**
 * host-capabilities/platform/wsl-workspace-store.ts
 *
 * Versioned local persistence for WSL Workspace records, round 1 ownership:
 * the Electron host keeps this file in the app's (isolated) userData until the
 * Work Core takes it over. Renderer copies are caches of this truth.
 *
 * Atomic write (tmp + rename), corrupt-file sidecar instead of silent data
 * loss, and a bounded idempotency memo for save request ids.
 */

import fs from 'node:fs'
import path from 'node:path'

import type { WslWorkspaceRecord } from './wsl-workspace'

export const WSL_WORKSPACE_STORE_VERSION = 1

/**
 * Thrown when the file on disk was written by a NEWER version of this app.
 * The caller must refuse to read OR write: returning an empty store would let
 * a save clobber data this build cannot parse.
 */
export class WslWorkspaceStoreFutureVersionError extends Error {
  constructor(readonly foundVersion: number) {
    super(`Workspace store version ${foundVersion} is newer than this app supports (${WSL_WORKSPACE_STORE_VERSION}).`)
  }
}

export interface WslWorkspaceStoreFile {
  version: number
  workspaces: WslWorkspaceRecord[]
  savedRequests: Record<string, { workspaceId: string; at: number }>
}

function emptyStore(): WslWorkspaceStoreFile {
  return { version: WSL_WORKSPACE_STORE_VERSION, workspaces: [], savedRequests: {} }
}

/** Repair any array/object shape damage from hand edits or older versions. */
export function normalizeWorkspaceStoreFile(raw: unknown): WslWorkspaceStoreFile {
  const file = emptyStore()

  if (!raw || typeof raw !== 'object') {
    return file
  }

  const candidate = raw as { version?: unknown; workspaces?: unknown; savedRequests?: unknown }

  if (typeof candidate.version === 'number' && candidate.version > WSL_WORKSPACE_STORE_VERSION) {
    // A newer writer touched this file; do not rewrite what we can't parse.
    return file
  }

  if (Array.isArray(candidate.workspaces)) {
    for (const entry of candidate.workspaces) {
      const record = normalizeWorkspaceRecord(entry)

      if (record) {
        file.workspaces.push(record)
      }
    }
  }

  if (candidate.savedRequests && typeof candidate.savedRequests === 'object') {
    for (const [requestId, value] of Object.entries(candidate.savedRequests as Record<string, unknown>)) {
      const memo = value as { workspaceId?: unknown; at?: unknown }

      if (typeof memo?.workspaceId === 'string' && memo.workspaceId) {
        file.savedRequests[requestId] = { workspaceId: memo.workspaceId, at: typeof memo.at === 'number' ? memo.at : 0 }
      }
    }
  }

  return file
}

function normalizeWorkspaceRecord(entry: unknown): WslWorkspaceRecord | null {
  if (!entry || typeof entry !== 'object') {
    return null
  }

  const candidate = entry as Record<string, unknown>

  if (typeof candidate.id !== 'string' || !candidate.id || typeof candidate.rootPath !== 'string' || !candidate.rootPath.startsWith('/')) {
    return null
  }

  if (typeof candidate.distribution !== 'string' || !candidate.distribution) {
    return null
  }

  return {
    id: candidate.id,
    name: typeof candidate.name === 'string' && candidate.name ? candidate.name : candidate.rootPath,
    kind: 'wsl',
    distribution: candidate.distribution,
    configuredUser: typeof candidate.configuredUser === 'string' && candidate.configuredUser ? candidate.configuredUser : null,
    actualUser: typeof candidate.actualUser === 'string' ? candidate.actualUser : '',
    rootPath: candidate.rootPath,
    createdAt: typeof candidate.createdAt === 'number' ? candidate.createdAt : 0,
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0
  }
}

export interface WslWorkspaceStore {
  load: () => WslWorkspaceStoreFile
  persist: (file: WslWorkspaceStoreFile) => void
}

export function createWslWorkspaceStore(storePath: string, deps?: { read?: (p: string) => string | null; writeAtomic?: (p: string, data: string) => void }): WslWorkspaceStore {
  const readFile = deps?.read ?? defaultRead
  const writeFile = deps?.writeAtomic ?? defaultWriteAtomic

  function load(): WslWorkspaceStoreFile {
    const raw = readFile(storePath)

    if (raw === null) {
      return emptyStore()
    }

    let parsed: unknown

    try {
      parsed = JSON.parse(raw)
    } catch {
      preserveCorruptSidecar(storePath, raw)

      return emptyStore()
    }

    const candidateVersion = (parsed as { version?: unknown })?.version

    if (typeof candidateVersion === 'number' && candidateVersion > WSL_WORKSPACE_STORE_VERSION) {
      throw new WslWorkspaceStoreFutureVersionError(candidateVersion)
    }

    return normalizeWorkspaceStoreFile(parsed)
  }

  function persist(file: WslWorkspaceStoreFile): void {
    const serialized = JSON.stringify({ ...file, version: WSL_WORKSPACE_STORE_VERSION }, null, 2)

    writeFile(storePath, serialized)
  }

  return { load, persist }
}

function defaultRead(storePath: string): string | null {
  try {
    return fs.readFileSync(storePath, 'utf8')
  } catch (error) {
    if ((error as { code?: string })?.code === 'ENOENT') {
      return null
    }

    throw error
  }
}

function defaultWriteAtomic(storePath: string, data: string): void {
  fs.mkdirSync(path.dirname(storePath), { recursive: true })

  const tmp = `${storePath}.tmp-${process.pid}`

  try {
    fs.writeFileSync(tmp, data, 'utf8')
    fs.renameSync(tmp, storePath)
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch {
      // rename already consumed the tmp file
    }
  }
}

function preserveCorruptSidecar(storePath: string, raw: string): void {
  try {
    fs.writeFileSync(`${storePath}.corrupt-${Date.now()}`, raw, 'utf8')
  } catch {
    // Nothing more we can do; the fresh store still wins over a crash.
  }
}
