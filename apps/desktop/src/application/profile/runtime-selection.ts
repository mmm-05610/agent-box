import { batch } from 'nanostores'

import type { HermesConnection } from '@/global'
import { withTimeout } from '@/lib/with-timeout'
import { $gateway, ensureGatewayForProfile, openGatewayForProfile, openSecondaryCount } from '@/store/gateway'
import { $poolLimits } from '@/store/pool-limits'
import { normalizeProfileKey } from '@/store/profile/identity'
import { $activeGatewayProfile, $gatewaySwapTarget } from '@/store/profile/runtime-route-state'
import { clearComposerSelectionOwner, setConnection } from '@/store/session'

// Making a PROFILE's backend the active gateway: lazily open its socket if it
// isn't live yet, publish the profile pointer and the connection descriptor
// together, and keep the backend warm around it. The registry-agent door
// (`application/profile/gateway-routing`) shares the switch slot below so the
// two can never finish out of order.

// Serializes every activation — profile or registry agent — against the active
// pointer. Callers wait the slot out and re-check their own precondition.
let gatewaySwitch: Promise<unknown> | null = null

/** True while an activation holds the switch slot. Synchronous BY DESIGN: a
 *  caller with nothing to wait for must not yield a tick before it acts — the
 *  agent door's commit hook has to run in the same tick as its call, and the
 *  two doors' ordering is pinned by profile-agent-activation.test.ts. */
export function gatewaySwitchInFlight(): boolean {
  return gatewaySwitch !== null
}

/** The in-flight activation as a promise that never rejects (whoever started
 *  the switch owns its rejection and awaits it again). Only meaningful after
 *  `gatewaySwitchInFlight()`; awaiting it on an idle slot would still defer a
 *  microtask, which is exactly what callers must not do. */
export function waitForGatewaySwitch(): Promise<void> {
  return (gatewaySwitch ?? Promise.resolve()).then(
    () => undefined,
    () => undefined
  )
}

/** Hold the switch slot for `work` and release it when `work` settles. */
export async function holdGatewaySwitch<T>(work: Promise<T>): Promise<T> {
  gatewaySwitch = work

  try {
    return await work
  } finally {
    gatewaySwitch = null
  }
}

// Descriptor lookups are IPC round-trips into Electron main. A wedged main
// (the #93454 class: a ticket mint that never answers) must not latch the
// gatewaySwitch mutex — and, through it, every later profile/source switch
// and the switch barrier — so they are bounded and fail open like any other
// lookup failure.
export const DESCRIPTOR_LOOKUP_TIMEOUT_MS = 20_000

// The target profile's connection descriptor (mode / baseUrl / …), resolved
// CONCURRENTLY with the socket work so the switch can publish the profile
// pointer and $connection in one frame. Without this, $connection seeds from
// the PRIMARY backend at boot and only refreshes on sleep/wake — activating a
// *background* profile left it describing the primary, with the wrong `mode`
// for everything that branches on local-vs-remote (#46651: path-based
// `image.attach` against a remote gateway, /api/fs/* and /api/media on the
// wrong machine).
//
// Best-effort BY DESIGN (fail open): a failed lookup resolves null, the prior
// descriptor stays, and boot/reconnect resyncs it later. The earlier
// atomic-publish series (#89483) failed the whole switch closed here instead,
// and its decline path turned routine registry churn into dead profile
// clicks (#89622) — reverted in #89785. Do not reintroduce fail-closed
// switching at this seam.
export async function resolveConnectionForProfile(profile: string): Promise<HermesConnection | null> {
  const getConnection = window.hermesDesktop?.getConnection

  if (!getConnection) {
    return null
  }

  try {
    return await withTimeout(
      getConnection(profile),
      DESCRIPTOR_LOOKUP_TIMEOUT_MS,
      `Timed out resolving the connection descriptor for profile "${profile}"`
    )
  } catch (err) {
    console.warn(`[profile] descriptor lookup for "${profile}" failed; keeping the previous connection`, err)

    return null
  }
}

// Make `profile`'s backend the active gateway, lazily opening its socket if it
// isn't live yet. Unlike the old single-socket swap, background profiles keep
// their sockets — so their sessions keep streaming concurrently. A null/empty
// target means "no explicit profile" → keep the current gateway (a plain new
// chat stays put; single-profile users never leave the primary).
export async function ensureGatewayProfile(profile: string | null | undefined): Promise<void> {
  if (profile == null || !String(profile).trim()) {
    // "No explicit profile" = use the current gateway. But if an explicit swap
    // (e.g. the user just picked a profile in the switcher) is still in flight,
    // let it settle first so a new chat doesn't race session.create against a
    // half-open socket and land on the wrong backend.
    if (gatewaySwitchInFlight()) {
      await waitForGatewaySwitch()
    }

    return
  }

  const target = normalizeProfileKey(profile)

  if (normalizeProfileKey($activeGatewayProfile.get()) === target && $gateway.get()?.connectionState === 'open') {
    return
  }

  // Serialize concurrent activations so rapid session switches cannot race the
  // active pointer. Re-acquire after every wake: multiple waiters can observe
  // the same settled switch, and the first one starts the next switch before
  // the others resume.
  while (gatewaySwitchInFlight()) {
    await waitForGatewaySwitch()
  }

  if (normalizeProfileKey($activeGatewayProfile.get()) === target && $gateway.get()?.connectionState === 'open') {
    return
  }

  $gatewaySwapTarget.set(target)

  await holdGatewaySwitch(
    (async () => {
      // ensureGatewayForProfile opens (or reuses) the target's socket and points
      // the active gateway at it — without closing the profile you came from.
      // The descriptor resolves concurrently so nothing awaits between the
      // activation and the publication below: the old post-activation
      // syncConnectionToActiveProfile await left a window where $gateway
      // already targeted the new backend while $connection still described the
      // previous one, and remote-aware paths announced the wrong mode (#46651).
      const [connection] = await Promise.all([resolveConnectionForProfile(target), ensureGatewayForProfile(target)])

      // ONE publication frame. batch() defers Nanostores' notifications to the
      // end of the callback, so the profile pointer and the connection
      // descriptor become visible together; a null descriptor (no bridge, or a
      // failed best-effort lookup) keeps the previous one — fail open.
      batch(() => {
        if (connection) {
          setConnection(connection)
        } else {
          clearComposerSelectionOwner()
        }

        $activeGatewayProfile.set(target)
      })
    })()
  ).finally(() => {
    $gatewaySwapTarget.set(null)
  })
}

// ── Hover-intent backend pre-warm ───────────────────────────────────────────
// A cold switch to a profile whose pool backend isn't running pays the full
// spawn (Python boot + port announce + readiness probe — measured ~2.5-3s)
// plus the socket connect before the sidebar can repopulate. The pointer
// entering a profile square in the rail signals the switch a few hundred ms
// before the click lands, so we run the same spawn + connect chain then
// (openGatewayForProfile — without activating). `ensureBackend` in the
// Electron main is idempotent (a pooled profile returns its existing
// connectionPromise), so the real switch joins the in-flight work instead of
// duplicating it — and a pre-warm for an already-open profile is a no-op.
// Throttled per profile so drive-by hovers can't spam spawn attempts; failures
// stay silent here and surface on the real switch, which owns retry/error UX.
const PREWARM_MIN_INTERVAL_MS = 60_000

const prewarmedAt = new Map<string, number>()

export function prewarmProfileBackend(name: string): void {
  const key = normalizeProfileKey(name)

  if (key === normalizeProfileKey($activeGatewayProfile.get())) {
    return
  }

  const now = Date.now()

  if (now - (prewarmedAt.get(key) ?? 0) < PREWARM_MIN_INTERVAL_MS) {
    return
  }

  // Prewarm/cap harmony (#91545): the pool caps spawned backends at the
  // configured max, and a spawn over the cap LRU-evicts the warmest idle
  // backend. A hover sweep across the rail therefore evicted backends for
  // profiles the user was about to click — prewarming caused the exact churn
  // it exists to prevent. Skip speculative spawns once every pool slot is
  // occupied by an open socket; the real click still spawns on demand, it
  // just doesn't get a head start.
  if (openSecondaryCount() + 1 > $poolLimits.get().maxBackends) {
    return
  }

  prewarmedAt.set(key, now)
  openGatewayForProfile(key).catch(() => undefined)
}

// Keepalive ping for the active pool backend so the main-process idle reaper
// (which can't see the direct renderer↔backend WS) spares it. No-op for the
// primary/default backend, which is never pooled.
export function touchActiveGatewayBackend(): void {
  // Always ping: the main process no-ops for non-pool (primary) backends, so we
  // don't need to know which profile is primary from here.
  const target = normalizeProfileKey($activeGatewayProfile.get())
  void window.hermesDesktop?.touchBackend?.(target).catch(() => undefined)
}
