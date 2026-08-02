/**
 * Prompt List — Apply from Library (ACS prompts) + Current content editor.
 * Serves the agent's prompt file (CLAUDE.md / SOUL.md / AGENTS.md).
 */

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { readFile, saveFile } from '@/api/files'
import { AGENT_TYPE_CONFIGS } from '@/api'
import type { AgentType } from '@/api'
import { useLibrary } from '@/hooks'
import { useProfileConfigDir } from '../useProfileConfigDir'

interface PromptListProps {
  profileName: string
  agentType: AgentType
}

export function PromptList({ profileName, agentType }: PromptListProps) {
  const { toast } = useToast()
  const configDir = useProfileConfigDir(profileName)
  const promptFile = AGENT_TYPE_CONFIGS[agentType].prompt_file
  const promptPath = configDir === null ? null : `${configDir}/${promptFile}`

  const { prompts: library } = useLibrary(agentType, ['prompts'])
  const [editedContent, setEditedContent] = useState('')
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!promptPath) return
    let cancelled = false
    readFile(promptPath)
      .then((c) => { if (!cancelled) setEditedContent(c) })
      .catch(() => { if (!cancelled) setEditedContent('') })
    return () => { cancelled = true }
  }, [promptPath])

  const handleApply = useCallback(async (promptId: string) => {
    const p = library.find(l => l.id === promptId)
    if (!p || !promptPath) return
    setApplyingId(promptId)
    try {
      await saveFile(promptPath, p.content)
      setEditedContent(p.content)
      toast({ type: 'success', message: `${p.name} applied to ${promptFile}` })
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Apply failed' })
    } finally { setApplyingId(null) }
  }, [library, promptPath, promptFile, toast])

  const handleSave = useCallback(async () => {
    if (!promptPath) return
    setSaving(true)
    try {
      await saveFile(promptPath, editedContent)
      toast({ type: 'success', message: `${promptFile} saved` })
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Save failed' })
    } finally { setSaving(false) }
  }, [promptPath, editedContent, promptFile, toast])

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
            <CardTitle className="text-sm font-mono">{promptFile}</CardTitle>
            <Button size="sm" variant="ghost" isLoading={saving} onClick={handleSave}>Save</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Textarea
            value={editedContent}
            onChange={e => setEditedContent(e.target.value)}
            rows={Math.min(30, Math.max(12, editedContent.split('\n').length + 2))}
            className="font-mono text-xs"
            placeholder="# Custom instructions"
          />
        </CardContent>
      </Card>
    </div>
  )
}
