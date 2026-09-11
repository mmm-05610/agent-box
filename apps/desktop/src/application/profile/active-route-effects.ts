import { setApiRequestProfile } from '@/hermes'
import { invalidateProfileScopedQueries } from '@/lib/query-client'
import { invalidateCronModelImpactScopeState } from '@/store/cron-model-impact-scope'
import { normalizeProfileKey } from '@/store/profile/identity'
import { $activeGatewayProfile } from '@/store/profile/runtime-route-state'
import { resetStarmapGraph } from '@/store/starmap'

import { invalidateProfileListFetches } from './catalog'

// What the ACTIVE ROUTE means for everything downstream of it: route
// profile-scoped REST settings (config/env/skills/tools/model/…) to the
// profile the live gateway is currently on, and drop cached settings from the
// previous profile so pages refetch against the right backend.
//
// This used to run as a module-load subscription inside `store/profile.ts`,
// which meant any import of the profile aggregate — including from a window
// that never switches profiles — started it, and nothing could ever stop it.
// It is an effect with a lifecycle now: the renderer entry starts it once, and
// `stop` exists so a test (or a torn-down window) can take it back.

let _lastRoutedProfile: string | null = null

let unsubscribe: (() => void) | null = null

/** Route the API client and invalidate the previous profile's caches whenever
 *  the active gateway profile moves. Idempotent: a second call is a no-op. */
export function startActiveProfileRouting(): void {
  if (unsubscribe) {
    return
  }

  // Fires once immediately (no real change → no invalidation), so single-profile
  // users just get "default" (→ the primary backend) with no extra fetches.
  unsubscribe = $activeGatewayProfile.subscribe(value => {
    const key = normalizeProfileKey(value)
    setApiRequestProfile(key)

    if (_lastRoutedProfile !== null && _lastRoutedProfile !== key) {
      invalidateCronModelImpactScopeState()
      // Profile-scoped settings + the unified session list are now stale.
      // Narrowed so account/marketplace/onboarding caches don't refetch on
      // every profile switch.
      invalidateProfileScopedQueries()
      resetStarmapGraph()
      // /api/profiles now routes to a different backend: strand any in-flight
      // profile-list fetch so the previous backend's late answer can't clobber
      // the rail (the #85731 class — same guard as the connection-apply wipe).
      invalidateProfileListFetches()
    }

    _lastRoutedProfile = key
  })
}

/** Stop routing. The remembered route goes with it: after a stop, the next
 *  start re-establishes the current profile without treating it as a change. */
export function stopActiveProfileRouting(): void {
  unsubscribe?.()
  unsubscribe = null
  _lastRoutedProfile = null
}
