import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WslWorkspaceRecord } from '@/types/workspace'
import type { WslFailure } from '@/types/workspace'

const saveWslWorkspace = vi.fn()
const listWslWorkspaces = vi.fn()
const reconnectWslWorkspace = vi.fn()
const renameWslWorkspace = vi.fn()
const archiveWslWorkspace = vi.fn()

vi.mock('@/api/workspace', () => ({
  saveWslWorkspace: (...args: unknown[]) => saveWslWorkspace(...args),
  listWslWorkspaces: (...args: unknown[]) => listWslWorkspaces(...args),
  reconnectWslWorkspace: (...args: unknown[]) => reconnectWslWorkspace(...args),
  renameWslWorkspace: (...args: unknown[]) => renameWslWorkspace(...args),
  archiveWslWorkspace: (...args: unknown[]) => archiveWslWorkspace(...args),
  releaseWslConnection: vi.fn(async () => ({ ok: true as const, released: true })),
  connectWsl: vi.fn(),
  listWslDirectories: vi.fn(),
  discoverWsl: vi.fn(),
  cancelWslOperation: vi.fn()
}))

import { $wslWorkspaces, $wslWorkspaceValidation, setWslWorkspaces } from '@/store/wsl-workspace'

import {
  archiveWslWorkspaceProjection,
  reconnectWslWorkspaceProjection,
  refreshWslWorkspaces,
  renameWslWorkspaceProjection,
  resetWslValidationsOnStartup,
  saveWslWorkspaceFromWizard
} from './wsl-workspace-usecases'

function record(overrides: Partial<WslWorkspaceRecord> = {}): WslWorkspaceRecord {
  return {
    id: 'wsl_ws_1',
    name: 'proj',
    kind: 'wsl',
    distribution: 'Ubuntu',
    configuredUser: null,
    actualUser: 'maoqh',
    rootPath: '/home/maoqh/proj',
    createdAt: 1,
    updatedAt: 1,
    archivedAt: null,
    ...overrides
  }
}

const failure = (code: WslFailure['code'], message = 'boom'): WslFailure => ({ ok: false, code, message, retryable: true })

beforeEach(() => {
  setWslWorkspaces([])
  $wslWorkspaceValidation.set({})
  vi.clearAllMocks()
})

describe('refreshWslWorkspaces', () => {
  it('projects the host list', async () => {
    listWslWorkspaces.mockResolvedValue({ ok: true, workspaces: [record()] })

    await refreshWslWorkspaces()

    expect($wslWorkspaces.get().map(w => w.id)).toEqual(['wsl_ws_1'])
  })

  it('a host failure never clears the existing projection', async () => {
    setWslWorkspaces([record()])
    listWslWorkspaces.mockResolvedValue(failure('WSL_LIST_FAILED'))

    await refreshWslWorkspaces()

    expect($wslWorkspaces.get().map(w => w.id)).toEqual(['wsl_ws_1'])
  })
})

describe('saveWslWorkspaceFromWizard', () => {
  it('persists through the host and upserts the returned record', async () => {
    const saved = record({ id: 'wsl_ws_new', name: '验收项目' })

    saveWslWorkspace.mockResolvedValue({ ok: true, workspace: saved, requestIdReplay: false })

    const outcome = await saveWslWorkspaceFromWizard({ connectionId: 'conn-1', path: '/srv/proj', name: '验收项目' })

    expect(outcome.ok).toBe(true)
    expect(saveWslWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: 'conn-1', path: '/srv/proj', name: '验收项目' })
    )

    const request = saveWslWorkspace.mock.calls[0][0]

    expect(request.requestId).toMatch(/^wsl_save_/)
    expect($wslWorkspaces.get().map(w => w.id)).toEqual(['wsl_ws_new'])
    expect($wslWorkspaceValidation.get()['wsl_ws_new']).toEqual({ status: 'unverified' })
  })

  it('a failed save changes nothing, so the wizard can retry with its selection', async () => {
    setWslWorkspaces([record()])
    saveWslWorkspace.mockResolvedValue(failure('WSL_DIRECTORY_NOT_FOUND'))

    const outcome = await saveWslWorkspaceFromWizard({ connectionId: 'conn-1', path: '/gone' })

    expect(outcome.ok).toBe(false)
    expect($wslWorkspaces.get().map(w => w.id)).toEqual(['wsl_ws_1'])
  })
})

describe('reconnectWslWorkspaceProjection', () => {
  it('moves validating → validated and reports an identity change', async () => {
    reconnectWslWorkspace.mockResolvedValue({
      ok: true,
      status: 'connected',
      workspace: record(),
      actualUser: 'someone-else',
      userChanged: true
    })

    const outcome = await reconnectWslWorkspaceProjection('wsl_ws_1')

    expect(outcome).toMatchObject({ ok: true, status: 'connected', userChanged: true, actualUser: 'someone-else' })
    expect($wslWorkspaceValidation.get()['wsl_ws_1']).toMatchObject({ status: 'validated', userChanged: true })
  })

  it('a failed revalidation lands on a failed state with its typed code', async () => {
    reconnectWslWorkspace.mockResolvedValue({ ok: true, status: 'failed', code: 'WSL_UNKNOWN_DISTRIBUTION', message: 'gone' })

    const outcome = await reconnectWslWorkspaceProjection('wsl_ws_1')

    expect(outcome.ok && outcome.status === 'failed').toBe(true)
    expect($wslWorkspaceValidation.get()['wsl_ws_1']).toMatchObject({ status: 'failed', code: 'WSL_UNKNOWN_DISTRIBUTION' })
  })

  it('does not report success when the host outcome was a failure', async () => {
    reconnectWslWorkspace.mockResolvedValue(failure('WSL_UNAVAILABLE', 'no wsl'))

    const outcome = await reconnectWslWorkspaceProjection('wsl_ws_1')

    expect(outcome.ok && outcome.status === 'failed').toBe(true)
    expect($wslWorkspaceValidation.get()['wsl_ws_1']).toMatchObject({ status: 'failed', code: 'WSL_UNAVAILABLE' })
  })
})

describe('resetWslValidationsOnStartup', () => {
  it('downgrades validated facts to unverified but keeps failure history', () => {
    $wslWorkspaceValidation.set({
      wsl_ws_1: { status: 'validated', actualUser: 'u', userChanged: false, verifiedAt: 1 },
      wsl_ws_2: { status: 'failed', code: 'WSL_DIRECTORY_NOT_FOUND', message: 'x', verifiedAt: 1 }
    })

    resetWslValidationsOnStartup()

    expect($wslWorkspaceValidation.get()['wsl_ws_1']).toEqual({ status: 'unverified' })
    expect($wslWorkspaceValidation.get()['wsl_ws_2']?.status).toBe('failed')
  })
})

describe('renameWslWorkspaceProjection', () => {
  it('updates the projected record only from the host answer', async () => {
    setWslWorkspaces([record()])
    renameWslWorkspace.mockResolvedValue({ ok: true, workspace: record({ name: '新名字', updatedAt: 2 }) })

    const outcome = await renameWslWorkspaceProjection('wsl_ws_1', '新名字')

    expect(outcome.ok).toBe(true)
    expect(renameWslWorkspace).toHaveBeenCalledWith({ workspaceId: 'wsl_ws_1', name: '新名字' })
    expect($wslWorkspaces.get()[0]).toMatchObject({ id: 'wsl_ws_1', name: '新名字' })
  })

  it('a failed rename leaves the projection untouched', async () => {
    setWslWorkspaces([record()])
    renameWslWorkspace.mockResolvedValue(failure('WSL_NOT_FOUND'))

    const outcome = await renameWslWorkspaceProjection('wsl_ws_1', 'X')

    expect(outcome.ok).toBe(false)
    expect($wslWorkspaces.get()[0]?.name).toBe('proj')
  })
})

describe('archiveWslWorkspaceProjection', () => {
  it('drops the row and its validation state once the host archived it', async () => {
    setWslWorkspaces([record(), record({ id: 'wsl_ws_2', rootPath: '/srv/b' })])
    $wslWorkspaceValidation.set({ wsl_ws_1: { status: 'validated', actualUser: 'u', userChanged: false, verifiedAt: 1 } })
    archiveWslWorkspace.mockResolvedValue({ ok: true, archived: true, workspace: null })

    const outcome = await archiveWslWorkspaceProjection('wsl_ws_1')

    expect(outcome.ok && outcome.archived).toBe(true)
    expect($wslWorkspaces.get().map(w => w.id)).toEqual(['wsl_ws_2'])
    expect($wslWorkspaceValidation.get()['wsl_ws_1']).toBeUndefined()
    expect($wslWorkspaceValidation.get()['wsl_ws_2']).toBeUndefined()
  })

  it('an already-archived id still clears a stale local row (idempotent archive)', async () => {
    setWslWorkspaces([record()])
    archiveWslWorkspace.mockResolvedValue({ ok: true, archived: false, workspace: null })

    const outcome = await archiveWslWorkspaceProjection('wsl_ws_1')

    expect(outcome.ok && outcome.archived).toBe(false)
    expect($wslWorkspaces.get()).toEqual([])
  })

  it('a failed archive keeps the row so the user can retry', async () => {
    setWslWorkspaces([record()])
    archiveWslWorkspace.mockResolvedValue(failure('WSL_SAVE_FAILED'))

    const outcome = await archiveWslWorkspaceProjection('wsl_ws_1')

    expect(outcome.ok).toBe(false)
    expect($wslWorkspaces.get().map(w => w.id)).toEqual(['wsl_ws_1'])
  })
})
