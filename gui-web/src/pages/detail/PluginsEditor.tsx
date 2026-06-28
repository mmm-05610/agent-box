/**
 * Plugins Editor — toggle list of enabledPlugins.
 * Reads/writes settings.json → enabledPlugins key.
 */

import { useCallback, useMemo, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { patchJsonFile } from '@/api/files'

export function PluginsEditor({ path, content, onRefresh }: {
  path: string; content: string; onRefresh: () => void
}) {
  const plugins = useMemo<Record<string, boolean>>(() => {
    try { return JSON.parse(content)?.enabledPlugins ?? {} } catch { return {} }
  }, [content])
  const [saving, setSaving] = useState<string | null>(null)

  const toggle = useCallback(async (name: string, enabled: boolean) => {
    setSaving(name)
    try {
      const next = { ...plugins, [name]: enabled }
      await patchJsonFile(path, 'enabledPlugins', next)
      onRefresh()
    } finally {
      setSaving(null)
    }
  }, [path, plugins, onRefresh])

  const entries = Object.entries(plugins)

  return (
    <Card>
      <CardHeader><CardTitle>Plugins ({entries.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No plugins installed. Use <code className="font-mono">/plugin install</code> in CC.
          </p>
        ) : (
          entries.map(([name, enabled]) => (
            <div key={name} className="flex items-center justify-between p-3 rounded-md bg-muted">
              <div>
                <span className="text-sm font-mono text-foreground">{name}</span>
                <span className={`ml-2 text-xs ${enabled ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {enabled ? 'enabled' : 'disabled'}
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={saving === name}
                onClick={() => toggle(name, !enabled)}
              >
                {saving === name ? '...' : enabled ? 'Disable' : 'Enable'}
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
