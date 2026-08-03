/**
 * Profiles Page — Manage agent configuration profiles
 *
 * Lists profiles grouped by agent type, with search, filtering,
 * launch (with mode/cwd), and delete actions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Badge, Input, Tabs } from '@/components/ui'
import { EmptyState, Loading } from '@/components/feedback'
import { useToast } from '@/components/feedback/toast'
import { PageHeader } from '@/components/layout'
import { useAgentConfigs, useAgentIdentity, useAgentTypeColor, useDefaultAgent, useLibrary, useProfiles, useSessions, resolveAgentIdentity } from '@/hooks'
import { cn } from '@/lib/utils'
import type { AgentType, Profile } from '@/api'
import { createProfile, deleteProfile, launchProfile, getLastCwdMap, browseDir } from '@/api'
import { readSettings } from '@/lib/settings'
import { ProviderIcon } from '@/components/ProviderIcon'
import { hasIcon, getIconMetadata } from '@/icons/extracted'

// ── Provider icon resolution ────────────────────────────────────────────

/** Resolve a provider's icon key — backend icon wins, name heuristics
 *  fallback.  No hardcoded provider names: the icon comes from the ACS
 *  providers table via the backend. */
function resolveIconKey(name: string, icon?: string | null): string | undefined {
  if (icon && hasIcon(icon)) return icon
  const lower = name.toLowerCase()
  if (hasIcon(lower)) return lower
  for (const word of lower.split(/[\s\-_]+/)) {
    if (word.length >= 3 && hasIcon(word)) return word
  }
  return undefined
}

// ── Launch modes ────────────────────────────────────────────────────────

const LAUNCH_MODES = [
  { value: '新会话', labelKey: 'profiles.launchMode.newSession' },
  { value: '继续上次', labelKey: 'profiles.launchMode.resumeLast' },
] as const

// ── Filter tab type ─────────────────────────────────────────────────────

type FilterTab = AgentType | 'all'

const FILTER_TABS: { key: FilterTab; labelKey: string }[] = [
  { key: 'all', labelKey: 'profiles.filter.all' },
  { key: 'claude', labelKey: 'agent.claude' },
  { key: 'codex', labelKey: 'agent.codex' },
  { key: 'hermes', labelKey: 'agent.hermes' },
  { key: 'opencode', labelKey: 'agent.opencode' },
]

/** Create-modal agent display names (brand names, identical in both packs). */
const CREATE_AGENT_KEYS: Record<string, string> = {
  claude: 'agent.claudeCode',
  codex: 'agent.codex',
  hermes: 'agent.hermes',
  opencode: 'agent.opencode',
}

// ── Component ───────────────────────────────────────────────────────────

interface ProfilesPageProps {
  onOpenDetail?: (name: string) => void
  autoOpenCreate?: boolean
  onAutoOpenCreateHandled?: () => void
}

export function ProfilesPage({ onOpenDetail, autoOpenCreate, onAutoOpenCreateHandled }: ProfilesPageProps) {
  const { t } = useTranslation()
  const { profiles, loading, error, refresh, filterByType } = useProfiles()
  const { sessions } = useSessions()
  const { agentConfigs } = useAgentConfigs()
  // Registry-driven agent types (loading fallback: empty list).
  const agentTypes = useMemo(() => (agentConfigs ? Object.keys(agentConfigs) : []), [agentConfigs])
  const { toast } = useToast()

  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [lastCwdMap, setLastCwdMap] = useState<Record<string, string>>({})
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  // Auto-open create modal when navigated from sidebar "New profile" button
  useEffect(() => {
    if (autoOpenCreate) {
      setShowCreate(true)
      onAutoOpenCreateHandled?.()
    }
  }, [autoOpenCreate, onAutoOpenCreateHandled])

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
    const counts: Record<string, number> = { all: profiles.length }
    for (const t of agentTypes) {
      counts[t] = profiles.filter((p) => p.agentType === t).length
    }
    return counts
  }, [profiles, agentTypes])

  // ── Handlers ────────────────────────────────────────────────────────

  const handleLaunch = useCallback(
    async (name: string, mode: string, cwd: string) => {
      try {
        const profile = profiles.find((p) => p.name === name)
        await launchProfile(name, {
          agentType: profile?.agentType ?? '',
          mode,
          cwd,
        })
        toast({ type: 'success', message: t('profiles.toast.launched', { name, mode }) })
      } catch {
        toast({ type: 'error', message: t('profiles.toast.launchFailed', { name }) })
      }
    },
    [profiles, toast],
  )

  const handleDelete = useCallback(
    (name: string) => { setDeleteTarget(name) },
    [],
  )

  const confirmDelete = useCallback(async () => {
    const name = deleteTarget
    if (!name) return
    setDeleteTarget(null)
    try {
      await deleteProfile(name)
      toast({ type: 'success', message: t('profiles.toast.deleted', { name }) })
      refresh()
    } catch {
      toast({ type: 'error', message: t('profiles.toast.deleteFailed', { name }) })
    }
  }, [deleteTarget, toast, refresh])

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
          title={t('profiles.title')}
          subtitle={t('profiles.description')}
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
          title={t('profiles.title')}
          subtitle={t('profiles.description')}
          className="mb-6"
        />
        <div className="flex flex-col items-center gap-3 py-16 text-destructive">
          <p>{error}</p>
          <Button variant="ghost" size="sm" onClick={refresh}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col px-8 py-10">
      <PageHeader
        title={t('profiles.title')}
        stats={
          <>
            <span className="text-foreground font-medium">{t('profiles.count', { count: profiles.length })}</span>
          </>
        }
        action={
          <Button size="lg" onClick={() => setShowCreate(true)}>
            {t('profiles.new')}
          </Button>
        }
        className="mb-6"
      />

      {/* Filter tabs */}
      <Tabs<FilterTab>
        tabs={FILTER_TABS.map(({ key, labelKey }) => ({
          key,
          label: t(labelKey),
          count: countByType[key] ?? 0,
        }))}
        active={activeFilter}
        onChange={setActiveFilter}
        className="mb-4"
      />

      {/* Search */}
      <div className="mb-4">
        <Input
          placeholder={t('profiles.searchPlaceholder')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Profile list */}
      {filteredProfiles.length === 0 ? (
        <EmptyState
          icon="📭"
          title={searchQuery ? t('profiles.empty.noMatches') : t('profiles.empty.noProfiles')}
          description={
            searchQuery
              ? t('profiles.empty.noMatchesDesc')
              : t('profiles.empty.noProfilesDesc')
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

      {/* Create Profile Modal */}
      {showCreate && (
        <CreateProfileModal
          agentTypes={agentTypes}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refresh() }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteTarget(null)}>
          <div
            className="relative w-full max-w-sm rounded-xl bg-card shadow-xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4">
              <h3 className="font-semibold text-foreground">{t('profiles.delete.title')}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {t('profiles.delete.message', { name: deleteTarget })}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60">
              <Button variant="outline" size="sm" onClick={() => setDeleteTarget(null)}>{t('common.cancel')}</Button>
              <Button size="sm" variant="destructive" onClick={confirmDelete}>{t('profiles.delete.confirm')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



// ── Create Profile Modal ─────────────────────────────────────────────────

function CreateProfileModal({
  agentTypes,
  onClose,
  onCreated,
}: {
  agentTypes: string[]
  onClose: () => void
  onCreated: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { agentConfigs } = useAgentConfigs()

  const [name, setName] = useState('')
  // Default agent type comes from the backend (config.DEFAULT_AGENT_TYPE).
  const defaultAgent = useDefaultAgent()
  const [agentType, setAgentType] = useState<AgentType>(defaultAgent as AgentType)
  const [displayName, setDisplayName] = useState('')
  const [description, setDescription] = useState('')
  const [creating, setCreating] = useState(false)

  // The backend default loads async — adopt it until the user picks explicitly.
  useEffect(() => {
    setAgentType((prev) => prev || (defaultAgent as AgentType))
  }, [defaultAgent])

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    try {
      await createProfile(name.trim(), agentType, {
        displayName: displayName.trim() || undefined,
        description: description.trim() || undefined,
      })
      toast({ type: 'success', message: t('profiles.toast.created', { name: name.trim() }) })
      onCreated()
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : t('profiles.toast.createFailed') })
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="relative w-full max-w-md rounded-xl bg-card shadow-xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-border/60 bg-card rounded-t-xl shrink-0">
          <h3 className="font-semibold text-foreground">{t('profiles.create.title')}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </Button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-4">
          {/* Agent Type */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">{t('profiles.create.agentType')}</label>
            <div className="grid grid-cols-2 gap-2">
              {agentTypes.map((at) => (
                <button
                  key={at}
                  onClick={() => setAgentType(at)}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-all',
                    at === agentType
                      ? 'border-primary bg-primary/10 text-primary font-medium'
                      : 'border-border hover:border-muted-foreground/30 text-muted-foreground',
                  )}
                >
                  <img
                    src={resolveAgentIdentity(agentConfigs, at).logo || undefined}
                    alt={at}
                    className="h-5 w-5 object-contain"
                  />
                  {t(CREATE_AGENT_KEYS[at] ?? at)}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block" htmlFor="profile-name">
              {t('profiles.create.name')} <span className="text-destructive">*</span>
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('profiles.create.namePlaceholder')}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
            />
          </div>

          {/* Display Name */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block" htmlFor="profile-display">
              {t('profiles.create.displayName')}
            </label>
            <Input
              id="profile-display"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder={t('profiles.create.displayNamePlaceholder')}
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block" htmlFor="profile-desc">
              {t('profiles.create.description')}
            </label>
            <Input
              id="profile-desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={t('profiles.create.descriptionPlaceholder')}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60 rounded-b-xl">
          <Button variant="outline" size="sm" onClick={onClose}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={handleCreate} disabled={!name.trim() || creating} isLoading={creating}>
            {t('profiles.create.create')}
          </Button>
        </div>
      </div>
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
  const { t } = useTranslation()
  const agentTypeColor = useAgentTypeColor()
  const { color: accentColor, logo } = useAgentIdentity(profile.agentType)
  const { name, agentType, displayName, description, providerRef } = profile

  const displayLabel = displayName || name
  // Resolve the provider badge icon from backend library data (provider id
  // → ACS row → icon field), not a hardcoded name→icon map.  Shared cache:
  // the providers slice loads once per agent type.
  const { providers } = useLibrary(agentType, ['providers'])
  const provider = providerRef ? providers.find(p => p.id === providerRef) : undefined
  const providerIconKey = provider ? resolveIconKey(provider.name, provider.icon) : undefined
  const providerIconColor = providerIconKey ? getIconMetadata(providerIconKey)?.defaultColor : undefined

  const [mode, setMode] = useState<string>('继续上次')
  const [cwd, setCwd] = useState<string>(lastCwd || '~')

  useEffect(() => {
    if (lastCwd) setCwd(lastCwd)
  }, [lastCwd])

  const handleBrowse = async () => {
    try {
      const path = await browseDir(readSettings().projects_dir)
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
            <Badge variant={agentTypeColor(agentType)}>
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
              {isRunning ? t('profiles.card.active') : t('profiles.card.idle')}
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
            title={t('profiles.card.browse')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
          </button>
          <button
            onClick={() => onView(name)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-all duration-fast cursor-pointer hover:scale-110"
            title={t('profiles.card.view')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            onClick={() => onDelete(name)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-fast cursor-pointer hover:scale-110"
            title={t('profiles.card.delete')}
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
                {t(m.labelKey)}
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
            {t('profiles.card.launch')}
          </Button>
        </div>
      </div>
    </div>
  )
}
