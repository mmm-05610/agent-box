import { useCallback, useRef } from 'react'

import { revealTreePane } from '@/components/pane-shell/tree/store'
import { getAllSessionMessages } from '@/hermes'
import { type ChatMessage, toChatMessages } from '@/lib/chat-messages'
import { requestGatewayForAgent } from '@/store/gateway'
import { clearNotifications, notify, notifyError } from '@/store/notifications'
import { ensureGatewayAgent, ensureGatewayProfile } from '@/store/profile'
import { $currentCwd, $messages, $sessions, setSessionOwnerHint } from '@/store/session'
import { holdSessionOwnerUntilForeground, openSessionTile, patchSessionTile } from '@/store/session-states'
import { setFreshDraftReady } from '@/store/session'
import { broadcastSessionsChanged } from '@/store/session-sync'
import { type SessionOwnerRoute, sessionOwnerRouteFromRow } from '@/store/session-request-router'
import { sessionRoute } from '../../../routes'
import type { SessionCreateResponse } from '@/types/hermes'
import { type Translations } from '@/i18n'
import { sessionContextDrift } from '../session-context-drift'
import {
  type BranchMessage,
  applyRuntimeInfo,
  cachedSessionRow,
  patchSessionWorkspace,
  resolveSessionProfile,
  resolveStoredSession,
  selectBranchMessages,
  sessionMatchesStoredId,
  toBranchMessages,
  upsertOptimisticSession
} from './utils'

import { type SessionActionsOptions } from './session-actions-options'
import { type ResumeSessionAction } from './resume-session'

const branchMessagesFingerprint = (messages: BranchMessage[]): string =>
  JSON.stringify(messages.map(({ content, role }) => [role, content]))

// Identity of one branch create, so a re-entered branch action (a retried
// renderer transition, a double right-click) rides the create already in
// flight instead of minting a second child. The OWNER is part of the identity:
// the same parent id served by two connections is two different sessions.
function branchCreateKey({
  branchCount,
  branchMessages,
  cwd,
  ownerRoute,
  parentStoredId,
  profile,
  sourceSessionId
}: {
  branchCount?: number
  branchMessages: BranchMessage[]
  cwd?: string
  ownerRoute?: SessionOwnerRoute
  parentStoredId: null | string
  profile?: null | string
  sourceSessionId: null | string
}): string {
  return JSON.stringify({
    branchCount: branchCount ?? null,
    connectionId: ownerRoute?.connectionId || null,
    cwd: cwd?.trim() || null,
    messages: sourceSessionId ? null : branchMessagesFingerprint(branchMessages),
    ownerProfile: ownerRoute?.profile || null,
    parentStoredId,
    profile: profile?.trim() || null,
    sourceSessionId
  })
}

/** Fork/branch child sessions off a parent transcript and publish them. */
export function useBranchActions(
  options: SessionActionsOptions,
  deps: { copy: Translations['desktop']; resumeSession: ResumeSessionAction }
) {
  const {
    activeSessionIdRef,
    busyRef,
    creatingSessionRef,
    ensureSessionState,
    getRouteToken,
    navigate,
    requestGateway,
    selectedStoredSessionIdRef,
    updateSessionState
  } = options
  const { copy, resumeSession } = deps
  const branchCreateFlightsRef = useRef(new Map<string, Promise<SessionCreateResponse>>())

  // Shared fork: create a child session seeded with `branchMessages`, linked to
  // `parentStoredId` so it nests under its parent, then open it as its own tab
  // and switch to it — the parent chat stays put (mirrors openNewSessionTile).
  const forkBranch = useCallback(
    async (
      branchMessages: BranchMessage[],
      sourceSessionId: null | string,
      parentStoredId: null | string,
      cwd?: string,
      profile?: null | string,
      branchCount?: number,
      ownerRoute?: SessionOwnerRoute
    ): Promise<boolean> => {
      creatingSessionRef.current = true

      try {
        // A branch belongs to its parent's OWNING backend. Two facets, and both
        // matter once more than one connection is configured:
        //
        // 1. PROFILE — passing `profile` on the create mirrors
        //    desktopSessionCreateParams/resumeSession: in app-global remote mode
        //    one backend serves every profile, so an omitted profile silently
        //    lands the branch on the launch (default) profile — the "session
        //    jumps between profiles after branching" bug.
        // 2. CONNECTION — a profile name alone does not identify a backend when
        //    several connections expose the same name. Routing on profile only
        //    sends session.create to whatever socket happens to be active, so
        //    branching a remote-owned parent from another connection creates the
        //    child on the wrong backend (or nowhere), while the optimistic
        //    sidebar row below still points at an id no backend owns — the
        //    "Couldn't load this session" strand. removeSession already routes
        //    by (connection, profile); this is the same ownership contract.
        //
        // An untagged parent keeps the historic profile-only path exactly.
        if (ownerRoute) {
          await ensureGatewayAgent(ownerRoute.connectionId, ownerRoute.profile)
        } else {
          await ensureGatewayProfile(profile)
        }

        const requestBranchGateway = <T>(method: string, params: Record<string, unknown>): Promise<T> =>
          ownerRoute
            ? requestGatewayForAgent<T>(ownerRoute.connectionId, ownerRoute.profile, method, params)
            : requestGateway<T>(method, params)

        // The owner is part of the identity: the same parent id on two
        // connections is two different sessions, so a route-blind key would
        // coalesce them onto one create.
        const createKey = branchCreateKey({
          branchCount,
          branchMessages,
          cwd,
          ownerRoute,
          parentStoredId,
          profile,
          sourceSessionId
        })

        let createFlight = branchCreateFlightsRef.current.get(createKey)

        // No title: the backend auto-names the branch from its parent's lineage.
        if (!createFlight) {
          createFlight = (
            sourceSessionId
              ? requestBranchGateway<SessionCreateResponse>('session.branch', {
                  session_id: sourceSessionId,
                  ...(branchCount !== undefined ? { count: branchCount } : {})
                })
              : requestBranchGateway<SessionCreateResponse>('session.create', {
                  cols: 96,
                  source: 'desktop',
                  ...(cwd && { cwd }),
                  ...(profile ? { profile } : {}),
                  messages: branchMessages.map(({ content, role }) => ({ content, role })),
                  ...(parentStoredId && { parent_session_id: parentStoredId })
                })
          ).catch(err => {
            // Drop the flight so a genuine retry re-issues the create; a
            // resolved flight is cleared once the child is fully published.
            branchCreateFlightsRef.current.delete(createKey)
            throw err
          })
          branchCreateFlightsRef.current.set(createKey, createFlight)
        }

        const branched = await createFlight

        const responseBranchMessages =
          sourceSessionId && branched.messages?.length ? toBranchMessages(toChatMessages(branched.messages)) : []

        const effectiveBranchMessages = responseBranchMessages.length ? responseBranchMessages : branchMessages
        const routedSessionId = branched.stored_session_id ?? branched.session_id
        const preview = effectiveBranchMessages.map(({ content }) => content).find(Boolean) ?? null

        // Record the exact owner and pin its socket THE MOMENT the create
        // returns, before the optimistic row / tile publication can lose a
        // race with the gateway pruner. A draft branch child exists only as a
        // runtime on the owning backend (the stored row lands on first turn),
        // so a prune in this gap orphan-reaps it and the tile enters the
        // resume→reclaim flicker loop (#93892 shape). Mirrors the two routed
        // creates at the top of this file.
        if (ownerRoute) {
          setSessionOwnerHint(routedSessionId, ownerRoute)
          holdSessionOwnerUntilForeground(routedSessionId, ownerRoute)
        }

        // Draft until submit: nest under the parent at the parent's recency so it
        // doesn't bubble to the top until a real message lands (backend persists
        // + auto-names it then). The selected row survives refreshes (sessionsToKeep).
        const rows = $sessions.get()
        const parent = parentStoredId ? rows.find(session => sessionMatchesStoredId(session, parentStoredId)) : null

        const siblings = parentStoredId
          ? rows.filter(session => session.parent_session_id?.trim() === parentStoredId).length
          : 0

        setFreshDraftReady(false)
        // Stamp the optimistic row with the branch's EXACT owner. Without it the
        // row inherits $activeGatewayProfile and carries no connection_id, so a
        // child correctly created on the parent's remote backend is listed as
        // belonging to whichever backend happens to be active. Every later
        // owner lookup off that row (resume, hydrate, prompt) then routes to the
        // wrong machine and the chat pane spins on a session that backend never
        // had — the create is right, the row is a lie. Mirrors the routed
        // creates at the top of this file, which already pass their route here.
        upsertOptimisticSession(
          branched,
          routedSessionId,
          copy.branchTitle(siblings + 1).toLowerCase(),
          preview,
          parentStoredId,
          parent ? parent.last_active || parent.started_at : undefined,
          ownerRoute ?? null
        )
        ensureSessionState(branched.session_id, routedSessionId)
        updateSessionState(
          branched.session_id,
          state => ({
            ...state,
            messages: effectiveBranchMessages.map(({ source }) => source),
            busy: false,
            awaitingResponse: false
          }),
          routedSessionId
        )

        const runtimeInfo = applyRuntimeInfo(branched.info, { foreground: false })
        patchSessionWorkspace(routedSessionId, runtimeInfo?.cwd)

        if (runtimeInfo) {
          updateSessionState(branched.session_id, state => ({ ...state, ...runtimeInfo }), routedSessionId)
        }

        // Only take over the main pane when the chat being branched is the one
        // already open there — branching a background/sidebar session must
        // not yank the user's current view away from what they're looking at
        // (the #69750 focus-stealing bug, reintroduced if this fires
        // unconditionally). resumeSession reuses the runtime warm-cached above
        // (ensureSessionState/updateSessionState) instead of an extra resume RPC.
        if (parentStoredId !== null && selectedStoredSessionIdRef.current === parentStoredId) {
          navigate(sessionRoute(routedSessionId), { replace: true })
          await resumeSession(routedSessionId)
        } else {
          // Carry the exact owner onto the tile: its persisted ownerRoute is
          // what pins the owning backend's socket in the gateway keep-set
          // (openTileGatewayScopes) for the tile's whole lifetime. Without it
          // a remote-owned branch child's tile pinned nothing, the pruner
          // closed the owner socket, the backend reaped the draft runtime,
          // and the tile looped resume→reclaim until the storm breaker
          // latched "Couldn't open this session".
          openSessionTile(routedSessionId, 'center', undefined, null, {
            ownerRoute,
            workspaceMode: 'sessions'
          })
          patchSessionTile(routedSessionId, { runtimeId: branched.session_id })
          revealTreePane(`session-tile:${routedSessionId}`)
        }

        branchCreateFlightsRef.current.delete(createKey)
        broadcastSessionsChanged()

        return true
      } catch (err) {
        notifyError(err, copy.branchFailed)

        return false
      } finally {
        window.setTimeout(() => {
          creatingSessionRef.current = false
        }, 0)
      }
    },
    [
      copy,
      creatingSessionRef,
      ensureSessionState,
      navigate,
      requestGateway,
      resumeSession,
      selectedStoredSessionIdRef,
      updateSessionState
    ]
  )

  // Branch the open chat — optionally from a specific message — off its live transcript.
  const branchCurrentSession = useCallback(
    async (messageId?: string): Promise<boolean> => {
      if (!activeSessionIdRef.current) {
        notify({ kind: 'warning', title: copy.nothingToBranch, message: copy.branchNeedsChat })

        return false
      }

      if (busyRef.current) {
        notify({ kind: 'warning', title: copy.sessionBusy, message: copy.branchStopCurrent })

        return false
      }

      const startingActiveSessionId = activeSessionIdRef.current
      const messages = $messages.get()
      const storedSessionId = selectedStoredSessionIdRef.current
      const startingRouteToken = getRouteToken()
      const startingCwd = $currentCwd.get().trim()

      // The live atom may be a compacted model projection. Read the durable
      // display projection before choosing the branch prefix so a whole-chat
      // branch does not inherit only the summary/tail. If the backend is
      // temporarily unavailable, retain the local snapshot and let the branch
      // RPC make its own authoritative read.
      let authoritativeMessages: ChatMessage[] | null = null
      const profile = await resolveSessionProfile(storedSessionId)

      // The open chat's exact owner, when its row carries a connection tag.
      // Same contract as branchStoredSession: the transcript read and the
      // branch RPC must both land on the backend that owns the parent, not on
      // whichever socket is active.
      const ownerRoute = storedSessionId ? sessionOwnerRouteFromRow(cachedSessionRow(storedSessionId)) : undefined

      if (storedSessionId) {
        try {
          const persisted = await getAllSessionMessages(storedSessionId, ownerRoute ?? profile)
          const hydrated = toChatMessages(persisted.messages)

          if (hydrated.length) {
            authoritativeMessages = hydrated
          }
        } catch {
          // The branch RPC has a backend-side display projection fallback.
        }
      }

      const drift = sessionContextDrift({
        startRouteToken: startingRouteToken,
        nowRouteToken: getRouteToken(),
        startSelectedStoredId: storedSessionId,
        nowSelectedStoredId: selectedStoredSessionIdRef.current
      })

      const runtimeChanged = activeSessionIdRef.current !== startingActiveSessionId
      const selectionChanged = selectedStoredSessionIdRef.current !== storedSessionId

      if (drift || runtimeChanged || selectionChanged) {
        console.warn('[branch-drift-abort]', drift ?? 'runtime-or-selection-changed', {
          phase: 'transcript-hydration'
        })

        return false
      }

      const branchMessages = selectBranchMessages(messages, authoritativeMessages, messageId)

      if (!branchMessages.length) {
        notify({ kind: 'warning', title: copy.nothingToBranch, message: copy.branchNoText })

        return false
      }

      clearNotifications()

      // The open chat's owning profile, NOT the picker's / launch profile —
      // /profile only retargets new chats, so a branch of an existing thread
      // must stay on that thread's backend (cache hit for an open session).
      return forkBranch(
        branchMessages,
        startingActiveSessionId,
        storedSessionId,
        startingCwd,
        profile,
        messageId ? branchMessages.length : undefined,
        ownerRoute
      )
    },
    [activeSessionIdRef, busyRef, copy, forkBranch, getRouteToken, selectedStoredSessionIdRef]
  )

  // Branch any listed session, not just the open one. Reads the target's stored
  // transcript directly (no resume/active-session dependency), so it works on
  // right-click and nests under its parent.
  const branchStoredSession = useCallback(
    async (storedSessionId: string, sessionProfile?: string | null): Promise<boolean> => {
      clearNotifications()

      // Right-clicking a session outside the paginated sidebar window is a cache
      // miss: resolve it (cache → active backend → cross-profile) so the branch
      // is created on the parent's OWNING profile, not whichever is live (#67603).
      // cachedSessionRow spans Recents, cron/messaging and the profile-scoped
      // project tree, and prefers the self-describing row — an ownerless legacy
      // Recents copy of the same id must not mask the row carrying the owner.
      const stored =
        cachedSessionRow(storedSessionId) ?? (sessionProfile ? undefined : await resolveStoredSession(storedSessionId))

      const profile = sessionProfile ?? stored?.profile

      // An exact owner from the parent row — connection AND profile. Undefined
      // for an untagged row, which keeps the ambient/profile-only path.
      const ownerRoute = sessionOwnerRouteFromRow(stored)

      try {
        if (ownerRoute) {
          await ensureGatewayAgent(ownerRoute.connectionId, ownerRoute.profile)
        } else {
          await ensureGatewayProfile(profile)
        }

        // Read the parent transcript from the backend that OWNS it. A bare
        // profile scope resolves against the active connection, which for a
        // foreign-owned parent holds no such session: the read comes back empty
        // and the branch aborts as "nothing to branch" before any create.
        const { messages } = await getAllSessionMessages(storedSessionId, ownerRoute ?? profile)
        const branchMessages = toBranchMessages(toChatMessages(messages))

        if (!branchMessages.length) {
          notify({ kind: 'warning', title: copy.nothingToBranch, message: copy.branchNoText })

          return false
        }

        return await forkBranch(
          branchMessages,
          null,
          stored?.id ?? storedSessionId,
          stored?.cwd?.trim(),
          profile,
          undefined,
          ownerRoute
        )
      } catch (err) {
        notifyError(err, copy.branchFailed)

        return false
      }
    },
    [copy, forkBranch]
  )

  return { branchCurrentSession, branchStoredSession, forkBranch }
}
