/**
 * host-capabilities/filesystem/project-dir.ts
 *
 * The working directory new work starts in: sanitize whatever a caller proposed,
 * and persist the user's chosen default.
 *
 * Extracted from `main.ts` (E5b). `resolveDefaultCwd` is injected rather than
 * imported because the default comes from the Hermes install layout
 * (`resolveHermesCwd`) — a capability must not import the Hermes adapter, so the
 * caller supplies the fallback and this module owns the policy around it.
 *
 * The policy: a proposal is used only when it is a real directory and is not the
 * packaged install tree (writing a session into the app bundle is never what the
 * user meant); otherwise the caller's default wins, and `sanitized` records that
 * the proposal was overridden so the UI can say so.
 */

import fs from 'node:fs'
import path from 'node:path'

import { directoryExists } from './fs-probe'

export interface WorkspaceCwdDecision {
  cwd: string
  sanitized: boolean
}

export interface ProjectDirDeps {
  /** Path of the project-dir config file to write. */
  configPath: () => string
  log: (line: string) => void
  /** True when the path is inside the packaged app/install tree. */
  isPackagedInstallPath: (dir: string) => boolean
  resolveDefaultCwd: () => string
}

export function sanitizeWorkspaceCwd(cwd: unknown, deps: ProjectDirDeps): WorkspaceCwdDecision {
  const trimmed = typeof cwd === 'string' ? cwd.trim() : ''

  if (!trimmed || deps.isPackagedInstallPath(trimmed)) {
    return { cwd: deps.resolveDefaultCwd(), sanitized: Boolean(trimmed) }
  }

  try {
    const resolved = path.resolve(trimmed)

    if (directoryExists(resolved)) {
      return { cwd: resolved, sanitized: false }
    }
  } catch {
    // Fall through to the resolved default.
  }

  return { cwd: deps.resolveDefaultCwd(), sanitized: Boolean(trimmed) }
}

/**
 * Persist the default project directory. A falsy `dir` writes `{}`, which is how
 * the backend reads "no preference" — so clearing the setting is not a delete.
 */
export function writeDefaultProjectDir(dir: string | null | undefined, deps: ProjectDirDeps): void {
  const target = deps.configPath()
  const payload = dir ? JSON.stringify({ dir: path.resolve(dir) }, null, 2) : JSON.stringify({}, null, 2)

  try {
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, payload, 'utf8')
  } catch (error: any) {
    deps.log(`[settings] write default project dir failed: ${error?.message || error}`)
  }
}
