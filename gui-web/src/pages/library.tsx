/**
 * Library Page — Provider & Claude.md management
 *
 * Layout: agent-type segmented control + tab strip + scrollable list of
 * provider cards. Each card uses the cc-switch icon registry to display
 * the provider's real brand logo (color preserved).
 */

import { useCallback, useMemo, useRef, useState, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Button, Input, Textarea, ConfirmDialog } from '@/components/ui'
import { EmptyState, Loading, useToast } from '@/components/feedback'
import { PageHeader } from '@/components/layout'
import { useProviders, useProfiles, useMcpServers, useSkills } from '@/hooks'
import { cn } from '@/lib/utils'
import { ProviderIcon } from '@/components/ProviderIcon'
import { getIconMetadata, hasIcon } from '@/icons/extracted'
import { testEndpoint } from '@/api/files'
import {
  ProviderFormFields,
  defaultFormValues,
  formValuesToSettings,
  type ProviderFormValues,
} from '@/components/provider/ProviderFormFields'
import { ProviderPresetSelector } from '@/components/provider/ProviderPresetSelector'
import { UsageFooter } from '@/components/UsageFooter'
import type { AgentType, Provider, ClaudeMd, Profile, McpServer, McpServerConfig, Skill, ProviderPreset, UsageScript } from '@/api'
import {
  AGENT_TYPES,
  saveProvider,
  deleteProvider,
  duplicateProvider,
  applyProviderToProfile,
  fetchPresets,
  saveUsageScript,
  saveClaudeMd,
  deleteClaudeMd,
  applyClaudeMdToProfile,
  fetchProviderDetail,
  fetchMcpServerDetail,
  saveMcpServer,
  deleteMcpServer,
  setMcpAgent,
  saveSkill,
  deleteSkill,
  setSkillAgent,
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
function isLightColor(color: string): boolean {
  if (!color || color === 'currentColor' || color === 'transparent') return true
  const c = color.replace('#', '')
  if (c.length !== 6) return false
  const r = parseInt(c.substring(0, 2), 16)
  const g = parseInt(c.substring(2, 4), 16)
  const b = parseInt(c.substring(4, 6), 16)
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255 > 0.8
}

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

type TabKey = 'providers' | 'claudeMds' | 'mcp' | 'skills'

/** Per-agent-type tab visibility. */
const TAB_VISIBILITY: Record<AgentType, TabKey[]> = {
  claude: ['providers', 'claudeMds', 'mcp', 'skills'],
  codex: ['providers', 'mcp', 'skills'],
  hermes: ['providers', 'mcp', 'skills'],
  opencode: ['providers', 'mcp', 'skills'],
}

/** Singular noun shown in the "+ Add X" button. */
const ADD_TAB_LABELS: Record<TabKey, string> = {
  providers: 'provider',
  claudeMds: 'Claude.md',
  mcp: 'MCP server',
  skills: 'skill',
}

/** Placeholder text for the add-panel body. */
const ADD_PLACEHOLDERS: Record<TabKey, string> = {
  providers: '{\n  "env": {\n    "ANTHROPIC_API_KEY": "sk-..."\n  }\n}',
  claudeMds: '# Claude.md content...',
  mcp: '{\n  "type": "stdio",\n  "command": "npx",\n  "args": ["-y", "@modelcontextprotocol/server-filesystem"]\n}',
  skills: 'description = Browse and search the local filesystem\ndirectory = /home/maoqh/projects/my-skill\nrepoOwner = my-org\nrepoName = my-skill',
}

/** Human-friendly label for each tab. */
const TAB_LABELS: Record<TabKey, string> = {
  providers: 'Providers',
  claudeMds: 'Claude.md',
  mcp: 'MCP',
  skills: 'Skills',
}

/** Per-tab count selector. */
const TAB_COUNTS: Record<TabKey, (lists: { providers: Provider[]; claudeMds: ClaudeMd[]; mcp: McpServer[]; skills: Skill[] }) => number> = {
  providers: (l) => l.providers.length,
  claudeMds: (l) => l.claudeMds.length,
  mcp: (l) => l.mcp.length,
  skills: (l) => l.skills.length,
}

/** Serialize a Skill to a key=value text block (for inline editing). */
function skillToForm(skill: Skill): string {
  const lines: string[] = []
  if (skill.name) lines.push(`name = ${skill.name}`)
  if (skill.description) lines.push(`description = ${skill.description}`)
  if (skill.directory) lines.push(`directory = ${skill.directory}`)
  if (skill.repoOwner) lines.push(`repoOwner = ${skill.repoOwner}`)
  if (skill.repoName) lines.push(`repoName = ${skill.repoName}`)
  if (skill.repoBranch) lines.push(`repoBranch = ${skill.repoBranch}`)
  if (skill.readmeUrl) lines.push(`readmeUrl = ${skill.readmeUrl}`)
  return lines.join("\n")
}

interface EditingState {
  type: 'provider' | 'claudeMd' | 'mcp' | 'skill'
  id: string
  /** Raw content of the inline editor (JSON for mcp, key/value form for skill/claudeMd). */
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
  const [editingProviderForm, setEditingProviderForm] = useState<ProviderFormValues | null>(null)
  const [linking, setLinking] = useState<LinkingState | null>(null)
  const [mdLinking, setMdLinking] = useState<MdLinkingState | null>(null)
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [addId, setAddId] = useState('')
  const [addContent, setAddContent] = useState('')
  const [addPresetId, setAddPresetId] = useState<string | null>(null)
  const [addFormValues, setAddFormValues] = useState<ProviderFormValues>(defaultFormValues())
  const [addError, setAddError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [presets, setPresets] = useState<ProviderPreset[]>([])
  const [testingProvider, setTestingProvider] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<
    | {
        type: Extract<TabKey, 'providers' | 'claudeMds'>
        id: string
        name: string
      }
    | null
  >(null)
  const [deleting, setDeleting] = useState(false)

  const { providers, claudeMds, loading, error, refresh } = useProviders(agentType)
  const { mcpServers, loading: mcpLoading, error: mcpError, refresh: refreshMcp } = useMcpServers(agentType)
  const { skills, loading: skillsLoading, error: skillsError, refresh: refreshSkills } = useSkills(agentType)
  const { profiles: allProfiles, refresh: refreshProfiles } = useProfiles()
  const { toast } = useToast()

  // Snap activeTab to a tab that's visible for the current agent type.
  useEffect(() => {
    const visible = TAB_VISIBILITY[agentType]
    if (!visible.includes(activeTab)) {
      // The first tab is always defined (TAB_VISIBILITY is non-empty per agent type).
      const next = visible[0] ?? 'providers'
      setActiveTab(next)
    }
  }, [agentType, activeTab])

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

  const filteredMcp = useMemo(() => {
    if (!query) return mcpServers
    return mcpServers.filter((s) => {
      const cfg = s.serverConfigParsed
      const haystack = [
        s.name,
        s.id,
        s.description ?? '',
        cfg?.type ?? '',
        cfg?.command ?? '',
        cfg?.url ?? '',
        ...(s.tags ?? []),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [mcpServers, query])

  const filteredSkills = useMemo(() => {
    if (!query) return skills
    return skills.filter((s) => {
      const haystack = [
        s.name,
        s.id,
        s.description ?? '',
        s.directory ?? '',
        s.repoOwner ?? '',
        s.repoName ?? '',
        s.readmeUrl ?? '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(query)
    })
  }, [skills, query])

  const handleStartEdit = useCallback(
    async (type: TabKey, id: string) => {
      setEditError(null)
      setLinking(null)
      setShowAddPanel(false)
      if (type === 'providers') {
        try {
          const detail = await fetchProviderDetail(agentType, id)
          const settings = detail?.settings ?? {}
          const env = settings.env ?? {}
          setEditing({ type: 'provider', id, content: JSON.stringify(settings) })
          setEditingProviderForm(defaultFormValues(env, undefined, undefined, settings))
        } catch {
          setEditError('Failed to load provider details')
        }
      } else if (type === 'claudeMds') {
        const md = claudeMds.find((m) => m.id === id)
        if (md) {
          setEditing({ type: 'claudeMd', id, content: md.content ?? '' })
        }
      } else if (type === 'mcp') {
        try {
          const detail = await fetchMcpServerDetail(id)
          const cfg = detail?.serverConfigParsed ?? {
            type: 'stdio',
            command: '',
            args: [],
          }
          setEditing({
            type: 'mcp',
            id,
            content: JSON.stringify(cfg, null, 2),
          })
        } catch {
          setEditError('Failed to load MCP server details')
        }
      } else {
        const skill = skills.find((s) => s.id === id)
        if (skill) {
          setEditing({ type: 'skill', id, content: skillToForm(skill) })
        }
      }
    },
    [agentType, claudeMds, skills],
  )

  const handleSaveEdit = useCallback(async () => {
    if (!editing) return
    setSaving(true)
    setEditError(null)
    try {
      if (editing.type === 'provider') {
        const fv = editingProviderForm ?? defaultFormValues()
        const settings = formValuesToSettings(fv)
        settings.name = fv.name
        settings.notes = fv.notes
        settings.website_url = fv.websiteUrl
        await saveProvider(agentType, editing.id, JSON.stringify(settings))
        toast({ type: 'success', message: 'Provider saved' })
        refresh()
      } else if (editing.type === 'claudeMd') {
        await saveClaudeMd(agentType, editing.id, editing.content)
        toast({ type: 'success', message: 'Claude.md saved' })
        refresh()
      } else if (editing.type === 'mcp') {
        let parsed: unknown
        try {
          parsed = JSON.parse(editing.content)
        } catch {
          setEditError('Invalid JSON format')
          setSaving(false)
          return
        }
        const cfg = (parsed ?? {}) as McpServerConfig
        const detail = await fetchMcpServerDetail(editing.id)
        const payload = {
          name: detail?.name ?? editing.id,
          description: detail?.description ?? '',
          homepage: detail?.homepage ?? '',
          docs: detail?.docs ?? '',
          tags: detail?.tags ?? [],
          server_config: cfg,
        }
        await saveMcpServer(editing.id, JSON.stringify(payload))
        toast({ type: 'success', message: 'MCP server saved' })
        refreshMcp()
      } else {
        // skill — content is a key=value form, one per line
        await saveSkill(editing.id, editing.content)
        toast({ type: 'success', message: 'Skill saved' })
        refreshSkills()
      }
      setEditing(null)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }, [editing, editingProviderForm, agentType, refresh, refreshMcp, refreshSkills, toast])

  const runDelete = useCallback(
    async (type: TabKey, id: string) => {
      try {
        if (type === 'providers') {
          await deleteProvider(agentType, id)
          toast({ type: 'success', message: 'Provider deleted' })
          refresh()
        } else if (type === 'claudeMds') {
          await deleteClaudeMd(agentType, id)
          toast({ type: 'success', message: 'Claude.md deleted' })
          refresh()
        } else if (type === 'mcp') {
          await deleteMcpServer(id)
          toast({ type: 'success', message: 'MCP server deleted' })
          refreshMcp()
        } else {
          await deleteSkill(id)
          toast({ type: 'success', message: 'Skill deleted' })
          refreshSkills()
        }
      } catch (e) {
        toast({ type: 'error', message: e instanceof Error ? e.message : 'Delete failed' })
      }
    },
    [agentType, refresh, refreshMcp, refreshSkills, toast],
  )

  const handleDelete = useCallback(
    (type: TabKey, id: string) => {
      // For destructive targets (providers, claudeMds) gate behind a confirm
      // dialog — a stray click must not nuke config that's wired to a profile.
      if (type === 'providers' || type === 'claudeMds') {
        const name =
          type === 'providers'
            ? providers.find((p) => p.id === id)?.name ?? id
            : claudeMds.find((m) => m.id === id)?.name ?? id
        setPendingDelete({ type, id, name })
        return
      }
      // mcp / skill: keep the original fast path; can be upgraded later.
      void runDelete(type, id)
    },
    [providers, claudeMds, runDelete],
  )

  const confirmDelete = useCallback(async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await runDelete(pendingDelete.type, pendingDelete.id)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }, [pendingDelete, runDelete])

  /** Toggle an MCP server's agent association and refresh the list. */
  const handleToggleMcpAgent = useCallback(
    async (serverId: string, t: AgentType, nextEnabled: boolean) => {
      try {
        await setMcpAgent(serverId, t, nextEnabled)
        refreshMcp()
      } catch (e) {
        toast({
          type: 'error',
          message: e instanceof Error ? e.message : 'Failed to update agent',
        })
      }
    },
    [refreshMcp, toast],
  )

  /** Toggle a skill's agent association and refresh the list. */
  const handleToggleSkillAgent = useCallback(
    async (skillId: string, t: AgentType, nextEnabled: boolean) => {
      try {
        await setSkillAgent(skillId, t, nextEnabled)
        refreshSkills()
      } catch (e) {
        toast({
          type: 'error',
          message: e instanceof Error ? e.message : 'Failed to update agent',
        })
      }
    },
    [refreshSkills, toast],
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

  // Load presets when add panel opens for providers
  useEffect(() => {
    if (showAddPanel && activeTab === 'providers') {
      fetchPresets(agentType).then(setPresets).catch(() => setPresets([]))
    }
  }, [showAddPanel, activeTab, agentType])

  const handlePresetSelect = useCallback(
    (presetId: string, preset: ProviderPreset | null) => {
      setAddPresetId(presetId)
      if (preset) {
        setAddFormValues(defaultFormValues(preset.env, undefined, undefined, {
          name: preset.name,
          websiteUrl: preset.url,
          apiFormat: preset.apiFormat,
        }))
        setAddId(preset.id)
      } else {
        setAddFormValues(defaultFormValues())
        setAddId('')
      }
    },
    [],
  )

  const handleDuplicate = useCallback(
    async (providerId: string) => {
      const newId = `${providerId}-copy-${Date.now().toString(36)}`
      try {
        await duplicateProvider(agentType, providerId, newId)
        toast({ type: 'success', message: `Duplicated as ${newId}` })
        refresh()
      } catch (e) {
        toast({ type: 'error', message: e instanceof Error ? e.message : 'Duplicate failed' })
      }
    },
    [agentType, refresh, toast],
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
        // Build settings from form values + preset
        const settings = formValuesToSettings(addFormValues)
        settings.name = addFormValues.name || addId.trim()
        settings.notes = addFormValues.notes || ''
        settings.website_url = addFormValues.websiteUrl || ''
        if (addPresetId && addPresetId !== 'custom' && presets.length > 0) {
          const preset = presets.find((p) => p.id === addPresetId)
          if (preset) {
            settings.name = settings.name || preset.name
            settings.website_url = settings.website_url || preset.url
            settings.category = preset.cat
          }
        }
        await saveProvider(agentType, addId.trim(), JSON.stringify(settings))
        toast({ type: 'success', message: 'Provider created' })
        refresh()
      } else if (activeTab === 'claudeMds') {
        await saveClaudeMd(agentType, addId.trim(), addContent)
        toast({ type: 'success', message: 'Claude.md created' })
        refresh()
      } else if (activeTab === 'mcp') {
        let parsed: unknown
        try {
          parsed = addContent.trim() ? JSON.parse(addContent) : { type: 'stdio' }
        } catch {
          setAddError('Invalid JSON format')
          setCreating(false)
          return
        }
        const cfg = (parsed ?? {}) as McpServerConfig
        const payload = {
          name: addId.trim(),
          description: '',
          homepage: '',
          docs: '',
          tags: [],
          server_config: cfg,
        }
        await saveMcpServer(addId.trim(), JSON.stringify(payload))
        toast({ type: 'success', message: 'MCP server created' })
        refreshMcp()
      } else {
        // skills — content is the key=value form
        await saveSkill(addId.trim(), addContent)
        toast({ type: 'success', message: 'Skill created' })
        refreshSkills()
      }
      setShowAddPanel(false)
      setAddId('')
      setAddContent('')
      setAddPresetId(null)
      setAddFormValues(defaultFormValues())
      setAddError(null)
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Create failed')
    } finally {
      setCreating(false)
    }
  }, [addId, addContent, addPresetId, addFormValues, presets, activeTab, agentType, refresh, refreshMcp, refreshSkills, toast])

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col px-8 py-10">
      {/* Header */}
      <PageHeader
        title="Library"
        stats={
          <>
            <span>{filteredProviders.length} providers</span>
            <span className="mx-2 text-border">·</span>
            {TAB_VISIBILITY[agentType].includes('claudeMds') && (
              <>
                <span>{filteredClaudeMds.length} Claude.md templates</span>
                <span className="mx-2 text-border">·</span>
              </>
            )}
            <span>{filteredMcp.length} MCP servers</span>
            <span className="mx-2 text-border">·</span>
            <span>{filteredSkills.length} skills</span>
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
              setAddPresetId(null)
              setAddFormValues(defaultFormValues())
            }}
          >
            + Add {ADD_TAB_LABELS[activeTab]}
          </Button>
        }
        className="mb-6"
      />

      {/* Agent type + Tab strip + Search */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <AgentTypeSwitcher value={agentType} onChange={setAgentType} />
        <div className="flex items-center gap-3">
          <SegmentedTabs
            tabs={TAB_VISIBILITY[agentType].map((k) => ({
              key: k,
              label: TAB_LABELS[k],
              count: TAB_COUNTS[k]({
                providers: filteredProviders,
                claudeMds: filteredClaudeMds,
                mcp: filteredMcp,
                skills: filteredSkills,
              }),
            }))}
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
        {(() => {
          // Per-tab loading + error routing
          const tabLoading =
            activeTab === 'providers' || activeTab === 'claudeMds'
              ? loading
              : activeTab === 'mcp'
                ? mcpLoading
                : skillsLoading
          const tabError =
            activeTab === 'providers' || activeTab === 'claudeMds'
              ? error
              : activeTab === 'mcp'
                ? mcpError
                : skillsError
          if (tabLoading) {
            return <Loading variant="skeleton" rows={4} />
          }
          if (tabError) {
            return (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-10 text-center">
                <p className="text-sm font-medium text-destructive">{tabError}</p>
              </div>
            )
          }
          if (activeTab === 'providers') {
            return (
              <ProvidersList
                items={filteredProviders}
                editing={editing}
                editingProviderForm={editingProviderForm}
                linking={linking}
                editError={editError}
                saving={saving}
                allProfiles={linkableProfiles}
                agentType={agentType}
                testingProvider={testingProvider}
                onStartEdit={(id) => handleStartEdit('providers', id)}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => { setEditing(null); setEditingProviderForm(null) }}
                onEditContentChange={(c) =>
                  setEditing((prev) => (prev ? { ...prev, content: c } : null))
                }
                onEditProviderFormChange={setEditingProviderForm}
                onDelete={(id) => handleDelete('providers', id)}
                onDuplicate={(id) => handleDuplicate(id)}
                onRefresh={refresh}
                onOpenLinking={handleOpenLinking}
                onToggleLinkSelection={handleToggleLinkSelection}
                onConfirmLink={handleConfirmLink}
                onCancelLinking={() => setLinking(null)}
                onTest={(url, providerId) => {
                  setTestingProvider(providerId)
                  testEndpoint(url).then((r) => {
                    setTestingProvider(null)
                    if (!r) return
                    const name = filteredProviders.find((p) => {
                      const env = p.settings?.env
                      return env?.ANTHROPIC_BASE_URL === url
                    })?.name ?? url
                    if (r.status === 'operational') {
                      toast({ type: 'success', message: `${name} reachable (${r.response_time_ms}ms)` })
                    } else if (r.status === 'degraded') {
                      toast({ type: 'warning', message: `${name} reachable but slow (${r.response_time_ms}ms)` })
                    } else {
                      toast({ type: 'error', message: `${name} unreachable: ${r.message}` })
                    }
                  }).catch(() => setTestingProvider(null))
                }}
              />
            )
          }
          if (activeTab === 'claudeMds') {
            return (
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
            )
          }
          if (activeTab === 'mcp') {
            return (
              <McpList
                items={filteredMcp}
                editing={editing}
                editError={editError}
                saving={saving}
                onStartEdit={(id) => handleStartEdit('mcp', id)}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={() => setEditing(null)}
                onEditContentChange={(c) =>
                  setEditing((prev) => (prev ? { ...prev, content: c } : null))
                }
                onDelete={(id) => handleDelete('mcp', id)}
                onToggleAgent={handleToggleMcpAgent}
              />
            )
          }
          return (
            <SkillsList
              items={filteredSkills}
              editing={editing}
              editError={editError}
              saving={saving}
              onStartEdit={(id) => handleStartEdit('skills', id)}
              onSaveEdit={handleSaveEdit}
              onCancelEdit={() => setEditing(null)}
              onEditContentChange={(c) =>
                setEditing((prev) => (prev ? { ...prev, content: c } : null))
              }
              onDelete={(id) => handleDelete('skills', id)}
              onToggleAgent={handleToggleSkillAgent}
            />
          )
        })()}

        {/* Add Panel */}
        {showAddPanel && (
          <div className="mt-4 rounded-xl bg-card p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-foreground">
              New {ADD_TAB_LABELS[activeTab]}
            </h3>
            {activeTab === 'providers' ? (
              <div className="space-y-4">
                <ProviderPresetSelector
                  presets={presets}
                  selectedId={addPresetId}
                  onSelect={handlePresetSelect}
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground block mb-1">Provider ID</label>
                    <Input
                      placeholder="e.g. my-provider"
                      value={addId}
                      onChange={(e) => setAddId(e.target.value)}
                    />
                  </div>
                </div>
                <ProviderFormFields
                  values={addFormValues}
                  onChange={setAddFormValues}
                  showBasicFields
                />
                {addError && <p className="text-xs text-destructive">{addError}</p>}
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddPanel(false)
                      setAddId('')
                      setAddPresetId(null)
                      setAddFormValues(defaultFormValues())
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
            ) : (
              <div className="flex flex-col gap-3">
                <Input
                  placeholder={`ID (e.g. my-${ADD_TAB_LABELS[activeTab].replace(/\s+/g, '-').toLowerCase()})`}
                  value={addId}
                  onChange={(e) => setAddId(e.target.value)}
                />
                <Textarea
                  placeholder={ADD_PLACEHOLDERS[activeTab]}
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
                      setAddPresetId(null)
                      setAddFormValues(defaultFormValues())
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
            )}
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

        <ConfirmDialog
          open={pendingDelete !== null}
          title={
            pendingDelete?.type === 'providers' ? 'Delete provider?' : 'Delete Claude.md?'
          }
          description={
            pendingDelete
              ? pendingDelete.type === 'providers'
                ? `This removes "${pendingDelete.name}" from the library. Any profile linked to it will be left without a provider — re-link or apply another provider before launching.`
                : `This removes the "${pendingDelete.name}" Claude.md template. Profiles linked to it will fall back to default behavior.`
              : ''
          }
          confirmLabel={
            pendingDelete?.type === 'providers' ? 'Delete provider' : 'Delete Claude.md'
          }
          busy={deleting}
          onConfirm={confirmDelete}
          onCancel={() => {
            if (!deleting) setPendingDelete(null)
          }}
        />
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
  editingProviderForm,
  linking,
  editError,
  saving,
  allProfiles,
  agentType,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onEditProviderFormChange,
  onDelete,
  onDuplicate,
  onRefresh,
  onOpenLinking,
  onToggleLinkSelection,
  onConfirmLink,
  onCancelLinking,
  onTest,
  testingProvider,
}: {
  items: Provider[]
  editing: EditingState | null
  editingProviderForm: ProviderFormValues | null
  linking: LinkingState | null
  editError: string | null
  saving: boolean
  allProfiles: Profile[]
  agentType: AgentType
  testingProvider?: string | null
  onStartEdit: (id: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onEditProviderFormChange: (fv: ProviderFormValues) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onRefresh: () => void
  onOpenLinking: (id: string) => void
  onToggleLinkSelection: (profileName: string) => void
  onConfirmLink: () => void
  onCancelLinking: () => void
  onTest?: (url: string, providerId: string) => void
  testingProvider?: string | null
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
          agentType={agentType}
          linkedProfiles={allProfiles.filter((p) => p.providerRef === provider.id)}
          linkableProfiles={allProfiles}
          allProviders={items}
          isEditing={editing?.type === 'provider' && editing.id === provider.id}
          editingProviderForm={editingProviderForm}
          isLinking={linking?.providerId === provider.id}
          linking={linking}
          editing={editing}
          editError={editError}
          saving={saving}
          onStartEdit={() => onStartEdit(provider.id)}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onEditContentChange={onEditContentChange}
          onEditProviderFormChange={onEditProviderFormChange}
          onDelete={() => onDelete(provider.id)}
          onDuplicate={() => onDuplicate(provider.id)}
          onRefresh={onRefresh}
          isTesting={testingProvider === provider.id}
          onOpenLinking={() => onOpenLinking(provider.id)}
          onToggleLinkSelection={onToggleLinkSelection}
          onConfirmLink={onConfirmLink}
          onCancelLinking={onCancelLinking}
          onTest={onTest}
        />
      ))}
    </div>
  )
}

// ── Provider Card ────────────────────────────────────────────────────────

function ProviderCard({
  provider,
  agentType,
  linkedProfiles,
  linkableProfiles,
  allProviders,
  isEditing,
  editingProviderForm,
  isLinking,
  editing,
  linking,
  editError,
  saving,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onEditProviderFormChange,
  onDelete,
  onDuplicate,
  onRefresh,
  onOpenLinking,
  onToggleLinkSelection,
  onConfirmLink,
  onCancelLinking,
  onTest,
  isTesting,
}: {
  provider: Provider
  agentType: AgentType
  linkedProfiles: Profile[]
  linkableProfiles: Profile[]
  allProviders: Provider[]
  isEditing: boolean
  editingProviderForm: ProviderFormValues | null
  isLinking: boolean
  editing: EditingState | null
  linking: LinkingState | null
  editError: string | null
  saving: boolean
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onEditProviderFormChange: (fv: ProviderFormValues) => void
  onDelete: () => void
  onDuplicate: () => void
  onRefresh: () => void
  onOpenLinking: () => void
  onToggleLinkSelection: (profileName: string) => void
  onConfirmLink: () => void
  onCancelLinking: () => void
  onTest?: (url: string) => void
  isTesting?: boolean
}) {
  const baseUrl = extractBaseUrl(provider.settings?.env)
  const model = extractModel(provider.settings?.env)
  const notes = (provider.settings as Record<string, unknown>)?.notes as string | undefined
  const websiteUrl = provider.websiteUrl
  const apiFormat = (provider.settings as Record<string, unknown>)?.apiFormat as string | undefined
  const iconName = iconForProvider(provider)
  const rawColor = iconName ? getIconMetadata(iconName)?.defaultColor : undefined
  // Normalize: currentColor/transparent/empty → fallback gray so gradient & shine work
  const iconColor = rawColor && rawColor.startsWith('#') ? rawColor : '#71717a'
  // If original color was non-hex (white/transparent), use slightly off-white bg
  const isLight = !rawColor || !rawColor.startsWith('#') || isLightColor(rawColor)

  // Display URL: notes > websiteUrl > baseUrl
  const displayUrl = notes?.trim() || websiteUrl || (baseUrl ? `https://${baseUrl}` : undefined)

  // Badge logic
  const isOfficial = provider.category === 'official'
  const needsRouting = !isOfficial && apiFormat && apiFormat !== 'anthropic'

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

  // Usage config local state (expands inline like edit form)
  const [showUsageConfig, setShowUsageConfig] = useState(false)
  const [localUsageCode, setLocalUsageCode] = useState('')
  const [localUsageEnabled, setLocalUsageEnabled] = useState(false)
  const [localUsageTemplate, setLocalUsageTemplate] = useState('balance')
  const [savingUsage, setSavingUsage] = useState(false)

  const linkBtnRef = useRef<HTMLButtonElement>(null)


  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl',
        'transition-all duration-normal',
        'hover:shadow-md',
        isLight ? 'bg-[#f5f5f5] dark:bg-[#1a1a1a]' : 'bg-card',
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
          className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-xl overflow-hidden"
          style={{
            background: `linear-gradient(90deg, ${iconColor}25, transparent)`,
            boxShadow: `inset 0 1px 0 0 rgba(255,255,255,0.06)`,
          }}
        />
      )}

      <div className="flex items-center gap-3 px-4 py-3">
        {/* Brand icon — 36×36, color preserved */}
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg overflow-hidden',
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
            size={22}
            showFallback
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Row 1: Name + badges */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {provider.name}
            </h3>
            {isOfficial && (
              <span className="inline-flex items-center rounded-full bg-slate-200 dark:bg-slate-700/60 px-1.5 py-0 text-[10px] font-semibold text-slate-700 dark:text-slate-200">
                Official
              </span>
            )}
            {needsRouting && (
              <span className="inline-flex items-center rounded-full bg-sky-100 dark:bg-sky-900/40 px-1.5 py-0 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                Needs Routing
              </span>
            )}
            {provider.category && !isOfficial && !needsRouting && (
              <span className="inline-flex items-center rounded-full bg-muted px-1.5 py-0 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {provider.category}
              </span>
            )}
          </div>
          {/* Row 2: URL · model · notes · profiles (single compact line) */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground mt-0.5">
            {notes && notes.trim() && (
              <span className="truncate max-w-[200px]" title={notes.trim()}>{notes.trim()}</span>
            )}
            {displayUrl && (
              <a
                href={displayUrl.startsWith('http') ? displayUrl : `https://${displayUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-blue-500 hover:underline dark:text-blue-400 font-mono truncate max-w-[300px]"
                title={displayUrl}
              >
                {displayUrl.replace(/^https?:\/\//, '')}
              </a>
            )}
            {model && (
              <span className="font-mono truncate text-foreground/70">{model}</span>
            )}
            {linkedProfiles.length > 0 && (
              <>
                <span className="text-border">·</span>
                {linkedProfiles.slice(0, 3).map((p) => (
                  <span key={p.name} className="inline-flex items-center gap-0.5 rounded bg-muted/50 px-1 py-0 text-[10px]" title={p.displayName || p.name}>
                    <span className="h-1 w-1 rounded-full bg-emerald-500" />
                    {p.displayName || p.name}
                  </span>
                ))}
                {linkedProfiles.length > 3 && (
                  <span className="text-muted-foreground/50">+{linkedProfiles.length - 3}</span>
                )}
              </>
            )}
            {unlinkedCandidates.length > 0 && (
              <button
                ref={linkBtnRef}
                type="button"
                onClick={onOpenLinking}
                disabled={isLinking}
                className="inline-flex items-center gap-0.5 rounded px-1 py-0 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50"
              >
                +Link
              </button>
            )}
          </div>
        </div>

        {/* Usage footer */}
        <UsageFooter
          provider={provider}
          agentType={agentType}
          usageScript={provider.meta?.usage_script as UsageScript | null | undefined}
          autoQueryInterval={provider.meta?.usage_script?.autoQueryInterval}
        />

        {/* Actions — hover reveal */}
        <div className="flex items-center gap-0.5 opacity-0 pointer-events-none transition-opacity duration-fast group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
          <IconAction
            label="Test endpoint"
            loading={isTesting}
            onClick={() => {
              const url = provider.settings?.env?.ANTHROPIC_BASE_URL
              if (url && onTest) onTest(url)
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </IconAction>
          <IconAction
            label="Edit provider"
            onClick={onStartEdit}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </IconAction>
          <IconAction
            label="Duplicate provider"
            onClick={onDuplicate}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </IconAction>
          <IconAction
            label="Configure usage query"
            onClick={() => {
              const baseUrl = provider.settings?.env?.ANTHROPIC_BASE_URL ?? ''
              const balanceDetected =
                baseUrl.includes('api.deepseek.com') || baseUrl.includes('api.stepfun.ai') ||
                baseUrl.includes('api.siliconflow.cn') || baseUrl.includes('api.siliconflow.com') ||
                baseUrl.includes('openrouter.ai') || baseUrl.includes('api.novita.ai')
              const tokenPlanDetected =
                baseUrl.includes('api.minimaxi.com') || baseUrl.includes('api.minimax.io') ||
                baseUrl.includes('api.kimi.com/coding') || baseUrl.includes('bigmodel.cn') ||
                baseUrl.includes('api.z.ai')

              if (provider.meta?.usage_script) {
                const us = provider.meta.usage_script
                setLocalUsageCode(us.code || '')
                setLocalUsageEnabled(us.enabled || false)
                setLocalUsageTemplate(us.templateType || 'balance')
              } else if (tokenPlanDetected) {
                setLocalUsageCode('')
                setLocalUsageEnabled(false)
                setLocalUsageTemplate('token_plan')
              } else if (balanceDetected) {
                setLocalUsageCode('')
                setLocalUsageEnabled(false)
                setLocalUsageTemplate('balance')
              } else {
                setLocalUsageCode('curl -s --max-time 10 -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" "$ANTHROPIC_BASE_URL/user/balance"')
                setLocalUsageEnabled(false)
                setLocalUsageTemplate('general')
              }
              setShowUsageConfig(!showUsageConfig)
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <line x1="18" y1="20" x2="18" y2="10" />
              <line x1="12" y1="20" x2="12" y2="4" />
              <line x1="6" y1="20" x2="6" y2="14" />
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

      {/* Usage query config panel (inline expand) */}
      {showUsageConfig && (() => {
        const cfgBaseUrl = provider.settings?.env?.ANTHROPIC_BASE_URL ?? ''
        const balanceName = (() => {
          for (const [pat, name] of [
            ['api.deepseek.com', 'DeepSeek'],
            ['api.stepfun.ai', 'StepFun'],
            ['api.siliconflow.cn', 'SiliconFlow'],
            ['api.siliconflow.com', 'SiliconFlow'],
            ['openrouter.ai', 'OpenRouter'],
            ['api.novita.ai', 'Novita AI'],
          ] as const) { if (cfgBaseUrl.includes(pat)) return name }
          return null
        })()
        const tokenPlanName = (() => {
          for (const [pat, name] of [
            ['api.minimaxi.com', 'MiniMax'],
            ['api.minimax.io', 'MiniMax'],
            ['api.kimi.com/coding', 'Kimi'],
            ['bigmodel.cn', 'Zhipu'],
            ['api.z.ai', 'Zhipu'],
          ] as const) { if (cfgBaseUrl.includes(pat)) return name }
          return null
        })()
        const isNative = (localUsageTemplate === 'balance' && !!balanceName) ||
                         (localUsageTemplate === 'token_plan' && !!tokenPlanName)
        const needsCode = localUsageTemplate === 'general' || localUsageTemplate === 'newapi' || localUsageTemplate === 'custom'

        const handleSave = async () => {
          setSavingUsage(true)
          try {
            const script: UsageScript = {
              enabled: localUsageEnabled,
              code: localUsageCode,
              timeout: 10,
              autoQueryInterval: 5,
              templateType: localUsageTemplate,
            }
            await saveUsageScript(agentType, provider.id, script)
            onRefresh()
            setShowUsageConfig(false)
          } catch (e) {
            // keep panel open on error
          } finally {
            setSavingUsage(false)
          }
        }

        return (
          <div className="bg-muted/30 px-5 py-4">
            <h4 className="text-xs font-semibold text-foreground mb-3">Usage Query</h4>

            {/* Template presets */}
            <div className="mb-3">
              <div className="flex gap-1.5 flex-wrap">
                {tokenPlanName && (
                  <button type="button" onClick={() => { setLocalUsageTemplate('token_plan'); setLocalUsageCode('') }}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                      localUsageTemplate === 'token_plan' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    📊 {tokenPlanName} Token Plan
                  </button>
                )}
                {balanceName && (
                  <button type="button" onClick={() => { setLocalUsageTemplate('balance'); setLocalUsageCode('') }}
                    className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                      localUsageTemplate === 'balance' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                    💰 {balanceName}
                  </button>
                )}
                <button type="button" onClick={() => { setLocalUsageTemplate('general'); setLocalUsageCode('curl -s --max-time 10 -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" "$ANTHROPIC_BASE_URL/user/balance"') }}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                    localUsageTemplate === 'general' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  General
                </button>
                <button type="button" onClick={() => { setLocalUsageTemplate('newapi'); setLocalUsageCode('RESP=$(curl -s --max-time 10 -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" -H "Content-Type: application/json" "$ANTHROPIC_BASE_URL/api/user/self")\necho "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin).get(\"data\",json.load(sys.stdin)); print(json.dumps({\"remaining\": (d.get(\"quota\",0)-d.get(\"used_quota\",0))/500000, \"used\": d.get(\"used_quota\",0)/500000, \"total\": d.get(\"quota\",0)/500000, \"unit\": \"USD\"}))"') }}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                    localUsageTemplate === 'newapi' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  New-API
                </button>
                <button type="button" onClick={() => { setLocalUsageTemplate('custom'); if (!localUsageCode) setLocalUsageCode('curl -s -H "Authorization: Bearer $ANTHROPIC_AUTH_TOKEN" "$ANTHROPIC_BASE_URL/user/balance"') }}
                  className={`px-2 py-1 rounded-md text-[10px] font-medium transition-colors cursor-pointer ${
                    localUsageTemplate === 'custom' ? 'bg-blue-500 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                  Custom
                </button>
              </div>
            </div>

            {isNative && (
              <div className="mb-3 p-2 rounded-md bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                ✅ Native query — no script needed
              </div>
            )}

            {needsCode && (
              <div className="mb-3">
                <Textarea rows={5} value={localUsageCode}
                  onChange={(e) => setLocalUsageCode(e.target.value)}
                  className="font-mono text-[10px]" />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Env: <code>$ANTHROPIC_AUTH_TOKEN</code>, <code>$ANTHROPIC_BASE_URL</code>
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[10px]">
                <input type="checkbox" checked={localUsageEnabled}
                  onChange={(e) => setLocalUsageEnabled(e.target.checked)} className="rounded" />
                <span className="text-muted-foreground">Auto-query every 5 min</span>
              </label>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowUsageConfig(false)}>Cancel</Button>
                <Button size="sm" isLoading={savingUsage} onClick={handleSave}>Save</Button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Inline edit panel — cc-switch style form */}
      {isEditing && editingProviderForm && (
        <div className="bg-muted/30 px-5 py-4">
          <ProviderFormFields
            values={editingProviderForm}
            onChange={onEditProviderFormChange}
            showBasicFields
          />
          <div className="mt-4 flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              {provider.name} · {extractBaseUrl(provider.settings?.env) ?? 'no endpoint'}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={onCancelEdit}>Cancel</Button>
              <Button size="sm" isLoading={saving} onClick={onSaveEdit}>Save</Button>
            </div>
          </div>
          {editError && <p className="mt-2 text-xs text-destructive">{editError}</p>}
        </div>
      )}
      {isEditing && !editingProviderForm && (
        <div className="bg-muted/30 px-5 py-4">
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      )}

      {/* Link profile popover — portal */}
      {isLinking && linking && (
        <LinkPopover
          anchorRef={linkBtnRef}
          provider={provider}
          linking={linking}
          unlinkedCandidates={unlinkedCandidates}
          providerLabelById={providerLabelById}
          saving={saving}
          onToggleLinkSelection={onToggleLinkSelection}
          onConfirmLink={onConfirmLink}
          onCancelLinking={onCancelLinking}
        />
      )}
    </div>
  )
}

// ── Link Profile Popover ────────────────────────────────────────────────

function LinkPopover({
  anchorRef,
  provider,
  linking,
  unlinkedCandidates,
  providerLabelById,
  saving,
  onToggleLinkSelection,
  onConfirmLink,
  onCancelLinking,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>
  provider: Provider
  linking: LinkingState
  unlinkedCandidates: Profile[]
  providerLabelById: Map<string, string>
  saving: boolean
  onToggleLinkSelection: (name: string) => void
  onConfirmLink: () => void
  onCancelLinking: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
    }
  }, [anchorRef])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onCancelLinking()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onCancelLinking])

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] w-[280px] rounded-xl bg-card/95 backdrop-blur-xl shadow-xl ring-1 ring-border p-3"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">Link profiles</span>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {linking.selectedProfiles.size} selected
        </span>
      </div>
      <div className="flex flex-col gap-1 max-h-[200px] overflow-y-auto mb-2">
        {unlinkedCandidates.length === 0 && (
          <span className="text-xs text-muted-foreground/60 italic py-2 text-center">
            no profile to link
          </span>
        )}
        {unlinkedCandidates
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
                  'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-left w-full',
                  'transition-all duration-fast cursor-pointer',
                  selected
                    ? 'bg-foreground text-background'
                    : 'hover:bg-muted text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors',
                    selected
                      ? 'bg-background border-background text-foreground'
                      : 'border-border',
                  )}
                >
                  {selected && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 truncate">{p.displayName || p.name}</span>
                {isSwitch && (
                  <span className="text-[10px] opacity-60 shrink-0">
                    ↻ {currentProviderLabel}
                  </span>
                )}
              </button>
            )
          })}
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
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
      </div>,
    document.body,
  )
}

// ── Icon Action Button ───────────────────────────────────────────────────

function IconAction({
  label,
  onClick,
  variant = 'default',
  loading = false,
  children,
}: {
  label: string
  onClick: () => void
  variant?: 'default' | 'danger'
  loading?: boolean
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-md transition-all duration-fast',
        'hover:scale-110 active:scale-95',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1',
        'disabled:opacity-70 disabled:scale-100',
        variant === 'default' &&
          'text-muted-foreground hover:bg-muted hover:text-foreground hover:shadow-sm',
        variant === 'danger' &&
          'text-muted-foreground hover:bg-destructive/10 hover:text-destructive hover:shadow-sm',
      )}
    >
      <span className="h-4 w-4">
        {loading ? (
          <svg viewBox="0 0 24 24" fill="none" className="animate-spin h-4 w-4">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
            <path d="M12 2a10 10 0 019.95 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        ) : (
          children
        )}
      </span>
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
  const linkedProfiles = profiles.filter((p) => p.claudeMdRef === md.id)

  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl bg-card',
        'transition-all duration-normal',
        'hover:shadow-md',
        (isEditing || isApplying) && 'ring-1 ring-accent/30 shadow-md',
      )}
    >
      {/* Glass shine on left edge */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-xl overflow-hidden"
        style={{
          background: 'linear-gradient(90deg, #8B5CF625, transparent)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
        }}
      />

      <div className="flex items-center gap-4 px-5 py-4">
        {/* Icon — markdown file glyph */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20 overflow-hidden">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-violet-500">
            <rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" strokeWidth="1.75" />
            <path d="M6 16V8l3 3.5L12 8v8" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M17 14l2 2-2 2" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 18h-1.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">
              {md.name}
            </h3>
            <span className="inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400">
              markdown
            </span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">
              Applied to
            </span>
            {linkedProfiles.length === 0 ? (
              <span className="text-[10px] text-muted-foreground/50 italic">no profile</span>
            ) : (
              linkedProfiles.map((p) => (
                <span
                  key={p.name}
                  className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground"
                  title={p.displayName || p.name}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {p.displayName || p.name}
                </span>
              ))
            )}
          </div>
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
        <div className="bg-muted/30 px-5 py-4">
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
        <div className="bg-muted/30 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground shrink-0">
              Apply to
            </span>
            <select
              value={mdLinking.profileName}
              onChange={(e) => onApplyProfileChange(e.target.value)}
              className="h-9 flex-1 rounded-md bg-card shadow-sm px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1"
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
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm"
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

// ── MCP List ────────────────────────────────────────────────────────────

function McpList({
  items,
  editing,
  editError,
  saving,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  onToggleAgent,
}: {
  items: McpServer[]
  editing: EditingState | null
  editError: string | null
  saving: boolean
  onStartEdit: (id: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onDelete: (id: string) => void
  onToggleAgent: (id: string, t: AgentType, enabled: boolean) => void
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="◈"
        title="No MCP servers yet"
        description="Add an MCP server to expose tools to your agent."
      />
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((server) => (
        <McpCard
          key={server.id}
          server={server}
          isEditing={editing?.type === 'mcp' && editing.id === server.id}
          editing={editing}
          editError={editError}
          saving={saving}
          onStartEdit={() => onStartEdit(server.id)}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onEditContentChange={onEditContentChange}
          onDelete={() => onDelete(server.id)}
          onToggleAgent={(t, next) => onToggleAgent(server.id, t, next)}
        />
      ))}
    </div>
  )
}

// ── MCP Card ────────────────────────────────────────────────────────────

function McpCard({
  server,
  isEditing,
  editing,
  editError,
  saving,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  onToggleAgent,
}: {
  server: McpServer
  isEditing: boolean
  editing: EditingState | null
  editError: string | null
  saving: boolean
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onDelete: () => void
  onToggleAgent: (t: AgentType, enabled: boolean) => void
}) {
  const cfg = server.serverConfigParsed
  const cfgType = cfg?.type ?? 'stdio'
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl bg-card',
        'transition-all duration-normal hover:shadow-md',
        isEditing && 'ring-1 ring-accent/30 shadow-md',
      )}
    >
      {/* Glass shine on left edge (cyan/violet to evoke "network") */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-xl overflow-hidden"
        style={{
          background: 'linear-gradient(90deg, #06B6D425, transparent)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
        }}
      />

      <div className="flex items-center gap-4 px-5 py-4">
        {/* Icon — network/box glyph */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 ring-1 ring-cyan-500/20 overflow-hidden">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-cyan-500">
            <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.75" />
            <path d="M10 6.5h4M6.5 10v4M17.5 10v4M10 17.5h4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">{server.name}</h3>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider',
                cfgType === 'stdio'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : cfgType === 'sse'
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
              )}
            >
              {cfgType}
            </span>
            {server.tags.slice(0, 3).map((t) => (
              <span
                key={t}
                className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
          {server.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{server.description}</p>
          )}
          <AgentTypePicker enabled={server.agentTypes} onToggle={onToggleAgent} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 pointer-events-none transition-opacity duration-fast group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
          <IconAction label="Edit MCP server" onClick={onStartEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </IconAction>
          <IconAction label="Delete MCP server" onClick={onDelete} variant="danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            </svg>
          </IconAction>
        </div>
      </div>

      {/* Inline editor (JSON of server_config) */}
      {isEditing && editing && (
        <div className="bg-muted/30 px-5 py-4">
          <Textarea
            rows={8}
            value={editing.content}
            onChange={(e) => onEditContentChange(e.target.value)}
            error={editError ?? undefined}
            className="font-mono text-xs"
          />
          <p className="mt-2 text-[10px] text-muted-foreground">
            server_config schema: <code>{`{ type: "stdio" | "sse" | "http", command?, args?, env?, url?, headers? }`}</code>
          </p>
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
    </div>
  )
}

// ── Skills List ─────────────────────────────────────────────────────────

function SkillsList({
  items,
  editing,
  editError,
  saving,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  onToggleAgent,
}: {
  items: Skill[]
  editing: EditingState | null
  editError: string | null
  saving: boolean
  onStartEdit: (id: string) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onDelete: (id: string) => void
  onToggleAgent: (id: string, t: AgentType, enabled: boolean) => void
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon="◈"
        title="No skills yet"
        description="Add a skill to teach your agent a new capability."
      />
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((skill) => (
        <SkillCard
          key={skill.id}
          skill={skill}
          isEditing={editing?.type === 'skill' && editing.id === skill.id}
          editing={editing}
          editError={editError}
          saving={saving}
          onStartEdit={() => onStartEdit(skill.id)}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onEditContentChange={onEditContentChange}
          onDelete={() => onDelete(skill.id)}
          onToggleAgent={(t, next) => onToggleAgent(skill.id, t, next)}
        />
      ))}
    </div>
  )
}

// ── Skill Card ──────────────────────────────────────────────────────────

function SkillCard({
  skill,
  isEditing,
  editing,
  editError,
  saving,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onEditContentChange,
  onDelete,
  onToggleAgent,
}: {
  skill: Skill
  isEditing: boolean
  editing: EditingState | null
  editError: string | null
  saving: boolean
  onStartEdit: () => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onEditContentChange: (content: string) => void
  onDelete: () => void
  onToggleAgent: (t: AgentType, enabled: boolean) => void
}) {
  const repo = skill.repoOwner && skill.repoName ? `${skill.repoOwner}/${skill.repoName}` : null
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-xl bg-card',
        'transition-all duration-normal hover:shadow-md',
        isEditing && 'ring-1 ring-accent/30 shadow-md',
      )}
    >
      {/* Glass shine on left edge (amber for "skill") */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-0 w-1 rounded-l-xl overflow-hidden"
        style={{
          background: 'linear-gradient(90deg, #F59E0B25, transparent)',
          boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
        }}
      />

      <div className="flex items-center gap-4 px-5 py-4">
        {/* Icon — sparkle/glyph */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 overflow-hidden">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 text-amber-500">
            <path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7L12 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M19 14l.7 1.8L21.5 16.5l-1.8.7L19 19l-.7-1.8L16.5 16.5l1.8-.7L19 14z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M5 17l.5 1.3L6.8 18.8l-1.3.5L5 20.6l-.5-1.3L3.2 18.8l1.3-.5L5 17z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground truncate">{skill.name}</h3>
            <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
              skill
            </span>
            {repo && (
              <span
                title={`${repo}@${skill.repoBranch ?? 'main'}`}
                className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3">
                  <path d="M9 19c-5 1.5-5-2.5-7-3" />
                  <path d="M15 22v-4a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
                </svg>
                {repo}
              </span>
            )}
          </div>
          {skill.description && (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{skill.description}</p>
          )}
          {skill.directory && (
            <p
              title={skill.directory}
              className="mt-0.5 font-mono text-[10px] text-muted-foreground/70 truncate"
            >
              {skill.directory}
            </p>
          )}
          <AgentTypePicker enabled={skill.agentTypes} onToggle={onToggleAgent} />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 pointer-events-none transition-opacity duration-fast group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto">
          <IconAction label="Edit skill" onClick={onStartEdit}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </IconAction>
          <IconAction label="Delete skill" onClick={onDelete} variant="danger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
            </svg>
          </IconAction>
        </div>
      </div>

      {/* Inline editor (key=value lines) */}
      {isEditing && editing && (
        <div className="bg-muted/30 px-5 py-4">
          <Textarea
            rows={6}
            value={editing.content}
            onChange={(e) => onEditContentChange(e.target.value)}
            error={editError ?? undefined}
            className="font-mono text-xs"
          />
          <p className="mt-2 text-[10px] text-muted-foreground">
            Supported keys: <code>name</code>, <code>description</code>,{' '}
            <code>directory</code> (absolute path), <code>repoOwner</code>,{' '}
            <code>repoName</code>, <code>repoBranch</code>, <code>readmeUrl</code>.
            One per line, <code>key = value</code> or <code>key: value</code>.
          </p>
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
    </div>
  )
}

// ── Agent Type Multi-Select ─────────────────────────────────────────────

/** Inline row of agent-type checkboxes for a Library item. */
function AgentTypePicker({
  enabled,
  onToggle,
}: {
  enabled: AgentType[]
  onToggle: (t: AgentType, next: boolean) => void
}) {
  return (
    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground shrink-0">
        Agents
      </span>
      {AGENT_TYPES.map((t) => {
        const on = enabled.includes(t)
        return (
          <button
            key={t}
            type="button"
            onClick={() => onToggle(t, !on)}
            title={on ? `Disable for ${t}` : `Enable for ${t}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-mono',
              'transition-colors duration-fast cursor-pointer',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1',
              on
                ? 'bg-foreground text-background'
                : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-2.5 w-2.5 shrink-0 items-center justify-center rounded-sm border',
                on ? 'border-background bg-background/20' : 'border-border',
              )}
            >
              {on && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="h-2 w-2 text-background">
                  <path d="M5 12l5 5L20 7" />
                </svg>
              )}
            </span>
            {t}
          </button>
        )
      })}
    </div>
  )
}
