/**
 * MCP Tab — shows MCP servers applied to this profile.
 * Reads dot-claude.json → mcpServers.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { readFile, patchJsonFile } from '@/api/files'

interface McpEntry {
  type: string
  command?: string
  args?: string[]
  url?: string
  env?: Record<string, string>
}

export function McpTab({ profileName, profilePath }: {
  profileName: string; profilePath: string
}) {
  const [servers, setServers] = useState<Record<string, McpEntry>>({})
  const [loading, setLoading] = useState(true)

  const mcpPath = `${profilePath}/dot-claude.json`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const raw = await readFile(mcpPath)
      const parsed = JSON.parse(raw || '{}')
      setServers(parsed.mcpServers ?? {})
    } catch { setServers({}) }
    finally { setLoading(false) }
  }, [mcpPath])

  useEffect(() => { void load() }, [load])

  const remove = useCallback(async (id: string) => {
    const next = { ...servers }
    delete next[id]
    await patchJsonFile(mcpPath, 'mcpServers', next)
    setServers(next)
  }, [mcpPath, servers])

  if (loading) return <Card><CardContent className="p-4 text-sm text-muted-foreground">Loading...</CardContent></Card>

  const entries = Object.entries(servers)

  return (
    <Card>
      <CardHeader><CardTitle>MCP Servers ({entries.length})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No MCP servers applied to this profile. Apply from Library or edit{' '}
            <code className="font-mono">dot-claude.json</code> in Storage tab.
          </p>
        ) : (
          entries.map(([id, cfg]) => (
            <div key={id} className="p-3 rounded-md bg-muted flex items-center justify-between">
              <div>
                <span className="text-sm font-mono font-semibold text-foreground">{id}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {cfg.type} {cfg.command ? `→ ${cfg.command}` : cfg.url ? `→ ${cfg.url}` : ''}
                </span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => remove(id)}>Remove</Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
