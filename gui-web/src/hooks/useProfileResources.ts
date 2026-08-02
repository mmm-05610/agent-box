/**
 * useProfileResources — per-profile installed data (object domain).
 *
 * Tracks the current profile's installed providers / MCP servers / skills.
 * Reloads whenever profileName changes and exposes refresh() for callers to
 * invoke after apply / remove / save writes. Installed skills are scanned
 * from the profile's local skills dir (only when includeSkills is set).
 */

import { useCallback, useEffect, useState } from 'react'
import { findFiles, readFile } from '@/api/files'
import type { ProfileMcp, ProfileProvider } from '@/api'
import { fetchProfileMcp, fetchProfileProviders } from '@/api'
import { useProfileConfigDir } from './useProfileConfigDir'
import i18n from '@/i18n'

// ── Installed skills (file-backed) ─────────────────────────────────────

export interface InstalledSkill {
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

export function parseFrontmatter(content: string): Record<string, string> {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^---\s*\n([\s\S]*?)\n---(?:\s*\n|$)/)
  if (!match) return {}
  const values: Record<string, string> = {}
  const body = match[1] ?? ''
  for (const line of body.split('\n')) {
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!field) continue
    const key = field[1] ?? ''
    const value = field[2] ?? ''
    values[key] = value.trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return values
}

function relativePath(path: string, root: string): string {
  const r = root.replace(/\/+$/, '')
  return path.startsWith(`${r}/`) ? path.slice(r.length + 1) : path
}

async function loadInstalledSkills(dir: string, root: string): Promise<InstalledSkill[]> {
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

// ── Hook ──────────────────────────────────────────────────────────────

export interface UseProfileResourcesOptions {
  /** Also scan the profile's local skills dir (default false). */
  includeSkills?: boolean
}

export interface UseProfileResourcesReturn {
  providers: ProfileProvider[]
  mcp: ProfileMcp[]
  skills: InstalledSkill[]
  configDir: string | null
  loading: boolean
  /** Loading state for the skills scan (only meaningful with includeSkills). */
  skillsLoading: boolean
  error: string | null
  /** Reload all per-profile data after a successful write. */
  refresh: () => void
  /** Patch a single installed skill in place (after editing its file). */
  updateSkill: (updated: InstalledSkill) => void
}

export function useProfileResources(
  profileName: string,
  options: UseProfileResourcesOptions = {},
): UseProfileResourcesReturn {
  const configDir = useProfileConfigDir(profileName)
  const skillsDir = configDir === null ? null : `${configDir.replace(/\/+$/, '')}/skills`

  const [providers, setProviders] = useState<ProfileProvider[]>([])
  const [mcp, setMcp] = useState<ProfileMcp[]>([])
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [loading, setLoading] = useState(true)
  const [skillsLoading, setSkillsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)

  const load = useCallback(async () => {
    if (!profileName) return
    setLoading(true)
    setError(null)
    try {
      const [p, m] = await Promise.all([
        fetchProfileProviders(profileName),
        fetchProfileMcp(profileName),
      ])
      setProviders(p)
      setMcp(m)
    } catch (e) {
      setProviders([])
      setMcp([])
      setError(e instanceof Error ? e.message : i18n.t('error.loadProfileResources'))
    } finally {
      setLoading(false)
    }
  }, [profileName])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!options.includeSkills || !skillsDir) return
    let cancelled = false
    setSkillsLoading(true)
    loadInstalledSkills(skillsDir, skillsDir)
      .then((list) => { if (!cancelled) setSkills(list) })
      .catch(() => { if (!cancelled) setSkills([]) })
      .finally(() => { if (!cancelled) setSkillsLoading(false) })
    return () => { cancelled = true }
  }, [options.includeSkills, skillsDir, refreshTick])

  const refresh = useCallback(() => {
    setRefreshTick((t) => t + 1)
    void load()
  }, [load])

  const updateSkill = useCallback((updated: InstalledSkill) => {
    setSkills((prev) => prev.map((s) => (s.id === updated.id ? updated : s)))
  }, [])

  return {
    providers,
    mcp,
    skills,
    configDir,
    loading,
    skillsLoading,
    error,
    refresh,
    updateSkill,
  }
}
