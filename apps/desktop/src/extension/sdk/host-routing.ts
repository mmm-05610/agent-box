import { isLegacyRestAllowed } from '@/api/legacy-rest'
import { deleteProfile } from '@/api/profiles'
import { refreshProfiles } from '@/application/profile/catalog'
import { ensureGatewayAgent } from '@/application/profile/gateway-routing'
import { selectProfile } from '@/application/profile/navigation'
import {
  activeGatewayConnectionId,
  openGatewayForAgent,
  openGatewayForProfile,
  requestGatewayForAgent,
  requestGatewayForProfile,
  retainGatewayForAgent,
  retainGatewayForRelay,
  retireLocalProfileGateways
} from '@/store/gateway'
import { $activeGatewayProfile, $profiles, normalizeProfileKey, setActiveProfile } from '@/store/profile'
import { dropTilesForProfile } from '@/store/session-states'

import { $activeConnectionId } from './host-state'

export interface PluginProfileRoute {
  connectionId: string
  mode: 'local' | 'remote'
  /** Desktop profile used to select the connection route. */
  profile: string
  /** Backend Hermes profile served by that route. */
  targetProfile: string
}



async function requestPluginProfile<T>(
  route: PluginProfileRoute | string,
  method: string,
  params: Record<string, unknown>,
  timeoutMs?: number
): Promise<T> {
  if (typeof route !== 'string') {
    if (!route.connectionId.trim() || !route.profile.trim() || !route.targetProfile.trim()) {
      throw new Error('Profile route must include connectionId, profile, and targetProfile')
    }

    // Omit the bound entirely when unset so callers stay on the pool default.
    return timeoutMs === undefined
      ? requestGatewayForAgent<T>(route.connectionId, route.profile, method, params)
      : requestGatewayForAgent<T>(route.connectionId, route.profile, method, params, timeoutMs)
  }

  const getAgentRoster = window.hermesDesktop?.getAgentRoster

  if (!getAgentRoster) {
    return timeoutMs === undefined
      ? requestGatewayForProfile<T>(route, method, params)
      : requestGatewayForProfile<T>(route, method, params, timeoutMs)
  }

  const roster = await getAgentRoster()
  const profile = route.trim() || 'default'
  const soleLocalSource = roster.sources.length === 1 && roster.sources[0]?.kind === 'local'

  // The string overload is compatibility-only. A sole local registry is the
  // one topology where a profile name is intrinsically unambiguous, even when
  // its live enumeration transiently failed. Any additional source requires a
  // descriptor because an undialed/unreachable source may expose the same name.
  if (soleLocalSource) {
    return timeoutMs === undefined
      ? requestGatewayForProfile<T>(profile, method, params)
      : requestGatewayForProfile<T>(profile, method, params, timeoutMs)
  }

  throw new Error(
    `Profile "${profile}" requires a route descriptor from host.profileRoutes(); profile-only routing is limited to legacy/local profiles.`
  )
}

/** Re-read Electron's current registry before retrying an exact-owner wake.
 *  A route that was removed or replaced while the first hydration wait ran is
 *  no longer authority to touch that backend, even when its labels still look
 *  identical. */
export async function pluginRouteStillRegistered(route: PluginProfileRoute): Promise<boolean> {
  const getProfileRoutes = window.hermesDesktop?.getProfileRoutes

  if (!getProfileRoutes) {
    return false
  }

  try {
    const routes = await getProfileRoutes($profiles.get().map(profile => profile.name))

    return routes.some(
      candidate =>
        candidate.connectionId === route.connectionId &&
        candidate.profile === route.profile &&
        candidate.targetProfile === route.targetProfile
    )
  } catch {
    return false
  }
}


// Wait for a profile switch, but never longer than the wake budget.
//
// ensureGatewayProfile awaits the store's dial, and HermesGateway.connect() has
// no dial timeout of its own: a backend that accepts the socket and then never
// completes the handshake leaves this promise pending for the life of the
// window. That is not merely a slow open. waitForFocusedSessionHydration arms
// the only timer on this path, and it is armed AFTER this await returns - so an
// unbounded activation means the wake never settles at all, and the pane wedges
// with no error, no Retry and no timeout (#89556: `ws accepted` in the gateway
// log with no matching `ws closed`).
//
// The activation gets its OWN budget rather than sharing the hydration one. A
// cold profile backend can legitimately spend most of the hydration budget
// painting a large transcript - that race is already tight enough to lose
// (#89617) - so charging activation to the same clock would turn a wedge into a
// regression. The trade is that a wake that is slow in BOTH phases can now take
// up to twice the budget before it surfaces; that is a maintainer call and is
// called out in the PR rather than buried here.
// The caller supplies the dial itself, because WHICH backend to open is a
// routing decision (a workspace switch moves chrome; a plain bot navigation
// only opens the gateway) while the deadline enforced here is the same either
// way.
export async function awaitProfileActivation(
  dial: () => Promise<void>,
  targetProfile: string,
  timeoutMs: number
): Promise<void> {
  const activation = dial()
  let timer: number | undefined

  try {
    await Promise.race([
      activation,
      new Promise<never>((_resolve, reject) => {
        // Same message shape as the hydration timeout on purpose: openSession's
        // catch keys the core stranded-session surface off this prefix, and a
        // wedged dial wants exactly that surface. The phase is distinguished in
        // the [bot-wake] support log, not in the user-facing string.
        timer = window.setTimeout(
          () => reject(new Error(`Timed out loading ${targetProfile}'s session history.`)),
          timeoutMs
        )
      })
    ])
  } finally {
    if (timer !== undefined) {
      window.clearTimeout(timer)
    }
  }

  // No extra catch on the abandoned dial: an in-flight activation has no
  // cancellation handle and keeps running after the budget expires, but
  // Promise.race subscribes to every input, so a rejection that lands after the
  // race has settled is already handled and cannot escape as an unhandled
  // rejection. An explicit `activation.catch()` here was dead code - verified
  // by mutation: removing it changed no test outcome.
}


/** Profile/agent routing doors: warm, ensure, enumerate, request and
 *  retain sockets on exact (connection, profile) routes. */
export const hostProfileRouting = {
  /** Pre-dial a profile's gateway socket in the background — pool-only, no
   *  activation, no navigation, no scope change (openGatewayForProfile; it
   *  already no-ops for shared-remote routes and the primary). Roster UIs
   *  call this after mount so the FIRST click on an agent doesn't pay the
   *  whole backend spawn + socket dial latency. Fire-and-forget: failures
   *  are swallowed — the click path re-runs its own ensure and surfaces
   *  errors properly. */
  warmProfile: (profile: string): void => {
    const name = (profile ?? '').trim()

    if (!name || name === $activeGatewayProfile.get()) {
      return
    }

    void openGatewayForProfile(name).catch(() => undefined)
  },


  /** Delete a profile THROUGH the desktop's teardown-routed REST path — the
   *  same door core surfaces use (DeleteProfileDialog). Electron intercepts
   *  the DELETE, tears down that profile's pool/primary backend first, and
   *  routes the follow-up request away from it, so a live (or hover-warmed)
   *  backend can't hold the profile dir open or respawn mid-delete and
   *  resurrect the directory (issue #52279). Plugins must prefer this over
   *  `cli.exec ['profile','delete',…]`, which bypasses that interception
   *  entirely. When the deleted profile was the live gateway's, the app is
   *  re-homed to the default profile — same semantics as the core dialog.
   *  Rejects with the backend's error when the delete fails. */
  deleteProfile: async (profile: string | PluginProfileRoute): Promise<void> => {
    const route =
      typeof profile === 'string'
        ? null
        : {
            ...profile,
            connectionId: String(profile.connectionId || '').trim(),
            profile: String(profile.profile || '').trim(),
            targetProfile: String(profile.targetProfile || '').trim()
          }

    const name = typeof profile === 'string' ? profile.trim() : route?.profile || ''

    if (route && (!route.connectionId || !route.profile || !route.targetProfile)) {
      throw new Error('deleteProfile: route requires connectionId, profile, and targetProfile')
    }

    const targetProfile = route?.targetProfile || name
    // A name-only call is ambient, not local: Bot Mode's active SSH roster
    // rows deliberately use the ambient gateway door and therefore carry no
    // explicit owner route. Preserve the active registry connection so the
    // profile teardown and DELETE both land on the VPS instead of retiring the
    // unrelated local pool and leaving the warmed remote backend to recreate
    // the deleted profile.
    const ambientConnectionId = route ? null : String(activeGatewayConnectionId() || '').trim()

    const ambientRemoteConnectionId =
      ambientConnectionId && ambientConnectionId !== 'local' ? ambientConnectionId : null

    if (!name) {
      throw new Error('deleteProfile: profile name required')
    }

    if (normalizeProfileKey(targetProfile) === 'default') {
      throw new Error('The default profile cannot be deleted.')
    }

    // Capture before the delete; re-home after so our write is the last one
    // (mirrors DeleteProfileDialog — a refreshActiveProfile racing the dying
    // backend can't clobber the pill back to the deleted profile).
    const wasActive = route
      ? route.connectionId === ($activeConnectionId.get() || '') &&
        normalizeProfileKey(route.profile) === normalizeProfileKey($activeGatewayProfile.get())
      : normalizeProfileKey(name) === normalizeProfileKey($activeGatewayProfile.get())

    // A hover-warmed Bot Mode row owns a retained renderer socket. Retire it
    // before Electron stops the profile backend so the socket closure cannot
    // schedule a reconnect that resurrects the deleted profile.
    if (route?.mode === 'local' || (!route && !ambientRemoteConnectionId)) {
      retireLocalProfileGateways(targetProfile)
    }

    await deleteProfile(
      targetProfile,
      route
        ? { connectionId: route.connectionId, profile: route.profile }
        : ambientRemoteConnectionId
          ? { connectionId: ambientRemoteConnectionId, profile: name }
          : undefined
    )

    // The profile is gone. Drop its persisted tiles now — a leftover tile
    // restores on relaunch and re-creates the deleted profile (hermes-agent#94235).
    dropTilesForProfile(
      route ? route.profile : name,
      route
        ? { connectionId: route.connectionId, profile: route.profile, targetProfile: route.targetProfile }
        : undefined
    )

    // The profile rail paints from the shared $profiles cache; without a
    // refresh the deleted profile's badge survives and clicking it starts a
    // doomed spawn-retry loop against Electron's deletion guard (#88769).
    // Best-effort: the delete itself already succeeded.
    await refreshProfiles().catch(() => undefined)

    if (wasActive) {
      selectProfile('default')
      setActiveProfile('default')
    }
  },


  /** Registry connection id serving the gateway `host.request` currently hits
   *  — null for the local/legacy primary path. Roster UIs need this to tell
   *  "a row from the backend I'm already showing" apart from "a row from
   *  another source": two connections can both expose a 'default' profile,
   *  and matching by profile name alone duplicates every agent when the
   *  active gateway is a registered remote. Re-read per use — it changes on
   *  profile/agent swaps. */
  activeConnectionId: (): null | string => activeGatewayConnectionId(),


  /** The registered connection list (labels, kinds, primary) — token bytes
   *  never included. Rejects on Desktop builds without the registry. */
  connections: async () => {
    const bridge = window.hermesDesktop?.connections

    if (!bridge) {
      throw new Error('This Desktop build has no connection registry. Update Hermes Desktop.')
    }

    const registryPayload = await bridge.list()
    const rows = Array.isArray(registryPayload?.connections) ? registryPayload.connections : []

    return rows.map(connection => ({ ...connection, primary: connection.id === registryPayload.primary }))
  },


  /** The union agent roster across every registered connection: one row per
   *  (source, profile) with the pre-computed @name-device handle for
   *  duplicates. Sources that are unreachable (or ssh connect-on-demand)
   *  appear in `sources` with an error instead of failing the call. */
  agents: async () => {
    const roster = window.hermesDesktop?.getAgentRoster

    if (!roster) {
      throw new Error('This Desktop build cannot enumerate multi-source agents. Update Hermes Desktop.')
    }

    return roster()
  },


  /** Pre-dial an agent's socket on ITS source — the (connection, profile)
   *  analogue of warmProfile. Fire-and-forget, same semantics.
   *  `undefined` is accepted alongside `null` because a roster row's
   *  `connectionId` is optional; both mean "no explicit source". */
  warmAgent: (connectionId: null | string | undefined, profile: string): void => {
    void openGatewayForAgent(connectionId ?? null, (profile ?? '').trim() || 'default').catch(() => undefined)
  },


  /** Activate an agent's gateway (dialing it if needed) so subsequent
   *  host.request calls hit that agent's backend. Goes through the store's
   *  serialized activation path so $connection / $activeGatewayProfile follow
   *  and rapid switches can't land out of order. The local source falls
   *  through to the profile path — single-source plugins keep working
   *  against older behavior unchanged. */
  ensureAgent: async (connectionId: null | string | undefined, profile: string): Promise<void> =>
    ensureGatewayAgent(connectionId ?? null, (profile ?? '').trim() || 'default'),


  /** Credential-free routes across every current registry source. Identity is
   *  the (connectionId, profile) pair; endpoint/auth details stay in Electron. */
  profileRoutes: async () => {
    const desktop = window.hermesDesktop
    const getProfileRoutes = desktop?.getProfileRoutes

    if (!getProfileRoutes) {
      throw new Error('Hermes Desktop connection routing unavailable')
    }

    let profiles = $profiles.get()

    // The route inventory is derived from the legacy profile catalog, and
    // `refreshProfiles()` is a legacy REST read (`GET /api/profiles`). Under
    // the AgentBox product runtime the renderer's legacy REST door is closed
    // (`applyProductRuntimePolicy`), so the fetch is guaranteed to be refused:
    // it must not be ISSUED at all. The cached inventory is exactly what the
    // failure path below already falls back to — and Electron always adds the
    // primary Desktop profile — so the returned route set is the same one the
    // doomed request used to produce.
    if (isLegacyRestAllowed()) {
      try {
        profiles = await refreshProfiles()
      } catch {
        // Route inventory is a read: a transient backend failure falls back to
        // the last cache. Electron always adds the primary Desktop profile.
      }
    }

    return getProfileRoutes(profiles.map(profile => profile.name))
  },


  /** Gateway JSON-RPC through a credential-free route descriptor without
   *  foregrounding it. Passing a bare profile is the v1/local compatibility
   *  overload; registry callers must pass the descriptor so duplicate names
   *  remain unambiguous.
   *
   *  `timeoutMs` opts one call out of the pool's generic deadline (#93911: a
   *  method whose backend contract is minutes long, such as `bot_relay.deliver`,
   *  otherwise dies at 30s and reports an unclassified failure). Leave it unset
   *  to keep the default. */
  requestProfile: async <T>(
    route: PluginProfileRoute | string,
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs?: number
  ): Promise<T> => requestPluginProfile<T>(route, method, params, timeoutMs),


  /** Pin a route's pooled gateway socket open across repeated `requestProfile`
   *  calls (#93594: the bot-relay drain loop was dialing and tearing down a
   *  fresh WebSocket per registered connection per tick). Returns a once-only
   *  release. Local routes are exempt (no-op release) so the idle reaper can
   *  still reclaim spawned local backends. Feature-detect on older desktops
   *  (`typeof host.retainProfileSocket === 'function'`). */
  retainProfileSocket: (route: PluginProfileRoute | string): (() => void) => {
    if (typeof route === 'string' || !route) {
      // Bare-profile compatibility overload: local/legacy routing — exempt.
      return () => undefined
    }

    return retainGatewayForRelay(route.connectionId, route.profile)
  },


  /** Hold a route's pooled socket open across a multi-RPC, session-scoped
   *  sequence (#93602). Each requestProfile call is its own request lease, so
   *  a non-retained secondary socket closes at refcount 0 between calls — and
   *  the gateway reaps any runtime session that socket minted, failing the
   *  next RPC with 4001. Acquire before the first session-scoped RPC, release
   *  (idempotent) in a `finally`. Feature-detect: older hosts lack this. */
  retainProfile: async (route: PluginProfileRoute | string): Promise<() => void> => {
    if (typeof route !== 'string') {
      if (!route.connectionId.trim() || !route.profile.trim()) {
        throw new Error('Profile route must include connectionId and profile')
      }

      return retainGatewayForAgent(route.connectionId, route.profile)
    }

    return retainGatewayForAgent(null, route.trim() || 'default')
  },

}
