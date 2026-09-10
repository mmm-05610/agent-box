import {
  desktopDefaultCwd,
  isDesktopFsRemoteMode,
  selectDesktopPaths,
  writeDesktopFileText
} from '@/lib/desktop-fs'
import { translateNow } from '@/i18n'
import { isMissingRpcMethod } from '@/lib/gateway-rpc'
import { isUnderPath } from '@/lib/path-compare'
import { setSidebarAgentsGrouped } from '@/store/layout'
import type { NewSessionPlacement } from '@/app/chat/new-session-drag'
import { $newProjectDropPlacement, $newProjectSessionRequest } from './dialogs'
import { projectIdForCwd } from './cwd-identity'
import {
  refreshProjectTree,
  refreshProjects
} from './refresh'
import { notify } from '@/store/notifications'
import {
  $activeGatewayProfile,
  $profileScope,
  ALL_PROFILES,
  normalizeProfileKey,
  requestFreshSession
} from '@/store/profile'
import { $selectedStoredSessionId, $sessions, sessionMatchesStoredId } from '@/store/session'
import { liveSessionProjectId, type SidebarProjectTree } from '@/app/chat/sidebar/projects/workspace-groups'
import type { ProjectInfo, ProjectsPayload } from '@/types/hermes'
import {
  $activeProjectId,
  $projectScope,
  $projectTree,
  $projects,
  $projectTreeLoading,
  projectRootCwd,
  $projectsRpcAvailable,
  projectsStaleBackendError,
  markProjectsRpcSuccess
} from './scope'
import {
  activeProjectsContext,
  applyPayload,
  gatewayRequest,
  gatewayRequestOn,
  projectParams,
  projectProfile
} from './gateway'

/** Create, rename, restyle, extend, and delete projects; the optimistic
 *  snapshot/rollback discipline for those writes. */
export function enterProject(id: string): void {
  $projectScope.set(id)

  // Only explicit, persisted projects (ids are `p_<hex>`) become active. Auto
  // projects (ids are filesystem paths) and the Home bucket have no durable row
  // to pin, so they're view-scope only.
  if (id.startsWith('p_')) {
    void setActiveProject(id).catch(() => undefined)
  }
}


export interface CreateProjectInput {
  name: string
  folders?: string[]
  primaryPath?: string
  slug?: string
  description?: string
  icon?: string
  color?: string
  boardSlug?: string
  use?: boolean
  // Free-text project idea; written to IDEA.md at the primary folder on create.
  idea?: string
  /** Where a "New project" DRAG dropped the project (tab-strip slot / pane
   *  edge / pane center). The completion side opens the created project's
   *  fresh session draft exactly there; absent = the plain-click behavior. */
  dropPlacement?: NewSessionPlacement
}

// Generate a project idea via the stateless llm.oneshot RPC (inherits the live
// session's model when one exists). Returns "" on failure so the caller can just
// leave the field untouched. The "🎲" affordance in the new-project dialog.
export async function followActiveSessionCwd(cwd: string): Promise<void> {
  const target = cwd.trim()

  if (!target) {
    return
  }

  await Promise.all([refreshProjects(), refreshProjectTree()])

  // Resolve only after the refresh, so a just-created/auto project is in the tree.
  const projectId = projectIdForCwd(target)

  if (projectId) {
    // The Projects tree only renders in grouped mode, so flip the sidebar into
    // it — otherwise following from the flat Sessions list would change scope
    // invisibly. Then drill into the thread's project.
    setSidebarAgentsGrouped(true)

    if (projectId !== $projectScope.get()) {
      enterProject(projectId)
    }
  }
}

// Issue a request on whichever gateway is currently active, reconnecting once
// if the socket dropped. Projects are per-profile, so they intentionally follow
// the active gateway just like the session list does.

export async function generateProjectIdea(name: string): Promise<string> {
  try {
    const res = await gatewayRequest<{ text: string }>('llm.oneshot', {
      instructions:
        'You generate a single, concrete project idea as a short IDEA.md body: a one-line summary, ' +
        'then 3-5 bullet goals. No preamble, no code fences, under 120 words.',
      input: name.trim() ? `Project name: ${name.trim()}` : 'Surprise me with a fun project.',
      temperature: 1.0
    })

    return (res.text || '').trim()
  } catch {
    return ''
  }
}

// Write IDEA.md to a project's primary folder (best-effort). Routes through the
// remote-aware fs write, so it lands on the backend for a remote gateway and on
// disk locally — the project is created regardless of whether the file lands.
async function writeProjectIdea(folder: null | string | undefined, idea: string): Promise<void> {
  const dir = (folder || '').trim()
  const body = idea.trim()

  if (!dir || !body) {
    return
  }

  try {
    await writeDesktopFileText(`${dir.replace(/[/\\]+$/, '')}/IDEA.md`, body.endsWith('\n') ? body : `${body}\n`)
  } catch {
    // Best-effort: the project is created regardless of whether IDEA.md lands.
  }
}

// ── Optimistic cache layer ───────────────────────────────────────────────────
// The project cache (list + tree + active pointer) mutates instantly on user
// action; the write reconciles in the background and rolls the whole cache back
// on failure — the same Apollo-style layer the session list uses.

interface ProjectsSnapshot {
  projects: ProjectInfo[]
  tree: SidebarProjectTree[]
  active: null | string
}

const snapshotProjects = (): ProjectsSnapshot => ({
  projects: $projects.get(),
  tree: $projectTree.get(),
  active: $activeProjectId.get()
})

const restoreProjects = ({ projects, tree, active }: ProjectsSnapshot): void => {
  $projects.set(projects)
  $projectTree.set(tree)
  $activeProjectId.set(active)
}

// Await an already-applied optimistic write; restore the snapshot if it throws.
async function persistOrRollback(snap: ProjectsSnapshot, write: () => Promise<void>): Promise<void> {
  try {
    await write()
  } catch (err) {
    restoreProjects(snap)
    throw err
  }
}

const reconcileProjects = (): void => {
  void refreshProjects()
  void refreshProjectTree()
}

// Map a ProjectInfo (list shape) onto a minimal overview tree node so a created
// project paints instantly. The backend seeds each folder as an (empty) repo, so
// the next tree refresh fills in repos/counts; this is just the optimistic stub.
function projectInfoToTreeNode(project: ProjectInfo): SidebarProjectTree {
  return {
    id: project.id,
    label: project.name || project.id,
    path: project.primary_path ?? project.folders?.[0]?.path ?? null,
    color: project.color ?? null,
    icon: project.icon ?? null,
    isAuto: false,
    repos: [],
    sessionCount: 0,
    previewSessions: []
  }
}

export async function createProject(input: CreateProjectInput): Promise<ProjectInfo | null> {
  if ($projectsRpcAvailable.get() === false) {
    throw projectsStaleBackendError()
  }

  let res: { project: ProjectInfo | null }

  try {
    // All profiles filters the sidebar, not the owner of a new project.
    // Capture the live route so reconnecting cannot retarget the write.
    const context = await activeProjectsContext(normalizeProfileKey($activeGatewayProfile.get()))

    res = await gatewayRequestOn<{ project: ProjectInfo | null }>(
      context.gateway,
      'projects.create',
      projectParams(
        {
          name: input.name,
          folders: input.folders ?? [],
          primary_path: input.primaryPath,
          slug: input.slug,
          description: input.description,
          icon: input.icon,
          color: input.color,
          board_slug: input.boardSlug,
          use: input.use ?? false
        },
        context.profile
      )
    )
  } catch (err) {
    if (isMissingRpcMethod(err)) {
      $projectsRpcAvailable.set(false)
      throw projectsStaleBackendError()
    }

    throw err
  }

  markProjectsRpcSuccess()

  // Not optimistic (the create awaits the RPC first, so there's nothing to roll
  // back): apply the server's row into the cached list + tree at once, so it
  // (and an entered scope) shows without waiting on the background refreshes
  // that reconcile counts/repos.
  const created = res.project

  if (created) {
    if (input.idea) {
      void writeProjectIdea(created.primary_path ?? created.folders?.[0]?.path ?? input.primaryPath, input.idea)
    }

    if (!$projects.get().some(proj => proj.id === created.id)) {
      $projects.set([...$projects.get(), created])
    }

    if (!$projectTree.get().some(node => node.id === created.id)) {
      $projectTree.set([projectInfoToTreeNode(created), ...$projectTree.get()])
    }

    if (input.use) {
      $activeProjectId.set(created.id)
    }

    // A "New project" DRAG created this: hand the placement to the completion
    // side so the project's fresh session draft opens exactly where it was
    // dropped (tab-strip slot / pane edge / pane center). The plain click
    // path has no placement and keeps its existing behavior.
    const rootPath = created.primary_path ?? created.folders?.[0]?.path ?? input.primaryPath

    if (input.dropPlacement && rootPath) {
      $newProjectSessionRequest.set({ path: rootPath, placement: input.dropPlacement })
    }

    setSidebarAgentsGrouped(true)
  }

  reconcileProjects()

  return created
}

export async function renameProject(id: string, name: string): Promise<void> {
  await updateProject(id, { name })
}

// Patch top-level project fields (name / appearance). Optimistic: the cached
// tree + list update instantly so a color/icon/name change has no round-trip
// lag; only a failed write reconciles from the server.
export async function updateProject(
  id: string,
  patch: { name?: string; color?: null | string; icon?: null | string }
): Promise<void> {
  const snap = snapshotProjects()

  $projectTree.set(
    snap.tree.map(node =>
      node.id === id
        ? {
            ...node,
            ...(patch.name !== undefined && { label: patch.name }),
            ...(patch.color !== undefined && { color: patch.color }),
            ...(patch.icon !== undefined && { icon: patch.icon })
          }
        : node
    )
  )
  $projects.set(snap.projects.map(proj => (proj.id === id ? { ...proj, ...patch } : proj)))

  // Backend treats null/undefined as "leave unchanged"; "" clears (stores NULL).
  // Map explicit null → "" so "no color"/"no icon" actually clear.
  await persistOrRollback(snap, () =>
    gatewayRequest(
      'projects.update',
      projectParams({
        id,
        ...patch,
        ...(patch.color === null && { color: '' }),
        ...(patch.icon === null && { icon: '' })
      })
    )
  )
}

// Appearance for an AUTO (inherited git-repo) project has no projects.db row to
// write to — its id is just the repo path. So the first color/icon change ADOPTS
// the repo as a real project (folder = repo root, name = its label) carrying the
// chosen look; from then on it patches in place like any explicit project.
// Returns true when an adoption happened, so an incremental picker can close
// (the node's id changes on adopt, and a second stale write would double-create).
export async function setProjectAppearance(
  project: Pick<SidebarProjectTree, 'color' | 'icon' | 'id' | 'isAuto' | 'label' | 'path'>,
  patch: { color?: null | string; icon?: null | string }
): Promise<boolean> {
  if (!project.isAuto) {
    await updateProject(project.id, patch)

    return false
  }

  if (!project.path) {
    return false
  }

  await createProject({
    name: project.label,
    folders: [project.path],
    primaryPath: project.path,
    // Carry any already-set look so setting one field doesn't wipe the other.
    color: (patch.color ?? project.color) || undefined,
    icon: (patch.icon ?? project.icon) || undefined
  })

  return true
}

export async function addProjectFolder(
  id: string,
  path: string,
  opts: { label?: string; isPrimary?: boolean } = {}
): Promise<void> {
  const snap = snapshotProjects()
  const trimmed = path.trim()

  // Optimistic: append the folder to the cached project + reflect a primary-path
  // change on its tree node, so the dialog closes onto an updated row. The folder
  // -> repo seeding (and session regrouping) is backend-computed, so the
  // background refresh fills repos in; a failure rolls the cache back.
  if (trimmed) {
    const folder = { path: trimmed, label: opts.label ?? null, is_primary: opts.isPrimary ?? false, added_at: 0 }

    $projects.set(
      snap.projects.map(proj => {
        if (proj.id !== id || proj.folders?.some(f => f.path === trimmed)) {
          return proj
        }

        const folders = opts.isPrimary
          ? [folder, ...proj.folders.map(f => ({ ...f, is_primary: false }))]
          : [...proj.folders, folder]

        return { ...proj, folders, ...(opts.isPrimary && { primary_path: trimmed }) }
      })
    )

    if (opts.isPrimary) {
      $projectTree.set(snap.tree.map(node => (node.id === id ? { ...node, path: trimmed } : node)))
    }
  }

  await persistOrRollback(snap, () =>
    gatewayRequest(
      'projects.add_folder',
      projectParams({ id, path, label: opts.label, is_primary: opts.isPrimary ?? false })
    )
  )
  reconcileProjects()
}

// True when the session currently open in the main pane belongs to `projectId`.
// Used so deleting a project you have a session open from kicks you back to the
// intro draft instead of stranding you in a now-orphaned view.
function openSessionBelongsToProject(projectId: string, projects: ProjectInfo[]): boolean {
  const openId = $selectedStoredSessionId.get()

  if (!openId) {
    return false
  }

  const open = $sessions.get().find(s => sessionMatchesStoredId(s, openId))

  return Boolean(open && liveSessionProjectId(open, projects) === projectId)
}

// Optimistic: drop the project from the cached tree + list the instant it's
// clicked (the entered-scope effect exits if you deleted the project you were
// inside), reconciling from the server payload. A failed delete restores both.
export async function deleteProject(id: string): Promise<void> {
  const snap = snapshotProjects()
  // Capture membership BEFORE removal — the project's folders (which determine
  // ownership) are gone once it's dropped from the cache.
  const kickToIntro = openSessionBelongsToProject(id, snap.projects)

  $projects.set(snap.projects.filter(project => project.id !== id))
  $projectTree.set(snap.tree.filter(node => node.id !== id))

  if (snap.active === id) {
    $activeProjectId.set(null)
  }

  // The open session's project is gone — reset to the intro draft (the session
  // itself survives; it just falls back to Recents).
  if (kickToIntro) {
    requestFreshSession()
  }

  await persistOrRollback(snap, async () => {
    applyPayload(await gatewayRequest<ProjectsPayload>('projects.delete', projectParams({ id })))
  })
  void refreshProjectTree()
}

export async function setActiveProject(id: null | string): Promise<void> {
  const res = await gatewayRequest<{ active_id: null | string }>('projects.set_active', projectParams({ id }))
  $activeProjectId.set(res.active_id ?? null)
}

// ── Project management dialog ────────────────────────────────────────────────
// A single dialog mounted in the sidebar reads this atom, so a project node's
// menu can open create / rename / add-folder flows without prop threading
