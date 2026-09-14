import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxSessions, adoptAgentBoxSession, upsertAgentBoxSession } from '@/store/agentbox-service'
import {
  asRequestId,
  asWireId,
  type RequestId,
  type SessionRecord,
  type WireId
} from '@/types/wire/wire-v1'

export interface WireSessionCatalogOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/** Merge a server page into the renderer cache; a partial page never erases
 *  live records learned through another response or event, and a page entry
 *  older than what we hold never rolls it back. */
export async function refreshAgentBoxSessions(
  client: WireV1Client,
  input: { includeArchived?: boolean; workspaceId?: null | WireId } = {}
): Promise<SessionRecord[]> {
  const result = await client.call('sessions.list', {
    includeArchived: input.includeArchived ?? false,
    ...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {})
  })

  let merged = $agentBoxSessions.get()

  for (const session of result.items) {
    merged = adoptAgentBoxSession(merged, session)
  }

  $agentBoxSessions.set(merged)

  return result.items
}

export async function updateAgentBoxSession(
  client: WireV1Client,
  input: {
    displayName?: string
    expectedVersion: number
    pinned?: boolean
    sessionId: string
    workspaceId?: string
  },
  options: WireSessionCatalogOptions = {}
): Promise<SessionRecord> {
  const result = await client.call('sessions.update', {
    ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
    expectedVersion: input.expectedVersion,
    ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
    sessionId: asWireId(input.sessionId),
    ...(input.workspaceId ? { workspaceId: asWireId(input.workspaceId) } : {}),
    requestId: (options.createRequestId ?? defaultRequestId)()
  })

  upsertAgentBoxSession(result.session)

  return result.session
}

export async function archiveAgentBoxSession(
  client: WireV1Client,
  input: { expectedVersion: number; sessionId: string },
  options: WireSessionCatalogOptions = {}
): Promise<SessionRecord> {
  const result = await client.call('sessions.archive', {
    ...input,
    sessionId: asWireId(input.sessionId),
    requestId: (options.createRequestId ?? defaultRequestId)()
  })

  upsertAgentBoxSession(result.session)

  return result.session
}
