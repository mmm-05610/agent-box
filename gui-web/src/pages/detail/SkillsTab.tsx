/**
 * Skills Tab — shows skills applied to this profile.
 * Discovers SKILL.md (preferred) or DESCRIPTION.md files recursively and
 * reads their frontmatter. Frontmatter is parsed in full (all flat key/value
 * pairs); additional fields like license, version, metadata show up in the
 * expanded detail view.
 *
 * Edit mode mirrors RulesTab: expanded → "Edit" → textarea → Save / Cancel.
 * Save writes the raw SKILL.md (or DESCRIPTION.md) contents back via saveFile,
 * then re-reads + re-parses frontmatter so the displayed fields stay in sync.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Badge,
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

interface InstalledSkill {
  id: string
  /** Display name from frontmatter, or fallback to directory basename. */
  name: string
  /** Description from frontmatter, or placeholder. */
  description: string
  /** Absolute path to the skill directory on disk. */
  directory: string
  /** Absolute path of the file we read (SKILL.md or DESCRIPTION.md). */
  skillFilePath: string
  /** Filename basename of the loaded file — surfaced in the UI. */
  skillFileName: 'SKILL.md' | 'DESCRIPTION.md'
  /** All flat frontmatter fields (license, version, author, ...). */
  frontmatter: Record<string, string>
  /** Raw file contents — both display + edit need this. */
  content: string
  /** Other files in the skill directory (relative paths). */
  files: string[]
}

function parseFrontmatter(content: string): Record<string, string> {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)
  if (!match) return {}

  const values: Record<string, string> = {}
  for (const line of match[1].split('\n')) {
    // Skip continuation / nested-block lines (indented) — only top-level
    // ``key: value`` pairs land in the flat record.
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!field) continue
    const value = field[2].trim()
    values[field[1]] = value.replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

function relativePath(path: string, root: string): string {
  const normalizedRoot = root.replace(/\/+$/, '')
  return path.startsWith(`${normalizedRoot}/`)
    ? path.slice(normalizedRoot.length + 1)
    : path
}

async function loadSkills(skillsDir: string): Promise<InstalledSkill[]> {
  const paths = await findFiles(skillsDir)
  // Normalize — backend can return null/non-array when the directory is missing.
  const pathList = Array.isArray(paths) ? paths : []

  // Group files by skill directory. Prefer SKILL.md (modern Claude / OpenCode
  // convention); fall back to DESCRIPTION.md (Hermes bundled skills).
  const byDir = new Map<string, { skillMd: string | null; descMd: string | null }>()
  for (const p of pathList) {
    const base = p.split('/').pop()
    if (base !== 'SKILL.md' && base !== 'DESCRIPTION.md') continue
    const directory = p.slice(0, -(base.length + 1))
    const entry = byDir.get(directory) ?? { skillMd: null, descMd: null }
    if (base === 'SKILL.md') entry.skillMd = p
    else entry.descMd = p
    byDir.set(directory, entry)
  }

  const skills = await Promise.all(Array.from(byDir.entries()).map(async ([directory, files]) => {
    const skillFilePath = files.skillMd ?? files.descMd
    if (!skillFilePath) {
      // Defensive — both nulls shouldn't happen given the filter above.
      return null
    }
    const skillFileName = files.skillMd ? 'SKILL.md' : 'DESCRIPTION.md'
    const content = await readFile(skillFilePath).catch(() => '')
    const metadata = parseFrontmatter(content)
    const id = relativePath(directory, skillsDir)
    const fileList = pathList
      .filter((path) => path.startsWith(`${directory}/`))
      .map((path) => relativePath(path, directory))
      .sort((left, right) => left.localeCompare(right))

    return {
      id,
      name: metadata.name || id.split('/').pop() || id,
      description: metadata.description || 'No description provided.',
      directory,
      skillFilePath,
      skillFileName,
      frontmatter: metadata,
      content,
      files: fileList,
    } satisfies InstalledSkill
  }))

  return skills
    .filter((s): s is InstalledSkill => s !== null)
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function SkillsTab({ configDir, profileName, refreshKey }: {
  profileName: string
  configDir: string
  refreshKey?: number
}) {
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<InstalledSkill | null>(null)
  const [deleting, setDeleting] = useState(false)
  const { toast } = useToast()
  const skillsDir = `${configDir.replace(/\/+$/, '')}/skills`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')

    void loadSkills(skillsDir)
      .then((loadedSkills) => {
        if (!cancelled) setSkills(loadedSkills)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSkills([])
          setLoadError(error instanceof Error ? error.message : 'Failed to load skills')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [skillsDir, refreshKey])

  const toggleExpanded = (id: string) => {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const startEditing = (skill: InstalledSkill) => {
    setEditing((current) => ({ ...current, [skill.id]: skill.content }))
    setExpanded((current) => new Set(current).add(skill.id))
  }

  const cancelEditing = (id: string) => {
    setEditing((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const saveEditing = useCallback(async (skill: InstalledSkill) => {
    const draft = editing[skill.id]
    if (draft === undefined) return
    setSaving(skill.id)
    try {
      await saveFile(skill.skillFilePath, draft)
      // Re-read so frontmatter stays in sync with the saved file.
      const fresh = await readFile(skill.skillFilePath).catch(() => draft)
      const metadata = parseFrontmatter(fresh)
      setSkills((current) => current.map((s) => s.id === skill.id
        ? {
            ...s,
            content: fresh,
            frontmatter: metadata,
            name: metadata.name || s.name,
            description: metadata.description || s.description,
          }
        : s))
      cancelEditing(skill.id)
      toast({ type: 'success', message: `${skill.name} saved` })
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to save skill' })
    } finally {
      setSaving(null)
    }
  }, [editing, toast])

  const removeSkill = async () => {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await deletePath(pendingDelete.directory)
      const removedId = pendingDelete.id
      setSkills((current) => current.filter((skill) => skill.id !== removedId))
      setExpanded((current) => {
        const next = new Set(current)
        next.delete(removedId)
        return next
      })
      cancelEditing(removedId)
      toast({ type: 'success', message: `${pendingDelete.name} removed from ${profileName}` })
      setPendingDelete(null)
    } catch (error) {
      toast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to remove skill' })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Skills ({skills.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : loadError ? (
          <p className="text-sm text-destructive">Failed to load skills: {loadError}</p>
        ) : skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">No skills installed. Apply from Library.</p>
        ) : (
          skills.map((skill) => {
            const isExpanded = expanded.has(skill.id)
            const isEditing = editing[skill.id] !== undefined
            const draft = editing[skill.id] ?? skill.content
            const isSaving = saving === skill.id
            return (
              <Card key={skill.id} elevation="flat" className="ring-1 ring-border/60">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                      <path d="M12 2a2 2 0 0 0-2 2v1.2a6.5 6.5 0 0 0-2 .8L7.1 5a2 2 0 1 0-2.8 2.8l1 .9a6.5 6.5 0 0 0-.8 2H3a2 2 0 1 0 0 4h1.2a6.5 6.5 0 0 0 .8 2l-.9.9a2 2 0 1 0 2.8 2.8l.9-1a6.5 6.5 0 0 0 2 .8V22a2 2 0 1 0 4 0v-1.2a6.5 6.5 0 0 0 2-.8l.9 1a2 2 0 1 0 2.8-2.8l-1-.9a6.5 6.5 0 0 0 .8-2H21a2 2 0 1 0 0-4h-1.2a6.5 6.5 0 0 0-.8-2l1-.9a2 2 0 1 0-2.8-2.8l-.9 1a6.5 6.5 0 0 0-2-.8V4a2 2 0 0 0-2-2Z" />
                      <circle cx="12" cy="13" r="2.5" />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="font-medium text-foreground">{skill.name}</h4>
                      <Badge variant="neutral" className="text-[10px] px-1.5 py-0">{skill.skillFileName}</Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{skill.description}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={isExpanded}
                      onClick={() => toggleExpanded(skill.id)}
                    >
                      {isExpanded ? 'Hide details' : 'Details'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setPendingDelete(skill)}>
                      Remove
                    </Button>
                  </div>
                </div>
                {isExpanded && (
                  <div className="space-y-3 border-t border-border/60 px-4 py-3 text-sm">
                    <div>
                      <p className="mb-1 font-medium text-foreground">Description</p>
                      <p className="whitespace-pre-wrap leading-relaxed text-muted-foreground">{skill.description}</p>
                    </div>
                    {Object.keys(skill.frontmatter).length > 0 && (
                      <FrontmatterTable
                        frontmatter={skill.frontmatter}
                        excludeKeys={['name', 'description']}
                      />
                    )}
                    <div>
                      <p className="mb-1 font-medium text-foreground">Directory</p>
                      <code className="break-all text-xs text-muted-foreground">{skill.directory}</code>
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-foreground">Files ({skill.files.length})</p>
                      <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md bg-muted/60 p-2 font-mono text-xs text-muted-foreground">
                        {skill.files.map((file) => <li key={file} className="break-all">{file}</li>)}
                      </ul>
                    </div>
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <p className="font-medium text-foreground">
                          {skill.skillFileName} content
                        </p>
                        {!isEditing ? (
                          <Button size="sm" variant="ghost" onClick={() => startEditing(skill)}>
                            Edit
                          </Button>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              onClick={() => saveEditing(skill)}
                              disabled={isSaving || draft === skill.content}
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelEditing(skill.id)}
                              disabled={isSaving}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                      <Textarea
                        value={draft}
                        onChange={(e) => setEditing((current) => ({ ...current, [skill.id]: e.target.value }))}
                        rows={Math.min(20, Math.max(8, draft.split('\n').length + 1))}
                        readOnly={!isEditing}
                        className="text-xs font-mono"
                        placeholder={`# ${skill.name}\n\nAdd instructions for the agent here.`}
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
        title="Remove skill?"
        description={pendingDelete ? `This will permanently remove “${pendingDelete.name}” and all files in ${pendingDelete.directory}.` : undefined}
        confirmLabel="Remove"
        busy={deleting}
        onConfirm={removeSkill}
        onCancel={() => setPendingDelete(null)}
      />
    </Card>
  )
}

// ── Frontmatter summary table ───────────────────────────────────────────

function FrontmatterTable({
  frontmatter, excludeKeys,
}: {
  frontmatter: Record<string, string>
  excludeKeys: string[]
}) {
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
                <td className="w-1/3 align-top bg-muted/40 px-3 py-1.5 font-mono text-muted-foreground">
                  {key}
                </td>
                <td className="break-all px-3 py-1.5 font-mono text-foreground/90">
                  {value || <span className="text-muted-foreground/60">(empty)</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
