// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { searchSessions } from '@/api/sessions'
import { type AppView, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@/app/routes'
import { SidebarProvider } from '@/components/ui/sidebar'
import { makeCwdSession, makeSessionInfo } from '@/dev/test/session-info'
import { registry } from '@/lib/contributions'
import { group, split } from '@/lib/pane-tree'
import { $agentBoxHello, $agentBoxService, $agentBoxSessions } from '@/store/agentbox-service'
import { $pinnedSessionIds, setSidebarShowArchived } from '@/store/layout'
import { $layoutTree, noteActiveTreeGroup } from '@/store/pane-shell/tree'
import { $gatewayState, $selectedStoredSessionId, $sessions, $sessionsLoading } from '@/store/session'
import { $removedSessionIds } from '@/store/session-removal'
import { loadArchivedSessions } from '@/store/sidebar-archive'
import { asWireId, type ServerHelloResult, type SessionRecord, WIRE_PROTOCOL_VERSION } from '@/types/wire/wire-v1'

import { ChatSidebar } from './index'

const noop = () => {}

const noopAsync = async () => {}

// The sidebar's WSL workspace rows refresh the host projection on mount; the
// test harness has no Electron bridge, so the api layer is mocked out.
vi.mock('@/api/sessions', () => ({
  searchSessions: vi.fn(async () => ({ results: [] }))
}))

// P05: the AgentBox-authority branch must never call the legacy archive
// loader. The store's own atoms stay real; only the fetch is observed.
const loadArchivedSessionsMock = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/store/sidebar-archive', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  loadArchivedSessions: loadArchivedSessionsMock
}))

// P05: the AgentBox service is spoken to through the fake wire client — the
// real refreshAgentBoxSessions seam runs, so the payload is exactly what would
// cross the wire.
const agentBoxWireClient = { call: vi.fn() }

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => agentBoxWireClient }))

vi.mock('@/api/workspace', () => ({
  listWslWorkspaces: vi.fn(async () => ({ ok: true as const, workspaces: [] })),
  reconnectWslWorkspace: vi.fn(),
  renameWslWorkspace: vi.fn(),
  removeWslWorkspace: vi.fn(),
  saveWslWorkspace: vi.fn(),
  releaseWslConnection: vi.fn(),
  connectWsl: vi.fn(),
  listWslDirectories: vi.fn(),
  discoverWsl: vi.fn(),
  cancelWslOperation: vi.fn()
}))

const sessionRows = [
  makeSessionInfo({ id: 'tile-one', last_active: 2, profile: 'default', started_at: 1, title: 'Tile one' }),
  makeSessionInfo({ id: 'tile-two', last_active: 2, profile: 'default', started_at: 1, title: 'Tile two' })
]

const renderSidebar = (
  pathname: string,
  currentView: AppView,
  sessionAuthority: 'agentbox' | 'hermes' = 'hermes'
) =>
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider>
        <ChatSidebar
          currentView={currentView}
          onArchiveSession={noop}
          onBranchSession={noop}
          onDeleteSession={noop}
          onLoadMoreSessions={noop}
          onNavigate={noop}
          onNewSessionInWorkspace={noop}
          onNewSessionSplit={noop}
          onResumeSession={noop}
          sessionAuthority={sessionAuthority}
        />
      </SidebarProvider>
    </MemoryRouter>
  )

const currentButtons = () =>
  screen.queryAllByRole('button').filter(button => button.classList.contains('bg-(--ui-control-active-background)'))

const expectOnlyCurrent = (label: string | null) => {
  const button = label ? screen.getByRole('button', { name: label }) : null

  expect(currentButtons()).toEqual(button ? [button] : [])
}

const expectOnlySelectedSession = (title: string | null) => {
  const rows = ['Tile one', 'Tile two']
    .map(label => screen.queryByText(label)?.closest('.group.row-hover'))
    .filter(row => row !== undefined)

  const selectedRows = rows.filter(row => row?.className.includes('bg-(--ui-row-active-background)'))
  const expected = title ? [screen.getByText(title).closest('.group.row-hover')] : []

  expect(selectedRows).toEqual(expected)
}

const focus = (groupId: null | string) => act(() => noteActiveTreeGroup(groupId))

describe('ChatSidebar navigation activity', () => {
  let disposeContributions: () => void

  beforeEach(() => {
    disposeContributions = registry.registerMany([
      { area: ROUTES_AREA, id: 'kanban-page', data: { path: '/kanban' }, render: () => null },
      { area: ROUTES_AREA, id: 'reports-page', data: { path: '/reports' }, render: () => null },
      { area: SIDEBAR_NAV_AREA, id: 'kanban-nav', data: { codicon: 'project', label: 'Kanban', path: '/kanban' } },
      { area: SIDEBAR_NAV_AREA, id: 'reports-nav', data: { codicon: 'graph', label: 'Reports', path: '/reports' } }
    ])
    $selectedStoredSessionId.set('tile-one')
    $sessions.set(sessionRows)
    $removedSessionIds.set(new Set())
    $layoutTree.set(
      split('row', [
        group(['workspace'], { active: 'workspace', id: 'workspace-group' }),
        group(['session-tile:tile-one'], { active: 'session-tile:tile-one', id: 'tile-one-group' }),
        group(['session-tile:tile-two'], { active: 'session-tile:tile-two', id: 'tile-two-group' })
      ])
    )
    noteActiveTreeGroup('workspace-group')
  })

  afterEach(() => {
    cleanup()
    disposeContributions()
    $selectedStoredSessionId.set(null)
    $sessions.set([])
    $removedSessionIds.set(new Set())
    $layoutTree.set(null)
    noteActiveTreeGroup(null)
  })

  it('keeps navigation and session activity coherent with the focused pane', () => {
    renderSidebar('/kanban', 'extension')
    expectOnlyCurrent('Kanban')
    expectOnlySelectedSession(null)

    focus('tile-one-group')
    expectOnlyCurrent(null)
    expectOnlySelectedSession('Tile one')

    focus('tile-two-group')
    expectOnlyCurrent(null)
    expectOnlySelectedSession('Tile two')

    focus(null)
    expectOnlyCurrent('Kanban')
    expectOnlySelectedSession(null)

    focus('tile-two-group')
    act(() => {
      $removedSessionIds.set(new Set(['tile-two']))
      $sessions.set([sessionRows[0]])
    })
    expectOnlyCurrent(null)
    expectOnlySelectedSession(null)

    act(() => {
      $removedSessionIds.set(new Set())
      $sessions.set(sessionRows)
    })

    // Round 36: the fixed nav rows are retired — no Capabilities / Artifacts /
    // Scheduled jobs / global New-session rows in the sidebar, and no Bots tab.
    // The Profiles management entry rides at the top instead.
    cleanup()
    focus('workspace-group')
    const unified = renderSidebar('/skills', 'skills')

    // The fixed nav rows are gone by their nav identity (the flat list's "+"
    // affordance legitimately still offers a session where you are).
    for (const retired of ['new-session', 'skills', 'artifacts', 'cron']) {
      expect(unified.container.querySelector(`[data-tour="sidebar-nav-${retired}"]`)).toBeNull()
    }

    expectOnlyCurrent(null)

    focus('tile-one-group')
    expectOnlySelectedSession('Tile one')

    // The Profiles entry exists and lights up at its own route.
    expect(screen.getByRole('button', { name: 'Profiles' })).toBeTruthy()
    cleanup()
    focus('workspace-group')
    const profilesView = renderSidebar('/profiles', 'profiles')
    expectOnlyCurrent('Profiles')
    expect(profilesView.container.querySelector('[data-tour="sidebar-nav-profiles"]')).toBeTruthy()

    cleanup()
    focus('workspace-group')
    renderSidebar('/reports', 'extension')
    expectOnlyCurrent('Reports')

    cleanup()
    disposeContributions()
    disposeContributions = noop
    focus('workspace-group')
    renderSidebar('/kanban', 'extension')
    expect(screen.queryByRole('button', { name: 'Kanban' })).toBeNull()
    expectOnlyCurrent(null)
    expectOnlySelectedSession(null)
  })
})

describe('ChatSidebar unified pinned + search (round 36)', () => {
  const pinTarget = makeSessionInfo({ id: 'tile-one', last_active: 2, profile: 'default', started_at: 1, title: 'Tile one' })

  const otherRows = [
    pinTarget,
    makeCwdSession('/home/maoqh/验收项目', { id: 's-cwd', last_active: 3, profile: 'default', started_at: 1, title: 'Needle one' })
  ]

  beforeEach(() => {
    localStorage.clear()
    $selectedStoredSessionId.set('tile-one')
    $sessions.set(otherRows)
    $removedSessionIds.set(new Set())
    $layoutTree.set(
      split('row', [group(['workspace'], { active: 'workspace', id: 'workspace-group' })])
    )
    noteActiveTreeGroup('workspace-group')
  })

  afterEach(() => {
    cleanup()
    $pinnedSessionIds.set([])
    $selectedStoredSessionId.set(null)
    $sessions.set([])
    $removedSessionIds.set(new Set())
    $layoutTree.set(null)
    noteActiveTreeGroup(null)
  })

  it('hides the pinned section entirely while nothing is pinned', () => {
    renderSidebar('/', 'chat')

    expect(screen.queryByText('Pinned')).toBeNull()
    // The sessions are still listed by recency — only the pinned section is gone.
    expect(screen.getByText('Tile one')).toBeTruthy()
  })

  it('a pinned row opens the SAME session, and unpinning removes the section', () => {
    const onResumeSession = vi.fn()

    render(
      <MemoryRouter initialEntries={['/']}>
        <SidebarProvider>
          <ChatSidebar
            currentView="chat"
            onArchiveSession={noop}
            onBranchSession={noop}
            onDeleteSession={noop}
            onLoadMoreSessions={noop}
            onNavigate={noop}
            onNewSessionInWorkspace={noop}
            onNewSessionSplit={noop}
            onResumeSession={onResumeSession}
            sessionAuthority="hermes"
          />
        </SidebarProvider>
      </MemoryRouter>
    )

    act(() => {
      $pinnedSessionIds.set(['tile-one'])
    })

    expect(screen.getByText('Pinned')).toBeTruthy()

    // Clicking the pinned shortcut opens the ORIGINAL session — the row's
    // resume carries the same stored id, not a copy.
    fireEvent.click(screen.getByText('Tile one'))

    expect(onResumeSession).toHaveBeenCalledWith('tile-one', expect.anything())

    // Unpinning removes the shortcut; the session itself stays listed.
    act(() => {
      $pinnedSessionIds.set([])
    })

    expect(screen.queryByText('Pinned')).toBeNull()
    expect(screen.getByText('Tile one')).toBeTruthy()
  })

  it('search hits keep their workspace attribution', () => {
    renderSidebar('/', 'chat')

    fireEvent.change(screen.getByPlaceholderText('Search sessions…'), { target: { value: 'needle' } })

    // The card header line is the workspace context: the cwd leaf for a
    // session not claimed by an explicit project.
    expect(screen.getByText('验收项目')).toBeTruthy()
  })
})

// P05 — under AgentBox authority the sidebar's search and Archived views read
// the service cache and never the legacy Hermes REST endpoints, in every
// gateway/service state. The real `refreshAgentBoxSessions` seam runs; only the
// wire client and the legacy archive loader are observed fakes.
describe('ChatSidebar AgentBox authority', () => {
  const agentBoxSession = (overrides: Omit<Partial<SessionRecord>, 'id'> & { id?: string } = {}): SessionRecord => {
    const { id = 'agentbox-session-1', ...rest } = overrides

    return {
      archivedAt: null,
      createdAt: '2026-09-14T00:00:00.000Z',
      displayName: `AgentBox ${id}`,
      id: asWireId(id),
      pinned: false,
      profileId: null,
      updatedAt: '2026-09-14T00:00:00.000Z',
      version: 1,
      workspaceId: asWireId('workspace-1'),
      ...rest
    }
  }

  const agentBoxHello = (ids: string[] = ['sessions.list']): ServerHelloResult => ({
    auth: { required: false },
    capabilities: ids.map(id => ({ id, supported: true })),
    protocolVersion: WIRE_PROTOCOL_VERSION,
    serverId: asWireId('server-1')
  })

  beforeEach(() => {
    localStorage.clear()
    vi.mocked(searchSessions).mockClear()
    loadArchivedSessionsMock.mockClear()
    agentBoxWireClient.call.mockReset()
    setSidebarShowArchived(false)
    $sessionsLoading.set(true)
    $selectedStoredSessionId.set(null)
    $sessions.set([])
    $removedSessionIds.set(new Set())
    $layoutTree.set(null)
    $agentBoxService.set({ detail: null, phase: 'ready' })
    $agentBoxHello.set(agentBoxHello())
    $agentBoxSessions.set({})
  })

  afterEach(() => {
    cleanup()
    setSidebarShowArchived(false)
    $gatewayState.set('idle')
    $sessionsLoading.set(false)
    $selectedStoredSessionId.set(null)
    $sessions.set([])
    $agentBoxService.set({ detail: null, phase: 'idle' })
    $agentBoxHello.set(null)
    $agentBoxSessions.set({})
  })

  it('search reads the service cache: zero legacy search calls, even after the debounce window', async () => {
    $sessions.set([
      makeSessionInfo({ id: 'legacy-1', last_active: 2, profile: 'default', started_at: 1, title: 'needle legacy' })
    ])
    $agentBoxSessions.set({
      'agentbox-live': agentBoxSession({ displayName: 'Needle service', id: 'agentbox-live' })
    })

    renderSidebar('/', 'chat', 'agentbox')

    fireEvent.change(screen.getByPlaceholderText('Search sessions…'), { target: { value: 'NEEDLE' } })

    // The service record matches locally (displayName, case-insensitive)…
    expect(screen.getByText('Needle service')).toBeTruthy()
    // …and the legacy row that would have matched never enters the result set.
    expect(screen.queryByText('needle legacy')).toBeNull()

    // No gateway transition can re-enable the legacy endpoint: authority alone
    // decides the data source.
    act(() => {
      $gatewayState.set('closed')
      $gatewayState.set('open')
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 250))
    })

    expect(searchSessions).not.toHaveBeenCalled()
  })

  it('archived reads sessions.list(includeArchived) once and never the legacy loader', async () => {
    agentBoxWireClient.call.mockResolvedValue({
      items: [
        agentBoxSession({ archivedAt: '2026-09-01T00:00:00.000Z', displayName: 'Archived one', id: 'ab-archived' }),
        agentBoxSession({ displayName: 'Active one', id: 'ab-active' })
      ]
    })

    renderSidebar('/', 'chat', 'agentbox')

    act(() => setSidebarShowArchived(true))

    await waitFor(() => expect(screen.getByText('Archived one')).toBeTruthy())

    expect(screen.queryByText('Active one')).toBeNull()
    expect(loadArchivedSessions).not.toHaveBeenCalled()
    expect(agentBoxWireClient.call).toHaveBeenCalledTimes(1)
    expect(agentBoxWireClient.call).toHaveBeenCalledWith('sessions.list', { includeArchived: true })
  })

  it('sends no archived request when the service cannot answer, and never fakes an empty list', () => {
    $agentBoxHello.set(agentBoxHello(['sessions.update']))

    const { container } = renderSidebar('/', 'chat', 'agentbox')

    act(() => setSidebarShowArchived(true))

    expect(agentBoxWireClient.call).not.toHaveBeenCalled()
    expect(loadArchivedSessions).not.toHaveBeenCalled()
    // Named as unsupported — not as "nothing archived".
    expect(container.querySelector('[data-agentbox-global-unsupported]')).not.toBeNull()
    expect(container.querySelector('[data-agentbox-global-empty]')).toBeNull()
  })

  it('a service failure shows the real reason and keeps the cached archived rows', async () => {
    $agentBoxSessions.set({
      'ab-cached': agentBoxSession({
        archivedAt: '2026-09-01T00:00:00.000Z',
        displayName: 'Cached archive',
        id: 'ab-cached'
      })
    })
    agentBoxWireClient.call.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:8732'))

    const { container } = renderSidebar('/', 'chat', 'agentbox')

    act(() => setSidebarShowArchived(true))

    await waitFor(() => expect(container.querySelector('[data-agentbox-global-error]')).not.toBeNull())

    // The cached row survives the failure…
    expect(screen.getByText('Cached archive')).toBeTruthy()
    // …and the failure is the service's own reason, never "no results".
    expect(container.querySelector('[data-agentbox-global-empty]')).toBeNull()
    expect(screen.getByText('connect ECONNREFUSED 127.0.0.1:8732')).toBeTruthy()
    expect(loadArchivedSessions).not.toHaveBeenCalled()
  })
})
