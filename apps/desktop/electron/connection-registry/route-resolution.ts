import type { ConnectionRegistry, RegistryConnection, RegistryLocalRoute, ResolvedConnectionDescriptor} from './identity';
import { backendScopePrefix, LOCAL_CONNECTION_ID, resolvedConnectionId } from './identity'

/** Route resolution: primary reuse, local routes, and enumeration gates. */

export interface ReuseMatchingPrimarySshBackendOptions {
  connectionId: null | string | undefined
  effectiveFingerprint: (source: RegistryConnection) => Promise<string>
  ensurePrimary: () => Promise<ResolvedConnectionDescriptor>
  profile: null | string | undefined
  registry: ConnectionRegistry
  source: RegistryConnection
}

/**
 * Reuse the v1 window SSH backend only when its actual dialing identity matches
 * the registry primary. Resolving that descriptor may boot the primary; a
 * mismatch returns null without reusing it so the caller continues with its
 * separately scoped registry backend. A matching descriptor is returned
 * unchanged and the caller may re-stamp routing fields such as profile and
 * connectionId. Guards run before either async dependency so secondary
 * profiles and sources never bootstrap the primary.
 */
export async function reuseMatchingPrimarySshBackend({
  connectionId,
  effectiveFingerprint,
  ensurePrimary,
  profile,
  registry,
  source
}: ReuseMatchingPrimarySshBackendOptions): Promise<null | ResolvedConnectionDescriptor> {
  const id = String(connectionId ?? '').trim()
  const profileKey = String(profile ?? '').trim() || 'default'

  if (profileKey !== 'default' || !id || id !== registry.primary || source.id !== id || source.kind !== 'ssh') {
    return null
  }

  let sourceFingerprint

  try {
    sourceFingerprint = String(await effectiveFingerprint(source)).trim()
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)

    throw new Error(
      `Could not resolve effective SSH config for connection "${source.label}" (${source.id}) via ssh -G: ${detail}`,
      { cause }
    )
  }

  const descriptor = await ensurePrimary()
  const activeSsh = descriptor.mode === 'remote' && descriptor.remoteKind === 'ssh' ? descriptor.ssh : null
  const rootProfile = (value: unknown) => String(value || '').trim() || 'default'

  if (
    !sourceFingerprint ||
    !activeSsh ||
    sourceFingerprint !== String(activeSsh.effectiveConfigFingerprint || '').trim() ||
    String(source.remoteHermesPath || '').trim() !== String(activeSsh.remoteHermesPath || '').trim() ||
    rootProfile(source.remoteProfile) !== rootProfile(activeSsh.remoteProfile)
  ) {
    return null
  }

  return descriptor
}

/**
 * Whether a registry-scoped request names the already-running primary backend.
 * Main uses this before opening a pooled registry backend so the registry's
 * primary SSH/remote source cannot spawn a second isolated server for the same
 * descriptor.
 */
export function registrySourceOwnsPrimaryBackend(
  registry: ConnectionRegistry,
  connectionId: null | string | undefined,
  descriptor: ResolvedConnectionDescriptor
): boolean {
  const id = String(connectionId ?? '').trim()

  return Boolean(id) && id === registry.primary && resolvedConnectionId(registry, descriptor) === id
}


export function resolveRegistryLocalRoute(
  profile: null | string | undefined,
  opts: { globalRemote?: boolean; profileRemoteOverride?: boolean } = {}
): RegistryLocalRoute {
  const profileKey = String(profile ?? '').trim() || 'default'

  // A per-profile SSH/remote override is an explicit per-profile routing
  // decision: the override owns this profile's backend, so the 'local' entry
  // must delegate to the legacy profile route (which resolves the override),
  // not spawn a forced-local child. Forcing local here is the #90477 split:
  // the roster lists the profile via its override, but opening the thread
  // spawned a local backend that fails when the profile doesn't exist locally.
  if (opts.profileRemoteOverride) {
    return { delegate: true, poolKey: profileKey }
  }

  if (opts.globalRemote) {
    return { delegate: false, poolKey: `${backendScopePrefix(LOCAL_CONNECTION_ID)}${profileKey}` }
  }

  return { delegate: true, poolKey: profileKey }
}

/**
 * Whether the roster enumeration should SKIP the registry's local entry as
 * connect-on-demand. True when the local source is the forced-local route
 * (primary resolves remote — enumerating would spawn a local backend the
 * user never asked for, minting a phantom `default` agent and forcing
 * -device handles onto the real one) AND no forced-local child is already
 * pooled. Pure — main.ts feeds it the live route + pool keys.
 */
export function shouldDeferLocalEnumeration(
  route: RegistryLocalRoute,
  poolKeys: Iterable<string>,
  connectionId: string = LOCAL_CONNECTION_ID
): boolean {
  if (route.delegate) {
    return false
  }

  const prefix = backendScopePrefix(connectionId)

  return ![...poolKeys].some(key => String(key).startsWith(prefix))
}

// ── Union agent roster ──────────────────────────────────────────────────────


