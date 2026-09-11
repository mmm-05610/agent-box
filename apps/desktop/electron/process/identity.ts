/**
 * process/identity.ts
 *
 * Process identity that survives PID reuse: a start marker that changes when a
 * PID is reused, so `pid + marker` names one specific process incarnation.
 *
 * Three facts this primitive owns, and nothing else:
 *
 *  - how to read a cross-platform start marker for a PID (its own marker for the
 *    current process when the caller supplies one, so a probe never has to shell
 *    out for the process it already is);
 *  - how a failed probe degrades — a LIVE child keeps a PID-only identity
 *    instead of being killed over a flaky probe, a DEAD child fails closed;
 *  - the plain text form of a degraded marker.
 *
 * It does not know what the process runs, why it was spawned, or what a caller
 * intends to do with the identity. The marker *format* for the current process
 * is supplied by the caller (`ProcessIdentityDeps.selfMarker`) precisely so a
 * format that another runtime parses lives with that runtime's adapter and not
 * here.
 */

import { execFile } from 'node:child_process'
import fs from 'node:fs'

import { hiddenWindowsChildOptions } from '../host-capabilities/platform/windows-child-options'

import { isPidAlive } from './pid'

/**
 * Run a helper process and capture its trimmed stdout. Bounded by `timeout`
 * because every caller here is a *probe*: a slow helper must degrade to a
 * failed probe, never stall a launch.
 */
export function execText(command: string, args: string[], { timeout = 3000 } = {}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(command, args, hiddenWindowsChildOptions({ encoding: 'utf8', timeout }), (error, stdout) => {
      if (error) {
        reject(error)
      } else {
        resolve(String(stdout || '').trim())
      }
    })
  })
}

/**
 * Probe budget for the ORPHAN-REAP path (matchesParent / matchesIdentity /
 * stopOwned). The claim path keeps the full 30s headroom — a freshly spawned
 * child's marker is load-bearing and a slow probe must not kill a healthy child
 * (#93608). Reap only needs to tell "same process" from "gone or reused" for OLD
 * records, and an ownership file can accumulate dozens of them (one per scope
 * per launch), so a 30s budget per record would let a cold PowerShell 5.1 stall
 * boot for minutes (#87169). 5s is plenty for a warm probe; a timeout degrades
 * to "unknown" and the record is preserved for the next launch instead of
 * blocking boot.
 */
export const REAP_PROBE_TIMEOUT_MS = 5_000

export interface ProcessIdentityDeps {
  /**
   * Marker for a PID that is THIS process, without spawning an OS helper.
   * Returns null when the PID is not this process or the marker is
   * unavailable. Only consulted on Windows, where the platform probe is a
   * PowerShell cold start.
   */
  selfMarker?: (pid: number) => null | string
}

/**
 * Cross-platform process start marker: a value that changes when a PID is
 * reused, so `pid + marker` identifies one specific process incarnation.
 * Throws when the probe fails — callers decide what a failure means (see
 * `claimDecision` / `probeStartMarker`).
 */
export async function processStartMarker(
  pid: number,
  timeoutMs: number = 30_000,
  deps: ProcessIdentityDeps = {}
): Promise<string> {
  // Cheap native dead-PID gate. Windows Get-Process / macOS `ps -p` exit 1 on a
  // missing PID (not ESRCH), so the identity matchers used to keep the orphan
  // and re-probe it every launch (#92875). ESRCH is the code those catch blocks
  // already map to "gone". Alive or uninspectable (EPERM) PIDs still fall
  // through to the platform probe.
  if (!isPidAlive(pid)) {
    throw Object.assign(new Error(`PID ${pid} no longer exists`), { code: 'ESRCH' })
  }

  if (process.platform === 'linux') {
    const stat = await fs.promises.readFile(`/proc/${pid}/stat`, 'utf8')

    const fields = stat
      .slice(stat.lastIndexOf(')') + 1)
      .trim()
      .split(/\s+/)

    if (!/^\d+$/.test(fields[19] || '')) {
      throw new Error(`Invalid /proc start marker for PID ${pid}`)
    }

    return `linux:${fields[19]}`
  }

  if (process.platform === 'win32') {
    const self = deps.selfMarker?.(pid) ?? null

    if (self) {
      return self
    }

    const ticks = await execText(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `$p = Get-Process -Id ${pid} -ErrorAction Stop; $p.StartTime.ToUniversalTime().Ticks`
      ],
      // PowerShell 5.1 cold starts routinely exceed the default 3s execText
      // budget (2.4-8s observed in #87169); give the marker probe headroom.
      // The claim path keeps this 30s budget; the orphan-reap path passes
      // REAP_PROBE_TIMEOUT_MS so a slow probe cannot stall boot.
      { timeout: timeoutMs }
    )

    if (!/^\d+$/.test(ticks)) {
      throw new Error(`Invalid Windows start marker for PID ${pid}`)
    }

    return `win:${ticks}`
  }

  const started = await execText('ps', ['-p', String(pid), '-o', 'lstart='])

  if (!started) {
    throw new Error(`Missing process start marker for PID ${pid}`)
  }

  return `ps:${started}`
}

export type StartMarkerProbe = { ok: true; startMarker: string } | { ok: false; reason: string }

/** Run the marker probe, converting a throw into a value the pure decision can consume. */
export async function probeStartMarker(
  pid: number,
  probe: (pid: number) => Promise<string> = processStartMarker
): Promise<StartMarkerProbe> {
  try {
    return { ok: true, startMarker: await probe(pid) }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) }
  }
}

const PID_ONLY_MARKER_PREFIX = 'pid-only:'

/**
 * Degraded identity marker recorded when the start-marker probe failed but the
 * child was verifiably alive. It satisfies the ownership schema (a non-empty
 * startMarker) while telling identity matchers that only PID liveness — plus the
 * command-line check layered on top — can be verified.
 */
export function pidOnlyStartMarker(pid: number): string {
  return `${PID_ONLY_MARKER_PREFIX}${pid}`
}

export function isPidOnlyStartMarker(startMarker: unknown): boolean {
  return typeof startMarker === 'string' && startMarker.startsWith(PID_ONLY_MARKER_PREFIX)
}

export type ClaimDecision =
  { action: 'claim'; startMarker: string } | { action: 'degrade'; reason: string } | { action: 'fail'; reason: string }

/**
 * Pure claim policy for a freshly spawned child:
 *
 * - probe succeeded            → claim with the full start marker (unchanged).
 * - probe failed, child ALIVE  → degrade to PID-only identity; NEVER kill a
 *                                healthy child over a flaky identity probe.
 * - probe failed, child DEAD   → fail closed; the child's death is the real
 *                                story and the caller attaches its output tail.
 */
export function claimDecision(childAlive: boolean, probe: StartMarkerProbe): ClaimDecision {
  if (probe.ok === true) {
    return { action: 'claim', startMarker: probe.startMarker }
  }

  const { reason } = probe

  return childAlive ? { action: 'degrade', reason } : { action: 'fail', reason }
}
