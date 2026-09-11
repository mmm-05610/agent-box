/**
 * AgentBox Desktop adapter — HTTP + WebSocket transport.
 *
 * A narrow client for the frozen AgentBox sidecar `/api/v1` protocol. This is
 * the ONLY file in the desktop that talks to AgentBox over the network; the
 * lab plugin (Phase 0) and any later backend bootstrap consume it.
 *
 * Error discipline (Phase 0 hard requirement): every failure surfaces as a
 * typed `AgentBoxError` carrying the sidecar's error envelope. There is NO
 * silent fallback, no fake success, no retry loop hidden in here — reconnect
 * policy belongs to the connection owner.
 */

import type {
  AgentBoxCancelResult,
  AgentBoxEndpointConfig,
  AgentBoxErrorEnvelope,
  AgentBoxEvent,
  AgentBoxHealth,
  AgentBoxProject,
  AgentBoxReadiness,
  AgentBoxRemoteProject,
  AgentBoxSession,
  AgentBoxStreamFrame,
  AgentBoxTranscript,
  AgentBoxTurnReceipt,
  AgentBoxWsTicket
} from './types'

/** Typed failure with the sidecar's error code; network failures use
 * well-known codes (`NETWORK`, `CLOSED`, `TIMEOUT`) so callers can classify
 * without string matching. */
export class AgentBoxError extends Error {
  readonly code: string
  readonly correlationId?: string
  readonly status?: number

  constructor(code: string, message: string, options?: { correlationId?: string; status?: number }) {
    super(message)
    this.name = 'AgentBoxError'
    this.code = code
    this.correlationId = options?.correlationId
    this.status = options?.status
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
type WebSocketFactory = (url: string) => WebSocket

export type AgentBoxStreamState = 'open' | 'closed' | 'error' | 'reconnecting'
export type AgentBoxStreamStateHandler = (state: AgentBoxStreamState, detail?: string) => void

export interface AgentBoxClientOptions {
  /** Injectable fetch/WebSocket for tests; defaults to the globals. */
  fetch?: FetchLike
  webSocketFactory?: WebSocketFactory
  /** Per-request timeout for REST calls (default 15s). */
  requestTimeoutMs?: number
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000

function isAgentBoxErrorEnvelope(value: unknown): value is AgentBoxErrorEnvelope {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const error = (value as { error?: unknown }).error

  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { code?: unknown }).code === 'string' &&
    typeof (error as { message?: unknown }).message === 'string'
  )
}

/**
 * Session-scoped event stream over the frozen §4.2 frames. Dials with a
 * single-use ws-ticket, replays from `after`, and exposes live frames. The
 * socket is NEVER silently redialed: `onState('closed'|'error')` tells the
 * owner, and `reconnect()` mints a FRESH ticket (single-use tickets are
 * never reused).
 */
export class AgentBoxEventStream {
  private socket: WebSocket | null = null
  private lastSeq: number
  private readonly onEvent: (event: AgentBoxEvent) => void
  private readonly onState: AgentBoxStreamStateHandler

  constructor(
    private readonly client: AgentBoxClient,
    private readonly sessionId: string,
    handlers: {
      onEvent: (event: AgentBoxEvent) => void
      onState: AgentBoxStreamStateHandler
    },
    after = 0
  ) {
    this.lastSeq = after
    this.onEvent = handlers.onEvent
    this.onState = handlers.onState
  }

  get isOpen(): boolean {
    return this.socket?.readyState === WebSocket.OPEN
  }

  async connect(): Promise<void> {
    const ticket = await this.client.mintWsTicket()
    const url = new URL(`${this.client.baseUrl}/api/v1/sessions/${this.sessionId}/events`)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.searchParams.set('ticket', ticket.ticket)
    url.searchParams.set('after', String(this.lastSeq))

    const socket = this.client.webSocketFactory(url.toString())
    this.socket = socket

    socket.addEventListener('open', () => {
      this.onState('open')
    })

    socket.addEventListener('message', message => {
      let frame: AgentBoxStreamFrame

      try {
        frame = JSON.parse(String(message.data)) as AgentBoxStreamFrame
      } catch {
        return
      }

      if (frame.type === 'replay' || frame.type === 'events') {
        for (const event of frame.events) {
          // Seq-gated dispatch: a replayed gap or a live frame racing it can
          // repeat seqs; only advancing seqs reach the consumer.
          if (event.seq > this.lastSeq) {
            this.lastSeq = event.seq
            this.onEvent(event)
          }
        }
      } else if (frame.type === 'resync_required') {
        this.onState('error', `resync_required: ${frame.reason}`)
      } else if (frame.type === 'invalid_cursor') {
        this.onState('error', 'invalid_cursor')
      } else if (frame.type === 'session_error') {
        this.onState('error', 'session_error')
      }
    })

    socket.addEventListener('close', event => {
      this.socket = null
      this.onState('closed', `code=${event.code}`)
    })

    socket.addEventListener('error', () => {
      this.onState('error', 'websocket error')
    })

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new AgentBoxError('TIMEOUT', 'event stream open timed out')), 10_000)

      const cleanup = () => {
        clearTimeout(timer)
        socket.removeEventListener('open', onOpen)
        socket.removeEventListener('error', onError)
      }

      const onOpen = () => {
        cleanup()
        resolve()
      }

      const onError = () => {
        cleanup()
        reject(new AgentBoxError('NETWORK', 'event stream failed to open'))
      }

      socket.addEventListener('open', onOpen, { once: true })
      socket.addEventListener('error', onError, { once: true })
    })
  }

  /** Fresh dial with a fresh ticket from the last delivered seq. */
  async reconnect(): Promise<void> {
    this.close()
    this.onState('reconnecting')

    await this.connect()
  }

  close(): void {
    const socket = this.socket

    if (!socket) {
      return
    }

    this.socket = null

    try {
      socket.close()
    } catch {
      // Already gone.
    }
  }
}

/** Minimal HTTP/WS client for the frozen sidecar surface. */
export class AgentBoxClient {
  private readonly fetchImpl: FetchLike
  readonly webSocketFactory: WebSocketFactory
  private readonly requestTimeoutMs: number

  constructor(
    readonly config: AgentBoxEndpointConfig,
    options: AgentBoxClientOptions = {}
  ) {
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.webSocketFactory = options.webSocketFactory ?? (url => new WebSocket(url))
    this.requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS
  }

  get baseUrl(): string {
    return this.config.baseUrl.replace(/\/$/, '')
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    let response: Response

    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      })
    } catch (error) {
      throw new AgentBoxError(
        'NETWORK',
        `AgentBox sidecar unreachable at ${this.baseUrl}${path}: ${error instanceof Error ? error.message : String(error)}`
      )
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      let parsed: unknown = null

      try {
        parsed = await response.json()
      } catch {
        // Non-JSON body: fall through with the status code.
      }

      if (isAgentBoxErrorEnvelope(parsed)) {
        throw new AgentBoxError(parsed.error.code, parsed.error.message, {
          correlationId: parsed.error.correlation_id,
          status: response.status
        })
      }

      throw new AgentBoxError('HTTP', `AgentBox sidecar returned ${response.status} for ${path}`, {
        status: response.status
      })
    }

    return (await response.json()) as T
  }

  async health(): Promise<AgentBoxHealth> {
    return this.request<AgentBoxHealth>('GET', '/api/v1/health')
  }

  /** Readiness requires the bearer token (401 without — the handshake check). */
  async readiness(): Promise<AgentBoxReadiness> {
    return this.request<AgentBoxReadiness>('GET', '/api/v1/readiness')
  }

  async remoteProjects(): Promise<AgentBoxRemoteProject[]> {
    const result = await this.request<{ remote_projects: AgentBoxRemoteProject[] }>('GET', '/api/v1/remote-projects')

    return result.remote_projects
  }

  async registerProject(path: string): Promise<AgentBoxProject> {
    const result = await this.request<{ project: AgentBoxProject }>('POST', '/api/v1/projects', { path })

    return result.project
  }

  async createSession(params: { idempotencyKey: string; title: string; projectId?: string }): Promise<AgentBoxSession> {
    const result = await this.request<{ session: AgentBoxSession }>('POST', '/api/v1/sessions', {
      idempotency_key: params.idempotencyKey,
      title: params.title,
      ...(params.projectId ? { project_id: params.projectId } : {})
    })

    return result.session
  }

  async getSession(sessionId: string): Promise<AgentBoxSession> {
    const result = await this.request<{ session: AgentBoxSession }>('GET', `/api/v1/sessions/${sessionId}`)

    return result.session
  }

  async listSessions(projectId?: string): Promise<AgentBoxSession[]> {
    const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''
    const result = await this.request<{ sessions: AgentBoxSession[] }>('GET', `/api/v1/sessions${query}`)

    return result.sessions ?? []
  }

  /** Read-only launch preview; NEVER creates a turn or starts a worker. */
  async launchPreview(sessionId: string, selection?: Record<string, unknown>): Promise<unknown> {
    return this.request<unknown>('POST', `/api/v1/sessions/${sessionId}/launch-preview`, {
      ...(selection ? { selection } : {})
    })
  }

  /** Submit a turn — 202 receipt; the turn then streams over the event channel. */
  async submitTurn(
    sessionId: string,
    params: { idempotencyKey: string; input: string; executionProviderId?: string }
  ): Promise<AgentBoxTurnReceipt> {
    return this.request<AgentBoxTurnReceipt>('POST', `/api/v1/sessions/${sessionId}/turns`, {
      idempotency_key: params.idempotencyKey,
      input: params.input,
      ...(params.executionProviderId ? { execution_provider_id: params.executionProviderId } : {})
    })
  }

  async cancelTurn(sessionId: string, turnId: string): Promise<AgentBoxCancelResult> {
    return this.request<AgentBoxCancelResult>('POST', `/api/v1/sessions/${sessionId}/turns/${turnId}/cancel`)
  }

  async transcript(sessionId: string, after?: number): Promise<AgentBoxTranscript> {
    const query = after === undefined ? '' : `?after=${after}`

    return this.request<AgentBoxTranscript>('GET', `/api/v1/sessions/${sessionId}/transcript${query}`)
  }

  async mintWsTicket(): Promise<AgentBoxWsTicket> {
    return this.request<AgentBoxWsTicket>('POST', '/api/v1/ws-ticket')
  }

  openEventStream(
    sessionId: string,
    handlers: {
      onEvent: (event: AgentBoxEvent) => void
      onState: AgentBoxStreamStateHandler
    },
    after = 0
  ): AgentBoxEventStream {
    return new AgentBoxEventStream(this, sessionId, handlers, after)
  }
}
