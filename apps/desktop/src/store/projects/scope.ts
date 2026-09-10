import { atom } from 'nanostores'

import { NO_PROJECT_ID, type SidebarProjectTree } from '@/app/chat/sidebar/projects/workspace-groups'
import { translateNow } from '@/i18n'
import { isMissingRpcMethod } from '@/lib/gateway-rpc'
import { persistentAtom } from '@/lib/persisted'
import { workspaceCwdForNewSession } from '@/store/session'
import type { ProjectInfo, ProjectsPayload } from '@/types/hermes'

export type { ProjectInfo, ProjectsPayload }

/** Project scope state: the cached project list/tree atoms, the persisted
 *  sidebar scope, and the cwd a new chat should start in. */
export const $projects = atom<ProjectInfo[]>([])
export const $activeProjectId = atom<null | string>(null)

// The authoritative project -> repo -> lane tree (overview), served by
// `projects.tree`. Lanes carry counts + structure; per-project session rows are
// fetched lazily on drill-in via `fetchProjectSessions`. This is the single
// source of project membership — the desktop no longer derives it.
export const $projectTree = atom<SidebarProjectTree[]>([])
export const $projectTreeLoading = atom(false)

// False when the connected backend predates the projects.* JSON-RPC surface
// (same semver label, older install). Null until the first probe.
export const $projectsRpcAvailable = atom<boolean | null>(null)

export function markProjectsRpcSuccess(): void {
  $projectsRpcAvailable.set(true)
}

export function markProjectsRpcFailure(err: unknown): void {
  if (isMissingRpcMethod(err)) {
    $projectsRpcAvailable.set(false)
  }
}

export function projectsStaleBackendError(): Error {
  return new Error(translateNow('sidebar.projects.staleBackend'))
}

// True while the disk scan is in flight (drives the "finding repos" hint).

export const ALL_PROJECTS = '__all_projects__'

const PROJECT_SCOPE_KEY = 'hermes.desktop.projectScope'

export const $projectScope = persistentAtom<string>(PROJECT_SCOPE_KEY, ALL_PROJECTS, {
  decode: raw => raw || ALL_PROJECTS,
  encode: value => value || ALL_PROJECTS
})

// Enter a project: scope the sidebar to it and make it the active project
// (best-effort — the durable pointer is nice-to-have, the view scope is the
// point). Never opens a session.

export function exitProjectScope(): void {
  $projectScope.set(ALL_PROJECTS)
}

// A project's working root: its primary folder, else the first repo that has
// one. Empty for the path-less Home bucket. (The sidebar's `projectTreeCwd` is
// the same rule over the same tree — this is the store-side copy so the store
// doesn't reach into the sidebar's React module.)
export const projectRootCwd = (project: SidebarProjectTree | undefined): string =>
  (project?.path || project?.repos.find(repo => repo.path)?.path || '').trim()

// ⌘K "go to project": flip the sidebar into grouped mode and enter the project
// — a pure scope switch, same as clicking the overview row (never spends main).
// With `newSession` (⌘-select / ⌘-Enter) it also lands on a fresh session draft
// anchored at the project root — stacked as a tab when main already holds a
// chat (palette opens are opens-from-nowhere). A path-less project (the Home
// bucket) gets a plain detached draft.

export function resolveNewSessionCwd(): string {
  const scope = $projectScope.get()

  // Inside Home, "no folder" is the point: a new chat must stay detached rather
  // than silently attaching to the configured default dir and leaving Home.
  if (scope === NO_PROJECT_ID) {
    return ''
  }

  if (scope !== ALL_PROJECTS) {
    const cwd = projectRootCwd($projectTree.get().find(node => node.id === scope))

    if (cwd) {
      return cwd
    }
  }

  return workspaceCwdForNewSession()
}

// The project (explicit or auto) that owns `cwd`, by longest path match across
// the live tree. Null when no project covers it (it'll surface as a fresh
// auto-project on the next tree refresh).
