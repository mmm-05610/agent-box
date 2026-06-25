/**
 * Library Page — Provider & Claude.md management
 *
 * Redesigned to match cc-switch's visual patterns:
 * - Rounded-xl cards with hover-reveal actions
 * - Segmented agent type switcher
 * - Color-coded category badges
 * - Inline edit/apply panels
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

// ── Category styling (cc-switch badge pattern) ──────────────────────────

const CATEGORY_COLORS: Record<string, { bg: string; text: string; badge: string }> = {
  anthropic: {
    bg: 'bg-amber-100 dark:bg-amber-900/40',
    text: 'text-amber-700 dark:text-amber-300',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
  openai: {
    bg: 'bg-emerald-100 dark:bg-emerald-900/40',
    text: 'text-emerald-700 dark:text-emerald-300',
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  },
  deepseek: {
    bg: 'bg-sky-100 dark:bg-sky-900/40',
    text: 'text-sky-700 dark:text-sky-300',
    badge: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  },
  openrouter: {
    bg: 'bg-violet-100 dark:bg-violet-900/40',
    text: 'text-violet-700 dark:text-violet-300',
    badge: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  },
  google: {
    bg: 'bg-blue-100 dark:bg-blue-900/40',
    text: 'text-blue-700 dark:text-blue-300',
    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
}

function getCategoryStyle(category?: string) {
  return CATEGORY_COLORS[category ?? ''] ?? {
    bg: 'bg-muted',
    text: 'text-muted-foreground',
    badge: 'bg-muted text-muted-foreground',
  }
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
        p.settings?.env?.ANTHROPIC_BASE_URL ?? '',
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
      setApplying(null)
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
        try { JSON.parse(editing.content) } catch {
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
        toast({ type: 'error', message: e instanceof Error ? e.message : 'Delete failed' })
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
        setEditing(null)
        setShowAddPanel(false)
        setApplying({ type, id, profileName: allProfiles[0]?.name ?? '' })
      } catch (e) {
        toast({ type: 'error', message: e instanceof Error ? e.message : 'Failed to load profiles' })
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
        toast({ type: 'success', message: `Applied to ${applying.profileName}` })
      } else {
        await applyClaudeMdToProfile(applying.profileName, applying.id)
        toast({ type: 'success', message: `Applied to ${applying.profileName}` })
      }
      setApplying(null)
      refreshProfiles()
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Apply failed' })
    } finally {
      setSaving(false)
    }
  }, [applying, refreshProfiles, toast])

  // ── Add handlers ─────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    if (!addId.trim()) { setAddError('ID is required'); return }
    setCreating(true)
    setAddError(null)
    try {
      if (activeTab === 'providers') {
        try { JSON.parse(addContent) } catch {
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

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 pt-6 pb-4">
        <h1 className="text-xl font-semibold text-foreground">Library</h1>
        <div className="flex items-center gap-3">
          {/* Agent type segmented control */}
          <AgentTypeSwitcher value={agentType} onChange={setAgentType} />
          {/* Add button — orange FAB style like cc-switch */}
          <button
            onClick={() => {
              setEditing(null)
              setApplying(null)
              setShowAddPanel(true)
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg shadow-orange-500/30 transition-colors hover:bg-orange-600 dark:shadow-orange-500/40"
            title={activeTab === 'providers' ? 'Add provider' : 'Add Claude.md'}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="px-6 pb-4 flex items-center gap-4">
        <div className="flex gap-1 bg-muted rounded-xl p-1">
          <TabButton active={activeTab === 'providers'} onClick={() => setActiveTab('providers')} count={filteredProviders.length}>
            Providers
          </TabButton>
          <TabButton active={activeTab === 'claudeMds'} onClick={() => setActiveTab('claudeMds')} count={filteredClaudeMds.length}>
            Claude.md
          </TabButton>
        </div>
        <div className="flex-1 max-w-xs">
          <Input
            size="sm"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
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
            onCancelEdit={() => setEditing(null)}
            onEditContentChange={(c) => setEditing((prev) => prev ? { ...prev, content: c } : null)}
            onDelete={(id) => handleDelete('providers', id)}
            onStartApply={(id) => handleStartApply('providers', id)}
            onApply={handleApply}
            onCancelApply={() => setApplying(null)}
            onApplyProfileChange={(name) => setApplying((prev) => prev ? { ...prev, profileName: name } : null)}
            onAdd={() => setShowAddPanel(true)}
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
            onCancelEdit={() => setEditing(null)}
            onEditContentChange={(c) => setEditing((prev) => prev ? { ...prev, content: c } : null)}
            onDelete={(id) => handleDelete('claudeMds', id)}
            onStartApply={(id) => handleStartApply('claudeMds', id)}
            onApply={handleApply}
            onCancelApply={() => setApplying(null)}
            onApplyProfileChange={(name) => setApplying((prev) => prev ? { ...prev, profileName: name } : null)}
            onAdd={() => setShowAddPanel(true)}
          />
        )}

        {/* Add Panel — inline, cc-switch style */}
        {showAddPanel && (
          <div className="mt-4 rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold text-foreground">
              {activeTab === 'providers' ? 'New Provider' : 'New Claude.md'}
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
                    ? '{\n  "env": {\n    "ANTHROPIC_API_KEY": "sk-..."\n  }\n}'
                    : '# Claude.md content...'
                }
                rows={6}
                value={addContent}
                onChange={(e) => setAddContent(e.target.value)}
                error={addError ?? undefined}
              />
              <div className="flex items-center gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => { setShowAddPanel(false); setAddId(''); setAddContent(''); setAddError(null) }}>
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

// ── Agent Type Segmented Control ─────────────────────────────────────────

function AgentTypeSwitcher({ value, onChange }: { value: AgentType; onChange: (t: AgentType) => void }) {
  return (
    <div className="inline-flex bg-muted rounded-xl p-1 gap-1">
      {AGENT_TYPES.map((t) => {
        const isActive = value === t
        return (
          <button
            key={t}
            onClick={() => onChange(t)}
            className={cn(
              'inline-flex items-center px-3 h-8 rounded-md text-sm font-medium transition-all duration-200',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
            )}
          >
            {t}
          </button>
        )
      })}
    </div>
  )
}

// ── Tab Button (cc-switch segmented style) ───────────────────────────────

function TabButton({ active, onClick, count, children }: {
  active: boolean
  onClick: () => void
  count: number
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center px-3 h-8 rounded-md text-sm font-medium transition-all duration-200',
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground hover:bg-background/50',
      )}
    >
      {children} ({count})
    </button>
  )
}

// ── Providers List ───────────────────────────────────────────────────────

function ProvidersList({ items, editing, applying, editError, saving, profiles, onStartEdit, onSaveEdit, onCancelEdit, onEditContentChange, onDelete, onStartApply, onApply, onCancelApply, onApplyProfileChange, onAdd }: {
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
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="🔌"
        title="No providers yet"
        description="Add a provider to configure API endpoints and credentials."
        action={<Button size="sm" onClick={onAdd}>Add provider</Button>}
      />
    )
  }

  return (
    <div className="space-y-3">
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

// ── Provider Card (cc-switch style) ──────────────────────────────────────

function ProviderCard({ provider, isEditing, isApplying, editing, applying, editError, saving, profiles, onStartEdit, onSaveEdit, onCancelEdit, onEditContentChange, onDelete, onStartApply, onApply, onCancelApply, onApplyProfileChange }: {
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
  const catStyle = getCategoryStyle(category)

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border border-border p-4 transition-all duration-300 bg-card text-card-foreground group',
        (isEditing || isApplying) && 'ring-1 ring-primary/50',
      )}
    >
      {/* Card content */}
      <div className="relative flex items-center gap-3">
        {/* Icon */}
        <div className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-sm font-bold transition-transform duration-300 group-hover:scale-105',
          catStyle.bg, catStyle.text,
        )}>
          {getInitial(provider.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold leading-none text-foreground">
              {provider.name}
            </span>
            {category && (
              <span className={cn('inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold', catStyle.badge)}>
                {category}
              </span>
            )}
          </div>
          {baseUrl && (
            <p className="text-sm text-muted-foreground truncate mt-1">
              {baseUrl}
            </p>
          )}
          {model && (
            <p className="text-xs text-muted-foreground mt-0.5">
              model: {model}
            </p>
          )}
        </div>

        {/* Actions — hidden by default, revealed on hover (cc-switch pattern) */}
        <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200">
          <button
            onClick={onStartEdit}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Edit"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5a2.121 2.121 0 013 3L6 14H3v-3L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={onStartApply}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-emerald-600 dark:hover:text-emerald-400"
            title="Apply to profile"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13 5l-5 5-2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-red-500 dark:hover:text-red-400"
            title="Delete"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Inline edit panel */}
      {isEditing && editing && (
        <div className="mt-4 pt-4 border-t border-border">
          <Textarea
            rows={8}
            value={editing.content}
            onChange={(e) => onEditContentChange(e.target.value)}
            error={editError ?? undefined}
            className="font-mono text-xs"
          />
          <div className="flex items-center gap-2 mt-3 justify-end">
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>Cancel</Button>
            <Button size="sm" isLoading={saving} onClick={onSaveEdit}>Save</Button>
          </div>
        </div>
      )}

      {/* Apply panel */}
      {isApplying && applying && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-3">
            <select
              value={applying.profileName}
              onChange={(e) => onApplyProfileChange(e.target.value)}
              className="bg-card border border-input rounded-lg px-3 h-9 text-sm text-foreground flex-1"
            >
              {profiles.length === 0 && <option value="">No profiles</option>}
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>{p.displayName ?? p.name}</option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={onCancelApply}>Cancel</Button>
            <Button size="sm" isLoading={saving} onClick={onApply} disabled={!applying.profileName}>Apply</Button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Claude.md List ───────────────────────────────────────────────────────

function ClaudeMdsList({ items, editing, applying, editError, saving, profiles, onStartEdit, onSaveEdit, onCancelEdit, onEditContentChange, onDelete, onStartApply, onApply, onCancelApply, onApplyProfileChange, onAdd }: {
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
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="📄"
        title="No Claude.md templates"
        description="Add a Claude.md template to define agent instructions."
        action={<Button size="sm" onClick={onAdd}>Add Claude.md</Button>}
      />
    )
  }

  return (
    <div className="space-y-3">
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

// ── Claude.md Card (cc-switch style) ─────────────────────────────────────

function ClaudeMdCard({ md, isEditing, isApplying, editing, applying, editError, saving, profiles, onStartEdit, onSaveEdit, onCancelEdit, onEditContentChange, onDelete, onStartApply, onApply, onCancelApply, onApplyProfileChange }: {
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
        'relative overflow-hidden rounded-xl border border-border p-4 transition-all duration-300 bg-card text-card-foreground group',
        (isEditing || isApplying) && 'ring-1 ring-primary/50',
      )}
    >
      <div className="relative flex items-center gap-3">
        {/* Icon */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted border border-border text-sm font-bold text-muted-foreground transition-transform duration-300 group-hover:scale-105">
          {getInitial(md.name)}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-base font-semibold leading-none text-foreground">
              {md.name}
            </span>
            <span className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
              markdown
            </span>
          </div>
          {md.description && (
            <p className="text-sm text-muted-foreground truncate mt-1">
              {md.description}
            </p>
          )}
        </div>

        {/* Actions — hover reveal */}
        <div className="flex items-center gap-1.5 flex-shrink-0 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity duration-200">
          <button onClick={onStartEdit} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Edit">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M11.5 2.5a2.121 2.121 0 013 3L6 14H3v-3L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button onClick={onStartApply} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-emerald-600 dark:hover:text-emerald-400" title="Apply to profile">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13 5l-5 5-2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button onClick={onDelete} className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-red-500 dark:hover:text-red-400" title="Delete">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 4h12M5.333 4V2.667a1.333 1.333 0 011.334-1.334h2.666a1.333 1.333 0 011.334 1.334V4m2 0v9.333a1.333 1.333 0 01-1.334 1.334H4.667a1.333 1.333 0 01-1.334-1.334V4h9.334z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* Inline edit panel */}
      {isEditing && editing && (
        <div className="mt-4 pt-4 border-t border-border">
          <Textarea
            rows={8}
            value={editing.content}
            onChange={(e) => onEditContentChange(e.target.value)}
            error={editError ?? undefined}
            className="font-mono text-xs"
          />
          <div className="flex items-center gap-2 mt-3 justify-end">
            <Button variant="ghost" size="sm" onClick={onCancelEdit}>Cancel</Button>
            <Button size="sm" isLoading={saving} onClick={onSaveEdit}>Save</Button>
          </div>
        </div>
      )}

      {/* Apply panel */}
      {isApplying && applying && (
        <div className="mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-3">
            <select
              value={applying.profileName}
              onChange={(e) => onApplyProfileChange(e.target.value)}
              className="bg-card border border-input rounded-lg px-3 h-9 text-sm text-foreground flex-1"
            >
              {profiles.length === 0 && <option value="">No profiles</option>}
              {profiles.map((p) => (
                <option key={p.name} value={p.name}>{p.displayName ?? p.name}</option>
              ))}
            </select>
            <Button variant="ghost" size="sm" onClick={onCancelApply}>Cancel</Button>
            <Button size="sm" isLoading={saving} onClick={onApply} disabled={!applying.profileName}>Apply</Button>
          </div>
        </div>
      )}
    </div>
  )
}
