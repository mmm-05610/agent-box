/**
 * Skills Tab — installed skills list + searchable ACS library.
 *
 * Two sections:
 *   1. Installed — skills already applied to this profile (with Remove)
 *   2. Available — search ACS library, then Add
 */

import { useCallback, useEffect, useState, useMemo } from 'react'
import { Button, Card, CardContent, CardHeader, CardTitle, Input } from '@/components/ui'
import { useToast } from '@/components/feedback/toast'
import { findFiles, readFile, deletePath } from '@/api/files'
import { call } from '@/lib/bridge'

interface InstalledSkill {
  id: string
  name: string
  description: string
  directory: string
  skillFilePath: string
  skillFileName: string
  content: string
  files: string[]
  frontmatter: Record<string, string>
}

interface LibrarySkill {
  id: string
  name: string
  description: string
}

interface SkillsTabProps {
  configDir: string
  profileName: string
  agentType?: string
  refreshKey?: number
}

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

async function loadInstalled(dir: string): Promise<InstalledSkill[]> {
  const paths = await findFiles(dir).catch(() => [] as string[])
  const byDir = new Map<string, { md: string | null; files: string[] }>()
  for (const p of paths) {
    const parts = p.replace(dir + '/', '').split('/')
    if (parts.length < 2) continue
    const skillId = parts[0]
    const entry = byDir.get(skillId) ?? { md: null, files: [] }
    if (parts[1] === 'SKILL.md') { entry.md = p; entry.files.push(parts[1]) }
    else if (parts[1] === 'DESCRIPTION.md') { if (!entry.md) entry.md = p; entry.files.push(parts[1]) }
    else entry.files.push(parts.slice(1).join('/'))
    byDir.set(skillId, entry)
  }
  const results = await Promise.all(
    Array.from(byDir.entries()).map(async ([id, entry]) => {
      if (!entry.md) return null
      const content = await readFile(entry.md).catch(() => '')
      const fm = parseFrontmatter(content)
      return {
        id,
        name: fm.name || id,
        description: fm.description || '',
        directory: `${dir}/${id}`,
        skillFilePath: entry.md,
        skillFileName: entry.md.endsWith('SKILL.md') ? 'SKILL.md' : 'DESCRIPTION.md',
        content,
        files: entry.files.sort(),
        frontmatter: fm,
      } as InstalledSkill
    })
  )
  return results.filter(Boolean) as InstalledSkill[]
}

export function SkillsTab({ configDir, profileName, agentType: agentTypeProp, refreshKey }: SkillsTabProps) {
  const skillsDir = `${configDir}/skills`
  const agentType = agentTypeProp ?? 'claude'
  const { toast } = useToast()
  const [installed, setInstalled] = useState<InstalledSkill[]>([])
  const [search, setSearch] = useState('')
  const [library, setLibrary] = useState<LibrarySkill[]>([])
  const [searchResults, setSearchResults] = useState<LibrarySkill[]>([])
  const [loading, setLoading] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const reloadInstalled = useCallback(async () => {
    const list = await loadInstalled(skillsDir).catch(() => [] as InstalledSkill[])
    setInstalled(list)
  }, [skillsDir])

  useEffect(() => { reloadInstalled() }, [reloadInstalled, refreshKey])

  const installedIds = useMemo(() => new Set(installed.map(s => s.id)), [installed])

  const handleSearch = useCallback(async (q: string) => {
    setSearch(q)
    if (q.trim().length < 1) { setSearchResults([]); return }
    setLoading(true)
    try {
      // Load all library skills (cached after first fetch)
      if (library.length === 0) {
        const raw = await call<string>(api => api.list_library_skills(agentType), '[]')
        const parsed = JSON.parse(raw)
        setLibrary(parsed)
      }
      const needle = q.toLowerCase()
      const all = library.length > 0 ? library : JSON.parse(await call<string>(api => api.list_library_skills(agentType), '[]'))
      if (library.length === 0) setLibrary(all)
      setSearchResults(all.filter((s: LibrarySkill) =>
        s.name.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle)
      ).slice(0, 20))
    } catch { setSearchResults([]) }
    finally { setLoading(false) }
  }, [agentType, library])

  const handleApply = useCallback(async (skillId: string) => {
    setApplyingId(skillId)
    try {
      await call<void>(api => api.apply_skill_to_profile(profileName, skillId), undefined)
      await reloadInstalled()
      toast({ type: 'success', message: `${skillId} applied` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to apply skill' })
    } finally { setApplyingId(null) }
  }, [profileName, reloadInstalled, toast])

  const handleRemove = useCallback(async (skillId: string) => {
    setRemovingId(skillId)
    try {
      await call<void>(api => api.remove_skill_from_profile(profileName, skillId), undefined)
      await reloadInstalled()
      toast({ type: 'success', message: `${skillId} removed` })
    } catch (error) {
      // Fallback: delete directory directly
      try {
        const target = `${skillsDir}/${skillId}`
        await deletePath(target)
        await reloadInstalled()
        toast({ type: 'success', message: `${skillId} removed` })
      } catch {
        toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to remove skill' })
      }
    } finally { setRemovingId(null) }
  }, [profileName, skillsDir, reloadInstalled, toast])

  return (
    <div className="space-y-6">
      {/* ── Installed ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Installed Skills ({installed.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {installed.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No skills installed. Search below to add.</p>
          ) : (
            <div className="space-y-1">
              {installed.map(s => {
                const expanded = expandedId === s.id
                return (
                  <div key={s.id}>
                    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5">
                      <button className="flex-1 text-left min-w-0" onClick={() => setExpandedId(expanded ? null : s.id)}>
                        <div className="text-sm font-medium">{s.name}</div>
                        {s.description && <div className="text-[11px] text-muted-foreground truncate">{s.description}</div>}
                      </button>
                      <span className="text-[10px] text-muted-foreground">{s.skillFileName}</span>
                      <Button size="sm" variant="ghost" isLoading={removingId === s.id}
                        onClick={() => handleRemove(s.id)} className="text-destructive hover:text-destructive">
                        Remove
                      </Button>
                    </div>
                    {expanded && (
                      <div className="mt-1 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                        <div className="text-xs text-muted-foreground">
                          {Object.entries(s.frontmatter).filter(([k]) => k !== 'name' && k !== 'description').map(([k, v]) =>
                            <span key={k} className="mr-3"><b>{k}:</b> {v}</span>
                          )}
                        </div>
                        {s.files.length > 0 && (
                          <details>
                            <summary className="text-xs cursor-pointer text-muted-foreground">Files ({s.files.length})</summary>
                            <div className="mt-1 text-[10px] font-mono text-muted-foreground max-h-32 overflow-y-auto">
                              {s.files.map(f => <div key={f}>{f}</div>)}
                            </div>
                          </details>
                        )}
                        <div className="text-xs text-muted-foreground truncate">Path: {s.skillFilePath}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Available (Search) ──────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Available Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder={`Search ${agentType} skills...`}
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="mb-3"
          />
          {loading ? (
            <p className="text-xs text-muted-foreground py-2">Searching...</p>
          ) : search.trim() && searchResults.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No matching skills found.</p>
          ) : searchResults.length > 0 ? (
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {searchResults.map(s => {
                const added = installedIds.has(s.id)
                return (
                  <div key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{s.name}</div>
                      {s.description && <div className="text-[11px] text-muted-foreground truncate">{s.description}</div>}
                    </div>
                    {added ? (
                      <span className="text-xs text-muted-foreground px-2">Installed</span>
                    ) : (
                      <Button size="sm" variant="ghost" isLoading={applyingId === s.id}
                        onClick={() => handleApply(s.id)}>
                        Add
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : !search.trim() ? (
            <p className="text-xs text-muted-foreground py-2">Type to search available skills.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
