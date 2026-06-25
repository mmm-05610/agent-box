/**
 * Library Page — Provider & Claude.md management
 *
 * Displays providers and Claude.md templates for the selected agent type.
 * Supports CRUD, inline editing, applying to profiles, and search filtering.
 */

import { useCallback, useMemo, useState } from 'react'
import { Button, Badge, Input, Textarea } from '@/components/ui'
import { EmptyState, Loading, useToast } from '@/components/feedback'
import { useProviders, useProfiles } from '@/hooks'
import { cn } from '@/lib/utils'
import type { AgentType, Provider, ClaudeMd, Profile } from '@/api'
import {
  AGENT_TYPES,
  saveProvider,
  deleteProvider,
  applyProviderToProfile,
  saveClaudeMd,
  deleteClaudeMd,
  applyClaudeMdToProfile,
  fetchProfiles,
  fetchProviderDetail,
} from '@/api'

// ── Category helpers ─────────────────────────────────────────────────────

const CATEGORY_BADGE_VARIANT: Record<string, 'warning' | 'success' | 'info' | 'primary' | 'destructive' | 'neutral'> = {
  anthropic: 'warning',
  openai: 'success',
  deepseek: 'info',
  openrouter: 'primary',
  google: 'destructive',
}

function getCategoryBadgeVariant(category?: string) {
  return CATEGORY_BADGE_VARIANT[category ?? ''] ?? 'neutral'
}

const CATEGORY_ICON_COLORS: Record<string, string> = {
  anthropic: 'bg-warning-subtle text-warning',
  openai: 'bg-success-subtle text-success',
  deepseek: 'bg-info-subtle text-info',
  openrouter: 'bg-primary/10 text-primary',
  google: 'bg-destructive-subtle text-destructive',
}

function getCategoryIconColor(category?: string) {
  return CATEGORY_ICON_COLORS[category ?? ''] ?? 'bg-muted text-muted-foreground'
}

function getInitial(name: string): string {
  return (name[0] ?? '?').toUpperCase()
}

function extractBaseUrl(env?: Record<string, string>): string | undefined {
  const url = env?.ANTHROPIC_BASE_URL
  if (!url) return undefined
  return url.replace(/^https?:\/\//, '')
}

function extractModel(env?: Record<string, string>): string | undefined {
  return env?.ANTHROPIC_MODEL
}

// ── Types ────────────────────────────────────────────────────────────────

type TabKey = 'providers' | 'claudeMds'

interface EditingState {
  type: 'provider' | 'claudeMd'
  id: string
  content: string
}

interface ApplyingState {
  type: 'provider' | 'claudeMd'
  id: string
  profileName: string
}

// ── Component ────────────────────────────────────────────────────────────

export function LibraryPage() {
  const [agentType, setAgentType] = useState<AgentType>('claude')
  const [activeTab, setActiveTab] = useState<TabKey>('providers')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<EditingState | null>(null)
  const [applying, setApplying] = useState<ApplyingState | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [addId, setAddId] = useState('')
  const [addContent, setAddContent] = useState('')
  const [addError, setAddError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])

  const { providers, claudeMds, loading, error, refresh } = useProviders(agentType)
  const { refresh: refreshProfiles } = useProfiles()
  const { toast } = useToast()

  // ── Search filtering ─────────────────────────────────────────────────

  const query = search.toLowerCase().trim()

  const filteredProviders = useMemo(() => {
    if (!query) return providers
    return providers.filter((p) => {
      const haystack = [
        p.name,
        p.id,
        p.settings.env.ANTHROPIC_BASE_URL ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [providers, query])

  const filteredClaudeMds = useMemo(() => {
    if (!query) return claudeMds
    return claudeMds.filter((m) => {
      const haystack = [m.name, m.id, m.description ?? '']
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [claudeMds, query])

  // ── Edit handlers ────────────────────────────────────────────────────

  const handleStartEdit = useCallback(
    async (type: TabKey, id: string) => {
      setEditError(null)
      if (type === 'providers') {
        // Fetch full detail to get settings
        try {
          const detail = await fetchProviderDetail(agentType, id)
          if (detail?.settings) {
            setEditing({
              type: 'provider',
              id,
              content: JSON.stringify(detail.settings, null, 2),
            })
          } else {
            setEditing({
              type: 'provider',
              id,
              content: '{}',
            })
          }
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
        // Validate JSON
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

  const handleCancelEdit = useCallback(() => {
    setEditing(null)
    setEditError(null)
  }, [])

  // ── Delete handlers ──────────────────────────────────────────────────

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
        toast({
          type: 'error',
          message: e instanceof Error ? e.message : 'Delete failed',
        })
      }
    },
    [agentType, refresh, toast],
  )

  // ── Apply handlers ───────────────────────────────────────────────────

  const handleStartApply = useCallback(
    async (type: TabKey, id: string) => {
      try {
        const allProfiles = await fetchProfiles()
        setProfiles(allProfiles)
        setApplying({ type, id, profileName: allProfiles[0]?.name ?? '' })
      } catch (e) {
        toast({
          type: 'error',
          message: e instanceof Error ? e.message : 'Failed to load profiles',
        })
      }
    },
    [toast],
  )

  const handleApply = useCallback(async () => {
    if (!applying || !applying.profileName) return
    setSaving(true)
    try {
      if (applying.type === 'providers') {
        await applyProviderToProfile(applying.profileName, applying.id)
        toast({ type: 'success', message: `Provider applied to ${applying.profileName}` })
      } else {
        await applyClaudeMdToProfile(applying.profileName, applying.id)
        toast({ type: 'success', message: `Claude.md applied to ${applying.profileName}` })
      }
      setApplying(null)
      refreshProfiles()
    } catch (e) {
      toast({
        type: 'error',
        message: e instanceof Error ? e.message : 'Apply failed',
      })
    } finally {
      setSaving(false)
    }
  }, [applying, refreshProfiles, toast])

  const handleCancelApply = useCallback(() => {
    setApplying(null)
  }, [])

  // ── Add handlers ─────────────────────────────────────────────────────

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

  const handleCancelAdd = useCallback(() => {
    setShowAddPanel(false)
    setAddId('')
    setAddContent('')
    setAddError(null)
  }, [])

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-xl font-bold text-foreground">Library</h1>
        <select
          value={agentType}
          onChange={(e) => setAgentType(e.target.value as AgentType)}
          className="bg-card border border-input rounded-md px-3 h-9 text-sm text-foreground"
        >
          {AGENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="px-6">
        <div className="flex gap-6 border-b border-card-border">
          <TabButton
            active={activeTab === 'providers'}
            onClick={() => setActiveTab('providers')}
            count={filteredProviders.length}
          >
            Providers
          </TabButton>
          <TabButton
            active={activeTab === 'claudeMds'}
            onClick={() => setActiveTab('claudeMds')}
            count={filteredClaudeMds.length}
          >
            Claude.md
          </TabButton>
        </div>
      </div>

      {/* Search */}
      <div className="px-6 py-3">
        <Input
          size="sm"
          placeholder="Search by name, id, or url..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-6 pb-6">
        {loading ? (
          <Loading variant="skeleton" rows={4} />
        ) : error ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : activeTab === 'providers' ? (
          <ProvidersList
            items={filteredProviders}
            editing={editing}
            applying={applying}
            editError={editError}
            saving={saving}
            profiles={profiles}
            onStartEdit={(id) => handleStartEdit('providers', id)}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onEditContentChange={(c) =>
              setEditing((prev) => (prev ? { ...prev, content: c } : null))
            }
            onDelete={(id) => handleDelete('providers', id)}
            onStartApply={(id) => handleStartApply('providers', id)}
            onApply={handleApply}
            onCancelApply={handleCancelApply}
            onApplyProfileChange={(name) =>
              setApplying((prev) => (prev ? { ...prev, profileName: name } : null))
            }
            onAdd={() => {
              setActiveTab('providers')
              setShowAddPanel(true)
            }}
          />
        ) : (
          <ClaudeMdsList
            items={filteredClaudeMds}
            editing={editing}
            applying={applying}
            editError={editError}
            saving={saving}
            profiles={profiles}
            onStartEdit={(id) => handleStartEdit('claudeMds', id)}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onEditContentChange={(c) =>
              setEditing((prev) => (prev ? { ...prev, content: c } : null))
            }
            onDelete={(id) => handleDelete('claudeMds', id)}
            onStartApply={(id) => handleStartApply('claudeMds', id)}
            onApply={handleApply}
            onCancelApply={handleCancelApply}
            onApplyProfileChange={(name) =>
              setApplying((prev) => (prev ? { ...prev, profileName: name } : null))
            }
            onAdd={() => {
              setActiveTab('claudeMds')
              setShowAddPanel(true)
            }}
          />
        )}

        {/* Add Panel */}
        {showAddPanel && (
          <div className="mt-4 rounded-lg border border-card-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {activeTab === 'providers' ? 'Add Provider' : 'Add Claude.md'}
            </h3>
            <div className="flex flex-col gap-3">
              <Input
                size="sm"
                placeholder="ID (e.g., my-provider)"
                value={addId}
                onChange={(e) => setAddId(e.target.value)}
              />
              <Textarea
                placeholder={
                  activeTab === 'providers'
                    ? '{\n  "name": "My Provider",\n  "env": {\n    "ANTHROPIC_API_KEY": "sk-..."\n  }\n}'
                    : '# Claude.md content\n\nInstructions here...'
                }
                rows={6}
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
                error={addError ?? undefined}
              />
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={handleCancelAdd}>
                  Cancel
                </Button>
                <Button size="sm" isLoading={creating} onClick={handleCreate}>
                  Create
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Tab Button ───────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  count,
  children,
}: {
  active: boolean
  onClick: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'relative pb-3 text-sm font-medium transition-colors',
        active
          ? 'text-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children} ({count})
      {active && (
        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground rounded-full" />
      )}
    </button>
  )
}

// ── Providers List ───────────────────────────────────────────────────────

interface ProvidersListProps {
  items: Provider[]
  editing: EditingState | null
  applying: ApplyingState | null
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
  onAdd: () => void
}

function ProvidersList({
  items,
  editing,
  applying,
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
  onAdd,
}: ProvidersListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🔌"
        title="No providers yet"
        description="Add a provider to configure API endpoints and credentials."
        action={
          <Button size="sm" onClick={onAdd}>
            Add provider
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((provider) => (
        <ProviderCard
          key={provider.id}
          provider={provider}
          isEditing={editing?.type === 'provider' && editing.id === provider.id}
          isApplying={applying?.type === 'provider' && applying.id === provider.id}
          editing={editing}
          applying={applying}
          editError={editError}
          saving={saving}
          profiles={profiles}
          onStartEdit={() => onStartEdit(provider.id)}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onEditContentChange={onEditContentChange}
          onDelete={() => onDelete(provider.id)}
          onStartApply={() => onStartApply(provider.id)}
          onApply={onApply}
          onCancelApply={onCancelApply}
          onApplyProfileChange={onApplyProfileChange}
        />
      ))}
    </div>
  )
}

// ── Provider Card ────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  isEditing,
  isApplying,
  editing,
  applying,
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
  provider: Provider
  isEditing: boolean
  isApplying: boolean
  editing: EditingState | null
  applying: ApplyingState | null
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
  const baseUrl = extractBaseUrl(provider.settings?.env)
  const model = extractModel(provider.settings?.env)
  const category = provider.category

  return (
    <div
      className={cn(
        'rounded-lg border border-card-border bg-card transition-all duration-fast',
        (isEditing || isApplying) && 'ring-1 ring-ring',
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-bold',
            getCategoryIconColor(category),
          )}
        >
          {getInitial(provider.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">
              {provider.name}
            </span>
            {category && (
              <Badge variant={getCategoryBadgeVariant(category)}>
                {category}
              </Badge>
            )}
          </div>
          {baseUrl && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {baseUrl}
            </p>
          )}
          {model && (
            <p className="text-xs text-muted-foreground mt-0.5">
              model: {model}
            </p>
          )}
        </div>

        {/* Actions */}
        {!isEditing && !isApplying && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={onStartEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onStartApply}>
              Apply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Inline edit mode */}
      {isEditing && editing && (
        <div className="px-4 pb-4 border-t border-card-border pt-3">
          <Textarea
            rows={8}
            value={editing.content}
            onChange={(e) => onEditContentChange(e.target.value)}
            error={editError ?? undefined}
          />
          <div className="flex items-center gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={onSaveEdit}>
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Apply mode */}
      {isApplying && applying && (
        <div className="px-4 pb-4 border-t border-card-border pt-3">
          <div className="flex items-center gap-3">
            <select
              value={applying.profileName}
              onChange={(e) => onApplyProfileChange(e.target.value)}
              className="bg-card border border-input rounded-md px-3 h-9 text-sm text-foreground flex-1"
            >
              {profiles.length === 0 && (
                <option value="">No profiles available</option>
              )}
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName ?? p.name}
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
              disabled={!applying.profileName}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Claude.md List ───────────────────────────────────────────────────────

interface ClaudeMdsListProps {
  items: ClaudeMd[]
  editing: EditingState | null
  applying: ApplyingState | null
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
  onAdd: () => void
}

function ClaudeMdsList({
  items,
  editing,
  applying,
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
  onAdd,
}: ClaudeMdsListProps) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="📄"
        title="No Claude.md templates yet"
        description="Add a Claude.md template to define agent instructions."
        action={
          <Button size="sm" onClick={onAdd}>
            Add Claude.md
          </Button>
        }
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((md) => (
        <ClaudeMdCard
          key={md.id}
          md={md}
          isEditing={editing?.type === 'claudeMd' && editing.id === md.id}
          isApplying={applying?.type === 'claudeMd' && applying.id === md.id}
          editing={editing}
          applying={applying}
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
  applying,
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
  applying: ApplyingState | null
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
        'rounded-lg border border-card-border bg-card transition-all duration-fast',
        (isEditing || isApplying) && 'ring-1 ring-ring',
      )}
    >
      {/* Card header */}
      <div className="flex items-center gap-3 p-4">
        {/* Icon */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-bold text-muted-foreground">
          {getInitial(md.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground truncate">
              {md.name}
            </span>
            <Badge variant="neutral">markdown</Badge>
          </div>
          {md.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {md.description}
            </p>
          )}
        </div>

        {/* Actions */}
        {!isEditing && !isApplying && (
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="sm" onClick={onStartEdit}>
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onStartApply}>
              Apply
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        )}
      </div>

      {/* Inline edit mode */}
      {isEditing && editing && (
        <div className="px-4 pb-4 border-t border-card-border pt-3">
          <Textarea
            rows={8}
            value={editing.content}
            onChange={(e) => onEditContentChange(e.target.value)}
            error={editError ?? undefined}
          />
          <div className="flex items-center gap-2 mt-3">
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>
              Cancel
            </Button>
            <Button size="sm" isLoading={saving} onClick={onSaveEdit}>
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Apply mode */}
      {isApplying && applying && (
        <div className="px-4 pb-4 border-t border-card-border pt-3">
          <div className="flex items-center gap-3">
            <select
              value={applying.profileName}
              onChange={(e) => onApplyProfileChange(e.target.value)}
              className="bg-card border border-input rounded-md px-3 h-9 text-sm text-foreground flex-1"
            >
              {profiles.length === 0 && (
                <option value="">No profiles available</option>
              )}
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.displayName ?? p.name}
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
              disabled={!applying.profileName}
            >
              Apply
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
