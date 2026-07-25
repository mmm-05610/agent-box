/**
 * Profiles Page — Manage agent configuration profiles
 *
 * Lists profiles grouped by agent type, with search, filtering,
 * launch (with mode/cwd), and delete actions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Badge, Input, Tabs } from '@/components/ui'
import { EmptyState, Loading } from '@/components/feedback'
import { useToast } from '@/components/feedback/toast'
import { PageHeader } from '@/components/layout'
import { useProfiles } from '@/hooks'
import { useSessions } from '@/hooks'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import type { AgentType, Profile } from '@/api'
import { AGENT_TYPES, AGENT_TYPE_COLORS, deleteProfile, launchProfile, getLastCwdMap, browseDir } from '@/api'
import { ProviderIcon } from '@/components/ProviderIcon'
import { hasIcon, getIconMetadata } from '@/icons/extracted'

// Agent type logos
import claudeLogo from '@/icons/extracted/claude.svg'
import codexLogo from '@/icons/extracted/openai.svg'
import hermesLogo from '@/icons/extracted/hermes.png'
import opencodeLogo from '@/icons/extracted/opencode-logo-light.svg'

// ── Agent type icons ────────────────────────────────────────────────────

const AGENT_TYPE_LOGOS: Record<AgentType, string> = {
  claude: claudeLogo,
  codex: codexLogo,
  hermes: hermesLogo,
  opencode: opencodeLogo,
}

const AGENT_TYPE_HEX: Record<AgentType, string> = {
  claude: '#D97757',
  codex: '#10A37F',
  hermes: '#8B5CF6',
  opencode: '#3B82F6',
}

// ── Provider icon resolution ────────────────────────────────────────────

const PROVIDER_ICON_ALIASES: Record<string, string> = {
  'claude official': 'claude',
  'openai official': 'openai',
  'xiaomi mimo': 'xiaomimimo',
  'xiaomi mimo token plan (china)': 'xiaomimimo',
  'zhipu glm': 'zhipu',
  'google gemini': 'gemini',
  'anthropic claude': 'claude',
  'byteplus volcengine': 'byteplus',
}

function resolveIconKey(name: string): string | undefined {
  const lower = name.toLowerCase()
  if (PROVIDER_ICON_ALIASES[lower] && hasIcon(PROVIDER_ICON_ALIASES[lower]))
    return PROVIDER_ICON_ALIASES[lower]
  if (hasIcon(lower)) return lower
  for (const word of lower.split(/[\s\-_]+/)) {
    if (word.length >= 3 && hasIcon(word)) return word
  }
  return undefined
}

// ── Launch modes ────────────────────────────────────────────────────────

const LAUNCH_MODES = [
  { value: '新会话', label: 'New Session' },
  { value: '继续上次', label: 'Resume Last' },
] as const

// ── Filter tab type ─────────────────────────────────────────────────────

type FilterTab = AgentType | 'all'

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'claude', label: 'Claude' },
  { key: 'codex', label: 'Codex' },
  { key: 'hermes', label: 'Hermes' },
  { key: 'opencode', label: 'OpenCode' },
]

// ── Component ───────────────────────────────────────────────────────────

interface ProfilesPageProps {
  onOpenDetail?: (name: string) => void
}

export function ProfilesPage({ onOpenDetail }: ProfilesPageProps) {
  const { profiles, loading, error, refresh, filterByType } = useProfiles()
  const { sessions } = useSessions()
  const { toast } = useToast()

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [lastCwdMap, setLastCwdMap] = useState<Record<string, string>>({})

  // Set of profile names that have running sessions
  const runningProfiles = useMemo(
    () => new Set(sessions.filter((s) => !s.exitedAt).map((s) => s.profile)),
    [sessions],
  )

  // Load last cwd from session history
  useEffect(() => {
    getLastCwdMap().then(setLastCwdMap).catch(() => {})
  }, [])

  // ── Filtered & searched profiles ────────────────────────────────────

  const filteredProfiles = useMemo(() => {
    const byType = filterByType(activeFilter)
    if (!searchQuery.trim()) return byType

    const q = searchQuery.toLowerCase()
    return byType.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.displayName?.toLowerCase().includes(q) ?? false) ||
        (p.description?.toLowerCase().includes(q) ?? false),
    )
  }, [activeFilter, searchQuery, filterByType])

  // ── Count per type (for tab labels) ─────────────────────────────────

  const countByType = useMemo(() => {
    const counts: Record<FilterTab, number> = { all: profiles.length }
    for (const t of AGENT_TYPES) {
      counts[t] = profiles.filter((p) => p.agentType === t).length
    }
    return counts
  }, [profiles])

  // ── Handlers ────────────────────────────────────────────────────────

  const handleLaunch = useCallback(
    async (name: string, mode: string, cwd: string) => {
      try {
        const profile = profiles.find((p) => p.name === name)
        await launchProfile(name, {
          agentType: profile?.agentType ?? 'claude',
          mode,
          cwd,
        })
        toast({ type: 'success', message: `Launched "${name}" (${mode})` })
      } catch {
        toast({ type: 'error', message: `Failed to launch "${name}"` })
      }
    },
    [profiles, toast],
  )

  const handleDelete = useCallback(
    async (name: string) => {
      const ok = window.confirm(`Delete profile "${name}"? This cannot be undone.`)
      if (!ok) return
      try {
        await deleteProfile(name)
        toast({ type: 'success', message: `Deleted "${name}"` })
        refresh()
      } catch {
        toast({ type: 'error', message: `Failed to delete "${name}"` })
      }
    },
    [toast, refresh],
  )

  const handleView = useCallback(
    (name: string) => {
      if (onOpenDetail) {
        onOpenDetail(name)
      }
    },
    [onOpenDetail],
  )

  // ── Loading / error states ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <PageHeader
          title="Profiles"
          description="Manage agent configuration profiles."
          className="mb-6"
        />
        <Loading variant="skeleton" rows={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-6xl px-8 py-10">
        <PageHeader
          title="Profiles"
          description="Manage agent configuration profiles."
          className="mb-6"
        />
        <div className="flex flex-col items-center gap-3 py-16 text-destructive">
          <p>{error}</p>
          <Button variant="ghost" size="sm" onClick={refresh}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-8 py-10">
      <PageHeader
        title="Profiles"
        stats={
          <>
            <span className="text-foreground font-medium">{profiles.length} profiles</span>
          </>
        }
        action={
          <Button size="lg">
            + New Profile
          </Button>
        }
        className="mb-6"
      />

      {/* Filter tabs */}
      <Tabs<FilterTab>
        tabs={FILTER_TABS.map(({ key, label }) => ({
          key,
          label,
          count: countByType[key] ?? 0,
        }))}
        active={activeFilter}
        onChange={setActiveFilter}
        className="mb-4"
      />

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder="Search profiles..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Profile list */}
      {filteredProfiles.length === 0 ? (
        <EmptyState
          icon="📭"
          title={searchQuery ? 'No matches' : 'No profiles yet'}
          description={
            searchQuery
              ? 'Try a different search query'
              : 'Create a profile to get started'
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredProfiles.map((profile) => (
            <ProfileCard
              key={profile.name}
              profile={profile}
              lastCwd={lastCwdMap[profile.name] ?? ''}
              isRunning={runningProfiles.has(profile.name)}
              onLaunch={handleLaunch}
              onDelete={handleDelete}
              onView={handleView}
            />
          ))}
        </div>
      )}
    </div>
  )
}



// ── Profile Card ────────────────────────────────────────────────────────
//
// Layout (matches old GUI):
//   ● profile-name  [CLAUDE]                ▶ Launch
//     Display Name · description
//     provider: xxx · created: 2h ago
//     ~/projects/dw                              [Edit ...]
//     [📁] [Mode: New Session ▾]              [View] [Delete]

function ProfileCard({
  profile,
  lastCwd,
  isRunning,
  onLaunch,
  onDelete,
  onView,
}: {
  profile: Profile
  lastCwd: string
  isRunning: boolean
  onLaunch: (name: string, mode: string, cwd: string) => void
  onDelete: (name: string) => void
  onView: (name: string) => void
}) {
  const { name, agentType, displayName, description, providerRef, createdAt } =
    profile

  const displayLabel = displayName || name
  const accentColor = AGENT_TYPE_HEX[agentType]
  const logo = AGENT_TYPE_LOGOS[agentType]
  const providerIconKey = providerRef ? resolveIconKey(providerRef) : undefined
  const providerIconColor = providerIconKey ? getIconMetadata(providerIconKey)?.defaultColor : undefined

  const [mode, setMode] = useState<string>('继续上次')
  const [cwd, setCwd] = useState<string>(lastCwd || '~')

  useEffect(() => {
    if (lastCwd) setCwd(lastCwd)
  }, [lastCwd])

  const handleBrowse = async () => {
    try {
      const path = await browseDir()
      if (path) setCwd(path)
    } catch {
      // silently ignore
    }
  }

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl bg-card',
        'transition-all duration-normal',
        'hover:shadow-md',
        isRunning && 'animate-active-glow ring-1 ring-success/20',
      )}
      style={{
        background: `linear-gradient(90deg, ${accentColor}1A 0%, ${accentColor}08 40%, transparent 70%)`,
        ...(isRunning ? { '--glow-color': `${accentColor}40` } : {}),
      }}
    >
      {/* Glass shine on left edge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1"
        style={{
          background: `linear-gradient(90deg, ${accentColor}25, transparent)`,
          boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.06)`,
        }}
      />

      <div className="flex items-center gap-4 px-5 py-4">
        {/* Agent logo — 40×40 */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden"
          style={{ backgroundColor: `${accentColor}14` }}
        >
          <img
            src={logo}
            alt={agentType}
            className="h-6 w-6 object-contain"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3
              className="text-sm font-semibold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
              onClick={() => onView(name)}
            >
              {displayLabel}
            </h3>
            <Badge variant={AGENT_TYPE_COLORS[agentType] as 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'}>
              {agentType}
            </Badge>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                isRunning
                  ? 'bg-success/10 text-success animate-active-text'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {isRunning ? 'Active' : 'Idle'}
            </span>
            {providerRef && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                title={providerRef}
              >
                {providerIconKey ? (
                  <ProviderIcon
                    icon={providerIconKey}
                    name={providerRef}
                    size={12}
                    color={providerIconColor}
                  />
                ) : (
                  <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded bg-muted text-[8px] font-medium">
                    {providerRef[0]?.toUpperCase()}
                  </span>
                )}
                <span className="truncate max-w-[80px]">{providerRef}</span>
              </span>
            )}
          </div>
          {(displayName || description) && (
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {displayName}{displayName && description && ' · '}{description}
            </p>
          )}
          <p className="mt-0.5 font-mono text-xs text-muted-foreground truncate">
            {cwd || '~'}
          </p>
        </div>

        {/* Actions — hover reveal */}
        <div className="flex items-center gap-1 opacity-0 pointer-events-none transition-opacity duration-fast group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
          <button
            onClick={handleBrowse}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-fast cursor-pointer hover:scale-110"
            title="Browse for directory"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
          </button>
          <button
            onClick={() => onView(name)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-fast cursor-pointer hover:scale-110"
            title="View profile"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(name)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-fast cursor-pointer hover:scale-110"
            title="Delete profile"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            </svg>
          </button>
        </div>

        {/* Launch group — always visible */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            className="h-8 rounded-md bg-muted px-2.5 text-xs text-muted-foreground border-0 outline-none cursor-pointer transition-all duration-fast hover:bg-muted/80 hover:scale-105"
          >
            {LAUNCH_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <Button size="sm" onClick={() => onLaunch(name, mode, cwd)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 00-2.91-.09z" />
              <path d="M12 15l-3-3a22 22 0 012-3.95A12.88 12.88 0 0122 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 01-4 2z" />
              <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
              <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
            </svg>
            Launch
          </Button>
        </div>
      </div>
    </div>
  )
}
