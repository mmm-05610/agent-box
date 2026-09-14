import { describe, expect, it, vi } from 'vitest'

import {
  AgentBoxWireHostUnavailableError,
  createAgentBoxWireHttpTransport
} from './agentbox-wire-transport'

describe('AgentBox main-only wire transport', () => {
  it('is honestly unavailable without a lifecycle connection and never falls back', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const request = createAgentBoxWireHttpTransport({ connection: () => null, fetchImpl })

    await expect(request({ body: {}, path: '/wire/v1/server.hello' })).rejects.toBeInstanceOf(
      AgentBoxWireHostUnavailableError
    )
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('attaches the bearer only in main and returns the server envelope without leaking it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: 7, result: { items: [], nextCursor: null } }), {
        status: 200
      })
    )

    const request = createAgentBoxWireHttpTransport({
      connection: () => ({ endpoint: 'http://127.0.0.1:48152', sessionToken: 'host-only-token' }),
      fetchImpl
    })

    const body = { jsonrpc: '2.0', id: 7, method: 'workspaces.list', params: { includeArchived: false } }

    const result = await request({ body, path: '/wire/v1/workspaces.list' })

    const [url, init] = fetchImpl.mock.calls[0]!
    expect(String(url)).toBe('http://127.0.0.1:48152/wire/v1/workspaces.list')
    expect(init).toMatchObject({ method: 'POST', redirect: 'error' })
    expect(init?.headers).toMatchObject({ authorization: 'Bearer host-only-token' })
    expect(JSON.parse(String(init?.body))).toEqual(body)
    expect(JSON.stringify(result)).not.toContain('host-only-token')
  })

  it('passes typed HTTP error envelopes through and rejects unsafe endpoints', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: 'UNAUTHENTICATED', message: 'no' } }), {
        status: 401
      })
    )

    const request = createAgentBoxWireHttpTransport({
      connection: () => ({ endpoint: 'http://127.0.0.1:48152', sessionToken: 'token' }),
      fetchImpl
    })

    await expect(request({ body: {}, path: '/wire/v1/server.hello' })).resolves.toMatchObject({
      error: { code: 'UNAUTHENTICATED' }
    })

    const unsafe = createAgentBoxWireHttpTransport({
      connection: () => ({ endpoint: 'http://user:password@127.0.0.1:48152', sessionToken: 'token' }),
      fetchImpl
    })

    await expect(unsafe({ body: {}, path: '/wire/v1/server.hello' })).rejects.toThrow('endpoint is invalid')
  })
})
