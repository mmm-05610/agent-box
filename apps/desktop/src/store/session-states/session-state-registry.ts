import { type GatewayEvent, LOCAL_CONNECTION_ID, registryBackendScopeKey } from '@hermes/shared'
import { atom, computed } from 'nanostores'

import type { ClientSessionState } from '@/app/types'
import type { WorkspaceMode } from '@/contrib/types'
import { readJson, writeJson } from '@/lib/storage'
import { $activeGatewayProfile, normalizeProfileKey } from '../profile'
import { clearAllProviderWaits, clearSessionProviderWait } from '../provider-wait'
import {
  $activeSessionId,
  $connection,
  $lastReadAtBySessionId,
  $selectedStoredSessionId,
  clearReadBaseline,
  getSessionOwnerHint,
  knownSessionOwner,
  ownerLookupSessionRows,
  setActiveSessionStoredIdRotation,
  setAwaitingResponse,
  setBusy
} from '../session'
import { secondaryProfileOwnerForEvent } from '../session-event-provenance'
import { $focusedTreePaneId } from '../session-focus'
import { assertSessionOwnerResolved } from '../session-owner-resolution'
import {
  requestForSessionProfile,
  type SessionOwnerRoute,
  type SessionOwnerScope
} from '../session-request-router'
import { markSessionUnreadFinished } from '../session-unread'
import { isBrowserWindow, isSecondaryWindow } from '../windows'
import { sessionTileDelegate } from './tile-delegate'

/** The reactive per-session state machine: the per-runtime state mirror with
 *  its transition side-effects, and the persisted session-tile registry its
 *  eviction, referencing, and focus transitions read against. */
// ---------------------------------------------------------------------------
// Reactive per-runtime session state (view mirror of the wiring cache).
// ---------------------------------------------------------------------------

export const $sessionStates = atom<Record<string, ClientSessionState>>({})

// ---------------------------------------------------------------------------
// Event-source scopes: which registry connection's socket delivered a runtime
// session's events. Working/attention membership alone is profile-blind — two
// connected gateways can both expose a 'default' profile, so the gateway
// keep-set (pruneSecondaryGateways) must key live work by the composite
// (connectionId, profile) scope, not the bare profile name. Recorded at
// event fan-in (use-gateway-boot); local/primary events carry no connectionId
// and record nothing, so single-source behavior is untouched.
// ---------------------------------------------------------------------------

export const sessionScopeByRuntimeId = new Map<string, string>()

// Structured twin of the scope ledger: inbound events can carry either an
// exact (connectionId, profile) owner or a producer-proven profile-only pool
// owner. Consumed as the LAST rung of knownOwnerForSession so a runtime whose
// event source already proved its owner can still route session-scoped RPCs
// (approval.respond) when every durable binding (tile / hint / row) is absent
// — while durable stored identity keeps outranking it (#97511).
const sessionOwnerByRuntimeId = new Map<string, SessionOwnerScope>()

export function recordSessionEventScope(event: { connectionId?: string; profile?: string; session_id?: string }): void {
  if (!event.session_id) {
    return
  }

  if (event.connectionId) {
    sessionScopeByRuntimeId.set(event.session_id, registryBackendScopeKey(event.connectionId, event.profile))
    sessionOwnerByRuntimeId.set(event.session_id, {
      connectionId: event.connectionId,
      profile: String(event.profile ?? '').trim() || 'default'
    })

    return
  }

  // Only gateway.ts's secondary closure can add this non-serializable marker.
  // A profile field from a primary or arbitrary inbound event is descriptive,
  // not an owner route, and must keep failing closed in multi-profile installs.
  const profile = secondaryProfileOwnerForEvent(event as GatewayEvent)

  if (profile) {
    sessionOwnerByRuntimeId.set(event.session_id, profile)
  }
}

/** Forget only profile-pool runtime owners during permanent LOCAL profile
 * teardown. These string routes came exclusively from the legacy secondary
 * producer; exact connection descriptors must survive a same-named remote
 * profile's local delete/rename. */
export function forgetProfileOnlyRuntimeOwners(profile: string): void {
  const retired = normalizeProfileKey(profile)

  for (const [runtimeId, owner] of sessionOwnerByRuntimeId) {
    if (typeof owner === 'string' && normalizeProfileKey(owner) === retired) {
      sessionOwnerByRuntimeId.delete(runtimeId)
    }
  }
}

/** Composite scopes of registry-sourced sessions that are live (busy or
 * waiting on input) — the (connectionId, profile) half of the gateway
 * keep-set. Local-source live work keeps flowing through profile names. */
export function liveSessionScopes(): Set<string> {
  const scopes = new Set<string>()

  for (const [runtimeId, state] of Object.entries($sessionStates.get())) {
    if (!state || (!state.busy && !state.needsInput)) {
      continue
    }

    const scope = sessionScopeByRuntimeId.get(runtimeId)

    if (scope) {
      scopes.add(scope)
    }
  }

  return scopes
}


// Stored session ids whose authoritative state is still busy, but whose
// runtime has produced no state publish for the watchdog window. Silence is
// not completion: long tool calls can legitimately stay quiet, so this is a
// presentation hint and never mutates the backend-derived busy state.
export const $stalledSessionIds = atom<string[]>([])

export function setSessionStalled(storedSessionId: string | null | undefined, stalled: boolean) {
  if (!storedSessionId) {
    return
  }

  const current = $stalledSessionIds.get()
  const present = current.includes(storedSessionId)

  if (stalled && !present) {
    $stalledSessionIds.set([...current, storedSessionId])
  } else if (!stalled && present) {
    $stalledSessionIds.set(current.filter(id => id !== storedSessionId))
  }
}

// --- Watchdog: marks busy sessions quiet after a long stream silence -------
// Tuned against what this app actually does rather than a round number: a
// typecheck or a full test run here goes quiet for minutes at a stretch and is
// perfectly healthy, so anything under ~4 min would paint normal work as
// suspect. Eight minutes was the other failure — longer than a user is willing
// to sit and wonder, so the hint arrived after they had already given up on it.
export const SESSION_WATCHDOG_TIMEOUT_MS = 5 * 60 * 1000
const sessionWatchdogTimers = new Map<string, ReturnType<typeof setTimeout>>()

function armWatchdog(runtimeId: string) {
  const existing = sessionWatchdogTimers.get(runtimeId)

  if (existing) {
    clearTimeout(existing)
  }

  sessionWatchdogTimers.set(
    runtimeId,
    setTimeout(() => {
      sessionWatchdogTimers.delete(runtimeId)
      const current = $sessionStates.get()[runtimeId]

      if (current?.busy) {
        setSessionStalled(current.storedSessionId, true)
      }
    }, SESSION_WATCHDOG_TIMEOUT_MS)
  )
}

function clearWatchdog(runtimeId: string) {
  const t = sessionWatchdogTimers.get(runtimeId)

  if (t) {
    clearTimeout(t)
    sessionWatchdogTimers.delete(runtimeId)
  }
}

// --- Settle grace: keeps a just-finished session in the sidebar merge set ---
const SESSION_SETTLE_GRACE_MS = 30 * 1000
const settledExpiry = new Map<string, number>()

function markSettled(storedId: string) {
  settledExpiry.set(storedId, Date.now() + SESSION_SETTLE_GRACE_MS)
}

function clearSettled(storedId: string) {
  settledExpiry.delete(storedId)
}

/** Stored ids whose turn ended within the grace window. Prunes expired. */
export function getRecentlySettledSessionIds(now: number = Date.now()): string[] {
  const live: string[] = []

  for (const [id, expiry] of settledExpiry) {
    if (expiry > now) {
      live.push(id)
    } else {
      settledExpiry.delete(id)
    }
  }

  return live
}

// --- Transition detection (called automatically from publishSessionState) ---
function handleTransition(previous: ClientSessionState | null, next: ClientSessionState, runtimeId: string) {
  // Compression id rotation: signal the route-follow effect with enough
  // provenance (previous id + runtime) that the consumer can reject the event
  // if the user navigated elsewhere before React handled it. A bare next id
  // could let a background session's delayed rotation steal the foreground
  // route.
  if (previous?.storedSessionId && next.storedSessionId && previous.storedSessionId !== next.storedSessionId) {
    if (runtimeId === $activeSessionId.get()) {
      setActiveSessionStoredIdRotation({
        nextStoredSessionId: next.storedSessionId,
        previousStoredSessionId: previous.storedSessionId,
        runtimeSessionId: runtimeId
      })
    }

    clearSettled(previous.storedSessionId)
    setSessionStalled(previous.storedSessionId, false)
  }

  // Every busy publish is stream activity: clear the quiet hint and restart
  // the silence window. A real terminal transition clears both the timer and
  // any hint, but only that authoritative transition clears working/busy.
  if (next.busy) {
    setSessionStalled(next.storedSessionId, false)
    armWatchdog(runtimeId)
  } else {
    clearWatchdog(runtimeId)
    setSessionStalled(next.storedSessionId, false)
    setSessionStalled(previous?.storedSessionId, false)
  }

  const storedId = next.storedSessionId

  if (!storedId) {
    return
  }

  const wasWorking = previous?.busy ?? false

  if (next.busy && !wasWorking) {
    clearSettled(storedId)
    // A NEW turn is starting: the read baseline guarded the PREVIOUS
    // completion's re-asserts. Dropping it here means this turn's finish
    // re-lights even if it lands within the same millisecond as the last
    // read (same-tick submit → finish in tests and fast local models).
    clearReadBaseline(storedId)
  } else if (!next.busy && wasWorking) {
    markSettled(storedId)

    // FOCUSED, not selected: a session finishing in the tile the user is
    // watching is already seen, and a tile is never the primary selection.
    if (storedId !== $focusedStoredSessionId.get()) {
      // Re-light only genuinely new completions: if the user already viewed
      // this session (or its family) at or after this settle moment, a
      // re-assert of the same completion must not re-arm the dot. `-1` for
      // "never read" (not `0`) so fake-timer tests pinned to t=0 still light.
      const lastReadAt = $lastReadAtBySessionId.get()[storedId] ?? -1

      if (Date.now() > lastReadAt) {
        // Flags the transient atom AND persists a marker, so the green dot
        // survives an app restart (see session-unread.ts).
        markSessionUnreadFinished(storedId)
      }
    }
  }
}

/** Is any surface on THIS window still holding the runtime — the primary view
 *  or an open tile? (A tile mid-resume references by stored id only; its
 *  runtime binding is patched in after `resumeTile` returns.) */
function runtimeReferenced(runtimeId: string, storedSessionId: null | string): boolean {
  if (runtimeId === $activeSessionId.get()) {
    return true
  }

  return $sessionTiles
    .get()
    .some(t => t.runtimeId === runtimeId || (storedSessionId !== null && t.storedSessionId === storedSessionId))
}

/** A state no surface needs anymore: its turn is over (not busy, not waiting
 *  on the user) and neither the primary view nor any tile holds the runtime.
 *  `needsInput` states stay — the sidebar's attention dot reads them. */
export function evictable(runtimeId: string, state: ClientSessionState): boolean {
  return (
    !state.busy && !state.needsInput && !state.awaitingResponse && !runtimeReferenced(runtimeId, state.storedSessionId)
  )
}

/** Publish one session's state. Automatically fires transition side-effects
 *  (watchdog arm/disarm, settle grace, unread marker, compression id rotation)
 *  by diffing previous vs next — callers never need to manually call a
 *  transition handler.
 *
 *  Skips the publish when the new state is identical to the existing one
 *  (same reference) to avoid churning `$sessionStates` on periodic
 *  `session.info` heartbeats that carry no change — otherwise every ~1/s
 *  heartbeat creates a new Record spread, triggering computed atoms
 *  ($workingSessionIds, $attentionSessionIds) and their subscribers
 *  unnecessarily. The runtime-id→state cache (sessionStateByRuntimeIdRef)
 *  is updated independently by the caller, so the visual path stays live
 *  without the store churn.
 *
 *  A settled state nothing references releases its transcript instead of
 *  republishing it. Gateway events keep flowing for sessions whose tile was
 *  closed mid-turn, and parking each one's full transcript here forever is the
 *  leak that made the app crawl after a day of tile use. Transition side
 *  effects still fire, so lightweight status and the unread dot survive. A
 *  FIRST publish always lands in full because a resume can publish its idle
 *  state a beat before `$activeSessionId` / the tile binding points at it. */
export function publishSessionState(runtimeId: string, state: ClientSessionState) {
  const current = $sessionStates.get()
  const prev = current[runtimeId] ?? null

  if (prev === state) {
    return
  }

  if (prev && evictable(runtimeId, state)) {
    handleTransition(prev, state, runtimeId)
    releaseSessionTranscript(runtimeId, state)

    return
  }

  $sessionStates.set({ ...current, [runtimeId]: state })
  handleTransition(prev, state, runtimeId)
}

/** Keep the cheap status projection for a cold session while releasing its
 * transcript. Unread completion is stored separately, so it survives too. */
export function releaseSessionTranscript(runtimeId: string, state?: ClientSessionState) {
  const current = $sessionStates.get()

  if (!(runtimeId in current)) {
    return
  }

  const retained = state ?? current[runtimeId]

  // Older persisted snapshots can contain an undefined state or omit the
  // messages field. Treat either shape as already cold instead of throwing
  // while memory pressure is being relieved.
  if (!retained) {
    return
  }

  const lightweight =
    Array.isArray(retained.messages) && retained.messages.length === 0 ? retained : { ...retained, messages: [] }

  $sessionStates.set({ ...current, [runtimeId]: lightweight })
}

export function dropSessionState(runtimeId: string) {
  // Disarm the watchdog — a dropped runtime must not fire a stale clear later.
  // Settle-grace entries are keyed by stored id and self-expire; leave them so
  // a just-finished session's row survives merge eviction even if its tile or
  // cached runtime is dropped in the meantime.
  clearWatchdog(runtimeId)
  clearSessionProviderWait(runtimeId)
  sessionScopeByRuntimeId.delete(runtimeId)
  sessionOwnerByRuntimeId.delete(runtimeId)

  const current = $sessionStates.get()
  setSessionStalled(current[runtimeId]?.storedSessionId, false)

  if (!(runtimeId in current)) {
    return
  }

  const { [runtimeId]: _dropped, ...rest } = current
  $sessionStates.set(rest)
}

/** Drop every cached session state — used on soft gateway-mode apply so the
 *  computed working / attention sets drain to empty alongside the session list.
 *  Also disarms every watchdog timer and drops all settle-grace entries: a
 *  wiped gateway's sessions must not fire stale clears or linger in the
 *  sidebar merge keep-set after the switch. */
export function clearAllSessionStates() {
  for (const timer of sessionWatchdogTimers.values()) {
    clearTimeout(timer)
  }

  sessionWatchdogTimers.clear()
  settledExpiry.clear()
  clearAllProviderWaits()
  sessionScopeByRuntimeId.clear()
  sessionOwnerByRuntimeId.clear()
  $stalledSessionIds.set([])
  $sessionStates.set({})
}

/** Downgrade cached busy/awaiting states after a gateway reconnect.
 *
 *  A respawned backend re-mints runtime ids (the same fact that drives
 *  resetTileRuntimeBindings), so a pre-reconnect `busy` can never receive its
 *  terminal `busy: false` publish — the runtime id it would arrive under is
 *  dead. Left alone, that state keeps its session in $workingSessionIds
 *  forever: the sidebar running arc and agents-panel "running" chrome lie for
 *  hours after the turn actually ended (#53902, #73082 — stale-flag half).
 *
 *  `scope` picks which socket's sessions to reconcile, keyed by the event-
 *  source scope recorded at fan-in: a SECONDARY (registry) reconnect passes
 *  its composite scope and touches only runtimes that arrived on that socket;
 *  the PRIMARY reconnect passes undefined and touches only scope-less
 *  runtimes (primary/local events record no scope). Neither can clear live
 *  work riding a different, still-healthy connection.
 *
 *  Direction of failure is deliberate: a turn that IS still live (transient
 *  socket blip, same backend) re-asserts busy on its next event or inflight
 *  snapshot within a beat, so at worst its arc blinks once. A dead turn's
 *  state, by contrast, would never clear on its own. `needsInput` is left
 *  untouched — a blocking prompt is the one claim the user must explicitly
 *  answer, and post-reconnect refresh re-asserts or retires it via its own
 *  path. Transition side-effects run through publishSessionState, so
 *  watchdogs disarm, stall hints drop, and settle/unread bookkeeping stays
 *  consistent.
 *
 *  The downgrade goes through the delegate's `retireBusyClaim` (the wiring
 *  cache's updateSessionState), not straight into this mirror: the claim has
 *  four holders — wiring cache, mirror, the focused view's draft latches,
 *  busyRef — and retiring only the mirror left Send silently no-oping behind
 *  a stale busy until restart (#93059). The mirror publish stays as the
 *  fallback for runtimes the cache never held (background-sync rows, no
 *  wiring mounted). A PRIMARY reconcile also clears the focused draft
 *  latches, which outlive the state they mirrored; a scoped one leaves them
 *  alone — a background socket says nothing about the primary composer. */
export function reconcileBusyStatesOnReconnect(scope?: string) {
  const states = $sessionStates.get()

  for (const [runtimeId, state] of Object.entries(states)) {
    if (!state || (!state.busy && !state.awaitingResponse)) {
      continue
    }

    const recorded = sessionScopeByRuntimeId.get(runtimeId)

    if (scope === undefined ? recorded !== undefined : recorded !== scope) {
      continue
    }

    sessionTileDelegate()?.retireBusyClaim?.(runtimeId)

    // Re-read — the write path may have republished (and released) this entry.
    const published = $sessionStates.get()[runtimeId]

    if (published?.busy || published?.awaitingResponse) {
      publishSessionState(runtimeId, { ...published, awaitingResponse: false, busy: false })
    }
  }

  if (scope === undefined) {
    setBusy(false)
    setAwaitingResponse(false)
  }
}


// ---------------------------------------------------------------------------
// Session tiles.
// ---------------------------------------------------------------------------

/** Edge a tile docks against main when it first joins the tree. Shared by
 *  session tiles and route (page) tiles. */
export type SplitDir = 'bottom' | 'left' | 'right' | 'top'

/** Where a tile lands on adoption: an edge split, or `center` = stack into
 *  the anchor's zone as a tab (a drop on the zone's tab strip). */
export type TileDock = 'center' | SplitDir

export interface SessionTile {
  /** Stored session id — the durable identity (runtime ids are ephemeral). */
  storedSessionId: string
  /** Dock against `anchor` on adoption (default right; center = stack). */
  dir?: TileDock
  /** Pane to dock against (a drop's target zone) — default the workspace.
   *  Persisted so a restart re-docks in place; a stale id falls back to the
   *  workspace (findGroupOfPane misses → the move is skipped). */
  anchor?: string
  /** Center docks: stack BEFORE this pane id (`null`/omitted = append) — the
   *  strip divider's slot. Persisted, like `anchor`; a stale id appends. */
  before?: null | string
  /** Live runtime id once the tile's resume has bound one. */
  runtimeId?: string
  /** Resume failed terminally (shown in the tile; retryable). */
  error?: string
  /** Presentation workspace this tab belongs to. Missing legacy values are Sessions. */
  workspaceMode?: WorkspaceMode
  /** Exact opaque owner key for Bot Mode tabs. */
  workspaceOwnerKey?: string
  /** Credential-free exact route used to resume this tab after relaunch. */
  ownerRoute?: SessionOwnerRoute
  /** Stable title for hidden relationship chats absent from the Sessions list. */
  workspaceTabTitle?: string
}

export interface SessionTileWorkspaceScope {
  ownerRoute?: SessionOwnerRoute
  workspaceMode: WorkspaceMode
  workspaceOwnerKey?: string
  workspaceTabTitle?: string
}

// Tiles are persisted PER PROFILE: a session belongs to one profile, and the
// single live gateway is scoped to one profile at a time, so a tile only makes
// sense while its profile is active. Switching profiles swaps the visible set
// (and drops runtime bindings so each tile re-resumes against the now-current
// gateway — which also settles the "tile resumes against the wrong backend" and
// "stale runtime after respawn" bugs by construction).
const TILES_KEY = 'hermes.desktop.sessionTiles.v2'
const LEGACY_TILES_KEY = 'hermes.desktop.sessionTiles.v1'
export const TILE_PANE_PREFIX = 'session-tile:'
export const BOTS_TILE_BUCKET = '__bots_workspace__'

/** Persisted placement — `dir` + strip slot (`before`) + dock `anchor` so a
 *  restart / profile swap re-adopts tiles in the same order, not all stacked
 *  right of workspace. */
type StoredTile = Pick<
  SessionTile,
  | 'anchor'
  | 'before'
  | 'dir'
  | 'ownerRoute'
  | 'storedSessionId'
  | 'workspaceMode'
  | 'workspaceOwnerKey'
  | 'workspaceTabTitle'
>

export const toStored = (t: SessionTile): StoredTile => ({
  anchor: t.anchor,
  before: t.before,
  dir: t.dir,
  ...(t.ownerRoute ? { ownerRoute: t.ownerRoute } : {}),
  storedSessionId: t.storedSessionId,
  ...(t.workspaceMode ? { workspaceMode: t.workspaceMode } : {}),
  ...(t.workspaceOwnerKey ? { workspaceOwnerKey: t.workspaceOwnerKey } : {}),
  ...(t.workspaceTabTitle ? { workspaceTabTitle: t.workspaceTabTitle } : {})
})

function parseTileList(value: unknown): StoredTile[] {
  return Array.isArray(value)
    ? value
        .filter((t): t is SessionTile => Boolean(t && typeof (t as SessionTile).storedSessionId === 'string'))
        .map(t => {
          const raw = t as SessionTile

          return {
            anchor: typeof raw.anchor === 'string' ? raw.anchor : undefined,
            before: typeof raw.before === 'string' || raw.before === null ? raw.before : undefined,
            dir: raw.dir,
            ownerRoute:
              raw.ownerRoute &&
              typeof raw.ownerRoute.connectionId === 'string' &&
              typeof raw.ownerRoute.profile === 'string'
                ? {
                    connectionId: raw.ownerRoute.connectionId,
                    mode: raw.ownerRoute.mode,
                    profile: raw.ownerRoute.profile,
                    ...(typeof raw.ownerRoute.targetProfile === 'string'
                      ? { targetProfile: raw.ownerRoute.targetProfile }
                      : {})
                  }
                : undefined,
            storedSessionId: raw.storedSessionId,
            workspaceMode: raw.workspaceMode === 'bots' ? 'bots' : 'sessions',
            workspaceOwnerKey:
              raw.workspaceMode === 'bots' && typeof raw.workspaceOwnerKey === 'string'
                ? raw.workspaceOwnerKey
                : undefined,
            workspaceTabTitle: typeof raw.workspaceTabTitle === 'string' ? raw.workspaceTabTitle : undefined
          }
        })
    : []
}

export function loadTilesByProfile(): Record<string, StoredTile[]> {
  const byProfile: Record<string, StoredTile[]> = {}
  const parsed = readJson<unknown>(TILES_KEY)

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    for (const [profile, list] of Object.entries(parsed as Record<string, unknown>)) {
      const tiles = parseTileList(list)
      const key = profile === BOTS_TILE_BUCKET ? BOTS_TILE_BUCKET : normalizeProfileKey(profile)

      if (tiles.length > 0) {
        const sessionTiles = tiles.filter(tile => tile.workspaceMode !== 'bots')
        const botTiles = tiles.filter(tile => tile.workspaceMode === 'bots')

        if (sessionTiles.length > 0) {
          byProfile[key] = [...(byProfile[key] ?? []), ...sessionTiles]
        }

        if (botTiles.length > 0) {
          byProfile[BOTS_TILE_BUCKET] = [...(byProfile[BOTS_TILE_BUCKET] ?? []), ...botTiles]
        }
      }
    }
  }

  // Migrate a v1 flat list into the default profile, then retire the key.
  const legacy = parseTileList(readJson<unknown>(LEGACY_TILES_KEY))

  if (legacy.length > 0) {
    const key = normalizeProfileKey('default')
    const sessionTiles = legacy.filter(tile => tile.workspaceMode !== 'bots')
    const botTiles = legacy.filter(tile => tile.workspaceMode === 'bots')

    byProfile[key] = [...(byProfile[key] ?? []), ...sessionTiles]
    byProfile[BOTS_TILE_BUCKET] = [...(byProfile[BOTS_TILE_BUCKET] ?? []), ...botTiles]
  }

  if (byProfile[BOTS_TILE_BUCKET]?.length) {
    byProfile[BOTS_TILE_BUCKET] = [
      ...new Map(byProfile[BOTS_TILE_BUCKET].map(tile => [tile.storedSessionId, tile])).values()
    ]
  }

  writeJson(LEGACY_TILES_KEY, null)

  return byProfile
}

export const tilesByProfile = loadTilesByProfile()
// Keyed by the GATEWAY profile: the rail's profile switch is a soft swap
// ($activeGatewayProfile moves, no reload) — $activeProfile mirrors the
// window's primary backend and never changes on a rail switch, so keying on
// it left the previous profile's tiles registered (phantom "Session" tabs).
export const profileKey = () => normalizeProfileKey($activeGatewayProfile.get())

// Runtime ids are process-scoped — never trust a persisted one, so the live
// atom hydrates from the stored (runtime-less) tiles for the active profile.
// A secondary window (single-chat pop-out) shows ONLY its routed session — no
// tiles, and no repopulation on a profile switch.
export const $sessionTiles = atom<SessionTile[]>(
  isSecondaryWindow() || isBrowserWindow()
    ? []
    : [...(tilesByProfile[profileKey()] ?? []), ...(tilesByProfile[BOTS_TILE_BUCKET] ?? [])]
)

export function persistTiles() {
  // Shares the origin's storage; a secondary / browser pop-out holds no tiles,
  // so a write back would only wipe the primary's set.
  if (isSecondaryWindow() || isBrowserWindow()) {
    return
  }

  writeJson(TILES_KEY, Object.keys(tilesByProfile).length === 0 ? null : tilesByProfile)
}

export function saveTiles(tiles: SessionTile[]) {
  const stored = tiles.map(toStored)
  const sessionTiles = stored.filter(tile => tile.workspaceMode !== 'bots')
  const botTiles = stored.filter(tile => tile.workspaceMode === 'bots')

  if (sessionTiles.length > 0) {
    tilesByProfile[profileKey()] = sessionTiles
  } else {
    delete tilesByProfile[profileKey()]
  }

  if (botTiles.length > 0) {
    tilesByProfile[BOTS_TILE_BUCKET] = botTiles
  } else {
    delete tilesByProfile[BOTS_TILE_BUCKET]
  }

  persistTiles()
  $sessionTiles.set(tiles)
}

// Profile switch: surface the new profile's tiles with runtime ids cleared so
// they re-resume against the now-current gateway. (Fires immediately on
// subscribe; harmless — the init value already matches.) A secondary window
// never carries tiles, so it stays out of this entirely.
if (!isSecondaryWindow() && !isBrowserWindow()) {
  $activeGatewayProfile.subscribe(() => {
    $sessionTiles.set([...(tilesByProfile[profileKey()] ?? []), ...(tilesByProfile[BOTS_TILE_BUCKET] ?? [])])
  })
}

export function patchSessionTile(storedSessionId: string, patch: Partial<SessionTile>) {
  saveTiles($sessionTiles.get().map(t => (t.storedSessionId === storedSessionId ? { ...t, ...patch } : t)))
}

export function sessionTileOwnerRoute(storedSessionId: string): SessionOwnerRoute | undefined {
  return $sessionTiles.get().find(tile => tile.storedSessionId === storedSessionId)?.ownerRoute
}

/**
 * Gateway keep-set scopes for currently open tiles. Bot chats (and any other
 * owner-routed tile) hold a secondary socket even while chrome stays on the
 * launch profile; without these keys, idle prune closes that socket and the
 * tile's resume/unbind loop spins forever. Local routes contribute both the
 * bare profile (openGatewayForProfile) and the explicit `conn:local::…` key
 * (openGatewayForAgent). Remote routes contribute only the composite key so
 * a homelab tile cannot pin another source's same-named profile.
 */
export function openTileGatewayScopes(): Set<string> {
  const scopes = new Set<string>()

  for (const tile of $sessionTiles.get()) {
    const route = tile.ownerRoute

    if (!route) {
      continue
    }

    const profile = normalizeProfileKey(route.profile)
    const connectionId = String(route.connectionId ?? '').trim()
    const localRoute = !connectionId || connectionId === LOCAL_CONNECTION_ID || route.mode === 'local'

    if (localRoute) {
      scopes.add(profile)
    }

    if (connectionId) {
      scopes.add(registryBackendScopeKey(connectionId, profile))
    }
  }

  return scopes
}

/**
 * Sync owner resolution for a session id that may be a RUNTIME or a STORED id.
 * Tile route first (exact connectionId+profile, survives relaunch), then the
 * exact unique owner hint (stamped when a routed create returns / at open
 * time; persisted), then the session row's owner (an exact route when the row
 * is connection-tagged, else its bare profile, else the hint's profile). The
 * row rung searches every source-scoped slice (recents, cron, messaging), not
 * just recents — a cron session's approval.respond used to find no owner here
 * and fail closed on registry-topology installs even though its row (with its
 * `profile` stamp) was already loaded for the sidebar's cron section. The
 * hint outranks the row for the same reason as contrib/wiring's ladder: a
 * row can be stamped from the ambient profile and carries no connection.
 * Last rung: the owner recorded from the inbound runtime event itself
 * (sessionOwnerByRuntimeId, #97511) — an orphan runtime whose tile/hint/row
 * binding is absent or stale still routes through the exact
 * (connectionId, profile) or secondary socket's proven local profile. Every
 * durable rung above keeps outranking it, so a stored-id collision never
 * inherits a stale runtime ledger entry. Unproven profile fields record
 * nothing, so unknown owners in multi-profile topology still fail closed.
 * Returns undefined when no owner is known — the caller fails closed
 * (assertSessionOwnerResolved), never falls to "active".
 */
export function knownOwnerForSession(sessionId: null | string | undefined): SessionOwnerScope {
  if (!sessionId) {
    return undefined
  }

  const storedSessionId = storedSessionIdForRuntimeId(sessionId) ?? sessionId

  return (
    sessionTileOwnerRoute(storedSessionId) ??
    getSessionOwnerHint(storedSessionId) ??
    knownSessionOwner(ownerLookupSessionRows(), storedSessionId) ??
    sessionOwnerByRuntimeId.get(sessionId)
  )
}

/**
 * Whether the connection that OWNS `sessionId` is remote — never the ambient
 * `$connection`. A session tied to a registered secondary connection (Bot
 * Mode, the unified Sessions list) can differ from whichever connection the
 * window currently shows; its RPCs already route to their own owner via
 * `requestForSessionProfile`, but a caller that instead reads ambient mode to
 * decide image.attach vs image.attach_bytes ships a client-local path to a
 * remote backend that can't resolve it (#94640). A bare profile name (no
 * connectionId) is a pool profile of the ambient connection, so ambient mode
 * still applies there.
 */
export function isSessionRemote(sessionId: null | string | undefined): boolean {
  const owner = knownOwnerForSession(sessionId)

  if (owner && typeof owner === 'object' && owner.mode) {
    return owner.mode === 'remote'
  }

  return $connection.get()?.mode === 'remote'
}

/**
 * Dispatch a session-scoped RPC through the OWNER of `sessionId` (tile route →
 * hint → connection-tagged row / known profile). This is the client half of
 * #91684: approval.respond (and siblings) sent on the ambient socket land on
 * whatever backend is active, which for a cross-profile session is a backend
 * that never held the approval. An UNKNOWN owner fails closed with an
 * explicit SessionOwnerResolutionError unless the ambient gateway is provably
 * the only backend (legacy single-profile, no registry source).
 */
export function requestForOwnedSession<T>(
  sessionId: null | string | undefined,
  ambientRequest: <R>(
    method: string,
    params?: Record<string, unknown>,
    timeoutMs?: number,
    signal?: AbortSignal
  ) => Promise<R>,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<T> {
  const owner = knownOwnerForSession(sessionId)

  try {
    assertSessionOwnerResolved(owner, { method, sessionId })
  } catch (error) {
    return Promise.reject(error)
  }

  return requestForSessionProfile<T>(owner, ambientRequest, method, params, timeoutMs, signal)
}

/** Resolve a session id THAT MAY BE A RUNTIME ID to the stored id its tile
 *  keys on. Session-scoped RPC params carry the runtime id, while tile owner
 *  routes (and everything else durable) key on the stored id — so routing an
 *  RPC by its own target session needs this translation first (#93080 /
 *  Bot Mode misroute). Ids that match a tile's stored id pass through, so
 *  callers can hand in either identity. Unknown ids return null: the caller
 *  falls back to its ambient routing rather than guessing. */
export function storedSessionIdForRuntimeId(sessionId: string): null | string {
  const tiles = $sessionTiles.get()

  // Stored-id claims are authoritative (durable identity): check them all
  // before any runtime binding, so a stale tile whose dead runtimeId collides
  // with a live tile's stored id cannot hijack the lookup.
  for (const tile of tiles) {
    if (tile.storedSessionId === sessionId) {
      return tile.storedSessionId
    }
  }

  for (const tile of tiles) {
    if (tile.runtimeId && tile.runtimeId === sessionId) {
      return tile.storedSessionId
    }
  }

  // The per-runtime state mirror carries the stored id the wiring cache bound
  // (ensureSessionState / a resume). This is how a MAIN-PANE runtime id — an
  // approval.respond from a native notification, a queued send — finds its
  // durable identity, and through it the exact owner (hint / tagged row).
  // Without this rung such ids fell straight to the ambient socket.
  const mirrored = $sessionStates.get()[sessionId]?.storedSessionId?.trim()

  return mirrored || null
}


// ---------------------------------------------------------------------------
// The FOCUSED session — one derivation, not another hand-maintained
// "$activeSession" sibling. session-focus resolves the interacted content zone,
// retaining it while the Sessions sidebar owns keyboard focus. Its active
// pane names the session: a `session-tile:<storedId>` pane IS that session,
// anything else falls back to the route-driven primary. Chrome that should
// follow the user between tiles (titlebar session title, statusbar context /
// timer / model) reads these instead of the primary-only atoms.
// ---------------------------------------------------------------------------

export const $focusedSessionIsTile = computed($focusedTreePaneId, active =>
  Boolean(active?.startsWith(TILE_PANE_PREFIX))
)

export const $focusedStoredSessionId = computed([$focusedTreePaneId, $selectedStoredSessionId], (active, selected) =>
  active?.startsWith(TILE_PANE_PREFIX) ? active.slice(TILE_PANE_PREFIX.length) : selected
)

/** Every session currently OPEN as a surface: the primary's selection plus
 *  every tile's stored id. The sidebar highlights all of them (the focused one
 *  at full strength, the rest dimmed) so a multi-pane workspace shows which
 *  chats are on screen, not just the one being typed into. */
export const $openStoredSessionIds = computed(
  [$selectedStoredSessionId, $sessionTiles],
  (selected, tiles) => new Set([...(selected ? [selected] : []), ...tiles.map(t => t.storedSessionId)])
)

/** Live runtime id of the focused session (a tile's bound runtime, else the
 *  primary's active session). */
export const $focusedRuntimeId = computed(
  [$focusedStoredSessionId, $selectedStoredSessionId, $activeSessionId, $sessionTiles],
  (focused, selected, primaryRuntime, tiles) => {
    if (focused && focused !== selected) {
      return tiles.find(t => t.storedSessionId === focused)?.runtimeId ?? null
    }

    return primaryRuntime
  }
)

/** The focused session's state slice (undefined while unresolved/unbound). */
export const $focusedSessionState = computed([$focusedRuntimeId, $sessionStates], (runtimeId, states) =>
  runtimeId ? states[runtimeId] : undefined
)
