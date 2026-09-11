/**
 * windows/active-work-throttle.ts
 *
 * Ride the main process's view of "a turn is running in some window" onto
 * Chromium's background-throttling dial.
 *
 * Extracted from `main.ts` (E5b). It is two lines of wiring, and that is the
 * point: the merged edge of the renderers' active-work reports is the only input,
 * and `stream-throttle` owns the trailing delay and the set of registered
 * windows. Keeping the merge here means the quit guard and the throttle agree on
 * what "active work" means, because both read the same map through the same
 * helper.
 */

import { type ActiveWork, mergeActiveWork } from '../app/quit-guard'

export interface ActiveWorkThrottleDeps {
  /** Live per-WebContents active-work reports. */
  activeWorkByWebContents: Map<number, ActiveWork>
  /** The throttle controller that owns the registered chat windows. */
  streamThrottle: { update(active: boolean): void }
}

export function updateStreamThrottleFromActiveWork(deps: ActiveWorkThrottleDeps): void {
  deps.streamThrottle.update(mergeActiveWork(deps.activeWorkByWebContents.values()).count > 0)
}
