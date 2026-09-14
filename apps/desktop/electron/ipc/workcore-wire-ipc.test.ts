import type { IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({ handle: vi.fn() }))

vi.mock('electron', () => ({ ipcMain: { handle: host.handle } }))

import { registerWorkCoreWireIpc } from './workcore-wire-ipc'

describe('Work Core wire IPC', () => {
  beforeEach(() => host.handle.mockReset())

  it('accepts only a matching known method, path, and envelope', async () => {
    const requestWire = vi.fn(async () => ({ jsonrpc: '2.0', id: 4, result: { items: [], nextCursor: null } }))
    registerWorkCoreWireIpc({ requestWire })
    const handler = host.handle.mock.calls[0]?.[1] as (event: IpcMainInvokeEvent, value: unknown) => Promise<unknown>
    const body = { jsonrpc: '2.0', id: 4, method: 'workspaces.list', params: { includeArchived: false } }

    await expect(
      handler({} as IpcMainInvokeEvent, {
        body,
        method: 'workspaces.list',
        path: '/wire/v1/workspaces.list'
      })
    ).resolves.toMatchObject({ id: 4 })
    expect(requestWire).toHaveBeenCalledWith({ body, path: '/wire/v1/workspaces.list' })
  })

  it('rejects renderer-selected paths, malformed methods, and mismatched envelopes before dispatch', async () => {
    const requestWire = vi.fn()
    registerWorkCoreWireIpc({ requestWire })
    const handler = host.handle.mock.calls[0]?.[1] as (event: IpcMainInvokeEvent, value: unknown) => Promise<unknown>
    const body = { jsonrpc: '2.0', id: 4, method: 'workspaces.list', params: { includeArchived: false } }

    expect(() =>
      handler({} as IpcMainInvokeEvent, {
        body,
        method: 'workspaces.list',
        path: '/wire/v1/server.hello'
      })
    ).toThrow('path does not match')
    expect(() =>
      handler({} as IpcMainInvokeEvent, {
        body,
        method: 'unknown',
        path: '/wire/v1/unknown'
      })
    ).toThrow('Invalid AgentBox wire method')
    expect(() =>
      handler({} as IpcMainInvokeEvent, {
        body: { ...body, method: 'server.hello' },
        method: 'workspaces.list',
        path: '/wire/v1/workspaces.list'
      })
    ).toThrow('envelope does not match')
    expect(requestWire).not.toHaveBeenCalled()
  })
})
