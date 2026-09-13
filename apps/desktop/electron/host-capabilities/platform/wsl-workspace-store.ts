/**
 * host-capabilities/platform/wsl-workspace-store.ts
 *
 * Versioned local persistence for WSL Workspace records, round 1 ownership:
 * the Electron host keeps this file in the app's (isolated) userData until the
 * Work Core takes it over. Renderer copies are caches of this truth.
 *
 * Atomic write (tmp + rename), corrupt-file sidecar instead of silent data
 * loss, and a bounded idempotency memo for save request ids.
 *
 * Schema v2 (work order 36R): removal is an ARCHIVE, not a delete — records
 * gain `archivedAt` (null = live). v1 files stay readable and migrate on the
 * next write, with a byte-exact backup taken BEFORE the first v2 write of a
 * v1 file. A newer version refuses reads AND writes (a fresh store would let
 * a save clobber data this build cannot parse), and an ILLEGAL version value
 * refuses the same way while the original bytes stay untouched on disk.
 */

import fs from 'node:fs'
import path from 'node:path'

import type { WslWorkspaceRecord } from './wsl-workspace'

export const WSL_WORKSPACE_STORE_VERSION = 2

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

/**
 * Thrown when the version field is present but not a usable positive integer
 * (or is missing entirely — every writer since v1 stamps one). Refusing read
 * AND write keeps the original bytes untouched; guessing a version would let
 * a write erase a file we do not understand.
 */
export class WslWorkspaceStoreIllegalVersionError extends Error {
  constructor(readonly foundVersion: unknown) {
    super(`Workspace store version ${JSON.stringify(foundVersion) ?? foundVersion} is not a version this app can read.`)
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

/**
 * The version a raw file CLAIMS to be: a positive integer, or null when the
 * field is absent/illegal. `null` means "do not touch this file" — every
 * writer since v1 stamps a version, so anything else is a hand edit or
 * corruption, and the safe answer is refusal, not reinvention.
 */
export function parseStoreVersion(raw: unknown): null | number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1) {
    return null
  }

  return raw
}

/** Repair any array/object shape damage from hand edits or older versions. */
export function normalizeWorkspaceStoreFile(raw: unknown): WslWorkspaceStoreFile {
  const file = emptyStore()

  if (!raw || typeof raw !== 'object') {
    return file
  }

  const candidate = raw as { version?: unknown; workspaces?: unknown; savedRequests?: unknown }
  const version = parseStoreVersion(candidate.version)

  if (version !== null && version > WSL_WORKSPACE_STORE_VERSION) {
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
    updatedAt: typeof candidate.updatedAt === 'number' ? candidate.updatedAt : 0,
    // v1 records have no archive marker: everything that survived a v1 file
    // was live when it was written.
    archivedAt: typeof candidate.archivedAt === 'number' ? candidate.archivedAt : null
  }
}

export interface WslWorkspaceStore {
  load: () => WslWorkspaceStoreFile
  persist: (file: WslWorkspaceStoreFile) => void
}

/**
 * Create the versioned store. Before the FIRST write that upgrades an older
 * on-disk version, the original bytes are copied to `<store>.v<from>.bak` —
 * a migration that can be audited (or undone) instead of trusted. Later v2
 * writes never re-copy: the backup documents the v1→v2 step, not every save.
 */
export function createWslWorkspaceStore(storePath: string, deps?: {
  read?: (p: string) => string | null
  writeAtomic?: (p: string, data: string) => void
  copyRaw?: (from: string, to: string) => void
}): WslWorkspaceStore {
  const readFile = deps?.read ?? defaultRead
  const writeFile = deps?.writeAtomic ?? defaultWriteAtomic
  const copyRaw = deps?.copyRaw ?? defaultCopyRaw
  let migrationBackedUp = false

  type OnDiskState =
    | { kind: 'absent' }
    | { kind: 'corrupt'; raw: string }
    | { kind: 'parsed'; raw: string; version: null | number }

  function onDiskState(): OnDiskState {
    const raw = readFile(storePath)

    if (raw === null) {
      return { kind: 'absent' }
    }

    try {
      const parsed = JSON.parse(raw) as { version?: unknown }

      return { kind: 'parsed', raw, version: parseStoreVersion(parsed?.version) }
    } catch {
      // Unparseable bytes have no version to migrate or refuse on; the
      // corrupt-sidecar path owns this case.
      return { kind: 'corrupt', raw }
    }
  }

  /**
   * One-time guard ahead of an upgrading write: copy the ORIGINAL bytes so
   * the v1→v2 step is reversible. Failures to back up ABORT the write —
   * persisting without the backup would trade a documented migration for a
   * leap of faith.
   */
  function backupBeforeUpgrade(state: OnDiskState): void {
    if (migrationBackedUp || state.kind !== 'parsed' || state.version === null || state.version >= WSL_WORKSPACE_STORE_VERSION) {
      return
    }

    copyRaw(storePath, `${storePath}.v${state.version}.bak`)
    migrationBackedUp = true
  }

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

    if (parseStoreVersion(candidateVersion) === null) {
      // Illegal (or missing) version: refuse so no write can ever replace
      // bytes we do not understand. The file is left byte-for-byte intact.
      throw new WslWorkspaceStoreIllegalVersionError(candidateVersion)
    }

    return normalizeWorkspaceStoreFile(parsed)
  }

  function persist(file: WslWorkspaceStoreFile): void {
    const state = onDiskState()

    if (state.kind === 'parsed' && state.version === null) {
      // Defense in depth: the service refuses to read an illegal-version
      // store, so it can never reach a write — but persist refuses too, so
      // even a future caller cannot quietly replace bytes it misread.
      throw new WslWorkspaceStoreIllegalVersionError(state.version)
    }

    backupBeforeUpgrade(state)

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

function defaultCopyRaw(from: string, to: string): void {
  fs.copyFileSync(from, to)
}

function preserveCorruptSidecar(storePath: string, raw: string): void {
  try {
    fs.writeFileSync(`${storePath}.corrupt-${Date.now()}`, raw, 'utf8')
  } catch {
    // Nothing more we can do; the fresh store still wins over a crash.
  }
}
