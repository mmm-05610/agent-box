import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxHello, $agentBoxService, $agentBoxSessions } from '@/store/agentbox-service'
import { asWireId, type ServerHelloResult, type SessionRecord, WIRE_PROTOCOL_VERSION } from '@/types/wire/wire-v1'

import {
  decideAgentBoxSessionPin,
  readAgentBoxSessionPinInput,
  toggleAgentBoxSessionPin,
  toggleRoutedAgentBoxSessionPin
} from './agentbox-session-commands'

vi.mock('@/api/agentbox-runtime-client', () => ({ agentBoxRuntimeClient: () => wireClient }))

const wireClient = { call: vi.fn() }

const record = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Current session',
  id: asWireId('session-live'),
  pinned: false,
  profileId: asWireId('profile-1'),
  updatedAt: '2026-09-14T09:00:00.000Z',
  version: 5,
  workspaceId: asWireId('workspace-1'),
  ...overrides
})

const base = (overrides: Partial<Parameters<typeof decideAgentBoxSessionPin>[0]> = {}) => ({
  capabilitySupported: true,
  pathname: '/session-live',
  serviceReady: true,
  sessions: { 'session-live': record() },
  ...overrides
})

describe('the current-session pin decision (route authority)', () => {
  it('sends a session route to the wire with the service record of the route id', () => {
    const pinned = record({ pinned: true, version: 6 })
    const decision = decideAgentBoxSessionPin(base({ sessions: { 'session-live': pinned } }))

    expect(decision).toEqual({ action: 'wire', record: pinned })
  })

  it('fails closed when the service is not ready, the capability is undeclared, or the record has not arrived', () => {
    expect(decideAgentBoxSessionPin(base({ serviceReady: false }))).toEqual({
      action: 'fail-closed',
      reason: 'SERVICE_NOT_READY'
    })
    expect(decideAgentBoxSessionPin(base({ capabilitySupported: false }))).toEqual({
      action: 'fail-closed',
      reason: 'CAPABILITY_NOT_DECLARED'
    })
    expect(decideAgentBoxSessionPin(base({ sessions: {} }))).toEqual({
      action: 'fail-closed',
      reason: 'SESSION_RECORD_NOT_ARRIVED'
    })
  })

  it('never substitutes a same-id legacy session for a missing service record', () => {
    // The decision reads ONLY the service cache it is handed: when the record
    // has not arrived, the command fails closed — it can never reach for a
    // same-id legacy row or the renderer-local pin store.
    const decision = decideAgentBoxSessionPin(base({ sessions: {} }))

    expect(decision.action).toBe('fail-closed')
    expect('record' in decision).toBe(false)
  })

  it('leaves non-session routes to the legacy selection, unchanged', () => {
    for (const pathname of ['/', '/settings', '/skills']) {
      expect(decideAgentBoxSessionPin(base({ pathname }))).toEqual({ action: 'legacy' })
    }
  })
})

describe('the shared CAS flip', () => {
  it('sends the exact CAS the sidebar would send — same seam, same shape', async () => {
    const call = vi.fn(async () => ({ session: record({ pinned: true, version: 6 }) }))
    const client = { call } as unknown as WireV1Client

    await toggleAgentBoxSessionPin(client, record())

    // The sidebar row and this command both call the same updateAgentBoxSession
    // seam, so the payload is one shape: exact version, inverted pin, fresh
    // requestId.
    expect(call).toHaveBeenCalledTimes(1)
    expect(call).toHaveBeenCalledWith('sessions.update', {
      expectedVersion: 5,
      pinned: true,
      requestId: expect.stringMatching(/^desktop-/),
      sessionId: 'session-live'
    })
  })

  it('reads the wiring input from hello and the service phase only', () => {
    const input = readAgentBoxSessionPinInput(
      { detail: null, phase: 'ready' },
      {
        auth: { required: false },
        capabilities: [{ id: 'sessions.update', supported: true }],
        protocolVersion: WIRE_PROTOCOL_VERSION,
        serverId: asWireId('server')
      },
      {},
      '/session-live'
    )

    expect(input.serviceReady).toBe(true)
    expect(input.capabilitySupported).toBe(true)
    expect(input.pathname).toBe('/session-live')
  })
})

describe('the routed command composition (what the wiring calls)', () => {
  const hello = (supported: boolean): ServerHelloResult => ({
    auth: { required: false },
    capabilities: supported ? [{ id: 'sessions.update', supported: true }] : [],
    protocolVersion: WIRE_PROTOCOL_VERSION,
    serverId: asWireId('server')
  })

  afterEach(() => {
    wireClient.call.mockReset()
    $agentBoxSessions.set({})
    $agentBoxHello.set(null)
    $agentBoxService.set({ detail: null, phase: 'idle' })
  })

  it('hands the caller the intent direction and the exact CAS through the shared seam', async () => {
    $agentBoxService.set({ detail: null, phase: 'ready' })
    $agentBoxHello.set(hello(true))
    $agentBoxSessions.set({ 'session-live': record() })
    wireClient.call.mockResolvedValue({ session: record({ pinned: true, version: 6 }) })

    const attempt = toggleRoutedAgentBoxSessionPin('/session-live')

    expect(attempt?.pinned).toBe(true)

    await attempt?.promise

    expect(wireClient.call).toHaveBeenCalledWith('sessions.update', {
      expectedVersion: 5,
      pinned: true,
      requestId: expect.stringMatching(/^desktop-/),
      sessionId: 'session-live'
    })
  })

  it('produces no attempt at all on non-session routes or when the service cannot prove the session', () => {
    $agentBoxService.set({ detail: null, phase: 'ready' })
    $agentBoxHello.set(hello(true))

    // A non-session route belongs to the legacy selection.
    expect(toggleRoutedAgentBoxSessionPin('/settings')).toBeNull()

    // A session route whose record has not arrived fails closed.
    $agentBoxSessions.set({})
    expect(toggleRoutedAgentBoxSessionPin('/session-live')).toBeNull()

    // A session route without the declared capability fails closed too.
    $agentBoxSessions.set({ 'session-live': record() })
    $agentBoxHello.set(hello(false))
    expect(toggleRoutedAgentBoxSessionPin('/session-live')).toBeNull()

    // …and neither path touched the wire.
    expect(wireClient.call).not.toHaveBeenCalled()
  })
})
