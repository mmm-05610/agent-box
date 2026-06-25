/**
 * Sidebar — Left navigation rail
 *
 * cc-switch style: narrow sidebar with icon + text nav items,
 * active state via background highlight.
 *
 * @example
 *   <Sidebar active="library" onNav={setPage} />
 */

import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────

export type NavKey =
  | 'home'
  | 'profiles'
  | 'library'
  | 'sessions'
  | 'settings'
  | 'help'

interface NavItem {
  key: NavKey
  label: string
  icon: string
}

interface SidebarProps {
  active: NavKey
  onNav: (key: NavKey) => void
  runningCount?: number
}

// ── Constants ──────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: '⌂' },
  { key: 'profiles', label: 'Profiles', icon: '◻' },
  { key: 'library', label: 'Library', icon: '◈' },
  { key: 'sessions', label: 'Sessions', icon: '⟳' },
  { key: 'settings', label: 'Settings', icon: '⚙' },
  { key: 'help', label: 'Help', icon: '?' },
]

// ── Component ──────────────────────────────────────────────────────────

export function Sidebar({ active, onNav, runningCount = 0 }: SidebarProps) {
  return (
    <aside
      className={cn(
        'flex h-full w-[240px] flex-col',
        'border-r border-card-border bg-sidebar',
      )}
    >
      {/* Brand */}
      <div className="flex items-center gap-3 px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
          AB
        </div>
        <span className="text-sm font-semibold text-sidebar-foreground">
          Agent Box
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 py-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            onClick={() => onNav(item.key)}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2',
              'text-sm transition-colors duration-fast',
              active === item.key
                ? 'bg-sidebar-accent text-sidebar-foreground font-medium'
                : 'text-muted-foreground hover:bg-card-hover hover:text-foreground',
            )}
          >
            <span className="w-5 text-center text-base">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* Status footer */}
      <div className="border-t border-card-border px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              runningCount > 0
                ? 'bg-success animate-pulse'
                : 'bg-muted-foreground',
            )}
          />
          <span>
            {runningCount > 0
              ? `${runningCount} running`
              : 'No active sessions'}
          </span>
        </div>
      </div>
    </aside>
  )
}
