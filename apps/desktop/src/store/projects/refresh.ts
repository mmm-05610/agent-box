import { hermesApi } from '@/api/client'
import { translateNow } from '@/i18n'
import { activeGateway } from '@/store/gateway'
import { $sidebarShowAllSessions } from '@/store/layout'
import { $profileScope, ALL_PROFILES } from '@/store/profile/sidebar-scope'
import { type SidebarProjectTree } from '@/store/projects/membership'
import { sessionMatchesStoredId, setSessions } from '@/store/session'
import { $removedSessionIds, $sessionMutationsInFlight } from '@/store/session-removal'
import type { ProjectsPayload } from '@/types/hermes'

import {
  activeProjectsContext,
  type ActiveProjectsContext,
  applyPayload,
  gatewayRequest,
  gatewayRequestOn,
  isRetryableProjectTreeReadError,
  projectParams,
  projectProfile,
  stillOnProjectsContext
} from './gateway'
import { markProjectsRpcFailure, markProjectsRpcSuccess } from './scope'
import {
  $activeProjectId,
  $projectTree,
  $projectTreeLoading,
  projectRootCwd
} from './scope'

let projectsRefreshGeneration = 0

/** Refresh the projects list, the grouped sidebar tree, and a project's
 *  session slice; move sessions between projects. */
export async function refreshProjects(): Promise<void> {
  const generation = ++projectsRefreshGeneration
  let context: ActiveProjectsContext | null = null

  try {
    context = await activeProjectsContext()

    const payload = await gatewayRequestOn<ProjectsPayload>(
      context.gateway,
      'projects.list',
      projectParams({}, context.profile)
    )

    if (generation !== projectsRefreshGeneration || !stillOnProjectsContext(context)) {
      return
    }

    applyPayload(payload)
    markProjectsRpcSuccess()
  } catch (err) {
    if (context && generation === projectsRefreshGeneration && stillOnProjectsContext(context)) {
      markProjectsRpcFailure(err)
    }
    // Backend may not be ready; keep the last known list.
  }
}

interface ProjectTreePayload {
  projects: SidebarProjectTree[]
  active_id: null | string
  scoped_session_ids: string[]
}

// Expanded previews need the complete existing tree window before the renderer
// finds its two recency groups. Keep the normal three-row payload unchanged.
const projectTreePreviewLimit = () => ($sidebarShowAllSessions.get() ? 2000 : 3)
// The all-profiles fan-out reads one database per profile, so it is allowed the
// same headroom as the cross-profile session list rather than the interactive
// default.
const PROJECT_TREE_REQUEST_TIMEOUT_MS = 60_000

let projectTreeRefreshGeneration = 0

function applyProjectTreePayload(res: ProjectTreePayload): void {
  const scoped = new Set(res.scoped_session_ids ?? [])
  $projectTree.set(res.projects ?? [])
  $activeProjectId.set(res.active_id ?? null)
  const tombstones = $removedSessionIds.get()

  if (tombstones.size) {
    // Keep a tombstone while the backend still lists the id (delete pending on
    // its side) OR while its mutation is still in flight locally — dropping it
    // early flashes the row back until the RPC lands.
    const inFlight = $sessionMutationsInFlight.get()
    const pending = new Set([...tombstones].filter(id => scoped.has(id) || inFlight.has(id)))

    if (pending.size !== tombstones.size) {
      $removedSessionIds.set(pending)
    }
  }
}

export async function refreshProjectTreeOn(context: ActiveProjectsContext): Promise<void> {
  const generation = ++projectTreeRefreshGeneration
  const { gateway, profile } = context

  if (activeGateway() === gateway) {
    $projectTreeLoading.set(true)
  }

  try {
    let res: ProjectTreePayload

    try {
      res = await gatewayRequestOn<ProjectTreePayload>(
        gateway,
        'projects.tree',
        projectParams({ preview_limit: projectTreePreviewLimit() }, profile)
      )
    } catch (error) {
      // A remote source switch can leave the first read RPC on a newly-opened
      // socket without a response even though the gateway remains healthy.
      // Retry once only while this exact gateway/profile is still foreground;
      // missing-method and other authoritative failures stay visible as-is.
      if (!isRetryableProjectTreeReadError(error) || !stillOnProjectsContext(context)) {
        throw error
      }

      res = await gatewayRequestOn<ProjectTreePayload>(
        gateway,
        'projects.tree',
        projectParams({ preview_limit: projectTreePreviewLimit() }, profile)
      )
    }

    if (generation !== projectTreeRefreshGeneration || !stillOnProjectsContext(context)) {
      return
    }

    applyProjectTreePayload(res)
    markProjectsRpcSuccess()
  } catch (err) {
    if (generation === projectTreeRefreshGeneration && stillOnProjectsContext(context)) {
      markProjectsRpcFailure(err)
    }
  } finally {
    if (generation === projectTreeRefreshGeneration && activeGateway() === gateway) {
      $projectTreeLoading.set(false)
    }
  }
}

// Pull the authoritative project tree (overview structure + counts + preview
// sessions + the scoped-session-id set). Best-effort: a failure leaves the
// cached tree intact so the sidebar doesn't flicker.
export async function refreshProjectTree(): Promise<void> {
  if ($profileScope.get() === ALL_PROFILES) {
    await refreshProjectTreeAcrossProfiles()

    return
  }

  try {
    await refreshProjectTreeOn(await activeProjectsContext())
  } catch {
    // Backend may not be ready; keep the last known tree.
  }
}

// The grouped sidebar in all-profiles mode. `projects.tree` answers for one
// backend's own profile, so it can only ever describe a slice of this view;
// the REST fan-out reads every profile's databases directly instead of asking
// us to hold a backend open per profile just to draw lanes.
async function refreshProjectTreeAcrossProfiles(): Promise<void> {
  const generation = ++projectTreeRefreshGeneration
  $projectTreeLoading.set(true)

  try {
    const res = await hermesApi<ProjectTreePayload>({
      path: `/api/profiles/projects/tree?preview_limit=${projectTreePreviewLimit()}`,
      timeoutMs: PROJECT_TREE_REQUEST_TIMEOUT_MS
    })

    // A profile switch mid-flight leaves this payload describing the wrong
    // scope; the newer refresh owns the tree.
    if (generation !== projectTreeRefreshGeneration || $profileScope.get() !== ALL_PROFILES) {
      return
    }

    applyProjectTreePayload(res)
    markProjectsRpcSuccess()
  } catch (err) {
    markProjectsRpcFailure(err)
  } finally {
    if (generation === projectTreeRefreshGeneration) {
      $projectTreeLoading.set(false)
    }
  }
}

// Fully hydrated lanes (repo -> lane -> session rows) for one project, fetched
// when the user enters it. Same backend grouping as `projects.tree`, so ids and
// membership match exactly.
let projectSessionsRefreshGeneration = 0

export async function fetchProjectSessions(projectId: string): Promise<SidebarProjectTree | null> {
  const generation = ++projectSessionsRefreshGeneration
  const profile = projectProfile()

  if (!profile) {
    return null
  }

  let context: ActiveProjectsContext | undefined

  try {
    context = await activeProjectsContext()

    const res = await gatewayRequestOn<{ project: SidebarProjectTree | null }>(
      context.gateway,
      'projects.project_sessions',
      projectParams({ project_id: projectId }, context.profile)
    )

    if (generation !== projectSessionsRefreshGeneration || !stillOnProjectsContext(context)) {
      return null
    }

    return res.project ?? null
  } catch (error) {
    if (
      generation !== projectSessionsRefreshGeneration ||
      profile !== projectProfile() ||
      (context && !stillOnProjectsContext(context))
    ) {
      return null
    }

    throw error
  }
}

interface WorkspaceMovePayload {
  branch?: null | string
  cwd?: string
  git_repo_root?: null | string
}

// Re-home a stored session into another project's root folder — the fix for a
// chat created in the wrong directory. The backend replaces cwd + git identity
// (so the tree's grouping follows) and re-anchors any live agent bound to the
// row; here we mirror the move into the `$sessions` cache so both the flat list
// and the grouped tree reflect it before the next authoritative refresh.
export async function moveSessionToProject(
  sessionId: string,
  projectId: string,
  profile?: null | string
): Promise<void> {
  const cwd = projectRootCwd($projectTree.get().find(node => node.id === projectId))

  if (!cwd) {
    throw new Error(translateNow('sidebar.projects.moveNoFolder'))
  }

  const res = await gatewayRequest<WorkspaceMovePayload>('session.workspace.move', {
    cwd,
    session_key: sessionId,
    ...(profile ? { profile } : {})
  })

  const moved = res.cwd || cwd
  setSessions(prev =>
    prev.map(s =>
      sessionMatchesStoredId(s, sessionId)
        ? { ...s, cwd: moved, git_branch: res.branch ?? null, git_repo_root: res.git_repo_root ?? null }
        : s
    )
  )
  void refreshProjectTree()
}
