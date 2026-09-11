/**
 * legacy-hermes/resolution.ts
 *
 * The Hermes executable resolution ladder's decision half: given a candidate
 * runtime, what is it, what can it do, and how must it be invoked.
 *
 * Moved out of the composition root (E5a). It used to sit in
 * `composition/bootstrap-env-composition.ts` purely because it read that module's
 * constant bag (`HERMES_HOME`, `IS_WINDOWS`); the knowledge itself is Hermes
 * resolution policy, and it belongs next to `backend-probes.ts`.
 *
 * Behaviour is preserved exactly — the argv rewrite, the `.cmd` shell handling,
 * the probe budget, the caching and the Windows comparison rules are the same
 * lines, only relocated. Where a value used to come from the composition root it
 * now comes from its own leaf: `./home`, `./backend-probes`, `./backend-command`,
 * `../host-capabilities/platform/*`.
 */

import fs from 'node:fs'
import path from 'node:path'

import { rememberLog } from '../app/log-buffer'
import { directoryExists, fileExists } from '../host-capabilities/filesystem/fs-probe'
import { IS_WINDOWS } from '../host-capabilities/platform/platform-facts'

import { dashboardFallbackArgs, sourceDeclaresServe } from './backend-command'
import { execProbeSync, PROBE_TIMEOUT_MS } from './backend-probes'
import { HERMES_HOME } from './home'

/** Cache key: `command::root`. A runtime's subcommand set does not change under it. */
export const _serveSupportCache = new Map<string, boolean>()

/**
 * Whether the resolved runtime understands `serve`.
 *
 * `serve` is newer than the app. An un-upgraded runtime (an older managed install
 * the app hasn't updated yet, or an older `hermes` on PATH) only knows
 * `dashboard --no-open`, and without this rewrite a new app against it dies on an
 * unknown subcommand and bricks every mid-upgrade user.
 *
 * Two rungs, cheapest first: read the runtime's own
 * `hermes_cli/subcommands/dashboard.py` and look for the `serve` parser; failing
 * that, run `serve --help`. The answer is cached for the process lifetime, so a
 * FALSE NEGATIVE here silently routes a modern runtime through the legacy form
 * for the whole session — which is why the probe shares the runtime probes'
 * budget and their timeout-only retry rather than using a thinner local bound
 * (cold Windows Python startup measured ~10.5s: #61764/#72632/#72707).
 */
export function backendSupportsServe(backend: any): boolean {
  if (!backend || !backend.command) {
    return true
  }

  const key = `${backend.command}::${backend.root || ''}`

  if (_serveSupportCache.has(key)) {
    return _serveSupportCache.get(key) as boolean
  }

  let supported: boolean | null = null

  if (backend.root) {
    try {
      const src = fs.readFileSync(path.join(backend.root, 'hermes_cli', 'subcommands', 'dashboard.py'), 'utf8')
      supported = sourceDeclaresServe(src)
    } catch {
      supported = null // source unreadable — fall through to the probe
    }
  }

  if (supported === null) {
    try {
      const prefix = backend.args && backend.args[0] === '-m' ? backend.args.slice(0, 2) : []

      execProbeSync(backend.command, [...prefix, 'serve', '--help'], {
        cwd: backend.root || undefined,
        env: { ...process.env, HERMES_HOME, ...(backend.env || {}) },
        timeout: PROBE_TIMEOUT_MS,
        stdio: 'ignore',
        // `.cmd`/`.bat` shim backends carry shell: true in their descriptor
        // (see resolveHermesBackend step 4); execFileSync of a .cmd without
        // shell throws EINVAL on modern Node, which the catch below would
        // mis-cache as "serve unsupported" for the process lifetime.
        shell: Boolean(backend.shell),
        windowsHide: true
      })
      supported = true
    } catch {
      supported = false
    }
  }

  _serveSupportCache.set(key, supported)
  rememberLog(
    `[backend] \`serve\` ${supported ? 'supported' : 'unsupported → routing via legacy `dashboard`'} for ${backend.label || key}`
  )

  return supported
}

/**
 * Route argv for the runtime that was actually resolved. Kept as a one-liner so
 * the legacy fallback has exactly one call site per backend.
 */
export function getBackendArgsForRuntime(backend: any): string[] {
  return backendSupportsServe(backend) ? backend.args : dashboardFallbackArgs(backend.args)
}

/**
 * Compare two executable paths the way this host considers them equal: case-folded
 * on Windows (where `C:\X` and `c:\x` are the same file), otherwise verbatim.
 */
export function normalizeExecutablePathForCompare(commandPath: string): null | string {
  if (!commandPath) {
    return null
  }

  let resolved = path.resolve(String(commandPath))

  try {
    resolved = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved)
  } catch {
    // Fallback to path.resolve() above.
  }

  return IS_WINDOWS ? resolved.toLowerCase() : resolved
}

/**
 * Whether a path is the running Electron app itself rather than a Hermes runtime.
 *
 * Resolving the desktop binary as its own backend would spawn the app recursively.
 * Two tests: it IS `process.execPath`, or it sits beside an `app.asar` (a packaged
 * Electron layout). Windows-only, because that is where the resolver used to pick
 * the app's own `hermes`-adjacent binary out of PATH.
 */
export function looksLikeDesktopAppBinary(commandPath: string): boolean {
  if (!IS_WINDOWS || !commandPath) {
    return false
  }

  const normalizedCandidate = normalizeExecutablePathForCompare(commandPath)
  const normalizedCurrentExec = normalizeExecutablePathForCompare(process.execPath)

  if (normalizedCandidate && normalizedCurrentExec && normalizedCandidate === normalizedCurrentExec) {
    return true
  }

  let resolved = path.resolve(String(commandPath))

  try {
    resolved = fs.realpathSync.native ? fs.realpathSync.native(resolved) : fs.realpathSync(resolved)
  } catch {
    // Keep resolved path fallback.
  }

  const resourcesDir = path.join(path.dirname(resolved), 'resources')

  return fileExists(path.join(resourcesDir, 'app.asar')) || directoryExists(path.join(resourcesDir, 'app.asar.unpacked'))
}

/**
 * Is this directory a Hermes source checkout rather than an installed runtime?
 *
 * The distinguishing file is `hermes_cli/main.py`: an installed wheel has the
 * package but not the checkout's entry module at the root.
 */
export function isHermesSourceRoot(root: string): boolean {
  return directoryExists(root) && fileExists(path.join(root, 'hermes_cli', 'main.py'))
}
