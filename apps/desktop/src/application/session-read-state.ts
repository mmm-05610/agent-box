/**
 * Session read-state use cases: the ONE place where "this session is (un)read"
 * is composed out of the store and the backend.
 *
 * `api/sessions.ts` can only send the PATCH, and the session store may only
 * hold state — but the row menu's read/unread toggle and the automatic
 * mark-read a session open performs are each a small workflow that needs BOTH:
 * paint the row immediately, tell the backend, and put the row back when the
 * backend says no. That composition is an application use case, so it lives
 * here, and the store stays a pure front-end state store.
 *
 * Optimistic, then honest (AGENTS.md): paint the row immediately, PATCH the
 * backend, roll back visibly on failure. A list page already in flight when we
 * PATCH can land after the ack carrying the OLD value — the write guard lets our
 * value outrank that stale page briefly (#74570 pattern). The guard itself is
 * store state, so it is established and released through `store/session/unread`.
 */
import { setSessionUnreadRemote } from '@/api/sessions'
import { markSessionRead, setSelectedStoredSessionId } from '@/store/session'
import {
  guardUnreadWrite,
  releaseUnreadWrite,
  sessionRowById,
  setStoredSessionUnread
} from '@/store/session/unread'

/**
 * Toggle the persisted unread flag (the row menu's "Mark as read" / "Mark as
 * unread"): optimistic row update, then PATCH, then roll back visibly if the
 * write fails. No-op for runtime-only sessions (a brand-new chat with no
 * persisted row yet — there is nothing to flag).
 *
 * A FAILED WRITE IS NOT SWALLOWED: the caller owns the error surface (the
 * sidebar toasts it), so this rethrows the typed API error after rolling back.
 */
export async function markSessionUnread(storedId: string, unread: boolean): Promise<void> {
  const row = sessionRowById(storedId)

  if (!row) {
    return
  }

  guardUnreadWrite(storedId, unread)
  setStoredSessionUnread(storedId, unread)

  try {
    // The owning profile rides the PATCH body: a remote/foreign profile's
    // toggle must land on ITS state.db, not the ambient one.
    await setSessionUnreadRemote(storedId, unread, row.profile)
  } catch (err) {
    // Roll back visibly: the backend kept the old value.
    releaseUnreadWrite(storedId)
    setStoredSessionUnread(storedId, !unread)
    throw err
  }
}

/** Opening a session clears its persisted unread flag (auto-mark-read).
 *  Best-effort: a failed PATCH is healed by the next honest refresh, so the
 *  dot simply returns until then rather than blocking the open on the wire. */
async function clearPersistedUnreadOnOpen(storedId: string): Promise<void> {
  const row = sessionRowById(storedId)

  if (!row || row.unread !== true) {
    return
  }

  try {
    await markSessionUnread(storedId, false)
  } catch {
    // Ignore: see above — a refresh reconciles the dot.
  }
}

/** Record that the user is now LOOKING at this session: retire the local
 *  finished-unread family (dot + read baseline) and clear the backend's
 *  read-state watermark, best-effort.
 *
 *  For an open/focus that does not move the selection (a tile, a route that
 *  already holds it). `openSession` runs this BEFORE its focus short-circuits,
 *  so re-clicking an already-visible session still clears its dot. */
export function markStoredSessionViewed(storedId: string): void {
  markSessionRead(storedId)
  void clearPersistedUnreadOnOpen(storedId)
}

/** Select a stored session BECAUSE the user is now viewing it — the store
 *  setter plus the read-state half above.
 *
 *  Only for a selection that means "this conversation is on screen": a resume
 *  that paints the transcript, a brand-new chat the user lands in, a rollback
 *  that restores the chat they were reading. A selection that is merely a
 *  reset, or that points at something nobody is looking at, must keep calling
 *  the store setter — marking those read is the bug this split exists to
 *  prevent. */
export function selectStoredSessionForViewing(storedId: string): void {
  setSelectedStoredSessionId(storedId)
  markStoredSessionViewed(storedId)
}
