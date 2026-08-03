/**
 * useLibrary — ACS library data (global, cached).
 *
 * Library domain: every provider / MCP server / skill / prompt in the ACS,
 * queried per agent type. Loaded once per (agentType, slice) and cached in
 * a module-level store, so switching profiles never refetches the library.
 * Only the slices a consumer asks for are fetched (keys), keeping the call
 * pattern identical to the pre-split per-resource hooks.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AgentType, ClaudeMd, McpServer, Provider, Skill } from '@/api'
import { fetchClaudeMds, fetchMcpServers, fetchProviders, fetchSkills } from '@/api'
import i18n from '@/i18n'

export type LibraryKey = 'providers' | 'mcpServers' | 'skills' | 'prompts'

interface LibrarySlices {
  providers: Provider[]
  mcpServers: McpServer[]
  skills: Skill[]
  prompts: ClaudeMd[]
}

const ALL_KEYS: LibraryKey[] = ['providers', 'mcpServers', 'skills', 'prompts']

const FETCHERS: Record<LibraryKey, (agentType: AgentType) => Promise<unknown>> = {
  providers: fetchProviders,
  mcpServers: fetchMcpServers,
  skills: fetchSkills,
  prompts: fetchClaudeMds,
}

// ── Global cache ──────────────────────────────────────────────────────
// Keyed by (agentType, slice). A slice is fetched at most once per agent
// type until invalidated — every List on every page shares this store.

const cache: Partial<Record<string, Partial<Record<LibraryKey, unknown>>>> = {}
const inflight: Partial<Record<string, Partial<Record<LibraryKey, Promise<unknown>>>>> = {}

function loadSlice(agentType: AgentType, key: LibraryKey): Promise<unknown> {
  const cached = cache[agentType]?.[key]
  if (cached !== undefined) return Promise.resolve(cached)
  const pending = inflight[agentType]?.[key]
  if (pending) return pending
  const promise = FETCHERS[key](agentType).then((data) => {
    cache[agentType] = { ...(cache[agentType] ?? {}), [key]: data }
    return data
  })
  inflight[agentType] = { ...(inflight[agentType] ?? {}), [key]: promise }
  // A failed fetch must not poison the cache: drop it so the next caller retries.
  void promise.catch(() => {
    const entry = inflight[agentType]
    if (entry && entry[key] === promise) delete entry[key]
  })
  return promise
}

function snapshot(agentType: AgentType, keys: LibraryKey[]): Partial<LibrarySlices> {
  const out: Partial<LibrarySlices> = {}
  for (const key of keys) {
    const value = cache[agentType]?.[key]
    if (value !== undefined) out[key] = value as never
  }
  return out
}

function invalidate(agentType: AgentType, key: LibraryKey): void {
  const entry = cache[agentType]
  if (entry) delete entry[key]
  const pending = inflight[agentType]
  if (pending) delete pending[key]
}

/** Clear the global library cache (tests, or after the user edits the ACS). */
export function resetLibraryCache(): void {
  for (const agentType of Object.keys(cache) as string[]) delete cache[agentType]
  for (const agentType of Object.keys(inflight) as string[]) delete inflight[agentType]
}

// ── Hook ──────────────────────────────────────────────────────────────

export interface UseLibraryReturn {
  providers: Provider[]
  mcpServers: McpServer[]
  skills: Skill[]
  prompts: ClaudeMd[]
  loading: boolean
  error: string | null
  /** Refetch the given slices (defaults to the slices this hook requested). */
  refresh: (keys?: LibraryKey[]) => void
}

export function useLibrary(agentType: AgentType, keys: LibraryKey[] = ALL_KEYS): UseLibraryReturn {
  const keyStr = (keys.length > 0 ? keys : ALL_KEYS).join(',')
  const keyList = useMemo(() => keyStr.split(',') as LibraryKey[], [keyStr])
  const [state, setState] = useState<Partial<LibrarySlices>>(() => snapshot(agentType, keyList))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    Promise.all(keyList.map((key) => loadSlice(agentType, key)))
      .then(() => {
        if (!cancelled) setState(snapshot(agentType, keyList))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : i18n.t('error.loadLibrary'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [agentType, keyStr, keyList])

  const refresh = useCallback((targetKeys?: LibraryKey[]) => {
    const target = targetKeys && targetKeys.length > 0 ? targetKeys : keyList
    for (const key of target) invalidate(agentType, key)
    setLoading(true)
    setError(null)
    Promise.all(target.map((key) => loadSlice(agentType, key)))
      .then(() => setState(snapshot(agentType, target)))
      .catch((e) => setError(e instanceof Error ? e.message : i18n.t('error.loadLibrary')))
      .finally(() => setLoading(false))
  }, [agentType, keyList])

  return {
    providers: state.providers ?? [],
    mcpServers: state.mcpServers ?? [],
    skills: state.skills ?? [],
    prompts: state.prompts ?? [],
    loading,
    error,
    refresh,
  }
}
