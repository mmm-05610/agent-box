import { getProfiles, hermesApi, STARTUP_REQUEST_TIMEOUT_MS } from '@/hermes'
import { $profiles, setActiveProfile } from '@/store/profile/catalog-state'
import type { ProfileInfo } from '@/types/hermes'

// Reading the profile CATALOG from the active backend. The state it fills is
// `store/profile/catalog-state`; every request, retry and staleness guard for
// it lives here.

// ── Stale-fetch invalidation across backend switches ───────────────────────
// $profiles mirrors the ACTIVE backend's /api/profiles. A connection/mode
// apply (the soft re-home) or a profile/agent activation changes which backend
// that is while a fetch may still be in flight — and a late response from the
// PREVIOUS backend must not clobber the list the new backend just served.
// That was #85731's disappearing rail: applying a different remote/Cloud
// connection let the old (often dying, profile-less) backend's response land
// last, collapsing $profiles and hiding the rail. Bumping the epoch strands
// every in-flight fetch: the response still resolves for its caller, but it
// no longer writes the shared cache ("guard against the past").
let profileListEpoch = 0

// Single-flight guard: on gateway open both useBackgroundSync and the
// activeGatewayProfile-change effect call refreshActiveProfile() at once, and
// the Manage Profiles panel can join mid-flight. Dedupe so concurrent callers
// share one retry chain instead of stampeding /api/profiles (#70679).
let refreshInFlight: Promise<ProfileInfo[]> | null = null

export function invalidateProfileListFetches(): void {
  profileListEpoch += 1
  // Detach the single-flight slot too: a caller arriving AFTER a backend
  // switch must start a fresh fetch against the new backend, not ride the
  // previous backend's in-flight retry chain.
  refreshInFlight = null
}

export function refreshProfiles(): Promise<ProfileInfo[]> {
  if (refreshInFlight) {
    return refreshInFlight
  }

  const flight = (async () => {
    const epoch = profileListEpoch
    const MAX_RETRIES = 2

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const { profiles } = await getProfiles()

        if (epoch === profileListEpoch) {
          $profiles.set(profiles)
        }

        return profiles
      } catch (error) {
        if (attempt === MAX_RETRIES || epoch !== profileListEpoch) {
          // Surface the failure so it's visible in the console — the prior
          // silent catch in refreshActiveProfile() hid global-remote timing
          // races (#70679). A stranded epoch stops retrying against the past.
          console.error(`[profiles] refreshProfiles failed after ${attempt + 1} attempt(s):`, error)

          throw error
        }

        // Back off before retrying: 500ms, then 1000ms. Gives the remote proxy
        // a window to finish routing after WebSocket-ready but pre-HTTP-proxy
        // states (global remote mode, #70679).
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
      }
    }

    // Unreachable — satisfies TypeScript.
    return []
  })().finally(() => {
    if (refreshInFlight === flight) {
      refreshInFlight = null
    }
  })

  refreshInFlight = flight

  return flight
}

interface ActiveProfileResponse {
  active: string
  current: string
}

// Pull the running backend's current profile + the available profile list.
// Best-effort: failures (backend not up yet) leave the prior values intact.
export async function refreshActiveProfile(): Promise<void> {
  const epoch = profileListEpoch

  try {
    const res = await hermesApi<ActiveProfileResponse>({
      path: '/api/profiles/active',
      timeoutMs: STARTUP_REQUEST_TIMEOUT_MS
    })

    // Same stale-response guard as refreshProfiles: a backend switch mid-fetch
    // means this answer describes the PREVIOUS backend.
    if (epoch === profileListEpoch) {
      setActiveProfile(res.current || 'default')
    }
  } catch {
    // Backend may not be ready; keep the last known value.
  }

  try {
    await refreshProfiles()
  } catch {
    // Leave the cached list in place.
  }
}
