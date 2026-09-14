import type { z } from 'zod'

import {
  type ServerHelloResult,
  ServerHelloResultSchema,
  type WireCapability,
  type WireError,
  type WireMethodName,
  WireMethods,
  type WireParamsOf,
  WireRequestSchema,
  WireResponseSchema,
  type WireResultOf
} from '@/types/wire/wire-v1'

export interface WireTransportRequest {
  body: unknown
  method: WireMethodName
  path: `/wire/v1/${WireMethodName}`
}

/**
 * Host-owned transport. It is the only layer allowed to attach the bearer
 * token; the typed renderer client never receives or returns that secret.
 */
export interface WireTransport {
  request(request: WireTransportRequest): Promise<unknown>
}

export class WireProtocolError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'WireProtocolError'
  }
}

export class WireUnavailableError extends Error {
  readonly code = 'UNAVAILABLE' as const

  constructor(message = 'AgentBox service is unavailable', readonly cause?: unknown) {
    super(message)
    this.name = 'WireUnavailableError'
  }
}

export class WireRemoteError extends Error {
  readonly code: WireError['code']
  readonly current: unknown
  readonly details: WireError['details']

  constructor(readonly error: WireError) {
    super(error.message)
    this.name = 'WireRemoteError'
    this.code = error.code
    this.current = error.current
    this.details = error.details
  }
}

export interface WireV1ClientOptions {
  createEnvelopeId?: () => number | string
  transport: WireTransport
}

/** A narrow, transport-injected wire client: validate → serialize → validate. */
export class WireV1Client {
  readonly #createEnvelopeId: () => number | string
  readonly #transport: WireTransport

  constructor({ createEnvelopeId, transport }: WireV1ClientOptions) {
    let sequence = 0

    this.#createEnvelopeId = createEnvelopeId ?? (() => ++sequence)
    this.#transport = transport
  }

  async call<M extends WireMethodName>(method: M, params: WireParamsOf<M>): Promise<WireResultOf<M>> {
    const [paramsSchema, resultSchema] = WireMethods[method]
    let parsedParams: WireParamsOf<M>

    try {
      parsedParams = (paramsSchema as unknown as z.ZodType<WireParamsOf<M>>).parse(params)
    } catch (error) {
      throw new WireProtocolError(`Invalid ${method} parameters`, error)
    }

    const id = this.#createEnvelopeId()
    const body = WireRequestSchema.parse({ jsonrpc: '2.0', id, method, params: parsedParams })
    let raw: unknown

    try {
      raw = await this.#transport.request({ body, method, path: `/wire/v1/${method}` })
    } catch (error) {
      if (error instanceof WireRemoteError || error instanceof WireProtocolError) {
        throw error
      }

      throw new WireUnavailableError(undefined, error)
    }

    const response = WireResponseSchema.safeParse(raw)

    if (!response.success) {
      throw new WireProtocolError(`Invalid ${method} response envelope`, response.error)
    }

    if (response.data.id !== null && response.data.id !== id) {
      throw new WireProtocolError(`Mismatched ${method} response id`)
    }

    if ('error' in response.data && response.data.error) {
      throw new WireRemoteError(response.data.error)
    }

    try {
      return (resultSchema as unknown as z.ZodType<WireResultOf<M>>).parse(response.data.result)
    } catch (error) {
      throw new WireProtocolError(`Invalid ${method} result`, error)
    }
  }

  async hello(clientPresentationSupports: string[] = []): Promise<ServerHelloResult> {
    const hello = await this.call('server.hello', {
      clientPresentationSupports,
      clientVersions: ['wire/1']
    })

    return ServerHelloResultSchema.parse(hello)
  }
}

/** Missing capability rows fail closed; only an explicit supported=true opens an action. */
export function wireCapability(hello: ServerHelloResult, capabilityId: string): WireCapability {
  return (
    hello.capabilities.find(capability => capability.id === capabilityId) ?? {
      id: capabilityId,
      reason: 'CAPABILITY_NOT_DECLARED',
      supported: false
    }
  )
}
