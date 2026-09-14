import type { IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({ getAllWindows: vi.fn(() => []), handle: vi.fn() }))

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: host.getAllWindows }, ipcMain: { handle: host.handle } }))

import { registerWorkCoreWireIpc } from './workcore-wire-ipc'

describe('Work Core wire IPC', () => {
  beforeEach(() => {
    host.getAllWindows.mockReset()
    host.getAllWindows.mockReturnValue([])
    host.handle.mockReset()
  })

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

  it('forwards an injected lifecycle event source to live renderer windows and returns its cleanup', () => {
    const send = vi.fn()
    const unsubscribe = vi.fn()
    let publish: ((frame: unknown) => void) | undefined

    host.getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send } },
      { isDestroyed: () => true, webContents: { send: vi.fn() } }
    ] as never)

    const cleanup = registerWorkCoreWireIpc({
      requestWire: vi.fn(),
      subscribeWireEvents(listener) {
        publish = listener

        return unsubscribe
      }
    })

    publish?.({ eventId: 'event-1' })

    expect(send).toHaveBeenCalledWith('agentbox:wire:event', { eventId: 'event-1' })
    cleanup()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
