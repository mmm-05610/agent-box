/**
 * Profile Detail Page — View and edit a single profile's configuration.
 *
 * Claude tabs:
 *   Meta / Model&Env / Permissions / Hooks / Plugins / CLAUDE.md / MCP / Skills / Storage
 *
 * Each tab that edits settings.json uses patchJsonFile() to replace only
 * its own key, so tabs never conflict.  Storage is the escape hatch with
 * a file tree + raw JSON editor for every file in the profile.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Badge, Tabs } from '@/components/ui'
import { Loading } from '@/components/feedback'
import type { AgentType } from '@/api'
import { AGENT_TYPE_COLORS, fetchProfileDetail } from '@/api'
import { readFile, findFiles } from '@/api/files'
import { MetaEditor } from './detail/MetaEditor'
import { ProviderEditor } from './detail/ProviderEditor'
import { PermissionsEditor } from './detail/PermissionsEditor'
import { HooksEditor } from './detail/HooksEditor'
import { PluginsEditor } from './detail/PluginsEditor'
import { FileTextEditor } from './detail/FileTextEditor'
import { McpTab } from './detail/McpTab'
import { SkillsTab } from './detail/SkillsTab'
import { StorageExplorer } from './detail/StorageExplorer'

// ── Types ──────────────────────────────────────────────────────────────

export interface ProfileDetail {
  path: string
  meta: {
    name: string
    agent_type: string
    display_name: string
    description: string
    provider: string
    claude_md: string
    preset: string
  }
  config_dir: string
}

export type TabKey = string

interface TabDef {
  key: TabKey
  label: string
}

// ── Tab definitions ────────────────────────────────────────────────────

const CLAUDE_TABS: TabDef[] = [
  { key: 'meta',       label: 'Meta' },
  { key: 'provider',   label: 'Provider' },
  { key: 'permissions',label: 'Permissions' },
  { key: 'hooks',      label: 'Hooks' },
  { key: 'plugins',    label: 'Plugins' },
  { key: 'claude-md',  label: 'CLAUDE.md' },
  { key: 'mcp',        label: 'MCP' },
  { key: 'skills',     label: 'Skills' },
  { key: 'storage',    label: 'Storage' },
]

const OTHER_TABS: Record<string, TabDef[]> = {
  codex: [
    { key: 'meta',       label: 'Meta' },
    { key: 'claude-md',  label: 'Rules' },
    { key: 'storage',    label: 'Storage' },
  ],
  hermes: [
    { key: 'meta',       label: 'Meta' },
    { key: 'claude-md',  label: 'Persona' },
    { key: 'storage',    label: 'Storage' },
  ],
  opencode: [
    { key: 'meta',       label: 'Meta' },
    { key: 'storage',    label: 'Storage' },
  ],
}

// ── Component ──────────────────────────────────────────────────────────

interface ProfileDetailPageProps {
  profileName: string
  onBack: () => void
}

export function ProfileDetailPage({ profileName, onBack }: ProfileDetailPageProps) {
  const [detail, setDetail] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('meta')

  // Loaded file contents
  const [settingsRaw, setSettingsRaw] = useState<string>('{}')
  const [claudeMdRaw, setClaudeMdRaw] = useState<string>('')
  const [claudeDotJson, setClaudeDotJson] = useState<string>('{}')
  const [fileTree, setFileTree] = useState<string[]>([])

  // Reload trigger (incremented after save to refresh dependent tabs)
  const [refreshKey, setRefreshKey] = useState(0)

  // ── Load ───────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Only show loading skeleton on first mount; refresh is silent.
      if (detail === null) setLoading(true)
      setError(null)
      try {
        const data = await fetchProfileDetail(profileName)
        if (cancelled) return
        if (!data) { setError('Profile not found'); return }
        const d = data as unknown as ProfileDetail
        setDetail(d)

        const configDir = d.config_dir
        const [s, md, cj, tree] = await Promise.all([
          readFile(`${configDir}/settings.json`).catch(() => '{}'),
          readFile(`${configDir}/CLAUDE.md`).catch(() => ''),
          readFile(`${d.path}/dot-claude.json`).catch(() => '{}'),
          findFiles(`${d.path}`).catch(() => [] as string[]),
        ] as const)
        if (cancelled) return
        setSettingsRaw(s)
        setClaudeMdRaw(md)
        setClaudeDotJson(cj)
        setFileTree(tree)
      } catch (e: unknown) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [profileName, refreshKey])

  const triggerRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">← Back</Button>
        <Loading variant="skeleton" rows={6} />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">← Back</Button>
        <div className="flex flex-col items-center gap-3 py-16 text-destructive">
          <p>{error ?? 'Profile not found'}</p>
          <Button variant="ghost" size="sm" onClick={onBack}>Go back</Button>
        </div>
      </div>
    )
  }

  const { meta } = detail
  const agentType = meta.agent_type
  const tabs = agentType === 'claude' ? CLAUDE_TABS : (OTHER_TABS[agentType] ?? OTHER_TABS['codex']!)
  const badgeVariant = AGENT_TYPE_COLORS[agentType as AgentType] ?? 'neutral'
  const configDir = detail.config_dir
  const settingsPath = `${configDir}/settings.json`
  const claudeMdPath = `${configDir}/${agentType === 'hermes' ? 'SOUL.md' : 'CLAUDE.md'}`

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back to Profiles</Button>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Profile</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{meta.name}</h1>
        </div>
        <Badge variant={badgeVariant as 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'}>
          {agentType}
        </Badge>
      </div>

      <Tabs
        tabs={tabs.map((t) => ({ key: t.key, label: t.label }))}
        active={activeTab}
        onChange={setActiveTab}
        className="mb-6"
      />

      <TabContent
        tab={activeTab}
        detail={detail}
        settingsPath={settingsPath}
        settingsRaw={settingsRaw}
        claudeMdPath={claudeMdPath}
        claudeMdRaw={claudeMdRaw}
        claudeDotJson={claudeDotJson}
        fileTree={fileTree}
        onRefresh={triggerRefresh}
      />
    </div>
  )
}

// ── Tab Content Router ─────────────────────────────────────────────────

function TabContent({
  tab, detail, settingsPath, settingsRaw, claudeMdPath, claudeMdRaw,
  claudeDotJson, fileTree, onRefresh,
}: {
  tab: TabKey
  detail: ProfileDetail
  settingsPath: string
  settingsRaw: string
  claudeMdPath: string
  claudeMdRaw: string
  claudeDotJson: string
  fileTree: string[]
  onRefresh: () => void
}) {
  const profilePath = detail.path
  const agentType = detail.meta.agent_type

  switch (tab) {
    case 'meta':
      return <MetaEditor detail={detail} onRefresh={onRefresh} />
    case 'provider':
      return <ProviderEditor path={settingsPath} content={settingsRaw} onRefresh={onRefresh} agentType={agentType} />
    case 'permissions':
      return <PermissionsEditor path={settingsPath} content={settingsRaw} onRefresh={onRefresh} />
    case 'hooks':
      return <HooksEditor path={settingsPath} content={settingsRaw} onRefresh={onRefresh} />
    case 'plugins':
      return <PluginsEditor path={settingsPath} content={settingsRaw} onRefresh={onRefresh} />
    case 'claude-md':
      return (
        <FileTextEditor
          path={claudeMdPath}
          content={claudeMdRaw}
          label={agentType === 'hermes' ? 'SOUL.md' : 'CLAUDE.md'}
          placeholder="# Custom instructions"
          onRefresh={onRefresh}
        />
      )
    case 'mcp':
      return <McpTab profileName={detail.meta.name} profilePath={profilePath} />
    case 'skills':
      return <SkillsTab profileName={detail.meta.name} configDir={detail.config_dir} />
    case 'storage':
      return (
        <StorageExplorer
          profilePath={profilePath}
          fileTree={fileTree}
          onRefresh={onRefresh}
        />
      )
    default:
      return <p className="text-sm text-muted-foreground p-4">Tab not implemented: {tab}</p>
  }
}
