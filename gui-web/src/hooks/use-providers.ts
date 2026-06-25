/**
 * useProviders — Provider data fetching hook
 */

import { useCallback, useEffect, useState } from 'react'
import type { AgentType, ClaudeMd, Provider } from '@/api'
import {
  fetchClaudeMds,
  fetchProviders,
} from '@/api'

interface UseProvidersReturn {
  providers: Provider[]
  claudeMds: ClaudeMd[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useProviders(agentType: AgentType): UseProvidersReturn {
  const [providers, setProviders] = useState<Provider[]>([])
  const [claudeMds, setClaudeMds] = useState<ClaudeMd[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, m] = await Promise.all([
        fetchProviders(agentType),
        fetchClaudeMds(agentType),
      ])
      setProviders(p)
      setClaudeMds(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [agentType])

  useEffect(() => {
    void load()
  }, [load])

  return { providers, claudeMds, loading, error, refresh: load }
}
