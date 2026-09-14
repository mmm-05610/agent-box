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

export interface AgentBoxWireEventTransportOptions {
  connection: () => AgentBoxWireHostConnection | null
  createWebSocket?: AgentBoxWireEventSocketConstructor
  onError?: (error: Error) => void
}

export type AgentBoxWireEventSubscriber = (
  input: { sessionId: string; cursor: string },
  listener: (frame: unknown) => void
) => () => void

const LOOPBACK_IPV4 = /^127\.(?:\d{1,3}\.){2}\d{1,3}$/

function isLoopbackHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1' || hostname === '[::1]') {
    return true
  }

  if (!LOOPBACK_IPV4.test(hostname)) {
    return false
  }

  return hostname
    .split('.')
    .slice(1)
    .every(part => Number(part) <= 255)
}

function eventStreamUrl(endpoint: string, sessionId: string, cursor: string): string | null {
  try {
    const base = new URL(endpoint)

    if (
      !['http:', 'https:'].includes(base.protocol) ||
      base.username ||
      base.password ||
      !isLoopbackHost(base.hostname)
    ) {
      return null
    }

    const url = new URL(base.origin)
    url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/wire/v1/event-stream'
    url.search = new URLSearchParams({ cursor, sessionId }).toString()

    return url.toString()
  } catch {
    return null
  }
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
      reportError(onError)

      return () => undefined
    }

    if (!current?.sessionToken) {
      return () => undefined
    }

    const url = eventStreamUrl(current.endpoint, sessionId, cursor)
    const WebSocketImpl = createWebSocket ?? (globalThis.WebSocket as unknown as AgentBoxWireEventSocketConstructor)

    if (!url || typeof WebSocketImpl !== 'function') {
      reportError(onError)

      return () => undefined
    }

    let socket: AgentBoxWireEventSocket

    try {
      socket = new WebSocketImpl(url, { headers: { authorization: `Bearer ${current.sessionToken}` } })
    } catch {
      reportError(onError)

      return () => undefined
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
        reportError(onError)
      }
    }

    addSocketListener(socket, 'message', onMessage)
    addSocketListener(socket, 'error', onSocketError)

    return () => {
      if (closed) {
        return
      }

      closed = true
      removeSocketListener(socket, 'message', onMessage)
      removeSocketListener(socket, 'error', onSocketError)

      try {
        socket.close?.()
      } catch {
        // Teardown is best effort and remains idempotent.
      }
    }
  }
}

function reportError(onError: ((error: Error) => void) | undefined): void {
  try {
    onError?.(new Error('AgentBox event stream is unavailable'))
  } catch {
    // Diagnostics must not turn a transport failure into a main-process crash.
  }
}
