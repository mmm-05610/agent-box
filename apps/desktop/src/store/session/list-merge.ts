import type { SessionInfo } from '@/types/hermes'
import { setSessions } from './atoms'
import { sessionMatchesStoredId } from './identity'

/** Merge, carry, and refresh the sidebar's in-memory session lists. */
/** Merge a fresh server session page into the in-memory list, keeping any
 *  row the server omitted that we still want visible — both still-"working"
 *  sessions and pinned sessions.
 *
 *  Two reasons the server drops a row we must keep:
 *
 *  1. A brand-new session's first user message isn't flushed to the SessionDB
 *     until its turn is persisted, so `listSessions(min_messages=1)` skips
 *     sessions that are mid-first-response. Because every `message.complete`
 *     triggers a full refresh, a hard replace makes concurrent new chats vanish
 *     the instant any one of them finishes.
 *  2. The sidebar lists only the most-recent page (`SIDEBAR_SESSIONS_PAGE_SIZE`)
 *     ordered by activity. A pinned conversation that hasn't been touched in a
 *     while falls off that page, so a hard replace silently evicts it from the
 *     in-memory list — and because the Pinned section resolves pins against
 *     that list, the pin "disappears until you refresh".
 *
 *  `keepIds` carries both the working set and the pinned set. Pins are stored
 *  on the durable lineage-root id (see {@link sessionPinId}), while the loaded
 *  row surfaces under its live compression tip, so we match a survivor by
 *  either its live `id` or its `_lineage_root_id`. Optimistic deletes/archives
 *  drop the row from `previous` (and unpin it), so a removed session can't be
 *  resurrected here. */
const profileKeyOf = (profile: null | string | undefined): string => (profile ?? '').trim() || 'default'

function carriedConnectionId(prev: SessionInfo | undefined, incoming: SessionInfo): string | undefined {
  if (incoming.connection_id?.trim()) {
    return incoming.connection_id
  }

  const carried = prev?.connection_id?.trim()

  if (!carried) {
    return undefined
  }

  return !incoming.profile?.trim() || profileKeyOf(incoming.profile) === profileKeyOf(prev?.profile)
    ? carried
    : undefined
}

export function mergeSessionPage(
  previous: SessionInfo[],
  incoming: SessionInfo[],
  keepIds: Iterable<string>
): SessionInfo[] {
  const keep = keepIds instanceof Set ? keepIds : new Set(keepIds)

  // Rows are identified by (profile, id), never bare id: two profiles can
  // hold sessions with the SAME stored id (restored backups, copied
  // state.dbs, cross-profile imports — #92454). Keyed by bare id, the twins
  // collapse into one sidebar row whose title/preview carry can stitch one
  // profile's content onto the other profile's route — the user clicks a row
  // previewing profile A and the resume dials profile B. Same-profile rows
  // (including untagged ones, which normalize together) keep the exact
  // carry behavior below.
  // (Local normalize: importing @/store/profile here would be circular —
  // same '' → 'default' rule as normalizeProfileKey.)
  const profileKeyOf = (session: SessionInfo) => (session.profile ?? '').trim() || 'default'
  const identity = (session: SessionInfo) => `${profileKeyOf(session)}::${session.id}`

  const lineageIdentity = (session: SessionInfo) =>
    `${profileKeyOf(session)}::${session._lineage_root_id ?? session.id}`

  // Carry a known title onto a row that arrives title-less, so a freshly
  // submitted session (e.g. a branch draft) holds its placeholder instead of
  // flashing its raw message preview in the gap between persist and the async
  // auto-titler. A real clear sets the local title null first, so this never
  // masks one.
  const prevById = new Map(previous.map(session => [identity(session), session]))
  // Tip rotation changes the live id — carry activity/title across the lineage
  // root so a mid-turn refresh can't drop a touchSessionActivity bump.
  const prevByLineage = new Map(previous.map(session => [lineageIdentity(session), session]))

  const merged = incoming.map(session => {
    const prev = prevById.get(identity(session)) ?? prevByLineage.get(lineageIdentity(session))
    // User-send stamps last_active before the DB flushes the user row
    // (last_active = MAX(messages.timestamp)). Keep the fresher of the two.
    const last_active = Math.max(prev?.last_active ?? 0, session.last_active ?? 0)
    const title = session.title?.trim() ? session.title : prev?.title?.trim() ? prev.title : session.title
    // Carry the owning connection onto a row that arrives untagged. The
    // primary aggregate serves a `local` registry source's rows as plain
    // local rows (the unified-list splice tags only NON-local sources), so
    // the first refresh after a routed create used to replace the optimistic
    // row's exact owner (connection_id + profile) with a bare profile — after
    // which only the transient owner hint knew which socket held the runtime.
    // A refresh is new information layered over what we know, not a clobber;
    // the tag is kept only while the row still names the same profile.
    const connection_id = carriedConnectionId(prev, session)

    return last_active === session.last_active && title === session.title && connection_id === session.connection_id
      ? session
      : { ...session, last_active, title, ...(connection_id ? { connection_id } : {}) }
  })

  if (keep.size === 0) {
    return merged
  }

  const incomingIds = new Set(merged.map(identity))

  // Deduplicate by compression lineage: when auto-compression rotates the tip
  // id (old #4 → new #5), the incoming page carries the new tip but the
  // previous list still holds the old one.  Without lineage-level dedup both
  // rows survive as separate sidebar entries (fixes #43483). Lineage keys are
  // profile-qualified for the same reason as identity above — a twin id in
  // another profile is a DIFFERENT session and must survive the dedupe.
  const incomingLineageKeys = new Set(merged.map(lineageIdentity))

  const survivors = previous.filter(
    session =>
      !incomingIds.has(identity(session)) &&
      !incomingLineageKeys.has(lineageIdentity(session)) &&
      (keep.has(session.id) || (session._lineage_root_id != null && keep.has(session._lineage_root_id)))
  )

  if (!survivors.length) {
    return merged
  }

  // Survivors carry their old relative positions from `previous`, which can be
  // stale — the server page is the fresh `order=recent` truth. Sort survivors
  // by the same effective-recency key the backend sorts by (last_active with a
  // started_at fallback) and interleave them into the title-preserving merged
  // rows so a retained session lands where recency puts it instead of the
  // whole set forming a stale block at the top of the sidebar (fixes #47203).
  // Ties keep the survivor first, matching the old prepend behavior.
  const recency = (session: SessionInfo): number => Math.max(session.last_active || 0, session.started_at || 0)

  const sortedSurvivors = [...survivors].sort((a, b) => recency(b) - recency(a))
  const interleaved: SessionInfo[] = []
  let survivorIndex = 0
  let mergedIndex = 0

  while (survivorIndex < sortedSurvivors.length && mergedIndex < merged.length) {
    if (recency(sortedSurvivors[survivorIndex]) >= recency(merged[mergedIndex])) {
      interleaved.push(sortedSurvivors[survivorIndex++])
    } else {
      interleaved.push(merged[mergedIndex++])
    }
  }

  while (survivorIndex < sortedSurvivors.length) {
    interleaved.push(sortedSurvivors[survivorIndex++])
  }

  while (mergedIndex < merged.length) {
    interleaved.push(merged[mergedIndex++])
  }

  return interleaved
}

function sidebarProfileKey(session: Pick<SessionInfo, 'profile'>): string {
  return (session.profile ?? '').trim() || 'default'
}

function sessionListIdentity(session: Pick<SessionInfo, 'id' | 'profile'>): string {
  return `${sidebarProfileKey(session)}::${session.id}`
}

/**
 * Re-attach previous rows for profiles whose sidebar slice failed this refresh.
 *
 * The batched sidebar endpoint reports a disk I/O / lock failure as HTTP 200
 * with `recents: []` and `errors: [{ profile }]`. `mergeSessionPage` only keeps
 * working / pinned / selected ids, so idle Yesterday / This-week rows would
 * otherwise vanish until a later successful scan (#73847, #88528).
 *
 * Successful profiles are left alone: their incoming page is still authoritative.
 */
export function carryForwardFailedProfileSessions(
  previous: SessionInfo[],
  incoming: SessionInfo[],
  errors: Array<{ profile?: string; error?: string }> | undefined | null
): SessionInfo[] {
  if (!errors?.length || previous.length === 0) {
    return incoming
  }

  const failed = new Set(errors.map(error => (error.profile ?? '').trim() || 'default'))
  const incomingIds = new Set(incoming.map(sessionListIdentity))
  const carried: SessionInfo[] = []

  for (const session of previous) {
    if (!failed.has(sidebarProfileKey(session)) || incomingIds.has(sessionListIdentity(session))) {
      continue
    }

    carried.push(session)
  }

  if (carried.length === 0) {
    return incoming
  }

  // Incoming-first concat parks the failed profile at the tail of an
  // all-profiles list. Re-rank by the same recency key the backend uses.
  const recency = (session: SessionInfo): number => Math.max(session.last_active || 0, session.started_at || 0)

  return [...incoming, ...carried].sort((a, b) => recency(b) - recency(a))
}

/** Keep previous per-profile sidebar meta for profiles whose slice failed.
 *
 *  A failed scan returns `{}` / falsey truncated flags. Applying those
 *  would zero usage and hide Load more under a list we just carried forward.
 */
export function keepFailedProfileMeta<T>(
  previous: Record<string, T>,
  incoming: Record<string, T>,
  errors: Array<{ profile?: string; error?: string }> | undefined | null
): Record<string, T> {
  if (!errors?.length) {
    return incoming
  }

  const next = { ...incoming }

  for (const error of errors) {
    const key = (error.profile ?? '').trim() || 'default'

    if (Object.prototype.hasOwnProperty.call(previous, key)) {
      next[key] = previous[key]
    } else {
      delete next[key]
    }
  }

  return next
}

/** Raise a session in recents on user send (before stream / turn resolve). */
export function touchSessionActivity(
  sessionId: string | null | undefined,
  options?: { at?: number; preview?: string }
): void {
  const id = sessionId?.trim()

  if (!id) {
    return
  }

  const at = options?.at ?? Date.now() / 1000
  const preview = options?.preview?.trim().slice(0, 200) || undefined

  setSessions(prev => {
    let changed = false

    const next = prev.map(session => {
      if (!sessionMatchesStoredId(session, id)) {
        return session
      }

      const last_active = Math.max(session.last_active ?? 0, at)

      if (last_active === session.last_active && (!preview || preview === session.preview)) {
        return session
      }

      changed = true

      return preview ? { ...session, last_active, preview } : { ...session, last_active }
    })

    return changed ? next : prev
  })
}
