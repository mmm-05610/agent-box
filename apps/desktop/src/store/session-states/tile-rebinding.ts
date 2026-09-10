import { $sessionTiles, toStored, type SessionTile } from './session-state-registry'
import { sessionTileDelegate } from './tile-delegate'

/** Drop or patch tiles' runtime bindings on gateway reconnect and backend
 *  reclaim so tiles re-resume against live runtimes. */
/** Drop live runtime bindings so every tile re-resumes — used on gateway
 *  reconnect, where a respawned backend re-mints (recycles) runtime ids.
 *  Also invalidates the wiring cache's stored→runtime map: clearing only the
 *  tile atoms left `resumeTile`'s warm path free to re-bind the same dead
 *  runtime id from the cache, so post-wake tiles repainted empty and never
 *  actually re-resumed. */
export interface RuntimeReconnectScope {
  connectionId: string
  profile?: null | string
}

/** Fallback scope for a restarted connection whose registry identity is
 *  unknown (a legacy remote primary with no connectionId). We cannot name the
 *  dead owner, so instead preserve only Bot runtimes whose owner is provably
 *  alive elsewhere; every other binding is dropped and re-resumes. A reset
 *  only costs a re-resume, so unknown owners fail toward recovery. */
export interface UnknownRuntimeReconnectScope {
  liveConnectionIds: ReadonlySet<string>
}

export function resetTileRuntimeBindings(
  reconnectedScope?: null | string | RuntimeReconnectScope | UnknownRuntimeReconnectScope
) {
  const tiles = $sessionTiles.get()

  const liveConnectionIds =
    reconnectedScope && typeof reconnectedScope === 'object' && 'liveConnectionIds' in reconnectedScope
      ? reconnectedScope.liveConnectionIds
      : null

  const reconnected =
    typeof reconnectedScope === 'string'
      ? { connectionId: reconnectedScope.trim(), profile: null }
      : reconnectedScope && !liveConnectionIds
        ? {
            connectionId: (reconnectedScope as RuntimeReconnectScope).connectionId.trim(),
            profile: (reconnectedScope as RuntimeReconnectScope).profile?.trim() || null
          }
        : null

  const belongsToReconnectedRuntime = (tile: SessionTile): boolean => {
    const route = tile.ownerRoute

    if (liveConnectionIds) {
      // Unknown restarted identity: a tile survives only when its owner is a
      // connection we know is still live — anything else rebinds on resume.
      return !route?.connectionId || !liveConnectionIds.has(route.connectionId)
    }

    if (!reconnected?.connectionId || route?.connectionId !== reconnected.connectionId) {
      return false
    }

    return !reconnected.profile || (route.targetProfile || route.profile) === reconnected.profile
  }

  const preservedStoredIds = new Set(
    tiles
      .filter(
        // Any tile with an EXACT owner route — bot tabs always, and a
        // sessions tile whose opener stamped one (a branch child on its
        // parent's connection). Its runtime lives on that owner's socket,
        // not the ambient gateway, so an unrelated connection's reconnect
        // must not drop the binding: each drop re-arms the tile's resume,
        // and a flapping sibling connection turns that into 4+ re-resumes
        // inside the storm window — latching the "keeps losing its backend
        // runtime" card over a session that is actually healthy.
        tile =>
          Boolean(tile.ownerRoute?.connectionId) &&
          (!(reconnected || liveConnectionIds) || !belongsToReconnectedRuntime(tile))
      )
      .map(tile => tile.storedSessionId)
  )

  sessionTileDelegate()?.invalidateRuntimeBindings?.(preservedStoredIds)

  if (tiles.some(tile => tile.runtimeId && !preservedStoredIds.has(tile.storedSessionId))) {
    $sessionTiles.set(tiles.map(tile => (preservedStoredIds.has(tile.storedSessionId) ? tile : toStored(tile))))
  }
}

/** Unbind ONE reclaimed runtime from whichever tile holds it — the targeted
 *  sibling of resetTileRuntimeBindings. The reconnect-time reset can't cover a
 *  backend reclaim: the WS re-dials immediately, but the orphan reaper fires a
 *  grace window LATER, so the reclaim lands after every reconnect-path unbind
 *  already ran. Without this, the tile keeps pointing at the dead runtime whose
 *  state `session.reclaimed` just dropped — an empty transcript under live
 *  chrome — and SessionTilePane's resume effect (gated on `!runtimeId`) never
 *  re-resumes. Clearing the binding re-arms that effect, which rebinds a fresh
 *  runtime from the stored row. The pane itself stays: the stored session is
 *  intact, only its live runtime was reclaimed. */
export function unbindTileRuntime(runtimeId: string) {
  const tiles = $sessionTiles.get()

  if (tiles.some(t => t.runtimeId === runtimeId)) {
    $sessionTiles.set(tiles.map(t => (t.runtimeId === runtimeId ? { ...t, runtimeId: undefined } : t)))
  }
}
