import { atom } from 'nanostores'

import type { NewSessionPlacement } from '@/app/chat/new-session-drag'
import { translateNow } from '@/i18n'
import { notify } from '@/store/notifications'

import { $projectsRpcAvailable } from './scope'

/** Project management dialog UI state. */
export interface ProjectDialogState {
  mode: 'add-folder' | 'create' | 'rename'
  projectId?: string
  name?: string
}

export const $projectDialog = atom<null | ProjectDialogState>(null)

export function openProjectCreate(): void {
  if ($projectsRpcAvailable.get() === false) {
    notify({
      kind: 'warning',
      message: translateNow('sidebar.projects.staleBackend')
    })

    return
  }

  $projectDialog.set({ mode: 'create' })
}

/** Clear the armed "New project" drag placement — on dialog close, so a later
 *  plain-click create can never inherit a stale arm. */
export function clearNewProjectDropPlacement(): void {
  $newProjectDropPlacement.set(null)
}

export function openProjectRename(project: { id: string; name: string }): void {
  $projectDialog.set({ mode: 'rename', name: project.name, projectId: project.id })
}

export function openProjectAddFolder(project: { id: string; name: string }): void {
  $projectDialog.set({ mode: 'add-folder', name: project.name, projectId: project.id })
}

export function closeProjectDialog(): void {
  $projectDialog.set(null)
}

// ── Git-driven worktrees ("Start work") ─────────────────────────────────────
// Bumped after a `git worktree add`/`remove` so the sidebar's worktree-list
// probe (useRepoWorktreeMap) refetches and the new/removed lane shows at once,
// instead of waiting for the next scope change.

export const $newProjectDropPlacement = atom<NewSessionPlacement | null>(null)

export interface NewProjectSessionRequest {
  /** The created project's root cwd — the fresh draft starts here. */
  path: string
  placement: NewSessionPlacement
}

export const $newProjectSessionRequest = atom<NewProjectSessionRequest | null>(null)
