/**
 * Skills Tab — Available (ACS library) on top + Installed below.
 * Each installed skill has a Detail button → modal with full info + edit.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Badge, Button, Card, CardContent, CardHeader, CardTitle,
  Input, Textarea,
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
  source_available?: boolean
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

async function loadInstalled(dir: string, root: string): Promise<InstalledSkill[]> {
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
      const id = relativePath(dir, root)
      const files = pathList.filter(p => p.startsWith(`${dir}/`)).map(p => relativePath(p, dir)).sort((a, b) => a.localeCompare(b))
      return { id, name: fm.name || id, description: fm.description || '', directory: dir, skillFilePath: fp, skillFileName: fn, frontmatter: fm, content, files } satisfies InstalledSkill
    })
  )
  return results.filter((s): s is InstalledSkill => s !== null).sort((a, b) => a.name.localeCompare(b.name))
}

// ── Detail Modal ──────────────────────────────────────────────────────────

function FrontmatterTable({ frontmatter, excludeKeys }: { frontmatter: Record<string, string>; excludeKeys: string[] }) {
  const excluded = new Set(excludeKeys)
  const entries = Object.entries(frontmatter).filter(([k]) => !excluded.has(k))
  if (entries.length === 0) return null
  return (
    <div>
      <p className="mb-1 font-medium text-foreground">Frontmatter</p>
      <div className="overflow-x-auto rounded-md ring-1 ring-border/60">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-border/40">
            {entries.map(([key, value]) => (
              <tr key={key}>
                <td className="w-1/3 align-top bg-muted/40 px-3 py-1.5 font-mono text-muted-foreground">{key}</td>
                <td className="break-all px-3 py-1.5 font-mono text-foreground/90">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SkillDetailModal({ skill, onClose, onSaved }: { skill: InstalledSkill; onClose: () => void; onSaved: (s: InstalledSkill) => void }) {
  const [draft, setDraft] = useState(skill.content)
  const [isEditing, setIsEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveFile(skill.skillFilePath, draft)
      const fresh = await readFile(skill.skillFilePath).catch(() => draft)
      const fm = parseFrontmatter(fresh)
      onSaved({ ...skill, content: fresh, frontmatter: fm, name: fm.name || skill.name, description: fm.description || skill.description })
      setIsEditing(false)
      toast({ type: 'success', message: `${skill.name} saved` })
    } catch (e) {
      toast({ type: 'error', message: e instanceof Error ? e.message : 'Save failed' })
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="relative max-h-[85vh] w-full max-w-2xl rounded-xl bg-card shadow-xl flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Sticky header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-3 border-b border-border/60 bg-card rounded-t-xl shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                <path d="M12 2a2 2 0 0 0-2 2v1.2a6.5 6.5 0 0 0-2 .8L7.1 5a2 2 0 1 0-2.8 2.8l1 .9a6.5 6.5 0 0 0-.8 2H3a2 2 0 1 0 0 4h1.2a6.5 6.5 0 0 0 .8 2l-.9.9a2 2 0 1 0 2.8 2.8l.9-1a6.5 6.5 0 0 0 2 .8V22a2 2 0 1 0 4 0v-1.2a6.5 6.5 0 0 0 2-.8l.9 1a2 2 0 1 0 2.8-2.8l-1-.9a6.5 6.5 0 0 0 .8-2H21a2 2 0 1 0 0-4h-1.2a6.5 6.5 0 0 0-.8-2l1-.9a2 2 0 1 0-2.8-2.8l-.9 1a6.5 6.5 0 0 0-2-.8V4a2 2 0 0 0-2-2Z" />
                <circle cx="12" cy="13" r="2.5" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-foreground truncate">{skill.name}</h3>
                <Badge variant="neutral" className="text-[10px] px-1.5 py-0">{skill.skillFileName}</Badge>
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1">{skill.description}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">✕</Button>
        </div>

        {/* Scroll body */}
        <div className="overflow-y-auto p-5 space-y-4 text-sm">
          {Object.keys(skill.frontmatter).length > 0 && (
            <FrontmatterTable frontmatter={skill.frontmatter} excludeKeys={['name', 'description']} />
          )}
          <div>
            <p className="mb-1 font-medium text-foreground">Directory</p>
            <code className="break-all text-xs text-muted-foreground">{skill.directory}</code>
          </div>
          <div>
            <p className="mb-1 font-medium text-foreground">Files ({skill.files.length})</p>
            <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-xs text-muted-foreground">
              {skill.files.map(f => <li key={f} className="break-all">{f}</li>)}
            </ul>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-medium text-foreground">{skill.skillFileName} content</p>
              {!isEditing ? (
                <Button size="sm" variant="ghost" onClick={() => setIsEditing(true)}>Edit</Button>
              ) : (
                <div className="flex items-center gap-1">
                  <Button size="sm" onClick={handleSave} isLoading={saving} disabled={draft === skill.content}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setDraft(skill.content); setIsEditing(false) }} disabled={saving}>Cancel</Button>
                </div>
              )}
            </div>
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={Math.min(20, Math.max(8, draft.split('\n').length + 1))}
              readOnly={!isEditing}
              className="text-xs font-mono"
            />
          </div>
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
  const [tick, setTick] = useState(0)

  // Library
  const [search, setSearch] = useState('')
  const [library, setLibrary] = useState<LibrarySkill[]>([])
  const [searchResults, setSearchResults] = useState<LibrarySkill[]>([])
  const [page, setPage] = useState(0)
  const PER_PAGE = 5
  const [applyingId, setApplyingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setLoadError('')
    loadInstalled(skillsDir, skillsDir).then(s => { if (!cancelled) setInstalled(s) })
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

  // Filter + Paginate (filter first)
  const installedIds = useMemo(() => new Set(installed.map(s => s.id)), [installed])
  const effective = (search.trim() ? searchResults : library)
    .filter(s => !installedIds.has(s.id) && s.source_available !== false)
  const totalPages = Math.max(1, Math.ceil(effective.length / PER_PAGE))
  const pageItems = effective.slice(page * PER_PAGE, (page + 1) * PER_PAGE)

  const handleSearch = (q: string) => {
    setSearch(q); setPage(0)
    if (!q.trim()) { setSearchResults([]); return }
    const needle = q.toLowerCase()
    setSearchResults(library.filter(s => s.name.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle)).filter(s => !installedIds.has(s.id) && s.source_available !== false))
  }

  const handleApply = useCallback(async (skillId: string) => {
    setApplyingId(skillId)
    try {
      await call<void>(api => api.apply_skill_to_profile(profileName, skillId), undefined)
      await loadInstalled(skillsDir, skillsDir).then(setInstalled)
      setTick(t => t + 1)
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
      setTick(t => t + 1)
      toast({ type: 'success', message: `${skillId} removed` })
    } catch {
      try { await deletePath(`${skillsDir}/${skillId}`); setInstalled(prev => prev.filter(s => s.id !== skillId)); setTick(t => t + 1); toast({ type: 'success', message: `${skillId} removed` }) }
      catch { toast({ type: 'error', message: 'Remove failed' }) }
    } finally { setRemovingId(null) }
  }, [profileName, skillsDir, toast])

  return (
    <div className="space-y-6">
      {/* ── Available Skills ─────────────────────────────────────── */}
      <Card key={`available-${tick}-${installed.length}`}>
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
                {pageItems.map(s => (
                    <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5">
                      <div className="min-w-0 flex-1"><div className="text-sm font-medium">{s.name}</div>{s.description && <div className="text-[11px] text-muted-foreground truncate">{s.description}</div>}</div>
                      <Button size="sm" variant="ghost" isLoading={applyingId === s.id} onClick={() => handleApply(s.id)}>Add</Button>
                    </div>
                  ))}
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
