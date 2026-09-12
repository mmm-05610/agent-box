// Extracted verbatim from index.tsx (see docs/desktop-megafile-decomposition.md).

import { Codicon } from '@/components/ui/codicon'
import type {
  Sidebar} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils'
import { type SessionInfo } from '@/types/hermes'
import type { SidebarNavItem } from '@/types/sidebar'

import {
  type AppView,
  ARTIFACTS_ROUTE,
  CRON_ROUTE,
  MESSAGING_ROUTE,
  SKILLS_ROUTE
} from '../../routes'
import { type NewSessionSplitHandler } from '../new-session-drag'

export const NON_SESSION_INITIAL_ROWS = 3

export const NON_SESSION_LOAD_STEP = 10

export const PROJECT_TREE_WARM_MS = 2_000

export const SIDEBAR_NAV: SidebarNavItem[] = [
  {
    id: 'new-session',
    label: '',
    icon: props => <Codicon name="robot" {...props} />,
    action: 'new-session',
    keybindActionId: 'session.new'
  },
  {
    id: 'skills',
    label: '',
    icon: props => <Codicon name="symbol-misc" {...props} />,
    route: SKILLS_ROUTE,
    keybindActionId: 'nav.skills'
  },
  {
    id: 'messaging',
    label: '',
    icon: props => <Codicon name="comment" {...props} />,
    route: MESSAGING_ROUTE,
    keybindActionId: 'nav.messaging'
  },
  {
    id: 'artifacts',
    label: '',
    icon: props => <Codicon name="files" {...props} />,
    route: ARTIFACTS_ROUTE,
    keybindActionId: 'nav.artifacts'
  },
  {
    id: 'cron',
    label: '',
    icon: props => <Codicon name="watch" {...props} />,
    route: CRON_ROUTE,
    keybindActionId: 'nav.cron'
  }
]

export const COMPACT_FLAT = 'compact:max-h-none compact:overflow-visible'

export const SCROLL_Y = 'overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-fade'

export const SCROLL_GUTTER = '[scrollbar-gutter:stable]'

export const GROUP_BODY = cn(SCROLL_Y, COMPACT_FLAT)

export const HEADER_ACTION_BTN =
  'text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground group-hover/section:opacity-100 focus-visible:opacity-100'

export const HEADER_NAV_BTN =
  'text-(--ui-text-tertiary) opacity-70 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground hover:opacity-100 focus-visible:opacity-100'

export interface ChatSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentView: AppView
  onNavigate: (item: SidebarNavItem) => void
  onLoadMoreSessions: () => Promise<void> | void
  onLoadMoreMessaging?: (platform: string) => Promise<void> | void
  onResumeSession: (sessionId: string, session?: SessionInfo) => void
  onDeleteSession: (sessionId: string) => void
  onArchiveSession: (sessionId: string) => void
  onBranchSession: (sessionId: string) => void
  onNewSessionInWorkspace: (path: null | string) => void
  /** Create a brand-new session and open it as a tile. `dir` is the dock edge
   *  (or `center` to stack a tab); `anchor`/`before` optionally pin it to a
   *  specific zone / tab-strip slot, and `cwd` pins it to a project's path —
   *  used by the new-session drags (the "New session" row and the project "+"
   *  buttons), which land a fresh session exactly where it's dropped. The
   *  context-menu "Open in split" path passes just a `dir`. */
  onNewSessionSplit: NewSessionSplitHandler
  onManageCronJob: (jobId: string) => void
  onTriggerCronJob: (jobId: string) => Promise<void>
}

export interface MessagingSection {
  sourceId: string
  label: string
  sessions: SessionInfo[]
  total: number
  hasMore: boolean
}
