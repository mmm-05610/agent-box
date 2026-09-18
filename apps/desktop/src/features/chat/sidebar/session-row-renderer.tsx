import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useCallback, useMemo } from 'react'

import { orderRowsWithinGroups } from '@/application/sidebar/order'
import { type NewSessionSplitHandler, startNewSessionDrag } from '@/features/chat/new-session-drag'
import { useI18n } from '@/i18n'
import { flattenSessionsWithBranches } from '@/lib/session-branch-tree'
import { groupEntriesByRecency, hideCollapsedGroupRows, type SidebarListRow, toSessionRows } from '@/lib/session-date-groups'
import { sessionBucketLabel } from '@/lib/time'
import { $sidebarWorkspaceNodeOpen, listGroupNodeId, toggleWorkspaceNodeCollapsed } from '@/store/layout'
import { sessionPinId } from '@/store/session'
import type { SessionInfo } from '@/types/hermes'

import { SidebarDateDivider } from './chrome'
import { WorkspaceAddButton } from './projects/workspace-header'
import { useSortableBindings } from './reorderable-list'
import { SidebarSessionRow } from './session-row'

/**
 * One session-row renderer for every sidebar surface (36R): the flat/virtual
 * lists, the entered-project lanes, and the workspace-list previews all draw
 * the SAME rows — session row, branch stem, date divider with its hover "+" —
 * from one hook. Extracted from sessions-section so the workspace root list
 * can reuse the session tree through props without nesting sections or
 * duplicating the row logic.
 */
export interface SidebarRowRendererInput {
  activeSessionId: null | string
  card?: boolean
  /** Divider mode for dated lists; previews ignore it (chronological). */
  grouping?: 'date' | 'none' | 'status'
  manualOrderIds?: string[]
  pinned?: boolean
  showProfileTags?: boolean
  onArchiveSession: (sessionId: string) => void
  onBranchSession?: (sessionId: string, profile?: string) => void
  onDeleteSession: (sessionId: string) => void
  onNewSessionInWorkspace?: (path: null | string) => void
  onNewSessionSplit?: NewSessionSplitHandler
  onResumeSession: (sessionId: string, session?: SessionInfo) => void
  onTogglePin: (sessionId: string) => void
  onToggleUnread: (sessionId: string) => void
}

export function useSidebarRowRenderer({
  activeSessionId,
  card = false,
  grouping = 'none',
  manualOrderIds,
  pinned = false,
  showProfileTags = false,
  onArchiveSession,
  onBranchSession,
  onDeleteSession,
  onNewSessionInWorkspace,
  onNewSessionSplit,
  onResumeSession,
  onTogglePin,
  onToggleUnread
}: SidebarRowRendererInput) {
  const { t } = useI18n()
  const dividerLabels = t.sidebar.dateDivider
  const nodeOpen = useStore($sidebarWorkspaceNodeOpen)
  const isListGroupOpen = useCallback((key: string) => nodeOpen[listGroupNodeId(key)] ?? true, [nodeOpen])

  const renderRow = useCallback(
    (session: SessionInfo, draggable: boolean, branchStem?: string) => {
      const rowProps = {
        branchStem,
        card,
        isPinned: pinned,
        isSelected: session.id === activeSessionId,
        onArchive: () => onArchiveSession(session.id),
        onBranch: onBranchSession ? () => onBranchSession(session.id, session.profile) : undefined,
        onDelete: () => onDeleteSession(session.id),
        onPin: () => onTogglePin(sessionPinId(session)),
        onToggleUnread: () => onToggleUnread(session.id),
        onResume: () => onResumeSession(session.id, session),
        reorderable: draggable && !branchStem,
        session,
        showProfile: showProfileTags,
        unread: session.unread === true
      }

      // Key by (profile, id): twins with the same stored id in two profiles
      // are distinct rows (#92454) — a bare-id key makes React misattribute
      // one twin's rendered state to the other.
      return draggable && !branchStem ? (
        <SortableSidebarSessionRow key={`${session.profile ?? ''}::${session.id}`} {...rowProps} />
      ) : (
        <SidebarSessionRow key={`${session.profile ?? ''}::${session.id}`} {...rowProps} />
      )
    },
    [
      activeSessionId,
      card,
      onArchiveSession,
      onBranchSession,
      onDeleteSession,
      onResumeSession,
      onTogglePin,
      onToggleUnread,
      pinned,
      showProfileTags
    ]
  )

  const dividerToggle = useMemo(
    () => ({
      ariaLabel: (label: string, open: boolean) => t.sidebar.projects.toggle(label, !open),
      onToggle: (key: string) => toggleWorkspaceNodeCollapsed(listGroupNodeId(key)),
      open: isListGroupOpen
    }),
    [isListGroupOpen, t]
  )

  // A single flat/virtual/lane list row — either a divider or a session.
  const renderListRow = useCallback(
    (row: SidebarListRow, draggable: boolean, action?: React.ReactNode) => {
      if (row.kind === 'session') {
        return renderRow(row.entry.session, draggable, row.entry.branchStem)
      }

      const label = 'label' in row ? row.label : sessionBucketLabel(row.bucket, dividerLabels)
      const open = dividerToggle.open(row.key)

      return (
        <SidebarDateDivider
          action={action}
          key={row.key}
          label={label}
          toggle={{
            ariaLabel: dividerToggle.ariaLabel(label, open),
            onToggle: () => dividerToggle.onToggle(row.key),
            open
          }}
        />
      )
    },
    [dividerLabels, dividerToggle, renderRow]
  )

  // Sessions inside repos/worktrees are date-ordered and static.
  const renderRows = useCallback(
    (items: SessionInfo[]) =>
      flattenSessionsWithBranches(items).map(({ branchStem, session }) => renderRow(session, false, branchStem)),
    [renderRow]
  )

  // Limit complete groups, not sessions, so a burst and its branches stay
  // together. Compute boundaries from the whole pool, just like Updated.
  const renderPreviewRows = useCallback(
    (items: SessionInfo[], projectId: string) => {
      const rows = groupEntriesByRecency(flattenSessionsWithBranches(items), undefined, undefined, 2).map(row =>
        row.kind === 'divider' ? { ...row, key: `project:${projectId}:${row.key}` } : row
      )

      const ordered = manualOrderIds?.length ? orderRowsWithinGroups(rows, manualOrderIds) : rows

      return hideCollapsedGroupRows(ordered, isListGroupOpen).map(row => renderListRow(row, false))
    },
    [isListGroupOpen, manualOrderIds, renderListRow]
  )

  // Same as `renderRows`, but with date dividers folded in — used for
  // entered-project lanes so a lane spanning multiple days reads
  // chronologically, matching the flat recents list.
  const renderRowsDated = useCallback(
    (items: SessionInfo[]) => {
      const entries = flattenSessionsWithBranches(items)

      const rows = grouping === 'date' ? groupEntriesByRecency(entries) : toSessionRows(entries)

      return hideCollapsedGroupRows(rows, isListGroupOpen).map(row => renderListRow(row, false))
    },
    [grouping, isListGroupOpen, renderListRow]
  )

  // Date dividers head a group the same way a repo header does, so they carry
  // the same hover-revealed "+". Only for dates: "new session in WORKING" is
  // not a thing. The divider "+" is a drag source too (the same gesture as the
  // nav's "New session" row): drag it onto a chat zone to create the session
  // exactly there; a sub-threshold release stays the ordinary click.
  const dividerAction =
    grouping === 'date' && onNewSessionInWorkspace ? (
      <WorkspaceAddButton
        label={t.sidebar.nav['new-session']}
        onClick={() => onNewSessionInWorkspace(null)}
        onPointerDown={
          onNewSessionSplit
            ? event => {
                startNewSessionDrag(placement => {
                  onNewSessionSplit(placement.dir, {
                    anchor: placement.anchor,
                    before: placement.before
                  })
                }, event)
              }
            : undefined
        }
      />
    ) : null

  return { dividerAction, dividerToggle, isListGroupOpen, renderListRow, renderPreviewRows, renderRow, renderRows, renderRowsDated }
}

interface SortableSessionRowProps {
  session: SessionInfo
  isPinned: boolean
  isSelected: boolean
  unread: boolean
  onArchive: () => void
  onDelete: () => void
  onPin: () => void
  onToggleUnread: () => void
  onResume: () => void
}

function SortableSidebarSessionRow(props: SortableSessionRowProps) {
  return <SidebarSessionRow {...props} {...useSortableBindings(props.session.id)} />
}
