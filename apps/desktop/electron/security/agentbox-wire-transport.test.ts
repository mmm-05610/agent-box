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

  // The same judgement the event stream makes, and it has to happen before
  // `fetch` is reached: a rejected endpoint must not produce an outbound
  // connection the host should never have made, and the rejection must not
  // carry the endpoint or the token into a message the renderer can read.
  it.each([
    ['a remote host', 'https://example.com:8443', 'not loopback'],
    ['a loopback-looking hostname', 'http://127.0.0.1.evil.test:48152', 'not loopback'],
    ['a non-loopback IPv6 address', 'http://[::2]:48152', 'not loopback'],
    ['a decimal-encoded remote address', 'http://134744072:48152', 'not loopback'],
    ['a 127-prefixed spelling that is not an address', 'http://127.0.0.999:48152', 'endpoint is invalid'],
    ['credentials in the endpoint', 'http://user:password@127.0.0.1:48152', 'endpoint is invalid'],
    ['a non-http scheme', 'file://127.0.0.1/48152', 'endpoint is invalid']
  ])('refuses %s before fetch, without leaking the endpoint or token', async (_label, endpoint, expected) => {
    const fetchImpl = vi.fn<typeof fetch>()

    const request = createAgentBoxWireHttpTransport({
      connection: () => ({ endpoint, sessionToken: 'host-only-token' }),
      fetchImpl
    })

    const failure = await request({ body: {}, path: '/wire/v1/server.hello' }).then(
      () => null,
      (error: Error) => error
    )

    expect(failure).toBeInstanceOf(AgentBoxWireHostUnavailableError)
    expect(failure?.message).toContain(expected)
    expect(failure?.message).not.toContain('host-only-token')
    expect(failure?.message).not.toContain(endpoint)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['localhost', '127.0.0.1', '127.255.254.253', '[::1]'])('accepts the loopback endpoint %s', async host => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} })))

    const request = createAgentBoxWireHttpTransport({
      connection: () => ({ endpoint: `http://${host}:48152`, sessionToken: 'token' }),
      fetchImpl
    })

    await expect(request({ body: {}, path: '/wire/v1/server.hello' })).resolves.toBeTruthy()
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it.each([
    'http://127.0.0.1:48152/api/status',
    'http://127.0.0.1:48152/wire/v2/server.hello',
    '//evil.test/wire/v1/server.hello'
  ])('keeps the /wire/v1/ HTTP target rule for %s', async target => {
    const fetchImpl = vi.fn<typeof fetch>()

    const request = createAgentBoxWireHttpTransport({
      connection: () => ({ endpoint: 'http://127.0.0.1:48152', sessionToken: 'token' }),
      fetchImpl
    })

    await expect(request({ body: {}, path: target })).rejects.toThrow('target is invalid')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
