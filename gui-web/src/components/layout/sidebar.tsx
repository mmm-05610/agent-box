/**
 * Sidebar — Left navigation rail
 *
 * Distinct surface treatment:
 * - Own vertical gradient (lighter at top, slightly darker at bottom)
 * - Soft right-edge shadow that fades into main canvas
 * - No hard 1px border between sidebar and main
 *
 * Active nav state uses an accent tint background (not just gray) and
 * shows a 2px accent bar on the left edge for at-a-glance orientation.
 *
 * Hover lifts the nav item slightly to the right with a subtle bg shift.
 */

import { type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { StatusDot } from '@/components/feedback'

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
  icon: ReactNode
}

interface SidebarProps {
  active: NavKey
  onNav: (key: NavKey) => void
  runningCount?: number
}

// ── Inline SVG icon set (16×16, stroke 1.75) ────────────────────────

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 11l9-8 9 8" />
      <path d="M5 10v10h14V10" />
      <path d="M10 20v-6h4v6" />
    </svg>
  )
}

function ProfilesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0113 0" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M21.5 18a4.5 4.5 0 00-7-3.7" />
    </svg>
  )
}

function LibraryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 5h7v14H3z" />
      <path d="M10 5h7v14h-7z" />
      <path d="M17 5h4v14h-4z" />
    </svg>
  )
}

function SessionsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 2v4" />
      <path d="M12 18v4" />
      <path d="M4.93 4.93l2.83 2.83" />
      <path d="M16.24 16.24l2.83 2.83" />
      <path d="M2 12h4" />
      <path d="M18 12h4" />
      <path d="M4.93 19.07l2.83-2.83" />
      <path d="M16.24 7.76l2.83-2.83" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.11-1.56 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.56-1.03H3a2 2 0 110-4h.09a1.7 1.7 0 001.56-1.11 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h.05a1.7 1.7 0 001.03-1.56V3a2 2 0 114 0v.09a1.7 1.7 0 001.03 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V9a1.7 1.7 0 001.56 1.03H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.56 1.03z" />
    </svg>
  )
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 015 0c0 1.5-2.5 2-2.5 4" />
      <path d="M12 17.5h.01" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function LayersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4 7l8-4 8 4-8 4-8-4z" />
      <path d="M4 12l8 4 8-4" />
      <path d="M4 17l8 4 8-4" />
    </svg>
  )
}

// ── Nav data ───────────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { key: 'home', label: 'Home', icon: <HomeIcon /> },
  { key: 'profiles', label: 'Profiles', icon: <ProfilesIcon /> },
  { key: 'library', label: 'Library', icon: <LibraryIcon /> },
  { key: 'sessions', label: 'Sessions', icon: <SessionsIcon /> },
  { key: 'settings', label: 'Settings', icon: <SettingsIcon /> },
  { key: 'help', label: 'Help', icon: <HelpIcon /> },
]

// ── Component ──────────────────────────────────────────────────────────

export function Sidebar({ active, onNav, runningCount = 0 }: SidebarProps) {
  return (
    <aside
      className={cn(
        // Flat surface with one layer of depth (right shadow) — the
        // slight color shift between sidebar and canvas is enough to
        // suggest they're different surfaces, without needing gradients
        // or texture. Less decoration = more professional.
        'relative flex h-full w-[220px] shrink-0 flex-col bg-sidebar',
        'shadow-[1px_0_0_0_hsl(var(--border)/0.6),4px_0_16px_-6px_rgba(0,0,0,0.06)]',
        'dark:shadow-[1px_0_0_0_hsl(var(--border)/0.6),4px_0_16px_-6px_rgba(0,0,0,0.4)]',
      )}
    >

      {/* ── Brand ────────────────────────────────────────────────── */}
      <div className="relative flex items-center gap-3 px-4 pt-5 pb-4">
        <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-stone-900 to-stone-700 text-stone-50 shadow-md dark:from-stone-100 dark:to-stone-300 dark:text-stone-900">
          <LayersIcon />
          {/* Brand glow accent dot */}
          <span
            aria-hidden="true"
            className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-accent ring-2 ring-stone-50 dark:ring-stone-950"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-foreground tracking-tight leading-tight">
            Agent Box
          </div>
          <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground mt-0.5">
            v0.5.0
          </div>
        </div>
      </div>

      {/* ── Quick action ────────────────────────────────────────── */}
      <div className="relative px-3 pb-4">
        <button
          type="button"
          onClick={() => onNav('profiles')}
          className={cn(
            'group flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
            'bg-foreground text-background',
            'transition-all duration-fast',
            'hover:-translate-y-px hover:shadow-md hover:bg-foreground/90',
            'active:translate-y-0',
            'focus-visible:outline-none',
          )}
        >
          <PlusIcon />
          <span>New profile</span>
          <kbd className="ml-auto rounded bg-background/20 px-1.5 py-0.5 text-[10px] font-mono tracking-wide">
            N
          </kbd>
        </button>
      </div>

      {/* ── Nav ──────────────────────────────────────────────────── */}
      <nav className="relative flex-1 px-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.key
          return (
            <button
              key={item.key}
              onClick={() => onNav(item.key)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex w-full items-center gap-3 rounded-md pl-3 pr-3 py-2 text-sm',
                // Smooth transition for color, transform, and shadow together
                'transition-all duration-fast ease-out',
                // Hover: subtle slide-right + bg shift + tiny lift (gives the
                // button a feeling of "approaching the cursor" instead of
                // just changing color).
                'hover:translate-x-0.5 hover:bg-stone-200/60 dark:hover:bg-stone-800/60 hover:shadow-[0_1px_2px_rgba(28,25,23,0.04)]',
                // Focus ring with accent
                'focus-visible:outline-none',
                isActive
                  ? // Active state: accent-tinted bg + clear text contrast
                    'bg-accent/10 text-foreground font-medium shadow-[inset_2px_0_0_0_hsl(var(--accent))]'
                  : 'text-muted-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center transition-colors',
                  isActive
                    ? 'text-accent'
                    : 'text-muted-foreground group-hover:text-foreground',
                )}
              >
                {item.icon}
              </span>
              <span>{item.label}</span>
              {isActive && (
                <span
                  aria-hidden="true"
                  className="ml-auto h-1.5 w-1.5 rounded-full bg-accent"
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* ── Status footer ────────────────────────────────────────── */}
      {/* No border line above — just spacing + subtle accent dot in
          the active status. The footer reads as "pinned" to the bottom
          via the gradient and the dot pulse animation alone. */}
      <div className="relative px-4 pt-4 pb-3 mt-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <StatusDot variant={runningCount > 0 ? 'running' : 'stopped'} />
          <span className="tabular-nums">
            {runningCount > 0 ? `${runningCount} running` : 'All idle'}
          </span>
        </div>
      </div>
    </aside>
  )
}