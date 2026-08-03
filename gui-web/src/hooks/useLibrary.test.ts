// @vitest-environment jsdom
/**
 * useLibrary tests — global cache semantics (Stage 6).
 *
 * Verifies the library store loads each (agentType, slice) once, reuses it
 * across mounts/consumers, keeps per-agent caches separate, and refreshes
 * on demand.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { useLibrary, resetLibraryCache } from './useLibrary'

const mocks = vi.hoisted(() => ({
  fetchProviders: vi.fn(),
  fetchMcpServers: vi.fn(),
  fetchSkills: vi.fn(),
  fetchPrompts: vi.fn(),
}))

vi.mock('@/api', () => ({
  fetchProviders: mocks.fetchProviders,
  fetchMcpServers: mocks.fetchMcpServers,
  fetchSkills: mocks.fetchSkills,
  fetchPrompts: mocks.fetchPrompts,
}))

afterEach(() => {
  cleanup()
  resetLibraryCache()
  vi.clearAllMocks()
})

const PROVIDERS = [{ id: 'p1', name: 'P1', settings: { env: {} } }]
const SKILLS = [{ id: 's1', name: 'S1' }]
const MCP = [{ id: 'm1', name: 'M1', tags: [] }]
const PROMPTS = [{ id: 'c1', name: 'C1', content: 'hi', description: '' }]

describe('useLibrary', () => {
  it('loads each requested slice once and caches it across remounts', async () => {
    mocks.fetchProviders.mockResolvedValue(PROVIDERS)
    mocks.fetchSkills.mockResolvedValue(SKILLS)
    mocks.fetchMcpServers.mockResolvedValue(MCP)
    mocks.fetchPrompts.mockResolvedValue(PROMPTS)

    const first = renderHook(() => useLibrary('claude', ['providers', 'skills']))
    await waitFor(() => expect(first.result.current.providers).toEqual(PROVIDERS))
    await waitFor(() => expect(first.result.current.skills).toEqual(SKILLS))
    expect(mocks.fetchProviders).toHaveBeenCalledTimes(1)
    expect(mocks.fetchSkills).toHaveBeenCalledTimes(1)
    // Unrequested slices are never fetched (lazy per-slice loading).
    expect(mocks.fetchMcpServers).not.toHaveBeenCalled()
    expect(mocks.fetchPrompts).not.toHaveBeenCalled()

    first.unmount()

    const second = renderHook(() => useLibrary('claude', ['providers', 'skills']))
    await waitFor(() => expect(second.result.current.providers).toEqual(PROVIDERS))
    expect(mocks.fetchProviders).toHaveBeenCalledTimes(1)
    expect(mocks.fetchSkills).toHaveBeenCalledTimes(1)
  })

  it('dedupes concurrent consumers of the same agent slice', async () => {
    mocks.fetchProviders.mockResolvedValue(PROVIDERS)

    const a = renderHook(() => useLibrary('claude', ['providers']))
    const b = renderHook(() => useLibrary('claude', ['providers']))

    await waitFor(() => expect(mocks.fetchProviders).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(a.result.current.providers).toEqual(PROVIDERS))
    expect(b.result.current.providers).toEqual(PROVIDERS)
  })

  it('caches per agent type — different agents fetch separately', async () => {
    mocks.fetchProviders.mockResolvedValue(PROVIDERS)

    const a = renderHook(() => useLibrary('claude', ['providers']))
    await waitFor(() => expect(mocks.fetchProviders).toHaveBeenCalledTimes(1))

    const b = renderHook(() => useLibrary('codex', ['providers']))
    await waitFor(() => expect(mocks.fetchProviders).toHaveBeenCalledTimes(2))
    expect(mocks.fetchProviders).toHaveBeenCalledWith('claude')
    expect(mocks.fetchProviders).toHaveBeenCalledWith('codex')
    await waitFor(() => expect(a.result.current.providers).toEqual(PROVIDERS))
    await waitFor(() => expect(b.result.current.providers).toEqual(PROVIDERS))
  })

  it('refresh() invalidates the cache and refetches', async () => {
    mocks.fetchProviders.mockResolvedValue(PROVIDERS)

    const { result } = renderHook(() => useLibrary('claude', ['providers']))
    await waitFor(() => expect(result.current.providers).toEqual(PROVIDERS))
    expect(mocks.fetchProviders).toHaveBeenCalledTimes(1)

    mocks.fetchProviders.mockResolvedValue([{ id: 'p2', name: 'P2', settings: { env: {} } }])
    act(() => result.current.refresh())
    await waitFor(() => expect(mocks.fetchProviders).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.providers[0]?.id).toBe('p2'))
  })
})
