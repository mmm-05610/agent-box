import { activeConnectionScopeSuffix } from '@/lib/connection-scoped'
import { persistString, storedString } from '@/lib/storage'
import type { SessionInfo } from '@/types/hermes'

import type { SessionOwnerScope } from '../session-request-router'

import { sessionMatchesStoredId } from './identity'
import { getSessionOwnerHint } from './owner-hints'

/** Per-profile remembered navigation (last session/route) and the sync
 *  profile/owner knowledge derived from rows and hints. */
const LAST_SESSION_KEY = 'hermes.desktop.lastSessionId'
const LAST_ROUTE_KEY = 'hermes.desktop.lastRoute'

function profileNavigationKey(base: string, profile: string): string {
  const key = profile.trim() || 'default'

  // Also carries the CONNECTION scope: the same profile name on a different
  // gateway is a different backend with its own sessions, and windows on
  // different gateways share this localStorage area — restoring one
  // gateway's remembered session under another navigates to a session that
  // backend has never seen (#77318).
  return `${base}.profile.${encodeURIComponent(key)}${activeConnectionScopeSuffix()}`
}

// Discard legacy global keys once per tick. A module-level flag avoids
// redundant synchronous localStorage reads on every get/set call within
// the same synchronous block. The flag resets on cross-window `storage`
// events, which are the only way another window can recontaminate between
// ticks.
let legacyDiscardNeeded = true

if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === LAST_SESSION_KEY || e.key === LAST_ROUTE_KEY) {
      legacyDiscardNeeded = true
    }
  })
}

function discardLegacyRememberedNavigation(): void {
  if (!legacyDiscardNeeded) {
    return
  }

  legacyDiscardNeeded = false

  // Ownership of the old global values is unknowable. Never migrate them into
  // a profile: guessing is exactly the cross-profile corruption this storage
  // boundary prevents.
  if (storedString(LAST_SESSION_KEY) !== null) {
    persistString(LAST_SESSION_KEY, null)
  }

  if (storedString(LAST_ROUTE_KEY) !== null) {
    persistString(LAST_ROUTE_KEY, null)
  }
}

/** @internal Reset the legacy-discard flag for tests. */
export function _resetLegacyDiscardForTests(): void {
  legacyDiscardNeeded = true
}

export function getRememberedSessionId(profile: string): null | string {
  discardLegacyRememberedNavigation()

  return storedString(profileNavigationKey(LAST_SESSION_KEY, profile))
}

export function setRememberedSessionId(id: null | string, profile: string): void {
  discardLegacyRememberedNavigation()
  persistString(profileNavigationKey(LAST_SESSION_KEY, profile), id)
}

export function sessionBelongsToProfile(
  sessions: readonly Pick<SessionInfo, '_lineage_root_id' | 'id' | 'profile'>[],
  storedSessionId: string,
  profile: string
): boolean {
  const key = profile.trim() || 'default'

  return sessions.some(session => {
    const owner = (session.profile ?? '').trim() || 'default'

    return owner === key && sessionMatchesStoredId(session, storedSessionId)
  })
}

/**
 * The profile that owns a session, from SYNC known sources only: the session
 * row (the cross-profile aggregator tags each row) then the owner hint recorded
 * at open time. Returns undefined when neither knows — the caller must resolve
 * it (cross-profile probe) rather than fall back to whatever is active, because
 * "active" is presentation state and never a routing authority. Hidden sessions
 * (Bot Mode's canonical "Bot Chat") never appear in the row list, so the hint is
 * often the only sync source.
 */
export function knownSessionProfile(sessions: readonly SessionInfo[], sessionId: null | string): string | undefined {
  const owner = knownSessionOwner(sessions, sessionId)

  return typeof owner === 'string' ? owner : (owner?.targetProfile ?? owner?.profile)?.trim() || undefined
}

/**
 * The complete known owner of a session: the EXACT route when the row is
 * connection-tagged (an optimistic row from a routed create, a foreign
 * registry row from the unified-list splice, or a tag mergeSessionPage carried
 * across a refresh), else the open-time / create-time owner hint when it
 * agrees with the row, else the bare profile. Session-scoped RPC callers must
 * use this instead of `knownSessionProfile`: two sources can expose the same
 * profile name, so returning only that name silently collapses the route back
 * to the local/profile-only path. The exact rungs are what let a session's
 * owner be reconstructed after the bounded hint map has evicted it or the app
 * relaunched.
 */
export function knownSessionOwner(sessions: readonly SessionInfo[], sessionId: null | string): SessionOwnerScope {
  if (!sessionId) {
    return undefined
  }

  const session = sessions.find(candidate => sessionMatchesStoredId(candidate, sessionId))
  const profile = session?.profile?.trim()
  const connectionId = session?.connection_id?.trim()
  const hint = getSessionOwnerHint(sessionId)

  if (connectionId) {
    return { connectionId, profile: profile || 'default' }
  }

  const hintProfiles = new Set([hint?.profile.trim() || 'default', hint?.targetProfile?.trim() || 'default'])

  if (hint && (!profile || hintProfiles.has(profile || 'default'))) {
    return hint
  }

  if (profile) {
    return profile
  }

  return hint
}

/**
 * The profile a routed session belongs to, for keying the remembered id and
 * other PRESENTATION uses (which profile's sidebar/navigation this session sits
 * under). Falls back to the active gateway profile when the owner is unknown.
 *
 * Do NOT use this to ROUTE a session-scoped RPC: the active-profile fallback is
 * exactly what sends a hidden/unlisted session's RPC to a backend that never
 * owned it. Routing must use `knownSessionOwner` + a cross-profile probe and
 * surface an error instead of falling back. This remains for the navigation
 * keying it was written for.
 */
export function rememberedSessionProfile(
  sessions: readonly SessionInfo[],
  sessionId: null | string,
  activeProfile: null | string
): string {
  return knownSessionProfile(sessions, sessionId) ?? ((activeProfile ?? '').trim() || 'default')
}

// The last non-overlay route (a page like /skills, or a session route), so a
// relaunch lands back where you were instead of a bare new-chat.
//
// Scoped per profile for the same reason the remembered session id is: a single
// global key remembered ONE route across every profile, and a session route
// carries a session id in its path. Restoring under profile B would navigate to
// a session owned by profile A — the remembered-id scoping above is bypassed
// entirely, because the route is preferred over the id on cold start
// (#67603 family). Legacy global values are discarded on first read.

export function getRememberedRoute(profile: string): null | string {
  discardLegacyRememberedNavigation()

  return storedString(profileNavigationKey(LAST_ROUTE_KEY, profile))
}

export function setRememberedRoute(path: null | string, profile: string): void {
  discardLegacyRememberedNavigation()
  persistString(profileNavigationKey(LAST_ROUTE_KEY, profile), path)
}
