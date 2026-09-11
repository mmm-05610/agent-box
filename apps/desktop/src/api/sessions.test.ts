import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/gateway-rpc', () => ({ isMissingRestEndpoint: vi.fn(() => false) }))
vi.mock('./client', () => ({
  capabilityScoped: vi.fn(),
  hermesApi: vi.fn(),
  profileScoped: vi.fn(() => ({}))
}))

const gatewayRpc = await import('@/lib/gateway-rpc')
const client = await import('./client')

const {
  deleteSession,
  fetchSessionsPage,
  fetchSidebarSessions,
  resetSidebarBatchCapability,
  setSessionArchived,
  setSessionPinnedRemote,
  setSessionUnreadRemote
} = await import('./sessions')

const hermesApi = vi.mocked(client.hermesApi)
const isMissingRestEndpoint = vi.mocked(gatewayRpc.isMissingRestEndpoint)

const sidebarRequest = {
  recentsProfile: 'default',
  recentsLimit: 40,
  recentsExclude: [],
  cronLimit: 20,
  messagingLimit: 40,
  messagingExclude: []
}

beforeEach(() => {
  vi.clearAllMocks()
  resetSidebarBatchCapability()
})

describe('deleteSession profile scoping', () => {
  it('scopes the DELETE to the owning profile in the URL (object owner)', async () => {
    // Regression: the sidebar "All Profiles" delete sent the profile only via
    // request.profile, not in the URL. On a remote gateway with no remoteProfile
    // alias the main-process path rewrite left the URL unscoped, so the backend
    // opened its own default state.db, missed the row, and returned
    // {ok:true, already_absent:true} — the row vanished optimistically but was
    // never deleted and came back on refresh. The URL must carry ?profile=.
    hermesApi.mockResolvedValue({ ok: true } as never)
    // Mirrors the real capabilityScoped for an object owner (remote-stamped row).
    vi.mocked(client.capabilityScoped).mockReturnValue({ profile: 'tommy', connectionId: 'hermes-pi' })

    await deleteSession('sess-1', { connectionId: 'hermes-pi', profile: 'tommy' })

    expect(hermesApi.mock.calls[0][0]).toMatchObject({
      method: 'DELETE',
      path: '/api/sessions/sess-1?profile=tommy',
      connectionId: 'hermes-pi',
      profile: 'tommy'
    })
  })

  it('scopes the DELETE to the owning profile in the URL (bare string owner)', async () => {
    hermesApi.mockResolvedValue({ ok: true } as never)
    // Bare-string owner: capabilityScoped resolves it to a profile scope.
    vi.mocked(client.capabilityScoped).mockReturnValue({ profile: 'tommy' })

    await deleteSession('sess-2', 'tommy')

    expect(hermesApi.mock.calls[0][0]).toMatchObject({
      method: 'DELETE',
      path: '/api/sessions/sess-2?profile=tommy'
    })
  })

  it('omits the profile query when no owner is known', async () => {
    hermesApi.mockResolvedValue({ ok: true } as never)

    await deleteSession('sess-3')

    expect(hermesApi.mock.calls[0][0]).toMatchObject({
      method: 'DELETE',
      path: '/api/sessions/sess-3'
    })
    expect((hermesApi.mock.calls[0][0] as { path: string }).path).not.toContain('profile=')
  })

  it('keeps an explicit local pin routed to the local pool', async () => {
    hermesApi.mockResolvedValue({ ok: true } as never)
    // capabilityScoped drops a 'local' connection id by design; sessionScoped
    // must re-add it so the request stays pinned to this device.
    vi.mocked(client.capabilityScoped).mockReturnValue({ profile: 'tommy' })

    await deleteSession('sess-4', { connectionId: 'local', profile: 'tommy' })

    expect(hermesApi.mock.calls[0][0]).toMatchObject({
      method: 'DELETE',
      path: '/api/sessions/sess-4?profile=tommy',
      connectionId: 'local',
      profile: 'tommy'
    })
  })
})

describe('setSessionArchived profile scoping', () => {
  it('carries the owning profile in the PATCH body', async () => {
    // Same class as the unscoped DELETE: the PATCH handler reads its target DB
    // from body.profile, so archiving a foreign-profile session must send it in
    // the body, not only as request.profile (Electron routing), or on a remote
    // gateway the archive lands on the wrong state.db and silently no-ops.
    hermesApi.mockResolvedValue({ ok: true } as never)

    await setSessionArchived('sess-a', true, 'tommy')

    expect(hermesApi.mock.calls[0][0]).toMatchObject({
      method: 'PATCH',
      path: '/api/sessions/sess-a',
      profile: 'tommy',
      body: { archived: true, profile: 'tommy' }
    })
  })

  it('omits the profile from the body when none is given', async () => {
    hermesApi.mockResolvedValue({ ok: true } as never)

    await setSessionArchived('sess-b', false)

    const request = hermesApi.mock.calls[0][0] as { body: Record<string, unknown> }
    expect(request).toMatchObject({ method: 'PATCH', body: { archived: false } })
    expect(request.body).not.toHaveProperty('profile')
  })
})

describe('setSessionPinnedRemote / setSessionUnreadRemote profile scoping', () => {
  it('carries the owning profile in the pin PATCH body', async () => {
    hermesApi.mockResolvedValue({ ok: true } as never)

    await setSessionPinnedRemote('sess-p', true, 'tommy')

    expect(hermesApi.mock.calls[0][0]).toMatchObject({
      method: 'PATCH',
      path: '/api/sessions/sess-p',
      profile: 'tommy',
      body: { pinned: true, profile: 'tommy' }
    })
  })

  it('carries the owning profile in the unread PATCH body', async () => {
    hermesApi.mockResolvedValue({ ok: true } as never)

    await setSessionUnreadRemote('sess-u', true, 'tommy')

    expect(hermesApi.mock.calls[0][0]).toMatchObject({
      method: 'PATCH',
      path: '/api/sessions/sess-u',
      profile: 'tommy',
      body: { unread: true, profile: 'tommy' }
    })
  })

  it('omits the profile from the body when none is given', async () => {
    hermesApi.mockResolvedValue({ ok: true } as never)

    await setSessionPinnedRemote('sess-p2', false)

    const request = hermesApi.mock.calls[0][0] as { body: Record<string, unknown> }
    expect(request).toMatchObject({ method: 'PATCH', body: { pinned: false } })
    expect(request.body).not.toHaveProperty('profile')
  })
})

describe('the session list surface returns the backend page untouched', () => {
  it('neither stamps registry ownership nor trims the page to its window', async () => {
    // Both of those are APPLICATION policy (see @/application/session-lists):
    // the stamp needs the active registry connection, the window needs the
    // caller's LIMIT. A raw page here is what keeps this module a leaf.
    const rows = Array.from({ length: 45 }, (_, index) => ({
      id: `row-${index}`,
      pinned: index < 2,
      profile: 'default',
      source: 'desktop',
      title: `Row ${index}`
    }))

    hermesApi.mockResolvedValue({ limit: 40, offset: 0, sessions: rows, total: 45 } as never)

    const page = await fetchSessionsPage(40, 1)

    expect(page.sessions).toHaveLength(45)
    expect(page.sessions.every(row => row.connection_id === undefined)).toBe(true)
    expect(hermesApi.mock.calls[0][0]).toMatchObject({
      path: '/api/sessions?limit=40&offset=0&min_messages=1&archived=exclude&order=recent',
      timeoutMs: 60_000
    })
  })

  it('returns the batched sidebar slices untouched when the route exists', async () => {
    hermesApi.mockResolvedValue({
      cron: { sessions: [] },
      messaging: { sessions: [] },
      recents: { sessions: [{ id: 'remote-session', pinned: false, profile: 'default' }] }
    } as never)

    const result = await fetchSidebarSessions(sidebarRequest)

    expect(result.recents.sessions[0]).toMatchObject({ id: 'remote-session' })
    expect(result.recents.sessions[0].connection_id).toBeUndefined()
    expect(hermesApi).toHaveBeenCalledTimes(1)
  })
})

describe('batched sidebar route skew', () => {
  it('falls back to the three per-slice reads and remembers the dead route', async () => {
    // The batched route shipped later than the per-slice one, so a newer
    // desktop can meet an older backend. Endpoint-missing is a capability
    // verdict, not a transient failure: probe once, then serve every refresh
    // from the proven calls.
    isMissingRestEndpoint.mockReturnValue(true)
    hermesApi.mockImplementation(async ({ path }: { path: string }) => {
      if (path.includes('/sidebar')) {
        throw new Error('404: {"detail":"No such API endpoint: /api/profiles/sessions/sidebar"}')
      }

      return {
        limit: 0,
        offset: 0,
        sessions: Array.from({ length: 3 }, (_, index) => ({
          id: `pinned-${index}`,
          pinned: true,
          profile: 'default'
        })),
        total: 3
      } as never
    })

    const result = await fetchSidebarSessions(sidebarRequest)

    // One batched attempt + three per-slice reads.
    expect(hermesApi).toHaveBeenCalledTimes(4)
    const paths = hermesApi.mock.calls.map(call => (call[0] as { path: string }).path)
    expect(paths[1]).toContain('/api/profiles/sessions?limit=40&offset=0&min_messages=1')
    expect(paths[2]).toContain('source=cron')
    expect(result.recents.sessions).toHaveLength(3)
    // A back-filled pin is not a full window: counting them would leave a
    // "Load more" that can never resolve.
    expect(result.recents.profiles_truncated).toEqual({ default: false })

    hermesApi.mockClear()
    await fetchSidebarSessions(sidebarRequest)
    expect(hermesApi).toHaveBeenCalledTimes(3)
    expect(hermesApi.mock.calls.every(call => !(call[0] as { path: string }).path.includes('/sidebar'))).toBe(true)
  })
})
