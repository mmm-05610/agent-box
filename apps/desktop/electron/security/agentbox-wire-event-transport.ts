import { resolveAgentBoxWireEndpoint } from './agentbox-wire-endpoint-policy'
import type { AgentBoxWireHostConnection } from './agentbox-wire-transport'

interface AgentBoxWireEventSocket {
  addEventListener?: (type: string, listener: (event: unknown) => void) => void
  close?: () => void
  on?: (type: string, listener: (event: unknown) => void) => void
  removeEventListener?: (type: string, listener: (event: unknown) => void) => void
  off?: (type: string, listener: (event: unknown) => void) => void
}

interface AgentBoxWireEventSocketConstructor {
  new (url: string, options?: { headers: Record<string, string> }): AgentBoxWireEventSocket
}

/**
 * Why an event stream could not be served. Stable categories, not prose: a
 * diagnostic sink is allowed to record one of these and nothing else, because
 * the endpoint and the session token live in the lifecycle closure and must
 * never reach a log line.
 */
export type AgentBoxWireEventErrorCode =
  | 'connection_unavailable'
  | 'endpoint_rejected'
  | 'socket_error'
  | 'socket_unavailable'

/** The message is fixed for every cause; `code` carries the category. A raw
 *  transport cause could quote the endpoint or the token, so none is attached. */
export class AgentBoxWireEventError extends Error {
  readonly code: AgentBoxWireEventErrorCode

  constructor(code: AgentBoxWireEventErrorCode, message = 'AgentBox event stream is unavailable') {
    super(message)
    this.name = 'AgentBoxWireEventError'
    this.code = code
  }
}

export interface AgentBoxWireEventTransportOptions {
  connection: () => AgentBoxWireHostConnection | null
  createWebSocket?: AgentBoxWireEventSocketConstructor
  onError?: (error: Error) => void
}

export type AgentBoxWireEventSubscriber = (
  input: { sessionId: string; cursor: string },
  listener: (frame: unknown) => void
) => () => void

function eventStreamUrl(endpoint: string, sessionId: string, cursor: string): null | string {
  const decision = resolveAgentBoxWireEndpoint(endpoint)

  if (!decision.endpoint) {
    return null
  }

  const url = new URL(decision.endpoint.origin)

  url.protocol = decision.endpoint.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/wire/v1/event-stream'
  url.search = new URLSearchParams({ cursor, sessionId }).toString()

  return url.toString()
}

function addSocketListener(socket: AgentBoxWireEventSocket, type: string, listener: (event: unknown) => void): void {
  if (typeof socket.addEventListener === 'function') {
    socket.addEventListener(type, listener)
  } else {
    socket.on?.(type, listener)
  }
}

function removeSocketListener(socket: AgentBoxWireEventSocket, type: string, listener: (event: unknown) => void): void {
  if (typeof socket.removeEventListener === 'function') {
    socket.removeEventListener(type, listener)
  } else {
    socket.off?.(type, listener)
  }
}

/**
 * Main-process-only event stream. The renderer receives opaque JSON frames;
 * replay, cursor semantics, and frame validation remain renderer concerns.
 */
export function createAgentBoxWireEventTransport({
  connection,
  createWebSocket,
  onError
}: AgentBoxWireEventTransportOptions): AgentBoxWireEventSubscriber {
  return ({ sessionId, cursor }, listener) => {
    let current: AgentBoxWireHostConnection | null

    try {
      current = connection()
    } catch {
      reportError(onError, 'connection_unavailable')

      return noSubscription()
    }

    if (!current?.sessionToken) {
      // A missing connection is a fact the caller has to be able to see. The
      // stream used to answer this with a silent no-op cleanup, which made "no
      // event source" and "events stopped arriving" indistinguishable.
      reportError(onError, 'connection_unavailable')

      return noSubscription()
    }

    const url = eventStreamUrl(current.endpoint, sessionId, cursor)
    const WebSocketImpl = createWebSocket ?? (globalThis.WebSocket as unknown as AgentBoxWireEventSocketConstructor)

    if (!url) {
      reportError(onError, 'endpoint_rejected')

      return noSubscription()
    }

    if (typeof WebSocketImpl !== 'function') {
      reportError(onError, 'socket_unavailable')

      return noSubscription()
    }

    let socket: AgentBoxWireEventSocket

    try {
      socket = new WebSocketImpl(url, { headers: { authorization: `Bearer ${current.sessionToken}` } })
    } catch {
      reportError(onError, 'socket_unavailable')

      return noSubscription()
    }

    let closed = false

    const onMessage = (event: unknown) => {
      if (closed || typeof event !== 'object' || event === null || !('data' in event)) {
        return
      }

      const data = (event as { data?: unknown }).data

      if (typeof data !== 'string') {
        return
      }

      try {
        const frame = JSON.parse(data) as unknown

        if (!closed) {
          try {
            listener(frame)
          } catch {
            // A renderer listener must not crash the main process.
          }
        }
      } catch {
        // Ignore malformed server data; no invalid frame crosses the seam.
      }
    }

    const onSocketError = () => {
      if (!closed) {
        reportError(onError, 'socket_error')
      }
    }

    try {
      addSocketListener(socket, 'message', onMessage)
      addSocketListener(socket, 'error', onSocketError)
    } catch {
      // A socket that could not be wired up is still a socket that must not
      // stay open, and the caller still deserves the same diagnostic channel.
      closeQuietly(socket)
      reportError(onError, 'socket_error')

      return noSubscription()
    }

    return () => {
      if (closed) {
        return
      }

      closed = true
      removeSocketListener(socket, 'message', onMessage)
      removeSocketListener(socket, 'error', onSocketError)
      closeQuietly(socket)
    }
  }
}

/** Returned when no stream was opened. Idempotent by construction: it holds no
 *  state, so the IPC layer may release it any number of times. */
function noSubscription(): () => void {
  return () => undefined
}

function closeQuietly(socket: AgentBoxWireEventSocket): void {
  try {
    socket.close?.()
  } catch {
    // Teardown is best effort and remains idempotent.
  }
}

function reportError(onError: ((error: Error) => void) | undefined, code: AgentBoxWireEventErrorCode): void {
  try {
    onError?.(new AgentBoxWireEventError(code))
  } catch {
    // Diagnostics must not turn a transport failure into a main-process crash.
  }
}
