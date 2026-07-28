/**
 * Hermes Memories Tab — MEMORY.md + USER.md editors.
 *
 * Two independently-saved textareas. Files live under
 * `${configDir}/memories/` and are created on save if missing.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { readFile, saveFile } from '@/api/files'

interface MemoryFile {
  path: string
  label: string
  description: string
}

const FILES: MemoryFile[] = [
  {
    path: '', // resolved at runtime
    label: 'MEMORY.md',
    description: 'Agent-side memory — notes the agent persists across sessions.',
  },
  {
    path: '',
    label: 'USER.md',
    description: 'User profile — facts about you that should persist across sessions.',
  },
]

export function HermesMemoriesTab({ configDir }: { configDir: string }) {
  const memoriesDir = `${configDir.replace(/\/+$/, '')}/memories`
  const fileEntries: MemoryFile[] = FILES.map((f) => ({ ...f, path: `${memoriesDir}/${f.label}` }))

  const [texts, setTexts] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    void Promise.all(fileEntries.map(async (f) => {
      try {
        const content = await readFile(f.path)
        return [f.label, content] as const
      } catch {
        return [f.label, ''] as const
      }
    })).then((entries) => {
      if (cancelled) return
      const loaded: Record<string, string> = {}
      for (const [label, content] of entries) loaded[label] = content
      setTexts(loaded)
      setOriginal(loaded)
    }).finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memoriesDir])

  const handleSave = useCallback(async (file: MemoryFile) => {
    const next = texts[file.label] ?? ''
    setSaving(file.label)
    try {
      await saveFile(file.path, next)
      setOriginal((current) => ({ ...current, [file.label]: next }))
      toast({ type: 'success', message: `${file.label} saved` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : `Failed to save ${file.label}` })
    } finally {
      setSaving(null)
    }
  }, [texts, toast])

  const setText = (label: string, value: string) => {
    setTexts((current) => ({ ...current, [label]: value }))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Memories</CardTitle>
        <p className="text-sm text-muted-foreground">
          Files in <code className="font-mono">{memoriesDir}</code>. Save creates the file if it doesn&apos;t exist.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          fileEntries.map((file) => {
            const text = texts[file.label] ?? ''
            const orig = original[file.label] ?? ''
            const isSaving = saving === file.label
            const isDirty = text !== orig
            return (
              <div key={file.label} className="rounded-lg bg-card ring-1 ring-border/60">
                <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-mono text-sm font-medium text-foreground">{file.label}</h4>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{file.description}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSave(file)}
                    disabled={isSaving || !isDirty}
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </Button>
                </div>
                <div className="px-4 py-3">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(file.label, e.target.value)}
                    rows={10}
                    className="text-sm font-mono"
                    placeholder={`# ${file.label.replace('.md', '')}\n\nNotes stored across sessions...`}
                  />
                </div>
              </div>
            )
          })
        )}
      </CardContent>
    </Card>
  )
}
