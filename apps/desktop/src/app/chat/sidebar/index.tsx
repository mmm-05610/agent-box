import { KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { PlatformAvatar } from '@/app/messaging/platform-icon'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { KbdGroup } from '@/components/ui/kbd'
import { SearchField } from '@/components/ui/search-field'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem
} from '@/components/ui/sidebar'
import { Tip, TipKeybindLabel } from '@/components/ui/tooltip'
import { useContributions } from '@/contrib/react/use-contributions'
import { searchSessions, type SessionInfo, type SessionSearchResult } from '@/hermes'
import { useI18n } from '@/i18n'
import { comboTokens } from '@/lib/keybinds/combo'
import { sessionMatchesSearch } from '@/lib/session-search'
import { normalizeSessionSource, sessionSourceLabel } from '@/lib/session-source'
import { cn } from '@/lib/utils'
import { $activeConnectionId } from '@/store/connections'
import { $cronJobs } from '@/store/cron'
import { $bindings } from '@/store/keybinds'
import {
  $dismissedAutoProjectIds,
  $panesFlipped,
  $pinnedSessionIds,
  $sidebarCardRows,
  $sidebarCronOpen,
  $sidebarFiltersActive,
  $sidebarGrouping,
  $sidebarMessagingOpenIds,
  $sidebarOrdering,
  $sidebarPinsOpen,
  $sidebarPrDataWanted,
  $sidebarPrFilter,
  $sidebarProfileFilter,
  $sidebarProjectFilter,
  $sidebarProjectOrderIds,
  $sidebarRecentsOpen,
  $sidebarSessionOrderIds,
  $sidebarSessionOrderManual,
  $sidebarShowAllSessions,
  $sidebarShowArchived,
  $sidebarStatusFilter,
  $sidebarWorkspaceOrderIds,
  $sidebarWorkspaceParentOrderIds,
  filterVisibleProjects,
  pinSession,
  SESSION_SEARCH_FOCUS_EVENT,
  setPinnedSessionOrder,
  setSidebarCronOpen,
  setSidebarPinsOpen,
  setSidebarProjectOrderIds,
  setSidebarRecentsOpen,
  setSidebarSessionOrderIds,
  setSidebarSessionOrderManual,
  setSidebarWorkspaceOrderIds,
  setSidebarWorkspaceParentOrderIds,
  SIDEBAR_SESSIONS_PAGE_SIZE,
  toggleSidebarMessagingOpen,
  unpinSession
} from '@/store/layout'
import { notifyError } from '@/store/notifications'
import {
  $newChatProfile,
  $profiles,
  $profileScope,
  ALL_PROFILES,
  messagingTotalsKey,
  normalizeProfileKey,
  sidebarProfileForScope
} from '@/store/profile'
import {
  $activeProjectId,
  $newProjectDropPlacement,
  $projects,
  $projectScope,
  $projectTree,
  $projectTreeLoading,
  $reposScanning,
  ALL_PROJECTS,
  enterProject,
  exitProjectScope,
  openProjectCreate,
  refreshProjects,
  refreshProjectTree,
  refreshWorktrees,
  scanAndRecordRepos
} from '@/store/projects'
import {
  $prBranchBySession,
  $pullRequestsByBranch,
  pullRequestBucket,
  recoverSessionPullRequests,
  refreshPullRequests,
  sessionPrKey
} from '@/store/pull-requests'
import { openRouteTile } from '@/store/route-tiles'
import {
  $cronSessions,
  $currentCwd,
  $gatewayState,
  $messagingPlatformTotals,
  $messagingSessions,
  $messagingTruncated,
  $sessionProfilesTruncated,
  $sessions,
  $sessionsLoading,
  $unreadFinishedSessionIds,
  markAllSessionsRead,
  sessionPinId,
  setCurrentCwd
} from '@/store/session'
import { $sessionDotStateById, sessionStatusBucket } from '@/store/session-dot-state'
import { $unconfirmedPinWrites } from '@/store/session-pin-sync'
import { $removedSessionIds } from '@/store/session-removal'
import { $focusedSessionIsTile, $focusedStoredSessionId, $workingSessionIds } from '@/store/session-states'
import { ackAllSessionsRead } from '@/store/session-unread'
import { markSessionUnread } from '@/store/session-unread-remote'
import { $archivedSessions, loadArchivedSessions } from '@/store/sidebar-archive'
import { $sidebarSessionRankIds } from '@/store/sidebar-sort'
import {
  type AppView,
  ARTIFACTS_ROUTE,
  CRON_ROUTE,
  MESSAGING_ROUTE,
  SIDEBAR_NAV_AREA,
  type SidebarNavContribution,
  SKILLS_ROUTE
} from '../../routes'
import type { SidebarNavItem } from '../../types'
import { type NewSessionSplitHandler, startNewSessionDrag } from '../new-session-drag'
import { SidebarSectionAddButton } from './chrome'
import { SidebarCronJobsSection } from './cron-jobs-section'
import { SidebarFilterMenu } from './filter-menu'
import { useGatewaySessionGroups } from './gateway-group-model'
import { SidebarLoadMoreRow } from './load-more-row'
import { orderByIds, reconcileOrderIds, resolveManualSessionOrderIds, sameIds } from './order'
import { filterSessionsByProfileScope } from './profile-scope'
import { ProfileRail } from './profile-switcher'
import { ProjectDialog } from './project-dialog'
import { resolveLiveProjectFilter } from './project-filter'
import {
  excludeProjectSessions,
  orderProjectsByIds,
  overlayLiveLanes,
  overlayLivePreviews,
  PROJECT_PREVIEW_COUNT,
  ProjectBackRow,
  ProjectMenu,
  projectTreeCwd,
  reconcileEnteredProjectSessions,
  sessionMatchesProjectFilter,
  sessionRecency as sessionTime,
  type SidebarProjectTree,
  type SidebarWorkspaceTree,
  sortProjectsForOverview,
  StartWorkButton,
  useRepoWorktreeMap
} from './projects'
import { WorktreeDialog } from './projects/worktree-dialog'
import { searchResultToSession } from './search-view-model'
import {
  SidebarBlankState,
  SidebarLoadErrorState,
  SidebarPinnedEmptyState,
  SidebarSessionSkeletons
} from './section-states'
import { buildSessionByAnyId, resolvePinnedSessions } from './session-index'
import { SidebarSessionsSection, VIRTUALIZE_THRESHOLD } from './sessions-section'
import { CONTEXT_SPLIT_KIT, SplitSubmenu } from './split-submenu'
import { useEnteredProjectSessions } from './use-entered-project-sessions'

import {
  NON_SESSION_INITIAL_ROWS,
  NON_SESSION_LOAD_STEP,
  PROJECT_TREE_WARM_MS,
  SIDEBAR_NAV,
  COMPACT_FLAT,
  SCROLL_Y,
  SCROLL_GUTTER,
  GROUP_BODY,
  HEADER_ACTION_BTN,
  HEADER_NAV_BTN,
  ChatSidebarProps,
  MessagingSection,
} from './sidebar-constants'
export { ChatSidebar } from './chat-sidebar'
export { stripFtsMarkers } from './search-view-model'
