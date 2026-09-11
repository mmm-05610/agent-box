import { readJson, writeJson } from '@/lib/storage'
import type { SessionInfo } from '@/types/hermes'

import type { SessionOwnerRoute } from './types'

/** The persisted, bounded LRU of exact session owner routes recorded at
 *  create/resume/open time. */
// ── Exact session owner hints ───────────────────────────────────────────────
// The (connectionId, profile[, targetProfile, mode]) route a session was
// created / resumed / opened on, keyed by stored id. Bounded LRU and
// PERSISTED (best-effort, same origin storage as the tiles): the runtime a
// routed create minted lives on one concrete socket, and after the sidebar
// refresh replaced the optimistic row, or after a relaunch, this record is
// how the exact owner is reconstructed for that session's next RPC instead of
// degrading to a bare profile name that dials a different socket. Connection
// ids are stable registry identities (`local`, registry uuids), so a hint
// stays valid across restarts; forgetSessionOwnerHintsForConnection drops
// them when a connection is removed from the registry.
const SESSION_OWNER_HINT_LIMIT = 256
const SESSION_OWNER_HINTS_KEY = 'hermes.desktop.sessionOwnerHints.v1'
const sessionOwnerHints = new Map<string, { id: string; route: SessionOwnerRoute }>()

function sessionOwnerHintKey(sessionId: string, route: Pick<SessionOwnerRoute, 'connectionId' | 'profile'>): string {
  return JSON.stringify([route.connectionId.trim(), route.profile.trim() || 'default', sessionId])
}

function normalizeOwnerRoute(route: SessionOwnerRoute): SessionOwnerRoute {
  return {
    ...route,
    connectionId: route.connectionId.trim(),
    profile: route.profile.trim() || 'default',
    ...(route.targetProfile ? { targetProfile: route.targetProfile.trim() || 'default' } : {})
  }
}

function persistSessionOwnerHints(): void {
  writeJson(
    SESSION_OWNER_HINTS_KEY,
    sessionOwnerHints.size === 0 ? null : [...sessionOwnerHints.values()].map(entry => [entry.id, entry.route])
  )
}

function rememberSessionOwnerHint(sessionId: string, route: SessionOwnerRoute): boolean {
  const id = sessionId.trim()
  const normalized = normalizeOwnerRoute(route)

  if (!id || !normalized.connectionId) {
    return false
  }

  const key = sessionOwnerHintKey(id, normalized)
  sessionOwnerHints.delete(key)
  sessionOwnerHints.set(key, { id, route: normalized })

  while (sessionOwnerHints.size > SESSION_OWNER_HINT_LIMIT) {
    const oldest = sessionOwnerHints.keys().next().value

    if (oldest === undefined) {
      break
    }

    sessionOwnerHints.delete(oldest)
  }

  return true
}

/** Load persisted hints (oldest first, so LRU order survives). Malformed or
 *  foreign-shaped entries are skipped; nothing here can throw. */
export function hydrateSessionOwnerHints(): void {
  const raw = readJson<unknown>(SESSION_OWNER_HINTS_KEY)

  if (!Array.isArray(raw)) {
    return
  }

  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      continue
    }

    const [id, route] = entry as [unknown, unknown]

    if (
      typeof id !== 'string' ||
      !route ||
      typeof route !== 'object' ||
      typeof (route as SessionOwnerRoute).connectionId !== 'string' ||
      typeof (route as SessionOwnerRoute).profile !== 'string'
    ) {
      continue
    }

    const candidate = route as SessionOwnerRoute

    rememberSessionOwnerHint(id, {
      connectionId: candidate.connectionId,
      profile: candidate.profile,
      ...(typeof candidate.targetProfile === 'string' ? { targetProfile: candidate.targetProfile } : {}),
      ...(candidate.mode === 'local' || candidate.mode === 'remote' ? { mode: candidate.mode } : {})
    })
  }
}

hydrateSessionOwnerHints()

export function setSessionOwnerHint(sessionId: string, route: SessionOwnerRoute): void {
  if (rememberSessionOwnerHint(sessionId, route)) {
    persistSessionOwnerHints()
  }
}

/** Drop every hint naming `connectionId` — the registry no longer has it, so
 *  nothing can dial that route again (fail-closed would otherwise pin those
 *  sessions to a dead source forever). */
export function forgetSessionOwnerHintsForConnection(connectionId: string): void {
  const id = connectionId.trim()

  if (!id) {
    return
  }

  let changed = false

  for (const [key, entry] of [...sessionOwnerHints]) {
    if (entry.route.connectionId === id) {
      sessionOwnerHints.delete(key)
      changed = true
    }
  }

  if (changed) {
    persistSessionOwnerHints()
  }
}

/** Drop every persisted route for one session. Untagged rows are owned by the
 * ambient backend that returned them, so a stale explicit hint must not force a
 * later resume onto a different connection. */
export function forgetSessionOwnerHintsForSession(sessionId: string): void {
  const id = sessionId.trim()

  if (!id) {
    return
  }

  let changed = false

  for (const [key, entry] of [...sessionOwnerHints]) {
    if (entry.id === id) {
      sessionOwnerHints.delete(key)
      changed = true
    }
  }

  if (changed) {
    persistSessionOwnerHints()
  }
}

/** Exact route carried by a connection-tagged row. An untagged row deliberately
 * returns undefined: it belongs to the ambient backend that supplied the list,
 * including the legacy primary-SSH path whose rows have no registry id. */
export function sessionOwnerRouteFromRow(
  session?: Pick<SessionInfo, 'connection_id' | 'profile'>
): SessionOwnerRoute | undefined {
  const connectionId = (session?.connection_id ?? '').trim()
  const profile = (session?.profile ?? '').trim()

  if (!connectionId || !profile) {
    return undefined
  }

  return { connectionId, profile, targetProfile: profile }
}

/** @internal Tests: forget every in-memory hint (storage untouched unless asked). */
export function _resetSessionOwnerHintsForTests({ storage = false }: { storage?: boolean } = {}): void {
  sessionOwnerHints.clear()

  if (storage) {
    writeJson(SESSION_OWNER_HINTS_KEY, null)
  }
}

export function getSessionOwnerHints(sessionId: string): SessionOwnerRoute[] {
  const id = sessionId.trim()

  return [...sessionOwnerHints.values()].filter(entry => entry.id === id).map(entry => ({ ...entry.route }))
}

export function getSessionOwnerHint(
  sessionId: string,
  scope?: Pick<SessionOwnerRoute, 'connectionId' | 'profile'>
): SessionOwnerRoute | undefined {
  const id = sessionId.trim()

  if (scope) {
    const entry = sessionOwnerHints.get(sessionOwnerHintKey(id, scope))

    return entry ? { ...entry.route } : undefined
  }

  const matches = [...sessionOwnerHints.values()].filter(entry => entry.id === id)

  return matches.length === 1 ? { ...matches[0].route } : undefined
}
