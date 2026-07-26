/**
 * Skills Tab — Available (ACS library) on top + Installed below.
 * Each installed skill has a Detail button → modal with full info + edit.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  ConfirmDialog, Input, Textarea,
} from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { deletePath, findFiles, readFile, saveFile } from '@/api/files'
import { call } from '@/lib/bridge'

// ── Types ─────────────────────────────────────────────────────────────────

interface InstalledSkill {
  id: string
  name: string
  description: string
  directory: string
  skillFilePath: string
  skillFileName: 'SKILL.md' | 'DESCRIPTION.md'
  frontmatter: Record<string, string>
  content: string
  files: string[]
}

interface LibrarySkill {
  id: string
  name: string
  description: string
}

// ── Helpers ──────────────────────────────────────────────────────────────

function parseFrontmatter(content: string): Record<string, string> {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)
  if (!match) return {}
  const values: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!field) continue
    values[field[1]] = field[2].trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

function relativePath(path: string, root: string): string {
  const r = root.replace(/\/+$/, '')
  return path.startsWith(`${r}/`) ? path.slice(r.length + 1) : path
}

async function loadInstalled(dir: string): Promise<InstalledSkill[]> {
  const paths = await findFiles(dir).catch(() => [] as string[])
  const pathList = Array.isArray(paths) ? paths : []
  const byDir = new Map<string, { skillMd: string | null; descMd: string | null }>()
  for (const p of pathList) {
    const base = p.split('/').pop()
    if (base !== 'SKILL.md' && base !== 'DESCRIPTION.md') continue
    const d = p.slice(0, -(base.length + 1))
    const entry = byDir.get(d) ?? { skillMd: null, descMd: null }
    if (base === 'SKILL.md') entry.skillMd = p
    else entry.descMd = p
    byDir.set(d, entry)
  }
  const results = await Promise.all(
    Array.from(byDir.entries()).map(async ([dir, entry]) => {
      const fp = entry.skillMd ?? entry.descMd
      if (!fp) return null
      const fn = entry.skillMd ? 'SKILL.md' : 'DESCRIPTION.md'
      const content = await readFile(fp).catch(() => '')
      const fm = parseFrontmatter(content)
      const id = relativePath(dir, dir)
      const files = pathList.filter(p => p.startsWith(`${dir}/`)).map(p => relativePath(p, dir)).sort((a, b) => a.localeCompare(b))
      return { id, name: fm.name || id, description: fm.description || '', directory: dir, skillFilePath: fp, skillFileName: fn, frontmatter: fm, content, files } satisfies InstalledSkill
    })
  )
  return results.filter((s): s is InstalledSkill => s !== null).sort((a, b) => a.name.localeCompare(b.name))
}

// ── Detail Modal ──────────────────────────────────────────────────────────

function SkillDetailModal({ skill, onClose, onSaved }: {
  skill: InstalledSkill
  onClose: () => void
  onSaved: (s: InstalledSkill) => void
}) {
  const [editContent, setEditContent] = useState(skill.content)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const isEditing = editContent !== skill.content

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveFile(skill.skillFilePath, editContent)
      const fresh = await readFile(skill.skillFilePath).catch(() => editContent)
      const fm = parseFrontmatter(fresh)
      onSaved({ ...skill, content: fresh, frontmatter: fm, name: fm.name || skill.name, description: fm.description || skill.description })
      toast({ type: 'success', message: `${skill.name} saved` })
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Save failed' })
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-card p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">{skill.name}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>✕</Button>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{skill.description}</p>
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(skill.frontmatter).filter(([k]) => k !== 'name' && k !== 'description').map(([k, v]) =>
            <Badge key={k} variant="neutral">{k}: {v}</Badge>
          )}
        </div>
        <details className="mb-3">
          <summary className="cursor-pointer text-xs text-muted-foreground">Files ({skill.files.length})</summary>
          <div className="mt-1 max-h-40 overflow-y-auto rounded bg-muted/50 p-2 font-mono text-[10px]">{skill.files.map(f => <div key={f}>{f}</div>)}</div>
        </details>
        <div className="text-xs text-muted-foreground mb-3 font-mono truncate">{skill.skillFilePath}</div>
        <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} rows={14} className="font-mono text-xs" />
        <div className="mt-3 flex justify-end gap-2">
          {isEditing && <Button variant="ghost" size="sm" onClick={() => setEditContent(skill.content)}>Cancel</Button>}
          <Button size="sm" isLoading={saving} onClick={handleSave} disabled={!isEditing}>Save</Button>
        </div>
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export function SkillsTab({ configDir, profileName, agentType, refreshKey }: {
  profileName: string
  configDir: string
  agentType?: string
  refreshKey?: number
}) {
  const at = agentType ?? 'claude'
  const { toast } = useToast()
  const skillsDir = `${configDir.replace(/\/+$/, '')}/skills`

  // Installed
  const [installed, setInstalled] = useState<InstalledSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [detailSkill, setDetailSkill] = useState<InstalledSkill | null>(null)

  // Library
  const [search, setSearch] = useState('')
  const [library, setLibrary] = useState<LibrarySkill[]>([])
  const [searchResults, setSearchResults] = useState<LibrarySkill[]>([])
  const [page, setPage] = useState(0)
  const PER_PAGE = 10
  const [applyingId, setApplyingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setLoadError('')
    loadInstalled(skillsDir).then(s => { if (!cancelled) setInstalled(s) })
      .catch(e => { if (!cancelled) { setInstalled([]); setLoadError(e instanceof Error ? e.message : 'Failed') } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [skillsDir, refreshKey])

  // Load library on mount
  useEffect(() => {
    call<string>(api => api.list_library_skills(at), '[]')
      .then(raw => { try { setLibrary(JSON.parse(raw)) } catch {} })
      .catch(() => {})
  }, [at])

  // Paginate
  const effective = search.trim() ? searchResults : library
  const totalPages = Math.max(1, Math.ceil(effective.length / PER_PAGE))
  const pageItems = effective.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  const installedIds = useMemo(() => new Set(installed.map(s => s.id)), [installed])

  const handleSearch = (q: string) => {
    setSearch(q); setPage(0)
    if (!q.trim()) { setSearchResults([]); return }
    const needle = q.toLowerCase()
    setSearchResults(library.filter(s => s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle)))
  }

  const handleApply = useCallback(async (skillId: string) => {
    setApplyingId(skillId)
    try {
      await call<void>(api => api.apply_skill_to_profile(profileName, skillId), undefined)
      const fresh = await loadInstalled(skillsDir)
      setInstalled(fresh)
      toast({ type: 'success', message: `${skillId} applied` })
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Apply failed' })
    } finally { setApplyingId(null) }
  }, [profileName, skillsDir, toast])

  const handleRemove = useCallback(async (skillId: string) => {
    setRemovingId(skillId)
    try {
      await call<void>(api => api.remove_skill_from_profile(profileName, skillId), undefined)
      setInstalled(prev => prev.filter(s => s.id !== skillId))
      toast({ type: 'success', message: `${skillId} removed` })
    } catch {
      try { await deletePath(`${skillsDir}/${skillId}`); setInstalled(prev => prev.filter(s => s.id !== skillId)); toast({ type: 'success', message: `${skillId} removed` }) }
      catch { toast({ type: 'error', message: 'Remove failed' }) }
    } finally { setRemovingId(null) }
  }, [profileName, skillsDir, toast])

  return (
    <div className="space-y-6">
      {/* ── Available Skills ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Available Skills ({effective.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Input placeholder={`Search ${at} skills...`} value={search} onChange={e => handleSearch(e.target.value)} className="mb-3" />
          {pageItems.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">{search.trim() ? 'No matching skills.' : 'Loading...'}</p>
          ) : (
            <>
              <div className="space-y-1">
                {pageItems.map(s => {
                  const added = installedIds.has(s.id)
                  return (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5">
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.name}</div>{s.description && <div className="text-[11px] text-muted-foreground truncate">{s.description}</div>}</div>
                      {added
                        ? <span className="text-xs text-muted-foreground px-2">Installed</span>
                        : <Button size="sm" variant="ghost" isLoading={applyingId === s.id} onClick={() => handleApply(s.id)}>Add</Button>}
                    </div>
                  )
                })}
              </div>
              {totalPages > 1 && (
                <div className="mt-2 flex items-center justify-center gap-2 text-xs">
                  <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>← Prev</Button>
                  <span className="text-muted-foreground">{page + 1} / {totalPages}</span>
                  <Button size="sm" variant="ghost" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>Next →</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Installed Skills ─────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Installed Skills ({installed.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <p className="text-xs text-muted-foreground py-2">Loading...</p>
          : loadError ? <p className="text-xs text-destructive py-2">{loadError}</p>
          : installed.length === 0 ? <p className="text-xs text-muted-foreground py-2">No skills installed. Search above to add.</p>
          : (
            <div className="space-y-1">
              {installed.map(s => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5">
                  <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.name}</div>{s.description && <div className="text-[11px] text-muted-foreground truncate">{s.description}</div>}</div>
                  <Button size="sm" variant="ghost" onClick={() => setDetailSkill(s)}>Detail</Button>
                  <Button size="sm" variant="ghost" isLoading={removingId === s.id} onClick={() => handleRemove(s.id)} className="text-destructive hover:text-destructive">Remove</Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      {detailSkill && (
        <SkillDetailModal skill={detailSkill} onClose={() => setDetailSkill(null)}
          onSaved={updated => { setInstalled(prev => prev.map(s => s.id === updated.id ? updated : s)); setDetailSkill(updated) }}
        />
      )}
    </div>
  )
}
