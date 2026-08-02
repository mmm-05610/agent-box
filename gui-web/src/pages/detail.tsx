/**
 * Profile Detail Page — registry-driven tab host (Stage 5).
 *
 * Resource tabs are built from AGENT_CONFIG[agentType].tabs → RESOURCES
 * lookup, so adding a resource = registering in domains/ + one line in
 * config/agentConfig.ts — the page shell knows no concrete resource.
 *
 * Non-resource tabs (Meta / Storage) and the profile header stay here.
 * Agent-specific tabs (permissions/plugins/rules/memories/instructions) and
 * Hermes' config.yaml hooks viewer still render from pages/detail/
 * components until their domains land (TODO stage 6/7).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Badge, Tabs } from '@/components/ui'
import { Loading } from '@/components/feedback'
import type { AgentFeature, AgentType } from '@/api'
import { AGENT_TYPE_COLORS, AGENT_TYPE_CONFIGS, fetchProfileDetail } from '@/api'
import { findFiles, readFile } from '@/api/files'
import { RESOURCES, type ResourceDef } from '@/domains'
import { AGENT_CONFIG } from '@/config'
import { MetaEditor } from './detail/MetaEditor'
import { PermissionsEditor } from './detail/PermissionsEditor'
import { PluginsEditor } from './detail/PluginsEditor'
import { RulesTab } from './detail/RulesTab'
import { HermesMemoriesTab } from './detail/HermesMemoriesTab'
import { HermesHooksViewer } from './detail/HermesHooksViewer'
import { OpenCodeInstructionsTab } from './detail/OpenCodeInstructionsTab'
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

interface DetailTab {
  key: string
  label: string
  render: () => ReactNode
}

/** Resource tab label keys (translated at render time in the page). */
const RESOURCE_LABELS: Record<string, string> = {
  provider: 'tab.provider',
  mcp: 'tab.mcp',
  skill: 'tab.skill',
  hook: 'tab.hook',
}

/** The prompt resource edits the per-agent prompt file, which the old
 *  detail page exposed under per-agent tab labels. Keep those labels
 *  (filenames — identical in both language packs). */
const PROMPT_TAB_LABELS: Record<AgentType, string> = {
  claude: 'tab.prompt.claude',
  codex: 'tab.prompt.codex',
  hermes: 'tab.prompt.hermes',
  opencode: 'tab.prompt.opencode',
}

interface AgentTabContext {
  refreshKey: number
  settingsPath: string
  settingsRaw: string
  configDir: string
  profileName: string
  opencodeJsonc: string
  profilePath: string
  onRefresh: () => void
}

/**
 * Agent-specific tabs — still rendered from the old pages/detail components.
 * TODO(stage 6/7): migrate each into domains/<resource>/ and drop this map.
 */
const AGENT_SPECIFIC_TABS: Record<string, { label: string; feature: AgentFeature; render: (ctx: AgentTabContext) => ReactNode }> = {
  permissions: {
    label: 'tab.permissions',
    feature: 'permissions',
    render: (c) => <PermissionsEditor key={c.refreshKey} path={c.settingsPath} content={c.settingsRaw} onRefresh={c.onRefresh} />,
  },
  plugins: {
    label: 'tab.plugins',
    feature: 'plugins',
    render: (c) => <PluginsEditor key={c.refreshKey} path={c.settingsPath} content={c.settingsRaw} onRefresh={c.onRefresh} />,
  },
  rules: {
    label: 'tab.rules',
    feature: 'rules',
    render: (c) => <RulesTab key={c.refreshKey} configDir={c.configDir} profileName={c.profileName} refreshKey={c.refreshKey} />,
  },
  memories: {
    label: 'tab.memories',
    feature: 'memories',
    render: (c) => <HermesMemoriesTab key={c.refreshKey} configDir={c.configDir} />,
  },
  instructions: {
    label: 'tab.instructions',
    feature: 'instructions',
    render: (c) => <OpenCodeInstructionsTab key={c.refreshKey} configJsonc={c.opencodeJsonc} profilePath={c.profilePath} />,
  },
}

/**
 * Pure tab resolution: AGENT_CONFIG[agentType].tabs → registry resources
 * (RESOURCES) + not-yet-migrated agent-specific fallbacks. Kept outside the
 * component so the per-agent tab sets are directly testable.
 */
export function resolveResourceTabs(
  agentType: AgentType,
  tabKeys: string[],
  registry: Record<string, ResourceDef>,
  features: AgentFeature[],
): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = []
  for (const key of tabKeys) {
    const res = registry[key]
    if (res) {
      out.push({
        key,
        label: key === 'prompt'
          ? (PROMPT_TAB_LABELS[agentType] ?? res.labelKey)
          : (RESOURCE_LABELS[key] ?? res.labelKey),
      })
      continue
    }
    const agentTab = AGENT_SPECIFIC_TABS[key]
    if (agentTab) {
      // Keep the old feature gate so a profile whose agent config lacks the
      // feature doesn't get a tab for it.
      if (agentTab.feature && !features.includes(agentTab.feature)) continue
      out.push({ key, label: agentTab.label })
    }
  }
  return out
}

// ── Component ──────────────────────────────────────────────────────────

interface ProfileDetailPageProps {
  profileName: string
  onBack: () => void
  /** Optional: navigate to the Library page (wired from App if available). */
  onNavigateLibrary?: () => void
}

export function ProfileDetailPage({ profileName, onBack }: ProfileDetailPageProps) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<ProfileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<TabKey>('meta')

  // Loaded file contents (settings.json / opencode.jsonc / config.yaml …)
  const [configFileContents, setConfigFileContents] = useState<Record<string, string>>({})
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
        if (!data) { setError(t('detail.profileNotFound')); return }
        const d = data as unknown as ProfileDetail
        setDetail(d)

        const agentTypeLocal = d.meta.agent_type as AgentType
        const agentTypeConfig = AGENT_TYPE_CONFIGS[agentTypeLocal] ?? AGENT_TYPE_CONFIGS.claude
        const configFiles = await Promise.all(
          agentTypeConfig.config_files.map(async (filename) => [
            filename,
            await readFile(`${d.config_dir}/${filename}`).catch(() => filename === 'settings.json' ? '{}' : ''),
          ] as const),
        )
        const tree = await findFiles(`${d.path}`).catch(() => [] as string[])
        if (cancelled) return
        setConfigFileContents(Object.fromEntries(configFiles))
        setFileTree(tree)
      } catch (e: unknown) {
        if (cancelled) return
        setError(e instanceof Error ? e.message : t('detail.failedToLoad'))
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
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">← {t('common.back')}</Button>
        <Loading variant="skeleton" rows={6} />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">← {t('common.back')}</Button>
        <div className="flex flex-col items-center gap-3 py-16 text-destructive">
          <p>{error ?? t('detail.profileNotFound')}</p>
          <Button variant="ghost" size="sm" onClick={onBack}>{t('detail.goBack')}</Button>
        </div>
      </div>
    )
  }

  const { meta } = detail
  const agentType = meta.agent_type as AgentType
  const agentConfig = AGENT_TYPE_CONFIGS[agentType] ?? AGENT_TYPE_CONFIGS.claude
  const agentTabs = AGENT_CONFIG[agentType] ?? AGENT_CONFIG.claude
  const badgeVariant = AGENT_TYPE_COLORS[agentType] ?? 'neutral'
  const configDir = detail.config_dir
  const settingsPath = `${configDir}/settings.json`
  const getConfigFileContent = (filename: string) => (
    configFileContents[filename] ?? (filename === 'settings.json' ? '{}' : '')
  )
  const settingsRaw = getConfigFileContent('settings.json')
  const opencodeJsonc = getConfigFileContent('opencode.jsonc')
  const hermesConfigYaml = getConfigFileContent('config.yaml')

  const agentTabContext: AgentTabContext = {
    refreshKey,
    settingsPath,
    settingsRaw,
    configDir,
    profileName: meta.name,
    opencodeJsonc,
    profilePath: detail.path,
    onRefresh: triggerRefresh,
  }

  // ── Tab build: meta + registry/agent-specific resources + storage ──
  const resourceRegistry = RESOURCES as Record<string, ResourceDef>
  const tabs: DetailTab[] = [
    { key: 'meta', label: t('tab.meta'), render: () => <MetaEditor key={refreshKey} detail={detail} onRefresh={triggerRefresh} /> },
  ]

  for (const { key, label } of resolveResourceTabs(agentType, agentTabs.tabs, resourceRegistry, agentConfig.features)) {
    const res = resourceRegistry[key]
    if (res) {
      // Hermes stores hooks in config.yaml, not settings.json — the registry
      // HookList is settings.json-based, so keep the old read-only viewer.
      // TODO(stage 6/7): migrate Hermes hooks into the hooks domain.
      if (key === 'hook' && agentType === 'hermes') {
        tabs.push({
          key,
          label: t(label),
          render: () => (
            <HermesHooksViewer
              key={refreshKey}
              configYaml={hermesConfigYaml}
              configDir={configDir}
              onRefresh={triggerRefresh}
            />
          ),
        })
        continue
      }
      tabs.push({
        key,
        label: t(label),
        render: () => <res.List profileName={meta.name} agentType={agentType} />,
      })
      continue
    }

    const agentTab = AGENT_SPECIFIC_TABS[key]
    if (agentTab) {
      tabs.push({ key, label: t(label), render: () => agentTab.render(agentTabContext) })
    }
  }

  tabs.push({
    key: 'storage',
    label: t('tab.storage'),
    render: () => <StorageExplorer key={refreshKey} profilePath={detail.path} fileTree={fileTree} onRefresh={triggerRefresh} />,
  })

  const activeTabDef = tabs.find((t) => t.key === activeTab)

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>← {t('detail.backToProfiles')}</Button>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{t('detail.profile')}</p>
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

      {activeTabDef
        ? activeTabDef.render()
        : <p className="text-sm text-muted-foreground p-4">{t('detail.tabNotImplemented', { tab: activeTab })}</p>}
    </div>
  )
}
