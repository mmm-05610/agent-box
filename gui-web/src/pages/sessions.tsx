/**
 * Sessions Page — Active agent sessions
 *
 * Compact table-style layout: 40px row height, monospace PID/timestamps,
 * color-coded status pill (green pulse for running).
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Button, Badge, Tabs } from '@/components/ui'
import { EmptyState, Loading, StatusDot } from '@/components/feedback'
import { useToast } from '@/components/feedback/toast'
import { PageHeader } from '@/components/layout'
import { useSessions } from '@/hooks'
import { cn, formatRelativeTime } from '@/lib/utils'
import { cleanupSessions } from '@/api'
import type { Session, SessionStatus } from '@/api'
import { AGENT_TYPE_COLORS } from '@/api'

// ── Filter tab type ─────────────────────────────────────────────────────

type FilterTab = 'all' | SessionStatus

// ── Agent type hint (small accent dot next to profile name) ─────────────

const AGENT_TYPE_HEX: Record<string, string> = {
  claude: '#D97757',
  codex: '#10A37F',
  hermes: '#8B5CF6',
  opencode: '#3B82F6',
}

// ── Component ───────────────────────────────────────────────────────────

export function SessionsPage() {
  const { sessions, running, exited, loading, error, refresh } = useSessions()
  const { toast } = useToast()

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [cleaning, setCleaning] = useState(false)

  const filteredSessions = useMemo(() => {
    switch (activeFilter) {
      case 'running':
        return running
      case 'exited':
        return exited
      default:
        return sessions
    }
  }, [activeFilter, sessions, running, exited])

  const counts: Record<FilterTab, number> = useMemo(
    () => ({
      all: sessions.length,
      running: running.length,
      exited: exited.length,
    }),
    [sessions, running, exited],
  )

  const handleCleanup = useCallback(async () => {
    setCleaning(true)
    try {
      const count = await cleanupSessions()
      toast({
        type: 'success',
        message: `Cleaned up ${count} session${count !== 1 ? 's' : ''}`,
      })
      refresh()
    } catch {
      toast({ type: 'error', message: 'Failed to clean up sessions' })
    } finally {
      setCleaning(false)
    }
  }, [toast, refresh])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <PageHeader
          eyebrow="Sessions"
          title="Active sessions"
          description="Watch agents as they run, manage their lifecycle."
          className="mb-6"
        />
        <Loading variant="skeleton" rows={6} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <PageHeader
          eyebrow="Sessions"
          title="Active sessions"
          description="Watch agents as they run, manage their lifecycle."
          className="mb-6"
        />
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-8 py-10">
      <PageHeader
        title="Sessions"
        stats={
          <>
            <StatusDot
              variant={running.length > 0 ? 'running' : 'stopped'}
              className="inline-block align-[-1px] mr-1.5"
            />
            <span className="text-foreground font-medium">
              {running.length} running now
            </span>
            <span className="mx-2 text-border">·</span>
            <span>{exited.length} exited</span>
            <span className="mx-2 text-border">·</span>
            <span>{sessions.length} all time</span>
          </>
        }
        action={
          <Button
            variant="outline"
            size="lg"
            isLoading={cleaning}
            onClick={handleCleanup}
          >
            Cleanup exited
          </Button>
        }
        className="mb-6"
      />

      <Tabs<FilterTab>
        tabs={FILTER_TABS.map(({ key, label }) => ({
          key,
          label,
          count: counts[key] ?? 0,
        }))}
        active={activeFilter}
        onChange={setActiveFilter}
        className="mb-4"
      />

      {filteredSessions.length === 0 ? (
        <EmptyState
          icon="◇"
          title="No sessions"
          description="Launch a profile to start a new session."
        />
      ) : (
        <div className="overflow-hidden rounded-xl bg-card ">
          {/* Table header */}
          <div className="flex items-center gap-4 bg-muted/20 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <div className="flex-1 min-w-0">Profile</div>
            <div className="hidden md:block w-48 shrink-0">CWD</div>
            <div className="hidden sm:block w-24 shrink-0">Mode</div>
            <div className="w-20 shrink-0 text-right">Started</div>
            <div className="w-24 shrink-0 text-right">Status</div>
          </div>

          {filteredSessions.map((session) => (
            <SessionRow key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Filter Tabs ─────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'running', label: 'Running' },
  { key: 'exited', label: 'Exited' },
]

// ── Session Row ─────────────────────────────────────────────────────────

function SessionRow({ session }: { session: Session }) {
  const { profile, agentType, cwd, mode, pid, launchedAt, exitedAt, exitCode } =
    session

  const isRunning = !exitedAt
  const badgeVariant = AGENT_TYPE_COLORS[agentType]
  const accentColor = AGENT_TYPE_HEX[agentType] ?? '#888'

  return (
    <div
      className={cn(
        'group flex items-center gap-4 px-4 py-2.5',
        'transition-all duration-normal cursor-pointer',
        // Running rows get a subtle accent-tint background — alive
        isRunning && 'bg-accent/[0.04]',
        'hover:bg-muted/60 hover:translate-x-0.5',
      )}
    >
      {/* Profile name + agent type badge */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Agent type colored dot */}
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: accentColor }}
        />
        <span className="truncate text-sm font-medium text-foreground">
          {profile}
        </span>
        <Badge
          variant={
            badgeVariant as
              | 'neutral'
              | 'primary'
              | 'success'
              | 'warning'
              | 'destructive'
              | 'info'
          }
        >
          {agentType}
        </Badge>
      </div>

      {/* CWD path */}
      <span className="hidden md:block w-48 shrink-0 truncate font-mono text-xs text-muted-foreground">
        {cwd}
      </span>

      {/* Mode + PID */}
      <div className="hidden sm:flex w-24 shrink-0 flex-col items-start gap-0.5">
        <span className="text-xs text-muted-foreground truncate">
          {mode ?? 'interactive'}
        </span>
        {pid != null && (
          <span className="font-mono text-[10px] text-muted-foreground/60">
            PID {pid}
          </span>
        )}
      </div>

      {/* Launched time */}
      <span className="w-20 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
        {formatRelativeTime(launchedAt)}
      </span>

      {/* Status indicator */}
      <div className="w-24 shrink-0 text-right">
        <StatusBadge running={isRunning} exitCode={exitCode} />
      </div>
    </div>
  )
}

// ── Status Badge ────────────────────────────────────────────────────────

function StatusBadge({
  running,
  exitCode,
}: {
  running: boolean
  exitCode?: number
}) {
  if (running) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-subtle px-2.5 py-1 text-[11px] font-medium text-success">
        <StatusDot variant="running" />
        running
      </span>
    )
  }

  const isCleanExit = exitCode === 0
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium',
        isCleanExit
          ? 'bg-muted text-muted-foreground'
          : 'bg-destructive/10 text-destructive',
      )}
    >
      <StatusDot variant={isCleanExit ? 'stopped' : 'error'} />
      {isCleanExit ? 'exited' : `exited (${exitCode ?? '?'})`}
    </span>
  )
}