import { describe, expect, it, vi } from 'vitest'

import { asWireId } from '@/types/wire/wire-v1'

import {
  wireCapability,
  WireProtocolError,
  type WireRemoteError,
  type WireTransport,
  WireUnavailableError,
  WireV1Client
} from './wire-v1-client'

function transport(result: unknown): WireTransport & { request: ReturnType<typeof vi.fn> } {
  return { request: vi.fn(async () => result) }
}

describe('WireV1Client', () => {
  it('validates and serializes a method through the injected host transport', async () => {
    const host = transport({
      jsonrpc: '2.0',
      id: 'envelope-1',
      result: { items: [], nextCursor: null }
    })

    const client = new WireV1Client({ createEnvelopeId: () => 'envelope-1', transport: host })

    await expect(client.call('workspaces.list', { includeArchived: false })).resolves.toEqual({
      items: [],
      nextCursor: null
    })
    expect(host.request).toHaveBeenCalledWith({
      body: {
        jsonrpc: '2.0',
        id: 'envelope-1',
        method: 'workspaces.list',
        params: { includeArchived: false }
      },
      method: 'workspaces.list',
      path: '/wire/v1/workspaces.list'
    })
    expect(JSON.stringify(host.request.mock.calls)).not.toContain('Authorization')
  })

  it('rejects invalid params before touching the transport', async () => {
    const host = transport({})
    const client = new WireV1Client({ transport: host })

    await expect(client.call('workspaces.list', { includeArchived: 'yes' } as never)).rejects.toBeInstanceOf(
      WireProtocolError
    )
    expect(host.request).not.toHaveBeenCalled()
  })

  it('classifies a transport failure as unavailable', async () => {
    const host = { request: vi.fn(async () => Promise.reject(new Error('ECONNREFUSED'))) }
    const client = new WireV1Client({ transport: host })

    await expect(client.call('workspaces.list', { includeArchived: false })).rejects.toMatchObject({
      code: 'UNAVAILABLE',
      name: 'WireUnavailableError'
    })
  })

  it('preserves typed remote errors including the server current record', async () => {
    const current = { id: 'workspace-1', version: 3 }

    const host = transport({
      jsonrpc: '2.0',
      id: 1,
      error: { code: 'CONFLICT_VERSION', message: 'stale', current }
    })

    const client = new WireV1Client({ transport: host })

    await expect(client.call('workspaces.list', { includeArchived: false })).rejects.toEqual(
      expect.objectContaining<Partial<WireRemoteError>>({ code: 'CONFLICT_VERSION', current })
    )
  })

  it('accepts a null response id only for a typed pre-dispatch error', async () => {
    const host = transport({
      jsonrpc: '2.0',
      id: null,
      error: { code: 'UNAUTHENTICATED', message: 'token required' }
    })

    const client = new WireV1Client({ transport: host })

    await expect(client.hello()).rejects.toMatchObject({ code: 'UNAUTHENTICATED' })
  })

  it('rejects mismatched ids and malformed typed results', async () => {
    const mismatched = new WireV1Client({
      createEnvelopeId: () => 'expected',
      transport: transport({ jsonrpc: '2.0', id: 'other', result: { items: [], nextCursor: null } })
    })

    await expect(mismatched.call('workspaces.list', { includeArchived: false })).rejects.toThrow('Mismatched')

    const malformed = new WireV1Client({
      transport: transport({ jsonrpc: '2.0', id: 1, result: { items: 'not-an-array', nextCursor: null } })
    })

    await expect(malformed.call('workspaces.list', { includeArchived: false })).rejects.toThrow(
      'Invalid workspaces.list result'
    )
  })

  it('fails closed when a capability was not declared', async () => {
    const host = transport({
      jsonrpc: '2.0',
      id: 1,
      result: {
        serverId: asWireId('server-1'),
        protocolVersion: 'wire/1',
        capabilities: [{ id: 'sessions.send', supported: false, reason: 'NO_EXECUTION' }],
        auth: { required: true, schemes: ['session_token'] }
      }
    })

    const hello = await new WireV1Client({ transport: host }).hello()

    expect(wireCapability(hello, 'sessions.send')).toMatchObject({ supported: false, reason: 'NO_EXECUTION' })
    expect(wireCapability(hello, 'runs.stop')).toEqual({
      id: 'runs.stop',
      reason: 'CAPABILITY_NOT_DECLARED',
      supported: false
    })
  })

  it('does not fall back to a renderer fetch transport', async () => {
    const client = new WireV1Client({ transport: undefined as never })

    await expect(client.call('workspaces.list', { includeArchived: false })).rejects.toBeInstanceOf(
      WireUnavailableError
    )
  })
})
