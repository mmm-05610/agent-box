import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { stubMenuDomApis, stubResizeObserver } from '@/dev/test/jsdom'
import { $agentBoxHello, $agentBoxService } from '@/store/agentbox-service'
import { $workspaceViewSelectedId } from '@/store/workspace-view'
import { $wslWorkspaceWizardOpen } from '@/store/wsl-workspace'
import { asWireId, WIRE_PROTOCOL_VERSION } from '@/types/wire/wire-v1'
import type { WslDistributionInfo, WslWorkspaceRecord } from '@/types/workspace'

import { WslWorkspaceWizard } from './wsl-workspace-wizard'

const mocks = vi.hoisted(() => ({
  browse: vi.fn<(method: string, params: unknown) => Promise<unknown>>(),
  cancel: vi.fn<(operationId: unknown) => Promise<void>>(),
  connect: vi.fn<(input: unknown) => Promise<unknown>>(),
  discover: vi.fn<() => Promise<unknown>>(),
  listDirectories: vi.fn<(input: unknown) => Promise<unknown>>(),
  releaseConnection: vi.fn<(connectionId: unknown) => Promise<void>>(),
  save: vi.fn<(input: unknown) => Promise<unknown>>()
}))

vi.mock('@/api/agentbox-runtime-client', () => ({
  agentBoxRuntimeClient: () => ({
    call: (method: string, params: unknown) => mocks.browse(method, params)
  })
}))
vi.mock('@/api/workspace', () => ({
  cancelWslOperation: (operationId: unknown) => mocks.cancel(operationId),
  connectWsl: (input: unknown) => mocks.connect(input),
  discoverWsl: () => mocks.discover(),
  listWslDirectories: (input: unknown) => mocks.listDirectories(input)
}))
vi.mock('@/application/workspace/wsl-workspace-usecases', () => ({
  releaseWizardConnection: (connectionId: unknown) => mocks.releaseConnection(connectionId),
  saveWslWorkspaceFromWizard: (input: unknown) => mocks.save(input)
}))

stubMenuDomApis()
stubResizeObserver()

const distribution: WslDistributionInfo = { isDefault: true, name: 'Ubuntu', state: 'Running', version: '2' }

const wslRecord = (overrides: Partial<WslWorkspaceRecord> = {}): WslWorkspaceRecord => ({
  actualUser: 'maoqh',
  archivedAt: null,
  configuredUser: null,
  createdAt: 1,
  distribution: 'Ubuntu',
  id: 'wsl_ws_1',
  kind: 'wsl',
  name: '验收目录',
  rootPath: '/home/maoqh/验收目录',
  updatedAt: 1,
  ...overrides
})

const hello = (ids: string[] = ['workspaces.browse']) => ({
  auth: { required: false as const },
  capabilities: ids.map(id => ({ id, supported: true })),
  protocolVersion: WIRE_PROTOCOL_VERSION as typeof WIRE_PROTOCOL_VERSION,
  serverId: asWireId('server-1')
})

const directoryListing = (path: string, names: string[], readOnly: string[] = []) => ({
  entries: names.map(name => ({
    canOpen: true,
    canWrite: !readOnly.includes(name),
    kind: 'directory' as const,
    name,
    reason: null
  })),
  path
})

beforeEach(() => {
  mocks.browse.mockReset()
  mocks.browse.mockResolvedValue(directoryListing('/home/maoqh', ['projects']))
  mocks.listDirectories.mockReset()
  mocks.save.mockReset()
  mocks.save.mockResolvedValue({ ok: true, workspace: wslRecord() } as never)
  mocks.connect.mockReset()
  mocks.connect.mockResolvedValue({
    connectionId: 'conn-1',
    distribution: 'Ubuntu',
    home: '/home/maoqh',
    ok: true,
    user: 'maoqh',
    userIsDefault: true
  })
  mocks.discover.mockReset()
  mocks.discover.mockResolvedValue({
    available: true,
    defaultDistribution: 'Ubuntu',
    distributions: [distribution],
    ok: true
  })
  mocks.releaseConnection.mockClear()
  $agentBoxService.set({ detail: null, phase: 'ready' })
  $agentBoxHello.set(hello())
  $workspaceViewSelectedId.set(null)
  $wslWorkspaceWizardOpen.set(true)
})

afterEach(() => {
  cleanup()
  $wslWorkspaceWizardOpen.set(false)
  $agentBoxService.set({ detail: null, phase: 'idle' })
  $agentBoxHello.set(null)
  $workspaceViewSelectedId.set(null)
})

const pathValue = () => (screen.getByRole('textbox', { name: 'Path' }) as HTMLInputElement).value

/** The dialog footer is the step-level control; the browser has its own back
 *  arrow, so a name query would be ambiguous. */
const footerButton = (name: string) =>
  within(screen.getByRole('dialog').querySelector('[data-slot="dialog-footer"]') as HTMLElement).getByRole('button', {
    name
  })

const connect = async (entry = 'projects') => {
  fireEvent.click(await screen.findByRole('button', { name: 'Connect' }))

  await waitFor(() => expect(mocks.connect).toHaveBeenCalledTimes(1))
  await screen.findByText(entry)
}

describe('WSL wizard directory browsing through the service', () => {
  it('refuses to browse when the service cannot, without falling back to the host', async () => {
    $agentBoxHello.set(hello(['profiles.list']))
    $agentBoxService.set({ detail: 'service starting', phase: 'loading' })

    render(<WslWorkspaceWizard />)

    const reason = await screen.findByText(/AgentBox directory browsing is unavailable/)
    expect(reason.textContent).toContain('service starting')

    const connectButton = screen.getByRole('button', { name: 'Connect' })
    expect(connectButton.hasAttribute('disabled')).toBe(true)

    fireEvent.click(connectButton)
    expect(mocks.connect).not.toHaveBeenCalled()
    expect(mocks.browse).not.toHaveBeenCalled()
    expect(mocks.listDirectories).not.toHaveBeenCalled()
  })

  it('keeps the hello reason when the service never declares the method', async () => {
    $agentBoxHello.set({
      ...hello(),
      capabilities: [{ id: 'workspaces.browse', reason: 'NOT_IMPLEMENTED', supported: false }]
    })

    render(<WslWorkspaceWizard />)

    expect((await screen.findByText(/AgentBox directory browsing is unavailable/)).textContent).toContain(
      'NOT_IMPLEMENTED'
    )
    expect(mocks.browse).not.toHaveBeenCalled()
  })

  it('browses the environment the host verified, from the home it proved', async () => {
    render(<WslWorkspaceWizard />)

    // The user typed a different name; the host's verified identity wins.
    fireEvent.change(await screen.findByLabelText('Linux user'), { target: { value: 'someone-else' } })

    await connect()

    expect(mocks.browse).toHaveBeenCalledWith('workspaces.browse', {
      environment: { host: 'Ubuntu', kind: 'wsl', user: 'maoqh' },
      path: '/home/maoqh',
      requestId: expect.any(String)
    })
  })

  it('never asks the host to enumerate directories anywhere in the flow', async () => {
    render(<WslWorkspaceWizard />)

    await connect()

    fireEvent.click(screen.getByRole('button', { name: 'Up one level' }))
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledTimes(2))

    expect(mocks.listDirectories).not.toHaveBeenCalled()
    // The only wire traffic is the directory browse itself.
    expect(new Set(mocks.browse.mock.calls.map(call => call[0]))).toEqual(new Set(['workspaces.browse']))
  })

  it('saves a read-only but openable directory and hands the row to the neutral selection', async () => {
    mocks.browse.mockImplementation(async (_method: string, params: unknown) =>
      (params as { path: string }).path === '/home/maoqh'
        ? directoryListing('/home/maoqh', ['shared'], ['shared'])
        : directoryListing('/home/maoqh/shared', [], ['shared'])
    )

    render(<WslWorkspaceWizard />)

    await connect('shared')

    fireEvent.click(screen.getByText('shared').closest('button') as HTMLButtonElement)
    await waitFor(() => expect(pathValue()).toBe('/home/maoqh/shared'))

    fireEvent.click(screen.getByRole('button', { name: /Use this directory/ }))

    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith({
        connectionId: 'conn-1',
        name: undefined,
        path: '/home/maoqh/shared'
      })
    )
    // The host's record is what gets selected, so the main chat registers the
    // service Workspace for it.
    expect($workspaceViewSelectedId.get()).toBe('wsl_ws_1')
    expect(mocks.releaseConnection).toHaveBeenCalledWith('conn-1')
  })

  it('keeps the browser open with the listing when the save fails, and retries', async () => {
    mocks.save.mockResolvedValueOnce({ code: 'WSL_SAVE_FAILED', ok: false } as never)
    mocks.save.mockResolvedValueOnce({ ok: true, workspace: wslRecord() } as never)

    render(<WslWorkspaceWizard />)

    await connect()

    fireEvent.click(screen.getByRole('button', { name: /Use this directory/ }))

    expect(await screen.findByText(/could not be saved|Failed|save/i)).toBeTruthy()
    // The listing and the current directory survive for the retry.
    expect(screen.getByText('projects')).toBeTruthy()
    expect($workspaceViewSelectedId.get()).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Use this directory/ }))

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2))
    await waitFor(() => expect($workspaceViewSelectedId.get()).toBe('wsl_ws_1'))
  })

  it('releases the temporary connection when the wizard is closed', async () => {
    render(<WslWorkspaceWizard />)

    await connect()

    // Back to configuration keeps the verified connection: the close below is
    // what releases it.
    fireEvent.click(footerButton('Back'))
    expect(await screen.findByText('Configure WSL')).toBeTruthy()
    expect(mocks.releaseConnection).not.toHaveBeenCalled()

    fireEvent.click(footerButton('Close'))

    await waitFor(() => expect($wslWorkspaceWizardOpen.get()).toBe(false))
    expect(mocks.releaseConnection).toHaveBeenCalledWith('conn-1')
  })

  it('offers no browse before a connection exists', async () => {
    render(<WslWorkspaceWizard />)

    await screen.findByRole('button', { name: 'Connect' })

    expect(mocks.browse).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Up one level' })).toBeNull()
  })
})

describe('WSL wizard workspace record adoption', () => {
  it('selects the exact id the host returned', async () => {
    mocks.save.mockResolvedValue({ ok: true, workspace: wslRecord({ id: 'wsl_ws_9' }) } as never)

    render(<WslWorkspaceWizard />)

    await connect()

    fireEvent.click(screen.getByRole('button', { name: /Use this directory/ }))

    await waitFor(() => expect($workspaceViewSelectedId.get()).toBe('wsl_ws_9'))
  })

  it('does not create a Workspace of its own when the host rejects the save', async () => {
    mocks.save.mockResolvedValue({ code: 'WSL_INVALID_PATH', ok: false } as never)

    render(<WslWorkspaceWizard />)

    await connect()

    fireEvent.click(screen.getByRole('button', { name: 'Up one level' }))
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledTimes(2))

    fireEvent.click(screen.getByRole('button', { name: /Use this directory/ }))

    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))
    expect($workspaceViewSelectedId.get()).toBeNull()
    // Still browsing the parent directory, with the listing intact.
    expect(pathValue()).toBe('/home/maoqh')
    expect(screen.getByText('projects')).toBeTruthy()
  })
})

describe('WSL wizard stale saves', () => {
  const deferredSave = () => {
    let settle!: (value: unknown) => void

    const promise = new Promise(resolve => {
      settle = resolve
    })

    return { promise, settle }
  }

  it('ignores a save that answers after the wizard was closed', async () => {
    const pending = deferredSave()

    mocks.save.mockReturnValueOnce(pending.promise as never)

    render(<WslWorkspaceWizard />)

    await connect()

    fireEvent.click(screen.getByRole('button', { name: /Use this directory/ }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))

    // The user gives up while the host is still saving (the host's own save is
    // not cancelled — only its answer stops mattering here). The dialog's own
    // close is the only exit from the browse step.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect($wslWorkspaceWizardOpen.get()).toBe(false))

    const releasesAfterClose = mocks.releaseConnection.mock.calls.length

    await act(async () => {
      pending.settle({ ok: true, workspace: wslRecord({ id: 'wsl_late' }) })
    })

    expect($workspaceViewSelectedId.get()).toBeNull()
    expect($wslWorkspaceWizardOpen.get()).toBe(false)
    // The close path released the connection once; the stale answer did not.
    expect(mocks.releaseConnection).toHaveBeenCalledTimes(releasesAfterClose)
  })

  it('cannot touch a wizard that was reopened after the old save started', async () => {
    const pending = deferredSave()

    mocks.save.mockReturnValueOnce(pending.promise as never)

    render(<WslWorkspaceWizard />)

    await connect()

    fireEvent.click(screen.getByRole('button', { name: /Use this directory/ }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect($wslWorkspaceWizardOpen.get()).toBe(false))

    // A new wizard generation opens; its own discovery runs again.
    $wslWorkspaceWizardOpen.set(true)
    await screen.findByRole('button', { name: 'Connect' })

    await act(async () => {
      pending.settle({ ok: true, workspace: wslRecord({ id: 'wsl_late' }) })
    })

    // The new wizard is untouched: still open, nothing selected, and its
    // configuration step is still what is on screen.
    expect($wslWorkspaceWizardOpen.get()).toBe(true)
    expect($workspaceViewSelectedId.get()).toBeNull()
    expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Use this directory/ })).toBeNull()
  })

  it('still selects and closes for the save that is current', async () => {
    const pending = deferredSave()

    mocks.save.mockReturnValueOnce(pending.promise as never)

    render(<WslWorkspaceWizard />)

    await connect()

    fireEvent.click(screen.getByRole('button', { name: /Use this directory/ }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))

    await act(async () => {
      pending.settle({ ok: true, workspace: wslRecord({ id: 'wsl_current' }) })
    })

    await waitFor(() => expect($workspaceViewSelectedId.get()).toBe('wsl_current'))
    await waitFor(() => expect($wslWorkspaceWizardOpen.get()).toBe(false))
    expect(mocks.releaseConnection).toHaveBeenCalledWith('conn-1')
  })

  it('abandons a pending save when the user steps back to configuration', async () => {
    const pending = deferredSave()

    mocks.save.mockReturnValueOnce(pending.promise as never)

    render(<WslWorkspaceWizard />)

    await connect()

    fireEvent.click(screen.getByRole('button', { name: /Use this directory/ }))
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1))

    fireEvent.click(footerButton('Back'))
    expect(await screen.findByText('Configure WSL')).toBeTruthy()

    await act(async () => {
      pending.settle({ ok: true, workspace: wslRecord({ id: 'wsl_late' }) })
    })

    expect($workspaceViewSelectedId.get()).toBeNull()
    expect($wslWorkspaceWizardOpen.get()).toBe(true)
  })
})
