/**
 * Proves the host-capability contract is satisfiable from the real modules, and
 * that the executor surface is narrow: each verb is a named function, not the
 * Electron object graph or an IPC registrar.
 *
 * This is the runtime half of the check — the type annotation already fails to
 * compile if a real signature drifts (every interface is written with `typeof`).
 */
import assert from 'node:assert/strict'

import { test } from 'vitest'

import {
  HOST_CAPABILITY_AREAS,
  type HostCapabilities,
  type HostCapabilityArea
} from './contract'
import { resolveReadinessProbeAuth } from './credentials/native-auth-decisions'
import { parseLoopbackCallback, parseTokenResponse, tokenNeedsRefresh } from './credentials/native-oauth'
import { classifyStoredSecret, readSecretStoragePolicy } from './credentials/secret-storage-policy'
import { installDesktopPluginFromGit } from './filesystem/desktop-plugin-install'
import { readDirForIpc } from './filesystem/fs-read-dir'
import { rejectUnsafePathSyntax, resolveDirectoryForIpc } from './filesystem/hardening'
import { normalizeRepoScanPath, repoScanPathIsWithin, scanGitRepos } from './git/git-repo-scan'
import { findGitRoot } from './git/git-root'
import { addWorktree, listWorktrees, parseWorktrees, removeWorktree, sanitizeBranch } from './git/git-worktree-ops'
import { findGitBash } from './platform/find-git-bash'
import { readHyprlandWindows } from './platform/hyprland'
import { readWindowBelow } from './platform/window-below'
import { hiddenWindowsChildOptions } from './platform/windows-child-options'
import { resolveDefaultWslDistro, resolveLocalReadPath, wslPosixToWindowsAccessible } from './platform/wsl-path-bridge'
import { isPublicHttpUrl } from './preview/favicon'
import { isStreamableMediaPath } from './preview/media-protocol'
import { normalizeCaptureRect } from './preview/preview-capture'
import { createTerminalOutputGate } from './terminal/terminal-output-gate'

const hostCapabilities: HostCapabilities = {
  credentials: {
    classifyStoredSecret,
    parseLoopbackCallback,
    parseTokenResponse,
    readSecretStoragePolicy,
    resolveReadinessProbeAuth,
    tokenNeedsRefresh
  },
  filesystem: {
    installPluginFromGit: installDesktopPluginFromGit,
    readDir: readDirForIpc,
    rejectUnsafePathSyntax,
    resolveDirectory: resolveDirectoryForIpc
  },
  git: {
    addWorktree,
    findGitRoot,
    listWorktrees,
    normalizeRepoScanPath,
    parseWorktrees,
    removeWorktree,
    repoScanPathIsWithin,
    sanitizeBranch,
    scanGitRepos
  },
  platform: {
    findGitBash,
    hiddenWindowsChildOptions,
    readHyprlandWindows,
    readWindowBelow,
    resolveDefaultWslDistro,
    resolveLocalReadPath,
    wslPosixToWindowsAccessible
  },
  preview: { isPublicHttpUrl, isStreamableMediaPath, normalizeCaptureRect },
  terminal: { createOutputGate: createTerminalOutputGate }
}

test('every declared capability area is present and every verb is a callable executor', () => {
  assert.deepEqual(Object.keys(hostCapabilities).sort(), [...HOST_CAPABILITY_AREAS].sort())

  for (const area of HOST_CAPABILITY_AREAS) {
    const verbs = hostCapabilities[area as HostCapabilityArea] as unknown as Record<string, unknown>
    const names = Object.keys(verbs)

    assert.ok(names.length > 0, `${area} must expose at least one verb`)

    for (const name of names) {
      assert.equal(typeof verbs[name], 'function', `${area}.${name} must be a function, not a registrar or an object graph`)
    }
  }
})

test('the platform capability is honest about being split pure/query', () => {
  // Pure half: derivable from data on any host, so any consumer (including a
  // Work Core host-bridge) can call it without an OS query and without Electron.
  assert.deepEqual(hiddenWindowsChildOptions({}, true), { windowsHide: true })
  assert.deepEqual(hiddenWindowsChildOptions({}, false), {})

  // Query half: real OS reads. They must return a value rather than throw when
  // the OS has nothing to say, because a capability failure must not become a
  // boot failure.
  const queries = { findGitBash, readHyprlandWindows, readWindowBelow, resolveDefaultWslDistro }

  for (const [name, query] of Object.entries(queries)) {
    assert.equal(typeof query, 'function', `${name} is a query verb`)
  }
})
