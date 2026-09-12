import { LOCAL_CONNECTION_ID, registryBackendScopeKey, resolveGatewayWsUrl } from '@hermes/shared'

import { HermesGateway } from '@/api/client'
import { reconnectBackoffDelayMs } from '@/lib/reconnect-backoff'
import { RECONNECT_ATTEMPT_TIMEOUT_MS, withTimeout } from '@/lib/with-timeout'
import { stampSecondaryProfileOwner } from '@/store/session-event-provenance'

import {
  applyActive,
  beginGatewayActivation,
  dialPriority,
  dialProfile,
  g,
  gatewayActivationEpoch,
  isOpen,
  isPrimaryRegistryRoute,
  normKey,
  openedSecondaryScopes,
  publishActiveConnection,
  releaseTerminalTurnLease,
  releaseTurnLeasesForScope,
  reportGatewayState,
  type Secondary,
  setActive,
  type SpawnPriority
} from './registry-state'
import { isAttachedSharedRemote, sharedPrimaryRoute } from './route-probes'
import {
  publishSecondaryReopen,
  publishSecondaryReopened,
  type SecondaryOpenScope
} from './secondary-lifecycle'

/** Own the secondary socket entries and resolve routes onto them: create,
 *  open, reconnect, dispose, prune, pin accounting, and the open/ensure
 *  activation facades. */
// How long a mid-dial activation holds its prune lease: covers a cold pool
// backend spawn + socket connect with margin, while still letting a leaked
// lease expire quickly enough for the reaper to reclaim the entry.
const ACTIVATION_LEASE_MS = 30_000

export function clearTimer(entry: Secondary): void {
  if (entry.reconnectTimer !== null) {
    clearTimeout(entry.reconnectTimer)
    entry.reconnectTimer = null
  }
}

export async function openSecondary(entry: Secondary, spawnPriority: SpawnPriority = 'background'): Promise<void> {
  const desktop = window.hermesDesktop

  if (!desktop) {
    return
  }

  if (entry.connectPromise) {
    if (spawnPriority === 'foreground') {
      // Hydration may already own this dial as a background slot wait. Kick a
      // foreground IPC so main can promote it onto the reserved slot.
      void (
        entry.connectionId && desktop.getConnectionFor
          ? desktop.getConnectionFor({
              connectionId: entry.connectionId,
              profile: entry.profile,
              priority: 'foreground'
            })
          : desktop.getConnection(entry.profile, { priority: 'foreground' })
      ).catch(() => undefined)
    }

    await entry.connectPromise

    return
  }

  const pending = (async () => {
    // A secondary can be reopened directly by the next routed user action,
    // without passing through reconnectSecondary(). Its previous backend may
    // have been respawned, so every stored→runtime binding for this exact scope
    // is process-local stale state. Publish the reopen BEFORE connect can
    // publish `open`: otherwise an eager route effect / submit can send the old
    // runtime id in the narrow window between the new socket opening and
    // post-connect cleanup. The reaction to this fact (invalidate runtime
    // bindings, then reconcile busy claims once the socket is up) is session
    // state, and lives in application/gateway/reconnect-session-effects.
    const openedScopes = openedSecondaryScopes()
    const reopening = entry.openedOnce || entry.connection !== null || openedScopes.has(entry.scope)

    if (reopening) {
      publishSecondaryReopen(openScopeFor(entry))
    }

    // Registry-scoped entries dial through getConnectionFor when the bridge has
    // it. Local/legacy entries retain the existing getConnection path. Both are
    // IPC round-trips into the main process with no timeout of their own
    // (#93454) — a wedged main-process round-trip otherwise hangs this await
    // forever, latching entry.connectPromise so every routed action against
    // this secondary (SSH terminal, messaging DELETE, session send, …) never
    // settles either. Bound the same way use-gateway-boot.ts bounds the
    // primary's equivalent awaits.
    const conn =
      entry.connectionId && desktop.getConnectionFor
        ? await withTimeout(
            desktop.getConnectionFor({
              connectionId: entry.connectionId,
              profile: entry.profile,
              ...dialPriority(spawnPriority)
            }),
            RECONNECT_ATTEMPT_TIMEOUT_MS,
            `Timed out connecting to profile "${entry.profile}"`
          )
        : await withTimeout(
            dialProfile(desktop, entry.profile, spawnPriority),
            RECONNECT_ATTEMPT_TIMEOUT_MS,
            `Timed out connecting to profile "${entry.profile}"`
          )

    entry.connection = conn

    const wsDeps =
      entry.connectionId && desktop.getGatewayWsUrlFor
        ? {
            getGatewayWsUrl: () =>
              desktop.getGatewayWsUrlFor!({ connectionId: entry.connectionId, profile: entry.profile })
          }
        : entry.connectionId
          ? {}
          : desktop

    const wsUrl = await withTimeout(
      resolveGatewayWsUrl(wsDeps, conn),
      RECONNECT_ATTEMPT_TIMEOUT_MS,
      `Timed out re-minting the gateway WebSocket URL for profile "${entry.profile}"`
    )

    try {
      await entry.gateway.connect(wsUrl)
    } catch (error) {
      // Log the dial target for support, but RETHROW THE ORIGINAL ERROR —
      // reconnectSecondary classifies failures by message ("No connection
      // with id", "no longer exists") to fail-stop permanent conditions, and
      // wrapping here would break that. Callers decide surfacing (#81094).
      console.error(`[gateway] dial failed for scope="${entry.scope}" profile="${entry.profile}":`, error)
      throw error
    }

    entry.openedOnce = true
    openedScopes.add(entry.scope)

    // The socket is up: a failed dial threw above and never reaches this line,
    // so this fact is only ever published for a usable transport. It still runs
    // before `wantOpen` can close the socket and before publishActiveConnection,
    // matching the order a routed action observes.
    if (reopening) {
      publishSecondaryReopened(openScopeFor(entry))
    }

    if (!entry.wantOpen) {
      entry.gateway.close()

      return
    }

    if (g.activeKey === entry.scope) {
      publishActiveConnection(conn)
    }

    void desktop.touchBackend?.(entry.scope).catch(() => undefined)
  })()

  entry.connectPromise = pending

  try {
    await pending
  } finally {
    if (entry.connectPromise === pending) {
      entry.connectPromise = null
    }
  }
}

export function scheduleReconnect(entry: Secondary): void {
  if (entry.reconnecting || entry.reconnectTimer !== null || !entry.wantOpen) {
    return
  }

  // Full-jitter exponential backoff — same shape (and same reason: avoid a
  // reconnect storm against a restarting gateway) as the primary's.
  const delay = reconnectBackoffDelayMs(entry.reconnectAttempt)
  entry.reconnectAttempt += 1
  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = null
    void reconnectSecondary(entry)
  }, delay)
}

export async function reconnectSecondary(entry: Secondary): Promise<void> {
  if (entry.reconnecting || !entry.wantOpen || isOpen(entry.gateway)) {
    return
  }

  entry.reconnecting = true

  try {
    await openSecondary(entry)
    entry.reconnectAttempt = 0
  } catch (error) {
    // The registry no longer knows this connection (removed while we were
    // backing off), or Electron's deletion guard reports the profile itself
    // gone/mid-delete. Both are permanent for this scoped socket — retrying
    // forever can never succeed and hammers the spawn guard every backoff
    // tick (#88769). Fail-stop: dispose the entry and evict it instead of an
    // infinite 15s-cap retry loop.
    if ((entry.connectionId && isMissingConnectionError(error)) || isMissingProfileError(error)) {
      entry.reconnecting = false
      disposeSecondary(entry)

      if (g.secondaries.get(entry.scope) === entry) {
        g.secondaries.delete(entry.scope)
      }

      restoreActiveToPrimaryIfEvicted()

      return
    }
    // Other transport failure → fall through to the backoff below.
  } finally {
    entry.reconnecting = false

    if (entry.wantOpen && !isOpen(entry.gateway)) {
      scheduleReconnect(entry)
    }
  }
}

// Electron's getConnectionFor rejects with `No connection with id "…"` when
// the registry entry is gone. That is a permanent condition for the scoped
// socket, unlike transient transport errors.
function isMissingConnectionError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')

  return message.includes('No connection with id')
}

// Electron's spawn guard (assertLocalProfileCanStart) rejects with these when
// the profile's directory is gone or its DELETE is still in flight. For a
// renderer socket that condition is permanent: the backend it reconnects to
// can never come back, and every retry hammers the guard (#88769).
function isMissingProfileError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '')

  return message.includes('no longer exists') || message.includes('is being deleted')
}

/** The lifecycle identity of a pooled socket: the exact registry scope the pool
 *  keys it by, plus the Desktop profile it serves. A legacy entry carries no
 *  registry id, so it publishes the `local` pool identity the routed-session
 *  layer speaks for it. */
function openScopeFor(entry: Secondary): SecondaryOpenScope {
  return {
    connectionId: entry.connectionId || LOCAL_CONNECTION_ID,
    profile: entry.profile,
    scope: entry.scope
  }
}

export function createSecondary(profile: string, connectionId: null | string = null): Secondary {
  const gateway = new HermesGateway()
  const scope = registryBackendScopeKey(connectionId, profile)

  const entry: Secondary = {
    scope,
    profile,
    connectionId,
    connection: null,
    gateway,
    openedOnce: false,
    activeRequests: 0,
    connectPromise: null,
    offEvent: () => {},
    offState: () => {},
    reconnectTimer: null,
    reconnectAttempt: 0,
    reconnecting: false,
    pendingConnectionRedial: false,
    retained: false,
    relayRetainCount: 0,
    wantOpen: true,
    activationLeaseUntil: 0
  }

  // Events keep carrying the bare profile — session routing is profile-keyed
  // everywhere. A pool secondary with no registry connection has no exact
  // connection id, so stamp this closure-owned profile before registry fan-in;
  // the recorder must not promote an arbitrary wire `profile` field instead.
  entry.offEvent = gateway.onEvent(event => {
    const scopedEvent = stampSecondaryProfileOwner({ ...event, ...(connectionId ? { connectionId } : {}) }, profile)

    g.config?.onEvent(scopedEvent)
    releaseTerminalTurnLease(entry.scope, event)
  })
  entry.offState = gateway.onState(state => {
    reportGatewayState(scope, state)

    if (state === 'open') {
      entry.reconnectAttempt = 0
      clearTimer(entry)
    } else if (state === 'closed' || state === 'error') {
      // A dead socket cannot emit the terminal event that normally releases
      // its turn lease. Drop the orphaned lease before deciding whether this
      // route is still retained/active enough to reconnect.
      releaseTurnLeasesForScope(scope)

      if (entry.wantOpen) {
        scheduleReconnect(entry)
      }
    }
  })

  g.secondaries.set(scope, entry)

  return entry
}

// Resolve and open `profile`'s socket WITHOUT changing the active gateway.
// Shared global-remote profiles intentionally return the primary socket plus a
// request-scope flag; dedicated local/remote profiles use their pooled socket.
export async function gatewayForProfile(
  profile: string,
  leaseRequest = false,
  spawnPriority: SpawnPriority = 'background'
): Promise<{ gateway: HermesGateway | null; key: string; release: () => void; scopeProfile: boolean }> {
  const key = normKey(profile)
  const noRelease = () => undefined

  if (key === g.primaryProfile) {
    return { gateway: g.primaryGateway, key, release: noRelease, scopeProfile: false }
  }

  if (await sharedPrimaryRoute(key, spawnPriority)) {
    return { gateway: g.primaryGateway, key, release: noRelease, scopeProfile: true }
  }

  const entry = g.secondaries.get(key) ?? createSecondary(key)

  // Existing dev-HMR entries predate the request lease/ownership fields.
  if (!Number.isFinite(entry.activeRequests)) {
    entry.activeRequests = 0
  }

  if (typeof entry.retained !== 'boolean') {
    entry.retained = true
  }

  if (!leaseRequest) {
    entry.retained = true
  }

  entry.wantOpen = true

  if (leaseRequest) {
    entry.activeRequests += 1
  }

  let released = false

  const release = () => {
    if (!released && leaseRequest) {
      released = true
      entry.activeRequests = Math.max(0, entry.activeRequests - 1)

      if (
        entry.activeRequests === 0 &&
        !entry.retained &&
        !relayRetained(entry) &&
        !foregroundPinned(entry) &&
        g.activeKey !== entry.scope
      ) {
        disposeSecondary(entry)

        if (g.secondaries.get(entry.scope) === entry) {
          g.secondaries.delete(entry.scope)
        }
      }
    }
  }

  try {
    if (!isOpen(entry.gateway)) {
      await openSecondary(entry, spawnPriority)
    }
  } catch (error) {
    release()
    throw error
  }

  return { gateway: entry.gateway, key, release, scopeProfile: false }
}

/**
 * True when a foreground surface (mounted tile / primary thread) is bound to
 * this entry's scope (#93892). Registry-scoped entries match on their
 * composite key only; local/legacy entries also match on the bare profile —
 * the same key language pruneSecondaryGateways' keep-set speaks.
 */
export function foregroundPinned(entry: Secondary): boolean {
  const scopes = g.config?.foregroundScopes?.()

  if (!scopes) {
    return false
  }

  return scopes.has(entry.scope) || (!entry.connectionId && scopes.has(entry.profile))
}

/** True when the bot relay currently pins this entry open. Number guard:
 *  dev-HMR entries predate the field. */
export function relayRetained(entry: Secondary): boolean {
  return Number.isFinite(entry.relayRetainCount) && entry.relayRetainCount > 0
}

/**
 * Finish a material-edit redial once no request, relay, or foreground surface
 * still owns the old socket. Removal deliberately bypasses this drain: a
 * deleted source can never become valid again and must fail-stop immediately.
 */
export function drainPendingConnectionRedial(entry: Secondary): boolean {
  if (
    entry.pendingConnectionRedial !== true ||
    entry.activeRequests > 0 ||
    relayRetained(entry) ||
    foregroundPinned(entry) ||
    g.secondaries.get(entry.scope) !== entry
  ) {
    return false
  }

  entry.pendingConnectionRedial = false
  const wasActive = g.activeKey === entry.scope
  disposeSecondary(entry)
  g.secondaries.delete(entry.scope)

  const reopen = wasActive
    ? ensureGatewayForAgent(entry.connectionId, entry.profile)
    : openGatewayForAgent(entry.connectionId, entry.profile)

  void reopen.catch(() => undefined)

  return true
}

// Open `profile`'s socket WITHOUT making it active — the hover-intent pre-warm
// (application/profile/runtime-selection). Runs the same spawn + connect chain
    // as a real switch, so by
// click time ensureGatewayForProfile finds an open socket and just activates
// it. No scheduleReconnect on failure: a hover is speculative, so a dead
// backend must not start a background retry loop — the real switch owns retry
// and error UX. An already-open (or primary) profile is a no-op.
export async function openGatewayForProfile(
  profile: string,
  { spawnPriority = 'background' }: { spawnPriority?: SpawnPriority } = {}
): Promise<void> {
  await gatewayForProfile(profile, false, spawnPriority)
}

// ── Connection-scoped agents (multi-source roster) ─────────────────────────
// The (connectionId, profile) analogues of the profile functions above. A
// null connectionId falls straight through to the profile path. An explicit
// `local` id remains registry-scoped so it cannot inherit legacy remote v1
// routing. Feature-detected: without the Electron getConnectionFor door these
// throw, and roster surfaces disable non-local rows instead.

// `activationLease`: hold the same prune lease ensureGatewayForAgent holds for
// the whole dial. Phase one of the two-phase source switch (store/connections
// selectConnection) opens the target here and activates it right after; without
// the lease a live-work recompute during the cold spawn would dispose the entry
// mid-dial and the click would die (#89622). Plain pre-warms stay prunable —
// a hovered-but-never-activated socket must not be pinned off another source's
// live work.
export async function openGatewayForAgent(
  connectionId: null | string,
  profile: string,
  {
    activationLease = false,
    spawnPriority = 'background'
  }: { activationLease?: boolean; spawnPriority?: SpawnPriority } = {}
): Promise<void> {
  const scope = registryBackendScopeKey(connectionId, profile)

  if (scope === normKey(profile) || isPrimaryRegistryRoute(connectionId, profile)) {
    return openGatewayForProfile(profile, { spawnPriority })
  }

  if (await isAttachedSharedRemote(connectionId, profile, spawnPriority)) {
    if (!isOpen(g.primaryGateway)) {
      throw new Error('Hermes gateway unavailable')
    }

    return
  }

  if (!window.hermesDesktop?.getConnectionFor) {
    throw new Error('This Desktop build cannot dial registry connections. Update Hermes Desktop.')
  }

  const entry = g.secondaries.get(scope) ?? createSecondary(profile, connectionId)
  entry.retained = true
  entry.wantOpen = true

  if (activationLease) {
    // Stays held after a successful open: the activation that follows releases
    // it (applyActive path), and one that never comes lets it expire.
    entry.activationLeaseUntil = Date.now() + ACTIVATION_LEASE_MS
  }

  if (isOpen(entry.gateway)) {
    return
  }

  try {
    await openSecondary(entry, spawnPriority)
  } catch (error) {
    if (activationLease) {
      entry.activationLeaseUntil = 0
    }

    throw error
  }
}

export async function ensureGatewayForAgent(
  connectionId: null | string,
  profile: string,
  { signal }: { signal?: AbortSignal } = {}
): Promise<boolean> {
  const scope = registryBackendScopeKey(connectionId, profile)

  if (scope === normKey(profile) || isPrimaryRegistryRoute(connectionId, profile)) {
    if (signal?.aborted) {
      return false
    }

    await ensureGatewayForProfile(profile)

    return !signal?.aborted
  }

  if (await isAttachedSharedRemote(connectionId, profile, 'foreground')) {
    return Boolean(isOpen(g.primaryGateway) && !signal?.aborted)
  }

  if (!window.hermesDesktop?.getConnectionFor) {
    throw new Error('This Desktop build cannot dial registry connections. Update Hermes Desktop.')
  }

  const activationEpoch = beginGatewayActivation()

  let entry = g.secondaries.get(scope)

  if (!entry) {
    entry = createSecondary(profile, connectionId)
  }

  entry.retained = true
  entry.wantOpen = true
  // Lease the entry against the live-work pruner for the whole dial: the
  // switch target is not yet active and has no live sessions, so a prune
  // recompute firing mid-spawn would otherwise dispose it and this
  // activation would fail (#89622).
  entry.activationLeaseUntil = Date.now() + ACTIVATION_LEASE_MS

  if (!isOpen(entry.gateway)) {
    clearTimer(entry)
    entry.reconnectAttempt = 0

    try {
      await openSecondary(entry, 'foreground')
    } catch {
      scheduleReconnect(entry)
    }
  }

  // The activation is settling either way — release the prune lease.
  entry.activationLeaseUntil = 0

  // A timed-out owner may leave the dial running, but it no longer has the
  // right to move the foreground route when that work eventually settles.
  if (signal?.aborted) {
    return false
  }

  // A source edit/remove may dispose this entry while its dial is still in
  // flight. Only the still-registered, still-owned activation may publish --
  // and only when the WebSocket actually reached open: entry.connection is
  // set BEFORE the dial completes in openSecondary, so a transient first-dial
  // failure (caught above, left for scheduleReconnect) must not count as a
  // successful activation just because a connection descriptor exists
  // (issue #92265).
  const activated =
    entry.wantOpen &&
    g.secondaries.get(scope) === entry &&
    Boolean(entry.connection) &&
    isOpen(entry.gateway) &&
    applyActive(scope, activationEpoch)

  if (activated && entry.connection) {
    publishActiveConnection(entry.connection)
  }

  return activated
}

// Make `profile` the active gateway, lazily opening its socket if needed. The
// primary is a no-op fast path. Background sockets are never closed here.
export async function ensureGatewayForProfile(profile: string): Promise<void> {
  const key = normKey(profile)
  const activationEpoch = beginGatewayActivation()

  if (key === g.primaryProfile) {
    applyActive(key, activationEpoch)

    return
  }

  // Global-remote share (routing case 3): one remote host serves every
  // profile through the PRIMARY socket, scoped per request. Activate the
  // primary instead of dialing a doomed duplicate socket at the same
  // descriptor — $activeGatewayProfile still moves to `key`, so request
  // scoping and profile-aware surfaces behave identically.
  if (await sharedPrimaryRoute(key, 'foreground')) {
    applyActive(g.primaryProfile, activationEpoch)

    return
  }

  let entry = g.secondaries.get(key)

  if (!entry) {
    entry = createSecondary(key)
  }

  entry.retained = true
  entry.wantOpen = true
  // Lease the entry against the live-work pruner for the whole dial — the
  // profile-door twin of the agent path's lease above (#89622).
  entry.activationLeaseUntil = Date.now() + ACTIVATION_LEASE_MS

  try {
    if (!isOpen(entry.gateway)) {
      clearTimer(entry)
      entry.reconnectAttempt = 0

      try {
        await openSecondary(entry, 'foreground')
      } catch (error) {
        // #81094: a failed secondary dial must NOT fall through to setActive()
        // with a closed socket — that silently routes the user's messages to the
        // primary backend (cross-profile session writes). Keep the reconnect
        // schedule (transient failures still self-heal via the backoff below)
        // but RE-THROW so the profile-door caller surfaces the failure and skips
        // the activation. The agent-door twin (ensureGatewayForAgent) keeps its
        // boolean contract and is guarded by the activeGateway() null invariant.
        scheduleReconnect(entry)
        throw error
      }
    }
  } finally {
    // The activation is settling either way — release the prune lease.
    entry.activationLeaseUntil = 0
  }

  // Only publish when the WebSocket actually reached open -- entry.connection
  // is set before the dial completes, so a transient first-dial failure must
  // not count as a successful activation (issue #92265).
  if (
    entry.wantOpen &&
    g.secondaries.get(key) === entry &&
    isOpen(entry.gateway) &&
    applyActive(key, activationEpoch) &&
    entry.connection
  ) {
    publishActiveConnection(entry.connection)
  }
}

// Reconnect the active gateway after a transient request failure. Primary
// reconnects are owned by use-gateway-boot, so we only drive secondaries here.
export async function ensureActiveGatewayOpen(): Promise<HermesGateway | null> {
  if (g.activeKey === g.primaryProfile) {
    return g.primaryGateway
  }

  const entry = g.secondaries.get(g.activeKey)

  if (!entry) {
    return null
  }

  if (!isOpen(entry.gateway)) {
    await reconnectSecondary(entry)
  }

  if (!isOpen(entry.gateway)) {
    // A remote/registry secondary can still be ACTIVATING (backend waking,
    // socket dialing). Failing instantly turned a routine cold start into
    // "Hermes gateway is not connected" on the Sessions `+` action (#88880).
    // Wait a bounded beat for the in-flight activation instead of erroring;
    // a genuinely dead gateway still returns null when the window closes.
    const deadline = Date.now() + ACTIVE_GATEWAY_OPEN_WAIT_MS

    while (Date.now() < deadline && entry.wantOpen && g.secondaries.get(g.activeKey) === entry) {
      if (isOpen(entry.gateway)) {
        break
      }

      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }

  return isOpen(entry.gateway) ? entry.gateway : null
}

// How long ensureActiveGatewayOpen waits out an in-flight secondary
// activation before reporting the gateway as unavailable.
const ACTIVE_GATEWAY_OPEN_WAIT_MS = 8_000

// Recovery signal: nudge every live secondary back open. Power-resume/network
// signals can force sockets that still report open to retire before redialing.
export function reconnectSecondaryGateways({ forceOpenSockets = false }: { forceOpenSockets?: boolean } = {}): void {
  for (const entry of g.secondaries.values()) {
    if (!entry.wantOpen) {
      continue
    }

    if (isOpen(entry.gateway)) {
      if (!forceOpenSockets) {
        continue
      }

      entry.gateway.close()
    }

    entry.reconnectAttempt = 0
    clearTimer(entry)
    void reconnectSecondary(entry)
  }
}

// How many non-primary backends currently hold an open socket. Hover-intent
// prewarming consults this before spawning: a speculative spawn that pushes
// the pool past its cap causes the Electron main to LRU-evict a warm backend
// — often one the user is about to click — turning the prewarm into churn
// (the #91545 evict/respawn cascade). The active gateway's backend is
// primary-routed and never counts toward the pool cap.
export function openSecondaryCount(): number {
  let count = 0

  for (const entry of g.secondaries.values()) {
    if (isOpen(entry.gateway)) {
      count += 1
    }
  }

  return count
}

// Keep the idle reaper from killing a backend we still need: ping every live
// secondary. The active one is pinged separately (touchActiveGatewayBackend).
export function touchSecondaryGateways(): void {
  const desktop = window.hermesDesktop

  for (const entry of g.secondaries.values()) {
    if (entry.wantOpen) {
      void desktop?.touchBackend?.(entry.scope).catch(() => undefined)
    }
  }
}

// Tear a secondary down: stop its reconnect loop, detach listeners, close the
// socket. Caller handles removal from the map.
export function disposeSecondary(entry: Secondary): void {
  entry.wantOpen = false
  clearTimer(entry)
  entry.offEvent()
  entry.offState()
  entry.gateway.close()
}

// Invariant restore for every eviction path: if the active key names a
// secondary that no longer exists, fall back to the primary EXPLICITLY (atoms
// and composer state follow) instead of leaving a dangling key that
// activeGateway() can no longer resolve. Without this, a soft gateway switch
// (closeSecondaryGateways in use-gateway-boot) left activeKey pointing at an
// evicted registry scope and every call silently hit the primary backend.
function restoreActiveToPrimaryIfEvicted(): void {
  if (g.activeKey !== g.primaryProfile && !g.secondaries.has(g.activeKey)) {
    setActive(g.primaryProfile)
  }
}

// Close + evict secondaries whose scope is neither active nor in `keep`
// (scopes with a running / needs-input session). Bounds cost to live work.
// `keep` carries PROFILE names for local/legacy entries and composite
// registryBackendScopeKey(connectionId, profile) scopes for registry-sourced live
// work. A registry-scoped entry matches ONLY on its composite key: every
// source exposes a 'default' profile, so matching a non-local entry on the
// bare profile name kept gateway B's 'default' socket alive off gateway A's
// 'default' activity (and vice versa) — cross-connection attribution.
//
// Live work is not the only thing worth a socket: an idle tile still holds a
// resumed runtime on its owner's socket, and closing that socket makes the
// backend detach and orphan-reap the runtime, whose `session.reclaimed`
// unbinds the tile and re-resumes it on a fresh socket that the next
// recompute closes again — a spinner loop with no terminal state (#93892).
// Foreground-bound scopes come from the registry's `foregroundScopes` hook
// (foregroundPinned), not from `keep`, so every dispose path sees the same
// pin. `entry.retained` is deliberately NOT consulted here (see the field's
// doc).
export function pruneSecondaryGateways(keep: Set<string>): void {
  const now = Date.now()

  for (const [key, entry] of [...g.secondaries]) {
    if (drainPendingConnectionRedial(entry)) {
      continue
    }

    if (
      key === g.activeKey ||
      keep.has(key) ||
      (!entry.connectionId && keep.has(entry.profile)) ||
      // Bot-relay retention (#93594): the relay pins its remote routes for
      // its whole active lifetime; the live-work pruner must not undo that
      // pin between drain ticks or the socket churn returns.
      relayRetained(entry) ||
      // A mounted tile / the primary thread is bound to a runtime on this
      // socket (#93892) — pinned for as long as that surface is mounted.
      foregroundPinned(entry) ||
      // Mid-dial activation target: the profile being switched TO is not yet
      // active and has no live work, so without this lease any recompute
      // during its cold spawn disposed the entry and the click died silently
      // (#89622). Number guard: dev-HMR entries predate the field. Bounded:
      // an orphaned lease expires on its own.
      (Number.isFinite(entry.activationLeaseUntil) && entry.activationLeaseUntil > now)
    ) {
      continue
    }

    // The route is no longer live work. Release turn leases first so their
    // counted request holds cannot outlive a disposed route or leave a stale
    // release closure attached to a later same-key socket.
    releaseTurnLeasesForScope(key)

    if (g.secondaries.get(key) !== entry) {
      continue
    }

    if (entry.activeRequests > 0) {
      continue
    }

    disposeSecondary(entry)
    g.secondaries.delete(key)
  }

  restoreActiveToPrimaryIfEvicted()
}

function closeSecondariesWhere(shouldClose: (entry: Secondary) => boolean): void {
  for (const [scope, entry] of [...g.secondaries]) {
    if (!shouldClose(entry)) {
      continue
    }

    disposeSecondary(entry)
    g.secondaries.delete(scope)
  }

  restoreActiveToPrimaryIfEvicted()
}

function isLegacySecondary(entry: Secondary): boolean {
  // Every v2 registry route is created with an explicit connection id,
  // including the registry's `local` source. A missing id is reserved for the
  // old profile-only pool; the loose null check also retires HMR entries from
  // builds that predate the field instead of leaving an old legacy socket
  // behind during a mode apply.
  return entry.connectionId == null
}

/**
 * Close only profile sockets that follow the legacy v1 connection config.
 *
 * A global mode apply re-homes the primary backend, but registered connection
 * sockets are independent sources in the v2 registry. Closing every secondary
 * here would detach their sessions and arm `ws_orphan_reap` even though those
 * sources remain valid and reusable. Legacy profile sockets still need to be
 * retired because their endpoint is derived from the v1 config being changed.
 */
export function closeLegacySecondaryGateways(): void {
  closeSecondariesWhere(isLegacySecondary)
}

export function closeSecondaryGateways(): void {
  // Full teardown releases every routed-turn lease (class-2 #94284) and the
  // renderer-generation ledger; the predicate close leaves live sources'
  // leases alone (their sockets stay open).
  for (const timer of g.turnLeaseReleaseTimers.values()) {
    clearTimeout(timer)
  }

  g.turnLeaseReleaseTimers.clear()

  for (const release of [...g.turnLeases.values()]) {
    release()
  }

  g.turnLeases.clear()

  closeSecondariesWhere(() => true)
  openedSecondaryScopes().clear()
}

// A local profile can have two renderer-owned sockets: the legacy bare
// profile scope and the explicit `local` registry scope. Profile deletion
// stops their Electron backend processes, but a retained Secondary otherwise
// sees that shutdown as a transient disconnect and starts its reconnect loop,
// resurrecting the backend that was just deleted. Retire both local scopes
// before the DELETE request while preserving same-named agents on remote,
// cloud, or SSH connections.
export function retireLocalProfileGateways(profile: string): void {
  const name = String(profile || '').trim()

  if (!name) {
    return
  }

  const key = normKey(name)
  const scopes = new Set([key, registryBackendScopeKey('local', key)])
  let activeInvalidated = false

  // A profile-only owner is a claim about the legacy local pool, not durable
  // session identity. Clear it with that pool before a delayed session action
  // can recreate the deleted/old-name backend. Exact remote owners are
  // descriptors and remain routable even when they share this profile name.
  g.config?.onLocalProfileRetired?.(key)

  for (const scope of scopes) {
    const entry = g.secondaries.get(scope)

    if (!entry) {
      continue
    }

    activeInvalidated ||= scope === g.activeKey
    disposeSecondary(entry)
    g.secondaries.delete(scope)
  }

  restoreActiveToPrimaryIfEvicted()

  if (activeInvalidated) {
    g.config?.onActiveConnectionInvalidated?.(g.primaryProfile, gatewayActivationEpoch())
  }
}

// Registry lifecycle: a connection was removed or materially edited. Removal
// disposes every scoped secondary immediately (a removed remote/cloud source
// has no local process to die, so otherwise its WebSocket streams ghost
// events). A material edit redials each profile through the normal open path so
// fresh sockets target the NEW endpoint, but request/relay leases and mounted
// foreground runtimes keep their old socket until they drain; the active scope
// re-activates when its replacement is safe to publish.
export function disposeSecondariesForConnection(connectionId: string, opts: { redial?: boolean } = {}): void {
  const id = String(connectionId || '').trim()
  let activeInvalidated = false

  if (!id) {
    return
  }

  for (const [key, entry] of [...g.secondaries]) {
    if (entry.connectionId !== id) {
      continue
    }

    const wasActive = key === g.activeKey
    activeInvalidated ||= wasActive

    if (opts.redial && (entry.activeRequests > 0 || relayRetained(entry) || foregroundPinned(entry))) {
      entry.pendingConnectionRedial = true

      continue
    }

    disposeSecondary(entry)
    g.secondaries.delete(key)

    if (opts.redial) {
      const reopen = wasActive
        ? ensureGatewayForAgent(entry.connectionId, entry.profile)
        : openGatewayForAgent(entry.connectionId, entry.profile)

      void reopen.catch(() => undefined)
    }
  }

  if (activeInvalidated && !opts.redial) {
    setActive(g.primaryProfile)
    g.config?.onActiveConnectionInvalidated?.(g.primaryProfile, gatewayActivationEpoch())
  }
}
