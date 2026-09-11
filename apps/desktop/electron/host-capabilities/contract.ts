/**
 * host-capabilities/contract.ts
 *
 * The typed boundary of the machine-local executors.
 *
 * ## These modules are executors, not authorities
 *
 * Every module under `host-capabilities/` answers one question: "how do I do
 * this to *this machine*". None of them decides **Harness**, **Profile**,
 * **Session** or **Execution**. Where a current module does decide one of those,
 * it is classified `LEGACY_HERMES` and does not live here — which is why the
 * connection registry and the profile pool are in `legacy-hermes/`, while
 * `git-worktree-ops.ts` is a capability.
 *
 * ## Authority that is scheduled to move
 *
 * The `git` capability is the **current production call chain** for worktree and
 * review operations, and this refactor does not move that authority. It is
 * registered as future `WORKCORE_BACKEND` territory: when a Work Core exists, the
 * authority over a remote **Connection**, a **Workspace** and an **Execution**
 * belongs to it, and the Desktop keeps only the local executors it can perform
 * itself (`docs/architecture/electron-host-boundary.md` §6.3). Until then,
 * nothing in this tree may claim that authority — including the facades below,
 * which are a description of what exists, not a grant of new power.
 *
 * ## Dependency rule
 *
 * Nothing here imports `legacy-hermes/`. A capability that has to ask how to
 * resolve Hermes has absorbed a product decision. `legacy-hermes/` may import
 * these modules; the reverse is the violation.
 *
 * ## What the types are for
 *
 * Each interface is written with `typeof` against the real exported function, so
 * it cannot drift from the implementation: if a signature changes, this file
 * stops compiling. `contract.test.ts` builds a `HostCapabilities` from the real
 * modules, proving the executor surface is what this file claims and that it is
 * narrow enough to hand to a Work Core host-bridge without also handing over the
 * Electron object graph.
 *
 * Verbs whose only real surface is an IPC registrar (`registerFsIpc`,
 * `registerGitIpc`, `registerTerminalIpc`, `registerMcpOauthCallbackIpc`) are
 * **not** listed: registering channels is Desktop composition (E5's `ipc/`), not
 * a machine capability. Listing them here would describe a door as a capability.
 */

import type { resolveReadinessProbeAuth } from './credentials/native-auth-decisions'
import type { parseLoopbackCallback, parseTokenResponse, tokenNeedsRefresh } from './credentials/native-oauth'
import type { classifyStoredSecret, readSecretStoragePolicy } from './credentials/secret-storage-policy'
import type { installDesktopPluginFromGit } from './filesystem/desktop-plugin-install'
import type { readDirForIpc } from './filesystem/fs-read-dir'
import type { rejectUnsafePathSyntax, resolveDirectoryForIpc } from './filesystem/hardening'
import type { normalizeRepoScanPath, repoScanPathIsWithin, scanGitRepos } from './git/git-repo-scan'
import type { findGitRoot } from './git/git-root'
import type { addWorktree, listWorktrees, parseWorktrees, removeWorktree, sanitizeBranch } from './git/git-worktree-ops'
import type { findGitBash } from './platform/find-git-bash'
import type { readHyprlandWindows } from './platform/hyprland'
import type { readWindowBelow } from './platform/window-below'
import type { hiddenWindowsChildOptions } from './platform/windows-child-options'
import type { resolveDefaultWslDistro, resolveLocalReadPath, wslPosixToWindowsAccessible } from './platform/wsl-path-bridge'
import type { isPublicHttpUrl } from './preview/favicon'
import type { isStreamableMediaPath } from './preview/media-protocol'
import type { normalizeCaptureRect } from './preview/preview-capture'
import type { createTerminalOutputGate } from './terminal/terminal-output-gate'

/** Reading and writing the local filesystem, with the path policy applied. */
export interface FilesystemCapability {
  installPluginFromGit: typeof installDesktopPluginFromGit
  readDir: typeof readDirForIpc
  rejectUnsafePathSyntax: typeof rejectUnsafePathSyntax
  resolveDirectory: typeof resolveDirectoryForIpc
}

/**
 * Local git. The current production call chain for worktree/review work; the
 * authority over a *remote* Workspace is scheduled to move to the Work Core.
 */
export interface GitCapability {
  addWorktree: typeof addWorktree
  findGitRoot: typeof findGitRoot
  listWorktrees: typeof listWorktrees
  normalizeRepoScanPath: typeof normalizeRepoScanPath
  parseWorktrees: typeof parseWorktrees
  removeWorktree: typeof removeWorktree
  repoScanPathIsWithin: typeof repoScanPathIsWithin
  sanitizeBranch: typeof sanitizeBranch
  scanGitRepos: typeof scanGitRepos
}

/**
 * PTY execution. `createOutputGate` is the pure half — the exit/payload contract
 * a terminal session's output obeys. The session lifecycle itself is registered
 * as IPC and lives in `terminal/terminal-ipc.ts`.
 */
export interface TerminalCapability {
  createOutputGate: typeof createTerminalOutputGate
}

/** Local possession and handling of tokens. Never a decision about auth policy. */
export interface CredentialsCapability {
  classifyStoredSecret: typeof classifyStoredSecret
  parseLoopbackCallback: typeof parseLoopbackCallback
  parseTokenResponse: typeof parseTokenResponse
  readSecretStoragePolicy: typeof readSecretStoragePolicy
  resolveReadinessProbeAuth: typeof resolveReadinessProbeAuth
  tokenNeedsRefresh: typeof tokenNeedsRefresh
}

/** Producing and re-serving local preview material. */
export interface PreviewCapability {
  isPublicHttpUrl: typeof isPublicHttpUrl
  isStreamableMediaPath: typeof isStreamableMediaPath
  normalizeCaptureRect: typeof normalizeCaptureRect
}

/**
 * Host-platform primitives: the OS facts the Desktop has to know, expressed as
 * pure functions wherever possible (`hiddenWindowsChildOptions`,
 * `resolveDefaultWslDistro`) and as narrow readers where an OS query is
 * unavoidable (`readHyprlandWindows`, `readWindowBelow`).
 */
export interface PlatformCapability {
  findGitBash: typeof findGitBash
  hiddenWindowsChildOptions: typeof hiddenWindowsChildOptions
  readHyprlandWindows: typeof readHyprlandWindows
  readWindowBelow: typeof readWindowBelow
  resolveDefaultWslDistro: typeof resolveDefaultWslDistro
  resolveLocalReadPath: typeof resolveLocalReadPath
  wslPosixToWindowsAccessible: typeof wslPosixToWindowsAccessible
}

export interface HostCapabilities {
  credentials: CredentialsCapability
  filesystem: FilesystemCapability
  git: GitCapability
  platform: PlatformCapability
  preview: PreviewCapability
  terminal: TerminalCapability
}

export const HOST_CAPABILITY_AREAS = [
  'credentials',
  'filesystem',
  'git',
  'platform',
  'preview',
  'terminal'
] as const

export type HostCapabilityArea = (typeof HOST_CAPABILITY_AREAS)[number]
