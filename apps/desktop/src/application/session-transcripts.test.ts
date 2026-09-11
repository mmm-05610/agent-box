import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getApiRequestConnection: vi.fn(() => null)
}))
vi.mock('@/api/sessions', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchLatestSessionMessages: vi.fn()
}))

const client = await import('@/api/client')
const api = await import('@/api/sessions')

const { fetchStoredTranscriptAcrossBackends, getLatestSessionMessages } = await import('./session-transcripts')
const { $connectionsRegistry } = await import('@/store/connection-registry-state')
const { $transcriptTailBySessionId, transcriptTailState } = await import('@/store/transcript-tail')

const getApiRequestConnection = vi.mocked(client.getApiRequestConnection)
const fetchLatestSessionMessages = vi.mocked(api.fetchLatestSessionMessages)

const fullPage = (sessionId: string) => ({
  messages: Array.from({ length: 120 }, (_, index) => ({ content: `m${index}`, id: index, role: 'user' })),
  pagination: { limit: 120, offset: 0, order: 'latest', returned: 120 },
  session_id: sessionId
})

beforeEach(() => {
  vi.clearAllMocks()
  $transcriptTailBySessionId.set({})
  getApiRequestConnection.mockReturnValue(null)
})

afterEach(() => {
  $connectionsRegistry.set(null)
})

describe('the tail hydration use-case', () => {
  it('records truncation under both the requested and the resolved session id', async () => {
    // Callers hold either id — an alias or prefix resolves on the way back — so
    // a miss on one of them would silently disable "Show earlier".
    fetchLatestSessionMessages.mockResolvedValue(fullPage('resolved-1') as never)

    await getLatestSessionMessages('prefix-1')

    expect(transcriptTailState('prefix-1')).toMatchObject({ nextOffset: 120, possiblyTruncated: true })
    expect(transcriptTailState('resolved-1')).toMatchObject({ nextOffset: 120, possiblyTruncated: true })
  })

  it('records a short page as complete', async () => {
    fetchLatestSessionMessages.mockResolvedValue({ messages: [], session_id: 'same-1' } as never)

    await getLatestSessionMessages('same-1')

    expect(transcriptTailState('same-1')).toMatchObject({ possiblyTruncated: false })
  })

  it('passes the caller scope through to the request and the bookkeeping', async () => {
    fetchLatestSessionMessages.mockResolvedValue(fullPage('stored-1') as never)

    await getLatestSessionMessages('stored-1', { connectionId: 'gw-b', profile: 'work' })

    expect(fetchLatestSessionMessages).toHaveBeenCalledWith('stored-1', { connectionId: 'gw-b', profile: 'work' })
    expect(transcriptTailState('stored-1', { connectionId: 'gw-b', profile: 'work' })).toMatchObject({
      possiblyTruncated: true
    })
  })
})

describe('the read-only stored-transcript probe', () => {
  it('answers from the ambient store without touching the registry', async () => {
    $connectionsRegistry.set({ connections: [{ id: 'gw-b' }] } as never)
    fetchLatestSessionMessages.mockResolvedValue({ messages: [], session_id: 'ambient-1' } as never)

    const result = await fetchStoredTranscriptAcrossBackends('ambient-1')

    expect(result?.session_id).toBe('ambient-1')
    expect(fetchLatestSessionMessages).toHaveBeenCalledTimes(1)
  })

  it('probes every registered backend, skipping local and the active source', async () => {
    // A miss is a plain 404: no session is minted or resumed anywhere, which is
    // what makes probing safe where live routing would be a guess.
    $connectionsRegistry.set({
      connections: [{ id: 'gw-b' }, { id: 'local' }, { id: 'gw-active' }, { id: 'gw-c' }]
    } as never)
    getApiRequestConnection.mockReturnValue('gw-active')
    fetchLatestSessionMessages.mockImplementation(async (id, scope) => {
      if ((scope as { connectionId?: string })?.connectionId === 'gw-c') {
        return { messages: [], session_id: id } as never
      }

      throw new Error('not on this backend')
    })

    const result = await fetchStoredTranscriptAcrossBackends('stored-1')

    expect(result?.session_id).toBe('stored-1')
    expect(fetchLatestSessionMessages.mock.calls.map(call => call[1])).toEqual([
      undefined,
      { connectionId: 'gw-b', profile: 'default' },
      { connectionId: 'gw-c', profile: 'default' }
    ])
  })

  it('returns null when no reachable backend holds the transcript', async () => {
    $connectionsRegistry.set({ connections: [{ id: 'gw-b' }] } as never)
    fetchLatestSessionMessages.mockRejectedValue(new Error('not found'))

    await expect(fetchStoredTranscriptAcrossBackends('missing-1')).resolves.toBeNull()
  })

  it('records the tail for the backend that answered', async () => {
    $connectionsRegistry.set({ connections: [{ id: 'gw-b' }] } as never)
    fetchLatestSessionMessages.mockImplementation(async (id, scope) => {
      if ((scope as { connectionId?: string })?.connectionId !== 'gw-b') {
        throw new Error('not on this backend')
      }

      return fullPage(id) as never
    })

    await fetchStoredTranscriptAcrossBackends('stored-2')

    expect(transcriptTailState('stored-2', { connectionId: 'gw-b', profile: 'default' })).toMatchObject({
      possiblyTruncated: true
    })
  })
})
