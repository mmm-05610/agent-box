import type { WireV1Client } from '@/api/wire-v1-client'
import { asRequestId, asWireId, type RequestId, type WorkspaceGitStatus } from '@/types/wire/wire-v1'

export interface WorkspaceGitReadOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/**
 * Order 62: the workspace's Git facts, read-only. Every one of the six fields
 * may come back null, and null means "not obtainable" — this function reports
 * exactly what the service answered and never substitutes a zero; the card
 * turns nulls into their typed reason.
 */
export async function loadWorkspaceGitStatus(
  client: WireV1Client,
  workspaceId: string,
  options: WorkspaceGitReadOptions = {}
): Promise<WorkspaceGitStatus> {
  const result = await client.call('workspaces.gitStatus', {
    requestId: (options.createRequestId ?? defaultRequestId)(),
    workspaceId: asWireId(workspaceId)
  })

  return result.git
}
