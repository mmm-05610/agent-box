import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AgentBoxClient, AgentBoxError, AgentBoxEventStream } from './client'
import type { AgentBoxStreamFrame } from './types'

class FakeWebSocket {
  static instances: FakeWebSocket[] = []

  static OPEN = 1
  static CONNECTING = 0
  static CLOSING = 2
  static CLOSED = 3

  static reset(): void {
    FakeWebSocket.instances = []
  }

  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  listeners = new Map<string, Array<(event: { code?: number; data?: string }) => void>>()

  url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  addEventListener(type: string, handler: (event: { code?: number; data?: string }) => void): void {
    const handlers = this.listeners.get(type) ?? []

    handlers.push(handler)
    this.listeners.set(type, handlers)
  }

  removeEventListener(): void {}

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED
    this.emit('close', { code: 1000 })
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN
    this.emit('open', {})
  }

  emitFrame(frame: AgentBoxStreamFrame): void {
    this.emit('message', { data: JSON.stringify(frame) })
  }

  emitError(): void {
    this.emit('error', {})
  }

  private emit(type: string, event: { code?: number; data?: string }): void {
    for (const handler of this.listeners.get(type) ?? []) {
      handler(event)
    }
  }
}

interface RecordedRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: unknown
}

class FakeFetch {
  requests: RecordedRequest[] = []
  responder: (request: RecordedRequest) => { status: number; body: unknown } = () => ({
    status: 404,
    body: { error: { code: 'NOT_FOUND', message: 'no route', correlation_id: 'c-0' } }
  })

  async call(input: string, init?: RequestInit): Promise<Response> {
    const url = new URL(input)
    const request: RecordedRequest = {
      method: init?.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      headers: Object.fromEntries(Object.entries((init?.headers as Record<string, string>) ?? {})),
      body: init?.body === undefined ? undefined : JSON.parse(init.body as string)
    }

    this.requests.push(request)
    const { status, body } = this.responder(request)

    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body
    } as Response
  }
}

function makeClient(fetcher: FakeFetch, webSocketFactory?: (url: string) => WebSocket): AgentBoxClient {
  return new AgentBoxClient(
    { baseUrl: 'http://127.0.0.1:3999/', token: 'synthetic-token' },
    {
      fetch: (input, init) => fetcher.call(input, init),
      ...(webSocketFactory ? { webSocketFactory } : {})
    }
  )
}

describe('AgentBoxClient HTTP path', () => {
  let fetcher: FakeFetch

  beforeEach(() => {
    fetcher = new FakeFetch()
  })

  afterEach(() => {
    FakeWebSocket.reset()
  })

  it('sends the bearer token and derives paths from the frozen /api/v1 surface', async () => {
    fetcher.responder = request => {
      if (request.path === '/api/v1/readiness') {
        return {
          status: 200,
          body: {
            session_store: { state: 'available' },
            workspace: { state: 'available' },
            execution: { state: 'available', providers: [] }
          }
        }
      }

      return { status: 404, body: { error: { code: 'X', message: 'y', correlation_id: 'c' } } }
    }

    const client = makeClient(fetcher)
    const readiness = await client.readiness()

    expect(readiness.session_store.state).toBe('available')
    expect(fetcher.requests[0].method).toBe('GET')
    expect(fetcher.requests[0].headers.Authorization).toBe('Bearer synthetic-token')
  })

  it('maps the typed error envelope to AgentBoxError with code and correlation id', async () => {
    fetcher.responder = () => ({
      status: 401,
      body: { error: { code: 'UNAUTHORIZED', message: 'missing or invalid bearer token', correlation_id: 'c-42' } }
    })

    const client = makeClient(fetcher)
    const failure = await client.readiness().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AgentBoxError)
    expect((failure as AgentBoxError).code).toBe('UNAUTHORIZED')
    expect((failure as AgentBoxError).correlationId).toBe('c-42')
    expect((failure as AgentBoxError).status).toBe(401)
  })

  it('maps network failure to a typed NETWORK error with the real cause, no fallback', async () => {
    const client = new AgentBoxClient({ baseUrl: 'http://127.0.0.1:1', token: 't' }, {
      fetch: async () => {
        throw new TypeError('fetch failed')
      }
    })

    const failure = await client.health().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AgentBoxError)
    expect((failure as AgentBoxError).code).toBe('NETWORK')
    expect((failure as AgentBoxError).message).toContain('unreachable')
  })

  it('submits a turn with the frozen snake_case body and returns the 202 receipt', async () => {
    fetcher.responder = request => {
      expect(request.method).toBe('POST')
      expect(request.path).toBe('/api/v1/sessions/sess_1/turns')
      expect(request.body).toEqual({
        idempotency_key: 'idem-1',
        input: 'hello synthetic',
        execution_provider_id: 'fake-harness'
      })

      return {
        status: 202,
        body: {
          session_id: 'sess_1',
          turn_id: 'turn_1',
          execution_id: 'exec_1',
          status: 'running',
          replayed: false
        }
      }
    }

    const receipt = await makeClient(fetcher).submitTurn('sess_1', {
      idempotencyKey: 'idem-1',
      input: 'hello synthetic',
      executionProviderId: 'fake-harness'
    })

    expect(receipt.turn_id).toBe('turn_1')
    expect(receipt.replayed).toBe(false)
  })

  it('cancels through the frozen cancel endpoint and returns the honest state', async () => {
    fetcher.responder = request => {
      expect(request.path).toBe('/api/v1/sessions/sess_1/turns/turn_9/cancel')

      return {
        status: 200,
        body: { turn_id: 'turn_9', session_id: 'sess_1', state: 'completed', terminal_outcome: 'succeeded' }
      }
    }

    const result = await makeClient(fetcher).cancelTurn('sess_1', 'turn_9')

    expect(result.state).toBe('completed')
    expect(result.terminal_outcome).toBe('succeeded')
  })

  it('fetches a transcript with the after cursor', async () => {
    fetcher.responder = request => {
      expect(request.path).toBe('/api/v1/sessions/sess_1/transcript?after=7')

      return { status: 200, body: { session_id: 'sess_1', watermark: 9, events: [], turns: [] } }
    }

    const transcript = await makeClient(fetcher).transcript('sess_1', 7)

    expect(transcript.watermark).toBe(9)
  })
})

/** The stream mints its ticket over an awaited fetch before dialing, so the
 * socket exists only after a microtask flush; tests wait for the Nth socket
 * explicitly (a reconnect reuses the same double class, so counting matters). */
async function nextSocket(previousCount = 0): Promise<FakeWebSocket> {
  await vi.waitFor(() => {
    if (FakeWebSocket.instances.length <= previousCount) {
      throw new Error(`socket not created yet (have ${FakeWebSocket.instances.length})`)
    }
  })

  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]
}

describe('AgentBoxEventStream', () => {
  let fetcher: FakeFetch

  beforeEach(() => {
    fetcher = new FakeFetch()
    FakeWebSocket.reset()
  })

  function mintTicketResponder(request: RecordedRequest): { status: number; body: unknown } {
    if (request.path === '/api/v1/ws-ticket') {
      return { status: 200, body: { ticket: 'ticket-1', expires_in: 30, single_use: true } }
    }

    return { status: 404, body: { error: { code: 'NOT_FOUND', message: 'x', correlation_id: 'c' } } }
  }

  it('dials with a fresh single-use ticket and the after cursor, then replays and streams events', async () => {
    fetcher.responder = mintTicketResponder
    const client = makeClient(fetcher, url => new FakeWebSocket(url) as unknown as WebSocket)
    const events: number[] = []
    const states: string[] = []

    const stream = client.openEventStream(
      'sess_1',
      {
        onEvent: event => events.push(event.seq),
        onState: state => states.push(state)
      },
      5
    )

    const connecting = stream.connect()
    const socket = await nextSocket()

    expect(socket.url).toBe('ws://127.0.0.1:3999/api/v1/sessions/sess_1/events?ticket=ticket-1&after=5')
    socket.emitOpen()
    await connecting

    socket.emitFrame({
      type: 'replay',
      events: [
        { seq: 6, event_id: 'e6', event_type: 'TURN_STARTED', turn_id: 't1', execution_id: null, payload: {}, terminal: false, created_at: '' },
        { seq: 7, event_id: 'e7', event_type: 'TURN_TERMINAL', turn_id: 't1', execution_id: null, payload: {}, terminal: true, created_at: '' }
      ],
      watermark: 7
    })
    socket.emitFrame({
      type: 'events',
      events: [
        // A replayed duplicate (seq ≤ watermark) is suppressed by the seq gate.
        { seq: 7, event_id: 'e7', event_type: 'TURN_TERMINAL', turn_id: 't1', execution_id: null, payload: {}, terminal: true, created_at: '' },
        { seq: 8, event_id: 'e8', event_type: 'TURN_COMMITTED', turn_id: 't1', execution_id: null, payload: {}, terminal: false, created_at: '' }
      ],
      watermark: 8
    })

    expect(events).toEqual([6, 7, 8])
    expect(states).toEqual(['open'])

    socket.close()
    expect(states).toEqual(['open', 'closed'])
  })

  it('surfaces resync_required as a real error state instead of pretending', async () => {
    fetcher.responder = mintTicketResponder
    const client = makeClient(fetcher, url => new FakeWebSocket(url) as unknown as WebSocket)
    const states: Array<[string, string?]> = []

    const stream = client.openEventStream('sess_1', {
      onEvent: () => {},
      onState: (state, detail) => states.push([state, detail])
    })

    const connecting = stream.connect()
    ;(await nextSocket()).emitOpen()
    await connecting

    FakeWebSocket.instances[0].emitFrame({ type: 'resync_required', reason: 'epoch_change', current_watermark: 99 })

    expect(states).toContainEqual(['error', 'resync_required: epoch_change'])
  })

  it('rejects connect when the socket errors before opening', async () => {
    fetcher.responder = mintTicketResponder
    const client = makeClient(fetcher, url => new FakeWebSocket(url) as unknown as WebSocket)

    const stream = client.openEventStream('sess_1', { onEvent: () => {}, onState: () => {} })
    const connecting = stream.connect()
    ;(await nextSocket()).emitError()
    const failure = await connecting.catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(AgentBoxError)
    expect((failure as AgentBoxError).code).toBe('NETWORK')
  })

  it('reconnect mints a NEW ticket and resumes from the last delivered seq', async () => {
    fetcher.responder = mintTicketResponder
    const client = makeClient(fetcher, url => new FakeWebSocket(url) as unknown as WebSocket)
    const stream = client.openEventStream(
      'sess_1',
      { onEvent: () => {}, onState: () => {} },
      2
    )

    const first = stream.connect()
    const firstSocket = await nextSocket()

    firstSocket.emitOpen()
    await first
    firstSocket.emitFrame({
      type: 'events',
      events: [
        { seq: 3, event_id: 'e3', event_type: 'x', turn_id: null, execution_id: null, payload: {}, terminal: false, created_at: '' }
      ],
      watermark: 3
    })

    const second = stream.reconnect()
    const secondSocket = await nextSocket(1)

    expect(secondSocket.url).toBe('ws://127.0.0.1:3999/api/v1/sessions/sess_1/events?ticket=ticket-1&after=3')

    secondSocket.emitOpen()
    await second
    expect(stream.isOpen).toBe(true)
  })
})
