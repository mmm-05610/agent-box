import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxWorkspaces } from '@/store/agentbox-service'
import type { WorkspaceRecord } from '@/types/wire/wire-v1'

export interface AgentBoxWorkspaceSelection {
  currentPath: null | string
  selectedId: null | string
  wsl?: { distribution: string; rootPath: string }
}

function normalizedPath(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/').replace(/\/+$/, '')

  return /^[A-Z]:/i.test(normalized) ? normalized.toLowerCase() : normalized
}

export async function refreshAgentBoxWorkspaces(client: WireV1Client): Promise<WorkspaceRecord[]> {
  const result = await client.call('workspaces.list', { includeArchived: false })
  $agentBoxWorkspaces.set(result.items)

  return result.items
}

/** Resolve a legacy shell selection to a server-owned Workspace identity.
 * IDs win. Path fallback is environment-qualified so equal strings exposed by
 * local and WSL can never collapse into one Workspace. */
export function resolveAgentBoxWorkspace(
  workspaces: readonly WorkspaceRecord[],
  selection: AgentBoxWorkspaceSelection
): WorkspaceRecord | null {
  const direct = selection.selectedId ? workspaces.find(workspace => workspace.id === selection.selectedId) : undefined

  if (direct) {
    return direct
  }

  if (selection.wsl) {
    const rootPath = normalizedPath(selection.wsl.rootPath)

    return (
      workspaces.find(
        workspace =>
          workspace.environment.kind === 'wsl' &&
          workspace.environment.host === selection.wsl!.distribution &&
          normalizedPath(workspace.normalizedPath) === rootPath
      ) ?? null
    )
  }

  if (!selection.currentPath) {
    return null
  }

  const currentPath = normalizedPath(selection.currentPath)

  return (
    workspaces.find(
      workspace =>
        workspace.environment.kind === 'local' && normalizedPath(workspace.normalizedPath) === currentPath
    ) ?? null
  )
}
