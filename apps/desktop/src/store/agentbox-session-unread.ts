import { atom } from 'nanostores'

import type { SessionRecord } from '@/types/wire/wire-v1'

/**
 * Local visibility cursor for the product sidebar.
 *
 * The wire has no read/unread fact — no read cursor, no unread count — so
 * "unread" here can only mean what THIS window has seen: the `updatedAt` a
 * session carried the last time the user opened it from this sidebar. A
 * session the window has never opened is not marked unread (that would paint
 * the whole list on first launch and claim a fact the client does not have);
 * a session whose service record moved past that mark is. The UI labels the
 * mark as local for exactly this reason.
 *
 * In-memory by design: nothing here is service truth, and persisting it would
 * dress a window-local observation up as durable state.
 */
export const $agentBoxSessionSeenAt = atom<Record<string, string>>({})

/** Remember the revision the user has now seen. Called when a row opens. */
export function markAgentBoxSessionSeen(sessionId: string, updatedAt: string): void {
  const current = $agentBoxSessionSeenAt.get()

  if (current[sessionId] === updatedAt) {
    return
  }

  // Preserve reference identity for every other id: one row opening must not
  // re-render the whole list.
  $agentBoxSessionSeenAt.set({ ...current, [sessionId]: updatedAt })
}

/** True when this record moved past the revision this window last saw. */
export function agentBoxSessionUnread(
  session: Pick<SessionRecord, 'id' | 'updatedAt'>,
  seen: Readonly<Record<string, string>>
): boolean {
  const mark = seen[session.id]

  return mark !== undefined && mark !== session.updatedAt
}
