/**
 * The persisted read-state flag's STORE half — the atoms and the synchronous
 * state transitions behind the sidebar's "Mark as read / Mark as unread" toggle
 * and the automatic mark-read a session open performs.
 *
 * The sidebar's dot is fed by TWO sources (see session-dot-state.ts): the
 * runtime "turn finished in background" marker ($unreadFinishedSessionIds,
 * transient) and the backend's derived `unread` key (last_read_at watermark vs
 * last_active — survives restarts and is visible to every surface). This module
 * owns the LOCAL half of the second source: the optimistic row flip and the
 * write guard that keeps our value from being clobbered.
 *
 * The REQUEST half (PATCH /api/sessions/{id} → SessionDB.set_session_read, the
 * ack, the visible rollback) is a use case, so it lives in
 * `@/application/session-read-state` and is the only thing allowed to call this
 * module's mutators on a failure path. Nothing in here reaches the network.
 */
import { atom } from 'nanostores'

import { $sessions, setSessions } from './atoms'

/** How long a write we made outranks a list page that predates it. */
export const UNREAD_WRITE_GUARD_MS = 10_000

/** stored id -> the value we wrote and when. Guarded rows outrank list pages. */
export const $unreadWriteGuard = atom<Map<string, { at: number; value: boolean }>>(new Map())

/** ARM the guard before a write: our value must outrank any list page already
 *  in flight when the PATCH lands (a page issued before the write carries the
 *  OLD value and would otherwise silently undo the user's click — #74570
 *  pattern, same as session-pin-sync.ts). */
export function guardUnreadWrite(storedId: string, value: boolean): void {
  const guard = new Map($unreadWriteGuard.get())

  guard.set(storedId, { at: Date.now(), value })
  $unreadWriteGuard.set(guard)
}

/** RELEASE the guard: the write failed (roll back) or a list page confirmed the
 *  value we wrote. The guard is per-row, so a release never disturbs the others. */
export function releaseUnreadWrite(storedId: string): void {
  const guard = $unreadWriteGuard.get()

  if (!guard.has(storedId)) {
    return
  }

  const next = new Map(guard)

  next.delete(storedId)
  $unreadWriteGuard.set(next)
}

/** The row a bare stored id refers to, or undefined for a runtime-only session
 *  (a brand-new chat with no persisted row yet — nothing to flag). */
export function sessionRowById(storedId: string) {
  return $sessions.get().find(row => row.id === storedId)
}

/** Paint one row's persisted flag. The ONE write shape for `unread` on a list
 *  row, used by the optimistic flip and by its rollback. Purely local. */
export function setStoredSessionUnread(storedId: string, unread: boolean): void {
  setSessions(rows => rows.map(row => (row.id === storedId ? { ...row, unread } : row)))
}

/** Release guard entries once a list page confirms the value we wrote. Call
 *  once at boot, next to watchSessionPins(). Store-only reconciliation: the
 *  page is the backend's answer, so a matching row means our write is the
 *  truth and nothing needs fencing any more. */
export function watchUnreadWriteGuard(): void {
  $sessions.listen(rows => {
    const guard = $unreadWriteGuard.get()
    let changed = false

    for (const [id, entry] of guard) {
      const row = rows.find(r => r.id === id)

      if (row && row.unread === entry.value) {
        guard.delete(id)
        changed = true
      }
    }

    if (changed) {
      $unreadWriteGuard.set(new Map(guard))
    }
  })
}
