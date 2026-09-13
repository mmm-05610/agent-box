/**
 * application/workspace/workspace-projection.ts — the unified workspace
 * projection (work order 36R).
 *
 * Two authoritative stores — the backend project tree (local workspaces) and
 * the Electron host's WSL workspace store (remote workspaces) — project into
 * ONE list of neutral rows. Pure functions only: no store reads, no feature
 * imports, no runtime policy. The sidebar composes this with its view prefs.
 */

import type { WorkspaceListItem, WorkspaceSearchHit } from '@/types/workspace'

/** The minimal local-project shape the projection needs (structurally a
 *  subset of the backend tree node, so callers can pass rows verbatim). */
export interface WorkspaceProjectionProject {
  id: string
  label: string
  path: null | string
  sessionCount: number
  isNoProject?: boolean
}

/** The minimal WSL-record shape (structurally a subset of WslWorkspaceRecord). */
export interface WorkspaceProjectionWslRecord {
  id: string
  name: string
  distribution: string
  rootPath: string
}

/** Local rows first (Home leads, caller orders), WSL rows appended as peers —
 *  the same list, one row language. */
export function projectWorkspaceList(input: {
  projects: readonly WorkspaceProjectionProject[]
  wslWorkspaces: readonly WorkspaceProjectionWslRecord[]
}): WorkspaceListItem[] {
  const local = input.projects.map(project => ({
    id: project.id,
    backend: 'local' as const,
    name: project.label,
    path: project.path,
    detail: null,
    sessionCount: project.sessionCount
  }))

  const wsl = input.wslWorkspaces.map(record => ({
    id: record.id,
    backend: 'wsl' as const,
    name: record.name,
    path: record.rootPath,
    detail: `${record.distribution} · ${record.rootPath}`,
    sessionCount: 0
  }))

  return [...local, ...wsl]
}

/**
 * Sidebar search over workspaces: matches a row's NAME or PATH (case- and
 * diacritics-insensitive). A zero-session workspace is searchable — the hit
 * keeps its own row so the user can still navigate to it. Session content
 * search is a separate concern and is not rewritten here.
 */
export function searchWorkspaceItems(items: readonly WorkspaceListItem[], query: string): WorkspaceSearchHit[] {
  const needle = query.trim().toLowerCase()

  if (!needle) {
    return []
  }

  const hits: WorkspaceSearchHit[] = []

  for (const item of items) {
    const nameMatch = normalize(item.name).includes(needle)
    const pathMatch = item.path ? normalize(item.path).includes(needle) : false

    if (nameMatch || pathMatch) {
      hits.push({ item, matchedBy: nameMatch ? 'name' : 'path' })
    }
  }

  return hits
}

function normalize(value: string): string {
  return value.toLowerCase().normalize('NFKD')
}
