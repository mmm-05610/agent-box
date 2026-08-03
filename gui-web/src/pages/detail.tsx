/**
 * Profile Detail Page — registry-driven tab host.
 *
 * Resource tabs are derived from the backend registry's `resources`
 * keys (the support declaration) cross-referenced with the frontend
 * RESOURCES registry — the page shell knows no concrete resource.
 *
 * Non-resource tabs (Meta / Storage) and the profile header stay here.
 * Every resource (including agent-specific ones) is a self-fetching
 * domain List rendered with the profile name + agent type.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Badge, Tabs } from '@/components/ui'
import { Loading } from '@/components/feedback'
import type { AgentType, ResourceConfig } from '@/api'
import { fetchProfileDetail } from '@/api'
import { findFiles } from '@/api/files'
import { RESOURCES, type ResourceDef } from '@/domains'
import { useAgentConfigs, useAgentTypeColor } from '@/hooks'
import { MetaEditor } from './detail/MetaEditor'
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
    prompt: string
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
  skills: 'tab.skill',
  hooks: 'tab.hook',
}

/**
 * Pure tab resolution: backend registry `resources` keys → RESOURCES
 * lookup. Presence in the backend dict IS the support declaration, so
 * there is no frontend feature gate. Kept outside the component so the
 * per-agent tab sets are directly testable.
 *
 * The prompt tab label is the prompt *file* name from the backend registry
 * (`resources.prompt.file` — e.g. CLAUDE.md / AGENTS.md / SOUL.md), not a
 * hardcoded per-agent map. `t()` renders it verbatim via missing-key
 * passthrough, same as before.
 */
export function resolveResourceTabs(
  resourceKeys: string[],
  registry: Record<string, ResourceDef>,
  agentResources?: Record<string, ResourceConfig>,
): Array<{ key: string; label: string }> {
  const out: Array<{ key: string; label: string }> = []
  for (const key of resourceKeys) {
    const res = registry[key]
    if (!res) continue
    out.push({
      key,
      label: key === 'prompt'
        ? ((agentResources?.prompt as ResourceConfig | undefined)?.file as string | undefined) ?? res.labelKey
        : (RESOURCE_LABELS[key] ?? res.labelKey),
    })
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

  // Storage tree (for the Storage tab) — resource tabs self-fetch their own files.
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

        const tree = await findFiles(`${d.path}`).catch(() => [] as string[])
        if (cancelled) return
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

  // Registry-driven hooks — MUST run before the loading/error early returns,
  // or React #310 fires (hook count changes between renders).
  const { agentConfigs } = useAgentConfigs()
  const agentTypeColor = useAgentTypeColor()

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
  // Loading-order fallback: no resource tabs until the registry arrives.
  const resourceConfig = agentConfigs?.[agentType]?.resources
  const resourceKeys = resourceConfig ? Object.keys(resourceConfig) : []
  const badgeVariant = agentTypeColor(agentType)

  // ── Tab build: meta + registry/agent-specific resources + storage ──
  const resourceRegistry = RESOURCES as Record<string, ResourceDef>
  const tabs: DetailTab[] = [
    { key: 'meta', label: t('tab.meta'), render: () => <MetaEditor key={refreshKey} detail={detail} onRefresh={triggerRefresh} /> },
  ]

  for (const { key, label } of resolveResourceTabs(resourceKeys, resourceRegistry, resourceConfig)) {
    const res = resourceRegistry[key]
    if (res) {
      tabs.push({
        key,
        label: t(label),
        render: () => <res.List profileName={meta.name} agentType={agentType} />,
      })
      continue
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
