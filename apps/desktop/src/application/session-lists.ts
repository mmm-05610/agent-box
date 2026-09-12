/**
 * The session-list use-cases: the enumeration the sidebar, the command palette,
 * the session picker and the archive sweep actually ask for.
 *
 * `api/sessions.ts` returns the raw page. Three Desktop-local policies are
 * composed on top of it here, because all three need state the API layer may
 * not see:
 *
 *   1. REGISTRY OWNERSHIP — the active registered gateway owns every row it
 *      serves, but its HTTP APIs know nothing about this Desktop-local
 *      registry id, so an untagged remote row would let a later resume fall
 *      back to a same-named local profile. The stamp is one write shape
 *      (`@/lib/session-owner-stamp`), the decision of WHAT is active is
 *      `getApiRequestConnection()`.
 *   2. LEGACY OWNER BACKFILL — the durable half of the same contract (#94724),
 *      fired one-shot per serving (connection, profile) at enumeration time.
 *   3. THE WINDOW — the endpoints back-fill pinned rows past LIMIT, so the page
 *      is trimmed without dropping them.
 */
import { getApiRequestConnection } from '@/api/client'
import {
  fetchAllProfileSessionsPage,
  fetchSessionsPage,
  fetchSidebarSessions,
  pageWindowSessions,
  type SessionSourceFilter,
  type SidebarSessionsRequest,
  type SidebarSessionsResponse
} from '@/api/sessions'
import { stampRowsWithOwningConnection } from '@/lib/session-owner-stamp'
import type { PaginatedSessions, SessionInfo } from '@/types/hermes'

import { maybeBackfillLegacySessionOwners } from './legacy-session-owner-backfill'

/**
 * Preserve an explicit owner from a multi-source response; otherwise stamp the
 * active non-local source. Delegates to the canonical row-stamp helper so this
 * stays the ONE write shape for connection_id on backend-returned rows.
 */
function stampActiveConnectionOwner(sessions: SessionInfo[]): SessionInfo[] {
  // Durable half of the same ownership contract (#94724): enumeration under
  // registry topology triggers the one-shot server-side owner backfill for
  // the serving store when its owner is a single match. Fire-and-forget;
  // idempotent server-side; never blocks or fails the list that triggered it.
  maybeBackfillLegacySessionOwners()

  return stampRowsWithOwningConnection(sessions, getApiRequestConnection())
}

export async function listSessions(
  limit = 40,
  minMessages = 0,
  archived: 'exclude' | 'include' | 'only' = 'exclude',
  order: 'created' | 'recent' = 'recent'
): Promise<PaginatedSessions> {
  const page = await fetchSessionsPage(limit, minMessages, archived, order)

  return {
    ...page,
    sessions: pageWindowSessions(stampActiveConnectionOwner(page.sessions), limit),
    offset: 0
  }
}

// Unified, read-only session list aggregated across ALL profiles. Served by the
// primary backend straight off each profile's state.db — no per-profile backend
// is spawned. Single-profile users get the same rows as listSessions(), tagged
// profile="default".
export async function listAllProfileSessions(
  limit = 40,
  minMessages = 0,
  archived: 'exclude' | 'include' | 'only' = 'exclude',
  order: 'created' | 'recent' = 'recent',
  profile: 'all' | (string & {}) = 'all',
  filter: SessionSourceFilter = {}
): Promise<PaginatedSessions> {
  const page = await fetchAllProfileSessionsPage(limit, minMessages, archived, order, profile, filter)

  return {
    ...page,
    sessions: pageWindowSessions(stampActiveConnectionOwner(page.sessions), limit),
    offset: 0
  }
}

/** Recents and cron in one refresh, every slice stamped. The slices arrive
 *  raw from `api/sessions.ts`; the legacy per-slice fallback stamps the same
 *  way, so both routes hand the sidebar identical ownership. */
export async function listSidebarSessions(req: SidebarSessionsRequest): Promise<SidebarSessionsResponse> {
  const result = await fetchSidebarSessions(req)

  return {
    recents: {
      ...result.recents,
      sessions: stampActiveConnectionOwner(result.recents?.sessions ?? []),
      ...(result.errors?.length ? { errors: result.errors } : {})
    },
    cron: {
      ...result.cron,
      sessions: stampActiveConnectionOwner(result.cron?.sessions ?? []),
      ...(result.errors?.length ? { errors: result.errors } : {})
    },
    errors: result.errors
  }
}
