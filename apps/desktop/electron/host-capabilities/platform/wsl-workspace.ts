/**
 * host-capabilities/platform/wsl-workspace.ts
 *
 * The machine-local half of the WSL Workspace feature, round 1: discover WSL
 * distributions, verify a distribution + optional user really works, list
 * directories of the real Linux filesystem, and hand verified facts to the
 * workspace store.
 *
 * Scope guards (work order 35):
 * - This is an executor, not an authority. It never decides Harness, Session
 *   or Execution; it never imports `legacy-hermes/`.
 * - Every piece of user input travels as one argv element to `wsl.exe`.
 *   Nothing is ever interpolated into a shell string, on either side.
 * - Every probe is bounded: deadline + output cap + abortable operation.
 * - A temporary connection id is a correlation key into this module's own
 *   table, validated for ownership and expiry on every use. It is not a
 *   backend ref and carries no native execution identity.
 * - Failures are typed: code + safe message + retryable. No error text is
 *   ever shown to the user straight from wsl.exe.
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'

import { IS_WSL } from './platform-facts'

export type WslErrorCode =
  | 'WSL_UNAVAILABLE'
  | 'WSL_UNKNOWN_DISTRIBUTION'
  | 'WSL_USER_NOT_FOUND'
  | 'WSL_CONNECT_TIMEOUT'
  | 'WSL_CONNECT_FAILED'
  | 'WSL_CANCELLED'
  | 'WSL_CONNECTION_EXPIRED'
  | 'WSL_INVALID_PATH'
  | 'WSL_DIRECTORY_NOT_FOUND'
  | 'WSL_DIRECTORY_NO_PERMISSION'
  | 'WSL_LIST_FAILED'
  | 'WSL_LIST_OVERFLOW'
  | 'WSL_SAVE_FAILED'
  | 'WSL_NOT_FOUND'

export interface WslFailure {
  code: WslErrorCode
  message: string
  retryable: boolean
}

export function wslFailure(code: WslErrorCode, message: string, retryable: boolean): WslFailure {
  return { code, message, retryable }
}

export interface WslDistributionInfo {
  name: string
  state: string
  version: string | null
  isDefault: boolean
}

export interface WslWorkspaceRecord {
  id: string
  name: string
  kind: 'wsl'
  distribution: string
  /** null = "the distribution's default user at connect time". */
  configuredUser: null | string
  /** The identity actually observed when the record was saved. */
  actualUser: string
  rootPath: string
  createdAt: number
  updatedAt: number
}

export interface WslDirectoryEntry {
  name: string
  path: string
}

// --- pure helpers -----------------------------------------------------------

/** Older wsl.exe builds emit UTF-16LE without a BOM even under WSL_UTF8=1. */
export function stripWslOutputNuls(raw: string): string {
  return String(raw || '').replace(/\0/g, '')
}

/**
 * Parse `wsl.exe -l -v` output. Column separator is 2+ spaces; the default
 * distribution carries a leading `*`. Distro names with single internal
 * spaces survive; a missing VERSION column (very old WSL) parses as null.
 * The header line is locale-dependent ("NAME"/"名称"), so the first
 * non-empty line is always treated as the table header, never a row.
 */
export function parseWslListVerbose(raw: string): WslDistributionInfo[] {
  const lines = stripWslOutputNuls(raw).split(/\r?\n/).filter(line => line.trim())
  const out: WslDistributionInfo[] = []

  // The header row carries no `*`; a first line with one is a real row
  // (some WSL builds emit the table without a header).
  const rows = lines.length && !lines[0].trim().startsWith('*') ? lines.slice(1) : lines

  for (const line of rows) {
    const parts = line.trim().split(/\s{2,}/)

    if (parts.length < 2) {
      continue
    }

    let isDefault = false

    if (parts[0] === '*') {
      isDefault = true
      parts.shift()
    } else if (parts[0].startsWith('* ')) {
      isDefault = true
      parts[0] = parts[0].slice(2)
    }

    if (!parts[0]) {
      continue
    }

    out.push({
      name: parts[0].trim(),
      state: (parts[1] || '').trim(),
      version: parts[2] ? parts[2].trim() : null,
      isDefault
    })
  }

  return out
}

/** Read `user=<…>\nhome=<…>` from the connect probe output. */
export function parseConnectProbe(raw: string): { user: string; home: string } | null {
  const user = stripWslOutputNuls(raw).match(/^user=(.*)$/m)?.[1]
  const home = stripWslOutputNuls(raw).match(/^home=(.*)$/m)?.[1]

  if (!user?.trim() || !home?.trim().startsWith('/')) {
    return null
  }

  return { user: user.trim(), home: home.trim() }
}

/** Directory names from `ls -1p` output (trailing `/` marks a directory). */
export function parseDirectoryListing(raw: string): string[] {
  return stripWslOutputNuls(raw)
    .split(/\r?\n/)
    .filter(line => line.endsWith('/') && line.length > 1)
    .map(line => line.slice(0, -1))
}

export function joinLinuxPath(dir: string, name: string): string {
  return `${dir.replace(/\/+$/, '')}/${name}`
}

export function parentOfLinuxPath(path: string): string {
  const trimmed = String(path || '').replace(/\/+$/, '')
  const cut = trimmed.lastIndexOf('/')

  if (cut <= 0) {
    return '/'
  }

  return trimmed.slice(0, cut)
}

/**
 * Accept only absolute Linux directory paths. Returns the normalized form
 * (no trailing slash except root) or null when the input is not a usable
 * directory path. `..` is permitted only as a normal path segment resolved
 * lexically — it is never interpolated anywhere dangerous (argv only).
 */
export function normalizeLinuxDirectoryPath(input: unknown): null | string {
  if (typeof input !== 'string') {
    return null
  }

  let value = input.trim()

  if (!value.startsWith('/') || value.includes('\0') || value.length > 4096) {
    return null
  }

  value = value.replace(/\/+$/, '') || '/'

  const resolved: string[] = []

  for (const segment of value.split('/').slice(1)) {
    if (!segment || segment === '.') {
      continue
    }

    if (segment === '..') {
      resolved.pop()
      continue
    }

    resolved.push(segment)
  }

  return `/${resolved.join('/')}`
}

/**
 * Map the stderr/exit shape of a failed wsl.exe invocation onto a typed,
 * safe-copy failure. Only constant messages leave this module; the raw
 * stderr never reaches the renderer.
 */
export function classifyWslProbeFailure(stderr: string, kind: 'discover' | 'connect' | 'list'): WslFailure {
  // stderr from wsl.exe may be UTF-16 (interop) even when stdout is UTF-8.
  const text = stripWslOutputNuls(String(stderr || '')).toLowerCase()

  if (/no distribution|wsl_e_invalid_distribution|not a valid.*distribution/.test(text)) {
    return wslFailure('WSL_UNKNOWN_DISTRIBUTION', 'The selected WSL distribution does not exist.', false)
  }

  if (/wsl_e_user_not_found|user .* (does not exist|not found)|the user .*(was|is) not/.test(text)) {
    return wslFailure('WSL_USER_NOT_FOUND', 'The selected Linux user does not exist in this distribution.', false)
  }

  if (/wsl is not installed|windows subsystem for linux|wsl_e_wsl_not_installed|is not recognized/.test(text)) {
    return wslFailure('WSL_UNAVAILABLE', 'Windows Subsystem for Linux is not available on this machine.', false)
  }

  if (/no such file or directory/.test(text)) {
    return wslFailure('WSL_DIRECTORY_NOT_FOUND', 'The directory does not exist in the distribution.', false)
  }

  if (/permission denied/.test(text)) {
    return wslFailure('WSL_DIRECTORY_NO_PERMISSION', 'This directory cannot be read with the selected user.', false)
  }

  if (/not a directory/.test(text)) {
    return wslFailure('WSL_DIRECTORY_NOT_FOUND', 'The selected path is not a directory.', false)
  }

  if (kind === 'discover') {
    return wslFailure('WSL_UNAVAILABLE', 'WSL discovery failed on this machine.', false)
  }

  if (kind === 'connect') {
    return wslFailure('WSL_CONNECT_FAILED', 'Could not connect to the distribution.', true)
  }

  return wslFailure('WSL_LIST_FAILED', 'Could not list the directory contents.', true)
}

/**
 * Where `wsl.exe` lives, as data so it is testable off-Windows:
 * - real Windows: `wsl.exe` on PATH;
 * - a WSL dev host with interop: the System32 copy across `/mnt/c`;
 * - anything else: null (the capability reports unavailable).
 */
export function resolveWslExecutable(facts: { platform: string; isWsl: boolean; exists: (path: string) => boolean }): null | string {
  if (facts.platform === 'win32') {
    return 'wsl.exe'
  }

  if (facts.isWsl) {
    const interop = '/mnt/c/Windows/System32/wsl.exe'

    return facts.exists(interop) ? interop : null
  }

  return null
}

// --- the service ------------------------------------------------------------

export interface WslExecOptions {
  timeoutMs: number
  maxBuffer: number
  signal?: AbortSignal
}

export type WslExec = (args: string[], options: WslExecOptions) => Promise<{ stdout: string; stderr: string }>

interface TempWslConnection {
  id: string
  distribution: string
  configuredUser: null | string
  actualUser: string
  home: string
  lastUsedAt: number
}

export interface WslWorkspaceHostDeps {
  execWsl?: WslExec
  now?: () => number
  /** Sliding inactivity TTL for a temporary connection. */
  connectionTtlMs?: number
}

export const WSL_DEFAULT_TIMEOUT_MS = 15000
export const WSL_LIST_TIMEOUT_MS = 10000
export const WSL_DISCOVER_TIMEOUT_MS = 10000
export const WSL_MAX_OUTPUT_BYTES = 8 * 1024 * 1024
const TEMP_CONNECTION_TTL_MS = 30 * 60 * 1000

const CONNECT_PROBE_SCRIPT = 'printf "user=%s\\nhome=%s\\n" "$(id -un)" "$HOME"'
// Locale pinned to C: ls's error text ("No such file or directory",
// "Permission denied") is the typed-classification input and must not be
// localized (Chinese Windows + Chinese distro locale would defeat it).
// The path travels as the shell's positional parameter, still argv —
// never interpolated into the script text.
const LIST_SCRIPT = 'LC_ALL=C exec ls -1p -- "$1"'
const LIST_HIDDEN_SCRIPT = 'LC_ALL=C exec ls -1Ap -- "$1"'
const LIST_SCRIPT_ARG0 = 'ls'

export function buildDiscoverArgv(): string[] {
  return ['-l', '-v']
}

export function buildConnectArgv(distribution: string, user: null | string): string[] {
  const argv = ['-d', distribution]

  if (user) {
    argv.push('-u', user)
  }

  argv.push('--exec', '/bin/sh', '-c', CONNECT_PROBE_SCRIPT)

  return argv
}

export function buildListArgv(distribution: string, user: null | string, path: string, showHidden: boolean): string[] {
  const argv = ['-d', distribution]

  if (user) {
    argv.push('-u', user)
  }

  argv.push('--exec', '/bin/sh', '-c', showHidden ? LIST_HIDDEN_SCRIPT : LIST_SCRIPT, LIST_SCRIPT_ARG0, path)

  return argv
}

/** The real wsl.exe invocation, bounded and UTF-8 normalised. */
export function createDefaultWslExec(): WslExec {
  return async (args, { timeoutMs, maxBuffer, signal }) => {
    const executable = resolveWslExecutable({
      platform: process.platform,
      isWsl: IS_WSL,
      exists: candidate => {
        try {
          return fs.existsSync(candidate)
        } catch {
          return false
        }
      }
    })

    if (!executable) {
      throw wslFailure('WSL_UNAVAILABLE', 'Windows Subsystem for Linux is not available on this machine.', false)
    }

    return await new Promise((resolve, reject) => {
      execFile(
        executable,
        args,
        {
          encoding: 'utf8',
          timeout: timeoutMs,
          maxBuffer,
          signal,
          windowsHide: true,
          env: { ...process.env, WSL_UTF8: '1' },
          stdio: ['ignore', 'pipe', 'pipe']
        },
        (error, stdout, stderr) => {
          if (error) {
            // execFile leaves error.stderr undefined when a custom stdio is
            // set; classification needs the child's stderr, so re-attach it.
            ;(error as { stderr?: string }).stderr = String(stderr || '')
            ;(error as { stdout?: string }).stdout = String(stdout || '')

            reject(error)
            return
          }

          resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') })
        }
      )
    })
  }
}

/**
 * Turn an exec error into either a typed failure (from classify) or one of
 * the transport-level outcomes (timeout, abort, output overflow). The
 * stderr carried on the error (execFile attaches it) feeds classification.
 */
function failureFromExecError(error: unknown, kind: 'discover' | 'connect' | 'list', stderrHint = ''): WslFailure {
  const err = error as { code?: string; killed?: boolean; signal?: string; message?: string; stderr?: string }

  if (err?.code === 'ABORT_ERR' || /operation was aborted|aborterror/i.test(String(err?.message || ''))) {
    return wslFailure('WSL_CANCELLED', 'The operation was cancelled.', false)
  }

  if (err?.killed || err?.code === 'ETIMEDOUT' || /timed out/i.test(String(err?.message || ''))) {
    if (kind === 'discover') {
      return wslFailure('WSL_UNAVAILABLE', 'WSL discovery timed out on this machine.', true)
    }

    return wslFailure(kind === 'connect' ? 'WSL_CONNECT_TIMEOUT' : 'WSL_LIST_FAILED', 'The operation timed out.', true)
  }

  if (err?.code === 'ENOBUFS') {
    return wslFailure('WSL_LIST_OVERFLOW', 'The directory has too many entries to list.', false)
  }

  return classifyWslProbeFailure(stderrHint || err?.stderr || '', kind)
}

function isFailure(value: unknown): value is WslFailure {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as WslFailure).code === 'string' &&
    String((value as WslFailure).code).startsWith('WSL_') &&
    typeof (value as WslFailure).retryable === 'boolean'
  )
}

export type WslOutcome<T> = { ok: true } & T | ({ ok: false } & WslFailure)

export interface WslWorkspaceHost {
  discover: () => Promise<
    WslOutcome<{ available: true; distributions: WslDistributionInfo[]; defaultDistribution: null | string } | { available: false; reason: string }>
  >
  connect: (input: {
    distribution: unknown
    user?: unknown
    operationId?: unknown
  }) => Promise<WslOutcome<{ connectionId: string; distribution: string; user: string; userIsDefault: boolean; home: string }>>
  listDirectories: (input: {
    connectionId?: unknown
    workspaceId?: unknown
    path: unknown
    showHidden?: unknown
    operationId?: unknown
  }) => Promise<WslOutcome<{ path: string; parent: string; entries: WslDirectoryEntry[] }>>
  saveWorkspace: (input: {
    connectionId: unknown
    path: unknown
    name?: unknown
    requestId: unknown
  }) => Promise<WslOutcome<{ workspace: WslWorkspaceRecord; requestIdReplay: boolean }>>
  listWorkspaces: () => WslOutcome<{ workspaces: WslWorkspaceRecord[] }>
  reconnectWorkspace: (input: { workspaceId: unknown }) => Promise<
    WslOutcome<
      | { status: 'connected'; workspace: WslWorkspaceRecord; actualUser: string; userChanged: boolean }
      | { status: 'failed'; code: WslErrorCode; message: string }
    >
  >
  releaseConnection: (input: { connectionId: unknown }) => WslOutcome<{ released: boolean }>
  cancelOperation: (input: { operationId: unknown }) => WslOutcome<{ cancelled: boolean }>
}

/**
 * Create the WSL Workspace host service. The store is injected so persistence
 * (own module) stays swappable and the service itself stays executor-only.
 */
export function createWslWorkspaceHost(
  deps: WslWorkspaceHostDeps & {
    execWsl: WslExec
    now: () => number
    connectionTtlMs: number
  },
  store: {
    load: () => { version: number; workspaces: WslWorkspaceRecord[]; savedRequests: Record<string, { workspaceId: string; at: number }> }
    persist: (file: { version: number; workspaces: WslWorkspaceRecord[]; savedRequests: Record<string, { workspaceId: string; at: number }> }) => void
  }
): WslWorkspaceHost {
  const execWsl = deps.execWsl
  const now = deps.now
  const ttl = deps.connectionTtlMs
  const tempConnections = new Map<string, TempWslConnection>()
  const operations = new Map<string, AbortController>()
  const SAVED_REQUEST_LIMIT = 64

  function trackOperation(operationId: unknown): AbortController | null {
    if (typeof operationId !== 'string' || !operationId) {
      return null
    }

    const controller = new AbortController()
    operations.set(operationId, controller)

    return controller
  }

  function untrackOperation(operationId: unknown): void {
    if (typeof operationId === 'string' && operationId) {
      operations.delete(operationId)
    }
  }

  function takeTempConnection(connectionId: unknown): WslOutcome<{ connection: TempWslConnection }> {
    if (typeof connectionId !== 'string' || !connectionId) {
      return { ok: false, ...wslFailure('WSL_CONNECTION_EXPIRED', 'The connection is no longer available.', false) }
    }

    const connection = tempConnections.get(connectionId)

    if (!connection) {
      return { ok: false, ...wslFailure('WSL_CONNECTION_EXPIRED', 'The connection is no longer available. Reconnect to continue.', false) }
    }

    if (now() - connection.lastUsedAt > ttl) {
      tempConnections.delete(connectionId)

      return { ok: false, ...wslFailure('WSL_CONNECTION_EXPIRED', 'The connection expired. Reconnect to continue.', false) }
    }

    connection.lastUsedAt = now()

    return { ok: true, connection }
  }

  function listArgvFor(connection: { distribution: string; configuredUser: null | string }, path: string, showHidden: boolean): string[] {
    return buildListArgv(connection.distribution, connection.configuredUser, path, showHidden)
  }

  async function listOnConnection(
    connection: { distribution: string; configuredUser: null | string },
    path: string,
    showHidden: boolean,
    signal?: AbortSignal
  ): Promise<WslOutcome<{ path: string; parent: string; entries: WslDirectoryEntry[] }>> {
    let stdout: string

    try {
      const result = await execWsl(listArgvFor(connection, path, showHidden), {
        timeoutMs: WSL_LIST_TIMEOUT_MS,
        maxBuffer: WSL_MAX_OUTPUT_BYTES,
        signal
      })

      stdout = result.stdout
    } catch (error) {
      if (isFailure(error)) {
        return { ok: false, ...(error as WslFailure) }
      }

      return { ok: false, ...failureFromExecError(error, 'list') }
    }

    const entries = parseDirectoryListing(stdout).map(name => ({ name, path: joinLinuxPath(path, name) }))

    return { ok: true, path, parent: parentOfLinuxPath(path), entries }
  }

  async function probeConnection(
    distribution: string,
    user: null | string,
    signal?: AbortSignal
  ): Promise<WslOutcome<{ actualUser: string; home: string }>> {
    let stdout: string
    let stderr = ''

    try {
      const result = await execWsl(buildConnectArgv(distribution, user), {
        timeoutMs: WSL_DEFAULT_TIMEOUT_MS,
        maxBuffer: WSL_MAX_OUTPUT_BYTES,
        signal
      })

      stdout = result.stdout
      stderr = result.stderr
    } catch (error) {
      if (isFailure(error)) {
        return { ok: false, ...(error as WslFailure) }
      }

      return { ok: false, ...failureFromExecError(error, 'connect', stderr) }
    }

    const probe = parseConnectProbe(stdout)

    if (!probe) {
      // wsl.exe occasionally answers a bad target with exit 0 but no probe
      // output; classify whatever stderr it produced before falling back.
      const classified = classifyWslProbeFailure(stderr, 'connect')

      if (classified.code !== 'WSL_CONNECT_FAILED') {
        return { ok: false, ...classified }
      }

      return { ok: false, ...wslFailure('WSL_CONNECT_FAILED', 'The distribution did not answer the connection probe.', true) }
    }

    return { ok: true, actualUser: probe.user, home: probe.home }
  }

  return {
    async discover() {
      const executable = resolveWslExecutable({
        platform: process.platform,
        isWsl: IS_WSL,
        exists: candidate => {
          try {
            return fs.existsSync(candidate)
          } catch {
            return false
          }
        }
      })

      if (!executable) {
        return { ok: true, available: false, reason: 'WSL is not available on this machine.' }
      }

      let stdout: string
      let stderr = ''

      try {
        const result = await execWsl(buildDiscoverArgv(), {
          timeoutMs: WSL_DISCOVER_TIMEOUT_MS,
          maxBuffer: WSL_MAX_OUTPUT_BYTES
        })

        stdout = result.stdout
        stderr = result.stderr
      } catch (error) {
        if (isFailure(error)) {
          return { ok: false, ...(error as WslFailure) }
        }

        const errText = String((error as { stderr?: string; message?: string })?.stderr || (error as { message?: string })?.message || stderr || '')
        const failure = failureFromExecError(error, 'discover')

        // A distro-less machine answers `wsl -l -v` with a stderr banner and a
        // non-zero exit — that is "unavailable", not a failed discovery.
        if (failure.code === 'WSL_UNAVAILABLE') {
          return { ok: true, available: false, reason: failure.message }
        }

        return { ok: false, ...classifyWslProbeFailure(errText, 'discover') }
      }

      const distributions = parseWslListVerbose(stdout)
      const defaultDistribution = distributions.find(d => d.isDefault)?.name ?? null

      return { ok: true, available: true, distributions, defaultDistribution }
    },

    async connect({ distribution, user, operationId }) {
      if (typeof distribution !== 'string' || !distribution.trim()) {
        return { ok: false, ...wslFailure('WSL_UNKNOWN_DISTRIBUTION', 'A WSL distribution must be selected.', false) }
      }

      const distro = distribution.trim()
      const configuredUser = typeof user === 'string' && user.trim() ? user.trim() : null
      const controller = trackOperation(operationId)

      try {
        const probe = await probeConnection(distro, configuredUser, controller?.signal)

        if (!probe.ok) {
          return probe
        }

        const connection: TempWslConnection = {
          id: `wsl_conn_${randomBytes(8).toString('hex')}`,
          distribution: distro,
          configuredUser,
          actualUser: probe.actualUser,
          home: probe.home,
          lastUsedAt: now()
        }

        tempConnections.set(connection.id, connection)

        return {
          ok: true,
          connectionId: connection.id,
          distribution: distro,
          user: probe.actualUser,
          userIsDefault: configuredUser === null,
          home: probe.home
        }
      } finally {
        untrackOperation(operationId)
      }
    },

    async listDirectories({ connectionId, workspaceId, path, showHidden, operationId }) {
      const normalized = normalizeLinuxDirectoryPath(path)

      if (!normalized) {
        return { ok: false, ...wslFailure('WSL_INVALID_PATH', 'Enter an absolute Linux directory path.', false) }
      }

      const controller = trackOperation(operationId)

      try {
        if (typeof workspaceId === 'string' && workspaceId) {
          const file = store.load()
          const record = file.workspaces.find(w => w.id === workspaceId)

          if (!record) {
            return { ok: false, ...wslFailure('WSL_NOT_FOUND', 'This workspace no longer exists.', false) }
          }

          return await listOnConnection({ distribution: record.distribution, configuredUser: record.configuredUser }, normalized, showHidden === true, controller?.signal)
        }

        const taken = takeTempConnection(connectionId)

        if (!taken.ok) {
          return taken
        }

        return await listOnConnection(taken.connection, normalized, showHidden === true, controller?.signal)
      } finally {
        untrackOperation(operationId)
      }
    },

    async saveWorkspace({ connectionId, path, name, requestId }) {
      const normalized = normalizeLinuxDirectoryPath(path)

      if (!normalized) {
        return { ok: false, ...wslFailure('WSL_INVALID_PATH', 'Select a directory before saving.', false) }
      }

      if (typeof requestId !== 'string' || !requestId) {
        return { ok: false, ...wslFailure('WSL_SAVE_FAILED', 'A save request id is required.', false) }
      }

      const taken = takeTempConnection(connectionId)

      if (!taken.ok) {
        return taken
      }

      const connection = taken.connection
      const file = store.load()

      // Idempotent by request id: a retried save of the same operation returns
      // the record the first attempt produced, never a second row.
      const replay = file.savedRequests[requestId]

      if (replay) {
        const existing = file.workspaces.find(w => w.id === replay.workspaceId)

        if (existing) {
          return { ok: true, workspace: existing, requestIdReplay: true }
        }
      }

      // The host re-verifies the directory before persisting; the renderer's
      // view of the tree may already be stale.
      const verified = await listOnConnection(connection, normalized, false)

      if (!verified.ok) {
        return verified
      }

      const timestamp = now()

      // Re-adding the exact same location must not duplicate rows: the
      // existing record is reused (its name may be refreshed) instead.
      const duplicate = file.workspaces.find(
        w =>
          w.kind === 'wsl' &&
          w.distribution === connection.distribution &&
          (w.configuredUser ?? null) === connection.configuredUser &&
          w.rootPath === normalized
      )

      let record: WslWorkspaceRecord

      if (duplicate) {
        record = {
          ...duplicate,
          name: typeof name === 'string' && name.trim() ? name.trim() : duplicate.name,
          actualUser: connection.actualUser,
          updatedAt: timestamp
        }

        file.workspaces = file.workspaces.map(w => (w.id === duplicate.id ? record : w))
      } else {
        record = {
          id: `wsl_ws_${randomBytes(8).toString('hex')}`,
          name: typeof name === 'string' && name.trim() ? name.trim() : normalized.split('/').filter(Boolean).pop() || normalized,
          kind: 'wsl',
          distribution: connection.distribution,
          configuredUser: connection.configuredUser,
          actualUser: connection.actualUser,
          rootPath: normalized,
          createdAt: timestamp,
          updatedAt: timestamp
        }

        file.workspaces.push(record)
      }

      const savedRequestEntries = Object.entries(file.savedRequests)

      file.savedRequests = Object.fromEntries(
        [...savedRequestEntries.slice(Math.max(0, savedRequestEntries.length - (SAVED_REQUEST_LIMIT - 1))), [requestId, { workspaceId: record.id, at: timestamp }]]
      )

      try {
        store.persist(file)
      } catch (error) {
        return { ok: false, ...wslFailure('WSL_SAVE_FAILED', `Could not save the workspace: ${String((error as Error)?.message || error)}`, true) }
      }

      return { ok: true, workspace: record, requestIdReplay: false }
    },

    listWorkspaces() {
      return { ok: true, workspaces: store.load().workspaces }
    },

    async reconnectWorkspace({ workspaceId }) {
      if (typeof workspaceId !== 'string' || !workspaceId) {
        return { ok: false, ...wslFailure('WSL_NOT_FOUND', 'A workspace id is required.', false) }
      }

      const file = store.load()
      const record = file.workspaces.find(w => w.id === workspaceId)

      if (!record) {
        return { ok: false, ...wslFailure('WSL_NOT_FOUND', 'This workspace no longer exists.', false) }
      }

      const probe = await probeConnection(record.distribution, record.configuredUser)

      if (!probe.ok) {
        return {
          ok: true,
          status: 'failed',
          code: probe.code,
          message: probe.message
        }
      }

      const verified = await listOnConnection({ distribution: record.distribution, configuredUser: record.configuredUser }, record.rootPath, false)

      if (!verified.ok) {
        return { ok: true, status: 'failed', code: verified.code, message: verified.message }
      }

      // A default-user workspace whose observed identity changed must be
      // reported, never silently re-bound to the new identity.
      const userChanged = record.configuredUser === null && probe.actualUser !== record.actualUser

      return { ok: true, status: 'connected', workspace: record, actualUser: probe.actualUser, userChanged }
    },

    releaseConnection({ connectionId }) {
      if (typeof connectionId === 'string' && tempConnections.delete(connectionId)) {
        return { ok: true, released: true }
      }

      return { ok: true, released: false }
    },

    cancelOperation({ operationId }) {
      if (typeof operationId === 'string' && operations.has(operationId)) {
        operations.get(operationId)!.abort()
        operations.delete(operationId)

        return { ok: true, cancelled: true }
      }

      return { ok: true, cancelled: false }
    }
  }
}

// The zero-dep instantiation path used by the composition root. Exposed as a
// factory so main.ts stays free of the wiring details.
export function createDefaultWslWorkspaceHost(
  store: Parameters<typeof createWslWorkspaceHost>[1]
): WslWorkspaceHost {
  return createWslWorkspaceHost(
    {
      execWsl: createDefaultWslExec(),
      now: () => Date.now(),
      connectionTtlMs: TEMP_CONNECTION_TTL_MS
    },
    store
  )
}
