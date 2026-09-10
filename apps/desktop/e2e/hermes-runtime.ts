import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

/**
 * Locate an EXTERNAL Hermes runtime for the E2E suite.
 *
 * This repository ships no Hermes runtime, and the specs that build real session
 * history drive the real gateway (`tui_gateway`) and the real agent loop — so
 * they need a runtime from outside the checkout, exactly like the app itself,
 * which spawns `hermes serve`.
 *
 * Candidates, in order:
 *   1. `HERMES_E2E_PYTHON`           — an interpreter that can import tui_gateway
 *   2. the Desktop-managed install   — `$HERMES_HOME/hermes-agent/venv/bin/python`
 *   3. `python3` on `PATH`
 *
 * A candidate is trusted only after a probe: `import tui_gateway.entry` must
 * succeed. That is the same probe-before-trust rule the app applies to its own
 * backend, and it is why a machine with a stale or unrelated `python3` fails
 * loudly instead of producing a half-built sandbox.
 */

export interface HermesE2ERuntime {
  /** Human-readable provenance, for failure messages. */
  label: string
  /** Interpreter that can run `-m tui_gateway.entry`. */
  python: string
}

/**
 * Typed reason the runtime-dependent specs are skipped.
 *
 * These specs were migrated off the in-repo runtime (they used to spawn
 * `uv run python -m tui_gateway.entry` out of this checkout). They now need an
 * external one. Where none is installed they SKIP with this label rather than
 * silently passing, so a green run never means "the fixture was never built".
 */
export const E2E_FIXTURE_MIGRATION_PENDING =
  'E2E_FIXTURE_MIGRATION_PENDING: needs an external Hermes runtime whose python can import tui_gateway ' +
  '(set HERMES_E2E_PYTHON, or install Hermes so `python3 -m tui_gateway.entry` works)'

const PROBE_TIMEOUT_MS = 15_000

/** True when `python` can import the gateway entry the builder spawns. */
function canRunGateway(python: string): boolean {
  if (!python || !fs.existsSync(python)) {
    return false
  }

  try {
    const result = spawnSync(python, ['-c', 'import tui_gateway.entry'], {
      stdio: 'ignore',
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true
    })

    return result.status === 0
  } catch {
    return false
  }
}

function candidateInterpreters(): Array<{ label: string; python: string }> {
  const candidates: Array<{ label: string; python: string }> = []

  const explicit = process.env.HERMES_E2E_PYTHON
  if (explicit) {
    candidates.push({ label: `HERMES_E2E_PYTHON (${explicit})`, python: explicit })
  }

  // The Desktop-managed install, derived from HERMES_HOME the same way the app
  // derives it. Present only when the machine has one.
  const hermesHome = process.env.HERMES_HOME || path.join(process.env.HOME || '', '.hermes')
  const managed = path.join(hermesHome, 'hermes-agent', 'venv', 'bin', 'python')
  const managedWindows = path.join(hermesHome, 'hermes-agent', 'venv', 'Scripts', 'python.exe')
  candidates.push({ label: `managed install venv (${managed})`, python: managed })
  if (process.platform === 'win32') {
    candidates.push({ label: `managed install venv (${managedWindows})`, python: managedWindows })
  }

  for (const name of ['python3', 'python']) {
    const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', [name], { encoding: 'utf8' })
    const resolved = found.status === 0 ? found.stdout.trim().split('\n')[0].trim() : ''
    if (resolved) {
      candidates.push({ label: `${name} on PATH (${resolved})`, python: resolved })
    }
  }

  return candidates
}

/** The first candidate that passes the import probe, or null. */
export function resolveHermesE2ERuntime(): HermesE2ERuntime | null {
  for (const candidate of candidateInterpreters()) {
    if (canRunGateway(candidate.python)) {
      return candidate
    }
  }

  return null
}

export function hasHermesE2ERuntime(): boolean {
  return resolveHermesE2ERuntime() !== null
}

/**
 * The `hermes` executable for the specs that launch a real `hermes serve`
 * backend, or null when none is available. Prefers an explicit
 * `HERMES_DESKTOP_HERMES` (the same override the app documents), then `PATH`.
 */
export function resolveHermesExecutable(): { label: string; command: string } | null {
  const explicit = process.env.HERMES_DESKTOP_HERMES
  if (explicit && fs.existsSync(explicit)) {
    return { command: explicit, label: `HERMES_DESKTOP_HERMES (${explicit})` }
  }

  const found = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['hermes'], { encoding: 'utf8' })
  const resolved = found.status === 0 ? found.stdout.trim().split('\n')[0].trim() : ''

  return resolved ? { command: resolved, label: `hermes on PATH (${resolved})` } : null
}
