/**
 * useProfiles — Profile data fetching hook
 */

import { useCallback, useEffect, useState } from 'react'
import type { AgentType, Profile } from '@/api'
import { fetchProfiles } from '@/api'

interface UseProfilesReturn {
  profiles: Profile[]
  loading: boolean
  error: string | null
  refresh: () => void
  filterByType: (agentType: AgentType | 'all') => Profile[]
}

export function useProfiles(): UseProfilesReturn {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchProfiles()
      setProfiles(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filterByType = useCallback(
    (agentType: AgentType | 'all') => {
      if (agentType === 'all') return profiles
      return profiles.filter((p) => p.agentType === agentType)
    },
    [profiles],
  )

  return { profiles, loading, error, refresh: load, filterByType }
}
