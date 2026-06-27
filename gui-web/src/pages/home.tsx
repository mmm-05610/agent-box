/**
 * Home Page — Dashboard
 *
 * Layout:
 *   1. Welcome heading + greeting (uses local time)
 *   2. 4 stat tiles in a row (Running / Profiles / Library / Sessions)
 *      — each tile has a small icon, value, label, accent bar at bottom
 *   3. Quick launch row — recent profiles as large clickable avatars
 *   4. Recent activity — last 5 sessions with status pills
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui'
import { Loading, StatusDot } from '@/components/feedback'
import { PageHeader, type NavKey } from '@/components/layout'
import { fetchProfiles } from '@/api/profiles'
import { fetchProviders } from '@/api/providers'
import { fetchSessions } from '@/api/sessions'
import { cn } from '@/lib/utils'

interface HomePageProps {
  onNav: (key: NavKey) => void
}

interface StatTile {
  key: NavKey
  label: string
  value: string | number
  hint: string
  icon: ReactNode
  accent: 'accent' | 'success' | 'info' | 'warning'
}

export function HomePage({ onNav }: HomePageProps) {
  const [profileCount, setProfileCount] = useState(0)
  const [providerCount, setProviderCount] = useState(0)
  const [sessionCount, setSessionCount] = useState(0)
  const [runningCount, setRunningCount] = useState(0)
  const [recentSessions, setRecentSessions] = useState<
    Array<{ profile: string; mode: string; cwd: string; exitedAt: number | null; launchedAt: number }>
  >([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [profiles, providers, sessions] = await Promise.all([
          fetchProfiles(),
          fetchProviders('claude'),
          fetchSessions(),
        ])
        setProfileCount(profiles.length)
        setProviderCount(providers.length)
        const running = sessions.filter((s) => !s.exitedAt)
        setRunningCount(running.length)
        setSessionCount(sessions.length)
        setRecentSessions(
          sessions.slice(0, 5).map((s) => ({
            profile: s.profile,
            mode: s.mode ?? 'interactive',
            cwd: s.cwd,
            exitedAt: s.exitedAt,
            launchedAt: s.launchedAt,
          })),
        )
      } catch (e) {
        console.error('Failed to load dashboard data:', e)
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  const greeting = useMemo(() => {
    const h = new Date().getHours()
    if (h < 5) return 'Working late'
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }, [])

  const currentDate = useMemo(() => {
    const d = new Date()
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ]
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
  }, [])

  if (loading) {
    return <Loading className="py-16" />
  }

  const tiles: StatTile[] = [
    {
      key: 'sessions',
      label: 'Running',
      value: runningCount,
      hint: runningCount > 0 ? 'active now' : 'all idle',
      accent: 'success',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      ),
    },
    {
      key: 'profiles',
      label: 'Profiles',
      value: profileCount,
      hint: 'across 4 types',
      accent: 'accent',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="3.5" />
          <path d="M2.5 20a6.5 6.5 0 0113 0" />
          <circle cx="17" cy="9" r="2.5" />
          <path d="M21.5 18a4.5 4.5 0 00-7-3.7" />
        </svg>
      ),
    },
    {
      key: 'library',
      label: 'Providers',
      value: providerCount,
      hint: 'configured',
      accent: 'info',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 5h7v14H3z" />
          <path d="M10 5h7v14h-7z" />
          <path d="M17 5h4v14h-4z" />
        </svg>
      ),
    },
    {
      key: 'sessions',
      label: 'Sessions',
      value: sessionCount,
      hint: 'all time',
      accent: 'warning',
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12h4l3-9 4 18 3-9h4" />
        </svg>
      ),
    },
  ]

  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-10">
      {/* ── Header / welcome ─────────────────────────────────────── */}
      <PageHeader
        title={
          <span className="flex items-baseline gap-3">
            <span>{greeting}</span>
            <span className="text-[15px] font-normal text-muted-foreground/60 tracking-normal font-mono">
              {currentDate}
            </span>
          </span>
        }
        stats={
          <>
            <StatusDot
              variant={runningCount > 0 ? 'running' : 'stopped'}
              className="inline-block align-[-1px] mr-1.5"
            />
            <span className="text-foreground font-medium">
              {runningCount > 0 ? `${runningCount} running now` : 'All idle'}
            </span>
            <span className="mx-2 text-border">·</span>
            <span>{profileCount} profiles</span>
            <span className="mx-2 text-border">·</span>
            <span>{providerCount} providers</span>
            <span className="mx-2 text-border">·</span>
            <span className="font-mono">v0.5.0</span>
          </>
        }
        action={
          <Button variant="default" size="lg" onClick={() => onNav('profiles')}>
            Launch a profile →
          </Button>
        }
        className="mb-10"
      />

      {/* ── Stat tiles ──────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-12">
        {tiles.map((tile) => (
          <StatTileCard key={tile.label} tile={tile} onClick={() => onNav(tile.key)} />
        ))}
      </div>

      {/* ── Quick launch + Recent activity ──────────────────────── */}
      <div className="grid grid-cols-3 gap-6">
        {/* Quick launch column */}
        <section className="col-span-2 rounded-xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.06)] p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-foreground">
                Recent sessions
              </h2>
              <p className="text-xs text-muted-foreground">
                Last {recentSessions.length} launches
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNav('sessions')}
              className="text-muted-foreground"
            >
              View all →
            </Button>
          </div>

          {recentSessions.length === 0 ? (
            <div className="rounded-lg bg-muted/30 p-10 text-center">
              <p className="text-sm text-muted-foreground">No sessions yet</p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => onNav('profiles')}
              >
                Launch your first profile
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {recentSessions.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    'group flex items-center gap-4 rounded-lg px-3 py-2.5 cursor-pointer',
                    'transition-colors duration-fast',
                    // Running rows have a subtle accent tint
                    !s.exitedAt && 'bg-accent/[0.04]',
                    // Hover lift — the row becomes more prominent on hover
                    'hover:bg-muted/70 hover:translate-x-0.5',
                  )}
                >
                  <StatusDot
                    variant={s.exitedAt ? 'stopped' : 'running'}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground truncate">
                        {s.profile}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground/70 truncate">
                        {s.mode}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                      {s.cwd}
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
                      s.exitedAt
                        ? 'bg-muted text-muted-foreground'
                        : 'bg-accent/10 text-accent',
                    )}
                  >
                    {s.exitedAt ? 'exited' : 'running'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Side rail — links to other pages */}
        <section className="space-y-3">
          <RailCard
            title="Manage profiles"
            description="Create, edit, switch between agent profiles."
            onClick={() => onNav('profiles')}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3.5" />
                <path d="M2.5 20a6.5 6.5 0 0113 0" />
                <circle cx="17" cy="9" r="2.5" />
                <path d="M21.5 18a4.5 4.5 0 00-7-3.7" />
              </svg>
            }
          />
          <RailCard
            title="Provider library"
            description="Switch API endpoints, manage Claude.md templates."
            onClick={() => onNav('library')}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 5h7v14H3z" />
                <path d="M10 5h7v14h-7z" />
                <path d="M17 5h4v14h-4z" />
              </svg>
            }
          />
          <RailCard
            title="Settings"
            description="Theme, projects directory, about."
            onClick={() => onNav('settings')}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 00.34 1.87l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.7 1.7 0 00-1.87-.34 1.7 1.7 0 00-1.03 1.56V21a2 2 0 11-4 0v-.09a1.7 1.7 0 00-1.11-1.56 1.7 1.7 0 00-1.87.34l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.7 1.7 0 00.34-1.87 1.7 1.7 0 00-1.56-1.03H3a2 2 0 110-4h.09a1.7 1.7 0 001.56-1.11 1.7 1.7 0 00-.34-1.87l-.06-.06a2 2 0 112.83-2.83l.06.06a1.7 1.7 0 001.87.34h.05a1.7 1.7 0 001.03-1.56V3a2 2 0 114 0v.09a1.7 1.7 0 001.03 1.56 1.7 1.7 0 001.87-.34l.06-.06a2 2 0 112.83 2.83l-.06.06a1.7 1.7 0 00-.34 1.87V9a1.7 1.7 0 001.56 1.03H21a2 2 0 110 4h-.09a1.7 1.7 0 00-1.56 1.03z" />
              </svg>
            }
          />
        </section>
      </div>
    </div>
  )
}

// ── Hero stat — large dashboard-style number with label ─────────────

// (HeroStat is kept for potential future use; current Home uses inline
//  time-aware greeting in PageHeader instead of a stat row.)

// ── Stat tile card ────────────────────────────────────────────────────

function StatTileCard({
  tile,
  onClick,
}: {
  tile: StatTile
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative flex flex-col gap-4 overflow-hidden rounded-xl bg-card p-5 text-left cursor-pointer',
        ' shadow-[0_2px_4px_rgba(28,25,23,0.05),0_8px_24px_-8px_rgba(28,25,23,0.12)]',
        'transition-all duration-normal',
        'hover:-translate-y-1 hover:shadow-[0_4px_8px_rgba(28,25,23,0.06),0_16px_32px_-8px_rgba(28,25,23,0.16)] ',
        'motion-safe:hover:scale-[1.01]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2',
        // Bottom accent bar (visible on hover)
        'after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:scale-x-0 after:bg-accent after:transition-transform after:duration-normal after:origin-left',
        'hover:after:scale-x-100',
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {tile.label}
        </span>
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md bg-muted/60 text-muted-foreground',
            'transition-all duration-normal',
            'group-hover:bg-accent/10 group-hover:text-accent group-hover:scale-110',
          )}
        >
          {tile.icon}
        </span>
      </div>

      <div>
        <div className="text-3xl font-bold tracking-[-0.025em] text-foreground tabular-nums">
          {tile.value}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {tile.hint}
        </div>
      </div>
    </button>
  )
}

// ── Rail card ─────────────────────────────────────────────────────────

function RailCard({
  title,
  description,
  onClick,
  icon,
}: {
  title: string
  description: string
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex w-full items-start gap-3 rounded-xl bg-card p-4 text-left cursor-pointer',
        ' shadow-[0_1px_2px_rgba(28,25,23,0.04),0_1px_3px_rgba(28,25,23,0.05)]',
        'transition-all duration-normal',
        'hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgba(28,25,23,0.05),0_8px_24px_-6px_rgba(28,25,23,0.10)] ',
        'motion-safe:hover:scale-[1.005]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2',
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground transition-all duration-normal group-hover:bg-foreground group-hover:text-background group-hover:scale-105">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground group-hover:text-foreground">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {description}
        </div>
      </div>
      <span className="self-center text-muted-foreground transition-transform duration-normal group-hover:translate-x-1 group-hover:text-accent">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </button>
  )
}