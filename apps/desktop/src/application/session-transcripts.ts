/**
 * Transcript use-cases that span the session REST surface and the renderer's
 * own state: the tail hydration every caller actually makes, and the read-only
 * stored-transcript probe across registered backends.
 *
 * `api/sessions.ts` can only return a page. Deciding what that page implies for
 * "Show earlier" is a store write, and walking the Connection Registry to find
 * which backend holds a transcript needs the registry — both are composition,
 * so both live here.
 */
import { getApiRequestConnection, type ProfileScope } from '@/api/client'
import { fetchLatestSessionMessages } from '@/api/sessions'
import { $connectionsRegistry } from '@/store/connection-registry-state'
import { recordTranscriptTail } from '@/store/transcript-tail'
import type { SessionMessagesResponse } from '@/types/hermes'

/**
 * The initial hydration page, plus the tail bookkeeping "Show earlier" reads.
 *
 * Recording is keyed under BOTH the requested id and the resolved id, because
 * callers hold either: an unknown id (a prefix, an alias) resolves to a stored
 * session id on the way back.
 */
export async function getLatestSessionMessages(
  id: string,
  profile?: ProfileScope
): Promise<SessionMessagesResponse> {
  const page = await fetchLatestSessionMessages(id, profile)

  recordTranscriptTail(id, page, profile)

  if (page.session_id && page.session_id !== id) {
    recordTranscriptTail(page.session_id, page, profile)
  }

  return page
}

/**
 * READ-ONLY stored-transcript lookup that never routes a live session
 * (#94724 no-owner recovery). Tries the ambient/primary store first, then
 * probes every registered NON-local connection by id — a REST read of a
 * backend's own state.db is side-effect free (a miss is a plain 404, no
 * session is minted or resumed anywhere), so probing across backends is safe
 * where live routing would be a guess. Returns null when no reachable
 * backend holds the transcript.
 */
export async function fetchStoredTranscriptAcrossBackends(id: string): Promise<SessionMessagesResponse | null> {
  try {
    return await getLatestSessionMessages(id)
  } catch {
    // Not on the ambient store — probe the registered backends below.
  }

  const connections = ($connectionsRegistry.get()?.connections ?? []) as Array<{ id?: string }>

  for (const connection of connections) {
    const connectionId = connection.id?.trim()

    if (!connectionId || connectionId === 'local' || connectionId === getApiRequestConnection()) {
      continue
    }

    try {
      return await getLatestSessionMessages(id, { connectionId, profile: 'default' })
    } catch {
      // Not on this backend (or it is unreachable); try the next.
    }
  }

  return null
}
