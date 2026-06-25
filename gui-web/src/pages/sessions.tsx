/**
 * Sessions Page — View and manage active agent sessions
 *
 * Lists sessions with status filtering, cleanup actions,
 * and real-time relative timestamps.
 */

import { useCallback, useMemo, useState } from 'react'
import { Button, Badge } from '@/components/ui'
import { EmptyState, Loading } from '@/components/feedback'
import { useToast } from '@/components/feedback/toast'
import { useSessions } from '@/hooks'
import { cn, formatRelativeTime } from '@/lib/utils'
import { cleanupSessions } from '@/api'
import type { Session, SessionStatus } from '@/api'
import { AGENT_TYPE_COLORS } from '@/api'

// ── Filter tab type ─────────────────────────────────────────────────────

type FilterTab = 'all' | SessionStatus

// ── Component ───────────────────────────────────────────────────────────

export function SessionsPage() {
  const { sessions, running, exited, loading, error, refresh } = useSessions()
  const { toast } = useToast()

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [cleaning, setCleaning] = useState(false)

  // ── Filtered sessions ───────────────────────────────────────────────

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

  // ── Count per tab ───────────────────────────────────────────────────

  const counts: Record<FilterTab, number> = useMemo(
    () => ({
      all: sessions.length,
      running: running.length,
      exited: exited.length,
    }),
    [sessions, running, exited],
  )

  // ── Cleanup handler ─────────────────────────────────────────────────

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

  // ── Loading state ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="mb-6 text-xl font-bold text-foreground">Sessions</h1>
        <Loading variant="skeleton" rows={4} />
      </div>
    )
  }

  // ── Error state ─────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="p-8">
        <h1 className="mb-6 text-xl font-bold text-foreground">Sessions</h1>
        <div className="flex flex-col items-center gap-3 py-16 text-destructive">
          <p className="text-sm">{error}</p>
          <Button variant="ghost" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Sessions</h1>
        <Button
          variant="ghost"
          size="sm"
          isLoading={cleaning}
          onClick={handleCleanup}
        >
          Cleanup
        </Button>
      </div>

      {/* Filter tabs */}
      <FilterTabs
        active={activeFilter}
        counts={counts}
        onChange={setActiveFilter}
      />

      {/* Session list */}
      {filteredSessions.length === 0 ? (
        <EmptyState
          icon="⟳"
          title="No sessions yet"
          description="Launch a profile to start a new session."
        />
      ) : (
        <div className="flex flex-col gap-2">
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

function FilterTabs({
  active,
  counts,
  onChange,
}: {
  active: FilterTab
  counts: Record<FilterTab, number>
  onChange: (tab: FilterTab) => void
}) {
  return (
    <div className="flex gap-1 border-b border-card-border">
      {FILTER_TABS.map(({ key, label }) => {
        const isActive = active === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              'relative px-3 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label} ({counts[key] ?? 0})
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Session Row ─────────────────────────────────────────────────────────

function SessionRow({ session }: { session: Session }) {
  const {
    profile,
    agentType,
    cwd,
    mode,
    pid,
    launchedAt,
    exitedAt,
    exitCode,
  } = session

  const isRunning = !exitedAt
  const badgeVariant = AGENT_TYPE_COLORS[agentType]

  return (
    <div
      className={cn(
        'flex items-center gap-4 rounded-lg border border-card-border bg-card px-4 py-3',
        'transition-colors hover:bg-card/80',
      )}
    >
      {/* Profile name + agent type badge */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="shrink-0 font-semibold text-foreground">{profile}</span>
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
      <span className="hidden min-w-0 max-w-[200px] truncate font-mono text-xs text-muted-foreground md:block">
        {cwd}
      </span>

      {/* Mode + PID */}
      <div className="hidden flex-col items-end gap-0.5 sm:flex">
        <span className="text-xs text-muted-foreground">
          {mode ?? 'interactive'}
          {pid != null && <span className="ml-1 opacity-60">· PID {pid}</span>}
        </span>
      </div>

      {/* Launched time */}
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatRelativeTime(launchedAt)}
      </span>

      {/* Status indicator */}
      <StatusIndicator
        running={isRunning}
        exitCode={exitCode}
      />
    </div>
  )
}

// ── Status Indicator ────────────────────────────────────────────────────

function StatusIndicator({
  running,
  exitCode,
}: {
  running: boolean
  exitCode?: number
}) {
  if (running) {
    return (
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-success">
        <span className="h-2 w-2 rounded-full bg-success" />
        running
      </span>
    )
  }

  const isCleanExit = exitCode === 0
  return (
    <span
      className={cn(
        'flex shrink-0 items-center gap-1.5 text-xs font-medium',
        isCleanExit ? 'text-muted-foreground' : 'text-destructive',
      )}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          isCleanExit ? 'bg-muted-foreground' : 'bg-destructive',
        )}
      />
      exited{!isCleanExit && exitCode != null ? ` (${exitCode})` : ''}
    </span>
  )
}
