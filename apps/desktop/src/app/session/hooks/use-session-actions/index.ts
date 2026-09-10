import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { useI18n } from '@/i18n'
import { migrateSessionDraft } from '@/store/composer'
import { migrateQueuedPrompts } from '@/store/composer-queue'
import {
  $activeSessionStoredIdRotation,
  $sessions,
  resolveComposerSessionKey,
  setActiveSessionStoredIdRotation,
  setSelectedStoredSessionId
} from '@/store/session'

import { sessionRoute } from '../../../routes'

import { useBranchActions } from './branching'
import { useFreshSessionDraft } from './fresh-draft'
import { useResumeSession } from './resume-session'
import { type SessionActionsOptions } from './session-actions-options'
import { useSessionCreateActions } from './session-create'
import { useSessionNavigationActions } from './session-navigation-actions'
import { useSessionRemovalActions } from './session-removal-actions'

/** Composition root for the session surface's actions: wires the
 *  responsibility modules below into the single hook callers consume. */
export function useSessionActions(options: SessionActionsOptions) {
  const { t } = useI18n()
  const copy = t.desktop
  const { activeSessionIdRef, getRoutedStoredSessionId, navigate, selectedStoredSessionIdRef } = options

  // Follow auto-compression's stored-id rotation only while the exact runtime,
  // selection, and route intent still belong to the rotating conversation.
  // The previous implementation carried only the next stored id and navigated
  // unconditionally; a fast A → B → C switch could therefore be overwritten
  // by A's delayed session.info event and visibly jump back to A.
  const storedIdRotation = useStore($activeSessionStoredIdRotation)

  // eslint-disable-next-line no-restricted-syntax -- legitimate non-atom ref write (see eslint rule comment)
  useEffect(() => {
    if (!storedIdRotation) {
      return
    }

    // Consume the event even when it is stale. Rotation is an edge, not durable
    // state; replaying it after a later remount/selection would steal focus.
    setActiveSessionStoredIdRotation(current => (current === storedIdRotation ? null : current))

    const selectedStoredSessionId = selectedStoredSessionIdRef.current
    const routedStoredSessionId = getRoutedStoredSessionId()

    if (
      activeSessionIdRef.current !== storedIdRotation.runtimeSessionId ||
      selectedStoredSessionId !== storedIdRotation.previousStoredSessionId ||
      (routedStoredSessionId !== null && routedStoredSessionId !== storedIdRotation.previousStoredSessionId)
    ) {
      return
    }

    // Park unsent draft/queue on the durable lineage key (not the new tip).
    // ChatBar scopes composer state on resolveComposerSessionKey(); migrating
    // onto the tip while the composer is still bound to the root can lose newer
    // live editor text on a brief remount. If the new tip row is not in
    // $sessions yet, resolveComposerSessionKey falls back to the tip id — prefer
    // the previous id (usually the lineage root) in that gap.
    const previousId = storedIdRotation.previousStoredSessionId
    const nextId = storedIdRotation.nextStoredSessionId
    const sessions = $sessions.get()
    const resolvedNext = resolveComposerSessionKey(nextId, sessions)

    const durableKey =
      resolvedNext && resolvedNext !== nextId
        ? resolvedNext
        : (resolveComposerSessionKey(previousId, sessions) ?? previousId)

    migrateSessionDraft(previousId, durableKey)
    migrateSessionDraft(nextId, durableKey)
    migrateQueuedPrompts(previousId, durableKey)
    migrateQueuedPrompts(nextId, durableKey)

    setSelectedStoredSessionId(nextId)
    selectedStoredSessionIdRef.current = nextId

    // A route overlay/page has no routed session id, but the underlying selected
    // chat still needs to follow the continuation. Update that selection in
    // place without navigating out of the surface the user deliberately opened.
    if (routedStoredSessionId === previousId) {
      navigate(sessionRoute(nextId), { replace: true })
    }
  }, [activeSessionIdRef, getRoutedStoredSessionId, navigate, selectedStoredSessionIdRef, storedIdRotation])

  const startFreshSessionDraft = useFreshSessionDraft(options)
  const { createBackendSessionForSend, openNewSessionTile } = useSessionCreateActions(options, { copy })

  const { closeSettings, openSettings, selectSidebarItem } = useSessionNavigationActions(options, {
    startFreshSessionDraft
  })

  const resumeSession = useResumeSession(options, { copy, startFreshSessionDraft })

  const { branchCurrentSession, branchStoredSession, forkBranch } = useBranchActions(options, {
    copy,
    resumeSession
  })

  const { archiveSession, removeSession } = useSessionRemovalActions(options, {
    copy,
    startFreshSessionDraft
  })

  return {
    archiveSession,
    branchCurrentSession,
    branchStoredSession,
    closeSettings,
    createBackendSessionForSend,
    openNewSessionTile,
    openSettings,
    removeSession,
    resumeSession,
    selectSidebarItem,
    startFreshSessionDraft
  }
}
