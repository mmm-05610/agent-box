// Extracted verbatim from index.tsx (see docs/desktop-megafile-decomposition.md).

import { type AppView } from '@/app/routes'
import type {
  Sidebar} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils'
import { type SessionInfo } from '@/types/hermes'
import type { SidebarNavItem } from '@/types/sidebar'

import { type NewSessionSplitHandler } from '../new-session-drag'

export const PROJECT_TREE_WARM_MS = 2_000

export const COMPACT_FLAT = 'compact:max-h-none compact:overflow-visible'

export const SCROLL_Y = 'overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-fade'

export const SCROLL_GUTTER = '[scrollbar-gutter:stable]'

export const GROUP_BODY = cn(SCROLL_Y, COMPACT_FLAT)

export const HEADER_ACTION_BTN =
  'text-(--ui-text-tertiary) opacity-0 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground group-hover/section:opacity-100 focus-visible:opacity-100'

export const HEADER_NAV_BTN =
  'text-(--ui-text-tertiary) opacity-70 transition-opacity hover:bg-(--ui-control-hover-background) hover:text-foreground hover:opacity-100 focus-visible:opacity-100'

/**
 * Which authority owns the sidebar's session rows. `'agentbox'` is the product
 * runtime: search, Archived and workspace previews read the AgentBox service
 * cache and never the legacy Hermes REST endpoints. `'hermes'` is the legacy
 * adapter, kept intact for the non-product runtime.
 *
 * This is an explicit input, never inferred — a caller must say which runtime
 * it is composing. A gateway error, an empty cache or a missing capability
 * must not flip the sidebar's data source behind the user's back.
 */
export type SessionAuthority = 'agentbox' | 'hermes'

export interface ChatSidebarProps extends React.ComponentProps<typeof Sidebar> {
  currentView: AppView
  /** Required: the session data authority for this mount. No default. */
  sessionAuthority: SessionAuthority
  onNavigate: (item: SidebarNavItem) => void
  onLoadMoreSessions: () => Promise<void> | void
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
}
