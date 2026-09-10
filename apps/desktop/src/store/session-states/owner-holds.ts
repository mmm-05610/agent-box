import { registryBackendScopeKey } from '@hermes/shared'
import { atom } from 'nanostores'

import { normalizeProfileKey } from '../profile'
import { $activeSessionId } from '../session'
import { $sessionTiles, sessionScopeByRuntimeId } from './session-state-registry'
import type { SessionOwnerRoute, SessionOwnerScope } from '../session-request-router'

/** Create-to-foreground owner holds: pin the socket that minted a runtime
 *  until its surface publishes, and derive the foreground scope set. */
// ── Owner hold across the create → foreground gap ───────────────────────────
// A routed session.create returns a stored id on the owner's socket, but the
// surface that will PIN that socket (the selected primary thread, or a tile)
// is published later and asynchronously: navigate → route effect →
// $selectedStoredSessionId, or openSessionTile → $sessionTiles. In that gap
// the entry has no active request, is not yet foreground-bound and, if the
// user switched source meanwhile, is not the active key either — so the
// live-work pruner or a refcount-0 lease release could close the socket that
// holds the just-minted runtime before the first prompt.submit. The hold
// names the owner in foregroundSessionScopes from the moment the create
// returns until the foreground publication takes over (the stored id becomes
// selected or tiled), the caller releases it (failed create / drift close),
// or a bounded TTL expires — nothing latches.
const SESSION_OWNER_HOLD_TTL_MS = 60_000

const sessionOwnerHolds = new Map<
  string,
  { owner: SessionOwnerScope; timer: ReturnType<typeof setTimeout>; until: number }
>()

export const $sessionOwnerHoldRevision = atom(0)

function bumpSessionOwnerHoldRevision(): void {
  $sessionOwnerHoldRevision.set($sessionOwnerHoldRevision.get() + 1)
}

function forgetSessionOwnerHold(storedSessionId: string, publish: boolean): boolean {
  const hold = sessionOwnerHolds.get(storedSessionId)

  if (!hold) {
    return false
  }

  clearTimeout(hold.timer)
  sessionOwnerHolds.delete(storedSessionId)

  if (publish) {
    bumpSessionOwnerHoldRevision()
  }

  return true
}

export function holdSessionOwnerUntilForeground(storedSessionId: string, owner: SessionOwnerScope): () => void {
  const id = storedSessionId.trim()

  if (!id || !owner) {
    return () => undefined
  }

  forgetSessionOwnerHold(id, false)
  const until = Date.now() + SESSION_OWNER_HOLD_TTL_MS
  const timer = setTimeout(() => releaseSessionOwnerHold(id), SESSION_OWNER_HOLD_TTL_MS)

  sessionOwnerHolds.set(id, { owner, timer, until })
  bumpSessionOwnerHoldRevision()

  return () => releaseSessionOwnerHold(id)
}

export function releaseSessionOwnerHold(storedSessionId: string): void {
  forgetSessionOwnerHold(storedSessionId.trim(), true)
}

/** @internal Tests. */
export function _resetSessionOwnerHoldsForTests(): void {
  const hadHolds = sessionOwnerHolds.size > 0

  for (const hold of sessionOwnerHolds.values()) {
    clearTimeout(hold.timer)
  }

  sessionOwnerHolds.clear()

  if (hadHolds) {
    bumpSessionOwnerHoldRevision()
  }
}

/**
 * Registry scopes owned by an open foreground surface, when known.
 *
 * The secondary-gateway pruner normally keeps only busy/needs-input work. A
 * source switch briefly changes the active gateway before an idle conversation
 * is cleared, so the primary runtime must survive that handoff. Open panes have
 * the same ownership contract: a non-focused idle tile is still user-visible
 * state and must not be evicted just because another pane has focus. Prefer the
 * live event scope, with the tile's persisted route as the pre-bind fallback.
 *
 * A just-created session's owner is named by its create → foreground hold
 * (holdSessionOwnerUntilForeground) until the selected/tiled publication or
 * a bounded TTL retires it, so nothing can close the socket that minted the
 * runtime before the first prompt lands.
 */
export function foregroundSessionScopes(): Set<string> {
  const scopes = new Set<string>()

  const addRuntimeScope = (runtimeId: string | undefined) => {
    const scope = runtimeId ? sessionScopeByRuntimeId.get(runtimeId) : undefined

    if (scope) {
      scopes.add(scope)
    }
  }

  const addRouteScope = (route: SessionOwnerRoute | undefined) => {
    const connectionId = route?.connectionId?.trim()
    const profile = route?.profile?.trim()

    if (connectionId && profile) {
      scopes.add(registryBackendScopeKey(connectionId, profile))
    }
  }

  addRuntimeScope($activeSessionId.get() ?? undefined)

  for (const tile of $sessionTiles.get()) {
    addRuntimeScope(tile.runtimeId)
    addRouteScope(tile.ownerRoute)
  }

  // Create → foreground holds. A hold whose scope the rungs above already
  // name (the runtime's event scope once selected, a mounted tile's route) is
  // covered and retires; an expired one retires too.
  const now = Date.now()

  for (const [storedSessionId, hold] of [...sessionOwnerHolds]) {
    const scope =
      typeof hold.owner === 'string'
        ? normalizeProfileKey(hold.owner)
        : hold.owner?.connectionId?.trim()
          ? registryBackendScopeKey(hold.owner.connectionId.trim(), normalizeProfileKey(hold.owner.profile))
          : null

    if (!scope || hold.until <= now || scopes.has(scope)) {
      // This recompute was already triggered by the covering publication (or
      // is itself observing expiry), so avoid recursively publishing.
      forgetSessionOwnerHold(storedSessionId, false)

      continue
    }

    scopes.add(scope)
  }

  return scopes
}
