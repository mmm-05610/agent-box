export interface AgentBoxWireHostConnection {
  endpoint: string
  /** Main-process-only session token. Never return or log this value. */
  sessionToken: string
}

export interface AgentBoxWireHostRequest {
  body: unknown
  path: string
}

export type AgentBoxWireDispatcher = (request: AgentBoxWireHostRequest) => Promise<unknown>

export interface AgentBoxWireHttpTransportOptions {
  connection: () => AgentBoxWireHostConnection | null
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

export class AgentBoxWireHostUnavailableError extends Error {
  readonly code = 'UNAVAILABLE' as const

  constructor(message = 'AgentBox service is unavailable', readonly cause?: unknown) {
    super(message)
    this.name = 'AgentBoxWireHostUnavailableError'
  }
}

function requestUrl(endpoint: string, requestPath: string): URL {
  const base = new URL(endpoint)

  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) {
    throw new AgentBoxWireHostUnavailableError('AgentBox service endpoint is invalid')
  }

  const url = new URL(requestPath, `${base.origin}/`)

  if (url.origin !== base.origin || !url.pathname.startsWith('/wire/v1/')) {
    throw new AgentBoxWireHostUnavailableError('AgentBox wire request target is invalid')
  }

  return url
}

/**
 * Main-only HTTP dispatcher. Endpoint and bearer token live in the injected
 * lifecycle closure; the renderer supplies neither and receives neither.
 */
export function createAgentBoxWireHttpTransport({
  connection,
  fetchImpl = fetch,
  timeoutMs = 15_000
}: AgentBoxWireHttpTransportOptions): AgentBoxWireDispatcher {
  return async request => {
    const current = connection()

    if (!current || !current.sessionToken) {
      throw new AgentBoxWireHostUnavailableError()
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetchImpl(requestUrl(current.endpoint, request.path), {
        body: JSON.stringify(request.body),
        headers: {
          authorization: `Bearer ${current.sessionToken}`,
          'content-type': 'application/json'
        },
        method: 'POST',
        redirect: 'error',
        signal: controller.signal
      })

      const text = await response.text()

      try {
        return JSON.parse(text) as unknown
      } catch (error) {
        throw new AgentBoxWireHostUnavailableError('AgentBox service returned an invalid response', error)
      }
    } catch (error) {
      if (error instanceof AgentBoxWireHostUnavailableError) {
        throw error
      }

      throw new AgentBoxWireHostUnavailableError(undefined, error)
    } finally {
      clearTimeout(timeout)
    }
  }
}

/** Production remains honestly unavailable until the concrete lifecycle owns
 * an endpoint and protected token bootstrap. There is deliberately no Hermes
 * fallback behind this dispatcher. */
export const unavailableAgentBoxWireDispatcher: AgentBoxWireDispatcher = async () => {
  throw new AgentBoxWireHostUnavailableError()
}
