import { registryBackendScopeKey } from '@hermes/shared'

import {
  cancelTurnLeaseRelease,
  g,
  isOpen,
  isPrimaryRegistryRoute,
  normKey,
  turnLeaseKey
} from './registry-state'
import { isAttachedSharedRemote } from './route-probes'
import {
  createSecondary,
  disposeSecondary,
  drainPendingConnectionRedial,
  foregroundPinned,
  gatewayForProfile,
  openSecondary,
  relayRetained
} from './secondary-pool'

/** Hold pooled sockets open across multi-RPC sequences, relay drain ticks,
 *  and live turns. */
// ── Bot-relay socket retention (#93594) ─────────────────────────────────────
// The desktop bot relay RPCs EVERY registered connection on its drain loop.
// Each of those calls runs through requestGatewayForAgent's per-request lease,
// so a connection with no other consumer dialed a fresh WebSocket and tore it
// down again on every tick — a connect/disconnect pair per connection per tick
// flooding the gateway logs. While the relay is active, its routes hold a
// counted retention that keeps the pooled socket (and its existing
// scheduleReconnect/backoff machinery) alive across ticks; stopBotRelay (and
// plugin dispose) releases it, restoring the dispose-at-refcount-0 behavior.

/**
 * Pin the pooled socket for one relay route open across drain ticks. Returns
 * a once-only release. Local routes (null/empty or explicit `local` source)
 * are deliberately EXEMPT and get a no-op release: their Electron-spawned
 * backend answers to the idle reaper, and a relay pin would keep the
 * touch-loop pinging it forever, resurrecting backends the reaper is meant to
 * reclaim (see the retireLocalProfileGateways note). Local relay traffic is
 * either the primary socket (no churn) or a short-lived local dial — never
 * the remote reconnect flood this retention exists to stop.
 */
export function retainGatewayForRelay(connectionId: null | string, profile: string): () => void {
  const key = normKey(profile)
  const connection = String(connectionId ?? '').trim()

  if (!connection || connection === 'local') {
    return () => undefined
  }

  const scope = registryBackendScopeKey(connection, key)
  const entry = g.secondaries.get(scope) ?? createSecondary(key, connection)

  if (!Number.isFinite(entry.relayRetainCount)) {
    entry.relayRetainCount = 0
  }

  entry.relayRetainCount += 1
  entry.wantOpen = true

  let released = false

  return () => {
    if (released) {
      return
    }

    released = true
    entry.relayRetainCount = Math.max(0, (entry.relayRetainCount || 0) - 1)

    if (
      !drainPendingConnectionRedial(entry) &&
      entry.relayRetainCount === 0 &&
      entry.activeRequests === 0 &&
      !entry.retained &&
      !foregroundPinned(entry) &&
      g.activeKey !== entry.scope &&
      g.secondaries.get(entry.scope) === entry
    ) {
      disposeSecondary(entry)
      g.secondaries.delete(entry.scope)
    }
  }
}

/**
 * Hold `profile`'s socket open across a multi-RPC sequence without activating
 * it (#93602). Every requestGatewayForProfile/requestGatewayForAgent call is a
 * per-request lease: at refcount 0 a non-retained secondary is disposed, so a
 * session-scoped sequence (session.create → attach → prompt.submit) minted a
 * runtime id on a socket that closed between calls — the gateway detached the
 * session on WS disconnect and the next RPC hit 4001 "not in memory". Callers
 * acquire this lease before the first session-scoped RPC and release it in a
 * `finally`; the refcount keeps the socket (and the session it minted) alive
 * for the whole sequence. Primary/shared-primary routes return a no-op release.
 */
export async function retainGatewayForAgent(connectionId: null | string, profile: string): Promise<() => void> {
  const key = normKey(profile)
  const scope = registryBackendScopeKey(connectionId, key)

  if (scope === key) {
    // Plain-profile route: gatewayForProfile's request lease IS the retain —
    // hold it until the caller releases.
    const route = await gatewayForProfile(key, true)

    return route.release
  }

  if (isPrimaryRegistryRoute(connectionId, key) || (await isAttachedSharedRemote(connectionId, key))) {
    // Primary socket stays open for the window lifetime — no secondary to hold.
    return () => undefined
  }

  if (!window.hermesDesktop?.getConnectionFor) {
    // No registry dialing in this build — nothing to hold; the request path
    // will throw its own actionable error.
    return () => undefined
  }

  const entry = g.secondaries.get(scope) ?? createSecondary(key, connectionId)

  // Existing dev-HMR entries predate request leases/ownership.
  if (!Number.isFinite(entry.activeRequests)) {
    entry.activeRequests = 0
  }

  if (typeof entry.retained !== 'boolean') {
    entry.retained = true
  }

  entry.wantOpen = true
  entry.activeRequests += 1

  let released = false

  const release = () => {
    if (released) {
      return
    }

    released = true
    entry.activeRequests = Math.max(0, entry.activeRequests - 1)

    if (drainPendingConnectionRedial(entry)) {
      return
    }

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

  try {
    if (!isOpen(entry.gateway)) {
      await openSecondary(entry)
    }
  } catch (error) {
    release()
    throw error
  }

  return release
}

/**
 * Keep a routed Desktop prompt's socket alive after prompt.submit ACKs.
 *
 * Routed requests normally own a per-request lease. prompt.submit ACKs as soon
 * as the background turn starts, so releasing that lease at RPC completion
 * detaches the runtime session while the model is still working; the gateway's
 * 20-second orphan guard then interrupts it as `client_gone`. Hold one lease per
 * (route, runtime session) until message.complete/session.info settles the turn.
 */
export async function retainGatewayForSessionTurn(
  connectionId: null | string,
  profile: string,
  sessionId: string
): Promise<() => void> {
  // Primary events do not flow through a Secondary's terminal-event listener.
  // Registering a no-op lease here would leave a phantom key that can suppress
  // the real hold if this route is later re-homed as a secondary.
  if (isPrimaryRegistryRoute(connectionId, normKey(profile))) {
    return () => undefined
  }

  const scope = registryBackendScopeKey(connectionId, normKey(profile))
  const key = turnLeaseKey(scope, sessionId)

  cancelTurnLeaseRelease(key)

  // A busy-session redirect/queue can submit again while the original turn is
  // still retained. The existing lease owns that turn; the extra submit must
  // not replace or release it. The no-op means "another caller owns the
  // shared lease", not "this caller acquired a separately releasable lease".
  if (g.turnLeases.has(key)) {
    return () => undefined
  }

  const releaseRoute = await retainGatewayForAgent(connectionId, profile)
  let released = false

  const release = () => {
    if (released) {
      return
    }

    released = true

    if (g.turnLeases.get(key) === release) {
      g.turnLeases.delete(key)
    }

    cancelTurnLeaseRelease(key)
    releaseRoute()
  }

  g.turnLeases.set(key, release)

  return release
}
