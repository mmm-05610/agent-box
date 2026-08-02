/**
 * Sessions Page — Active agent sessions
 *
 * Card-style layout matching ProfileCard/ProviderCard design language.
 * Each session is a card with agent type accent, status, and metadata.
 */

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Badge, Tabs } from '@/components/ui'
import { EmptyState, Loading, StatusDot } from '@/components/feedback'
import { useToast } from '@/components/feedback/toast'
import { PageHeader } from '@/components/layout'
import { useSessions } from '@/hooks'
import { cn, formatRelativeTime } from '@/lib/utils'
import { cleanupSessions } from '@/api'
import type { Session, SessionStatus, AgentType } from '@/api'
import { AGENT_TYPE_COLORS } from '@/api'
import claudeLogo from '@/icons/extracted/claude.svg'
import codexLogo from '@/icons/extracted/openai.svg'
import hermesLogo from '@/icons/extracted/hermes.png'
import opencodeLogo from '@/icons/extracted/opencode-logo-light.svg'

// ── Filter tab type ─────────────────────────────────────────────────────

type FilterTab = 'all' | SessionStatus

// ── Agent type constants ────────────────────────────────────────────────

const AGENT_TYPE_LOGOS: Record<AgentType, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  hermes: hermesLogo,
  opencode: opencodeLogo,
}

const AGENT_TYPE_HEX: Record<string, string> = {
  claude: '#D97757',
  codex: '#10A37F',
  hermes: '#8B5CF6',
  opencode: '#3B82F6',
}

// ── Component ───────────────────────────────────────────────────────────

export function SessionsPage() {
  const { t } = useTranslation()
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
        message: t(count === 1 ? 'sessions.toast.cleanedUpOne' : 'sessions.toast.cleanedUpOther', { count }),
      })
      refresh()
    } catch {
      toast({ type: 'error', message: t('sessions.toast.cleanupFailed') })
    } finally {
      setCleaning(false)
    }
  }, [toast, refresh])

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <PageHeader
          title={t('sessions.title')}
          description={t('sessions.description')}
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
          title={t('sessions.title')}
          description={t('sessions.description')}
          className="mb-6"
        />
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center">
          <p className="text-sm font-medium text-destructive">{error}</p>
          <Button variant="ghost" size="sm" className="mt-4" onClick={refresh}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-8 py-10">
      <PageHeader
        title={t('sessions.title')}
        stats={
          <>
            <StatusDot
              variant={running.length > 0 ? 'running' : 'stopped'}
              className="inline-block align-[-1px] mr-1.5"
            />
            <span className="text-foreground font-medium">
              {t('sessions.stats.runningNow', { count: running.length })}
            </span>
            <span className="mx-2 text-border">·</span>
            <span>{t('sessions.stats.exited', { count: exited.length })}</span>
            <span className="mx-2 text-border">·</span>
            <span>{t('sessions.stats.allTime', { count: sessions.length })}</span>
          </>
        }
        action={
          <Button
            variant="ghost"
            size="lg"
            isLoading={cleaning}
            onClick={handleCleanup}
          >
            {t('sessions.cleanup')}
          </Button>
        }
        className="mb-6"
      />

      <Tabs<FilterTab>
        tabs={FILTER_TABS.map(({ key, labelKey }) => ({
          key,
          label: t(labelKey),
          count: counts[key] ?? 0,
        }))}
        active={activeFilter}
        onChange={setActiveFilter}
        className="mb-4"
      />

      {filteredSessions.length === 0 ? (
        <EmptyState
          icon="◇"
          title={t('sessions.empty.title')}
          description={t('sessions.empty.description')}
        />
      ) : (
        <div className="flex flex-col gap-2.5">
          {filteredSessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Filter Tabs ─────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; labelKey: string }[] = [
  { key: 'all', labelKey: 'sessions.filter.all' },
  { key: 'running', labelKey: 'sessions.filter.running' },
  { key: 'exited', labelKey: 'sessions.filter.exited' },
]

// ── Session Card ────────────────────────────────────────────────────────

function SessionCard({ session }: { session: Session }) {
  const { t } = useTranslation()
  const { profile, agentType, cwd, mode, pid, launchedAt, exitedAt, exitCode } =
    session

  const isRunning = !exitedAt
  const accentColor = AGENT_TYPE_HEX[agentType] ?? '#888'
  const logo = AGENT_TYPE_LOGOS[agentType]

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl bg-card',
        'transition-all duration-normal',
        'hover:shadow-md',
        isRunning && 'ring-1 ring-emerald-500/20',
      )}
    >
      {/* Glass shine on left edge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-xl overflow-hidden"
        style={{
          background: `linear-gradient(90deg, ${accentColor}25, transparent)`,
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
        }}
      />

      <div className="flex items-center gap-4 px-5 py-4">
        {/* Agent type logo */}
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden',
            'transition-transform duration-normal group-hover:scale-105',
          )}
          style={{
            backgroundColor: `${accentColor}14`,
          }}
        >
          {logo ? (
            <img src={logo} alt={agentType} className="h-6 w-6 object-contain" />
          ) : (
            <span className="text-sm font-bold" style={{ color: accentColor }}>
              {agentType[0].toUpperCase()}
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {profile}
            </h3>
            <Badge
              variant={
                AGENT_TYPE_COLORS[agentType] as
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
            {isRunning && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t('sessions.card.running')}
              </span>
            )}
            {!isRunning && exitCode === 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                {t('sessions.card.exited')}
              </span>
            )}
            {!isRunning && exitCode !== undefined && exitCode !== 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                {t('sessions.card.exitedCode', { code: exitCode })}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-muted-foreground">
            {cwd && (
              <span className="font-mono truncate max-w-[200px]" title={cwd}>
                {cwd}
              </span>
            )}
            {mode && (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground/40">·</span>
                {mode}
              </span>
            )}
            {pid != null && (
              <span className="font-mono text-muted-foreground/50">
                {t('sessions.card.pid', { pid })}
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground/40">·</span>
              {formatRelativeTime(launchedAt)}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
