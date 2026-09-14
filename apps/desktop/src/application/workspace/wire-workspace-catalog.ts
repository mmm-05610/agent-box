import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxWorkspaces } from '@/store/agentbox-service'
import {
  asRequestId,
  type EnvironmentIdentity,
  type RequestId,
  type WorkspaceRecord,
  type WorkspacesOpenResult
} from '@/types/wire/wire-v1'

export interface AgentBoxWorkspaceSelection {
  /** A service-side Workspace id we already hold (an existing Session's
   *  workspaceId). Shell row ids are a different namespace and never belong
   *  here — a string that happens to match must not become a hit. */
  serviceWorkspaceId?: null | string
  /** Local shell target: the folder the sidebar row stands for. */
  localPath?: null | string
  /** WSL shell target: the host-verified identity plus the POSIX root path. */
  wsl?: { distribution: string; rootPath: string } | null
}

export interface OpenAgentBoxWorkspaceInput {
  environment: EnvironmentIdentity
  /** The path as picked in that environment's own semantics — never rewritten. */
  path: string
  expectedVersion?: number
}

export interface OpenAgentBoxWorkspaceOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

function normalizedPath(value: string): string {
  const normalized = value.trim().replaceAll('\\', '/').replace(/\/+$/, '')

  return /^[A-Z]:/i.test(normalized) ? normalized.toLowerCase() : normalized
}

export async function refreshAgentBoxWorkspaces(client: WireV1Client): Promise<WorkspaceRecord[]> {
  const result = await client.call('workspaces.list', { includeArchived: false })
  $agentBoxWorkspaces.set(result.items)

  return result.items
}

/**
 * Registers an already-chosen environment + path with the service (core v1 §4:
 * open = register-or-select, idempotent per location, never a Session and never
 * a harness start). The path crosses the wire exactly as the shell holds it —
 * no Windows/POSIX/UNC rewriting — and only the returned record is identity:
 * callers use `workspace.id`, never the shell row id.
 */
export async function openAgentBoxWorkspace(
  client: WireV1Client,
  input: OpenAgentBoxWorkspaceInput,
  options: OpenAgentBoxWorkspaceOptions = {}
): Promise<WorkspacesOpenResult> {
  return client.call('workspaces.open', {
    environment: input.environment,
    path: input.path,
    ...(input.expectedVersion === undefined ? {} : { expectedVersion: input.expectedVersion }),
    requestId: (options.createRequestId ?? defaultRequestId)()
  })
}

/** Resolve a shell selection to a server-owned Workspace identity by
 *  environment + path. Local and WSL never collapse into one location even when
 *  their path strings are equal, and path comparison only ever reads the
 *  service's own normalizedPath. */
export function resolveAgentBoxWorkspace(
  workspaces: readonly WorkspaceRecord[],
  selection: AgentBoxWorkspaceSelection
): WorkspaceRecord | null {
  const direct = selection.serviceWorkspaceId
    ? workspaces.find(workspace => workspace.id === selection.serviceWorkspaceId)
    : undefined

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

  if (!selection.localPath) {
    return null
  }

  const localPath = normalizedPath(selection.localPath)

  return (
    workspaces.find(
      workspace =>
        workspace.environment.kind === 'local' && normalizedPath(workspace.normalizedPath) === localPath
    ) ?? null
  )
}
