import { liveSessionProjectId, type SidebarProjectTree } from '@/app/chat/sidebar/projects/workspace-groups'
import {
  $activeGatewayProfile,
  $profileScope,
  ALL_PROFILES,
  normalizeProfileKey
} from '@/store/profile'
import { isUnderPath } from '@/lib/path-compare'
import { $projectTree } from './scope'

/** The project (explicit or auto) that owns a cwd, and session-side
 *  project-follow behavior. */
export function projectIdForCwd(cwd: string): null | string {
  let best: null | string = null
  let bestLen = -1

  for (const project of $projectTree.get()) {
    // Match project + repo roots AND each worktree-lane path: a linked worktree
    // (e.g. a sibling `repo-retry`) lives OUTSIDE the repo root, so root-prefix
    // matching alone would miss it — but it's still part of the project.
    const paths = [project.path, ...project.repos.flatMap(repo => [repo.path, ...repo.groups.map(group => group.path)])]

    for (const path of paths) {
      const p = (path || '').trim()

      if (p && isUnderPath(p, cwd) && p.length > bestLen) {
        bestLen = p.length
        best = project.id
      }
    }
  }

  return best
}

// The display NAME of the explicit, named project owning `cwd` (longest path
// match), or null when the cwd sits in no named project. The status bar reads
// this to label the workspace by project instead of the bare cwd leaf. We skip
// auto-projects (a repo root promoted with no projects.db row) and the synthetic
// Home bucket on purpose: those have no human name, so their sessions keep the
// cwd-leaf label — matching the backend `_project_info_for_cwd`, which
// only resolves projects.db rows, so the desktop and TUI name the same session
// identically without threading a second per-session copy through session.info.
export function projectNameForCwd(cwd: string): null | string {
  const target = (cwd || '').trim()

  if (!target) {
    return null
  }

  let best: null | string = null
  let bestLen = -1

  for (const project of $projectTree.get()) {
    if (project.isAuto || project.isNoProject) {
      continue
    }

    const paths = [project.path, ...project.repos.flatMap(repo => [repo.path, ...repo.groups.map(group => group.path)])]

    for (const path of paths) {
      const p = (path || '').trim()

      if (p && isUnderPath(p, target) && p.length > bestLen) {
        bestLen = p.length
        best = project.label
      }
    }
  }

  return best
}

// The active session's agent relocated itself (created/entered another repo or
// worktree via the terminal — backend re-anchors its cwd and emits session.info).
// Re-pull projects + tree so a freshly created/auto project and the relocated
// session row show live, then follow the view into the session's new project
// (from the overview or a now-stale project alike). Caller gates this on a real
// same-session cwd move, so a plain session switch never reaches here.
