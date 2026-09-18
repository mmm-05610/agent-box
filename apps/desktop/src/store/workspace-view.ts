/**
 * store/workspace-view.ts — the workspace sidebar's VIEW preferences (36R).
 *
 * This is not a project metadata database: the authoritative stores stay the
 * backend project tree (local) and the Electron host's WSL workspace store.
 * What lives here is only the user's view state — which workspace row is
 * selected, and which LOCAL projects are hidden from the sidebar.
 *
 * Selection is backend-neutral: a local folder and a WSL workspace are picked
 * by the same convention from their main rows.
 */

import { Codecs, persistentAtom } from '@/lib/persisted'

const WORKSPACE_VIEW_SELECTED_STORAGE_KEY = 'hermes.desktop.workspaceViewSelected'
const WORKSPACE_LOCAL_HIDDEN_STORAGE_KEY = 'hermes.desktop.workspaceLocalHidden'

/** The currently selected workspace row (local or WSL), remembered across
 *  renders. Search must never write it (clearing search restores the view). */
export const $workspaceViewSelectedId = persistentAtom<null | string>(
  WORKSPACE_VIEW_SELECTED_STORAGE_KEY,
  null,
  {
    decode: raw => (typeof raw === 'string' && raw ? raw : null),
    encode: id => id ?? ''
  }
)

export function selectWorkspaceView(workspaceId: string): void {
  $workspaceViewSelectedId.set(workspaceId)
}

export function clearWorkspaceViewSelection(): void {
  $workspaceViewSelectedId.set(null)
}

/**
 * Locally hidden workspaces. Removal from the sidebar HIDES a local project;
 * the backend record survives (no projects.delete). The preference is scoped
 * by backend/profile/id so the same-named project under another backend or
 * profile is never hidden by accident. Losing this preference only costs
 * visibility — the record was never touched.
 */
export const $workspaceLocalHiddenIds = persistentAtom<string[]>(
  WORKSPACE_LOCAL_HIDDEN_STORAGE_KEY,
  [],
  Codecs.stringArray
)

export function workspaceHiddenKey(input: { backend: string; id: string; profile?: null | string }): string {
  return `${input.backend}:${input.profile ?? ''}:${input.id}`
}

export function isWorkspaceLocallyHidden(key: string, hiddenKeys: readonly string[] = $workspaceLocalHiddenIds.get()): boolean {
  return hiddenKeys.includes(key)
}

export function hideLocalWorkspace(key: string): void {
  const current = $workspaceLocalHiddenIds.get()

  if (!current.includes(key)) {
    $workspaceLocalHiddenIds.set([...current, key])
  }
}

/** Reopening a hidden local workspace unhides it — the SAME record and id. */
export function unhideLocalWorkspace(key: string): void {
  $workspaceLocalHiddenIds.set($workspaceLocalHiddenIds.get().filter(existing => existing !== key))
}
