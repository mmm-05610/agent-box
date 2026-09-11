import { atom } from 'nanostores'

import type { ClientSessionState } from '@/app/types'

/** The inversion seam between tile UI and the wiring layer: the wiring owns
 *  the gateway + session cache and registers itself here. */
// ---------------------------------------------------------------------------
// Delegate — the wiring layer (which owns the gateway + session cache) plugs
// its actions in; tile UI calls through here. Same inversion as the tree
// store's pane closers.
// ---------------------------------------------------------------------------

export interface SessionTileDelegate {
  /** Archive a stored session (the sidebar's archive, incl. tile cleanup). */
  archiveSession(storedSessionId: string): Promise<void>
  /** Branch a stored session into a new chat (the sidebar's branch). */
  branchSession(storedSessionId: string): Promise<void>
  /** Delete a stored session (the sidebar's delete, incl. tile cleanup). */
  deleteSession(storedSessionId: string): Promise<void>
  /** Run a slash command against a tile's session (app-level effects — e.g.
   *  branch/handoff — act on the main surface, as they should). */
  executeSlash(rawCommand: string, sessionId: string): Promise<void>
  /** Interrupt a tile's running turn. */
  interruptSession(runtimeId: string): Promise<void>
  /** Drop the wiring cache's stored→runtime bindings. Called on gateway
   *  reconnect: a respawned backend re-mints runtime ids, so every binding
   *  recorded before the reconnect is suspect — without this, `resumeTile`'s
   *  warm path re-binds tiles to dead runtime ids (the sleep/wake "empty
   *  right pane" bug). Bindings re-record from live post-reconnect events. */
  invalidateRuntimeBindings?(preserveStoredSessionIds?: ReadonlySet<string>): void
  /** Bind a live runtime id for a stored session (resume without touching
   *  the main view). Returns the runtime id, or throws.
   *  `refreshTranscript` forces a REST merge even when a warm cached
   *  transcript already exists — reopen-after-idle must not paint the
   *  snapshot that was current when the panel last had a socket. */
  resumeTile(storedSessionId: string, options?: { refreshTranscript?: boolean }): Promise<string>
  /** Retire one runtime's busy/awaiting claim through the wiring cache
   *  (updateSessionState), so cache, focused view, busyRef, and tile mirrors
   *  settle together. Returns false when the cache holds no busy state for
   *  it — the caller downgrades the mirror itself. Reconnect-time twin of
   *  invalidateRuntimeBindings (#93059). */
  retireBusyClaim?(runtimeId: string): boolean
  /** Submit a prompt to a tile's live session. */
  submitToSession(runtimeId: string, text: string): Promise<void>
  /** THE session-state write path — routes through the wiring cache so the
   *  cache, the primary view (when active), and every tile mirror agree. */
  updateSession(runtimeId: string, updater: (state: ClientSessionState) => ClientSessionState): ClientSessionState
}

let delegate: SessionTileDelegate | null = null
export const $sessionTileDelegateRevision = atom(0)

export function setSessionTileDelegate(next: SessionTileDelegate) {
  delegate = next
  $sessionTileDelegateRevision.set($sessionTileDelegateRevision.get() + 1)
}

export function sessionTileDelegate(): SessionTileDelegate | null {
  return delegate
}
