// @vitest-environment jsdom
/**
 * useAgentConfigs tests — global registry cache semantics.
 *
 * Verifies the registry is fetched once, shared across consumers/remounts,
 * refetchable via refresh(), and that a failed fetch does not poison the
 * cache.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useAgentConfigs, resetAgentConfigsCache } from './useAgentConfigs'

const mocks = vi.hoisted(() => ({
  fetchAgentConfigs: vi.fn(),
}))

vi.mock('@/api', () => ({
  fetchAgentConfigs: mocks.fetchAgentConfigs,
}))

afterEach(() => {
  cleanup()
  resetAgentConfigsCache()
  vi.clearAllMocks()
})

const REGISTRY = {
  claude: { prompt_file: 'CLAUDE.md', features: [], config_files: [], provider_apply_mode: 'overwrite' as const },
  codex: { prompt_file: 'AGENTS.md', features: [], config_files: [], provider_apply_mode: 'overwrite' as const },
}

describe('useAgentConfigs', () => {
  it('returns null while loading, then the full registry', async () => {
    mocks.fetchAgentConfigs.mockResolvedValue(REGISTRY)
    const { result } = renderHook(() => useAgentConfigs())
    expect(result.current.agentConfigs).toBeNull()
    await waitFor(() => expect(result.current.agentConfigs).toEqual(REGISTRY))
    expect(mocks.fetchAgentConfigs).toHaveBeenCalledTimes(1)
  })

  it('fetches once and shares the cache across consumers and remounts', async () => {
    mocks.fetchAgentConfigs.mockResolvedValue(REGISTRY)

    const a = renderHook(() => useAgentConfigs())
    const b = renderHook(() => useAgentConfigs())
    await waitFor(() => expect(mocks.fetchAgentConfigs).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(a.result.current.agentConfigs).toEqual(REGISTRY))
    expect(b.result.current.agentConfigs).toEqual(REGISTRY)

    a.unmount()
    b.unmount()

    const c = renderHook(() => useAgentConfigs())
    await waitFor(() => expect(c.result.current.agentConfigs).toEqual(REGISTRY))
    expect(mocks.fetchAgentConfigs).toHaveBeenCalledTimes(1)
  })

  it('refresh() invalidates the cache and refetches', async () => {
    mocks.fetchAgentConfigs.mockResolvedValue(REGISTRY)
    const { result } = renderHook(() => useAgentConfigs())
    await waitFor(() => expect(result.current.agentConfigs).toEqual(REGISTRY))
    expect(mocks.fetchAgentConfigs).toHaveBeenCalledTimes(1)

    const REGISTRY2 = {
      hermes: { prompt_file: 'SOUL.md', features: [], config_files: [], provider_apply_mode: 'additive' as const },
    }
    mocks.fetchAgentConfigs.mockResolvedValue(REGISTRY2)
    act(() => result.current.refresh())
    await waitFor(() => expect(mocks.fetchAgentConfigs).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.agentConfigs).toEqual(REGISTRY2))
  })

  it('a failed fetch does not poison the cache — next consumer retries', async () => {
    mocks.fetchAgentConfigs.mockRejectedValueOnce(new Error('bridge down'))
    const a = renderHook(() => useAgentConfigs())
    await waitFor(() => expect(a.result.current.error).toBe('bridge down'))
    expect(a.result.current.agentConfigs).toBeNull()

    mocks.fetchAgentConfigs.mockResolvedValue(REGISTRY)
    const b = renderHook(() => useAgentConfigs())
    await waitFor(() => expect(b.result.current.agentConfigs).toEqual(REGISTRY))
    expect(mocks.fetchAgentConfigs).toHaveBeenCalledTimes(2)
  })
})
