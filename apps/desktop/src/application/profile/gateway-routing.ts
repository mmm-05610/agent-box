import { LOCAL_CONNECTION_ID } from '@hermes/shared'
import { batch } from 'nanostores'

import type { HermesConnection } from '@/global'
import { withTimeout } from '@/lib/with-timeout'
import { activeGatewayConnectionId, ensureGatewayForAgent, openGatewayForAgent } from '@/store/gateway'
import { normalizeProfileKey } from '@/store/profile/identity'
import { $newChatProfile } from '@/store/profile/new-chat-state'
import { $activeGatewayProfile, $gatewaySwapTarget } from '@/store/profile/runtime-route-state'
import { setComposerSelectionOwner, setConnection } from '@/store/session'

import { DESCRIPTOR_LOOKUP_TIMEOUT_MS, ensureGatewayProfile, gatewaySwitchInFlight, holdGatewaySwitch, waitForGatewaySwitch } from './runtime-selection'

// Which DOOR an intent dials, and the registry-agent door itself. A profile
// pick is not a bare name: "omar" picked while the remote registry source
// `homelab` is live means homelab::omar. These functions decide the
// (connectionId, profile) pair — or the legacy profile-only path (null) — and
// `ensureGatewayAgent` activates it, publishing the profile pointer and the
// descriptor in one frame exactly like the profile door.

/**
 * The registry source a PROFILE PICK dials, mirroring activateOnCurrentSource:
 * a live remote registry source keeps its connection id. Named picks on the
 * explicit `local` source (and the window primary) take the legacy
 * profile-only path (null) so the main process can resolve a per-profile
 * remote override before falling back to a local backend (#94166).
 *
 * Default on that same `local` source is different: it is also the window
 * primary's profile key. The legacy door would activate the remote primary on
 * a VPS-primary desktop, and Bots would show the VPS as Current Gateway.
 * Keep Default on `local` so This-device home stays on This device.
 */
export function profilePickConnectionId(profile?: string): null | string {
  const connectionId = activeGatewayConnectionId()

  if (connectionId && connectionId !== LOCAL_CONNECTION_ID) {
    return connectionId
  }

  if (connectionId === LOCAL_CONNECTION_ID) {
    const key = normalizeProfileKey(profile ?? $newChatProfile.get())

    return key === 'default' ? LOCAL_CONNECTION_ID : null
  }

  return null
}

// Route a profile pick at the source the user is LOOKING at. $profiles is the
// active gateway's list, so a pick made while a remote registry source is live
// names one of THAT source's profiles and must keep its connection id. Named
// picks on the primary and explicit "local" source stay on the legacy
// profile-only path so the main process can resolve a per-profile remote
// override before falling back to a local backend. Default on `local` stays
// on that source — see profilePickConnectionId.
export function activateOnCurrentSource(target: string): Promise<void> {
  const connectionId = profilePickConnectionId(target)

  return connectionId ? ensureGatewayAgent(connectionId, target) : ensureGatewayProfile(target)
}

// Registry-aware sibling of resolveConnectionForProfile: a connection-scoped
// agent's descriptor comes from getConnectionFor (its SOURCE connection), not
// getConnection (the local pool). Same best-effort, fail-open contract as
// resolveConnectionForProfile: a failed lookup resolves null and keeps the
// previous descriptor.
async function resolveConnectionForAgent(connectionId: string, profile: string): Promise<HermesConnection | null> {
  const getConnectionFor = window.hermesDesktop?.getConnectionFor

  if (!getConnectionFor) {
    return null
  }

  try {
    return await withTimeout(
      getConnectionFor({ connectionId, profile }),
      DESCRIPTOR_LOOKUP_TIMEOUT_MS,
      `Timed out resolving the connection descriptor for agent "${connectionId}:${profile}"`
    )
  } catch (err) {
    console.warn(
      `[profile] descriptor lookup for agent "${connectionId}:${profile}" failed; keeping the previous connection`,
      err
    )

    return null
  }
}

// Phase one of the two-phase source switch (store/connections
// selectConnection): dial the (connectionId, profile) socket WITHOUT activating
// it. The active route, $activeGatewayProfile and $connection are untouched, so
// the previous backend stays fully bound and painted while the target
// spawns/connects — a dead target fails HERE and the current source loses
// nothing. The follow-up ensureGatewayAgent then finds the socket open and
// activates it synchronously, which lets the caller sever the previous
// backend's session bindings and publish the new source in the same tick
// (#93937). An already-open target is a no-op.
export async function openGatewayAgent(connectionId: string, profile: string): Promise<void> {
  const connection = connectionId.trim()

  if (!connection) {
    return
  }

  await openGatewayForAgent(connection, normalizeProfileKey(profile), {
    activationLease: true,
    spawnPriority: 'foreground'
  })
}

export interface EnsureGatewayAgentOptions {
  beforeActivate?: () => boolean
  /** Revokes this caller's right to activate or publish after async work. */
  signal?: AbortSignal
}

function releaseWhenAborted(promise: Promise<void>, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return promise
  }

  if (signal.aborted) {
    return Promise.resolve()
  }

  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }

    const settle = (callback: () => void) => {
      signal.removeEventListener('abort', onAbort)
      callback()
    }

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      () => settle(resolve),
      error => settle(() => reject(error))
    )
  })
}

// Activate a connection-scoped agent's gateway — the (connectionId, profile)
// analogue of ensureGatewayProfile, and the door the SDK's ensureAgent goes
// through. Two invariants the raw store call (ensureGatewayForAgent) does not
// provide on its own:
//  - Every activation moves $activeGatewayProfile and resyncs $connection,
//    exactly like the profile path — otherwise activating an ALREADY-OPEN
//    registry agent left both describing the previous backend, routing
//    /api/fs, /api/media and image.attach to the wrong machine (the same
//    class as #46651) and pointing newSessionInProfile at the stale profile.
//  - Activations share the gatewaySwitch mutex with profile switches, so a
//    rapid agent↔profile (or agent↔agent) interleave can't finish out of
//    order and leave the EARLIER setActive() as the last write.
// Only a null connectionId falls through to the legacy profile path. Explicit
// `local` is a registry identity and must use the genuinely-local route.
//
// `beforeActivate` is the commit hook of the two-phase source switch
// (store/connections selectConnection). It runs INSIDE the serialized
// section, synchronously right before the socket is activated — i.e. after
// every earlier switch has published and before this one does — so the caller
// can sever the previous backend's session bindings at exactly that point
// (#93937). Returning false declines: nothing is activated or published, the
// mutex is released. That is how a switch superseded while queued behind
// another one steps aside without a destructive wipe. Not consulted on the
// null-connectionId profile fallthrough.
export async function ensureGatewayAgent(
  connectionId: null | string,
  profile: string,
  { beforeActivate, signal }: EnsureGatewayAgentOptions = {}
): Promise<void> {
  const target = normalizeProfileKey(profile)
  const connection = (connectionId ?? '').trim() || null

  if (!connection) {
    return ensureGatewayProfile(target)
  }

  // Serialize against any in-flight profile/agent switch (shared mutex). A
  // loop, not a single await: several waiters wake from the same settled
  // switch, and the first to re-acquire starts a new one the rest must also
  // wait out — otherwise two overlapping activations run interleaved.
  while (gatewaySwitchInFlight()) {
    await waitForGatewaySwitch()
  }

  if (signal?.aborted) {
    return
  }

  $gatewaySwapTarget.set(target)

  const activationWork = (async () => {
    if (signal?.aborted) {
      return
    }

    if (beforeActivate && !beforeActivate()) {
      return
    }

    // Descriptor resolves concurrently with the dial, same as the profile
    // path, so no await sits between the activation and the publication.
    const activation = signal
      ? ensureGatewayForAgent(connection, target, { signal })
      : ensureGatewayForAgent(connection, target)

    const [descriptor, activated] = await Promise.all([resolveConnectionForAgent(connection, target), activation])

    if (signal?.aborted) {
      return
    }

    if (!activated) {
      // The target stopped existing mid-dial (source edited/removed). Keep
      // every atom on the previous backend; the caller's surfaces re-check
      // what's active. Log so a dead agent click is diagnosable (#89622's
      // silence lesson) — but never fail the whole switch closed here.
      console.warn(`[profile] agent gateway activation for "${connection}:${target}" did not land`)

      return
    }

    // ONE publication frame, profile pointer + descriptor together. A null
    // descriptor keeps the previous one — fail open, resynced by
    // boot/reconnect later.
    batch(() => {
      if (descriptor) {
        setConnection(descriptor)
      }

      // The activated registry coordinate is authoritative even when the
      // best-effort descriptor lookup failed. Publish it before the profile
      // atom wakes forced model reseeds or a picker can persist a selection.
      setComposerSelectionOwner(connection, target)
      $activeGatewayProfile.set(target)
    })
  })()

  // Cancellation releases the mutex immediately; activationWork remains
  // observed and is ownership-guarded at both gateway and publication seams.
  await holdGatewaySwitch(releaseWhenAborted(activationWork, signal)).finally(() => {
    $gatewaySwapTarget.set(null)
  })
}
