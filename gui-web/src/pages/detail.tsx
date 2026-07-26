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
import type { AgentType, McpServer } from '@/api'
import { AGENT_TYPE_COLORS, fetchProfileDetail } from '@/api'
import { readFile, findFiles } from '@/api/files'
import { fetchMcpServers } from '@/api/mcp'
import { MetaEditor } from './detail/MetaEditor'
import { ProviderTab } from './detail/ProviderTab'
import type { ConfigFile } from './detail/ProviderTab'
import { PermissionsEditor } from './detail/PermissionsEditor'
import { HooksEditor } from './detail/HooksEditor'
import { PluginsEditor } from './detail/PluginsEditor'
import { FileTextEditor } from './detail/FileTextEditor'
import { McpTab } from './detail/McpTab'
import { SkillsTab } from './detail/SkillsTab'
import { StorageExplorer } from './detail/StorageExplorer'
import { RulesTab } from './detail/RulesTab'
import { HermesMemoriesTab } from './detail/HermesMemoriesTab'
import { HermesHooksViewer } from './detail/HermesHooksViewer'
import { OpenCodeInstructionsTab } from './detail/OpenCodeInstructionsTab'

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
    { key: 'provider',   label: 'Provider' },
    { key: 'agents-md',  label: 'AGENTS.md' },
    { key: 'rules',      label: 'Rules' },
    { key: 'skills',     label: 'Skills' },
    { key: 'storage',    label: 'Storage' },
  ],
  hermes: [
    { key: 'meta',       label: 'Meta' },
    { key: 'provider',   label: 'Provider' },
    { key: 'soul-md',    label: 'SOUL.md' },
    { key: 'memories',   label: 'Memories' },
    { key: 'skills',     label: 'Skills' },
    { key: 'hooks',      label: 'Hooks' },
    { key: 'storage',    label: 'Storage' },
  ],
  opencode: [
    { key: 'meta',         label: 'Meta' },
    { key: 'provider',     label: 'Provider' },
    { key: 'agents-md',    label: 'AGENTS.md' },
    { key: 'instructions', label: 'Instructions' },
    { key: 'skills',       label: 'Skills' },
    { key: 'storage',      label: 'Storage' },
  ],
}

// ── Component ──────────────────────────────────────────────────────────

interface ProfileDetailPageProps {
  profileName: string
  onBack: () => void
  /** Optional: navigate to the Library page (wired from App if available). */
  onNavigateLibrary?: () => void
}

export function ProfileDetailPage({ profileName, onBack, onNavigateLibrary }: ProfileDetailPageProps) {
  const [detail, setDetail] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('meta')

  // Loaded file contents
  const [settingsRaw, setSettingsRaw] = useState<string>('{}')
  const [claudeMdRaw, setClaudeMdRaw] = useState<string>('')
  const [claudeDotJson, setClaudeDotJson] = useState<string>('{}')
  const [codexConfigToml, setCodexConfigToml] = useState<string>('')
  const [codexAuthJson, setCodexAuthJson] = useState<string>('')
  const [codexAgentsMd, setCodexAgentsMd] = useState<string>('')
  const [opencodeJsonc, setOpencodeJsonc] = useState<string>('')
  const [opencodeAuthJson, setOpencodeAuthJson] = useState<string>('')
  const [opencodeAgentsMd, setOpencodeAgentsMd] = useState<string>('')
  const [hermesConfigYaml, setHermesConfigYaml] = useState<string>('')
  const [hermesEnvContent, setHermesEnvContent] = useState<string>('')
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
        const agentTypeLocal = d.meta.agent_type
        const isOpencodeLike = agentTypeLocal === 'opencode' 
        const isHermes = agentTypeLocal === 'hermes'
        const [s, md, cj, codexToml, codexAuth, codexMd, ocJsonc, ocAuth, ocAgentsMd, hYaml, hEnv, tree] = await Promise.all([
          readFile(`${configDir}/settings.json`).catch(() => '{}'),
          isHermes ? readFile(`${configDir}/SOUL.md`).catch(() => '') : agentTypeLocal === 'codex' ? Promise.resolve('') : readFile(`${configDir}/CLAUDE.md`).catch(() => ''),
          readFile(`${d.path}/dot-claude.json`).catch(() => '{}'),
          agentTypeLocal === 'codex' ? readFile(`${configDir}/config.toml`).catch(() => '') : Promise.resolve(''),
          agentTypeLocal === 'codex' ? readFile(`${configDir}/auth.json`).catch(() => '') : Promise.resolve(''),
          agentTypeLocal === 'codex' ? readFile(`${configDir}/AGENTS.md`).catch(() => '') : Promise.resolve(''),
          isOpencodeLike ? readFile(`${configDir}/opencode.jsonc`).catch(() => '') : Promise.resolve(''),
          isOpencodeLike ? readFile(`${d.path}/dot-opencode-data/auth.json`).catch(() => '') : Promise.resolve(''),
          isOpencodeLike ? readFile(`${configDir}/AGENTS.md`).catch(() => '') : Promise.resolve(''),
          isHermes ? readFile(`${configDir}/config.yaml`).catch(() => '') : Promise.resolve(''),
          isHermes ? readFile(`${configDir}/.env`).catch(() => '') : Promise.resolve(''),
          findFiles(`${d.path}`).catch(() => [] as string[]),
        ] as const)
        if (cancelled) return
        setSettingsRaw(s)
        setClaudeMdRaw(md)
        setClaudeDotJson(cj)
        setCodexConfigToml(codexToml)
        setCodexAuthJson(codexAuth)
        setCodexAgentsMd(codexMd)
        setOpencodeJsonc(ocJsonc)
        setOpencodeAuthJson(ocAuth)
        setOpencodeAgentsMd(ocAgentsMd)
        setHermesConfigYaml(hYaml)
        setHermesEnvContent(hEnv)
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
  // Per-agent persona/agent-file path. Codex uses AGENTS.md, Hermes uses SOUL.md, others CLAUDE.md.
  const claudeMdPath =
    agentType === 'codex' ? `${configDir}/AGENTS.md` :
    agentType === 'opencode' ? `${configDir}/AGENTS.md` :
    agentType === 'hermes' ? `${configDir}/SOUL.md` :
    `${configDir}/CLAUDE.md`

  const configFiles: ConfigFile[] = (
    agentType === 'claude' ? [{ label: 'settings.json', path: settingsPath, content: settingsRaw }] :
    agentType === 'codex' ? [
      { label: 'config.toml', path: `${configDir}/config.toml`, content: codexConfigToml },
      { label: 'auth.json', path: `${configDir}/auth.json`, content: codexAuthJson },
    ] :
    agentType === 'hermes' ? [
      { label: 'config.yaml', path: `${configDir}/config.yaml`, content: hermesConfigYaml },
    ] :
    agentType === 'opencode' ? [
      { label: 'opencode.jsonc', path: `${configDir}/opencode.jsonc`, content: opencodeJsonc },
      { label: 'auth.json', path: `${detail.path}/dot-opencode-data/auth.json`, content: opencodeAuthJson },
    ] : []
  )

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
        codexConfigToml={codexConfigToml}
        codexAuthJson={codexAuthJson}
        codexAgentsMd={codexAgentsMd}
        opencodeJsonc={opencodeJsonc}
        opencodeAuthJson={opencodeAuthJson}
        opencodeAgentsMd={opencodeAgentsMd}
        hermesConfigYaml={hermesConfigYaml}
        hermesEnvContent={hermesEnvContent}
        fileTree={fileTree}
        onRefresh={triggerRefresh}
        refreshKey={refreshKey}
        onNavigateLibrary={onNavigateLibrary}
        configFiles={configFiles}
      />
    </div>
  )
}

// ── Tab Content Router ─────────────────────────────────────────────────

function TabContent({
  tab, detail, settingsPath, settingsRaw, claudeMdPath, claudeMdRaw,
  claudeDotJson, codexConfigToml, codexAuthJson, codexAgentsMd,
  opencodeJsonc, opencodeAuthJson, opencodeAgentsMd,
  hermesConfigYaml, hermesEnvContent,
  fileTree, onRefresh, refreshKey, onNavigateLibrary, configFiles,
}: {
  tab: TabKey
  detail: ProfileDetail
  settingsPath: string
  settingsRaw: string
  claudeMdPath: string
  claudeMdRaw: string
  claudeDotJson: string
  codexConfigToml: string
  codexAuthJson: string
  codexAgentsMd: string
  opencodeJsonc: string
  opencodeAuthJson: string
  opencodeAgentsMd: string
  hermesConfigYaml: string
  hermesEnvContent: string
  fileTree: string[]
  onRefresh: () => void
  refreshKey: number
  onNavigateLibrary?: () => void
  configFiles: ConfigFile[]
}) {
  const profilePath = detail.path
  const agentType = detail.meta.agent_type

  // Library MCP list — only meaningful for claude agents; mirror ProviderEditor's
  // conditional fetch so non-claude profiles don't burn a round-trip.
  const [libraryMcpServers, setLibraryMcpServers] = useState<McpServer[]>([])
  useEffect(() => {
    if (agentType !== 'claude') {
      setLibraryMcpServers([])
      return
    }
    fetchMcpServers('claude')
      .then(setLibraryMcpServers)
      .catch(() => setLibraryMcpServers([]))
  }, [agentType, refreshKey])

  switch (tab) {
    case 'meta':
      return <MetaEditor key={refreshKey} detail={detail} onRefresh={onRefresh} />
    case 'permissions':
      return <PermissionsEditor key={refreshKey} path={settingsPath} content={settingsRaw} onRefresh={onRefresh} />
    case 'plugins':
      return <PluginsEditor key={refreshKey} path={settingsPath} content={settingsRaw} onRefresh={onRefresh} />
    case 'claude-md':
      return (
        <FileTextEditor
          key={refreshKey}
          path={claudeMdPath}
          content={claudeMdRaw}
          label={agentType === 'hermes' ? 'SOUL.md' : 'CLAUDE.md'}
          placeholder="# Custom instructions"
          onRefresh={onRefresh}
        />
      )
    case 'provider':
      return <ProviderTab
        key={refreshKey}
        agentType={agentType}
        profileName={detail.meta.name}
        configFiles={configFiles}
        onRefresh={onRefresh}
      />
    case 'soul-md':
      return (
        <FileTextEditor
          key={refreshKey}
          path={claudeMdPath}
          content={claudeMdRaw}
          label="SOUL.md"
          placeholder="# Persona — who the agent is, tone, boundaries"
          onRefresh={onRefresh}
        />
      )
    case 'memories':
      return <HermesMemoriesTab key={refreshKey} configDir={detail.config_dir} />
    case 'hooks':
      return agentType === 'hermes'
        ? <HermesHooksViewer key={refreshKey} configYaml={hermesConfigYaml} configDir={detail.config_dir} onRefresh={onRefresh} />
        : <HooksEditor key={refreshKey} path={settingsPath} content={settingsRaw} onRefresh={onRefresh} />
    case 'agents-md':
      if (agentType === 'opencode' ) {
        return (
          <FileTextEditor
            key={refreshKey}
            path={claudeMdPath}
            content={opencodeAgentsMd}
            label="AGENTS.md"
            placeholder="# Custom agent instructions"
            onRefresh={onRefresh}
          />
        )
      }
      if (agentType === 'codex') {
        return <FileTextEditor key={refreshKey} path={claudeMdPath} content={codexAgentsMd} label="AGENTS.md" placeholder="# Custom agent instructions" onRefresh={onRefresh} />
      }
    case 'instructions':
      return <OpenCodeInstructionsTab key={refreshKey} configJsonc={opencodeJsonc} profilePath={profilePath} />
    case 'rules':
      return <RulesTab key={refreshKey} configDir={detail.config_dir} profileName={detail.meta.name} refreshKey={refreshKey} />
    case 'mcp':
      return (
        <McpTab
          key={refreshKey}
          profileName={detail.meta.name}
          profilePath={profilePath}
          mcpJson={claudeDotJson}
          libraryMcp={libraryMcpServers}
          onNavigateLibrary={onNavigateLibrary}
        />
      )
    case 'skills':
      return <SkillsTab key={refreshKey} profileName={detail.meta.name} configDir={detail.config_dir} refreshKey={refreshKey} />
    case 'storage':
      return (
        <StorageExplorer
          key={refreshKey}
          profilePath={profilePath}
          fileTree={fileTree}
          onRefresh={onRefresh}
        />
      )
    default:
      return <p className="text-sm text-muted-foreground p-4">Tab not implemented: {tab}</p>
  }
}
