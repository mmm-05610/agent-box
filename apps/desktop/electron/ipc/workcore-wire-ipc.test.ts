import type { IpcMainInvokeEvent } from 'electron'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const host = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: host.handle, on: host.on, removeListener: host.removeListener }
}))

import { registerWorkCoreWireIpc } from './workcore-wire-ipc'

describe('Work Core wire IPC', () => {
  beforeEach(() => {
    host.handle.mockReset()
    host.on.mockReset()
    host.removeListener.mockReset()
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

  it('owns subscriptions by sender and id, forwards only to that sender, and cleans the source once', () => {
    const send = vi.fn()
    const unsubscribe = vi.fn()
    let publish: ((frame: unknown) => void) | undefined
    const sender = { id: 7, isDestroyed: () => false, send, once: vi.fn(), removeListener: vi.fn() }

    const cleanup = registerWorkCoreWireIpc({
      requestWire: vi.fn(),
      subscribeWireEvents(input, listener) {
        expect(input).toEqual({ cursor: 'cursor-1', sessionId: 'session-1' })
        publish = listener

        return unsubscribe
      }
    })


    const subscribe = host.on.mock.calls.find(([channel]) => channel === 'agentbox:wire:events:subscribe')?.[1] as (
      event: { sender: typeof sender },
      value: unknown
    ) => void

    const unsubscribeHandler = host.on.mock.calls.find(([channel]) => channel === 'agentbox:wire:events:unsubscribe')?.[1] as (
      event: { sender: typeof sender },
      value: unknown
    ) => void

    expect(() => subscribe({ sender }, { sessionId: '', cursor: 'cursor-1', subscriptionId: 'bad' })).not.toThrow()

    subscribe({ sender }, { cursor: 'cursor-1', sessionId: 'session-1', subscriptionId: 'sub-1' })

    publish?.({ eventId: 'event-1' })

    expect(send).toHaveBeenCalledWith('agentbox:wire:event', {
      frame: { eventId: 'event-1' },
      subscriptionId: 'sub-1'
    })

    unsubscribeHandler({ sender }, { subscriptionId: 'sub-1' })
    unsubscribeHandler({ sender }, { subscriptionId: 'sub-1' })

    expect(unsubscribe).toHaveBeenCalledTimes(1)

    cleanup()
    expect(host.removeListener).toHaveBeenCalledTimes(2)
  })

  it('cleans a synchronously failing source and all subscriptions on sender destruction', () => {
    const cleanupOne = vi.fn()

    const cleanupTwo = vi.fn(() => {
      throw new Error('already closed')
    })

    const sender = { id: 11, isDestroyed: () => false, send: vi.fn(), once: vi.fn(), removeListener: vi.fn() }
    let destroyed: (() => void) | undefined
    sender.once.mockImplementation((_event: string, listener: () => void) => {
      destroyed = listener
    })

    let sourceCalls = 0

    const subscribeWireEvents = vi.fn((_input: unknown, _listener: (frame: unknown) => void) => {
      sourceCalls += 1

      if (sourceCalls === 1) {
        throw new Error('source unavailable')
      }

      return sourceCalls === 2 ? cleanupOne : cleanupTwo
    })

    const cleanup = registerWorkCoreWireIpc({ requestWire: vi.fn(), subscribeWireEvents })

    const subscribe = host.on.mock.calls.find(([channel]) => channel === 'agentbox:wire:events:subscribe')?.[1] as (
      event: { sender: typeof sender },
      value: unknown
    ) => void

    subscribe({ sender }, { cursor: 'c1', sessionId: 's1', subscriptionId: 'sub-fails' })
    subscribe({ sender }, { cursor: 'c2', sessionId: 's1', subscriptionId: 'sub-one' })
    subscribe({ sender }, { cursor: 'c3', sessionId: 's1', subscriptionId: 'sub-two' })

    expect(() => destroyed?.()).not.toThrow()
    expect(cleanupOne).toHaveBeenCalledTimes(1)
    expect(cleanupTwo).toHaveBeenCalledTimes(1)
    cleanup()
    expect(cleanupOne).toHaveBeenCalledTimes(1)
    expect(cleanupTwo).toHaveBeenCalledTimes(1)
  })
})
