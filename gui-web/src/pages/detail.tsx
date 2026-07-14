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
import { readFile, listDirTree } from '@/api/files'
import type { FlatFile } from './detail/storage/buildTreeFromFlatList'
import { flattenDirTree } from './detail/storage/flattenDirTree'
import { tabsFor, type ProfileDetailLike, type TabSpec } from './detail/schema'

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
  const [fileTree, setFileTree] = useState<FlatFile[]>([])

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
        const [s, md, cj, treeNode] = await Promise.all([
          readFile(`${configDir}/settings.json`).catch(() => '{}'),
          readFile(`${configDir}/CLAUDE.md`).catch(() => ''),
          readFile(`${d.path}/dot-claude.json`).catch(() => '{}'),
          // I-1: replace findFiles (eager, no depth bound) with the
          // depth-bounded lazy tree the spec calls for. maxDepth=4 keeps
          // typical profiles readable while preserving hidden-file handling.
          listDirTree(d.path, 4).catch(() => null),
        ] as const)
        if (cancelled) return
        setSettingsRaw(s)
        setClaudeMdRaw(md)
        setClaudeDotJson(cj)
        setFileTree(flattenDirTree(treeNode))
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
  const tabSpecs: TabSpec[] = tabsFor(detail as unknown as ProfileDetailLike)
  const tabs = tabSpecs.map((t) => ({ key: t.key, label: t.label }))
  const activeTabSpec = tabSpecs.find((t) => t.key === activeTab)
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

      {activeTabSpec ? (
        <TabContent
          spec={activeTabSpec}
          detail={detail}
          settingsPath={settingsPath}
          settingsRaw={settingsRaw}
          claudeMdPath={claudeMdPath}
          claudeMdRaw={claudeMdRaw}
          claudeDotJson={claudeDotJson}
          fileTree={fileTree}
          onRefresh={triggerRefresh}
        />
      ) : (
        <p className="text-sm text-muted-foreground p-4">Tab not implemented: {activeTab}</p>
      )}
    </div>
  )
}

// ── Tab Content Router ─────────────────────────────────────────────────

function TabContent({
  spec, detail, settingsPath, settingsRaw, claudeMdPath, claudeMdRaw,
  claudeDotJson, fileTree, onRefresh,
}: {
  spec: TabSpec
  detail: ProfileDetail
  settingsPath: string
  settingsRaw: string
  claudeMdPath: string
  claudeMdRaw: string
  claudeDotJson: string
  fileTree: FlatFile[]
  onRefresh: () => void
}) {
  const Component = spec.Component
  const props = spec.propsFor({
    ...detail,
    settingsPath,
    settingsRaw,
    claudeMdPath,
    claudeMdRaw,
    claudeDotJson,
    fileTree,
    onRefresh,
  } as unknown as ProfileDetailLike)

  return <Component {...props as never} />
}
