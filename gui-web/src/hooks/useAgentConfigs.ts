/**
 * useAgentConfigs — agent-type registry (global, cached).
 *
 * The full registry (identity/runtime/resources/...) is fetched once from
 * the backend and shared module-wide, mirroring useLibrary's cache
 * semantics. Consumers read the fields they need; while the registry is
 * still loading (null) they fall back to safe defaults.
 */
import { useCallback, useEffect, useState } from 'react'
import type { AgentTypeConfig } from '@/api'
import { fetchAgentConfigs } from '@/api'

// ── Global cache ──────────────────────────────────────────────────────
// The registry is immutable package metadata — fetch it once per session.

let cache: Record<string, AgentTypeConfig> | null = null
let inflight: Promise<Record<string, AgentTypeConfig>> | null = null

function load(): Promise<Record<string, AgentTypeConfig>> {
  if (cache) return Promise.resolve(cache)
  if (inflight) return inflight
  inflight = fetchAgentConfigs().then((data) => {
    cache = data
    return data
  })
  // A failed fetch must not poison the cache: drop it so the next caller retries.
  void inflight.catch(() => { inflight = null })
  return inflight
}

/** Clear the global registry cache (tests). */
export function resetAgentConfigsCache(): void {
  cache = null
  inflight = null
}

// ── Hook ──────────────────────────────────────────────────────────────

export interface UseAgentConfigsReturn {
  /** Full registry, or null while it is loading / unavailable. */
  agentConfigs: Record<string, AgentTypeConfig> | null
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useAgentConfigs(): UseAgentConfigsReturn {
  const [agentConfigs, setAgentConfigs] = useState<Record<string, AgentTypeConfig> | null>(() => cache)
  const [loading, setLoading] = useState(cache === null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    load()
      .then((data) => { if (!cancelled) setAgentConfigs(data) })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const refresh = useCallback(() => {
    cache = null
    inflight = null
    setLoading(true)
    setError(null)
    load()
      .then((data) => setAgentConfigs(data))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false))
  }, [])

  return { agentConfigs, loading, error, refresh }
}
