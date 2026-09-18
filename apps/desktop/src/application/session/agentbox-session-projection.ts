import type { SessionRecord } from '@/types/wire/wire-v1'

/**
 * The sidebar projection of the service's SessionRecords for ONE workspace.
 * Pure filter + sort over the renderer's session cache — it invents nothing
 * (no model, cost, tokens, branch, unread or profile name) and it never reads
 * a legacy Hermes row: a service record that has not arrived is an honest
 * empty/loading state, not a substitute.
 *
 * Order is the service's own facts: pinned first, then newest activity
 * (`updatedAt`, an ISO instant so string order is time order), with the
 * session id as the stable tie-break so equal stamps never reshuffle.
 */
export function projectAgentBoxSessionsForWorkspace(
  sessions: Readonly<Record<string, SessionRecord>>,
  workspaceId: string
): SessionRecord[] {
  const pinned: SessionRecord[] = []
  const recent: SessionRecord[] = []

  for (const session of Object.values(sessions)) {
    if (session.workspaceId !== workspaceId || session.archivedAt !== null) {
      continue
    }

    ;(session.pinned ? pinned : recent).push(session)
  }

  const newestFirst = (a: SessionRecord, b: SessionRecord) => {
    const byUpdatedAt = b.updatedAt.localeCompare(a.updatedAt)

    return byUpdatedAt !== 0 ? byUpdatedAt : a.id.localeCompare(b.id)
  }

  pinned.sort(newestFirst)
  recent.sort(newestFirst)

  return [...pinned, ...recent]
}
