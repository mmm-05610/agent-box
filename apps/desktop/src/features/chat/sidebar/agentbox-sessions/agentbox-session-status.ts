import type { WireSessionProjection } from '@/application/session/wire-session-projection'
import type { SessionRecord } from '@/types/wire/wire-v1'

/** The service's own states for "this session has work in flight" — the same
 *  set the composer's busy gate reads (`agentbox-main-chat.ts`). `unknown` is
 *  included deliberately: it is not `failed`, and the service has not said the
 *  turn ended. */
const RUNNING_EXECUTION_STATES: ReadonlySet<
  NonNullable<WireSessionProjection['execution']>['state']
> = new Set(['queued', 'dispatched', 'running', 'stopping', 'unknown'])

export interface AgentBoxSessionStatusInput {
  /** This window's local seen-cursor for the row's id. */
  seenAt: string | undefined
  session: Pick<SessionRecord, 'archivedAt' | 'id' | 'updatedAt'>
  /** The service projection for this session, when the window holds one. */
  projection: undefined | WireSessionProjection
}

export interface AgentBoxSessionStatus {
  /** The service has an execution in flight for this session. */
  running: boolean
  /** Moved past the revision this window last opened (local fact, labelled). */
  unread: boolean
}

/**
 * What the sidebar may show about one AgentBox session, derived only from
 * facts that exist: the service projection's execution state (running), the
 * service record itself (archived), and this window's own read cursor (unread,
 * always labelled local). Anything the record does not carry — model, tokens,
 * branch, profile, unread counts — is not derived here and not shown.
 */
export function agentBoxSessionStatus({ projection, seenAt, session }: AgentBoxSessionStatusInput): AgentBoxSessionStatus {
  const execution = projection?.execution ?? null

  return {
    running: session.archivedAt === null && Boolean(execution && RUNNING_EXECUTION_STATES.has(execution.state)),
    unread: session.archivedAt === null && seenAt !== undefined && seenAt !== session.updatedAt
  }
}
