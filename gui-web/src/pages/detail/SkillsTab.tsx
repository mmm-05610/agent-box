/**
 * Skills Tab — shows skills applied to this profile.
 * Reads dot-claude/skills/ directory listing.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui'
import { listDir } from '@/api/files'

export function SkillsTab({ configDir }: { profileName: string; configDir: string }) {
  const [skills, setSkills] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const skillsDir = `${configDir}/skills`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const listing = await listDir(skillsDir)
      // Simple parse of ls-like output to extract directory names
      const dirs = listing
        .split('\n')
        .filter((l) => l.startsWith('d') || l.includes('/'))
        .map((l) => l.split('/').pop()?.trim() ?? l.trim())
        .filter(Boolean)
      setSkills(dirs.length > 0 ? dirs : [])
    } catch { setSkills([]) }
    finally { setLoading(false) }
  }, [skillsDir])

  useEffect(() => { void load() }, [load])

  return (
    <Card>
      <CardHeader><CardTitle>Skills ({skills.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : skills.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No skills installed in this profile. Apply from Library.
          </p>
        ) : (
          skills.map((name) => (
            <div key={name} className="p-3 rounded-md bg-muted">
              <span className="text-sm font-mono text-foreground">{name}</span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
