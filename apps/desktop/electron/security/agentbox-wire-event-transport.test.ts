import { describe, expect, it, vi } from 'vitest'

import { AgentBoxWireEventError, createAgentBoxWireEventTransport } from './agentbox-wire-event-transport'

class FakeSocket {
  static instances: FakeSocket[] = []
  readonly listeners = new Map<string, Set<(event: unknown) => void>>()
  close = vi.fn()

  constructor(
    readonly url: string,
    readonly options: { headers: Record<string, string> }
  ) {
    FakeSocket.instances.push(this)
  }

  addEventListener(type: string, listener: (event: unknown) => void) {
    const listeners = this.listeners.get(type) ?? new Set()
    listeners.add(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.get(type)?.delete(listener)
  }

  emit(type: string, event: unknown) {
    this.listeners.get(type)?.forEach(listener => listener(event))
  }

  listenerCount(type: string) {
    return this.listeners.get(type)?.size ?? 0
  }
}

const connection = { endpoint: 'https://127.0.0.1:48152/ignored', sessionToken: 'secret-token' }

describe('AgentBox main-only wire event transport', () => {
  it('reads the lifecycle connection for every subscription', () => {
    FakeSocket.instances = []
    const connections = [connection, { endpoint: 'http://localhost:48153', sessionToken: 'rotated-token' }]
    const readConnection = vi.fn(() => connections.shift() ?? null)
    const subscribe = createAgentBoxWireEventTransport({ connection: readConnection, createWebSocket: FakeSocket })

    subscribe({ sessionId: 'first', cursor: '' }, vi.fn())
    subscribe({ sessionId: 'second', cursor: '' }, vi.fn())

    expect(readConnection).toHaveBeenCalledTimes(2)
    expect(FakeSocket.instances[0]?.url).toContain('127.0.0.1:48152')
    expect(FakeSocket.instances[1]?.url).toContain('localhost:48153')
    expect(FakeSocket.instances[1]?.options.headers.authorization).toBe('Bearer rotated-token')
  })

  it('constructs a loopback ws URL and keeps the bearer in init headers', () => {
    FakeSocket.instances = []

    const subscribe = createAgentBoxWireEventTransport({
      connection: () => connection,
      createWebSocket: FakeSocket
    })

    subscribe({ sessionId: 'session /?', cursor: 'cursor &?' }, vi.fn())

    const socket = FakeSocket.instances[0]!
    expect(socket.url).toBe('wss://127.0.0.1:48152/wire/v1/event-stream?cursor=cursor+%26%3F&sessionId=session+%2F%3F')
    expect(socket.options).toEqual({ headers: { authorization: 'Bearer secret-token' } })
    expect(socket.url).not.toContain('secret-token')
  })

  it('accepts the IPv6 loopback endpoint', () => {
    const factory = vi.fn(FakeSocket)

    const subscribe = createAgentBoxWireEventTransport({
      connection: () => ({ endpoint: 'http://[::1]:48152', sessionToken: 'token' }),
      createWebSocket: factory
    })

    subscribe({ sessionId: 's', cursor: '' }, vi.fn())

    expect(factory).toHaveBeenCalledOnce()
    expect(FakeSocket.instances.at(-1)?.url).toBe('ws://[::1]:48152/wire/v1/event-stream?cursor=&sessionId=s')
  })

  it('forwards only text JSON and ignores malformed or late messages', () => {
    FakeSocket.instances = []
    const listener = vi.fn()
    const subscribe = createAgentBoxWireEventTransport({ connection: () => connection, createWebSocket: FakeSocket })
    const cleanup = subscribe({ sessionId: 's', cursor: '' }, listener)
    const socket = FakeSocket.instances[0]!

    socket.emit('message', { data: JSON.stringify({ eventId: 'e1', seq: 1 }) })
    socket.emit('message', { data: '{not-json' })
    socket.emit('message', { data: new Uint8Array([123]) })
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({ eventId: 'e1', seq: 1 })

    cleanup()
    cleanup()
    expect(socket.listenerCount('message')).toBe(0)
    expect(socket.listenerCount('error')).toBe(0)
    socket.emit('message', { data: JSON.stringify({ eventId: 'late' }) })
    expect(listener).toHaveBeenCalledOnce()
    expect(socket.close).toHaveBeenCalledOnce()
  })

  it('reports socket errors with a fixed safe message', () => {
    FakeSocket.instances = []
    const onError = vi.fn()

    const subscribe = createAgentBoxWireEventTransport({
      connection: () => connection,
      createWebSocket: FakeSocket,
      onError
    })

    const cleanup = subscribe({ sessionId: 's', cursor: '' }, vi.fn())
    const socket = FakeSocket.instances[0]!

    socket.emit('error', { message: 'Bearer secret-token leaked by socket' })
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0].message).toBe('AgentBox event stream is unavailable')
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(AgentBoxWireEventError)
    expect((onError.mock.calls[0]?.[0] as AgentBoxWireEventError).code).toBe('socket_error')

    cleanup()
    socket.emit('error', { message: 'late secret-token error' })
    expect(onError).toHaveBeenCalledOnce()
  })

  it.each([
    'https://example.com',
    'http://user:pass@127.0.0.1:1',
    'ftp://127.0.0.1:1',
    'http://127.0.0.1.evil.test:1',
    'http://[::2]:1'
  ])('rejects unsafe endpoint %s without opening a socket', endpoint => {
    const onError = vi.fn()
    const factory = vi.fn(FakeSocket)

    const subscribe = createAgentBoxWireEventTransport({
      connection: () => ({ endpoint, sessionToken: 'secret-token' }),
      createWebSocket: factory,
      onError
    })

    const cleanup = subscribe({ sessionId: 's', cursor: '' }, vi.fn())
    cleanup()
    expect(factory).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.not.stringContaining('secret-token') })
    )
    expect((onError.mock.calls[0]?.[0] as AgentBoxWireEventError).code).toBe('endpoint_rejected')
  })

  // The stream used to be silent here: no connection meant an empty cleanup and
  // no signal, so "the service never came up" and "events quietly stopped" were
  // the same observation. Every derivation of "no connection" now reports the
  // same stable category, exactly once, and hands back a cleanup that is safe to
  // release repeatedly — the IPC layer releases subscriptions on its own timers.
  it.each([
    ['null', () => null],
    ['a thrown accessor', () => {
      throw new Error('lifecycle closure exploded with secret-token')
    }],
    ['a connection with no token', () => ({ endpoint: 'http://127.0.0.1:48152', sessionToken: '' })]
  ])('reports an unusable connection (%s) exactly once and returns an idempotent cleanup', (_label, readConnection) => {
    const onError = vi.fn()
    const subscribe = createAgentBoxWireEventTransport({ connection: readConnection, onError })

    const cleanup = subscribe({ sessionId: 's', cursor: '' }, vi.fn())

    expect(onError).toHaveBeenCalledOnce()
    expect((onError.mock.calls[0]?.[0] as AgentBoxWireEventError).code).toBe('connection_unavailable')
    expect(onError.mock.calls[0]?.[0].message).not.toContain('secret-token')

    expect(() => {
      cleanup()
      cleanup()
      cleanup()
    }).not.toThrow()
    expect(onError).toHaveBeenCalledOnce()
  })

  it('keeps a failing factory and a missing socket implementation on the same channel', () => {
    const onError = vi.fn()

    const failed = createAgentBoxWireEventTransport({
      connection: () => connection,
      createWebSocket: vi.fn(() => {
        throw new Error('secret-token should not escape')
      }),
      onError
    })

    expect(() => failed({ sessionId: 's', cursor: '' }, vi.fn())).not.toThrow()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0].message).not.toContain('secret-token')
    expect((onError.mock.calls[0]?.[0] as AgentBoxWireEventError).code).toBe('socket_unavailable')

    // A host with no WebSocket implementation at all is the same category, not
    // a crash and not a silent no-op.
    const noSocket = createAgentBoxWireEventTransport({
      connection: () => connection,
      createWebSocket: {} as unknown as typeof FakeSocket,
      onError
    })

    expect(() => noSocket({ sessionId: 's', cursor: '' }, vi.fn())).not.toThrow()
    expect(onError).toHaveBeenCalledTimes(2)
    expect((onError.mock.calls[1]?.[0] as AgentBoxWireEventError).code).toBe('socket_unavailable')
  })

  it('survives a diagnostic sink and a frame listener that both throw', () => {
    FakeSocket.instances = []

    const throwingSink = createAgentBoxWireEventTransport({
      connection: () => null,
      onError: () => {
        throw new Error('the sink itself is broken')
      }
    })

    // A throwing sink must not become a main-process crash.
    expect(() => throwingSink({ sessionId: 's', cursor: '' }, vi.fn())).not.toThrow()

    const listenerThrows = createAgentBoxWireEventTransport({
      connection: () => connection,
      createWebSocket: FakeSocket
    })

    const cleanup = listenerThrows(
      { sessionId: 's', cursor: '' },
      () => {
        throw new Error('renderer listener blew up')
      }
    )

    const socket = FakeSocket.instances[0]!
    expect(() => socket.emit('message', { data: '{"eventId":"e1"}' })).not.toThrow()
    expect(() => cleanup()).not.toThrow()
  })
})
