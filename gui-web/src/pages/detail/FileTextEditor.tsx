/**
 * File Text Editor — generic textarea + save for any file.
 * Used for CLAUDE.md / SOUL.md / etc.
 */

import { useCallback, useState } from 'react'
import { Button, Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { saveFile } from '@/api/files'

export function FileTextEditor({ path, content, label, placeholder, onRefresh }: {
  path: string
  content: string
  label: string
  placeholder?: string
  onRefresh: () => void
}) {
  const [text, setText] = useState(content)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await saveFile(path, text)
      onRefresh()
      toast({ type: 'success', message: `${label} saved` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save file' })
    } finally {
      setSaving(false)
    }
  }, [path, text, label, onRefresh, toast])

  const isDirty = text !== content

  return (
    <Card>
      <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={18}
          className="text-sm font-mono"
          placeholder={placeholder ?? ''}
        />
        <Button onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? 'Saving...' : `Save ${label}`}
        </Button>
      </CardContent>
    </Card>
  )
}
