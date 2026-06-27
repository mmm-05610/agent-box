/**
 * useSkills — Skill data fetching hook
 */

import { useCallback, useEffect, useState } from 'react'
import type { AgentType, Skill } from '@/api'
import { fetchSkills } from '@/api'

interface UseSkillsReturn {
  skills: Skill[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useSkills(agentType: AgentType): UseSkillsReturn {
  const [skills, setSkills] = useState<Skill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchSkills(agentType)
      setSkills(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load skills')
    } finally {
      setLoading(false)
    }
  }, [agentType])

  useEffect(() => {
    void load()
  }, [load])

  return { skills, loading, error, refresh: load }
}
