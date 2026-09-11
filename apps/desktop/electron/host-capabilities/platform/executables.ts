/**
 * host-capabilities/platform/executables.ts
 *
 * Find an executable by name on this host's PATH. A platform capability, not a
 * Hermes one: the resolver is its first caller, not its owner.
 *
 * Two host-specific details are load-bearing and are why this is not a one-line
 * `which`:
 *
 *  - **PATHEXT order on Windows.** A real command must resolve through its
 *    `.exe`/`.cmd`; an extensionless file (a Git-Bash shim named `hermes`) must
 *    not shadow `hermes.cmd`.
 *  - **WSL must not hand back a Windows binary.** A Linux-side caller that gets
 *    `C:\...\hermes.exe` would try to execute it as a Linux program.
 *
 * An absolute or path-containing argument is resolved directly (still subject to
 * the WSL check) so a caller can validate a path it already has.
 */

import path from 'node:path'

import { fileExists } from '../filesystem/fs-probe'

import { isWindowsBinaryPathInWsl } from './bootstrap-platform'
import { buildPathExtCandidates } from './pathext'
import { IS_WINDOWS, IS_WSL } from './platform-facts'

export function findOnPath(command: string): null | string {
  if (!command) {
    return null
  }

  if (path.isAbsolute(command) || command.includes(path.sep) || (IS_WINDOWS && command.includes('/'))) {
    if (!fileExists(command)) {
      return null
    }

    if (isWindowsBinaryPathInWsl(command, { isWsl: IS_WSL })) {
      return null
    }

    return command
  }

  const pathEntries = String(process.env.PATH || '')
    .split(path.delimiter)
    .filter(Boolean)

  // Extensions BEFORE the bare name (see buildPathExtCandidates).
  const extensions = buildPathExtCandidates(process.env.PATHEXT, IS_WINDOWS)

  for (const entry of pathEntries) {
    for (const extension of extensions) {
      const candidate = path.join(entry, `${command}${extension}`)

      if (fileExists(candidate)) {
        return candidate
      }
    }
  }

  return null
}
