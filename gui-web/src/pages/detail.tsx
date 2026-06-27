/**
 * Profile Detail Page — View and edit a single profile's configuration
 *
 * Tabs per agent type:
 * - claude: meta, settings, claude_md, hooks, plugins, storage
 * - codex: meta, config, auth, rules, skills, storage
 * - hermes: meta, config, env, persona, skills, storage
 * - opencode: meta, config, auth, storage
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent, Badge, Tabs } from '@/components/ui'
import { Loading } from '@/components/feedback'
import type { AgentType } from '@/api'
import { AGENT_TYPE_COLORS, fetchProfileDetail } from '@/api'
import { readFile, listDir } from '@/api/files'

// ── Types ──────────────────────────────────────────────────────────────

interface ProfileDetail {
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

type TabKey = string

interface TabDef {
  key: TabKey
  label: string
  description: string
}

// ── Tab definitions per agent type ─────────────────────────────────────

const AGENT_TABS: Record<string, TabDef[]> = {
  claude: [
    { key: 'meta', label: 'Meta', description: 'Profile info' },
    { key: 'settings', label: 'Settings', description: 'settings.json' },
    { key: 'claude_md', label: 'CLAUDE.md', description: 'System prompt' },
    { key: 'hooks', label: 'Hooks', description: 'Pre/Post tool hooks' },
    { key: 'plugins', label: 'Plugins', description: 'Installed plugins' },
    { key: 'storage', label: 'Storage', description: 'Files & size' },
  ],
  codex: [
    { key: 'meta', label: 'Meta', description: 'Profile info' },
    { key: 'config', label: 'Config', description: 'config.toml' },
    { key: 'auth', label: 'Auth', description: 'API keys' },
    { key: 'rules', label: 'Rules', description: 'Custom rules' },
    { key: 'skills', label: 'Skills', description: 'Installed skills' },
    { key: 'storage', label: 'Storage', description: 'Files & size' },
  ],
  hermes: [
    { key: 'meta', label: 'Meta', description: 'Profile info' },
    { key: 'config', label: 'Config', description: 'config.yaml' },
    { key: 'env', label: 'Env', description: 'Environment vars' },
    { key: 'persona', label: 'Persona', description: 'SOUL.md' },
    { key: 'skills', label: 'Skills', description: 'Installed skills' },
    { key: 'storage', label: 'Storage', description: 'Files & size' },
  ],
  opencode: [
    { key: 'meta', label: 'Meta', description: 'Profile info' },
    { key: 'config', label: 'Config', description: 'opencode.jsonc' },
    { key: 'auth', label: 'Auth', description: 'API keys' },
    { key: 'storage', label: 'Storage', description: 'Files & size' },
  ],
}

// Config file per agent type
const CONFIG_FILES: Record<string, string> = {
  claude: 'settings.json',
  codex: 'config.toml',
  hermes: 'config.yaml',
  opencode: 'opencode.jsonc',
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

  // Tab state
  const [activeTab, setActiveTab] = useState<TabKey>('meta')

  // File contents
  const [settings, setSettings] = useState<string>('')
  const [claudeMd, setClaudeMd] = useState<string>('')
  const [hooks, setHooks] = useState<Record<string, unknown>>({})
  const [plugins, setPlugins] = useState<Record<string, boolean>>({})
  const [storage, setStorage] = useState<string>('')

  // Load profile detail
  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const data = await fetchProfileDetail(profileName)
        if (!data) {
          setError('Profile not found')
          return
        }
        setDetail(data as unknown as ProfileDetail)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [profileName])

  // Load file contents when detail is available
  useEffect(() => {
    if (!detail?.config_dir) return

    async function loadFiles() {
      const configDir = detail!.config_dir
      const agentType = detail!.meta.agent_type

      // Load config file
      const configFile = CONFIG_FILES[agentType] ?? 'settings.json'
      const settingsContent = await readFile(`${configDir}/${configFile}`).catch(() => '')
      setSettings(settingsContent)

      // Load CLAUDE.md or persona
      if (agentType === 'claude') {
        const claudeMdContent = await readFile(`${configDir}/CLAUDE.md`).catch(() => '')
        setClaudeMd(claudeMdContent)
      } else if (agentType === 'hermes') {
        const personaContent = await readFile(`${configDir}/SOUL.md`).catch(() => '')
        setClaudeMd(personaContent)
      }

      // Load hooks and plugins from settings.json (claude only)
      if (agentType === 'claude' && settingsContent) {
        try {
          const settingsJson = JSON.parse(settingsContent)
          setHooks(settingsJson.hooks ?? {})
          setPlugins(settingsJson.enabledPlugins ?? {})
        } catch {
          setHooks({})
          setPlugins({})
        }
      }

      // Load storage info
      const storageContent = await listDir(`${configDir}`).catch(() => '')
      setStorage(storageContent)
    }
    void loadFiles()
  }, [detail])

  const handleTabClick = useCallback((key: TabKey) => {
    setActiveTab(key)
  }, [])

  if (loading) {
    return (
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          ← Back
        </Button>
        <Loading variant="skeleton" rows={6} />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="p-8">
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          ← Back
        </Button>
        <div className="flex flex-col items-center gap-3 py-16 text-destructive">
          <p>{error ?? 'Profile not found'}</p>
          <Button variant="ghost" size="sm" onClick={onBack}>
            Go back
          </Button>
        </div>
      </div>
    )
  }

  const { meta } = detail
  const agentType = meta.agent_type
  const tabs = AGENT_TABS[agentType] ?? AGENT_TABS['claude']!
  const badgeVariant = AGENT_TYPE_COLORS[agentType as AgentType] ?? 'neutral'

  return (
    <div className="mx-auto w-full max-w-5xl px-8 py-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Back to Profiles
        </Button>
        <div className="flex-1">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            Profile
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
            {meta.name}
          </h1>
        </div>
        <Badge variant={badgeVariant as 'neutral' | 'primary' | 'success' | 'warning' | 'destructive' | 'info'}>
          {agentType}
        </Badge>
      </div>

      {/* Tab bar */}
      <Tabs
        tabs={tabs.map((tab) => ({ key: tab.key, label: tab.label }))}
        active={activeTab}
        onChange={(key) => handleTabClick(key)}
        className="mb-6"
      />

      {/* Tab content */}
      <TabContent
        tab={activeTab}
        detail={detail}
        settings={settings}
        claudeMd={claudeMd}
        hooks={hooks}
        plugins={plugins}
        storage={storage}
      />
    </div>
  )
}

// ── Tab Content ────────────────────────────────────────────────────────

function TabContent({
  tab,
  detail,
  settings,
  claudeMd,
  hooks,
  plugins,
  storage,
}: {
  tab: TabKey
  detail: ProfileDetail
  settings: string
  claudeMd: string
  hooks: Record<string, unknown>
  plugins: Record<string, boolean>
  storage: string
}) {
  const { meta } = detail

  switch (tab) {
    case 'meta':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Profile Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Name</dt>
                <dd className="text-sm text-foreground font-mono">{meta.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground mb-1">Agent Type</dt>
                <dd className="text-sm text-foreground">{meta.agent_type}</dd>
              </div>
              {meta.display_name && (
                <div>
                  <dt className="text-xs text-muted-foreground mb-1">Display Name</dt>
                  <dd className="text-sm text-foreground">{meta.display_name}</dd>
                </div>
              )}
              {meta.description && (
                <div>
                  <dt className="text-xs text-muted-foreground mb-1">Description</dt>
                  <dd className="text-sm text-foreground">{meta.description}</dd>
                </div>
              )}
              {meta.provider && (
                <div>
                  <dt className="text-xs text-muted-foreground mb-1">Provider</dt>
                  <dd className="text-sm text-foreground font-mono">{meta.provider}</dd>
                </div>
              )}
              {meta.preset && (
                <div>
                  <dt className="text-xs text-muted-foreground mb-1">Preset</dt>
                  <dd className="text-sm text-foreground">{meta.preset}</dd>
                </div>
              )}
            </dl>
            {detail.path && (
              <dl className="mt-4 space-y-2">
                <div>
                  <dt className="text-xs text-muted-foreground mb-1">Profile Directory</dt>
                  <dd className="text-sm text-foreground font-mono break-all">{detail.path}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground mb-1">Config Directory</dt>
                  <dd className="text-sm text-foreground font-mono break-all">{detail.config_dir}</dd>
                </div>
              </dl>
            )}
          </CardContent>
        </Card>
      )

    case 'settings':
    case 'config':
      return (
        <Card>
          <CardHeader>
            <CardTitle>{CONFIG_FILES[meta.agent_type] ?? 'Config'}</CardTitle>
          </CardHeader>
          <CardContent>
            {settings ? (
              <pre className="text-sm text-foreground font-mono whitespace-pre-wrap bg-muted p-4 rounded-md overflow-auto max-h-[600px]">
                {settings}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No config file found</p>
            )}
          </CardContent>
        </Card>
      )

    case 'claude_md':
    case 'persona':
      return (
        <Card>
          <CardHeader>
            <CardTitle>{meta.agent_type === 'hermes' ? 'SOUL.md' : 'CLAUDE.md'}</CardTitle>
          </CardHeader>
          <CardContent>
            {claudeMd ? (
              <pre className="text-sm text-foreground font-mono whitespace-pre-wrap bg-muted p-4 rounded-md overflow-auto max-h-[600px]">
                {claudeMd}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">No {meta.agent_type === 'hermes' ? 'SOUL.md' : 'CLAUDE.md'} found</p>
            )}
          </CardContent>
        </Card>
      )

    case 'hooks':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Hooks</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(hooks).length > 0 ? (
              <div className="space-y-4">
                {Object.entries(hooks).map(([event, hookList]) => (
                  <div key={event}>
                    <h4 className="text-sm font-semibold text-foreground mb-2">{event}</h4>
                    <div className="space-y-2">
                      {(hookList as Array<{matcher: string; hooks: Array<{type: string; command: string}>}>).map((hook, i) => (
                        <div key={i} className="p-3 rounded-md bg-muted">
                          <p className="text-xs text-muted-foreground mb-1">
                            Matcher: <span className="font-mono">{hook.matcher}</span>
                          </p>
                          {hook.hooks.map((h, j) => (
                            <pre key={j} className="text-sm font-mono text-foreground whitespace-pre-wrap break-all">
                              {h.command}
                            </pre>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No hooks configured</p>
            )}
          </CardContent>
        </Card>
      )

    case 'plugins':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Plugins</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(plugins).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(plugins).map(([name, enabled]) => (
                  <div key={name} className="flex items-center gap-3 p-2 rounded-md bg-muted">
                    <span className={enabled ? 'text-success' : 'text-muted-foreground'}>
                      {enabled ? '✓' : '✗'}
                    </span>
                    <span className="text-sm font-mono text-foreground">{name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No plugins installed</p>
            )}
          </CardContent>
        </Card>
      )

    case 'skills':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Skills</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">No skills installed</p>
          </CardContent>
        </Card>
      )

    case 'env':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Environment Variables</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Environment variables from settings.json</p>
          </CardContent>
        </Card>
      )

    case 'auth':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Authentication</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">API keys and authentication config</p>
          </CardContent>
        </Card>
      )

    case 'rules':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Rules</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Custom rules configuration</p>
          </CardContent>
        </Card>
      )

    case 'storage':
      return (
        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground font-mono break-all">{detail.path}</p>
            <p className="text-sm text-muted-foreground mt-2">Config directory: {detail.config_dir}</p>
          </CardContent>
        </Card>
      )

    default:
      return (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">Tab not implemented: {tab}</p>
          </CardContent>
        </Card>
      )
  }
}
