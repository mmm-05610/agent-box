/**
 * legacy-hermes/home.ts
 *
 * Where the Hermes runtime keeps its state on this machine: `HERMES_HOME` and
 * the paths derived from it.
 *
 * This is Hermes-proprietary knowledge — the directory layout, the Windows
 * registry fallback, the LOCALAPPDATA-vs-`~/.hermes` migration — and it used to
 * be part of the composition root's constant bag, which meant the resolver, the
 * venv helpers and the env builder all had to import the composition root to ask
 * a question about Hermes.
 *
 * The values are computed ONCE at import time, so every module that pins
 * `HERMES_HOME` into a child's environment agrees with every module that reads a
 * file beneath it.
 */

import path from 'node:path'

import { app } from 'electron'

import { USER_DATA_OVERRIDE } from '../app/user-data'
import { directoryExists } from '../host-capabilities/filesystem/fs-probe'
import { IS_WINDOWS } from '../host-capabilities/platform/platform-facts'
import { readWindowsUserEnvVar } from '../host-capabilities/platform/windows-user-env'

import { normalizeHermesHomeRoot } from './backend-env'

/**
 * Resolve the Hermes state directory for this machine.
 *
 * Precedence is deliberate and each rung exists for a failure that shipped:
 *
 *  1. `HERMES_HOME` in the environment — the explicit operator choice.
 *  2. The Desktop's own userData override, so a sandbox keeps its whole world in
 *     one directory.
 *  3. The live User-scoped registry value on Windows: a GUI app launched from
 *     Explorer inherits the environment block captured at login, so a
 *     `HERMES_HOME` set via `setx` AFTER login is invisible in `process.env` even
 *     though a fresh CLI shell sees it. Without this the backend silently falls
 *     back to `%LOCALAPPDATA%\hermes` and reports "No inference provider
 *     configured" despite a valid configured home (#45471).
 *  4. `%LOCALAPPDATA%\hermes` on Windows — but an existing `~/.hermes` wins, so a
 *     legacy setup does not lose its state to the migration.
 *  5. `~/.hermes` everywhere else.
 */
export function resolveHermesHome(): string {
  if (process.env.HERMES_HOME) {
    return normalizeHermesHomeRoot(process.env.HERMES_HOME)
  }

  if (USER_DATA_OVERRIDE) {
    return path.join(path.resolve(USER_DATA_OVERRIDE), 'hermes-home')
  }

  if (IS_WINDOWS) {
    const fromRegistry = readWindowsUserEnvVar('HERMES_HOME')

    if (fromRegistry) {
      return normalizeHermesHomeRoot(fromRegistry)
    }
  }

  if (IS_WINDOWS && process.env.LOCALAPPDATA) {
    const localappdata = path.join(process.env.LOCALAPPDATA, 'hermes')
    const legacy = path.join(app.getPath('home'), '.hermes')

    // Migrate transparently to LOCALAPPDATA, but honour an existing legacy
    // ~/.hermes setup (no LOCALAPPDATA install yet) so users don't lose state.
    if (!directoryExists(localappdata) && directoryExists(legacy)) {
      return legacy
    }

    return localappdata
  }

  return path.join(app.getPath('home'), '.hermes')
}

export const HERMES_HOME = resolveHermesHome()

/** A completed Desktop-managed install lives here. */
export const ACTIVE_HERMES_ROOT = path.join(HERMES_HOME, 'hermes-agent')

/** The Python environment the managed install owns. */
export const VENV_ROOT = path.join(ACTIVE_HERMES_ROOT, 'venv')

/** Written by the bootstrap installer when an install finished successfully. */
export const BOOTSTRAP_COMPLETE_MARKER = path.join(ACTIVE_HERMES_ROOT, '.hermes-bootstrap-complete')
