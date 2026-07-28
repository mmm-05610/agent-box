/**
 * Plugins Editor — toggle list of enabledPlugins, with metadata panel.
 *
 * Two data sources:
 *   1. settings.json → enabledPlugins : { "plugin-name": true|false }
 *   2. installed_plugins.json        : { "pluginName@marketplaceName": [{ version, installPath, installedAt, ... }] }
 *
 * Reads both, joins on plugin-name prefix of the installed_plugins key,
 * keeps the existing enable/disable toggle behaviour.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { patchJsonFile, readFile } from '@/api/files'

interface InstalledPluginMeta {
  version?: string
  marketplace?: string
  installPath?: string
  installedAt?: string
}

interface PluginRow {
  name: string
  enabled: boolean
  meta?: InstalledPluginMeta
}

interface InstalledPluginsFile {
  version?: number
  plugins?: Record<string, InstalledPluginMeta[]>
}

function parseEnabledPlugins(content: string): Record<string, boolean> {
  try {
    const parsed = JSON.parse(content)
    return parsed?.enabledPlugins ?? {}
  } catch {
    return {}
  }
}

function settingsDir(settingsPath: string): string {
  return settingsPath.replace(/\/settings\.json$/, '')
}

function formatInstalledAt(value?: string): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

export function PluginsEditor({ path, content, onRefresh }: {
  path: string; content: string; onRefresh: () => void
}) {
  const enabledMap = useMemo(() => parseEnabledPlugins(content), [content])

  const [installedMap, setInstalledMap] = useState<Record<string, InstalledPluginMeta[]>>({})
  const [metaLoading, setMetaLoading] = useState(true)
  const [metaError, setMetaError] = useState('')
  const [saving, setSaving] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  const installedPluginsPath = `${settingsDir(path)}/installed_plugins.json`

  useEffect(() => {
    let cancelled = false
    setMetaLoading(true)
    setMetaError('')
    void readFile(installedPluginsPath)
      .then((raw) => {
        if (cancelled) return
        const parsed: InstalledPluginsFile = JSON.parse(raw || '{}')
        setInstalledMap(parsed.plugins ?? {})
      })
      .catch(() => {
        // installed_plugins.json is optional — missing file just means no metadata
        if (!cancelled) {
          setInstalledMap({})
          setMetaError('')
        }
      })
      .finally(() => { if (!cancelled) setMetaLoading(false) })

    return () => { cancelled = true }
  }, [installedPluginsPath])

  const rows = useMemo<PluginRow[]>(() => {
    return Object.entries(enabledMap).map(([name, enabled]) => {
      const matchKey = Object.keys(installedMap).find((key) => key.startsWith(`${name}@`))
      const entry = matchKey ? installedMap[matchKey]?.[0] : undefined
      const marketplace = matchKey?.split('@').slice(1).join('@') || entry?.marketplace
      const meta: InstalledPluginMeta | undefined = entry
        ? { ...entry, marketplace: marketplace || entry.marketplace }
        : marketplace
          ? { marketplace }
          : undefined
      return { name, enabled, meta }
    }).sort((left, right) => left.name.localeCompare(right.name))
  }, [enabledMap, installedMap])

  const toggle = useCallback(async (name: string, enabled: boolean) => {
    setSaving(name)
    try {
      const next = { ...enabledMap, [name]: enabled }
      await patchJsonFile(path, 'enabledPlugins', next)
      onRefresh()
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to update plugin' })
    } finally {
      setSaving(null)
    }
  }, [path, enabledMap, onRefresh, toast])

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (metaLoading) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Loading...</CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plugins ({rows.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {metaError ? (
          <p className="text-sm text-destructive">Failed to load plugin metadata: {metaError}</p>
        ) : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No plugins installed. Use <code className="font-mono">/plugin install</code> in CC.
          </p>
        ) : (
          rows.map((row) => {
            const { name, enabled, meta } = row
            const isExpanded = expanded.has(name)
            const isSaving = saving === name
            return (
              <Card key={name} elevation="flat" className="ring-1 ring-border/60">
                <div className="flex items-start gap-3 p-4">
                  <div
                    className={`mt-1.5 flex h-2.5 w-2.5 shrink-0 rounded-full ${enabled ? 'bg-success' : 'bg-muted-foreground/40'}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-mono font-medium text-foreground">{name}</h4>
                      {meta?.version && <Badge variant="neutral">v{meta.version}</Badge>}
                      {meta?.marketplace && <Badge variant="primary">{meta.marketplace}</Badge>}
                      <span className={`text-xs ${enabled ? 'text-success' : 'text-muted-foreground'}`}>
                        {enabled ? 'enabled' : 'disabled'}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpanded(name)}
                    >
                      {isExpanded ? 'Hide details' : 'Details'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={isSaving}
                      onClick={() => toggle(name, !enabled)}
                    >
                      {isSaving ? '...' : enabled ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="space-y-3 border-t border-border/60 px-4 py-3 text-sm">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 font-medium text-foreground">Name</p>
                        <code className="break-all text-xs text-muted-foreground">{name}</code>
                      </div>
                      <div>
                        <p className="mb-1 font-medium text-foreground">Status</p>
                        <p className={`text-xs ${enabled ? 'text-success' : 'text-muted-foreground'}`}>
                          {enabled ? 'enabled' : 'disabled'}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 font-medium text-foreground">Version</p>
                        <code className="break-all text-xs text-muted-foreground">
                          {meta?.version ? `v${meta.version}` : '—'}
                        </code>
                      </div>
                      <div>
                        <p className="mb-1 font-medium text-foreground">Marketplace</p>
                        <code className="break-all text-xs text-muted-foreground">
                          {meta?.marketplace ?? '—'}
                        </code>
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-foreground">Install path</p>
                      {meta?.installPath ? (
                        <code className="break-all text-xs text-muted-foreground">{meta.installPath}</code>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          No install path recorded (plugin may be enabled manually in settings.json).
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-foreground">Installed at</p>
                      <p className="text-xs text-muted-foreground">
                        {meta?.installedAt ? formatInstalledAt(meta.installedAt) : '—'}
                      </p>
                    </div>
                  </div>
                )}
              </Card>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
