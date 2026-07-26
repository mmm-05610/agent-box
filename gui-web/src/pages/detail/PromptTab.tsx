/**
 * Prompt Tab — Apply from Library (ACS prompts) + Current content editor.
 * Replaces the old FileTextEditor for CLAUDE.md / SOUL.md tabs.
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { saveFile } from '@/api/files'
import { call } from '@/lib/bridge'

interface LibraryPrompt {
  id: string
  name: string
  content: string
  description: string
}

interface PromptTabProps {
  configPath: string
  content: string
  agentType: string
  label: string
  placeholder: string
  onRefresh: () => void
}

export function PromptTab({ configPath, content, agentType, label, placeholder, onRefresh }: PromptTabProps) {
  const { toast } = useToast()
  const [library, setLibrary] = useState<LibraryPrompt[]>([])
  const [editedContent, setEditedContent] = useState(content)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    call<string>(api => api.list_library_prompts(agentType), '[]')
      .then(raw => { try { setLibrary(JSON.parse(raw)) } catch {} })
      .catch(() => {})
  }, [agentType])

  useEffect(() => { setEditedContent(content) }, [content])

  const handleApply = useCallback(async (promptId: string) => {
    const p = library.find(l => l.id === promptId)
    if (!p) return
    setApplyingId(promptId)
    try {
      await saveFile(configPath, p.content)
      setEditedContent(p.content)
      onRefresh()
      toast({ type: 'success', message: `${p.name} applied to ${label}` })
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Apply failed' })
    } finally { setApplyingId(null) }
  }, [library, configPath, label, onRefresh, toast])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await saveFile(configPath, editedContent)
      onRefresh()
      toast({ type: 'success', message: `${label} saved` })
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Save failed' })
    } finally { setSaving(false) }
  }, [configPath, editedContent, label, onRefresh, toast])

  return (
    <div className="space-y-6">
      {library.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Apply from Library ({library.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {library.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{p.name}</div>
                    {p.description && <div className="text-[11px] text-muted-foreground truncate">{p.description}</div>}
                  </div>
                  <Button size="sm" variant="ghost" isLoading={applyingId === p.id} onClick={() => handleApply(p.id)}>Apply</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-mono">{label}</CardTitle>
            <Button size="sm" variant="ghost" isLoading={saving} onClick={handleSave}>Save</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={editedContent}
            onChange={e => setEditedContent(e.target.value)}
            rows={Math.min(30, Math.max(12, editedContent.split('\n').length + 2))}
            className="font-mono text-xs"
            placeholder={placeholder}
          />
        </CardContent>
      </Card>
    </div>
  )
}
