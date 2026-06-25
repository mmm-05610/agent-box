/**
 * Profiles Page — Manage agent configuration profiles
 *
 * Lists profiles grouped by agent type, with search, filtering,
 * launch, and delete actions.
 */

import { useCallback, useMemo, useState } from 'react'
import { Button, Card, Badge, Input } from '@/components/ui'
import { EmptyState, Loading } from '@/components/feedback'
import { useToast } from '@/components/feedback/toast'
import { useProfiles } from '@/hooks'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/utils'
import type { AgentType, Profile } from '@/api'
import { AGENT_TYPES, AGENT_TYPE_COLORS, deleteProfile, launchProfile } from '@/api'

// ── Agent type icons ────────────────────────────────────────────────────

const AGENT_TYPE_ICONS: Record<AgentType, string> = {
  claude: '⬜',
  codex: '▭',
  hermes: '◈',
  opencode: '◇',
}

// ── Filter tab type ─────────────────────────────────────────────────────

type FilterTab = AgentType | 'all'

// ── Component ───────────────────────────────────────────────────────────

export function ProfilesPage() {
  const { profiles, loading, error, refresh, filterByType } = useProfiles()
  const { toast } = useToast()

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')

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
    async (name: string) => {
      try {
        await launchProfile(name)
        toast({ type: 'success', message: `Launched "${name}"` })
      } catch {
        toast({ type: 'error', message: `Failed to launch "${name}"` })
      }
    },
    [toast],
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
        <h1 className="text-xl font-bold text-foreground">Profiles</h1>
        <Button size="sm">New Profile</Button>
      </div>

      {/* Filter tabs */}
      <FilterTabs
        active={activeFilter}
        counts={countByType}
        onChange={setActiveFilter}
      />

      {/* Search bar */}
      <Input
        size="sm"
        placeholder="Search profiles..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {/* Profile list */}
      {filteredProfiles.length === 0 ? (
        <EmptyState
          icon="📋"
          title={searchQuery ? 'No matches' : 'No profiles yet'}
          description={
            searchQuery
              ? 'Try a different search term.'
              : 'Create your first profile to get started.'
          }
          action={
            !searchQuery && (
              <Button size="sm">Create your first profile</Button>
            )
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filteredProfiles.map((profile) => (
            <ProfileCard
              key={profile.name}
              profile={profile}
              onLaunch={handleLaunch}
              onDelete={handleDelete}
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
  ...AGENT_TYPES.map((t) => ({ key: t as FilterTab, label: capitalize(t) })),
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
            {/* Underline indicator */}
            {isActive && (
              <span className="absolute inset-x-0 -bottom-px h-0.5 bg-foreground" />
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Profile Card ────────────────────────────────────────────────────────

function ProfileCard({
  profile,
  onLaunch,
  onDelete,
}: {
  profile: Profile
  onLaunch: (name: string) => void
  onDelete: (name: string) => void
}) {
  const { name, agentType, displayName, description, providerRef, createdAt } =
    profile

  const badgeVariant = AGENT_TYPE_COLORS[agentType]
  const icon = AGENT_TYPE_ICONS[agentType]

  return (
    <Card hoverable>
      <div className="flex items-start gap-4 p-4">
        {/* Agent type icon */}
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-base">
          {icon}
        </div>

        {/* Content */}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Row 1: name + badge + launch */}
          <div className="flex items-center gap-3">
            <span className="truncate font-semibold text-foreground">
              {name}
            </span>
            <Badge variant={badgeVariant as 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'}>
              {agentType}
            </Badge>
            <div className="ml-auto shrink-0">
              <Button size="sm" onClick={() => onLaunch(name)}>
                Launch
              </Button>
            </div>
          </div>

          {/* Row 2: display_name + description */}
          {(displayName || description) && (
            <p className="text-sm text-muted-foreground">
              {displayName && <span>{displayName}</span>}
              {displayName && description && (
                <span className="mx-1.5 opacity-40">·</span>
              )}
              {description && <span>{description}</span>}
            </p>
          )}

          {/* Row 3: provider + created */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {providerRef && (
              <span>
                provider:{' '}
                <span className="text-foreground">{providerRef}</span>
              </span>
            )}
            {createdAt != null && (
              <span>created: {formatRelativeTime(createdAt)}</span>
            )}
          </div>

          {/* Row 4: actions */}
          <div className="flex items-center gap-1 pt-1">
            <Button variant="ghost" size="sm">
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
    </Card>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
