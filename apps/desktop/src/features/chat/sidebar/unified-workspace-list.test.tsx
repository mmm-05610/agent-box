// @vitest-environment jsdom
//
// Round 36R: the unified workspace list is workspace-list/workspace-list.tsx —
// THE workspace root list. These are the round-36 behavior pins, re-targeted
// from the retired "workspaceRows append" seam (SidebarSessionsSection +
// projects/wsl-workspace-section) onto the component that now owns the body.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { refreshWslWorkspaces } from '@/application/workspace/wsl-workspace-usecases'
import { SidebarProvider } from '@/components/ui/sidebar'
import { $agentBoxHello, $agentBoxService, $agentBoxWorkspaces } from '@/store/agentbox-service'
import type { SidebarProjectTree } from '@/store/projects/membership'
import { $workspaceLocalHiddenIds, $workspaceViewSelectedId, selectWorkspaceView } from '@/store/workspace-view'
import { $wslWorkspaceValidation, setWslWorkspaces } from '@/store/wsl-workspace'
import { asWireId, WIRE_PROTOCOL_VERSION, type WorkspaceRecord } from '@/types/wire/wire-v1'
import type { WslWorkspaceRecord } from '@/types/workspace'

import { SidebarBlankState } from './section-states'
import { WorkspaceList } from './workspace-list/workspace-list'

// The WSL rows read the host projection store; the harness has no Electron
// bridge, so the api layer is a controlled fake.
const listWslWorkspaces = vi.fn()

const agentBoxMocks = vi.hoisted(() => ({ archive: vi.fn() }))

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => ({ id: 'client' }) }))
vi.mock('@/application/workspace/wire-workspace-catalog', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  archiveAgentBoxWorkspace: (...args: unknown[]) => agentBoxMocks.archive(...args)
}))
vi.mock('@/application/workspace/wsl-workspace-usecases', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  archiveWslWorkspaceProjection: vi.fn()
}))

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
      label="Workspaces"
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

describe('AgentBox workspace archive in the unified list', () => {
  const serviceWorkspace = (overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord => ({
    accessibility: { executableForRole: null, readable: true, reasons: [], writable: true },
    archivedAt: null,
    connection: { state: 'connected' },
    createdAt: '2026-09-14T00:00:00.000Z',
    displayName: 'App',
    environment: { host: null, kind: 'local', user: null },
    id: asWireId('workspace-1'),
    normalizedPath: 'C:/work/app',
    updatedAt: '2026-09-14T00:00:00.000Z',
    version: 3,
    ...overrides
  })

  const hello = (ids: string[] = ['workspaces.archive']) => ({
    auth: { required: false as const },
    capabilities: ids.map(id => ({ id, supported: true })),
    protocolVersion: WIRE_PROTOCOL_VERSION as typeof WIRE_PROTOCOL_VERSION,
    serverId: asWireId('server-1')
  })

  const localRow = (path: null | string) =>
    ({
      id: 'proj-1',
      isAuto: false,
      isNoProject: false,
      label: 'local-proj',
      path,
      repos: [],
      sessionCount: 1
    }) as unknown as SidebarProjectTree

  const homeRow = () =>
    ({
      id: '__no_project__',
      isAuto: false,
      isNoProject: true,
      label: 'Home',
      path: null,
      repos: [],
      sessionCount: 0
    }) as unknown as SidebarProjectTree

  const renderListWith = (rows: SidebarProjectTree[]) =>
    renderList(
      <WorkspaceList
        emptyState={null}
        label="Workspaces"
        projectRows={rows}
        renderRows={() => null}
        showAllSessions={false}
      />
    )

  const openLocalMenu = (index = 0) => {
    const trigger = screen.getAllByRole('button', { name: 'Actions' })[index]!

    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.click(trigger)
  }

  const openWslMenu = () => {
    const trigger = screen.getByRole('button', { name: 'More actions' })

    fireEvent.pointerDown(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.pointerUp(trigger, { button: 0, pointerType: 'mouse' })
    fireEvent.click(trigger)
  }

  const confirmArchive = async () => {
    const dialog = await screen.findByRole('dialog')

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Archive in AgentBox' }))
    })
  }

  beforeEach(() => {
    agentBoxMocks.archive.mockReset()
    agentBoxMocks.archive.mockResolvedValue(serviceWorkspace({ archivedAt: '2026-09-14T03:00:00.000Z', version: 4 }))
    $agentBoxService.set({ detail: null, phase: 'ready' })
    $agentBoxHello.set(hello())
    $agentBoxWorkspaces.set([serviceWorkspace()])
    $workspaceViewSelectedId.set(null)
  })

  afterEach(() => {
    cleanup()
    $agentBoxWorkspaces.set([])
    $agentBoxHello.set(null)
    $agentBoxService.set({ detail: null, phase: 'idle' })
    $workspaceViewSelectedId.set(null)
  })

  it('offers the AgentBox archive on a local row that matches a service Workspace', async () => {
    renderListWith([localRow('C:/work/app')])

    openLocalMenu()

    expect(await screen.findByRole('menuitem', { name: 'Archive in AgentBox' })).toBeTruthy()
    // The legacy hide is still there, as its own action.
    expect(screen.getByRole('menuitem', { name: 'Hide from sidebar' })).toBeTruthy()
  })

  it('offers it on a WSL row whose whole identity matches, and not for another user', async () => {
    setWslWorkspaces([wslRecord()])
    $agentBoxWorkspaces.set([
      serviceWorkspace({
        environment: { host: 'Ubuntu', kind: 'wsl', user: 'someone-else' },
        id: asWireId('workspace-other'),
        normalizedPath: '/home/maoqh/验收目录'
      })
    ])

    renderListWith([])
    openWslMenu()

    // Same distro and path, different user: not this row's Workspace.
    expect(await screen.findByRole('menuitem', { name: 'Remove from sidebar' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive in AgentBox' })).toBeNull()

    cleanup()

    $agentBoxWorkspaces.set([
      serviceWorkspace({
        environment: { host: 'Ubuntu', kind: 'wsl', user: 'maoqh' },
        id: asWireId('workspace-wsl'),
        normalizedPath: '/home/maoqh/验收目录'
      })
    ])

    renderListWith([])
    openWslMenu()

    expect(await screen.findByRole('menuitem', { name: 'Archive in AgentBox' })).toBeTruthy()
  })

  it('offers nothing for Home, a folderless project, or a location the service does not know', async () => {
    renderListWith([homeRow(), localRow(null), localRow('C:/somewhere/else')])

    // Home is a bucket with no actions at all.
    expect(screen.queryAllByRole('button', { name: 'Actions' })).toHaveLength(2)

    cleanup()

    // A folderless project keeps its menu — without any AgentBox action.
    renderListWith([localRow(null)])
    openLocalMenu()
    expect(await screen.findByRole('menuitem', { name: 'Hide from sidebar' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive in AgentBox' })).toBeNull()

    cleanup()

    // Same for a folder the service has never heard of.
    renderListWith([localRow('C:/somewhere/else')])
    openLocalMenu()
    expect(await screen.findByRole('menuitem', { name: 'Hide from sidebar' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive in AgentBox' })).toBeNull()

    expect(agentBoxMocks.archive).not.toHaveBeenCalled()
  })

  it('calls no wire method when the capability is undeclared or the service is not ready', async () => {
    $agentBoxHello.set(hello(['profiles.list']))
    renderListWith([localRow('C:/work/app')])

    openLocalMenu()
    expect(await screen.findByRole('menuitem', { name: 'Hide from sidebar' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive in AgentBox' })).toBeNull()
    cleanup()

    $agentBoxHello.set(hello())
    $agentBoxService.set({ detail: 'starting', phase: 'loading' })
    renderListWith([localRow('C:/work/app')])

    openLocalMenu()
    expect(await screen.findByRole('menuitem', { name: 'Hide from sidebar' })).toBeTruthy()
    expect(screen.queryByRole('menuitem', { name: 'Archive in AgentBox' })).toBeNull()
    expect(agentBoxMocks.archive).not.toHaveBeenCalled()
  })

  it('archives with the service id and version, then adopts the returned record and clears the selection first', async () => {
    selectWorkspaceView('proj-1')

    const events: string[] = []
    const stopSelection = $workspaceViewSelectedId.listen(() => events.push('selection'))
    const stopWorkspaces = $agentBoxWorkspaces.listen(() => events.push('workspaces'))

    try {
      const { container } = renderListWith([localRow('C:/work/app')])

      openLocalMenu()
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive in AgentBox' }))
      await confirmArchive()

      expect(agentBoxMocks.archive).toHaveBeenCalledWith(
        { id: 'client' },
        { expectedVersion: 3, workspaceId: 'workspace-1' }
      )
      // Selection first, service projection second: the chat can never see
      // "still selected" together with "service record gone".
      expect(events).toEqual(['selection', 'workspaces'])
      expect($workspaceViewSelectedId.get()).toBeNull()
      expect($agentBoxWorkspaces.get()).toEqual([])
      // The shell row itself survives — only the service record was archived.
      expect(container.querySelector('[data-sessions-project="proj-1"]')).not.toBeNull()
    } finally {
      stopSelection()
      stopWorkspaces()
    }
  })

  it('leaves the selection alone when another row is archived', async () => {
    selectWorkspaceView('proj-2')
    $agentBoxWorkspaces.set([
      serviceWorkspace(),
      serviceWorkspace({ id: asWireId('workspace-2'), normalizedPath: 'C:/work/other' })
    ])

    renderListWith([
      localRow('C:/work/app'),
      { ...localRow('C:/work/other'), id: 'proj-2', label: 'other-proj' } as SidebarProjectTree
    ])

    // Archive the FIRST row while the second one is selected.
    openLocalMenu(0)
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive in AgentBox' }))
    await confirmArchive()

    expect(agentBoxMocks.archive).toHaveBeenCalledWith(
      { id: 'client' },
      { expectedVersion: 3, workspaceId: 'workspace-1' }
    )
    expect($workspaceViewSelectedId.get()).toBe('proj-2')
    expect($agentBoxWorkspaces.get().map(record => record.id)).toEqual(['workspace-2'])
  })

  it('keeps the dialog open with the service error, changing neither the projection nor the selection', async () => {
    agentBoxMocks.archive.mockRejectedValue(new Error('CONFLICT_VERSION'))
    selectWorkspaceView('proj-1')

    renderListWith([localRow('C:/work/app')])

    openLocalMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive in AgentBox' }))
    await confirmArchive()

    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByText('CONFLICT_VERSION')).toBeTruthy()
    expect($workspaceViewSelectedId.get()).toBe('proj-1')
    expect($agentBoxWorkspaces.get()).toHaveLength(1)
    // No local hide, and the AppBox projection still holds the record.
    expect($workspaceLocalHiddenIds.get()).toEqual([])
  })

  it('sends exactly one archive request when the confirm is clicked twice', async () => {
    let settle!: (value: WorkspaceRecord) => void

    agentBoxMocks.archive.mockReturnValue(
      new Promise<WorkspaceRecord>(resolve => {
        settle = resolve
      })
    )

    renderListWith([localRow('C:/work/app')])

    openLocalMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive in AgentBox' }))

    const dialog = await screen.findByRole('dialog')
    const confirm = within(dialog).getByRole('button', { name: 'Archive in AgentBox' })

    await act(async () => {
      fireEvent.click(confirm)
    })

    // The dialog's own pending state is the only guard — a second press while
    // it is saving must not reach the wire.
    await act(async () => {
      fireEvent.click(confirm)
    })

    expect(agentBoxMocks.archive).toHaveBeenCalledTimes(1)

    await act(async () => {
      settle(serviceWorkspace({ archivedAt: '2026-09-14T03:00:00.000Z', version: 4 }))
    })

    expect($agentBoxWorkspaces.get()).toEqual([])
  })

  it('keeps the record when the service answers with a record it did not archive', async () => {
    agentBoxMocks.archive.mockResolvedValue(serviceWorkspace({ version: 4 }))

    renderListWith([localRow('C:/work/app')])

    openLocalMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Archive in AgentBox' }))
    await confirmArchive()

    // The service's answer is authoritative: an unarchived record stays.
    expect($agentBoxWorkspaces.get()).toHaveLength(1)
    expect($agentBoxWorkspaces.get()[0]?.version).toBe(4)
  })
})
