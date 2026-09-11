// Runtime ids the background-sync poll has seen live, per gateway profile. A
// profile only ever reaps what its OWN snapshot previously reported: background
// profiles are served by different gateways and never appear in this profile's
// active_list, so an unscoped reap would dark out every other profile's running
// rows. Filed under store/ because a gateway switch resets it
// (store/gateway-switch) while the poll that fills it lives in the app's
// background-sync hook.
const liveRuntimeIdsByProfile = new Map<string, ReadonlySet<string>>()

/** The runtime ids this profile's last snapshot reported live, or undefined
 *  before its first poll. Read-only: a poll replaces the whole set. */
export function liveRuntimeIds(profileKey: string): ReadonlySet<string> | undefined {
  return liveRuntimeIdsByProfile.get(profileKey)
}

/** Replace a profile's live-runtime set with the latest poll's snapshot. */
export function setLiveRuntimeIds(profileKey: string, ids: ReadonlySet<string>): void {
  liveRuntimeIdsByProfile.set(profileKey, ids)
}

/** Forget every profile's live-runtime bookkeeping. A gateway wipe already
 *  drops the session states these ids point at, so a carried-over set would
 *  only reap runtimes that no longer exist. */
export function resetLiveRuntimeTracking(): void {
  liveRuntimeIdsByProfile.clear()
}
