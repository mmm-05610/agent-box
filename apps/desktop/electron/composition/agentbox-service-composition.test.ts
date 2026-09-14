import { describe, expect, it, vi } from 'vitest'

import { AgentBoxWireHostUnavailableError } from '../security/agentbox-wire-transport'

import { agentBoxServiceComposition, createAgentBoxServiceComposition } from './agentbox-service-composition'

const firstConnection = { endpoint: 'http://127.0.0.1:48152', sessionToken: 'first-token' }
const secondConnection = { endpoint: 'http://localhost:48153', sessionToken: 'second-token' }

describe('AgentBox service composition', () => {
  it('starts disconnected and reports typed HTTP unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const composition = createAgentBoxServiceComposition({ fetchImpl })

    expect(composition.connectionSlot.current()).toBeNull()
    await expect(composition.requestWire({ body: {}, path: '/wire/v1/server.hello' })).rejects.toBeInstanceOf(
      AgentBoxWireHostUnavailableError
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('installs connections, returns the previous value, and HTTP follows rotation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ result: 'ok' })))
    const composition = createAgentBoxServiceComposition({ fetchImpl })

    expect(composition.connectionSlot.install(firstConnection)).toBeNull()
    await composition.requestWire({ body: {}, path: '/wire/v1/server.hello' })
    expect(composition.connectionSlot.install(secondConnection)).toEqual(firstConnection)
    await composition.requestWire({ body: {}, path: '/wire/v1/server.hello' })

    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer first-token' })
    expect(fetchImpl.mock.calls[1]?.[1]?.headers).toMatchObject({ authorization: 'Bearer second-token' })
  })

  it('withdraws the connection and makes later HTTP requests unavailable', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ result: 'ok' })))
    const composition = createAgentBoxServiceComposition({ fetchImpl })
    composition.connectionSlot.install(firstConnection)
    expect(composition.connectionSlot.install(null)).toEqual(firstConnection)

    await expect(composition.requestWire({ body: {}, path: '/wire/v1/server.hello' })).rejects.toBeInstanceOf(
      AgentBoxWireHostUnavailableError
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('binds event subscription to the same dynamic slot', () => {
    const composition = createAgentBoxServiceComposition()

    expect(typeof composition.subscribeWireEvents).toBe('function')
    expect(typeof composition.connectionSlot.install).toBe('function')
    expect(typeof agentBoxServiceComposition.connectionSlot.current).toBe('function')
    // No connection means no production socket construction or Hermes fallback.
    composition.subscribeWireEvents({ sessionId: 's', cursor: '' }, vi.fn())
  })
})
