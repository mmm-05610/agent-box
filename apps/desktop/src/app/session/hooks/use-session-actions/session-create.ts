import { useCallback } from 'react'

import { ensureGatewayAgent } from '@/application/profile/gateway-routing'
import { resolveNewChatOwnerRoute } from '@/application/profile/new-session'
import { ensureGatewayProfile } from '@/application/profile/runtime-selection'
import { selectStoredSessionForViewing } from '@/application/session-read-state'
import { type Translations } from '@/i18n'
import { setSessionYolo } from '@/lib/yolo-session'
import { requestGatewayForAgent, retainGatewayForAgent } from '@/store/gateway'
import { notify, notifyError } from '@/store/notifications'
import { revealTreePane } from '@/store/pane-shell/tree'
import { $activeGatewayProfile, $newChatProfile, type AgentProfileRoute, normalizeProfileKey } from '@/store/profile'
import { $projectScope, resolveNewSessionCwd } from '@/store/projects'
import { NO_PROJECT_ID } from '@/store/projects/membership'
import {
  $currentCwd,
  $currentFastMode,
  $currentModel,
  $currentProvider,
  $currentReasoningEffort,
  $newChatWorkspaceTarget,
  $yoloActive,
  getCurrentModelSource,
  setActiveSessionId,
  setCurrentCwdTransient,
  setFreshDraftReady,
  setNewChatWorkspaceTarget,
  setSelectedStoredSessionId,
  setSessionOwnerHint,
  setSessionStartedAt,
  setWorkspaceCwdOwner
} from '@/store/session'
import {
  holdSessionOwnerUntilForeground,
  openSessionTile,
  patchSessionTile,
  type SessionTileWorkspaceScope,
  type TileDock
} from '@/store/session-states'
import { releaseSessionOwnerHold } from '@/store/session-states'
import { broadcastSessionsChanged } from '@/store/session-sync'
import type { SessionCreateResponse } from '@/types/hermes'

import { sessionRoute } from '../../../routes'
import { sessionContextDrift } from '../session-context-drift'

import { markSessionCreatedThisRun } from './created-this-run'
import { type SessionActionsOptions } from './session-actions-options'
import { applyRuntimeInfo, upsertOptimisticSession } from './utils'

export // `session.create` params from the current profile + sticky-UI model/effort/fast,
// ensuring the gateway is on that profile first. Shared by the primary send path
// and the "open in split" tile path; `cwd` is the one thing that differs (the
// live composer cwd for a send, the resolved new-session cwd for a fresh tile).
//
// Resolving null profile to the active gateway's is load-bearing: in global-remote
// mode one backend serves every profile, so an omitted profile silently lands the
// chat on the launch (default) profile — the "rubberbands back to default" bug.
// A no-op for single-profile/local-pooled users (a backend resolves its own launch
// profile to None). Effort/fast still ride as per-session overrides. Model and
// provider only ride when the composer source is 'manual' — a default-sourced
// value is a mirror of Settings → Model and must not pin the new chat.
async function desktopSessionCreateParams(
  cwd: string,
  capturedRoute = resolveNewChatOwnerRoute()
): Promise<Record<string, unknown>> {
  // Treat Send as the linearization point for the visible selector state. The
  // profile handshake below can yield long enough for background config/model
  // refreshes to finish; reading atoms afterward would silently create the
  // session with a different selection than the one the user submitted.
  // Settings → Model while a session is live leaves $currentModel painted with
  // the live agent (applySavedMainModel) and only flips the source to 'default'.
  // Shipping that stale value as an override pins every new chat to the old
  // model. Omit model/provider unless the source is 'manual'.
  const isManualSelection = getCurrentModelSource() === 'manual'

  const selection = {
    effort: $currentReasoningEffort.get().trim(),
    fast: $currentFastMode.get(),
    model: isManualSelection ? $currentModel.get().trim() : '',
    provider: isManualSelection ? $currentProvider.get().trim() : ''
  }

  const profile = capturedRoute?.profile || $newChatProfile.get() || normalizeProfileKey($activeGatewayProfile.get())

  if (capturedRoute) {
    await ensureGatewayAgent(capturedRoute.connectionId, profile)
  } else {
    await ensureGatewayProfile(profile)
  }

  return {
    cols: 96,
    source: 'desktop',
    ...(cwd && { cwd }),
    ...(profile ? { profile: capturedRoute?.targetProfile || profile } : {}),
    ...(selection.model
      ? { model: selection.model, ...(selection.provider ? { provider: selection.provider } : {}) }
      : {}),
    ...(selection.effort ? { reasoning_effort: selection.effort } : {}),
    fast: selection.fast
  }
}

/** Create backend sessions: the primary send path and the split-tile path. */
export function useSessionCreateActions(
  options: SessionActionsOptions,
  deps: { copy: Translations['desktop'] }
) {
  const {
    activeSessionIdRef,
    creatingSessionRef,
    ensureSessionState,
    getRouteToken,
    navigate,
    requestGateway,
    resetViewSync,
    selectedStoredSessionIdRef,
    updateSessionState
  } = options

  const { copy } = deps

  const createBackendSessionForSend = useCallback(
    async (preview: string | null = null): Promise<string | null> => {
      const startingStoredSessionId = selectedStoredSessionIdRef.current
      const startingRouteToken = getRouteToken()

      creatingSessionRef.current = true

      try {
        // An explicit one-shot workspace target (null → detached, string → that
        // folder) wins; otherwise the live cwd, then the project-aware default
        // (resolveNewSessionCwd — a project's new session keeps its repo cwd).
        // Home is an explicit detached scope: do not let a stale live cwd from
        // the previously selected project leak into this new session (#84220).
        const workspaceTarget = $newChatWorkspaceTarget.get()
        const homeScope = $projectScope.get() === NO_PROJECT_ID

        const cwd =
          workspaceTarget === null || (workspaceTarget === undefined && homeScope)
            ? ''
            : typeof workspaceTarget === 'string'
              ? workspaceTarget.trim()
              : $currentCwd.get().trim() || resolveNewSessionCwd()

        // The EXACT owner for this create: an explicit agent route, else the
        // (registry source, profile) pair the draft was made on. Read ONCE at
        // the send linearization point and threaded through the create RPC,
        // the owner hint, the optimistic row and the failure cleanup, so the
        // profile-rail path (selectProfile clears $newChatRoute) can no longer
        // reduce the owner to a bare profile name that later RPCs dial on a
        // different socket than the one that minted the runtime.
        const capturedRoute = resolveNewChatOwnerRoute()
        const params = await desktopSessionCreateParams(cwd, capturedRoute)

        // Lease the owner socket for the whole create → owner-publication
        // sequence (#93602 primitive). The per-request lease inside
        // requestGatewayForAgent ends when session.create returns; the
        // foreground hold below takes over from that point until the created
        // chat is selected. Between the two, nothing may close the socket
        // that just minted the runtime.
        const releaseCreateLease = capturedRoute
          ? await retainGatewayForAgent(capturedRoute.connectionId, capturedRoute.profile)
          : () => undefined

        let created: SessionCreateResponse
        let stored: null | string

        try {
          created = capturedRoute
            ? await requestGatewayForAgent<SessionCreateResponse>(
                capturedRoute.connectionId,
                capturedRoute.profile,
                'session.create',
                params
              )
            : await requestGateway<SessionCreateResponse>('session.create', params)

          stored = created.stored_session_id ?? null

          // Record the EXACT owner the moment a routed create returns a stored
          // id — before the drift check, the optimistic row, navigation, or any
          // session-scoped RPC can resolve this session's owner. The route is
          // the only authority: in All-profiles / Bot routing the ambient
          // $activeGatewayProfile stays on `default` while the session lives on
          // `capturedRoute` (e.g. local::omar). Without this hint the optimistic
          // row (stamped from ambient) was the only owner record, so the first
          // turn ran on omar and every later session-scoped RPC resolved the row
          // as `default` and 4001'd "session not found".
          if (stored && capturedRoute) {
            setSessionOwnerHint(stored, capturedRoute)
            // Pin the owner socket until the foreground publication (route →
            // $selectedStoredSessionId) covers it, so a prune or lease release
            // in that gap cannot close the runtime before the first prompt.
            holdSessionOwnerUntilForeground(stored, capturedRoute)
          }
        } finally {
          releaseCreateLease()
        }

        // Only a genuine move to a DIFFERENT chat mid-create should orphan the
        // session we just minted. The active runtime ref is deliberately not a
        // prong: background gateway events retarget it while other sessions
        // stream (#47709 class), and the seconds-long session.create round-trip
        // (server-side agent + MCP init) makes that churn near-certain — every
        // genuine user switch retargets selection AND route synchronously
        // anyway. submitTargetStoredId is the just-created stored session, so
        // our own upcoming re-home onto it never reads as drift.
        const drift = sessionContextDrift({
          startRouteToken: startingRouteToken,
          nowRouteToken: getRouteToken(),
          startSelectedStoredId: startingStoredSessionId,
          nowSelectedStoredId: selectedStoredSessionIdRef.current,
          submitTargetStoredId: stored
        })

        if (drift) {
          console.warn('[submit-drift-abort]', drift, { phase: 'mid-create' })

          // Close on the backend that minted the session: the ambient socket
          // is a different machine/profile for a routed create and would
          // 4001 while the orphan lives on (and later ws-orphan-reaps) there.
          const closeCreated = capturedRoute
            ? requestGatewayForAgent(capturedRoute.connectionId, capturedRoute.profile, 'session.close', {
                session_id: created.session_id
              })
            : requestGateway('session.close', { session_id: created.session_id })

          await closeCreated.catch(() => undefined)

          if (stored) {
            releaseSessionOwnerHold(stored)
          }

          return null
        }

        resetViewSync()
        activeSessionIdRef.current = created.session_id
        selectedStoredSessionIdRef.current = stored
        ensureSessionState(created.session_id, stored)

        if (stored) {
          markSessionCreatedThisRun(stored)
          // Seed the sidebar preview with the user's first message so the row
          // reads meaningfully while the turn is in flight, instead of flashing
          // "Untitled session" until the turn persists and auto-title runs. The
          // server later returns its own preview/title and supersedes this.
          // The row carries the create route's exact owner (backend profile +
          // connection), never the ambient profile — see upsertOptimisticSession.
          upsertOptimisticSession(created, stored, null, preview?.trim() || null, null, undefined, capturedRoute)
          navigate(sessionRoute(stored), { replace: true })
          // Other windows (e.g. the main window when this is the pop-out) can't
          // see this session until they re-pull the shared list.
          broadcastSessionsChanged()
        }

        setFreshDraftReady(false)
        setNewChatWorkspaceTarget(undefined)
        setActiveSessionId(created.session_id)

        // The new chat is what the user is now looking at (routed into main
        // above), so its read state is the open/view use case. With no stored
        // id there is no persisted session yet — just clear the selection.
        if (stored) {
          selectStoredSessionForViewing(stored)
        } else {
          setSelectedStoredSessionId(null)
        }

        setSessionStartedAt(Date.now())
        const yoloArmed = $yoloActive.get()
        const runtimeInfo = applyRuntimeInfo(created.info)

        if (runtimeInfo) {
          updateSessionState(created.session_id, state => ({ ...state, ...runtimeInfo }), stored)
        }

        // User may have armed YOLO on the new-chat draft before the runtime
        // session existed — apply it to the freshly created session.
        if (yoloArmed) {
          await setSessionYolo(requestGateway, created.session_id, true).catch(() => undefined)
        }

        return created.session_id
      } finally {
        window.setTimeout(() => {
          creatingSessionRef.current = false
        }, 0)
      }
    },
    [
      activeSessionIdRef,
      creatingSessionRef,
      ensureSessionState,
      getRouteToken,
      navigate,
      requestGateway,
      resetViewSync,
      selectedStoredSessionIdRef,
      updateSessionState
    ]
  )

  /** Create a fresh session and open it as a tile — leaves the primary chat alone.
   *  Used by the New session row's "Open in split" menu and the tab-strip "+".
   *
   *  `listed` (default true) controls sidebar visibility. A brand-new backend
   *  session is IN-MEMORY only until its first turn persists a row, so
   *  `listSessions(min_messages=1)` already hides an unused one — the sidebar
   *  pollution comes solely from the optimistic upsert here. The tab-strip "+"
   *  passes `listed: false` so an unused new tab never clutters the session
   *  list (Cursor-style draft tab); it surfaces on the next refresh once the
   *  first message persists a turn. "Open in split" keeps the listed behavior. */
  const openNewSessionTile = useCallback(
    async (
      dir: TileDock = 'right',
      options?: {
        anchor?: string
        before?: null | string
        cwd?: null | string
        listed?: boolean
        profile?: string
        route?: AgentProfileRoute | null
        workspaceScope?: SessionTileWorkspaceScope
      }
    ) => {
      const listed = options?.listed ?? true

      try {
        // Fresh tile → the caller's workspace when one was named (the sidebar
        // "+" on a project/worktree lane), explicit null means Home/detached,
        // else the resolved new-session cwd (project scope → configured default).
        // `options?.cwd || resolve…` is wrong for Home: null is falsy and used
        // to fall through into the last project folder while main chat was
        // occupied (openTab path for "New session in Home").
        const capturedRoute = options?.route !== undefined ? options.route : resolveNewChatOwnerRoute(options?.profile)

        const workspaceScope = options?.workspaceScope ?? { workspaceMode: 'sessions' }

        const cwd =
          options?.cwd === null ? '' : typeof options?.cwd === 'string' ? options.cwd.trim() : resolveNewSessionCwd()

        const params = {
          ...(await desktopSessionCreateParams(cwd, capturedRoute)),
          ...(workspaceScope.workspaceMode === 'bots' ? { hidden: true } : {})
        }

        // Same lease chain as createBackendSessionForSend: owner socket held
        // across the create, then the foreground hold carries it until the
        // tile is mounted ($sessionTiles names the owner from then on).
        const releaseCreateLease = capturedRoute
          ? await retainGatewayForAgent(capturedRoute.connectionId, capturedRoute.profile)
          : () => undefined

        let created: SessionCreateResponse
        let stored: string | undefined

        try {
          created = capturedRoute
            ? await requestGatewayForAgent<SessionCreateResponse>(
                capturedRoute.connectionId,
                capturedRoute.profile,
                'session.create',
                params
              )
            : await requestGateway<SessionCreateResponse>('session.create', params)

          stored = created.stored_session_id

          if (stored && capturedRoute) {
            // Same ownership transition as createBackendSessionForSend: the
            // route that minted the session is its exact owner from this
            // moment on, and its socket stays pinned until the tile mounts.
            setSessionOwnerHint(stored, capturedRoute)
            holdSessionOwnerUntilForeground(stored, capturedRoute)
          }
        } finally {
          releaseCreateLease()
        }

        if (!stored) {
          const closeCreated = capturedRoute
            ? requestGatewayForAgent(capturedRoute.connectionId, capturedRoute.profile, 'session.close', {
                session_id: created.session_id
              })
            : requestGateway('session.close', { session_id: created.session_id })

          await closeCreated.catch(() => undefined)
          notify({ kind: 'error', title: copy.sessionUnavailable, message: copy.createSessionFailed })

          return
        }

        markSessionCreatedThisRun(stored)

        // Seed the per-runtime cache so the tile renders immediately without a
        // redundant resume. Only add the row to the SIDEBAR when `listed` — an
        // unlisted (draft) tab stays out of the session list until its first
        // turn persists and a refresh surfaces it.
        if (listed) {
          upsertOptimisticSession(created, stored, null, null, null, undefined, capturedRoute)
        }

        // A tile lives in its OWN worktree, so it must not run the full
        // foreground composer publish. A CENTER tile is the focused surface,
        // though, and the Files pane still keys off the global `$currentCwd` —
        // so the right rail kept showing the previous session's tree when a
        // Project "+" created a session while the main chat was occupied
        // (#76696). Split/side tiles deliberately stay isolated.
        const runtimeInfo = applyRuntimeInfo(created.info, { foreground: false })
        updateSessionState(created.session_id, state => (runtimeInfo ? { ...state, ...runtimeInfo } : state), stored)

        openSessionTile(stored, dir, options?.anchor, options?.before, workspaceScope)
        patchSessionTile(stored, { runtimeId: created.session_id })

        if (dir === 'center' && runtimeInfo?.cwd) {
          setCurrentCwdTransient(runtimeInfo.cwd)
          setWorkspaceCwdOwner(stored)
        }

        revealTreePane(`session-tile:${stored}`)

        if (listed) {
          broadcastSessionsChanged()
        }
      } catch (error) {
        notifyError(error, copy.createSessionFailed)
      }
    },
    [copy, requestGateway, updateSessionState]
  )

  return { createBackendSessionForSend, openNewSessionTile }
}
