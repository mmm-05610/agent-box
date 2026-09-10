import { registryBackendScopeKey } from '@hermes/shared'

import { g, isOpen, isPrimaryRegistryRoute, normKey } from './registry-state'
import {
  createSecondary,
  disposeSecondary,
  drainPendingConnectionRedial,
  foregroundPinned,
  gatewayForProfile,
  openSecondary,
  relayRetained
} from './secondary-pool'
import { isAttachedSharedRemote, requestOnPrimaryGateway } from './route-probes'

/** One-shot RPC facades over profile- and agent-scoped routes. */
/**
 * Send a gateway RPC through a named Desktop profile without foregrounding it.
 * Global-remote routes share the primary socket and need an explicit profile
 * param; dedicated pooled backends are already scoped by their descriptor.
 */
export async function requestGatewayForProfile<T>(
  profile: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<T> {
  const route = await gatewayForProfile(profile, true)

  try {
    if (!route.gateway) {
      throw new Error(`Hermes gateway unavailable for profile "${route.key}"`)
    }

    const routedParams = route.scopeProfile ? { ...params, profile: route.key } : params

    // Same arity contract as the ambient path in session-request-router: only
    // pass the deadline args through when the caller set them, so a plain
    // profile-routed RPC keeps its two-argument call shape.
    return await (timeoutMs === undefined && signal === undefined
      ? route.gateway.request<T>(method, routedParams)
      : route.gateway.request<T>(method, routedParams, timeoutMs, signal))
  } finally {
    route.release()
  }
}

/**
 * Send a gateway RPC through one registry source without activating it. The
 * composite (connectionId, profile) pool key prevents same-named agents on two
 * sources from sharing a socket. Only null/empty ids retain the v1 profile
 * resolver; explicit `local` is a registry source and must use getConnectionFor.
 */
export async function requestGatewayForAgent<T>(
  connectionId: null | string,
  profile: string,
  method: string,
  params: Record<string, unknown> = {},
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<T> {
  const key = normKey(profile)
  const scope = registryBackendScopeKey(connectionId, key)

  if (scope === key) {
    return requestGatewayForProfile<T>(key, method, params, timeoutMs, signal)
  }

  // A primary remote selected from the connection registry carries its source
  // id in the active connection descriptor. Requests for that exact
  // (connection, profile) already have an owning socket: the window primary.
  // Dialing a registry secondary here can resolve the same public endpoint to a
  // different backend/profile route, so durable session.resume reports
  // "session not found" while REST history from the primary remains visible.
  // Require both owner identities to agree before collapsing the route; a
  // different source or profile must retain its isolated secondary.
  if (isPrimaryRegistryRoute(connectionId, key)) {
    return requestGatewayForProfile<T>(key, method, params, timeoutMs, signal)
  }

  if (await isAttachedSharedRemote(connectionId, key)) {
    return requestOnPrimaryGateway<T>(method, { ...params, profile: key }, timeoutMs, signal)
  }

  if (!window.hermesDesktop?.getConnectionFor) {
    throw new Error('This Desktop build cannot dial registry connections. Update Hermes Desktop.')
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

  try {
    if (!isOpen(entry.gateway)) {
      await openSecondary(entry)
    }

    return await (timeoutMs === undefined && signal === undefined
      ? entry.gateway.request<T>(method, params)
      : entry.gateway.request<T>(method, params, timeoutMs, signal))
  } finally {
    entry.activeRequests = Math.max(0, entry.activeRequests - 1)

    if (
      !drainPendingConnectionRedial(entry) &&
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
