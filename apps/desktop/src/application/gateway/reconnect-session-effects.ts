import { registerSecondaryLifecycleObserver } from '@/store/gateway'
import { reconcileBusyStatesOnReconnect, resetTileRuntimeBindings } from '@/store/session-states'

/**
 * The application half of the pooled-socket lifecycle seam.
 *
 * A secondary socket reopening means a backend generation ended: the respawned
 * backend re-mints runtime ids, so a tile still bound to the old process's
 * runtime id would re-resume against a dead one, and a busy claim minted on the
 * old socket can never receive its terminal `busy: false`. Both reactions are
 * session-state policy, so they live here — the ONE module that is allowed to
 * know both sides. `store/gateway/**` publishes the fact and nothing else, and
 * the session store stays ignorant of the transport.
 *
 * The two reactions are ordered, not interchangeable:
 *
 *  - `beforeSecondaryReopen` runs before the dial, so the stale binding is gone
 *    before the new socket can publish `open` and a racing routed action cannot
 *    send a runtime id the previous generation minted.
 *  - `afterSecondaryReopen` runs only once the socket reached `open`, so a
 *    failed dial leaves the session state exactly as the working socket left it
 *    — no reconcile of a generation that never came up.
 *
 * `installReconnectSessionEffects` is called once by the production boot effect
 * (`features/runtime/gateway/hooks/use-gateway-boot.ts`, beside `configureGatewayRegistry`)
 * and returns its disposer, so an unmount unregisters precisely this wiring.
 */
export function installReconnectSessionEffects(): () => void {
  return registerSecondaryLifecycleObserver({
    afterSecondaryReopen: scope => reconcileBusyStatesOnReconnect(scope.scope),
    beforeSecondaryReopen: scope =>
      resetTileRuntimeBindings({ connectionId: scope.connectionId, profile: scope.profile })
  })
}
