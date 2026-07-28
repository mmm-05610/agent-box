/**
 * Rules Tab — Codex rules directory.
 *
 * Reads `*.rules` files from `${configDir}/rules`, shows rule count, an
 * expandable preview, an inline textarea editor and a delete confirm.
 *
 * Each `.rules` file is a list of `prefix_rule(pattern=[...], decision="...")`
 * lines; the rule count is the number of `prefix_rule(` occurrences.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
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
    const trimmed = line.split('#')[0].trim()
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

export function RulesTab({ configDir, profileName, refreshKey }: {
  profileName: string
  configDir: string
  refreshKey?: number
}) {
  const [rules, setRules] = useState<RuleFile[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<RuleFile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()
  const rulesDir = `${configDir.replace(/\/+$/, '')}/rules`

  const refresh = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const loaded = await loadRules(rulesDir)
      setRules(loaded)
    } catch (error) {
      setRules([])
      setLoadError(error instanceof Error ? error.message : 'Failed to load rules')
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
      toast({ type: 'success', message: `${rule.id}.rules saved` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save rule' })
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
      toast({ type: 'success', message: `${pendingDelete.id}.rules removed from ${profileName}` })
      setPendingDelete(null)
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to remove rule' })
    } finally {
      setDeleting(false)
    }
  }

  const totalRules = useMemo(() => rules.reduce((sum, r) => sum + r.ruleCount, 0), [rules])

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Rules <span className="text-muted-foreground font-normal">({totalRules} across {rules.length} files)</span>
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Each <code className="font-mono">.rules</code> file holds a list of{' '}
          <code className="font-mono">prefix_rule(...)</code> entries.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">Failed to load rules: {loadError}</p>
        ) : rules.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No rule files in <code className="font-mono">{rulesDir}</code>.
            Apply from Library or create <code className="font-mono">*.rules</code> files directly.
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
                        {rule.ruleCount} {rule.ruleCount === 1 ? 'rule' : 'rules'}
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
                      {isExpanded ? 'Hide details' : 'Details'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(rule)}>
                      Remove
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="space-y-3 border-t border-border/60 px-4 py-3 text-sm">
                    <div>
                      <p className="mb-1 font-medium text-foreground">Path</p>
                      <code className="break-all text-xs text-muted-foreground">{rule.path}</code>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="font-medium text-foreground">Content</p>
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
                              {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelEditing(rule.id)}
                              disabled={isSaving}
                            >
                              Cancel
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
                        placeholder='prefix_rule(pattern=["cmd", "arg"], decision="allow")'
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
        title="Remove rule file?"
        description={pendingDelete ? `This will permanently remove “${pendingDelete.id}.rules”.` : undefined}
        confirmLabel="Remove"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  )
}
