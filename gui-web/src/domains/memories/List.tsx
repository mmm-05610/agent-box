/**
 * Memories — MEMORY.md + USER.md editors (Hermes).
 *
 * Two independently-saved textareas. Files live under
 * `${configDir}/memories/` and are created on save if missing.
 */

import { useCallback, useEffect, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { readFile, saveFile } from '@/api/files'
import type { AgentType } from '@/api'
import { useAgentConfigs, useProfileConfigDir } from '@/hooks'

interface MemoryFile {
  path: string
  label: string
  descriptionKey: string
}

const FILES: MemoryFile[] = [
  {
    path: '', // resolved at runtime
    label: 'MEMORY.md',
    descriptionKey: 'memories.memoryDesc',
  },
  {
    path: '',
    label: 'USER.md',
    descriptionKey: 'memories.userDesc',
  },
]

export function MemoriesList({ profileName, agentType }: { profileName: string; agentType?: AgentType }) {
  const { t } = useTranslation()
  const configDir = useProfileConfigDir(profileName)
  // File name from the backend registry (resources.memories.dir).
  const { agentConfigs } = useAgentConfigs()
  const memoriesDirName = agentType ? (agentConfigs?.[agentType]?.resources?.memories?.dir as string | undefined) : undefined
  const memoriesDir = configDir === null || !memoriesDirName ? null : `${configDir.replace(/\/+$/, '')}/${memoriesDirName}`
  const fileEntries: MemoryFile[] = memoriesDir === null ? [] : FILES.map((f) => ({ ...f, path: `${memoriesDir}/${f.label}` }))

  const [texts, setTexts] = useState<Record<string, string>>({})
  const [original, setOriginal] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    if (memoriesDir === null) {
      setLoading(false)
      setTexts({})
      setOriginal({})
      return
    }
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
      toast({ type: 'success', message: t('memories.toast.saved', { file: file.label }) })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : t('memories.toast.saveFailed', { file: file.label }) })
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
        <CardTitle>{t('memories.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          <Trans
            i18nKey="memories.subtitle"
            values={{ dir: memoriesDir ?? '' }}
            components={{ code: <code className="font-mono" /> }}
          />
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
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
                    <p className="mt-0.5 text-xs text-muted-foreground">{t(file.descriptionKey)}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleSave(file)}
                    disabled={isSaving || !isDirty}
                  >
                    {isSaving ? t('common.saving') : t('common.save')}
                  </Button>
                </div>
                <div className="px-4 py-3">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(file.label, e.target.value)}
                    rows={10}
                    className="text-sm font-mono"
                    placeholder={t('memories.placeholder', { name: file.label.replace('.md', '') })}
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
