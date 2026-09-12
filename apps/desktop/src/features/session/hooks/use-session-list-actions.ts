import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'

import { listSidebarSessions } from '@/application/session-lists'
import { sameCronSignature } from '@/lib/session-signatures'
import { gatewayActivationEpoch } from '@/store/gateway'
import {
  $pinnedSessionIds,
  $sessionsLimit,
  $sidebarFiltersActive,
  bumpSessionsLimit,
  raiseSessionsLimit,
  SIDEBAR_FILTERED_PAGE_SIZE
} from '@/store/layout'
import { normalizeProfileKey, sidebarProfileForScope } from '@/store/profile'
import {
  $selectedStoredSessionId,
  $sessions,
  carryForwardFailedProfileSessions,
  CRON_SECTION_LIMIT,
  keepFailedProfileMeta,
  mergeSessionPage,
  setCronSessions,
  setSessionProfilesTruncated,
  setSessionProfilesUsage,
  setSessions,
  setSessionsLoading
} from '@/store/session'
import { $removedSessionIds } from '@/store/session-removal'
import { $sessionTiles, $workingSessionIds, getRecentlySettledSessionIds } from '@/store/session-states'
import { type SessionInfo } from '@/types/hermes'

import { refreshCronJobs as refreshCronJobsStore } from '../../cron/cron-actions'

// Cron rows have their own section, and kanban dispatcher workers are read
// on the board. Excluding them here keeps "Load more" paging through
// interactive local chats instead of interleaving gateway threads that
// bury them.
const SIDEBAR_EXCLUDED_SOURCES = ['cron', 'kanban', 'subagent', 'tool']

// Drop rows the user just deleted/archived: ANY list fetch (full refresh,
// "Load more" paging, the cron slice) can race
// an in-flight delete RPC, and the backend page still carries the doomed row
// until the DELETE commits — so it flashed back into the sidebar (#50928).
// Honoring the optimistic tombstone at every ingestion point keeps the removal
// stable; the tombstone self-clears once projects.tree confirms the delete,
// and a failed delete untombstones immediately, so nothing is filtered on the
// non-destructive paths.
function dropTombstoned(sessions: SessionInfo[]): SessionInfo[] {
  const tombstones = $removedSessionIds.get()

  return tombstones.size
    ? sessions.filter(s => !tombstones.has(s.id) && !(s._lineage_root_id && tombstones.has(s._lineage_root_id)))
    : sessions
}

// Rows a session refresh must preserve even if the aggregator omits them:
// in-flight first turns (message_count 0), pinned rows aged off the page, the
// actively-viewed chat (its "working" flag clears a beat before the aggregator
// sees the persisted row), and sessions whose turn just settled (same race, but
// for a chat the user has already navigated away from). Pass `scope` to only
// keep the active row when it belongs to the profile being paged.
function sessionsToKeep(scope?: string): Set<string> {
  const keep = new Set<string>([
    ...$workingSessionIds.get(),
    ...$pinnedSessionIds.get(),
    ...getRecentlySettledSessionIds()
  ])

  // Open tiles are user-visible state exactly like the selected row: a branch
  // child is a DRAFT until its first real turn, so the aggregator can't return
  // it — without this the next background refresh silently dropped the
  // optimistic `draft: branch #N` row while its tab was open, and the sidebar
  // showed no trace of the branch until first send.
  for (const tile of $sessionTiles.get()) {
    keep.add(tile.storedSessionId)
  }

  const active = $selectedStoredSessionId.get()

  if (active) {
    const session = scope ? $sessions.get().find(s => s.id === active) : null

    if (!scope || !session || normalizeProfileKey(session.profile) === scope) {
      keep.add(active)
    }
  }

  return keep
}

interface UseSessionListActionsArgs {
  profileScope: string
}

/** Owns the sidebar's session-list fetching + paging: recents and cron
 *  runs/jobs. Returns the callbacks the controller wires into the sidebar and
 *  refresh effects. */
export function useSessionListActions({ profileScope }: UseSessionListActionsArgs) {
  const profileScopeRef = useRef(profileScope)
  const refreshSessionsRequestRef = useRef(0)

  useLayoutEffect(() => {
    profileScopeRef.current = profileScope
  }, [profileScope])

  /** Refresh cron jobs only while the profile that requested them remains active. */
  const refreshCronJobs = useCallback(async () => {
    const sessionProfile = sidebarProfileForScope(profileScope)

    if (sidebarProfileForScope(profileScopeRef.current) !== sessionProfile) {
      return
    }

    try {
      await refreshCronJobsStore(sessionProfile)
    } catch {
      // Non-fatal: the cron section just keeps its last-known jobs.
    }
  }, [profileScope])

  /** Refresh every sidebar session slice without committing an obsolete profile response. */
  const refreshSessions = useCallback(
    async (shouldPublish: () => boolean = () => true) => {
      const sessionProfile = sidebarProfileForScope(profileScope)
      const activationEpoch = gatewayActivationEpoch()

      if (!shouldPublish() || sidebarProfileForScope(profileScopeRef.current) !== sessionProfile) {
        return
      }

      const requestId = refreshSessionsRequestRef.current + 1
      refreshSessionsRequestRef.current = requestId
      // The loading flag exists to drive the initial skeletons (they only render
      // while the list is empty). Turn-complete / reconnect refreshes over a
      // populated list used to flip it true→false anyway, churning every
      // $sessionsLoading subscriber twice per turn for no visible change.
      const showLoading = $sessions.get().length === 0

      if (showLoading && shouldPublish()) {
        setSessionsLoading(true)
      }

      try {
        const limit = $sessionsLimit.get()

        // Require at least one message so abandoned/empty "Untitled" drafts (one
        // was created per TUI/desktop launch before the lazy-create fix) don't
        // clutter the sidebar.
        // Unified cross-profile list (served read-only off each profile's
        // state.db; no per-profile backend is spawned). Single-profile users get
        // the same rows tagged profile="default".
        // Scope every sidebar slice to the active profile (not always 'all') so a profile
        // with few recent sessions isn't windowed out of the cross-profile
        // recency page and never inherits another profile's cron section.
        // ALL_PROFILES remains the explicit unified view.
        // Batched: one request opens each profile DB once and returns both
        // source-scoped slices, instead of separate listAllProfileSessions
        // calls that each reopened + re-counted every profile DB per refresh.
        const result = await listSidebarSessions({
          recentsProfile: sessionProfile,
          recentsLimit: limit,
          recentsExclude: SIDEBAR_EXCLUDED_SOURCES,
          cronLimit: CRON_SECTION_LIMIT
        })

        if (
          shouldPublish() &&
          refreshSessionsRequestRef.current === requestId &&
          sidebarProfileForScope(profileScopeRef.current) === sessionProfile &&
          gatewayActivationEpoch() === activationEpoch
        ) {
          const recents = result.recents

          // Drop rows the user just deleted/archived: a refresh can race an
          // in-flight mutation and the backend page still carries the doomed row.
          // Honoring the optimistic tombstone keeps the removal from flashing back
          // (the tombstone self-clears once projects.tree confirms the delete).
          // Signature-gate the swap (same pattern as cron): a refresh
          // that returns content-identical rows must keep the previous array
          // identity, or every sidebar memo keyed on $sessions recomputes and the
          // whole list re-renders once per turn/broadcast for nothing.
          setSessions(prev => {
            const incoming = dropTombstoned(
              carryForwardFailedProfileSessions(prev, recents.sessions ?? [], recents.errors ?? result.errors)
            )

            const next = mergeSessionPage(prev, incoming, sessionsToKeep())

            return sameCronSignature(prev, next) ? prev : next
          })
          // "Is there another page?" instead of an exact total: the backend
          // reports which profiles filled their window, which costs nothing on
          // top of the rows it already read (the old exact totals ran a COUNT(*)
          // per profile DB on every refresh). Reference-stable when unchanged so
          // the sidebar's group memos don't recompute per refresh.
          const recentsErrors = recents.errors ?? result.errors
          setSessionProfilesTruncated(prev => {
            const next = keepFailedProfileMeta(prev, recents.profiles_truncated ?? {}, recentsErrors)
            const prevKeys = Object.keys(prev)

            return prevKeys.length === Object.keys(next).length && prevKeys.every(key => prev[key] === next[key])
              ? prev
              : next
          })
          // Same identity gate: these totals only move when a session bills, and
          // a fresh object every refresh would repaint every profile header.
          setSessionProfilesUsage(prev => {
            const next = keepFailedProfileMeta(prev, recents.profiles_usage ?? {}, recentsErrors)
            const prevKeys = Object.keys(prev)

            return prevKeys.length === Object.keys(next).length &&
              prevKeys.every(
                key => prev[key]?.tokens === next[key]?.tokens && prev[key]?.cost_usd === next[key]?.cost_usd
              )
              ? prev
              : next
          })

          // Cron section: latest N cron sessions (kept so a pinned cron run still
          // resolves via sessionByAnyId), signature-gated like above.
          setCronSessions(prev => {
            const incoming = carryForwardFailedProfileSessions(
              prev,
              result.cron.sessions ?? [],
              result.cron.errors ?? result.errors
            )

            return sameCronSignature(prev, incoming) ? prev : incoming
          })

        }
      } finally {
        // Request identity preserves the zero-argument refresh contract across a
        // failed activation epoch; an explicit owner predicate is stronger and
        // must never release a newer switch's loading barrier.
        if (showLoading && shouldPublish() && refreshSessionsRequestRef.current === requestId) {
          setSessionsLoading(false)
        }
      }

      // Cron *jobs* are a distinct API (getCronJobs), not a session slice.
      if (shouldPublish() && sidebarProfileForScope(profileScopeRef.current) === sessionProfile) {
        void refreshCronJobs()
      }
    },
    [profileScope, refreshCronJobs]
  )

  const loadMoreSessions = useCallback(async () => {
    bumpSessionsLimit()
    await refreshSessions()
  }, [refreshSessions])

  // A filter searches the loaded page, so switching one on has to deepen the
  // page — otherwise "merged PRs" answers for the last 50 rows and reads as
  // "you only have 6 merged PRs". Clearing the filters hands the window back:
  // the list refreshes on every settled turn, and paying for 300 rows a turn
  // once the view is unfiltered again buys nothing. Whatever the user had
  // paged to by hand is what it returns to.
  const unfilteredLimit = useRef<null | number>(null)

  useEffect(
    () =>
      $sidebarFiltersActive.subscribe(active => {
        if (active) {
          unfilteredLimit.current ??= $sessionsLimit.get()

          if (raiseSessionsLimit(SIDEBAR_FILTERED_PAGE_SIZE)) {
            void refreshSessions()
          }
        } else if (unfilteredLimit.current !== null) {
          const restored = unfilteredLimit.current
          unfilteredLimit.current = null

          if ($sessionsLimit.get() > restored) {
            $sessionsLimit.set(restored)
            void refreshSessions()
          }
        }
      }),
    [refreshSessions]
  )

  return {
    loadMoreSessions,
    refreshCronJobs,
    refreshSessions
  }
}
