/**
 * Hooks Editor — structured hook builder.
 * Reads/writes settings.json → hooks key.
 */

import { useCallback, useMemo, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { Textarea } from '@/components/ui'
import { patchJsonFile } from '@/api/files'

export function HooksEditor({ path, content, onRefresh }: {
  path: string; content: string; onRefresh: () => void
}) {
  const parsed = useMemo(() => {
    try { return JSON.parse(content)?.hooks ?? {} } catch { return {} }
  }, [content])
  const [hooksJson, setHooksJson] = useState(JSON.stringify(parsed, null, 2))
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const parsed = JSON.parse(hooksJson)
      if (typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('must be object')
      await patchJsonFile(path, 'hooks', parsed)
      onRefresh()
    } catch {
      // invalid JSON — don't save
    } finally {
      setSaving(false)
    }
  }, [path, hooksJson, onRefresh])

  // Count hooks for display
  const hookCount = useMemo(() => {
    try {
      const p = JSON.parse(hooksJson)
      return Object.values(p as Record<string, unknown>)
        .filter(Array.isArray)
        .reduce((sum, arr) => sum + (arr as unknown[]).length, 0)
    } catch { return 0 }
  }, [hooksJson])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hooks ({hookCount} configured)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Each top-level key is a CC event name (e.g. <code>PostToolUse</code>, <code>PreToolUse</code>,
          {' '}<code>Notification</code>). Values are arrays of matcher objects.
          Edit below or switch to Storage → settings.json for raw editing.
        </p>
        <Textarea
          value={hooksJson}
          onChange={(e) => setHooksJson(e.target.value)}
          rows={16}
          className="text-sm font-mono"
          placeholder={`{\n  "PostToolUse": [\n    {\n      "matcher": "Edit|Write",\n      "hooks": [\n        {"type": "command", "command": "npx biome format --write $FILE_PATH"}\n      ]\n    }\n  ]\n}`}
        />
        <Button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Hooks'}
        </Button>
      </CardContent>
    </Card>
  )
}
