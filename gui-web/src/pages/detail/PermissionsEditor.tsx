/**
 * Permissions Editor — structured allow/deny rule editor.
 * Reads/writes settings.json → permissions key.
 */

import { useCallback, useMemo, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent, Input } from '@/components/ui'
import { patchJsonFile } from '@/api/files'

type RuleSet = Record<'allow' | 'deny' | 'ask', string[]>

interface Permissions {
  allow?: string[]
  deny?: string[]
  ask?: string[]
  defaultMode?: string
}

function parse(raw: string): Permissions {
  try { return JSON.parse(raw)?.permissions ?? {} } catch { return {} }
}

export function PermissionsEditor({ path, content, onRefresh }: {
  path: string; content: string; onRefresh: () => void
}) {
  const parsed = useMemo(() => parse(content), [content])
  const [rules, setRules] = useState<string>(
    [...(parsed.allow ?? []).map((r) => `allow: ${r}`),
     ...(parsed.deny ?? []).map((r) => `deny: ${r}`),
     ...(parsed.ask ?? []).map((r) => `ask: ${r}`)].join('\n'),
  )
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const allow: string[] = []
      const deny: string[] = []
      const ask: string[] = []
      for (const line of rules.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        const match = trimmed.match(/^(allow|deny|ask):\s*(.+)$/i)
        if (match) {
          const type = match[1].toLowerCase()
          const pattern = match[2].trim()
          if (type === 'allow') allow.push(pattern)
          else if (type === 'deny') deny.push(pattern)
          else ask.push(pattern)
        }
      }
      await patchJsonFile(path, 'permissions', { allow, deny, ask, defaultMode: parsed.defaultMode ?? 'default' })
      onRefresh()
    } finally {
      setSaving(false)
    }
  }, [path, rules, parsed.defaultMode, onRefresh])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Permissions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          One rule per line: <code className="font-mono">allow: Bash(npm *)</code> or{' '}
          <code className="font-mono">deny: Read(./.env)</code>
        </p>
        <textarea
          value={rules}
          onChange={(e) => setRules(e.target.value)}
          rows={12}
          className="w-full rounded-md border bg-muted p-3 text-sm font-mono text-foreground"
          placeholder="allow: Bash(npm run *)\ndeny: Read(./.env)"
        />
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Permissions'}
        </Button>
      </CardContent>
    </Card>
  )
}
