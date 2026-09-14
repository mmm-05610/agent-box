import { describe, expect, it } from 'vitest'

import { asWireId, type ServerHelloResult, WIRE_PROTOCOL_VERSION } from '@/types/wire/wire-v1'

import { agentBoxCapabilitySupported, agentBoxQueueControlsAvailable } from './agentbox-service'

const hello = (supported: boolean): ServerHelloResult => ({
  auth: { required: false },
  capabilities: [
    {
      id: 'queue',
      supported,
      ...(supported ? {} : { reason: 'queue disabled by service policy' })
    }
  ],
  protocolVersion: WIRE_PROTOCOL_VERSION,
  serverId: asWireId('server-test')
})

describe('AgentBox service capability projection', () => {
  it('keeps queue controls unavailable before hello or when the service refuses support', () => {
    expect(agentBoxCapabilitySupported(null, 'queue')).toBe(false)
    expect(agentBoxCapabilitySupported(hello(false), 'queue')).toBe(false)
  })

  it('enables a product capability only from an explicit supported claim', () => {
    expect(agentBoxCapabilitySupported(hello(true), 'queue')).toBe(true)
    expect(agentBoxCapabilitySupported(hello(true), 'steer')).toBe(false)
  })

  it('does not reactivate the renderer-local queue from hello alone', () => {
    expect(agentBoxQueueControlsAvailable(hello(true), undefined)).toBe(false)
    expect(agentBoxQueueControlsAvailable(hello(false), 'server')).toBe(false)
    expect(agentBoxQueueControlsAvailable(hello(true), 'server')).toBe(true)
  })
})
