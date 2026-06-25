/**
 * useSessions — Session data fetching hook
 */

import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@/api'
import { fetchSessions } from '@/api'

interface UseSessionsReturn {
  sessions: Session[]
  running: Session[]
  exited: Session[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useSessions(): UseSessionsReturn {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchSessions()
      setSessions(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const running = sessions.filter((s) => !s.exitedAt)
  const exited = sessions.filter((s) => s.exitedAt)

  return { sessions, running, exited, loading, error, refresh: load }
}
