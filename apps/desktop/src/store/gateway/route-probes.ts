import { RECONNECT_ATTEMPT_TIMEOUT_MS, withTimeout } from '@/lib/with-timeout'
import {
  dialPriority,
  dialProfile,
  g,
  isOpen,
  isPrimaryRegistryRoute,
  normKey,
  type SpawnPriority
} from './registry-state'

/** Classify whether a route is already served by an attached socket (the
 *  window primary or a shared remote) and run RPCs on that socket. */
/** True when `connectionId` is the window's already-attached source AND that
 *  source is a one-host-many-profiles remote (`sharedRemote`). Named member
 *  profiles on that host must reuse the primary socket — a registry secondary
 *  dials a second WebSocket at the same Tailscale URL, which accept/closes in
 *  ~30ms (`messages=1`) and never runs `session.create` (#96493). Isolated
 *  SSH/pooled backends (`sharedRemote: false`) still get their own secondary. */
export async function isAttachedSharedRemote(
  connectionId: null | string,
  profile: string,
  spawnPriority: SpawnPriority = 'background'
): Promise<boolean> {
  const id = String(connectionId ?? '').trim()
  const key = normKey(profile)

  if (!id || !g.primaryConnectionId || id !== g.primaryConnectionId) {
    return false
  }

  if (isPrimaryRegistryRoute(id, key)) {
    return false
  }

  const desktop = window.hermesDesktop

  if (!desktop?.getConnectionFor) {
    return false
  }

  try {
    const conn = await withTimeout(
      desktop.getConnectionFor({ connectionId: id, profile: key, ...dialPriority(spawnPriority) }),
      RECONNECT_ATTEMPT_TIMEOUT_MS,
      `Timed out resolving shared-remote route for "${key}"`
    )

    return Boolean(conn && typeof conn === 'object' && (conn as { sharedRemote?: boolean }).sharedRemote === true)
  } catch {
    // Probe failed. A secondary at this already-attached source is the #96493
    // ghost WebSocket (accept/close, messages=1). Prefer the primary until a
    // later probe can prove isolation (`sharedRemote: false`). Isolated SSH
    // still dials its own socket when getConnectionFor succeeds.
    return true
  }
}

export async function requestOnPrimaryGateway<T>(
  method: string,
  params: Record<string, unknown>,
  timeoutMs?: number,
  signal?: AbortSignal
): Promise<T> {
  const gateway = g.primaryGateway

  if (!gateway || !isOpen(gateway)) {
    throw new Error('Hermes gateway unavailable')
  }

  return timeoutMs === undefined && signal === undefined
    ? gateway.request<T>(method, params)
    : gateway.request<T>(method, params, timeoutMs, signal)
}

// True when `profile`'s backend route resolves to the SHARED primary backend
// (global-remote case 3 in resolveProfileBackendRoute). Both shared-primary and
// pooled descriptors carry `profile` so WebSocket URL minting targets the right
// profile. `sharedPrimary` is the explicit discriminator; treating every tagged
// descriptor as shared strands local/own-remote pooled profiles on the default
// socket. Dialing a second socket at the shared descriptor is wrong — over SSH
// the second dial fails (tunnel/token are per-backend) and the closed socket
// poisons the active gateway with "not connected" even though the primary is
// open right next to it.
export async function sharedPrimaryRoute(profile: string, spawnPriority: SpawnPriority = 'background'): Promise<boolean> {
  const desktop = window.hermesDesktop

  if (!desktop) {
    return false
  }

  try {
    // Unbounded IPC round-trip into main (#93454) — a wedge here must reject
    // like any other failure, not hang the route decision forever, since
    // every caller (gatewayForProfile → requestGatewayForProfile/Agent) awaits
    // this before it can fall back to dialing a secondary.
    // This is the FIRST dial main sees for a user open, so it must already
    // carry the foreground priority — otherwise the spawn it starts queues as
    // background and the click waits out this probe before being promoted.
    const conn = await withTimeout(
      dialProfile(desktop, profile, spawnPriority),
      RECONNECT_ATTEMPT_TIMEOUT_MS,
      `Timed out resolving the shared-primary route for profile "${profile}"`
    )

    return Boolean(conn && typeof conn === 'object' && (conn as { sharedPrimary?: boolean }).sharedPrimary === true)
  } catch {
    return false
  }
}
