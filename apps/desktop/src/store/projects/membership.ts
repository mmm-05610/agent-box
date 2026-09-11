import type { ProjectInfo, SessionInfo } from '@/types/hermes'

// The membership core of the sidebar project tree: which project a session
// belongs to (`liveSessionProjectId`), the color derived from that same answer
// (`sessionProjectColor`), and the three tree shapes the answer is rendered
// into. Split out of `app/chat/sidebar/projects/workspace-groups.ts` (which
// keeps the tree-building half) so `store/` can answer the membership question
// without reaching up into `app/`.
//
// Session grouping itself is computed authoritatively on the backend
// (`tui_gateway/project_tree.py`, exposed via `projects.tree` /
// `projects.project_sessions`); nothing here decides session membership beyond
// what a row's own paths imply.

export interface SidebarSessionGroup {
  id: string
  label: string
  path: null | string
  sessions: SessionInfo[]
  // Profile color for the ALL-profiles view; absent for workspace groups.
  color?: null | string
  // True when this group is a repo's main checkout (vs a linked worktree).
  isMain?: boolean
  // True for the repo's primary ("home") checkout lane — the single lane that
  // collapses all main-checkout sessions, labeled by the worktree's LIVE branch
  // (defaulting to `main`). Renders a home glyph and pins to the top.
  isHome?: boolean
  // True for the synthetic lane that collapses all of a repo's kanban task
  // worktrees (`<repo>/.worktrees/t_*`) into one row, so a heavy board doesn't
  // spray hundreds of throwaway branch lanes across the sidebar.
  isKanban?: boolean
  mode?: 'profile' | 'source' | 'workspace'
  sourceId?: string
  // Exact owner for gateway/profile sidebar sections; absent for workspace lanes.
  connectionId?: null | string
  profile?: string
}

/** A repo node: holds its branch/worktree lanes (`repo -> lane -> sessions`). */
export interface SidebarWorkspaceTree {
  id: string
  label: string
  path: null | string
  groups: SidebarSessionGroup[]
  sessionCount: number
}

/** A project node: human-named (or repo-derived), holds its repo subtree. */
export interface SidebarProjectTree {
  id: string
  label: string
  path: null | string
  color?: null | string
  icon?: null | string
  archived?: boolean
  // A git repo root promoted automatically (not a user-created projects.db row).
  // Deletable = dismissable.
  isAuto?: boolean
  // The synthetic bucket (labeled "Home") holding every session no project
  // claimed. It has no folder, so no repo/worktree structure — its one lane
  // exists only to carry the rows.
  isNoProject?: boolean
  repos: SidebarWorkspaceTree[]
  sessionCount: number
  // Tokens and spend over the same sessions `sessionCount` counts, summed by
  // the backend — the tree only carries a preview of the rows themselves.
  totalTokens?: number
  totalCostUsd?: number
  // Max activity timestamp across the project's sessions (overview sort key).
  lastActive?: number
  // Up to N most-recent sessions for the overview preview (set by `projects.tree`).
  previewSessions?: SessionInfo[]
}

/** Path split into segments, ignoring trailing slashes and mixed separators. */
export const segments = (path: string): string[] =>
  path
    .replace(/[/\\]+$/, '')
    .split(/[/\\]/)
    .filter(Boolean)

// Windows spellings: drive-letter (`C:\…`), UNC (`\\srv`, `//srv`), or any
// backslash-rooted path (`\wsl.localhost\…`). A single leading `/` stays POSIX.
// Mirrors the backend `_is_windows_path` so the live overlay places rows into
// the same project the backend tree would.
const isWindowsPath = (path: string): boolean =>
  /^[A-Za-z]:[/\\]/.test(path) || path.startsWith('\\') || path.startsWith('//')

/**
 * Segments for identity comparison: Windows paths fold case (and separators, via
 * {@link segments}) so `C:\Work` and `c:/work` are one lane; POSIX stays
 * case-sensitive. Comparison-only — emitted ids/labels keep their spelling.
 */
export const comparisonSegments = (path: string): string[] => {
  const segs = segments(path)

  return isWindowsPath(path) ? segs.map(seg => seg.toLowerCase()) : segs
}

// The `.worktrees` dir for a KANBAN-TASK worktree path, else null. Only matches
// task worktrees (`<repo>/.worktrees/t_<hex>`, the `t_…` id kanban_db mints) so
// the many ephemeral task worktrees collapse into one lane — while user-named
// "New worktree" dirs (`<repo>/.worktrees/<slug>`) stay as their own lanes.
const KANBAN_DIR_RE = /^(.*[/\\]\.worktrees)[/\\]t_[0-9a-f]+[/\\]?$/

export function kanbanWorktreeDir(path: string): null | string {
  return path.match(KANBAN_DIR_RE)?.[1] ?? null
}

/** Id of the Home bucket (must match the backend tree's `NO_PROJECT_ID`). */
export const NO_PROJECT_ID = '__no_project__'

/** True when `target` equals `folder` or is nested under it (segment-wise). */
export function isPathUnder(folder: string, target: string): boolean {
  const f = comparisonSegments(folder)
  const t = comparisonSegments(target)

  if (!f.length || f.length > t.length) {
    return false
  }

  return f.every((seg, i) => seg === t[i])
}

/**
 * The project a live session belongs to (overview membership) — explicit project
 * by longest-prefix folder, else the repo root (the auto-project id). An IN-TREE
 * linked worktree (`<repoRoot>/.worktrees/<slug>`) belongs to the SAME project as
 * its repo root (the root is right there in the path), so a freshly-created
 * worktree session — e.g. from "convert a branch" / "new worktree" — surfaces in
 * the overview at once instead of waiting for the next backend refresh. Returns
 * null only for sessions we genuinely can't place from the row alone: cwd-less,
 * kanban-task worktrees (they fold into the kanban bucket), or a worktree that
 * lives OUTSIDE the repo root (a sibling dir) AND under no explicit project
 * folder. An explicit-project folder match always places the row — even when
 * the row's cwd sits outside its recorded repo root (a mid-session relocation,
 * or a sibling worktree of a project repo), the folder match is authoritative;
 * only the repo-root AUTO-project fallback needs cwd-under-root confidence.
 */
export function liveSessionProjectId(session: SessionInfo, explicitProjects: ProjectInfo[]): null | string {
  const cwd = (session.cwd || '').trim()
  // A session may carry only a git_repo_root and no cwd — older/imported rows,
  // or ones captured before cwd tracking. The backend still groups those by repo
  // root, so anchor on it here too; otherwise the sidebar files the row under a
  // project but the color derivation drops it (the "grouped but grey" bug).
  const repoRoot = (session.git_repo_root || '').trim() || cwd
  const anchor = cwd || repoRoot

  if (!anchor || kanbanWorktreeDir(anchor)) {
    return null
  }

  let projectId = ''
  let bestLen = -1

  for (const project of explicitProjects) {
    if (project.archived) {
      continue
    }

    for (const folder of project.folders) {
      if (isPathUnder(folder.path, cwd) || isPathUnder(folder.path, repoRoot)) {
        const len = segments(folder.path).length

        if (len > bestLen) {
          bestLen = len
          projectId = project.id
        }
      }
    }
  }

  if (projectId) {
    return projectId
  }

  // AUTO-project fallback (the repo root itself): with a cwd present it must
  // sit under the repo root (a sibling worktree outside the root can't be
  // placed from the row alone); a root-only session skips this — the root IS
  // the anchor.
  if (cwd && !isPathUnder(repoRoot, cwd)) {
    return null
  }

  return repoRoot
}

/**
 * The color a session inherits from its owning project — the explicit project
 * whose folder is the longest prefix of the session's cwd/repo-root, when that
 * project carries a user-set color. Auto-promoted repo projects have no color
 * unless the user set one, so a session only tints when it belongs to a colored
 * project (inheritance is opt-in by coloring the project). Reuses
 * {@link liveSessionProjectId} so the color follows the SAME membership the
 * sidebar groups by; returns null for rootless / kanban / out-of-tree rows and
 * for sessions under an uncolored (or auto) project.
 */
export function sessionProjectColor(session: SessionInfo, projects: ProjectInfo[]): null | string {
  const projectId = liveSessionProjectId(session, projects)

  if (!projectId) {
    return null
  }

  return projects.find(project => project.id === projectId)?.color ?? null
}
