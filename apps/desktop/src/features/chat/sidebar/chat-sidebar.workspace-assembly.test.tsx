// @vitest-environment jsdom
//
// Work order 36R stage 1 — counterexample tests over the FULL ChatSidebar
// assembly. Batch 36's evidence hand-stuffed a projectOverview into
// SidebarSessionsSection, which proved the section's rendering but never the
// production composition. Every test here mounts ChatSidebar itself and pins
// one accepted behavior from the work order:
//
//   - the workspace is the sidebar's subject, not an attachment of the session
//     list: WSL-only, zero sessions, and legacy date/status/flat preferences
//     must all keep the workspace body visible;
//   - search reaches workspaces (name/path) even with zero sessions, and
//     clearing it restores the prior selection/expansion;
//   - local and WSL rows share ONE selection/expand convention, driven from the
//     main row (opening connection info is NOT selecting a workspace).
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { makeSessionInfo } from '@/dev/test/session-info'
import { $sidebarWorkspaceNodeOpen, setSidebarAgentsGrouped, setSidebarGrouping } from '@/store/layout'
import type { SidebarProjectTree } from '@/store/projects/membership'
import { $projectTree, $projectTreeLoading, exitProjectScope } from '@/store/projects/scope'
import { $selectedStoredSessionId, $sessions, $sessionsLoading } from '@/store/session'
import { $workspaceViewSelectedId } from '@/store/workspace-view'
import { $wslWorkspaceInfoId, setWslWorkspaces } from '@/store/wsl-workspace'
import type { WslWorkspaceRecord } from '@/types/workspace'

import { ChatSidebar } from './index'

const noop = () => {}

vi.mock('@/api/sessions', () => ({
  searchSessions: vi.fn(async () => ({ results: [] }))
}))

const listWslWorkspaces = vi.fn()

vi.mock('@/api/workspace', () => ({
  listWslWorkspaces: (...args: unknown[]) => listWslWorkspaces(...args),
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

function wslRecord(overrides: Partial<WslWorkspaceRecord> = {}): WslWorkspaceRecord {
  return {
    id: 'wsl_ws_1',
    name: '验收目录',
    kind: 'wsl',
    distribution: 'Ubuntu',
    configuredUser: null,
    actualUser: 'maoqh',
    rootPath: '/home/maoqh/验收目录',
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    ...overrides
  }
}

const localProject: SidebarProjectTree = {
  id: 'proj-1',
  label: 'local-acceptance',
  path: '/home/maoqh/local-acceptance',
  isAuto: false,
  isNoProject: false,
  repos: [],
  sessionCount: 0
}

// The backend tree always carries the synthetic Home bucket first; the sidebar
// never derives it.
const homeNode: SidebarProjectTree = {
  id: '__no_project__',
  label: 'Home',
  path: null,
  isNoProject: true,
  repos: [],
  sessionCount: 0
}

function renderSidebar({
  onNewSessionInWorkspace = noop,
  sessionAuthority = 'hermes'
}: { onNewSessionInWorkspace?: (path: null | string) => void; sessionAuthority?: 'agentbox' | 'hermes' } = {}) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <SidebarProvider>
        <ChatSidebar
          currentView="chat"
          onArchiveSession={noop}
          onBranchSession={noop}
          onDeleteSession={noop}
          onLoadMoreSessions={noop}
          onNavigate={noop}
          onNewSessionInWorkspace={onNewSessionInWorkspace}
          onNewSessionSplit={noop}
          onResumeSession={noop}
          sessionAuthority={sessionAuthority}
        />
      </SidebarProvider>
    </MemoryRouter>
  )
}

beforeEach(() => {
  localStorage.clear()
  listWslWorkspaces.mockReset()
  listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [] })
  $sessions.set([])
  $sessionsLoading.set(false)
  $selectedStoredSessionId.set(null)
  $projectTree.set([])
  $projectTreeLoading.set(false)
  setWslWorkspaces([])
  $wslWorkspaceInfoId.set(null)
  // Default new instance: no grouping preference injected.
  setSidebarAgentsGrouped(true)
  setSidebarGrouping('project')
})

afterEach(() => {
  cleanup()
  exitProjectScope()
  $sessions.set([])
  $sessionsLoading.set(true)
  $sidebarWorkspaceNodeOpen.set({})
  $selectedStoredSessionId.set(null)
  $projectTree.set([])
  setWslWorkspaces([])
  $wslWorkspaceInfoId.set(null)
})

describe('ChatSidebar workspace assembly (36R)', () => {
  it('a WSL-only environment shows the workspace body with no sessions and no local projects', async () => {
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
    })

    // The workspace rows live in the sidebar body — not behind the blank state.
    expect(container.querySelector('[data-tour="sessions-sidebar"]')).not.toBeNull()
  })

  it('zero sessions with a local project still shows the workspace row', () => {
    $projectTree.set([homeNode, localProject])

    const { container } = renderSidebar()

    expect(container.querySelector('[data-sessions-project="proj-1"]')).not.toBeNull()
  })

  it.each(['date', 'status'] as const)(
    'legacy %s grouping preference keeps the workspace body visible',
    async grouping => {
      setSidebarAgentsGrouped(false)
      setSidebarGrouping(grouping)
      $projectTree.set([homeNode, localProject])
      listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })

      const { container } = renderSidebar()

      // The workspace tree survives: local row AND WSL row are both present —
      // the preference only shapes sessions inside workspaces.
      expect(container.querySelector('[data-sessions-project="proj-1"]')).not.toBeNull()
      await waitFor(() => {
        expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
      })
    }
  )

  it('a zero-session workspace is found by search by its name and by its path', async () => {
    $projectTree.set([homeNode, localProject])
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
    })

    const search = screen.getByPlaceholderText('Search sessions…')

    // By name — the WSL workspace has zero sessions, the local one has none either.
    act(() => {
      fireEvent.change(search, { target: { value: '验收目录' } })
    })
    expect(container.querySelector('[data-workspace-search-hit="wsl_ws_1"]')).not.toBeNull()

    // By path — same workspace, same single hit.
    act(() => {
      fireEvent.change(search, { target: { value: '/home/maoqh/验收' } })
    })
    expect(container.querySelector('[data-workspace-search-hit="wsl_ws_1"]')).not.toBeNull()

    act(() => {
      fireEvent.change(search, { target: { value: 'local-acceptance' } })
    })
    expect(container.querySelector('[data-workspace-search-hit="proj-1"]')).not.toBeNull()
  })

  it('clearing the search restores the prior selection and expansion', async () => {
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
    })

    // Select the workspace from its MAIN row, then expand it.
    const row = container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]') as HTMLElement

    act(() => {
      fireEvent.click(row.querySelector('button') as HTMLElement)
    })
    act(() => {
      fireEvent.click(container.querySelector('[data-wsl-workspace-expand="wsl_ws_1"]') as HTMLElement)
    })

    expect(container.querySelector('[data-wsl-workspace-empty="wsl_ws_1"]')).not.toBeNull()

    const search = screen.getByPlaceholderText('Search sessions…')

    act(() => {
      fireEvent.change(search, { target: { value: '验收目录' } })
    })
    act(() => {
      fireEvent.change(search, { target: { value: '' } })
    })

    // Same workspace still selected, still expanded — search never disturbed
    // the view state.
    expect(container.querySelector('[data-workspace-row-selected="wsl_ws_1"]')).not.toBeNull()
    expect(container.querySelector('[data-wsl-workspace-empty="wsl_ws_1"]')).not.toBeNull()
  })

  it('clicking a WSL workspace main row selects it and enters a session-free draft', async () => {
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })
    const onNewSessionInWorkspace = vi.fn()

    const { container } = renderSidebar({ onNewSessionInWorkspace })

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
    })

    const row = container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]') as HTMLElement

    act(() => {
      fireEvent.click(row.querySelector('button') as HTMLElement)
    })

    // Selected via the same convention the local rows follow…
    expect(container.querySelector('[data-workspace-row-selected="wsl_ws_1"]')).not.toBeNull()
    // The WSL workspace's stable selected id scopes the draft. Its Linux path
    // must not be sent through the legacy local-host config probe.
    expect(onNewSessionInWorkspace).toHaveBeenCalledWith(null)
    // …and the connection info dialog did NOT open: that is a secondary action,
    // never the main row's meaning.
    expect($wslWorkspaceInfoId.get()).toBeNull()
  })

  it('a WSL row expands to the honest unavailable prompt and starts no Hermes session', async () => {
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })
    const onNewSessionInWorkspace = vi.fn()

    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <SidebarProvider>
          <ChatSidebar
            currentView="chat"
            onArchiveSession={noop}
            onBranchSession={noop}
            onDeleteSession={noop}
            onLoadMoreSessions={noop}
            onNavigate={noop}
            onNewSessionInWorkspace={onNewSessionInWorkspace}
            onNewSessionSplit={noop}
            onResumeSession={noop}
            sessionAuthority="hermes"
          />
        </SidebarProvider>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
    })

    act(() => {
      fireEvent.click(container.querySelector('[data-wsl-workspace-expand="wsl_ws_1"]') as HTMLElement)
    })

    expect(container.querySelector('[data-wsl-workspace-empty="wsl_ws_1"]')?.textContent).toContain(
      'Sessions in WSL workspaces are not part of this round yet.'
    )
    expect(onNewSessionInWorkspace).not.toHaveBeenCalled()
  })

  it('local and WSL workspaces render as peers inside one list', async () => {
    $projectTree.set([homeNode, localProject])
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
    })

    // One list body: both rows live inside the ONE workspace root list —
    // one tree, not two (36R replaced the old append seam).
    const listBody = container.querySelector('[data-workspace-list]')

    expect(listBody).not.toBeNull()
    expect(listBody?.querySelector('[data-sessions-project="proj-1"]')).not.toBeNull()
    expect(listBody?.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
  })

  it('clicking a local workspace main row selects (enters) that workspace', () => {
    $projectTree.set([homeNode, localProject])

    const { container } = renderSidebar()

    const label = screen.getByText('local-acceptance')

    act(() => {
      fireEvent.click(label)
    })

    // The main row's click lands on the workspace: the entered-project mode
    // carries its id (the driver verifies the same through the real UI).
    expect(container.querySelector('[data-sessions-mode="project"]')).not.toBeNull()
  })

  it('sessions carry no workspace loss: a session row still renders under its workspace', () => {
    $projectTree.set([homeNode, localProject])
    // A detached session (no cwd, no repo root) belongs to the Home bucket.
    $sessions.set([
      makeSessionInfo({ id: 's-1', last_active: 2, profile: 'default', started_at: 1, title: 'Tile one' })
    ])

    const { container } = renderSidebar()

    // Home still lists its sessions (via the flat fallback when no backend
    // project tree lane exists yet).
    expect(screen.getByText('Tile one')).toBeTruthy()
    expect(container.querySelector('[data-sessions-project="proj-1"]')).not.toBeNull()
  })
})

// P01 — the unified list has ONE neutral selection. The 36R list let the local
// rows highlight from the backend's active-project pointer while the WSL rows
// highlighted from the view atom, so "local A → WSL B" left TWO rows reading
// as current. Every row now reads the same atom, and every navigation path
// writes it.
describe('ChatSidebar workspace selection (P01)', () => {
  beforeEach(() => {
    $workspaceViewSelectedId.set(null)
  })

  const selectedRows = (container: HTMLElement): string[] =>
    Array.from(container.querySelectorAll('[data-workspace-row-selected]')).map(row =>
      row.getAttribute('data-workspace-row-selected') ?? ''
    )

  it('local A ↔ WSL B ↔ local A leaves exactly one current selection at every step', async () => {
    $projectTree.set([homeNode, localProject])
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
    })

    // Select WSL B from its main row.
    const wslRow = container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]') as HTMLElement

    act(() => {
      fireEvent.click(wslRow.querySelector('button') as HTMLElement)
    })
    expect(selectedRows(container)).toEqual(['wsl_ws_1'])

    // Open local A from its main row — the entered-project view replaces the
    // root list, so no row claims selection while it is mounted.
    act(() => {
      fireEvent.click(screen.getByText('local-acceptance'))
    })
    expect(container.querySelector('[data-sessions-mode="project"]')).not.toBeNull()
    expect(selectedRows(container)).toEqual([])

    // Back to the root list: A is THE one current selection — the old wiring
    // lit A from the backend's active pointer AND kept B lit from the stale
    // view atom, two half-truths in one list.
    act(() => {
      fireEvent.click(screen.getByText('All projects'))
    })
    expect(selectedRows(container)).toEqual(['proj-1'])

    // The alternation keeps exactly one: B takes the highlight (without
    // navigation), A takes it back (with it).
    const wslRowAgain = container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]') as HTMLElement

    act(() => {
      fireEvent.click(wslRowAgain.querySelector('button') as HTMLElement)
    })
    expect(selectedRows(container)).toEqual(['wsl_ws_1'])

    act(() => {
      fireEvent.click(screen.getByText('local-acceptance'))
    })
    expect(container.querySelector('[data-sessions-mode="project"]')).not.toBeNull()

    act(() => {
      fireEvent.click(screen.getByText('All projects'))
    })
    expect(selectedRows(container)).toEqual(['proj-1'])
  })

  it('clearing the search never steals a local selection', async () => {
    $projectTree.set([homeNode, localProject])
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
    })

    // Activate the local row through its search hit — the hit's activation is
    // the same "open this workspace" intent the main row carries.
    const search = screen.getByPlaceholderText('Search sessions…')

    act(() => {
      fireEvent.change(search, { target: { value: 'local-acceptance' } })
    })
    act(() => {
      fireEvent.click(container.querySelector('[data-workspace-search-hit="proj-1"]') as HTMLElement)
    })

    expect(container.querySelector('[data-sessions-mode="project"]')).not.toBeNull()

    // Back to the list: the hit's activation is the current selection.
    act(() => {
      fireEvent.click(screen.getByText('All projects'))
    })
    expect(selectedRows(container)).toEqual(['proj-1'])

    // A later search (and its clear) is read-only over the view state.
    act(() => {
      fireEvent.change(search, { target: { value: '验收目录' } })
    })
    act(() => {
      fireEvent.change(search, { target: { value: '' } })
    })

    expect(selectedRows(container)).toEqual(['proj-1'])
  })

  it('opening another row\'s connection info does not move the selection', async () => {
    listWslWorkspaces.mockResolvedValue({
      ok: true as const,
      workspaces: [wslRecord(), wslRecord({ id: 'wsl_ws_2', name: '子目录', rootPath: '/home/maoqh/子目录' })]
    })

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_2"]')).not.toBeNull()
    })

    // Select row A from its main row…
    const rowA = container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]') as HTMLElement

    act(() => {
      fireEvent.click(rowA.querySelector('button') as HTMLElement)
    })
    expect(selectedRows(container)).toEqual(['wsl_ws_1'])

    // …then open row B's info from its own controls — a secondary action that
    // must not read as "B is now current".
    const rowB = container.querySelector('[data-wsl-workspace-row="wsl_ws_2"]') as HTMLElement
    const infoButton = rowB.querySelector('[data-row-actions] button[aria-label="Connection info"]') as HTMLElement

    act(() => {
      fireEvent.click(infoButton)
    })

    expect($wslWorkspaceInfoId.get()).toBe('wsl_ws_2')
    expect(selectedRows(container)).toEqual(['wsl_ws_1'])
  })
})

// The workspace root list header carries its own filter menu instance. It takes
// the sidebar's authority too, so the legacy profile-share row cannot reappear
// by switching to the workspace body.
describe('ChatSidebar workspace header filter menu (P05 B9)', () => {
  /** Open the workspace header's filter menu and its Profile submenu, and
   *  report whether the submenu really opened — its `New profile` row is the
   *  proof that a missing `Import profile…` is a decision, not an empty menu. */
  const openProfileSubmenu = () => {
    const trigger = screen.getByRole('button', { name: 'Filters' })

    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('Profile'))

    return Boolean(screen.queryByText('New profile'))
  }

  const renderWorkspaceBody = async (sessionAuthority: 'agentbox' | 'hermes') => {
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })

    const rendered = renderSidebar({ sessionAuthority })

    await waitFor(() => {
      expect(rendered.container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
    })

    return rendered
  }

  it('offers no Import profile row in the workspace header under AgentBox authority', async () => {
    await renderWorkspaceBody('agentbox')

    expect(openProfileSubmenu()).toBe(true)
    expect(screen.queryByText('Import profile…')).toBeNull()
  })

  it('keeps the Import profile row in the workspace header under Hermes authority', async () => {
    await renderWorkspaceBody('hermes')

    expect(openProfileSubmenu()).toBe(true)
    expect(screen.getByText('Import profile…')).toBeTruthy()
  })
})
