// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type AppView, ROUTES_AREA, SIDEBAR_NAV_AREA } from '@/app/routes'
import { SidebarProvider } from '@/components/ui/sidebar'
import { makeCwdSession, makeSessionInfo } from '@/dev/test/session-info'
import { registry } from '@/lib/contributions'
import { group, split } from '@/lib/pane-tree'
import { $pinnedSessionIds } from '@/store/layout'
import { $layoutTree, noteActiveTreeGroup } from '@/store/pane-shell/tree'
import { $selectedStoredSessionId, $sessions } from '@/store/session'
import { $removedSessionIds } from '@/store/session-removal'

import { ChatSidebar } from './index'

const noop = () => {}

const noopAsync = async () => {}

// The sidebar's WSL workspace rows refresh the host projection on mount; the
// test harness has no Electron bridge, so the api layer is mocked out.
vi.mock('@/api/sessions', () => ({
  searchSessions: vi.fn(async () => ({ results: [] }))
}))

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

const renderSidebar = (pathname: string, currentView: AppView) =>
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
