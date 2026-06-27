/**
 * Library Page — Provider & Claude.md management
 *
 * Layout: agent-type segmented control + tab strip + scrollable list of
 * provider cards. Each card uses the cc-switch icon registry to display
 * the provider's real brand logo (color preserved).
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Button, Input, Textarea } from '@/components/ui'
import { EmptyState, Loading, useToast } from '@/components/feedback'
import { PageHeader } from '@/components/layout'
import { useProviders, useProfiles } from '@/hooks'
import { cn } from '@/lib/utils'
import { ProviderIcon } from '@/components/ProviderIcon'
import { getIconMetadata, hasIcon } from '@/icons/extracted'
import type { AgentType, Provider, ClaudeMd, Profile } from '@/api'
import {
  AGENT_TYPES,
  saveProvider,
  deleteProvider,
  applyProviderToProfile,
  saveClaudeMd,
  deleteClaudeMd,
  applyClaudeMdToProfile,
  fetchProviderDetail,
} from '@/api'

// ── Helpers ────────────────────────────────────────────────────────────

function extractBaseUrl(env?: Record<string, string>): string | undefined {
  const url = env?.ANTHROPIC_BASE_URL
  if (!url) return undefined
  return url.replace(/^https?:\/\//, '')
}

function extractModel(env?: Record<string, string>): string | undefined {
  return env?.ANTHROPIC_MODEL
}

/** Alias map: common provider display names → icon registry keys. */
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

/** Map a provider name or category to an icon registry key (lowercase). */
function iconForProvider(provider: Provider): string | undefined {
  const name = provider.name.toLowerCase()

  // 1. Exact alias match
  if (PROVIDER_ICON_ALIASES[name] && hasIcon(PROVIDER_ICON_ALIASES[name]))
    return PROVIDER_ICON_ALIASES[name]

  // 2. Direct name match
  if (hasIcon(name)) return name

  // 3. Try each word in the name (e.g., "Zhipu GLM" → "zhipu")
  for (const word of name.split(/\s+/)) {
    if (word.length >= 3 && hasIcon(word)) return word
  }

  // 4. Category fallback
  if (provider.category) {
    const category = provider.category.toLowerCase()
    if (hasIcon(category)) return category
  }

  return undefined
}

// ── Types ──────────────────────────────────────────────────────────────

type TabKey = 'providers' | 'claudeMds'

interface EditingState {
  type: 'provider' | 'claudeMd'
  id: string
  content: string
}

interface LinkingState {
  providerId: string
  selectedProfiles: Set<string>
}

interface MdLinkingState {
  mdId: string
  profileName: string
}
// ── Component ──────────────────────────────────────────────────────────

export function LibraryPage() {
  const [agentType, setAgentType] = useState<AgentType>('claude')
  const [activeTab, setActiveTab] = useState<TabKey>('providers')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [linking, setLinking] = useState<LinkingState | null>(null)
  const [mdLinking, setMdLinking] = useState<MdLinkingState | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [addId, setAddId] = useState('')
  const [addContent, setAddContent] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const { providers, claudeMds, loading, error, refresh } = useProviders(agentType)
  const { profiles: allProfiles, refresh: refreshProfiles } = useProfiles()
  const { toast } = useToast()

  const query = search.toLowerCase().trim()

  const filteredProviders = useMemo(() => {
    if (!query) return providers
    return providers.filter((p) => {
      const haystack = [
        p.name,
        p.id,
        p.settings?.env?.ANTHROPIC_BASE_URL ?? '',
        p.category ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [providers, query])

  const filteredClaudeMds = useMemo(() => {
    if (!query) return claudeMds
    return claudeMds.filter((m) => {
      const haystack = [m.name, m.id, m.description ?? ''].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [claudeMds, query])

  const handleStartEdit = useCallback(
    async (type: TabKey, id: string) => {
      setEditError(null)
      setLinking(null)
      setShowAddPanel(false)
      if (type === 'providers') {
        try {
          const detail = await fetchProviderDetail(agentType, id)
          setEditing({
            type: 'provider',
            id,
            content: JSON.stringify(detail?.settings ?? {}, null, 2),
          })
        } catch {
          setEditError('Failed to load provider details')
        }
      } else {
        const md = claudeMds.find((m) => m.id === id)
        if (md) {
          setEditing({ type: 'claudeMd', id, content: md.content ?? '' })
        }
      }
    },
    [agentType, claudeMds],
  )

  const handleSaveEdit = useCallback(async () => {
    if (!editing) return
    setSaving(true)
    setEditError(null)
    try {
      if (editing.type === 'provider') {
        try {
          JSON.parse(editing.content)
        } catch {
          setEditError('Invalid JSON format')
          setSaving(false)
          return
        }
        await saveProvider(agentType, editing.id, editing.content)
        toast({ type: 'success', message: 'Provider saved' })
      } else {
        await saveClaudeMd(agentType, editing.id, editing.content)
        toast({ type: 'success', message: 'Claude.md saved' })
      }
      setEditing(null)
      refresh()
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [editing, agentType, refresh, toast])

  const handleDelete = useCallback(
    async (type: TabKey, id: string) => {
      try {
        if (type === 'providers') {
          await deleteProvider(agentType, id)
          toast({ type: 'success', message: 'Provider deleted' })
        } else {
          await deleteClaudeMd(agentType, id)
          toast({ type: 'success', message: 'Claude.md deleted' })
        }
        refresh()
      } catch (e) {
        toast({ type: 'error', message: e instanceof Error ? e.message : 'Delete failed' })
      }
    },
    [agentType, refresh, toast],
  )

  // Profiles that share this provider's agent_type — these are the
  // candidates the user can link to. Computed once per render so
  // ProviderCard doesn't need to know about AgentType.
  const linkableProfiles = useMemo(
    () => allProfiles.filter((p) => p.agentType === agentType),
    [allProfiles, agentType],
  )

  const handleOpenLinking = useCallback(
    (providerId: string) => {
      setEditing(null)
      setShowAddPanel(false)
      setLinking({ providerId, selectedProfiles: new Set() })
    },
    [],
  )

  const handleToggleLinkSelection = useCallback((profileName: string) => {
    setLinking((prev) => {
      if (!prev) return prev
      const next = new Set(prev.selectedProfiles)
      if (next.has(profileName)) next.delete(profileName)
      else next.add(profileName)
      return { ...prev, selectedProfiles: next }
    })
  }, [])

  // Pending provider-switch confirmation. When non-null, a modal asks
  // the user before overwriting profiles' existing provider_ref.
  const [pendingSwitch, setPendingSwitch] = useState<{
    providerId: string
    picks: string[]
    switches: { profileName: string; currentProviderId: string }[]
  } | null>(null)

  const runLink = useCallback(
    async (providerId: string, picks: string[]) => {
      setSaving(true)
      try {
        for (const profileName of picks) {
          await applyProviderToProfile(profileName, providerId)
        }
        toast({
          type: 'success',
          message:
            picks.length === 1
              ? `Linked to ${picks[0]}`
              : `Linked to ${picks.length} profiles`,
        })
        setLinking(null)
        setPendingSwitch(null)
        refreshProfiles()
      } catch (e) {
        toast({ type: 'error', message: e instanceof Error ? e.message : 'Link failed' })
      } finally {
        setSaving(false)
      }
    },
    [refreshProfiles, toast],
  )

  const handleConfirmLink = useCallback(() => {
    if (!linking) return
    const picks = Array.from(linking.selectedProfiles)
    if (picks.length === 0) {
      setLinking(null)
      return
    }
    // Find profiles that already reference a DIFFERENT provider.
    // Those will overwrite an existing assignment — require confirmation.
    const switches = picks
      .map((name) => {
        const p = allProfiles.find((x) => x.name === name)
        if (!p || !p.providerRef || p.providerRef === linking.providerId) return null
        return { profileName: name, currentProviderId: p.providerRef }
      })
      .filter((x): x is { profileName: string; currentProviderId: string } => x !== null)

    if (switches.length > 0) {
      setPendingSwitch({ providerId: linking.providerId, picks, switches })
      return
    }
    // No switches — execute directly.
    void runLink(linking.providerId, picks)
  }, [linking, allProfiles, runLink])

  const handleConfirmSwitch = useCallback(() => {
    if (!pendingSwitch) return
    void runLink(pendingSwitch.providerId, pendingSwitch.picks)
  }, [pendingSwitch, runLink])

  const handleCancelSwitch = useCallback(() => {
    setPendingSwitch(null)
  }, [])

  const handleOpenMdLinking = useCallback(
    (mdId: string) => {
      setEditing(null)
      setShowAddPanel(false)
      const compatible = allProfiles.filter((p) => p.agentType === agentType)
      setMdLinking({
        mdId,
        profileName: compatible[0]?.name ?? '',
      })
    },
    [allProfiles, agentType],
  )

  const handleConfirmMdLink = useCallback(async () => {
    if (!mdLinking || !mdLinking.profileName) return
    setSaving(true)
    try {
      await applyClaudeMdToProfile(mdLinking.profileName, mdLinking.mdId)
      toast({
        type: 'success',
        message: `Applied ${mdLinking.mdId} to ${mdLinking.profileName}`,
      })
      setMdLinking(null)
      refreshProfiles()
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Apply failed' })
    } finally {
      setSaving(false)
    }
  }, [mdLinking, refreshProfiles, toast])

  const handleCreate = useCallback(async () => {
    if (!addId.trim()) {
      setAddError('ID is required')
      return
    }
    setCreating(true)
    setAddError(null)
    try {
      if (activeTab === 'providers') {
        try {
          JSON.parse(addContent)
        } catch {
          setAddError('Invalid JSON format')
          setCreating(false)
          return
        }
        await saveProvider(agentType, addId.trim(), addContent)
        toast({ type: 'success', message: 'Provider created' })
      } else {
        await saveClaudeMd(agentType, addId.trim(), addContent)
        toast({ type: 'success', message: 'Claude.md created' })
      }
      setShowAddPanel(false)
      setAddId('')
      setAddContent('')
      refresh()
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }, [addId, addContent, activeTab, agentType, refresh, toast])

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-8 py-10">
      {/* Header */}
      <PageHeader
        title="Library"
        stats={
          <>
            <span>{filteredProviders.length} providers</span>
            <span className="mx-2 text-border">·</span>
            <span>{filteredClaudeMds.length} Claude.md templates</span>
            <span className="mx-2 text-border">·</span>
            <span className="font-mono">catalog</span>
          </>
        }
        action={
          <Button
            size="lg"
            onClick={() => {
              setEditing(null)
              setLinking(null)
              setShowAddPanel(true)
            }}
          >
            + Add {activeTab === 'providers' ? 'provider' : 'Claude.md'}
          </Button>
        }
        className="mb-6"
      />

      {/* Agent type + Tab strip + Search */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <AgentTypeSwitcher value={agentType} onChange={setAgentType} />
        <div className="flex items-center gap-3">
          <SegmentedTabs
            tabs={[
              { key: 'providers', label: 'Providers', count: filteredProviders.length },
              { key: 'claudeMds', label: 'Claude.md', count: filteredClaudeMds.length },
            ]}
            active={activeTab}
            onChange={(k) => setActiveTab(k as TabKey)}
          />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto -mx-2 px-2">
        {loading ? (
          <Loading variant="skeleton" rows={4} />
        ) : error ? (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center">
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        ) : activeTab === 'providers' ? (
          <ProvidersList
            items={filteredProviders}
            editing={editing}
            linking={linking}
            editError={editError}
            saving={saving}
            allProfiles={linkableProfiles}
            onStartEdit={(id) => handleStartEdit('providers', id)}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={() => setEditing(null)}
            onEditContentChange={(c) =>
              setEditing((prev) => (prev ? { ...prev, content: c } : null))
            }
            onDelete={(id) => handleDelete('providers', id)}
            onOpenLinking={handleOpenLinking}
            onToggleLinkSelection={handleToggleLinkSelection}
            onConfirmLink={handleConfirmLink}
            onCancelLinking={() => setLinking(null)}
          />
        ) : (
          <ClaudeMdsList
            items={filteredClaudeMds}
            editing={editing}
            mdLinking={mdLinking}
            editError={editError}
            saving={saving}
            profiles={linkableProfiles}
            onStartEdit={(id) => handleStartEdit('claudeMds', id)}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={() => setEditing(null)}
            onEditContentChange={(c) =>
              setEditing((prev) => (prev ? { ...prev, content: c } : null))
            }
            onDelete={(id) => handleDelete('claudeMds', id)}
            onStartApply={handleOpenMdLinking}
            onApply={handleConfirmMdLink}
            onCancelApply={() => setMdLinking(null)}
            onApplyProfileChange={(name) =>
              setMdLinking((prev) => (prev ? { ...prev, profileName: name } : null))
            }
          />
        )}

        {/* Add Panel */}
        {showAddPanel && (
          <div className="mt-4 rounded-xl bg-card  p-6 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              New {activeTab === 'providers' ? 'Provider' : 'Claude.md'}
            </h3>
            <div className="flex flex-col gap-3">
              <Input
                placeholder="ID (e.g. my-provider)"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
              />
              <Textarea
                placeholder={
                  activeTab === 'providers'
                    ? '{\n  "env": {\n    "ANTHROPIC_API_KEY": "sk-..."\n  }\n}'
                    : '# Claude.md content...'
                }
                rows={6}
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
                error={addError ?? undefined}
                className="font-mono text-xs"
              />
              <div className="flex items-center justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowAddPanel(false)
                    setAddId('')
                    setAddContent('')
                    setAddError(null)
                  }}
                >
                  Cancel
                </Button>
                <Button size="sm" isLoading={creating} onClick={handleCreate}>
                  Create
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Provider-switch confirmation modal */}
        {pendingSwitch && (
          <SwitchConfirmDialog
            providerLabel={
              providers.find((p) => p.id === pendingSwitch.providerId)?.name ??
              pendingSwitch.providerId
            }
            switches={pendingSwitch.switches.map((s) => ({
              profileName: s.profileName,
              currentProviderLabel:
                providers.find((p) => p.id === s.currentProviderId)?.name ??
                s.currentProviderId,
            }))}
            isLoading={saving}
            onConfirm={handleConfirmSwitch}
            onCancel={handleCancelSwitch}
          />
        )}
      </div>
    </div>
  )
}

// ── Agent Type Segmented Control ─────────────────────────────────────────

function AgentTypeSwitcher({
  value,
  onChange,
}: {
  value: AgentType
  onChange: (t: AgentType) => void
}) {
  return (
    <div className="inline-flex items-center rounded-lg bg-card  p-0.5 shadow-sm">
      {AGENT_TYPES.map((t) => {
        const isActive = value === t
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={cn(
              'inline-flex items-center px-3 h-7 rounded-md text-xs font-medium cursor-pointer',
              'transition-all duration-normal',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1',
              isActive
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground motion-safe:hover:scale-[1.03]',
            )}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

// ── Segmented Tabs (small pill variant for tab strip) ────────────────────

function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count: number }[]
  active: T
  onChange: (k: T) => void
}) {
  return (
    <div className="inline-flex items-center rounded-lg bg-card  p-0.5 shadow-sm">
      {tabs.map((tab) => {
        const isActive = active === tab.key
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 h-7 rounded-md text-xs font-medium cursor-pointer',
              'transition-all duration-normal',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1',
              isActive
                ? 'bg-foreground text-background shadow-sm'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground motion-safe:hover:scale-[1.03]',
            )}
          >
            {tab.label}
            <span
              className={cn(
                'tabular-nums text-[10px] transition-colors',
                isActive ? 'opacity-70' : 'opacity-50 group-hover:opacity-80',
              )}
            >
              {tab.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── Providers List ───────────────────────────────────────────────────────

function ProvidersList({
  items,
  editing,
  linking,
  editError,
  saving,
  allProfiles,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  onOpenLinking,
  onToggleLinkSelection,
  onConfirmLink,
  onCancelLinking,
}: {
  items: Provider[]
  editing: EditingState | null
  linking: LinkingState | null
  editError: string | null
  saving: boolean
  allProfiles: Profile[]
  onStartEdit: (id: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onDelete: (id: string) => void
  onOpenLinking: (id: string) => void
  onToggleLinkSelection: (profileName: string) => void
  onConfirmLink: () => void
  onCancelLinking: () => void
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="◈"
        title="No providers yet"
        description="Add a provider to configure API endpoints and credentials."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          linkedProfiles={allProfiles.filter((p) => p.providerRef === provider.id)}
          linkableProfiles={allProfiles}
          allProviders={items}
          isEditing={editing?.type === 'provider' && editing.id === provider.id}
          isLinking={linking?.providerId === provider.id}
          linking={linking}
          editing={editing}
          editError={editError}
          saving={saving}
          onStartEdit={() => onStartEdit(provider.id)}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onEditContentChange={onEditContentChange}
          onDelete={() => onDelete(provider.id)}
          onOpenLinking={() => onOpenLinking(provider.id)}
          onToggleLinkSelection={onToggleLinkSelection}
          onConfirmLink={onConfirmLink}
          onCancelLinking={onCancelLinking}
        />
      ))}
    </div>
  )
}

// ── Provider Card ────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  linkedProfiles,
  linkableProfiles,
  allProviders,
  isEditing,
  isLinking,
  editing,
  linking,
  editError,
  saving,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  onOpenLinking,
  onToggleLinkSelection,
  onConfirmLink,
  onCancelLinking,
}: {
  provider: Provider
  linkedProfiles: Profile[]
  linkableProfiles: Profile[]
  allProviders: Provider[]
  isEditing: boolean
  isLinking: boolean
  editing: EditingState | null
  linking: LinkingState | null
  editError: string | null
  saving: boolean
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onDelete: () => void
  onOpenLinking: () => void
  onToggleLinkSelection: (profileName: string) => void
  onConfirmLink: () => void
  onCancelLinking: () => void
}) {
  const baseUrl = extractBaseUrl(provider.settings?.env)
  const model = extractModel(provider.settings?.env)
  const iconName = iconForProvider(provider)
  const iconColor = iconName ? getIconMetadata(iconName)?.defaultColor : undefined

  // Profiles on this agent_type that AREN'T linked to this provider yet
  // — the "Add to profile" picker candidates. Includes profiles that
  // currently reference a different provider (those will get visually
  // flagged as a "switch" candidate — see Picker candidate rendering).
  const unlinkedCandidates = linkableProfiles.filter(
    (p) => p.providerRef !== provider.id,
  )

  // id → display label for cross-provider resolution (e.g. when showing
  // "currently uses: MiniMax" on a switch candidate).
  const providerLabelById = new Map(
    allProviders.map((p) => [p.id, p.name]),
  )


  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl bg-card',
        'transition-all duration-normal',
        'hover:shadow-md',
      )}
      style={
        iconColor
          ? {
              background: `linear-gradient(90deg, ${iconColor}1A 0%, ${iconColor}08 40%, transparent 70%)`,
            }
          : undefined
      }
    >
      {/* Glass shine on left edge */}
      {iconColor && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1"
          style={{
            background: `linear-gradient(90deg, ${iconColor}25, transparent)`,
            boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.06)`,
          }}
        />
      )}

      <div className="flex items-center gap-4 px-5 py-4">
        {/* Brand icon — 40×40, color preserved */}
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl overflow-hidden',
            'transition-transform duration-normal group-hover:scale-105',
          )}
          style={{
            backgroundColor: iconColor ? `${iconColor}14` : 'hsl(var(--card))',
            color: iconColor ?? undefined,
          }}
        >
          <ProviderIcon
            icon={iconName}
            name={provider.name}
            size={24}
            showFallback
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {provider.name}
            </h3>
            {provider.category && (
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {provider.category}
              </span>
            )}
            {provider.isCurrent && (
              <span
                title="Marked as current in catalog"
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                current
              </span>
            )}
            {provider.inFailoverQueue && (
              <span className="inline-flex items-center rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-600 dark:text-sky-400">
                failover
              </span>
            )}
          </div>
          {baseUrl && (
            <p className="mt-1 font-mono text-xs text-muted-foreground truncate">
              {baseUrl}
            </p>
          )}
          {model && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              model: <span className="font-mono">{model}</span>
            </p>
          )}
        </div>

        {/* Actions — hover reveal */}
        <div className="flex items-center gap-1 opacity-0 pointer-events-none transition-opacity duration-fast group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
          <IconAction
            label="Edit provider"
            onClick={onStartEdit}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </IconAction>
          <IconAction label="Delete provider" onClick={onDelete} variant="danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            </svg>
          </IconAction>
        </div>
      </div>

      {/* Linked profiles row */}
      <div className="px-5 pb-4 -mt-1 flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">
          Used by
        </span>
        {linkedProfiles.length === 0 ? (
          <span className="text-xs text-muted-foreground/60 italic">
            no profile
          </span>
        ) : (
          linkedProfiles.map((p) => (
            <span
              key={p.name}
              className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-xs text-foreground"
              title={`Profile: ${p.displayName || p.name}`}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {p.displayName || p.name}
            </span>
          ))
        )}
        {unlinkedCandidates.length > 0 && (
          <button
            type="button"
            onClick={onOpenLinking}
            disabled={isLinking}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs',
              'transition-colors duration-fast',
              'text-muted-foreground hover:text-foreground hover:bg-muted',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1',
              'disabled:opacity-50 cursor-pointer',
            )}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Link profile
          </button>
        )}
      </div>

      {/* Inline edit panel */}
      {isEditing && editing && (
        <div className="border-t border-border/30 bg-muted/20 px-5 py-4">
          <Textarea
            rows={8}
            value={editing.content}
            onChange={(e) => onEditContentChange(e.target.value)}
            error={editError ?? undefined}
            className="font-mono text-xs"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={onSaveEdit}>
              Save changes
            </Button>
          </div>
        </div>
      )}

      {/* Link profile picker */}
      {isLinking && linking && (
        <div className="border-t border-border/30 bg-muted/20 px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Link to profiles
            </span>
            <span className="text-xs font-medium tabular-nums text-foreground">
              {linking.selectedProfiles.size} selected
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {unlinkedCandidates.length === 0 && (
              <span className="text-xs text-muted-foreground/60 italic">
                no profile to link
              </span>
            )}
            {unlinkedCandidates
              // Sort switch candidates (already linked to another provider)
              // to the END so unlinked profiles stay prominent.
              .slice()
              .sort((a, b) => {
                const aSwitch = a.providerRef ? 1 : 0
                const bSwitch = b.providerRef ? 1 : 0
                return aSwitch - bSwitch
              })
              .map((p) => {
                const selected = linking.selectedProfiles.has(p.name)
                const isSwitch = !!p.providerRef
                const currentProviderLabel = isSwitch
                  ? providerLabelById.get(p.providerRef!) ?? p.providerRef
                  : null
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => onToggleLinkSelection(p.name)}
                    title={
                      isSwitch
                        ? `Currently uses ${currentProviderLabel} — selecting will switch to ${provider.name}`
                        : undefined
                    }
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs',
                      'transition-all duration-fast cursor-pointer shadow-sm',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1',
                      selected
                        ? 'bg-foreground text-background shadow-md'
                        : isSwitch
                          ? 'bg-muted/40 text-muted-foreground ring-1 ring-border hover:bg-muted hover:text-foreground'
                          : 'bg-card text-foreground ring-1 ring-border hover:bg-muted',
                    )}
                  >
                    {selected ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    ) : isSwitch ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3 opacity-70">
                        <path d="M17 1l4 4-4 4" />
                        <path d="M3 11V9a4 4 0 014-4h14" />
                        <path d="M7 23l-4-4 4-4" />
                        <path d="M21 13v2a4 4 0 01-4 4H3" />
                      </svg>
                    ) : null}
                    <span>{p.displayName || p.name}</span>
                    {isSwitch && (
                      <span className="text-[10px] opacity-80">
                        ↻ {currentProviderLabel}
                      </span>
                    )}
                  </button>
                )
              })}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancelLinking}>
              Cancel
            </Button>
            <Button
              size="sm"
              isLoading={saving}
              onClick={onConfirmLink}
              disabled={linking.selectedProfiles.size === 0}
            >
              Link {linking.selectedProfiles.size > 0 && `(${linking.selectedProfiles.size})`}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Icon Action Button ───────────────────────────────────────────────────

function IconAction({
  label,
  onClick,
  variant = 'default',
  children,
}: {
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md transition-colors duration-fast',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1',
        variant === 'default' &&
          'text-muted-foreground hover:bg-muted hover:text-foreground',
        variant === 'danger' &&
          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
      )}
    >
      <span className="h-4 w-4">{children}</span>
    </button>
  )
}

// ── Claude.md List ───────────────────────────────────────────────────────

function ClaudeMdsList({
  items,
  editing,
  mdLinking,
  editError,
  saving,
  profiles,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  onStartApply,
  onApply,
  onCancelApply,
  onApplyProfileChange,
}: {
  items: ClaudeMd[]
  editing: EditingState | null
  mdLinking: MdLinkingState | null
  editError: string | null
  saving: boolean
  profiles: Profile[]
  onStartEdit: (id: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onDelete: (id: string) => void
  onStartApply: (id: string) => void
  onApply: () => void
  onCancelApply: () => void
  onApplyProfileChange: (name: string) => void
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="▤"
        title="No Claude.md templates"
        description="Add a Claude.md template to define agent instructions."
      />
    )
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.map((md) => (
        <ClaudeMdCard
          key={md.id}
          md={md}
          isEditing={editing?.type === 'claudeMd' && editing.id === md.id}
          isApplying={mdLinking?.mdId === md.id}
          editing={editing}
          mdLinking={mdLinking}
          editError={editError}
          saving={saving}
          profiles={profiles}
          onStartEdit={() => onStartEdit(md.id)}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onEditContentChange={onEditContentChange}
          onDelete={() => onDelete(md.id)}
          onStartApply={() => onStartApply(md.id)}
          onApply={onApply}
          onCancelApply={onCancelApply}
          onApplyProfileChange={onApplyProfileChange}
        />
      ))}
    </div>
  )
}

// ── Claude.md Card ───────────────────────────────────────────────────────

function ClaudeMdCard({
  md,
  isEditing,
  isApplying,
  editing,
  mdLinking,
  editError,
  saving,
  profiles,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  onStartApply,
  onApply,
  onCancelApply,
  onApplyProfileChange,
}: {
  md: ClaudeMd
  isEditing: boolean
  isApplying: boolean
  editing: EditingState | null
  mdLinking: MdLinkingState | null
  editError: string | null
  saving: boolean
  profiles: Profile[]
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onDelete: () => void
  onStartApply: () => void
  onApply: () => void
  onCancelApply: () => void
  onApplyProfileChange: (name: string) => void
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl bg-card ',
        'transition-all duration-normal',
        'hover:-translate-y-1 hover:border-foreground/25 hover:shadow-md hover:bg-card-hover/20',
        'motion-safe:hover:scale-[1.005]',
        (isEditing || isApplying) && 'ring-1 ring-black/10 shadow-md',
      )}
    >
      <div className="flex items-center gap-4 px-5 py-4">
        {/* Icon — markdown file glyph */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted ring-1 ring-black/[0.05]">
          <span className="font-mono text-sm font-bold text-muted-foreground">
            M↓
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {md.name}
            </h3>
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              markdown
            </span>
          </div>
          {md.description && (
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {md.description}
            </p>
          )}
        </div>

        {/* Actions — hover reveal */}
        <div className="flex items-center gap-1 opacity-0 pointer-events-none transition-opacity duration-fast group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
          <IconAction label="Edit Claude.md" onClick={onStartEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </IconAction>
          <IconAction label="Apply Claude.md to profile" onClick={onStartApply}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12l5 5L20 7" />
            </svg>
          </IconAction>
          <IconAction label="Delete Claude.md" onClick={onDelete} variant="danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            </svg>
          </IconAction>
        </div>
      </div>

      {isEditing && editing && (
        <div className="bg-muted/20 bg-muted/20 px-5 py-4">
          <Textarea
            rows={8}
            value={editing.content}
            onChange={(e) => onEditContentChange(e.target.value)}
            error={editError ?? undefined}
            className="font-mono text-xs"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={onSaveEdit}>
              Save changes
            </Button>
          </div>
        </div>
      )}

      {isApplying && mdLinking && (
        <div className="bg-muted/20 bg-muted/20 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground shrink-0">
              Apply to
            </span>
            <select
              value={mdLinking.profileName}
              onChange={(e) => onApplyProfileChange(e.target.value)}
              className="h-9 flex-1 rounded-md bg-card shadow-sm bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1"
            >
              {profiles.length === 0 && <option value="">No profiles</option>}
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName || p.name}
                </option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={onCancelApply}>
              Cancel
            </Button>
            <Button
              size="sm"
              isLoading={saving}
              onClick={onApply}
              disabled={!mdLinking.profileName}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
// ── Provider-switch Confirmation Dialog ────────────────────────────────

function SwitchConfirmDialog({
  providerLabel,
  switches,
  isLoading,
  onConfirm,
  onCancel,
}: {
  providerLabel: string
  switches: { profileName: string; currentProviderLabel: string }[]
  isLoading: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-card p-6 shadow-xl ring-1 ring-border"
      >
        <h3 className="text-base font-semibold text-foreground">
          Switch {switches.length === 1 ? 'profile' : `${switches.length} profiles`} to {providerLabel}?
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          These profiles are already linked to another provider. Linking will
          replace their current provider:
        </p>
        <ul className="mt-3 flex flex-col gap-1.5">
          {switches.map((s) => (
            <li
              key={s.profileName}
              className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm"
            >
              <span className="font-medium text-foreground">{s.profileName}</span>
              <span className="text-xs text-muted-foreground">
                <span className="text-foreground/70">{s.currentProviderLabel}</span>
                <span className="mx-1.5">→</span>
                <span className="font-medium text-foreground">{providerLabel}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isLoading}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} isLoading={isLoading}>
            Switch &amp; link
          </Button>
        </div>
      </div>
    </div>
  )
}
