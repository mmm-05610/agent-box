import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/api/client', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getApiRequestConnection: vi.fn(() => null),
  hermesApi: vi.fn()
}))
vi.mock('@/api/sessions', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  fetchAllProfileSessionsPage: vi.fn(),
  fetchSessionsPage: vi.fn(),
  fetchSidebarSessions: vi.fn()
}))

const client = await import('@/api/client')
const api = await import('@/api/sessions')

const { listAllProfileSessions, listSessions, listSidebarSessions } = await import('./session-lists')
const { resetLegacyOwnerBackfillAttempts } = await import('./legacy-session-owner-backfill')
const { $connectionsRegistry } = await import('@/store/connection-registry-state')

const getApiRequestConnection = vi.mocked(client.getApiRequestConnection)
const hermesApi = vi.mocked(client.hermesApi)
const fetchSessionsPage = vi.mocked(api.fetchSessionsPage)
const fetchAllProfileSessionsPage = vi.mocked(api.fetchAllProfileSessionsPage)
const fetchSidebarSessions = vi.mocked(api.fetchSidebarSessions)

const row = (over: Record<string, unknown> = {}) => ({
  id: 'session-1',
  pinned: false,
  profile: 'default',
  source: 'desktop',
  title: 'Session',
  ...over
})

const page = (sessions: unknown[]) => ({ limit: 40, offset: 0, sessions, total: sessions.length }) as never

const sidebarRequest = {
  recentsProfile: 'default',
  recentsLimit: 40,
  recentsExclude: [],
  cronLimit: 20
}

beforeEach(() => {
  vi.clearAllMocks()
  resetLegacyOwnerBackfillAttempts()
  getApiRequestConnection.mockReturnValue(null)
  fetchSessionsPage.mockResolvedValue(page([]))
  fetchAllProfileSessionsPage.mockResolvedValue(page([]))
  hermesApi.mockResolvedValue({ ok: true, profile: 'default', stamped: 0 } as never)
})

afterEach(() => {
  $connectionsRegistry.set(null)
  Reflect.deleteProperty(window, 'hermesDesktop')
})

describe('registry ownership stamping', () => {
  it('stamps an untagged row with the active registered connection', async () => {
    // The gateway's HTTP APIs know nothing about Desktop-local registry ids, so
    // an untagged remote row would let a later resume fall back to a same-named
    // local profile.
    getApiRequestConnection.mockReturnValue('prometheus')
    fetchSessionsPage.mockResolvedValue(page([row()]))

    const result = await listSessions(40, 1)

    expect(result.sessions[0]).toMatchObject({ connection_id: 'prometheus', id: 'session-1' })
  })

  it('never clobbers an owner the response already named', async () => {
    getApiRequestConnection.mockReturnValue('prometheus')
    fetchSessionsPage.mockResolvedValue(page([row({ connection_id: 'gw-b' })]))

    const result = await listSessions()

    expect(result.sessions[0].connection_id).toBe('gw-b')
  })

  it("leaves rows alone on the local pool and with no active source", async () => {
    fetchSessionsPage.mockResolvedValue(page([row()]))

    expect((await listSessions()).sessions[0].connection_id).toBeUndefined()

    getApiRequestConnection.mockReturnValue('local')

    expect((await listSessions()).sessions[0].connection_id).toBeUndefined()
  })

  it('stamps every batched sidebar slice', async () => {
    getApiRequestConnection.mockReturnValue('prometheus')
    fetchSidebarSessions.mockResolvedValue({
      cron: { sessions: [row({ id: 'cron-1' })] },
      recents: { sessions: [row({ id: 'rec-1' })] }
    } as never)

    const result = await listSidebarSessions(sidebarRequest)

    expect(result.recents.sessions[0].connection_id).toBe('prometheus')
    expect(result.cron.sessions[0].connection_id).toBe('prometheus')
  })

  it('stamps the legacy per-slice fallback the same way', async () => {
    getApiRequestConnection.mockReturnValue('prometheus')
    fetchSidebarSessions.mockResolvedValue({
      cron: { sessions: [row({ id: 'cron-1' })] },
      recents: { profiles_truncated: {}, sessions: [row({ id: 'rec-1' })] }
    } as never)

    const result = await listSidebarSessions(sidebarRequest)

    expect(result.recents.sessions[0].connection_id).toBe('prometheus')
    expect(result.cron.sessions[0].connection_id).toBe('prometheus')
  })
})

describe('the pinned-row window', () => {
  it('trims the page to its LIMIT without dropping back-filled pins', async () => {
    // A pin means "always reachable", so the endpoint appends aged-out pinned
    // rows past LIMIT. A plain slice would throw exactly those away.
    const rows = [
      ...Array.from({ length: 40 }, (_, index) => row({ id: `recent-${index}` })),
      row({ id: 'aged-pin', pinned: true }),
      row({ id: 'aged-unpinned' })
    ]

    fetchSessionsPage.mockResolvedValue(page(rows))

    const result = await listSessions(40)

    expect(result.sessions.map(session => session.id)).not.toContain('aged-unpinned')
    expect(result.sessions.map(session => session.id)).toContain('aged-pin')
    expect(result.offset).toBe(0)
    expect(result.sessions).toHaveLength(41)
  })
})

describe('the one-shot legacy owner backfill', () => {
  const withRegistryTopology = () => {
    $connectionsRegistry.set({ connections: [{ id: 'gw-b' }] } as never)
  }

  it('posts the serving store exactly once per scope, and re-arms on reset', async () => {
    withRegistryTopology()

    await listSessions()
    await listSessions()
    await listAllProfileSessions()
    // Fire-and-forget: the request is issued, not awaited by the caller.
    await vi.waitFor(() => expect(hermesApi).toHaveBeenCalledTimes(1))

    expect(hermesApi).toHaveBeenCalledWith({
      body: {},
      method: 'POST',
      path: '/api/sessions/owner-backfill'
    })

    resetLegacyOwnerBackfillAttempts()
    await listSessions()

    await vi.waitFor(() => expect(hermesApi).toHaveBeenCalledTimes(2))
  })

  it('targets the serving registered connection when one served the page', async () => {
    withRegistryTopology()
    getApiRequestConnection.mockReturnValue('gw-b')

    await listSessions()

    await vi.waitFor(() => expect(hermesApi).toHaveBeenCalledTimes(1))
    expect(hermesApi).toHaveBeenCalledWith({
      body: {},
      connectionId: 'gw-b',
      method: 'POST',
      path: '/api/sessions/owner-backfill'
    })
  })

  it('does nothing without registry topology', async () => {
    await listSessions()

    expect(hermesApi).not.toHaveBeenCalled()
  })

  it('never fails or blocks the list that triggered it', async () => {
    withRegistryTopology()
    hermesApi.mockRejectedValue(new Error('network down'))
    fetchSessionsPage.mockResolvedValue(page([row()]))

    const result = await listSessions()

    expect(result.sessions).toHaveLength(1)
    await vi.waitFor(() => expect(hermesApi).toHaveBeenCalledTimes(1))
  })

  it('stays armed-off for a backend that has no such route', async () => {
    withRegistryTopology()

    // Version skew: the backend predates the endpoint. Re-probing a known-dead
    // route on every refresh would be pure noise.
    hermesApi.mockRejectedValue(new Error('404: {"detail":"No such API endpoint: /api/sessions/owner-backfill"}'))
    await listSessions()
    await vi.waitFor(() => expect(hermesApi).toHaveBeenCalledTimes(1))

    await listSessions()
    await Promise.resolve()
    expect(hermesApi).toHaveBeenCalledTimes(1)
  })

  it('re-arms after a transient failure so the next refresh retries', async () => {
    withRegistryTopology()
    hermesApi.mockRejectedValue(new Error('network down'))

    await listSessions()
    await vi.waitFor(() => expect(hermesApi).toHaveBeenCalledTimes(1))

    await listSessions()
    await vi.waitFor(() => expect(hermesApi).toHaveBeenCalledTimes(2))
  })
})
