import { describe, expect, it } from 'vitest'

import { isLoopbackHost, resolveAgentBoxWireEndpoint } from './agentbox-wire-endpoint-policy'

// The endpoint decision is shared by the HTTP dispatcher and the event stream.
// It is tested once, here, because the two transports disagreeing about which
// host is reachable is the failure this module exists to make impossible.
describe('AgentBox wire endpoint policy', () => {
  it.each(['localhost', '::1', '[::1]', '127.0.0.1', '127.0.0.2', '127.255.254.253'])('accepts %s', hostname => {
    expect(isLoopbackHost(hostname)).toBe(true)
  })

  it.each([
    'example.com',
    '127.0.0.1.evil.test',
    'localhost.evil.test',
    '127.0.0.999',
    '0.0.0.0',
    '::2',
    '[::2]',
    '::ffff:127.0.0.1',
    ''
  ])('refuses %s', hostname => {
    expect(isLoopbackHost(hostname)).toBe(false)
  })

  it('keeps the origin and drops credentials, path and query', () => {
    expect(resolveAgentBoxWireEndpoint('https://localhost:48152/ignored?x=1')).toEqual({
      endpoint: { origin: 'https://localhost:48152', protocol: 'https:' },
      reason: null
    })
  })

  it.each([
    ['a remote host', 'http://example.com:48152', 'non_loopback'],
    ['a loopback-looking hostname', 'http://127.0.0.1.evil.test:48152', 'non_loopback'],
    ['a decimal-encoded remote address', 'http://134744072:48152', 'non_loopback'],
    ['credentials', 'http://user:pass@127.0.0.1:48152', 'invalid'],
    ['a ws scheme', 'ws://127.0.0.1:48152', 'invalid'],
    ['a file scheme', 'file://127.0.0.1/48152', 'invalid'],
    ['a bare word', 'not a url', 'invalid'],
    ['an empty endpoint', '', 'invalid']
  ])('rejects %s with a stable reason', (_label, endpoint, reason) => {
    expect(resolveAgentBoxWireEndpoint(endpoint)).toEqual({ endpoint: null, reason })
  })

  it('never echoes the endpoint back in a rejection', () => {
    const decision = resolveAgentBoxWireEndpoint('http://user:secret-password@127.0.0.1:48152')

    expect(JSON.stringify(decision)).not.toContain('secret-password')
    expect(JSON.stringify(decision)).not.toContain('127.0.0.1')
  })
})
