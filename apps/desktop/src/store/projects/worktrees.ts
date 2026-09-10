import type { NewSessionPlacement } from '@/app/chat/new-session-drag'
import type { HermesGitBaseBranch, HermesGitBranch } from '@/global'
import { hermesApi } from '@/hermes'
import {
  desktopDefaultCwd,
  isDesktopFsRemoteMode,
  selectDesktopPaths
} from '@/lib/desktop-fs'
import { desktopGit } from '@/lib/desktop-git'
import { isMissingRestEndpoint } from '@/lib/gateway-rpc'
import { translateNow } from '@/i18n'
import { isUnderPath } from '@/lib/path-compare'
import { notify } from '@/store/notifications'
import { atom } from 'nanostores'
import {
  $activeGatewayProfile,
  normalizeProfileKey,
  requestFreshSession
} from '@/store/profile'
import { $sessions, setSessions } from '@/store/session'
import { $projectScope, $projectTree, projectRootCwd } from './scope'
import { setSidebarAgentsGrouped } from '@/store/layout'
import { projectIdForCwd } from './cwd-identity'
import { refreshProjectTree } from './refresh'
import { createProject, enterProject } from './crud'
import { $newProjectSessionRequest, type NewProjectSessionRequest } from './dialogs'
import { $newProjectDropPlacement } from './dialogs'

/** Worktree/git doors: start work in a repo, branch listing and switching,
 *  worktree dialogs, and path reveal/copy. */
export function goToProject(id: string, options?: { newSession?: boolean }): void {
  setSidebarAgentsGrouped(true)
  enterProject(id)

  if (!options?.newSession) {
    return
  }

  const cwd = projectRootCwd($projectTree.get().find(node => node.id === id))

  if (cwd) {
    requestStartWorkSession(cwd, undefined, { openTab: true })
  } else {
    requestFreshSession()
  }
}

// The cwd a NEW chat should start in.
//
// Priority (first hit wins):
//   1. Explicit sidebar project scope (drilled into a project / Home bucket)
//   2. Configured default project dir (detached otherwise — in BOTH local and
//      remote mode; a bare new chat never inherits the sticky remembered cwd,
//      #57911 / #84220)
//
// The "active project" is just an atom ($projectScope) — so inside a project a
// new session (cmd-n, the trunk "+") starts at that project's root (its primary
// repo = the default-branch checkout). Outside one it does NOT inherit the chat
// you were looking at: after a restart that's the just-resumed session, whose
// stored cwd is often a home-dir fallback, so every new chat landed there
// instead of the configured default (#71873, #80213, #77496).

export const $worktreeRefreshToken = atom(0)
const bumpWorktrees = () => $worktreeRefreshToken.set($worktreeRefreshToken.get() + 1)

// Re-run the visual `git worktree list` probe without the heavy projects.tree
// scan. Desktop-initiated add/remove already bumps the token inline; this is for
// OUT-OF-BAND changes the renderer can't see: the agent runs `git worktree
// add/remove` in the terminal during a turn, or an external terminal mutates the
// repo while the window was away. The probe is per-repo and bounded, so the
// caller (a settled turn / window refocus) can re-sync the worktree lanes
// cheaply, the same way a git GUI refreshes its tree on focus.
export function refreshWorktrees(): void {
  bumpWorktrees()
}

// Spin up a fresh worktree the lightest way (`git worktree add -b`) under the
// repo, returning where Hermes should start working. Git is the source of
// truth; the caller starts a session in the returned path.
export async function startWorkInRepo(
  repoPath: string,
  options?: { name?: string; branch?: string; base?: string; existingBranch?: string }
): Promise<null | { path: string; branch: string }> {
  const git = desktopGit()

  if (!git || !repoPath) {
    return null
  }

  let result

  try {
    result = await git.worktreeAdd(repoPath, options)
  } catch (err) {
    // Capability gate (#81724): a remote gateway serves worktree ops via the
    // backend's /api/git mirror, and an older backend may predate it. The raw
    // failure ("Expected JSON … but got HTML" / a bare 404) reads like a git
    // error — name the real remedy instead of degrading silently.
    if (isDesktopFsRemoteMode() && isMissingRestEndpoint(err)) {
      throw new Error(translateNow('sidebar.projects.worktreeStaleBackend'))
    }

    throw err
  }

  bumpWorktrees()

  return { branch: result.branch, path: result.path }
}

// Branches for the composer's "convert a branch into a worktree" picker: the
// local heads, plus the remote-tracking refs that have no local branch yet. A
// teammate's branch is therefore reachable, and the user does not check it out
// by hand first.
// Empty on a non-repo. On a remote gateway the list comes from the backend's
// /api/git/branches mirror, so it acts on the repo where sessions actually run.
export async function listRepoBranches(repoPath: string): Promise<HermesGitBranch[]> {
  const git = desktopGit()

  if (!git?.branchList || !repoPath) {
    return []
  }

  return git.branchList(repoPath)
}

// Local + remote-tracking branches for the base-branch picker in the
// new-worktree dialog. The remote default (origin/HEAD) is flagged so the
// UI can preselect it. Empty on a non-repo; remote gateways serve it from the
// backend's /api/git/base-branches mirror.
export async function listBaseBranches(repoPath: string): Promise<HermesGitBaseBranch[]> {
  const git = desktopGit()

  if (!git?.baseBranchList || !repoPath) {
    return []
  }

  return git.baseBranchList(repoPath)
}

export async function switchBranchInRepo(repoPath: string, branch: string): Promise<void> {
  const git = desktopGit()

  if (!git || !repoPath || !branch.trim()) {
    return
  }

  await git.branchSwitch(repoPath, branch)
  bumpWorktrees()
}

// A composer-driven "branch off into a new worktree" hand-off. The composer
// owns the typed draft; the chat controller owns session lifecycle. The composer
// creates the worktree (startWorkInRepo), then fires this so the controller opens
// a fresh session in that worktree and prefills the draft that kicked off the
// task. A monotonic token lets a rapid second request re-fire the controller's
// effect even if the path repeats.
export interface StartWorkSessionRequest {
  draft?: string
  /** Stack the fresh session as a tab when main already holds a chat (palette/⌘O opens-from-nowhere). */
  openTab?: boolean
  path: string
  token: number
}

export const $startWorkSessionRequest = atom<StartWorkSessionRequest | null>(null)

// ── "New project" drag placement ─────────────────────────────────────────────
// Dragging the project-overview header's "New project" + onto a chat zone arms
// WHERE the project should start; the dialog flow consumes it on create. Two
// atoms, mirroring $startWorkSessionRequest's token pattern:
//
// - `$newProjectDropPlacement` holds the last armed placement while the
//   project dialog is open. The dialog submit reads it when its `createProject`
//   succeeds and forwards it as `CreateProjectInput.dropPlacement`. Cleared on
//   dialog close so a later plain-click create never inherits a stale arm.
// - `$newProjectSessionRequest` is the consume-once completion signal: the
//   controller effect (ContribWiring) watches it, opens the created project's
//   fresh session draft at the recorded anchor/slot, and drops the request.

// The "make a new worktree" intent, from the keyboard or a menu. One dialog is
// mounted, in the sidebar beside ProjectDialog, and it reads this atom. This
// mirrors $projectDialog. This atom was a monotonic token that every mounted
// coding rail subscribed to. N composers on screen therefore gave N stacked
// dialogs for one ⌘⇧B, and the dialog the user dismissed showed an identical
// empty one behind it. One mount cannot double-open.
//
// `repoPath` is resolved when the dialog opens (see resolveWorktreeRepoPath).
// It is not read from the rail that received the key, so the dialog always
// targets the surface the user looks at.
export interface WorktreeDialogState {
  repoPath: string
  /** The base branch selected in a "branch off from X" menu. */
  base?: string
}

export const $worktreeDialog = atom<null | WorktreeDialogState>(null)

export function closeWorktreeDialog(): void {
  $worktreeDialog.set(null)
}

let startWorkToken = 0

export function requestStartWorkSession(path: string, draft?: string, options?: { openTab?: boolean }): void {
  const target = path.trim()

  if (!target) {
    return
  }

  startWorkToken += 1
  $startWorkSessionRequest.set({
    draft: draft?.trim() || undefined,
    openTab: options?.openTab || undefined,
    path: target,
    token: startWorkToken
  })
}

export async function removeWorktreePath(
  repoPath: string,
  worktreePath: string,
  options?: { force?: boolean }
): Promise<void> {
  const git = desktopGit()

  if (!git) {
    return
  }

  await git.worktreeRemove(repoPath, worktreePath, options)
  bumpWorktrees()
}

// Reveal a project/worktree path in the OS file manager (git-GUI standard).
export async function revealPath(path: null | string): Promise<void> {
  if (path) {
    await window.hermesDesktop?.revealPath?.(path)
  }
}

// Copy a path to the clipboard (git-GUI standard).
export async function copyPath(path: null | string): Promise<void> {
  if (path) {
    await window.hermesDesktop?.writeClipboard?.(path)
  }
}

// Pick a project folder via the remote-aware picker: a remote gateway browses
// the backend filesystem (seeded at its default cwd) where sessions run; local
// mode opens the native dialog. Returns the absolute path, or null if cancelled.
export async function pickProjectFolder(): Promise<null | string> {
  const [dir] = await selectDesktopPaths({
    defaultPath: (await desktopDefaultCwd())?.cwd,
    directories: true,
    multiple: false
  })

  return dir || null
}

// ⌘O / palette "Open folder…": open a folder AS a project, upserting. A folder
// already covered by a project (explicit or auto) just enters it; anything else
// becomes a new project named after the folder. Either way the sidebar scopes
// to the project and a fresh session draft lands anchored at the folder — the
// one-keystroke version of new project → enter → new session. Like goToProject,
// this is an open-from-nowhere: an occupied main gets a stacked tab, not stolen.
export async function openFolderAsProject(dir?: string): Promise<void> {
  const target = (dir ?? (await pickProjectFolder()) ?? '').trim()

  if (!target) {
    return
  }

  // Refresh first so the membership check runs against live truth — a repo
  // cloned since the last scan should enter its auto project, not double-create.
  await refreshProjectTree()

  const existing = projectIdForCwd(target)

  if (existing) {
    setSidebarAgentsGrouped(true)
    enterProject(existing)
  } else {
    const name =
      target
        .replace(/[/\\]+$/, '')
        .split(/[/\\]/)
        .pop() || target

    try {
      const created = await createProject({ name, folders: [target], primaryPath: target, use: true })

      if (created) {
        enterProject(created.id)
      }
    } catch (err) {
      // Stale backend (no projects.* RPC) or a failed write: still open the
      // folder as a plain workspace session below — the project row can wait.
      notify({ kind: 'warning', message: err instanceof Error ? err.message : String(err) })
    }
  }

  requestStartWorkSession(target, undefined, { openTab: true })
}
