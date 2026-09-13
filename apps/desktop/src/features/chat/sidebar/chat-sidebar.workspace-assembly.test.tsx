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

import { type AppView } from '@/app/routes'
import { SidebarProvider } from '@/components/ui/sidebar'
import { makeSessionInfo } from '@/dev/test/session-info'
import { $sidebarWorkspaceNodeOpen, setSidebarAgentsGrouped, setSidebarGrouping } from '@/store/layout'
import type { SidebarProjectTree } from '@/store/projects/membership'
import { $projectTree, $projectTreeLoading, exitProjectScope } from '@/store/projects/scope'
import { $selectedStoredSessionId, $sessions, $sessionsLoading } from '@/store/session'
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

function renderSidebar(currentView: AppView = 'chat') {
  return render(
    <MemoryRouter initialEntries={['/']}>
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

  it('clicking a WSL workspace main row selects the workspace — it does not open connection info', async () => {
    listWslWorkspaces.mockResolvedValue({ ok: true as const, workspaces: [wslRecord()] })

    const { container } = renderSidebar()

    await waitFor(() => {
      expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
    })

    const row = container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]') as HTMLElement

    act(() => {
      fireEvent.click(row.querySelector('button') as HTMLElement)
    })

    // Selected via the same convention the local rows follow…
    expect(container.querySelector('[data-workspace-row-selected="wsl_ws_1"]')).not.toBeNull()
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
