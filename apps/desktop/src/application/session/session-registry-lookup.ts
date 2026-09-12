import { getSession } from '@/api/sessions'
import { sessionOwnerRouteFromRow } from '@/application/session/request-router'
import { normalizeSessionSource } from '@/lib/session-source'
import { $activeGatewayProfile, $profiles, normalizeProfileKey } from '@/store/profile'
import { $projectTree } from '@/store/projects'
import {
  $cronSessions,
  $sessions,
  sessionMatchesStoredId,
  setCronSessions,
  setSessions
} from '@/store/session'
import { type SessionOwnerScope, type SessionProfileRoute } from '@/store/session/types'
import type { SessionInfo } from '@/types/hermes'

/** Resolve a stored session row and its owner across every cached session
 *  list, the project tree, and the owning backend profile. */
export function sessionShouldHaveTranscript(session: SessionInfo | undefined): boolean {
  return (session?.message_count ?? 0) > 0
}

export type ListedSessionSlice = 'cron' | 'sessions'

export function findListedSession(
  storedSessionId: string
): { session: SessionInfo; slice: ListedSessionSlice } | undefined {
  const match = (session: SessionInfo) => sessionMatchesStoredId(session, storedSessionId)
  const fromCron = $cronSessions.get().find(match)

  if (fromCron) {
    return { session: fromCron, slice: 'cron' }
  }

  const fromSessions = $sessions.get().find(match)

  if (fromSessions) {
    return { session: fromSessions, slice: 'sessions' }
  }

  return undefined
}

export function dropListedSession(storedSessionId: string): void {
  const keep = (session: SessionInfo) => !sessionMatchesStoredId(session, storedSessionId)

  setSessions(prev => prev.filter(keep))
  setCronSessions(prev => prev.filter(keep))
}

export function restoreListedSession(session: SessionInfo, slice?: ListedSessionSlice): void {
  const target: ListedSessionSlice =
    slice ??
    (normalizeSessionSource(session.source) === 'cron' ? 'cron' : 'sessions')

  const prepend = (prev: SessionInfo[]) => [
    session,
    ...prev.filter(existing => !sessionMatchesStoredId(existing, session.id))
  ]

  if (target === 'cron') {
    setCronSessions(prepend)

    return
  }

  setSessions(prepend)
}

function upsertResolvedSession(session: SessionInfo, storedSessionId: string) {
  const lineage = session._lineage_root_id ?? session.id

  setSessions(prev => [
    session,
    ...prev.filter(existing => {
      if (sessionMatchesStoredId(existing, storedSessionId)) {
        return false
      }

      return (existing._lineage_root_id ?? existing.id) !== lineage
    })
  ])
}

// Every session row reachable through the profile-scoped project tree —
// preview rows on a collapsed project plus the drill-in lane rows. These are
// the only rows guaranteed to name their owning profile (the gateway stamps
// the request scope onto them), so owner resolution has to see them.
function projectTreeSessions(): SessionInfo[] {
  return $projectTree
    .get()
    .flatMap(project => [
      ...(project.previewSessions ?? []),
      ...project.repos.flatMap(repo => repo.groups.flatMap(group => group.sessions))
    ])
}

// The best cached row for a stored id, across every list that can hold one.
// "Best" means self-describing: the same conversation can appear both as an
// ownerless legacy Recents copy and as a profile-stamped project-tree row, and
// picking the ownerless one throws away the only routing information we have.
export function cachedSessionRow(storedSessionId: string): SessionInfo | undefined {
  const candidates = [
    ...$sessions.get(),
    ...$cronSessions.get(),
    ...projectTreeSessions()
  ].filter(session => sessionMatchesStoredId(session, storedSessionId))

  return (
    candidates.find(session => session.connection_id?.trim()) ??
    candidates.find(session => session.profile?.trim()) ??
    candidates[0]
  )
}

export async function resolveStoredSession(
  storedSessionId: string,
  ownerRoute?: SessionProfileRoute
): Promise<SessionInfo | undefined> {
  const cached = cachedSessionRow(storedSessionId)

  if (ownerRoute) {
    const scope = {
      connectionId: ownerRoute.connectionId,
      profile: ownerRoute.targetProfile || ownerRoute.profile
    }

    const cachedOwnerMatches =
      cached &&
      cached.connection_id === ownerRoute.connectionId &&
      (!cached.profile || normalizeProfileKey(cached.profile) === normalizeProfileKey(ownerRoute.profile))

    if (cached && cachedOwnerMatches) {
      return cached
    }

    try {
      const session = await getSession(storedSessionId, scope)
      session.profile = normalizeProfileKey(ownerRoute.profile)
      session.connection_id = ownerRoute.connectionId
      upsertResolvedSession(session, storedSessionId)

      return session
    } catch {
      // An explicit owner is fail-closed. Probing the ambient or another
      // profile would turn a stale route into a cross-connection open.
      return undefined
    }
  }

  // A row with no owning profile can't route a resume when more than one
  // profile exists — a resume without a profile lands on whichever gateway is
  // active (#67603 family, cross-profile open asymmetry). Treat such a hit as
  // unresolved and fall through to the by-id lookups, which stamp ownership.
  const multiProfile = $profiles.get().length > 1

  if (cached && (cached.profile?.trim() || !multiProfile)) {
    return cached
  }

  // Direct by-id on the active profile — one row lookup, no list scan. Electron
  // routes an unscoped GET to the primary backend, which may not own the
  // active profile. A 404 there used to skip that profile in the probes below,
  // so the session was never found.
  const activeKey = normalizeProfileKey($activeGatewayProfile.get())

  try {
    const session = await getSession(storedSessionId, activeKey)

    // Older backends can omit `profile`; this request targeted the active
    // profile, so back-fill that rather than caching an unowned row. A present
    // stamp is preserved for backend compatibility.
    session.profile ||= activeKey

    upsertResolvedSession(session, storedSessionId)

    return session
  } catch {
    // Not on the active profile — fall through to the cross-profile probe.
  }

  // Multi-profile only: probe each remaining profile by id (still one cheap
  // lookup each) rather than pulling every profile's recent sessions. The
  // first hit carries its owning `profile`, which routes the resume to the
  // right backend. The active profile was already tried above.
  const otherProfiles = $profiles
    .get()
    .map(profile => normalizeProfileKey(profile.name))
    .filter(key => key !== activeKey)

  for (const profile of otherProfiles) {
    try {
      const session = await getSession(storedSessionId, profile)

      // Same ownership contract: the DESKTOP profile we explicitly probed is
      // authoritative, whatever the scoped backend stamped (older backends
      // omit the field; a per-profile remote override strips the alias before
      // forwarding, so that backend answers as its own "default").
      session.profile = profile

      upsertResolvedSession(session, storedSessionId)

      return session
    } catch {
      // Not on this profile; try the next.
    }
  }

  return undefined
}

/**
 * The profile that owns a stored session, resolved through the same
 * cache → active-backend → cross-profile ladder as `resolveStoredSession`.
 *
 * Recovery `session.resume` calls (stale runtime id, session-not-found, wedged
 * loop) must re-register the conversation on ITS backend, not on whichever
 * profile happens to be live. Omitting the profile lets the gateway fall back to
 * the launch-profile DB (tui_gateway/server.py), which is how a session bleeds
 * from one profile into another (#67603, second symptom). A cache-only lookup
 * misses any session outside the paginated sidebar window, so route through the
 * resolver, which probes uncached ids across profiles.
 */
export async function resolveSessionProfile(storedSessionId: null | string): Promise<string | undefined> {
  if (!storedSessionId) {
    return undefined
  }

  const profile = (await resolveStoredSession(storedSessionId))?.profile?.trim()

  return profile || undefined
}

/**
 * The OWNER of a stored session through the same cache → active-backend →
 * cross-profile ladder, preferring the EXACT route when the resolved row is
 * connection-tagged (unified-list splice, optimistic create row, a carried
 * tag) over its bare profile. Session-scoped RPC dispatch uses this as the
 * async rung after the sync ladder (tile route → hint → row) misses, so a
 * registry-owned session never degrades to a profile-only route that dials a
 * different socket than the one holding its runtime.
 */
export async function resolveSessionOwner(storedSessionId: null | string): Promise<SessionOwnerScope> {
  if (!storedSessionId) {
    return undefined
  }

  const row = await resolveStoredSession(storedSessionId)

  return sessionOwnerRouteFromRow(row) ?? (row?.profile?.trim() || undefined)
}
