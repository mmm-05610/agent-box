import type { useSensors } from '@dnd-kit/core'
import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useCallback, useEffect, useMemo } from 'react'

import { SidebarPanelLabel } from '@/app/shell/chrome/sidebar/label'
import { mergeVisibleReorder, orderRowsWithinGroups, reorderableRowIds } from '@/application/sidebar/order'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import { type NewSessionSplitHandler } from '@/features/chat/new-session-drag'
import type { HermesGitWorktree } from '@/global'
import { useI18n } from '@/i18n'
import { flattenSessionsWithBranches } from '@/lib/session-branch-tree'
import {
  groupEntriesByRecency,
  groupEntriesByStatus,
  hideCollapsedGroupRows,
  type SidebarListRow,
  toSessionRows
} from '@/lib/session-date-groups'
import { cn } from '@/lib/utils'
import {
  $sidebarListGroupIds,
  $sidebarShowAllSessions,
  listGroupNodeId
} from '@/store/layout'
import { $sessionDotStateById, hasLiveTurn } from '@/store/session-dot-state'
import type { SessionInfo } from '@/types/hermes'

import { SidebarSectionMeta } from './chrome'
import { GatewayProfileGroups } from './gateway-groups'
import {
  EnteredProjectContent,
  type SidebarProjectTree,
  type SidebarSessionGroup,
  SidebarWorkspaceGroup,
  type SidebarWorkspaceTree
} from './projects'
import { ReorderableList } from './reorderable-list'
import { useSidebarRowRenderer } from './session-row-renderer'
import { VirtualSessionList } from './virtual-session-list'

export const VIRTUALIZE_THRESHOLD = 25

interface SidebarSectionHeaderProps {
  label: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
  meta?: React.ReactNode
  icon?: React.ReactNode
  // When false the section can't be collapsed: the label renders static (no
  // toggle, no caret) and the section is always open. Used for the single-
  // project view, where collapsing one project makes no sense.
  collapsible?: boolean
}

export function SidebarSectionHeader({
  label,
  open,
  onToggle,
  action,
  meta,
  icon,
  collapsible = true
}: SidebarSectionHeaderProps) {
  const labelBody = (
    <>
      {icon}
      <SidebarPanelLabel>{label}</SidebarPanelLabel>
      {meta && <SidebarSectionMeta>{meta}</SidebarSectionMeta>}
    </>
  )

  return (
    <div className="group/section flex shrink-0 items-center justify-between gap-1 pb-1 pt-1.5">
      {collapsible ? (
        <button
          // min-w-0 lets the label truncate at narrow sidebar widths instead of
          // pushing the header's trailing action icons out of view.
          className="group/section-label flex w-fit min-w-0 items-center gap-1 bg-transparent text-left leading-none"
          onClick={onToggle}
          type="button"
        >
          {labelBody}
          <DisclosureCaret
            className="text-(--ui-text-tertiary) opacity-0 transition group-hover/section-label:opacity-100"
            open={open}
          />
        </button>
      ) : (
        <div className="flex w-fit min-w-0 items-center gap-1 leading-none">{labelBody}</div>
      )}
      {action}
    </div>
  )
}

interface SidebarSessionsSectionProps {
  label: string
  open: boolean
  onToggle: () => void
  sessions: SessionInfo[]
  activeSessionId: null | string
  onResumeSession: (sessionId: string, session?: SessionInfo) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
  onTogglePin: (sessionId: string) => void
  onToggleUnread: (sessionId: string) => void
  onNewSessionInWorkspace?: (path: null | string) => void
  /** Create a new session as a tile at a drop target (drag from a project "+"). */
  onNewSessionSplit?: NewSessionSplitHandler
  pinned: boolean
  rootClassName?: string
  contentClassName?: string
  emptyState: React.ReactNode
  forceEmptyState?: boolean
  headerAction?: React.ReactNode
  footer?: React.ReactNode
  groups?: SidebarSessionGroup[]
  tree?: SidebarWorkspaceTree[]
  // The entered project's flattened content: main-checkout sessions render
  // directly (no redundant repo/branch header); only linked worktrees nest.
  // (The workspace ROOT list lives in workspace-list/workspace-list.tsx since
  // 36R — this section renders the inside of one workspace, plus the pinned
  // and search lists.)
  projectContent?: SidebarProjectTree
  // Live git lanes (`git worktree list`) for repos in the entered project —
  // a VISUAL enhancer only (empty lanes), never session membership.
  projectRepoWorktrees?: Record<string, HermesGitWorktree[]>
  // Live session cache used for optimistic placement inside entered-project lanes.
  liveSessions?: SessionInfo[]
  // Client-side optimistic eviction layer (deleted/archived ids).
  removedSessionIds?: ReadonlySet<string>
  activeProjectId?: null | string
  labelMeta?: React.ReactNode
  labelIcon?: React.ReactNode
  // When false the section header is static (no caret/toggle) and always open.
  collapsible?: boolean
  sortable?: boolean
  // The persisted drag order, applied WITHIN each date group (see
  // orderRowsWithinGroups). Chronology decides the groups; this decides the
  // sequence inside one, so a reorder no longer costs the whole list its
  // dividers. Pinned passes nothing — its rows arrive in pin order already.
  manualOrderIds?: string[]
  // The flat session list is the only hand-reorderable surface (grouped/project
  // views sort deterministically), so it owns the one ReorderableList.
  onReorderSessions?: (ids: string[]) => void
  // Rendered atop the entered-project body (a "back to overview" row).
  projectBackRow?: React.ReactNode
  dndSensors?: ReturnType<typeof useSensors>
  // Tag every row with its owning profile. Set on the flat cross-profile
  // lists (Pinned / search results) in the All-profiles view, where no group
  // header communicates ownership (#66003).
  showProfileTags?: boolean
  // Which dividers to fold into the flat list: `date` gives the chronological
  // "Yesterday" / "Last week" separators (flat recents + entered-project lanes),
  // `status` splits into WORKING / DONE under the same separators. `none` for
  // pinned, messaging groups, and the project overview, where the order isn't
  // strictly by recency so a bucket would be misleading.
  grouping?: 'date' | 'none' | 'status'
  // Inbox style: render every flat session row as a three-line card (project ·
  // age / title / model · size). A render variant that composes with whichever
  // grouping is active — the flat recents list opts in; dense tree surfaces
  // (pinned, projects, messaging) keep the one-line row.
  card?: boolean
}

export function SidebarSessionsSection({
  label,
  open,
  onToggle,
  sessions,
  activeSessionId,
  onResumeSession,
  onDeleteSession,
  onArchiveSession,
  onBranchSession,
  onTogglePin,
  onToggleUnread,
  onNewSessionInWorkspace,
  onNewSessionSplit,
  pinned,
  rootClassName,
  contentClassName,
  emptyState,
  forceEmptyState = false,
  headerAction,
  footer,
  groups,
  projectContent,
  projectRepoWorktrees,
  liveSessions,
  removedSessionIds,
  activeProjectId,
  labelMeta,
  labelIcon,
  collapsible = true,
  sortable = false,
  manualOrderIds,
  onReorderSessions,
  projectBackRow,
  dndSensors,
  showProfileTags = false,
  grouping = 'none',
  card = false
}: SidebarSessionsSectionProps) {
  const { t } = useI18n()
  const showAllSessions = useStore($sidebarShowAllSessions)
  const statusDividerLabels = t.sidebar.statusDivider
  const dotStates = useStore($sessionDotStateById)
  const sectionOpen = collapsible ? open : true
  const hasGroupedSessions = Boolean(groups?.some(group => group.sessions.length > 0))

  // Lanes count as content even with no rows left in them: the backend only
  // emits a lane that has sessions, so a lane surviving with zero rows means
  // they were filtered out (pinned) — the branch is real and must still render.
  // A genuinely empty project has no lanes at all and keeps its empty state.
  const hasProjectContent = Boolean(
    projectContent && (projectContent.sessionCount > 0 || projectContent.repos.some(repo => repo.groups.length > 0))
  )

  const showEmptyState =
    forceEmptyState || (!hasGroupedSessions && !hasProjectContent && sessions.length === 0)

  // The flat recents/pinned list is the only place sessions reorder by hand;
  // grouped/tree views always sort by creation date and never drag.
  const sessionsDraggable = sortable && !!onReorderSessions

  // Only Pinned arrives pre-ordered as a flat sequence. Recents keeps its
  // recency sort — the drag order is layered on per date group below, so the
  // buckets stay truthful and a reorder never costs the list its dividers.
  const displayEntries = useMemo(
    () => flattenSessionsWithBranches(sessions, { preserveOrder: pinned }),
    [sessions, pinned]
  )

  // The row rendering itself is the ONE shared renderer (36R) — also used by
  // the workspace root list's previews through its own hook instance.
  const { dividerAction, dividerToggle, isListGroupOpen, renderListRow, renderRows, renderRowsDated } = useSidebarRowRenderer({
    activeSessionId,
    card,
    grouping,
    manualOrderIds,
    pinned,
    showProfileTags,
    onArchiveSession,
    onBranchSession,
    onDeleteSession,
    onNewSessionInWorkspace,
    onNewSessionSplit,
    onResumeSession,
    onTogglePin,
    onToggleUnread
  })

  // Flat recents as list rows: grouped by recency when enabled, plain otherwise.
  // The hand-picked order is then applied INSIDE each date group, so dragging a
  // row ranks it among its own day's chats instead of freezing the whole list
  // into an undated manual mode.
  const flatRows: SidebarListRow[] = useMemo(() => {
    const rows =
      grouping === 'date'
        ? groupEntriesByRecency(displayEntries)
        : grouping === 'status'
          ? groupEntriesByStatus(
              displayEntries,
              entry => hasLiveTurn(dotStates[entry.session.id] ?? 'idle'),
              statusDividerLabels
            )
          : toSessionRows(displayEntries)

    return manualOrderIds?.length ? orderRowsWithinGroups(rows, manualOrderIds) : rows
  }, [grouping, displayEntries, dotStates, manualOrderIds, statusDividerLabels])

  // Closed date/status buckets keep their divider and drop the sessions under
  // it. Same array when nothing is collapsed so the virtualizer's rows ref
  // stays stable across parent re-renders.
  const visibleRows = useMemo(() => hideCollapsedGroupRows(flatRows, isListGroupOpen), [flatRows, isListGroupOpen])

  // dnd-kit must see exactly the ids it renders, in render order: the sortable
  // set is derived from the rows, not from `sessions`. Feeding it the unrendered
  // session order made a drop compute its target index against a list the user
  // wasn't looking at — the drag that landed a row in the wrong slot.
  const sortableRowIds = useMemo(() => reorderableRowIds(visibleRows), [visibleRows])
  const allSortableRowIds = useMemo(() => reorderableRowIds(flatRows), [flatRows])

  const persistSessionOrder = useCallback(
    (ids: string[]) => onReorderSessions?.(mergeVisibleReorder(allSortableRowIds, ids)),
    [allSortableRowIds, onReorderSessions]
  )

  useEffect(() => {
    if (grouping !== 'date' && grouping !== 'status') {
      return
    }

    $sidebarListGroupIds.set(flatRows.flatMap(row => (row.kind === 'divider' ? [listGroupNodeId(row.key)] : [])))

    return () => {
      $sidebarListGroupIds.set([])
    }
  }, [flatRows, grouping])

  // Pinned never virtualizes. Virtualization needs a bounded viewport to
  // measure against, and Pinned deliberately has none — however many chats you
  // pin, all of them render and the sidebar's own scroll carries the length.
  const flatVirtualized =
    !pinned && !showEmptyState && !groups?.length && !projectContent && sessions.length >= VIRTUALIZE_THRESHOLD

  let inner: React.ReactNode

  if (projectContent) {
    // Entered a project: the back row is always present, then either the
    // (overlay-aware) content or a clean empty state — never a bare spinner or a
    // blank pane while lanes hydrate.
    inner = (
      <>
        {projectBackRow}
        {hasProjectContent ? (
          <EnteredProjectContent
            liveSessions={liveSessions}
            onNewSession={onNewSessionInWorkspace}
            onNewSessionSplit={onNewSessionSplit}
            project={projectContent}
            removedSessionIds={removedSessionIds}
            renderRows={renderRowsDated}
            repoWorktrees={projectRepoWorktrees}
          />
        ) : (
          emptyState
        )}
      </>
    )
  } else if (showEmptyState) {
    inner = emptyState
  } else if (groups?.length && groups.every(group => group.mode === 'profile' && group.profile)) {
    inner = (
      <GatewayProfileGroups
        groups={groups}
        onNewSessionSplit={onNewSessionSplit}
        renderRows={renderRows}
        sensors={dndSensors}
      />
    )
  } else if (groups?.length) {
    inner = groups.map(group => (
      <SidebarWorkspaceGroup
        group={group}
        key={group.id}
        onNewSession={onNewSessionInWorkspace}
        onNewSessionSplit={onNewSessionSplit}
        renderRows={renderRows}
      />
    ))
  } else if (flatVirtualized) {
    const virtual = (
      <VirtualSessionList
        activeSessionId={activeSessionId}
        card={card}
        className={contentClassName}
        dividerAction={dividerAction}
        dividerToggle={dividerToggle}
        onArchiveSession={onArchiveSession}
        onBranchSession={onBranchSession}
        onDeleteSession={onDeleteSession}
        onResumeSession={onResumeSession}
        onTogglePin={onTogglePin}
        onToggleUnread={onToggleUnread}
        pinned={pinned}
        rows={visibleRows}
        showProfileTags={showProfileTags}
        sortable={sessionsDraggable}
      />
    )

    inner = sessionsDraggable ? (
      <ReorderableList ids={sortableRowIds} onReorder={persistSessionOrder} sensors={dndSensors}>
        {virtual}
      </ReorderableList>
    ) : (
      virtual
    )
  } else if (sessionsDraggable) {
    inner = (
      <ReorderableList ids={sortableRowIds} onReorder={persistSessionOrder} sensors={dndSensors}>
        {visibleRows.map(row => renderListRow(row, true, dividerAction))}
      </ReorderableList>
    )
  } else {
    inner = visibleRows.map(row => renderListRow(row, false, dividerAction))
  }

  // The virtualizer owns its own scroller, so suppress the wrapper's overflow
  // to avoid a double scroll container. Both axes: `overflow-y-visible` next
  // to the inherited `overflow-x-hidden` computes to `auto` (CSS spec), which
  // kept a phantom 4px scrollbar gutter and cut every row short on the right.
  const resolvedContentClassName = cn(contentClassName, flatVirtualized && 'overflow-visible')

  return (
    <SidebarGroup className={rootClassName}>
      <SidebarSectionHeader
        action={headerAction}
        collapsible={collapsible}
        icon={labelIcon}
        label={label}
        meta={labelMeta}
        onToggle={onToggle}
        open={sectionOpen}
      />
      {sectionOpen && (
        <SidebarGroupContent className={resolvedContentClassName}>
          {inner}
          {footer}
        </SidebarGroupContent>
      )}
    </SidebarGroup>
  )
}
