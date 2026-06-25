/**
 * Profiles Page — Manage agent configuration profiles
 *
 * Lists profiles grouped by agent type, with search, filtering,
 * launch (with mode/cwd), and delete actions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Card, Badge, Input } from '@/components/ui'
import { EmptyState, Loading } from '@/components/feedback'
import { useToast } from '@/components/feedback/toast'
import { useProfiles } from '@/hooks'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import type { AgentType, Profile } from '@/api'
import { AGENT_TYPES, AGENT_TYPE_COLORS, deleteProfile, launchProfile, getLastCwdMap, browseDir } from '@/api'

// ── Agent type icons ────────────────────────────────────────────────────

const AGENT_TYPE_ICONS: Record<AgentType, string> = {
  claude: '⬜',
  codex: '▭',
  hermes: '◈',
  opencode: '◇',
}

// ── Launch modes ────────────────────────────────────────────────────────

const LAUNCH_MODES = [
  { value: '新会话', label: 'New Session' },
  { value: '继续上次', label: 'Resume Last' },
] as const

// ── Filter tab type ─────────────────────────────────────────────────────

type FilterTab = AgentType | 'all'

// ── Component ───────────────────────────────────────────────────────────

interface ProfilesPageProps {
  onOpenDetail?: (name: string) => void
}

export function ProfilesPage({ onOpenDetail }: ProfilesPageProps) {
  const { profiles, loading, error, refresh, filterByType } = useProfiles()
  const { toast } = useToast()

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [lastCwdMap, setLastCwdMap] = useState<Record<string, string>>({})

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
      <div className="p-8">
        <h1 className="mb-6 text-xl font-bold text-foreground">Profiles</h1>
        <Loading variant="skeleton" rows={4} />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-8">
        <h1 className="mb-6 text-xl font-bold text-foreground">Profiles</h1>
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
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">Profiles</h1>
      </div>

      {/* Filter tabs */}
      <FilterTabs
        active={activeFilter}
        counts={countByType}
        onChange={setActiveFilter}
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

// ── Filter Tabs ─────────────────────────────────────────────────────────

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'claude', label: 'Claude' },
  { key: 'codex', label: 'Codex' },
  { key: 'hermes', label: 'Hermes' },
  { key: 'opencode', label: 'OpenCode' },
]

function FilterTabs({
  active,
  counts,
  onChange,
}: {
  active: FilterTab
  counts: Record<FilterTab, number>
  onChange: (key: FilterTab) => void
}) {
  return (
    <div className="mb-4 flex gap-1 border-b border-card-border">
      {FILTER_TABS.map(({ key, label }) => {
        const isActive = active === key
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={cn(
              'px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'border-b-2 border-primary text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label} ({counts[key] ?? 0})
          </button>
        )
      })}
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
  onLaunch,
  onDelete,
  onView,
}: {
  profile: Profile
  lastCwd: string
  onLaunch: (name: string, mode: string, cwd: string) => void
  onDelete: (name: string) => void
  onView: (name: string) => void
}) {
  const { name, agentType, displayName, description, providerRef, createdAt } =
    profile

  const [mode, setMode] = useState<string>('继续上次')
  const [cwd, setCwd] = useState<string>(lastCwd || '~')

  // Update cwd when lastCwd changes (on initial load)
  useEffect(() => {
    if (lastCwd) setCwd(lastCwd)
  }, [lastCwd])

  const badgeVariant = AGENT_TYPE_COLORS[agentType]
  const icon = AGENT_TYPE_ICONS[agentType]

  const handleBrowse = async () => {
    try {
      const path = await browseDir('~/projects')
      if (path) setCwd(path)
    } catch {
      // silently ignore — user cancelled or bridge unavailable
    }
  }

  return (
    <Card hoverable>
      <div className="flex items-start gap-4 p-4">
        {/* Agent type icon */}
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-base">
          {icon}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Row 1: name + badge + launch button */}
          <div className="flex items-center gap-3">
            <span
              className="truncate font-semibold text-foreground cursor-pointer hover:text-primary transition-colors"
              onClick={() => onView(name)}
            >
              {name}
            </span>
            <Badge variant={badgeVariant as 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'}>
              {agentType}
            </Badge>
            <div className="ml-auto shrink-0">
              <Button size="sm" onClick={() => onLaunch(name, mode, cwd)}>
                ▶ Launch
              </Button>
            </div>
          </div>

          {/* Row 2: description */}
          {(displayName || description) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {displayName && <span>{displayName}</span>}
              {displayName && description && <span>·</span>}
              {description && <span>{description}</span>}
            </div>
          )}

          {/* Row 3: provider + created */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {providerRef && (
              <span>provider: {providerRef}</span>
            )}
            {createdAt != null && (
              <span>created: {formatRelativeTime(createdAt)}</span>
            )}
          </div>

          {/* Row 4: cwd display + edit */}
          <div className="flex items-center gap-2 pt-1">
            <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
              {cwd || '~'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onView(name)}
              className="shrink-0 text-xs text-muted-foreground"
            >
              Edit ...
            </Button>
          </div>

          {/* Row 5: browse + mode selector + actions */}
          <div className="flex items-center gap-2 pt-1">
            {/* Browse button */}
            <button
              onClick={handleBrowse}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-input bg-card text-sm transition-colors hover:bg-muted"
              title="Browse for directory"
            >
              📁
            </button>

            {/* Mode selector */}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="h-7 rounded-md border border-input bg-card px-2 text-xs text-foreground"
            >
              {LAUNCH_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Action buttons */}
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="sm" onClick={() => onView(name)}>
                View
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => onDelete(name)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
