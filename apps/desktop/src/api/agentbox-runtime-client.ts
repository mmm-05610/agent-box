import { type WireTransport, WireUnavailableError, WireV1Client } from './wire-v1-client'

let runtimeClient: WireV1Client | null = null

const hostTransport: WireTransport = {
  async request(request) {
    const bridge = window.agentBoxDesktop?.wire

    if (!bridge) {
      throw new WireUnavailableError('AgentBox Desktop host transport is unavailable')
    }

    return bridge.request(request)
  }
}

/** The production renderer client. The host owns endpoint discovery and auth. */
export function agentBoxRuntimeClient(): WireV1Client {
  runtimeClient ??= new WireV1Client({ transport: hostTransport })

  return runtimeClient
}
