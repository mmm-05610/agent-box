/**
 * Rules — Codex rules directory.
 *
 * Reads `*.rules` files from `${configDir}/rules`, shows rule count, an
 * expandable preview, an inline textarea editor and a delete confirm.
 *
 * Each `.rules` file is a list of `prefix_rule(pattern=[...], decision="...")`
 * lines; the rule count is the number of `prefix_rule(` occurrences.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Textarea,
} from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { deletePath, findFiles, readFile, saveFile } from '@/api/files'
import type { AgentType } from '@/api'
import { useAgentConfigs, useProfileConfigDir } from '@/hooks'

interface RuleFile {
  /** Filename without `.rules` extension. */
  id: string
  /** Absolute path on disk. */
  path: string
  content: string
  ruleCount: number
}

function countRules(content: string): number {
  // count occurrences of `prefix_rule(` on non-comment lines
  let count = 0
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.split('#')[0]!.trim()
    if (trimmed.startsWith('prefix_rule(')) count += 1
  }
  return count
}

async function loadRules(rulesDir: string): Promise<RuleFile[]> {
  const paths = await findFiles(rulesDir)
  const pathList = Array.isArray(paths) ? paths : []
  const ruleFiles = pathList.filter((p) => p.split('/').pop()?.endsWith('.rules'))

  const loaded = await Promise.all(ruleFiles.map(async (filePath) => {
    const fileName = filePath.split('/').pop() ?? ''
    const id = fileName.replace(/\.rules$/, '')
    const content = await readFile(filePath).catch(() => '')
    return { id, path: filePath, content, ruleCount: countRules(content) }
  }))

  return loaded.sort((left, right) => left.id.localeCompare(right.id))
}

export function RulesList({ profileName, agentType }: { profileName: string; agentType?: AgentType }) {
  const { t } = useTranslation()
  const configDir = useProfileConfigDir(profileName)
  // File name from the backend registry (resources.rules.dir).
  const { agentConfigs } = useAgentConfigs()
  const rulesDirName = agentType ? (agentConfigs?.[agentType]?.resources?.rules?.dir as string | undefined) : undefined
  const [refreshKey, setRefreshKey] = useState(0)
  const [rules, setRules] = useState<RuleFile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RuleFile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()
  const rulesDir = configDir === null || !rulesDirName ? null : `${configDir.replace(/\/+$/, '')}/${rulesDirName}`

  const refresh = useCallback(async () => {
    if (!rulesDir) {
      setRules([])
      setLoading(false)
      setLoadError('')
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      const loaded = await loadRules(rulesDir)
      setRules(loaded)
    } catch (error) {
      setRules([])
      setLoadError(error instanceof Error ? error.message : t('rules.loadFailed', { error: '' }))
    } finally {
      setLoading(false)
    }
  }, [rulesDir])

  useEffect(() => {
    let cancelled = false
    void refresh().then(() => { if (cancelled) return })
    return () => { cancelled = true }
  }, [refresh, refreshKey])

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startEditing = (rule: RuleFile) => {
    setEditing((current) => ({ ...current, [rule.id]: rule.content }))
    setExpanded((current) => new Set(current).add(rule.id))
  }

  const cancelEditing = (id: string) => {
    setEditing((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const saveEditing = async (rule: RuleFile) => {
    const draft = editing[rule.id]
    if (draft === undefined) return
    setSaving(rule.id)
    try {
      await saveFile(rule.path, draft)
      setRules((current) => current.map((r) => r.id === rule.id
        ? { ...r, content: draft, ruleCount: countRules(draft) }
        : r))
      cancelEditing(rule.id)
      toast({ type: 'success', message: t('rules.toast.saved', { name: rule.id }) })
      setRefreshKey((k) => k + 1)
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : t('rules.toast.saveFailed') })
    } finally {
      setSaving(null)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deletePath(pendingDelete.path)
      const removedId = pendingDelete.id
      setRules((current) => current.filter((r) => r.id !== removedId))
      setExpanded((current) => {
        const next = new Set(current)
        next.delete(removedId)
        return next
      })
      cancelEditing(removedId)
      toast({ type: 'success', message: t('rules.toast.removed', { name: pendingDelete.id, profile: profileName }) })
      setPendingDelete(null)
      setRefreshKey((k) => k + 1)
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : t('rules.toast.removeFailed') })
    } finally {
      setDeleting(false)
    }
  }

  const totalRules = useMemo(() => rules.reduce((sum, r) => sum + r.ruleCount, 0), [rules])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('rules.title')}{' '}
          <span className="text-muted-foreground font-normal">{t('rules.count', { count: totalRules, files: rules.length })}</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          <Trans
            i18nKey="rules.subtitle"
            components={{ code: <code className="font-mono" /> }}
          />
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('rules.loading')}</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">{t('rules.loadFailed', { error: loadError })}</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            <Trans
              i18nKey="rules.empty"
              values={{ dir: rulesDir ?? '' }}
              components={{ code: <code className="font-mono" /> }}
            />
          </p>
        ) : (
          rules.map((rule) => {
            const isExpanded = expanded.has(rule.id)
            const isEditing = editing[rule.id] !== undefined
            const draft = editing[rule.id] ?? rule.content
            const isSaving = saving === rule.id
            return (
              <Card key={rule.id} elevation="flat" className="ring-1 ring-border/60">
                <div className="flex items-start gap-3 p-4">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <path d="M14 2v6h6M8 13h8M8 17h5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-mono font-medium text-foreground">{rule.id}</h4>
                      <span className="text-xs text-muted-foreground">.rules</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground ring-1 ring-inset ring-border">
                        {t(rule.ruleCount === 1 ? 'rules.countBadgeOne' : 'rules.countBadge', { count: rule.ruleCount })}
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpanded(rule.id)}
                    >
                      {isExpanded ? t('common.hideDetails') : t('common.details')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(rule)}>
                      {t('rules.remove')}
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="space-y-3 border-t border-border/60 px-4 py-3 text-sm">
                    <div>
                      <p className="mb-1 font-medium text-foreground">{t('rules.path')}</p>
                      <code className="break-all text-xs text-muted-foreground">{rule.path}</code>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="font-medium text-foreground">{t('rules.content')}</p>
                        {!isEditing ? (
                          <Button size="sm" variant="ghost" onClick={() => startEditing(rule)}>
                            Edit
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              onClick={() => saveEditing(rule)}
                              disabled={isSaving || draft === rule.content}
                            >
                              {isSaving ? t('common.saving') : t('rules.save')}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelEditing(rule.id)}
                              disabled={isSaving}
                            >
                              {t('common.cancel')}
                            </Button>
                          </div>
                        )}
                      </div>
                      <Textarea
                        value={draft}
                        onChange={(e) => setEditing((current) => ({ ...current, [rule.id]: e.target.value }))}
                        rows={Math.min(12, Math.max(6, draft.split('\n').length + 1))}
                        readOnly={!isEditing}
                        className="text-xs font-mono"
                        placeholder={t('rules.placeholder')}
                      />
                    </div>
                  </div>
                )}
              </Card>
            )
          })
        )}
      </CardContent>
      <ConfirmDialog
        open={pendingDelete != null}
        title={t('rules.confirmRemoveTitle')}
        description={pendingDelete ? t('rules.confirmRemoveDesc', { name: pendingDelete.id }) : undefined}
        confirmLabel={t('common.remove')}
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  )
}
