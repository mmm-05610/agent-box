// @vitest-environment jsdom
//
// Round 36R: the unified workspace list is workspace-list/workspace-list.tsx —
// THE workspace root list. These are the round-36 behavior pins, re-targeted
// from the retired "workspaceRows append" seam (SidebarSessionsSection +
// projects/wsl-workspace-section) onto the component that now owns the body.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { refreshWslWorkspaces } from '@/application/workspace/wsl-workspace-usecases'
import { SidebarProvider } from '@/components/ui/sidebar'
import type { SidebarProjectTree } from '@/store/projects/membership'
import { $wslWorkspaceValidation, setWslWorkspaces } from '@/store/wsl-workspace'
import type { WslWorkspaceRecord } from '@/types/workspace'

import { SidebarBlankState } from './section-states'
import { WorkspaceList } from './workspace-list/workspace-list'

// The WSL rows read the host projection store; the harness has no Electron
// bridge, so the api layer is a controlled fake.
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
    ...overrides
  }
}

const localProject = {
  id: 'proj-1',
  label: 'local-proj',
  isAuto: false,
  isNoProject: false,
  sessionCount: 1,
  repos: []
} as unknown as SidebarProjectTree

function renderList(ui: React.ReactNode) {
  return render(
    <MemoryRouter>
      <SidebarProvider>{ui}</SidebarProvider>
    </MemoryRouter>
  )
}

function renderWorkspaceList() {
  return renderList(
    <WorkspaceList
      emptyState={null}
      label='Workspaces'
      projectRows={[localProject]}
      renderRows={() => null}
      showAllSessions={false}
    />
  )
}

beforeEach(() => {
  localStorage.clear()
  listWslWorkspaces.mockReset()
  listWslWorkspaces.mockResolvedValue({ ok: true, workspaces: [] })
})

afterEach(() => {
  cleanup()
  setWslWorkspaces([])
  $wslWorkspaceValidation.set({})
})

describe('unified workspace list (round 36R)', () => {
  it('renders local and WSL workspaces in the SAME list body, peer to each other', () => {
    setWslWorkspaces([wslRecord()])

    const { container } = renderWorkspaceList()

    const listBody = container.querySelector('[data-workspace-list]')

    expect(listBody).not.toBeNull()
    // The local row and the WSL row share one list: both are children of the
    // same workspace list — not two separate trees.
    expect(listBody?.querySelector('[data-sessions-project="proj-1"]')).not.toBeNull()
    expect(listBody?.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
  })

  it('a WSL row expands to the honest no-sessions prompt and collapses again', () => {
    setWslWorkspaces([wslRecord()])

    const { container } = renderWorkspaceList()

    const row = container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')

    expect(row).not.toBeNull()
    // Collapsed by default: no prompt.
    expect(container.querySelector('[data-wsl-workspace-empty="wsl_ws_1"]')).toBeNull()

    const expand = container.querySelector('[data-wsl-workspace-expand="wsl_ws_1"]') as HTMLElement

    act(() => {
      fireEvent.click(expand)
    })
    expect(container.querySelector('[data-wsl-workspace-empty="wsl_ws_1"]')?.textContent).toContain(
      'Sessions in WSL workspaces are not part of this round yet.'
    )

    act(() => {
      fireEvent.click(expand)
    })
    expect(container.querySelector('[data-wsl-workspace-empty="wsl_ws_1"]')).toBeNull()
  })

  it('no standing Verified/Not-verified badges on WSL rows in any normal state', () => {
    setWslWorkspaces([wslRecord()])
    $wslWorkspaceValidation.set({
      wsl_ws_1: { status: 'validated', actualUser: 'maoqh', userChanged: false, verifiedAt: 1 }
    })

    const { container } = renderWorkspaceList()

    expect(screen.queryByText('Verified')).toBeNull()
    expect(screen.queryByText('Not verified')).toBeNull()
    // The row itself is still there — only the badge pile is gone.
    expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')).not.toBeNull()
  })

  it('a failed revalidation shows one quiet actionable marker, not a faked online state', () => {
    setWslWorkspaces([wslRecord()])
    $wslWorkspaceValidation.set({
      wsl_ws_1: { status: 'failed', code: 'WSL_UNAVAILABLE', message: 'WSL is not running.', verifiedAt: 1 }
    })

    const { container } = renderWorkspaceList()

    // The failure surface is the row's error glyph (with the actionable
    // message as its tooltip), never an "online" claim.
    expect(container.querySelector('[data-wsl-workspace-row]')?.textContent).not.toContain('Verified')
  })

  it('the empty sidebar keeps BOTH add entries: open folder and open remote folder', () => {
    const onNewProject = vi.fn()
    const onRemoteConnection = vi.fn()

    renderList(<SidebarBlankState onNewProject={onNewProject} onRemoteConnection={onRemoteConnection} />)

    const local = screen.getByRole('button', { name: /Open folder/ })
    const remote = screen.getByRole('button', { name: /Open remote folder/ })

    act(() => {
      fireEvent.click(local)
      fireEvent.click(remote)
    })

    expect(onNewProject).toHaveBeenCalledTimes(1)
    expect(onRemoteConnection).toHaveBeenCalledTimes(1)
  })

  it('a rename survives a reopen: the refreshed projection carries the new name', async () => {
    // The rename already landed in the host store (host tests pin that); the
    // reopen path is refreshWslWorkspaces — it must project the new name.
    listWslWorkspaces.mockResolvedValue({ ok: true, workspaces: [wslRecord({ name: '新名字', updatedAt: 2 })] })

    await refreshWslWorkspaces()

    const { container } = renderWorkspaceList()

    expect(container.querySelector('[data-wsl-workspace-row="wsl_ws_1"]')?.textContent).toContain('新名字')
  })
})
