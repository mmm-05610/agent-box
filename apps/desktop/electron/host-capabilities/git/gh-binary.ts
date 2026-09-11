/**
 * host-capabilities/git/gh-binary.ts
 *
 * Locate the GitHub CLI. A git capability: `gh` is how the review surface talks
 * to a forge, and nothing here is Hermes-specific.
 *
 * Extracted from `main.ts` (E5b). Resolution is the app's usual ladder — the
 * platform's conventional install locations first, then PATH, then the bare name
 * so the eventual error names the command instead of a null. The answer is cached
 * because `resolveGitIpc` asks on every review action.
 */

import path from 'node:path'

import { app } from 'electron'

import { fileExists } from '../filesystem/fs-probe'
import { findOnPath } from '../platform/executables'
import { IS_WINDOWS } from '../platform/platform-facts'

let cache: null | string = null

export function resolveGhBinary(): string {
  if (cache) {
    return cache
  }

  const candidates: string[] = []

  if (IS_WINDOWS) {
    candidates.push(path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'GitHub CLI', 'gh.exe'))

    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'gh.exe'))
    }
  } else {
    const home = app.getPath('home')

    candidates.push('/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh', path.join(home, '.local', 'bin', 'gh'))
  }

  cache = candidates.find(fileExists) || findOnPath('gh') || 'gh'

  return cache
}
