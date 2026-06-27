/**
 * useMcpServers — MCP server data fetching hook
 */

import { useCallback, useEffect, useState } from 'react'
import type { AgentType, McpServer } from '@/api'
import { fetchMcpServers } from '@/api'

interface UseMcpServersReturn {
  mcpServers: McpServer[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useMcpServers(agentType: AgentType): UseMcpServersReturn {
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await fetchMcpServers(agentType)
      setMcpServers(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load MCP servers')
    } finally {
      setLoading(false)
    }
  }, [agentType])

  useEffect(() => {
    void load()
  }, [load])

  return { mcpServers, loading, error, refresh: load }
}
