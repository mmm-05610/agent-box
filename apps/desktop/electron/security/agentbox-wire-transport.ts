import { resolveAgentBoxWireEndpoint } from './agentbox-wire-endpoint-policy'

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

/** Endpoint rejections are reported as one of these two stable strings. The
 *  endpoint itself never appears in a message: this error can surface in the
 *  renderer, and the endpoint is a main-only fact. */
const ENDPOINT_INVALID = 'AgentBox service endpoint is invalid'
const ENDPOINT_NOT_LOOPBACK = 'AgentBox service endpoint is not loopback'
const TARGET_INVALID = 'AgentBox wire request target is invalid'

function requestUrl(endpoint: string, requestPath: string): URL {
  const decision = resolveAgentBoxWireEndpoint(endpoint)

  if (!decision.endpoint) {
    throw new AgentBoxWireHostUnavailableError(
      decision.reason === 'non_loopback' ? ENDPOINT_NOT_LOOPBACK : ENDPOINT_INVALID
    )
  }

  const url = new URL(requestPath, `${decision.endpoint.origin}/`)

  if (url.origin !== decision.endpoint.origin || !url.pathname.startsWith('/wire/v1/')) {
    throw new AgentBoxWireHostUnavailableError(TARGET_INVALID)
  }

  return url
}

/**
 * Main-only HTTP dispatcher. Endpoint and bearer token live in the injected
 * lifecycle closure; the renderer supplies neither and receives neither.
 *
 * The endpoint is judged before `fetch` is reached, so a non-loopback target
 * fails as a typed unavailable error rather than as an outbound connection the
 * host should never have made. The same judgement the event stream uses.
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
