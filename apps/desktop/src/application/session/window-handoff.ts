import { useEffect, useRef } from 'react'

import { openSession, type OpenSessionNavigate } from '@/application/session/open-session'
import { reloadPersistedDrafts, requestComposerDraftSync } from '@/store/composer'
import { watchHudState } from '@/store/hud'
import { $selectedStoredSessionId } from '@/store/session'
import { focusOpenSession, sessionTileDelegate } from '@/store/session-states'
import { isHudWindow } from '@/store/windows'

/**
 * Window-surface handoff — the application use cases behind showing ONE
 * session projection on several windows at once (the main window plus a
 * compact surface).
 *
 * Opening a second surface never transfers a session: the projection is shared,
 * not owned (see `docs/architecture/session-multi-surface-ownership.md`). What
 * remains here is plain multi-window coordination — which conversation each
 * window is showing, where the user's in-flight drafts live, and where the main
 * window should land when the compact surface closes. How a session's live
 * activity gets attached to a consuming window is a transport question and
 * arrives here only as the injected `adoptSession` callback from composition.
 */

/**
 * The main window takes the conversation back when the compact surface closes:
 * refresh the draft stash (the surface may have typed or sent since this window
 * last read it), land on the session the user was reading there, and let the
 * host adapter re-attach that session for this window.
 */
export interface SessionHandbackCallbacks {
  /** Where a session opens in the main window (composition supplies navigation). */
  navigate: OpenSessionNavigate
  /** Re-attach the session's live activity to THIS window (host adapter seam). */
  adoptSession: (storedSessionId: string) => unknown
}

export function useSessionHandback({ adoptSession, navigate }: SessionHandbackCallbacks): void {
  const callbacksRef = useRef({ adoptSession, navigate })
  callbacksRef.current = { adoptSession, navigate }

  useEffect(() => {
    // The compact surface's own renderer mounts the same wiring; it is the
    // window going away, so it has nothing to take back.
    if (isHudWindow()) {
      return
    }

    return watchHudState(closedSessionId => {
      // The surface may have typed or sent since this window last read the stash.
      reloadPersistedDrafts()

      const selected = $selectedStoredSessionId.get()
      const target = closedSessionId ?? selected

      // Somewhere other than the workspace pane. If it is an open tile, front
      // it and route the re-attach THROUGH the tile delegate: the ordinary
      // path enforces "a session is either main or a tile, never both" and
      // would close the tile to take it into main, quietly rearranging tabs
      // the user opened on purpose. Otherwise it's a session this window has
      // never seen — open it, and the opening flow attaches the session (and
      // loads its draft as the composer's scope swaps).
      if (target && target !== selected) {
        const delegate = focusOpenSession(target) === 'tile' ? sessionTileDelegate() : null

        if (delegate) {
          void delegate.resumeTile(target).catch(() => undefined)

          return
        }

        openSession(target, callbacksRef.current.navigate)

        return
      }

      // Same session, so the composer's scope never changes and its
      // per-session swap effect will never re-consult the stash. Repaint it.
      requestComposerDraftSync('reload')

      if (target) {
        void callbacksRef.current.adoptSession(target)
      }
    })
  }, [])
}

/**
 * Compact-surface side: follow a retarget. Asking for the surface from another
 * tab while it is already up switches the conversation showing in it.
 */
export function useSurfaceRetarget(
  subscribe: (handler: (sessionId: string) => void) => () => void,
  openSession: (sessionId: string) => void
): void {
  const openSessionRef = useRef(openSession)
  openSessionRef.current = openSession

  useEffect(() => subscribe(sessionId => openSessionRef.current(sessionId)), [subscribe])
}

/**
 * Compact-surface side: keep the host told which session this surface is on,
 * so the main window can land there when the surface closes.
 */
export function useSurfaceSessionReport(
  report: (sessionId: null | string) => void,
  sessionId: null | string,
  reporting: boolean
): void {
  useEffect(() => {
    if (reporting) {
      report(sessionId)
    }
  }, [report, reporting, sessionId])
}
