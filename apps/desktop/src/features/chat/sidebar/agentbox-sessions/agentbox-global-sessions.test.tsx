// @vitest-environment jsdom
//
// P05 — the AgentBox authority's global session surfaces: search and Archived.
// Both read `$agentBoxSessions` (the service cache); only Archived asks the
// service for more — ONE `sessions.list` with `includeArchived: true`, and only
// while the service is ready and its hello declares `sessions.list`. Nothing
// here converts a SessionRecord into a legacy SessionInfo, calls a legacy
// Hermes endpoint, or lets a failure read as "no results".
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WireUnavailableError } from '@/api/wire-v1-client'
import { $agentBoxHello, $agentBoxService, $agentBoxSessions } from '@/store/agentbox-service'
import { asWireId, type ServerHelloResult, type SessionRecord, WIRE_PROTOCOL_VERSION } from '@/types/wire/wire-v1'

import {
  type AgentBoxGlobalMode,
  AgentBoxGlobalSessions,
  projectAgentBoxGlobalSessions,
  sortAgentBoxSessions
} from './agentbox-global-sessions'

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => wireClient }))
vi.mock('@/application/session/open-session', () => ({ openSession: openSessionMock }))

const wireClient = { call: vi.fn() }
const openSessionMock = vi.hoisted(() => vi.fn())

const session = (overrides: Omit<Partial<SessionRecord>, 'id'> & { id?: string } = {}): SessionRecord => {
  const { id = 'session-1', ...rest } = overrides

  return {
    archivedAt: null,
    createdAt: '2026-09-14T00:00:00.000Z',
    displayName: `Session ${id}`,
    id: asWireId(id),
    pinned: false,
    profileId: null,
    updatedAt: '2026-09-14T00:00:00.000Z',
    version: 1,
    workspaceId: asWireId('workspace-1'),
    ...rest
  }
}

const hello = (ids: string[] = ['sessions.list']): ServerHelloResult => ({
  auth: { required: false },
  capabilities: ids.map(id => ({ id, supported: true })),
  protocolVersion: WIRE_PROTOCOL_VERSION,
  serverId: asWireId('server-1')
})

// The component's only "open" verb is `openSession` from
// application/session/open-session — mocked here so the exact call is provable.
function renderGlobal(mode: AgentBoxGlobalMode, query?: string) {
  return render(
    <MemoryRouter>
      <AgentBoxGlobalSessions mode={mode} query={query} />
    </MemoryRouter>
  )
}

beforeEach(() => {
  wireClient.call.mockReset()
  wireClient.call.mockResolvedValue({ items: [] })
  openSessionMock.mockClear()
  $agentBoxService.set({ detail: null, phase: 'ready' })
  $agentBoxHello.set(hello())
  $agentBoxSessions.set({})
})

afterEach(() => {
  cleanup()
  $agentBoxSessions.set({})
  $agentBoxHello.set(null)
  $agentBoxService.set({ detail: null, phase: 'idle' })
})

describe('AgentBox global session projection', () => {
  it('search matches displayName and service id, case-insensitively, over live records only', () => {
    const sessions = {
      a: session({ displayName: 'Fix The Login Flow', id: 'a' }),
      b: session({ displayName: 'Something else', id: 'session-Beta' }),
      c: session({ archivedAt: '2026-09-01T00:00:00.000Z', displayName: 'Fix archived copy', id: 'c' }),
      d: session({ displayName: 'Unrelated', id: 'd' })
    }

    expect(projectAgentBoxGlobalSessions(sessions, 'search', 'fix').map(s => s.id)).toEqual(['a'])
    // The service id is searchable too, and case never matters.
    expect(projectAgentBoxGlobalSessions(sessions, 'search', 'beta').map(s => s.id)).toEqual(['session-Beta'])
    // Archived records never leak into the live search set.
    expect(projectAgentBoxGlobalSessions(sessions, 'search', 'archived')).toEqual([])
  })

  it('archived is the complementary set: archivedAt !== null, never a live record', () => {
    const sessions = {
      live: session({ id: 'live' }),
      gone: session({ archivedAt: '2026-09-01T00:00:00.000Z', id: 'gone' })
    }

    expect(projectAgentBoxGlobalSessions(sessions, 'archived').map(s => s.id)).toEqual(['gone'])
  })

  it('orders pinned first, then newest updatedAt, with the id as the tie-break', () => {
    const records = [
      session({ id: 'a', updatedAt: '2026-09-14T09:00:00.000Z' }),
      session({ id: 'b', pinned: true, updatedAt: '2026-09-01T00:00:00.000Z' }),
      session({ id: 'c', updatedAt: '2026-09-14T09:00:00.000Z' }),
      session({ id: 'd', updatedAt: '2026-09-14T11:00:00.000Z' })
    ]

    expect(sortAgentBoxSessions(records).map(s => s.id)).toEqual(['b', 'd', 'a', 'c'])
  })
})

describe('AgentBoxGlobalSessions — archived', () => {
  it('asks the service once with includeArchived and shows archived records, never live ones', async () => {
    wireClient.call.mockResolvedValue({
      items: [
        session({ archivedAt: '2026-09-01T00:00:00.000Z', displayName: 'Archived one', id: 'session-archived' }),
        session({ displayName: 'Live one', id: 'session-live' })
      ]
    })

    const { container } = renderGlobal('archived')

    await waitFor(() => {
      expect(container.querySelector('[data-agentbox-session-row="session-archived"]')).not.toBeNull()
    })

    expect(container.querySelector('[data-agentbox-session-row="session-live"]')).toBeNull()
    expect(wireClient.call).toHaveBeenCalledTimes(1)
    expect(wireClient.call).toHaveBeenCalledWith('sessions.list', { includeArchived: true })
  })

  it('never asks twice, even when the cache changes under it', async () => {
    renderGlobal('archived')

    await waitFor(() => {
      expect(wireClient.call).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      $agentBoxSessions.set({
        'session-late': session({ archivedAt: '2026-09-02T00:00:00.000Z', id: 'session-late' })
      })
    })

    expect(wireClient.call).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Session session-late')).toBeTruthy()
  })

  it('sends NOTHING when hello does not declare sessions.list, and names the state', () => {
    $agentBoxHello.set(hello(['sessions.update']))

    const { container } = renderGlobal('archived')

    expect(wireClient.call).not.toHaveBeenCalled()
    expect(container.querySelector('[data-agentbox-global-unsupported]')?.textContent).toContain(
      'does not support listing sessions'
    )
    // An unfetchable archived set is never presented as "nothing archived".
    expect(container.querySelector('[data-agentbox-global-empty]')).toBeNull()
  })

  it('sends NOTHING while the service is not ready, and waits honestly', () => {
    $agentBoxService.set({ detail: 'starting', phase: 'loading' })

    const { container } = renderGlobal('archived')

    expect(wireClient.call).not.toHaveBeenCalled()
    expect(container.querySelector('[data-agentbox-global-loading]')).not.toBeNull()
    expect(container.querySelector('[data-agentbox-global-empty]')).toBeNull()
  })

  it('a typed failure shows the service reason and keeps the cached archived rows', async () => {
    $agentBoxSessions.set({
      'session-cached': session({ archivedAt: '2026-09-01T00:00:00.000Z', displayName: 'Cached archive', id: 'session-cached' })
    })
    wireClient.call.mockRejectedValue(new WireUnavailableError('connect ECONNREFUSED 127.0.0.1:8732'))

    const { container } = renderGlobal('archived')

    await waitFor(() => {
      expect(container.querySelector('[data-agentbox-global-error]')).not.toBeNull()
    })

    expect(container.querySelector('[data-agentbox-session-row="session-cached"]')).not.toBeNull()
    expect(container.querySelector('[data-agentbox-global-error-message]')?.textContent).toContain(
      'connect ECONNREFUSED 127.0.0.1:8732'
    )
    expect(container.querySelector('[data-agentbox-global-empty]')).toBeNull()
  })

  it('keeps cached rows beside the service state while unavailable — no request, no fake empty', () => {
    $agentBoxService.set({ detail: 'connect ECONNREFUSED 127.0.0.1:8732', phase: 'unavailable' })
    $agentBoxSessions.set({
      'session-cached': session({ archivedAt: '2026-09-01T00:00:00.000Z', displayName: 'Cached archive', id: 'session-cached' })
    })

    const { container } = renderGlobal('archived')

    expect(container.querySelector('[data-agentbox-session-row="session-cached"]')).not.toBeNull()
    expect(container.querySelector('[data-agentbox-global-unavailable]')?.textContent).toContain(
      'connect ECONNREFUSED 127.0.0.1:8732'
    )
    expect(wireClient.call).not.toHaveBeenCalled()
    expect(container.querySelector('[data-agentbox-global-empty]')).toBeNull()
  })
})

describe('AgentBoxGlobalSessions — search', () => {
  it('filters the service cache locally and never calls the service', () => {
    $agentBoxSessions.set({
      'session-login': session({ displayName: 'Fix the login flow', id: 'session-login' }),
      'session-other': session({ displayName: 'Unrelated work', id: 'session-other' })
    })

    const { container } = renderGlobal('search', 'LOGIN')

    expect(container.querySelector('[data-agentbox-session-row="session-login"]')).not.toBeNull()
    expect(container.querySelector('[data-agentbox-session-row="session-other"]')).toBeNull()
    expect(wireClient.call).not.toHaveBeenCalled()
  })

  it('shows the no-match copy for an empty result set, still with zero requests', () => {
    const { container } = renderGlobal('search', 'nothing-matches-this')

    expect(container.querySelector('[data-agentbox-global-empty]')).not.toBeNull()
    expect(wireClient.call).not.toHaveBeenCalled()
  })

  it('opens a result by its SERVICE session id through the one open door', async () => {
    $agentBoxSessions.set({ 'session-open': session({ displayName: 'Open me', id: 'session-open' }) })

    renderGlobal('search', 'open')

    fireEvent.click(screen.getByRole('button', { name: /Open me/ }))

    await act(async () => {})

    // The stored/session id handed to the ONE open verb is the service id, and
    // the intent is the sidebar's "in-place" — never a legacy pin/archive/
    // delete/branch action.
    expect(openSessionMock).toHaveBeenCalledTimes(1)
    expect(openSessionMock).toHaveBeenCalledWith('session-open', expect.any(Function), 'in-place')
    expect(screen.queryByRole('button', { name: 'Session actions' })).toBeNull()
  })
})
