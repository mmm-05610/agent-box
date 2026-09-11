import { useCallback } from 'react'

import { selectStoredSessionForViewing } from '@/application/session-read-state'
import { deleteSession, setSessionArchived } from '@/hermes'
import { type Translations } from '@/i18n'
import { clearQueuedPrompts } from '@/store/composer-queue'
import { $pinnedSessionIds } from '@/store/layout'
import { clearNotifications, notify, notifyError } from '@/store/notifications'
import { $profiles } from '@/store/profile'
import {
  sessionPinId,
  setActiveSessionId,
  setFreshDraftReady,
  setMessages
} from '@/store/session'
import { $messages } from '@/store/session'
import { clearSessionControl } from '@/store/session-control'
import { beginSessionMutation, endSessionMutation, tombstoneSessions, untombstoneSessions } from '@/store/session-removal'
import { requestForSessionProfile, type SessionOwnerScope } from '@/store/session-request-router'
import { closeSessionTile, dropSessionState } from '@/store/session-states'
import { forgetSessionUnread } from '@/store/session-unread'
import { $archivedSessions } from '@/store/sidebar-archive'
import { dropTranscriptTailEverywhere } from '@/store/transcript-tail-cache'

import { sessionRoute } from '../../../routes'

import { type FreshSessionDraftStarter } from './fresh-draft'
import { type SessionActionsOptions } from './session-actions-options'
import { applyStoredUsage } from './usage-mirror'
import {
  dropListedSession,
  findListedSession,
  resolveSessionProfile,
  restoreListedSession,
  sessionMatchesStoredId
} from './utils'

/** Remove (delete) and archive flows for a stored session. */
export function useSessionRemovalActions(
  options: SessionActionsOptions,
  deps: { copy: Translations['desktop']; startFreshSessionDraft: FreshSessionDraftStarter }
) {
  const {
    activeSessionIdRef,
    navigate,
    requestGateway,
    runtimeIdByStoredSessionIdRef,
    selectedStoredSessionIdRef,
    sessionStateByRuntimeIdRef
  } = options

  const { copy, startFreshSessionDraft } = deps

  const removeSession = useCallback(
    async (storedSessionId: string) => {
      clearNotifications()

      // The row may live in the main list, the messaging/cron sidebar slices,
      // OR the archived view's own store (archived rows are excluded from
      // $sessions by design). Resolve from all of them so deleting a
      // messaging/cron row (or from the Archived filter) evicts the row
      // instead of leaving a ghost that resumes into a dead id.
      const listed = findListedSession(storedSessionId)

      const removed =
        listed?.session ?? $archivedSessions.get().find(session => sessionMatchesStoredId(session, storedSessionId))

      // Messaging/cron rows frequently arrive without an inline profile; fall
      // back to the stored-session ownership lookup so their DELETE routes to
      // the owning profile instead of the ambient one.
      const stampedProfile = removed?.profile?.trim()
      const profile = stampedProfile || (await resolveSessionProfile(storedSessionId))

      // Listed profile-less row + multiple profiles + unresolved owner:
      // never fall through to the primary backend (fake already_absent).
      if (
        listed &&
        !stampedProfile &&
        !profile?.trim() &&
        $profiles.get().filter(item => item.name.trim()).length > 1
      ) {
        notifyError(new Error('Session ownership could not be resolved'), copy.deleteFailed)

        return
      }

      // Selection and runtime refs are updated synchronously at routing
      // boundaries. React props can still describe the previous render when a
      // delete lands in the same tick, which used to leave the doomed route in
      // place and let the generic 4001 recovery rebind it.
      const wasSelected = selectedStoredSessionIdRef.current === storedSessionId
      const closingRuntimeId = wasSelected ? activeSessionIdRef.current : null
      const previousMessages = $messages.get()
      const previousPinned = $pinnedSessionIds.get()

      const removedOwner: SessionOwnerScope = removed?.connection_id
        ? {
            connectionId: removed.connection_id,
            profile: removed.profile || 'default'
          }
        : profile

      const previousArchived = $archivedSessions.get()
      // Pins are keyed on the durable lineage-root id; the stored id may be the
      // live tip after compression. Drop both so the pin can't linger.
      const removedPinId = removed ? sessionPinId(removed) : storedSessionId
      const removedIds = [storedSessionId, removed?.id, removed?._lineage_root_id]

      dropListedSession(storedSessionId)
      $archivedSessions.set(previousArchived.filter(session => !sessionMatchesStoredId(session, storedSessionId)))
      // Evict from the project tree's optimistic layer too (the backend snapshot
      // still lists it until its next refresh), so grouped + flat views drop the
      // row in lockstep. Pin the tombstone against the projects.tree prune while
      // the delete RPC is in flight, so a racing refresh can't flash it back.
      tombstoneSessions(removedIds)
      beginSessionMutation(removedIds)
      $pinnedSessionIds.set(previousPinned.filter(id => id !== storedSessionId && id !== removedPinId))

      // Tear down before awaiting so the route effect can't resume the
      // doomed session via the stale /<sid> URL.
      if (wasSelected) {
        startFreshSessionDraft(true)
      }

      try {
        if (closingRuntimeId) {
          await requestForSessionProfile(removedOwner, requestGateway, 'session.close', {
            session_id: closingRuntimeId
          }).catch(() => undefined)
        }

        await deleteSession(storedSessionId, removedOwner)

        dropTranscriptTailEverywhere(storedSessionId)
        // Only after the RPC lands — the optimistic eviction above can roll
        // back, and a rolled-back row must keep its watermark/marker.
        forgetSessionUnread(removedIds, profile)
        clearQueuedPrompts(storedSessionId)

        if (closingRuntimeId) {
          clearQueuedPrompts(closingRuntimeId)
          clearSessionControl(closingRuntimeId)
        }

        // A tiled copy of this session must not outlive it: collapse the pane
        // and evict its mirrored runtime state so nothing submits to (or renders)
        // a deleted session.
        const tiledRuntimeId = runtimeIdByStoredSessionIdRef.current.get(storedSessionId)
        closeSessionTile(storedSessionId)

        if (tiledRuntimeId) {
          runtimeIdByStoredSessionIdRef.current.delete(storedSessionId)
          sessionStateByRuntimeIdRef.current.delete(tiledRuntimeId)
          dropSessionState(tiledRuntimeId)
        }
      } catch (err) {
        if (listed?.session) {
          restoreListedSession(listed.session, listed.slice)
        }

        // Restore the archived-view row too (no-op when it wasn't archived).
        $archivedSessions.set(previousArchived)

        untombstoneSessions(removedIds)
        $pinnedSessionIds.set(previousPinned)

        if (wasSelected) {
          setFreshDraftReady(false)
          selectStoredSessionForViewing(storedSessionId)
          selectedStoredSessionIdRef.current = storedSessionId
          const stored = findListedSession(storedSessionId)?.session

          if (stored) {
            applyStoredUsage(stored)
          }

          setMessages(previousMessages)
          navigate(sessionRoute(storedSessionId), { replace: true })

          if (closingRuntimeId) {
            setActiveSessionId(closingRuntimeId)
            activeSessionIdRef.current = closingRuntimeId
          }
        }

        notifyError(err, copy.deleteFailed)
      } finally {
        // Release the tombstone to the normal projects.tree prune now the RPC has
        // settled (kept on success — the backend has deleted it; cleared on the
        // rollback above on failure).
        endSessionMutation(removedIds)
      }
    },
    [
      activeSessionIdRef,
      copy,
      navigate,
      requestGateway,
      runtimeIdByStoredSessionIdRef,
      selectedStoredSessionIdRef,
      sessionStateByRuntimeIdRef,
      startFreshSessionDraft
    ]
  )

  const archiveSession = useCallback(
    async (storedSessionId: string) => {
      clearNotifications()

      const listed = findListedSession(storedSessionId)
      const archived = listed?.session
      const stampedProfile = archived?.profile?.trim()
      const profile = stampedProfile || (await resolveSessionProfile(storedSessionId))

      if (
        listed &&
        !stampedProfile &&
        !profile?.trim() &&
        $profiles.get().filter(item => item.name.trim()).length > 1
      ) {
        notifyError(new Error('Session ownership could not be resolved'), copy.archiveFailed)

        return
      }

      const wasSelected = selectedStoredSessionIdRef.current === storedSessionId
      const previousPinned = $pinnedSessionIds.get()
      // Pins are keyed on the durable lineage-root id; the stored id may be the
      // live tip after compression. Drop both so the pin can't linger.
      const archivedPinId = archived ? sessionPinId(archived) : storedSessionId
      const archivedIds = [storedSessionId, archived?.id, archived?._lineage_root_id]

      // Soft-hide: drop from every sidebar slice immediately, keep the data.
      dropListedSession(storedSessionId)
      tombstoneSessions(archivedIds)
      beginSessionMutation(archivedIds)
      $pinnedSessionIds.set(previousPinned.filter(id => id !== storedSessionId && id !== archivedPinId))

      if (wasSelected) {
        startFreshSessionDraft(true)
      }

      try {
        await setSessionArchived(storedSessionId, true, profile)
        // Archived rows never reach the sidebar, so their persisted unread can
        // only rot. Dropped after the RPC so a failed archive keeps it.
        forgetSessionUnread(archivedIds, profile)
        // An archived session is hidden from the sidebar; its tile must go too.
        const tiledRuntimeId = runtimeIdByStoredSessionIdRef.current.get(storedSessionId)
        closeSessionTile(storedSessionId)

        if (tiledRuntimeId) {
          runtimeIdByStoredSessionIdRef.current.delete(storedSessionId)
          sessionStateByRuntimeIdRef.current.delete(tiledRuntimeId)
          dropSessionState(tiledRuntimeId)
        }

        notify({ durationMs: 2_000, kind: 'success', message: copy.archived })
      } catch (err) {
        if (archived) {
          restoreListedSession(archived, listed?.slice)
        }

        untombstoneSessions(archivedIds)
        $pinnedSessionIds.set(previousPinned)
        notifyError(err, copy.archiveFailed)
      } finally {
        endSessionMutation(archivedIds)
      }
    },
    [
      copy,
      runtimeIdByStoredSessionIdRef,
      selectedStoredSessionIdRef,
      sessionStateByRuntimeIdRef,
      startFreshSessionDraft
    ]
  )

  return { archiveSession, removeSession }
}
