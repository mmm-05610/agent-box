import { atom, computed, type ReadableAtom } from 'nanostores'

import { PRIMARY_SESSION_VIEW } from '@/app/chat/session-view'
import type { ClientSessionState } from '@/app/types'
import { $narrowViewport } from '@/components/pane-shell/tree/store'
import {
  $activeSessionId,
  $connection,
  $selectedStoredSessionId,
  $sessions,
  $currentCwd,
  $currentModel,
  $gatewayState,
  $messages,
  getSessionOwnerHints,
  rememberedSessionProfile,
  sessionMatchesStoredId
} from '@/store/session'
import { $activeGatewayProfile, normalizeProfileKey } from '@/store/profile'
import {
  $focusedRuntimeId,
  $focusedSessionState,
  $focusedStoredSessionId,
  $sessionStates,
  $sessionTiles
} from '@/store/session-states'
import type { UsageStats } from '@/types/hermes'

// -- state: readonly views over the app's live atoms -------------------------

const readonlyAtom = <T>(atomLike: ReadableAtom<T>): ReadableAtom<T> => atomLike

/**
 * Turn flag for the FOCUSED chat — same semantics as the statusbar's busy
 * pulse. While the focused surface is the primary workspace (or a draft with
 * no runtime slice yet) this reads the primary view, which itself falls back
 * to the global draft atoms. Once a session TILE holds focus, the tile's own
 * state slice is authoritative — a background session can never leak in.
 */
const focusedTurnFlag = (
  select: (state: ClientSessionState) => boolean,
  $primary: ReadableAtom<boolean>
): ReadableAtom<boolean> =>
  computed(
    [$focusedStoredSessionId, $selectedStoredSessionId, $focusedSessionState, $primary],
    (focused, selected, state, primary) =>
      !focused || focused === selected ? primary : Boolean(state && select(state))
  )

const $focusedBusy = focusedTurnFlag(state => state.busy, PRIMARY_SESSION_VIEW.$busy)

const $focusedAwaitingResponse = focusedTurnFlag(
  state => state.awaitingResponse,
  PRIMARY_SESSION_VIEW.$awaitingResponse
)

export interface PluginFocusedSessionOwner {
  connectionId: string
  profile: string
}

/**
 * Connection-qualified owner of the FOCUSED chat. The gateway-routing atom
 * (`$activeGatewayProfile`) answers "which backend is the live socket homed
 * on" — but tab/tile focus moves without swapping the socket, and a cold
 * start can restore a route into a session the booting gateway doesn't own.
 * Any per-bot readout must follow the chat the user is LOOKING AT, so this
 * resolves the focused stored session to a unique immutable owner hint or a
 * unique connection-qualified aggregated row. Ambiguous or unresolved focused
 * ids fail closed with null; only a draft/no focused id uses the active gateway
 * owner. `focusedSessionProfile` remains the profile-only compatibility ladder.
 */
const $focusedSessionOwner = computed(
  [$focusedStoredSessionId, $sessions, $activeGatewayProfile, $connection],
  (focused, sessions, activeProfile, connection): PluginFocusedSessionOwner | null => {
    const activeConnectionId = String(connection?.connectionId || (connection?.mode === 'local' ? 'local' : '')).trim()

    const fallback = {
      connectionId: activeConnectionId,
      profile: normalizeProfileKey(activeProfile)
    }

    if (!focused) {
      return fallback
    }

    const hints = getSessionOwnerHints(focused)

    if (hints.length === 1) {
      return {
        connectionId: hints[0].connectionId,
        profile: normalizeProfileKey(hints[0].profile)
      }
    }

    if (hints.length > 1) {
      return null
    }

    const owners = new Map<string, PluginFocusedSessionOwner>()

    for (const row of sessions.filter(session => sessionMatchesStoredId(session, focused))) {
      const connectionId = String(row.connection_id || '').trim()
      const profile = normalizeProfileKey(row.profile)

      if (connectionId) {
        owners.set(`${connectionId}::${profile}`, { connectionId, profile })
      }
    }

    return owners.size === 1 ? [...owners.values()][0] : null
  }
)

const $focusedSessionProfile = computed(
  [$focusedSessionOwner, $focusedStoredSessionId, $sessions, $activeGatewayProfile],
  (owner, focused, sessions, activeProfile) =>
    owner?.profile || rememberedSessionProfile(sessions, focused, activeProfile)
)

export interface PluginProfileRoute {
  connectionId: string
  mode: 'local' | 'remote'
  /** Desktop profile used to select the connection route. */
  profile: string
  /** Backend Hermes profile served by that route. */
  targetProfile: string
}

/** Window geometry + the app's responsive posture, one readonly rect. */
export interface ViewportRect {
  width: number
  height: number
  /** Below the app's sidebar-collapse breakpoint (rails become overlays). */
  narrow: boolean
}

const readViewport = (): ViewportRect => ({
  width: typeof window === 'undefined' ? 0 : window.innerWidth,
  height: typeof window === 'undefined' ? 0 : window.innerHeight,
  narrow: $narrowViewport.get()
})

/** Runtime session id → mid-turn. Not gateway socket state. */
const $busyBySession = computed($sessionStates, states => {
  const map: Record<string, boolean> = {}

  for (const [id, state] of Object.entries(states)) {
    map[id] = Boolean(state.busy)
  }

  return map
})

const $viewport = atom<ViewportRect>(readViewport())

if (typeof window !== 'undefined') {
  const refresh = () => $viewport.set(readViewport())
  window.addEventListener('resize', refresh)
  $narrowViewport.listen(refresh)
}

/** Live usage of the FOCUSED session, projected out of the streamed session
 *  state — the same readout the core statusbar's context chip paints. */
const $focusedUsage = computed($focusedSessionState, state => state?.usage ?? null)

export const $activeConnectionId = computed($connection, connection => {
  if (!connection) {
    return null
  }

  if (connection.connectionId) {
    return connection.connectionId
  }

  // mode:'local' used to report null, which made Bot Mode fall back to the
  // registry primary (often an SSH box) and treat Spark as the active source
  // while this window was actually local.
  return connection.mode === 'local' ? 'local' : null
})


/** The readonly state surface of the plugin host: `host.state`. */
export const hostReadonlyState = {
  state: {
    /** Runtime id of the active chat session (null on a fresh draft). */
    activeSessionId: readonlyAtom<null | string>($activeSessionId),
    /** True from send until the first assistant payload on the focused chat. */
    awaitingResponse: readonlyAtom<boolean>($focusedAwaitingResponse),
    /**
     * True while the focused chat is working after a send. Covers the wait
     * for the first token and the stream that follows. Follows tile focus —
     * same signal the statusbar's busy pulse reads. A draft with no runtime
     * id uses the global flag.
     */
    busy: readonlyAtom<boolean>($focusedBusy),
    /** Runtime session id → mid-turn. Not socket state; see `gateway`. */
    busyBySession: readonlyAtom<Record<string, boolean>>($busyBySession),
    /** Registry source that owns the active gateway, when source-scoped. */
    connectionId: readonlyAtom<null | string>($activeConnectionId),
    /** Active workspace cwd ('' when detached). */
    cwd: readonlyAtom<string>($currentCwd),
    /** Runtime id of the FOCUSED chat session — the interacted tile, else the
     *  primary. Prefer this over `activeSessionId` for any readout that
     *  should follow the user between tiles (context, tokens, cost). */
    focusedSessionId: readonlyAtom<null | string>($focusedRuntimeId),
    /** Connection-qualified owner of the focused chat. Prefer this for any
     *  readout or mutation where separate sources can share a profile name. */
    focusedSessionOwner: readonlyAtom<PluginFocusedSessionOwner | null>($focusedSessionOwner),
    /** Owner profile of the focused chat (session-row stamp, falling back to
     *  the gateway profile for drafts/uncached ids). Compatibility projection
     *  of `focusedSessionOwner`; use the complete owner for source routing. */
    focusedSessionProfile: readonlyAtom<string>($focusedSessionProfile),
    /** Stored (durable) id of the focused session — for navigation and
     *  session-list matching, where runtime ids don't survive reloads. */
    focusedStoredSessionId: readonlyAtom<null | string>($focusedStoredSessionId),
    /** Live usage snapshot of the focused session (`context_used` /
     *  `context_max` / `context_percent`, token counts, `cost_usd`) —
     *  streamed by the backend, no RPC needed. Null while unresolved.
     *  The UsageStats-optional fields (context_*, cost_usd) arrive as the
     *  backend reports them, so read them with a fallback. */
    focusedUsage: readonlyAtom<null | UsageStats>($focusedUsage),
    /** Gateway socket state: 'idle' | 'connecting' | 'open' | …. Not turn-busy. */
    gateway: readonlyAtom<string>($gatewayState),
    /** Current main model slug. */
    model: readonlyAtom<string>($currentModel),
    /** Profile the live gateway is routed to. */
    profile: readonlyAtom<string>($activeGatewayProfile),
    /** Window geometry ({ width, height, narrow }). */
    viewport: readonlyAtom<ViewportRect>($viewport)
  },

}
