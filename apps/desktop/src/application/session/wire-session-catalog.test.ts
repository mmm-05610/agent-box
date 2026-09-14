import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxSessions } from '@/store/agentbox-service'
import { asRequestId, asWireId, type SessionRecord } from '@/types/wire/wire-v1'

import { archiveAgentBoxSession, refreshAgentBoxSessions, updateAgentBoxSession } from './wire-session-catalog'

const session = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Session',
  id: asWireId('session-1'),
  pinned: false,
  profileId: asWireId('profile-1'),
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  workspaceId: asWireId('workspace-1'),
  ...overrides
})

afterEach(() => $agentBoxSessions.set({}))

describe('AgentBox Session catalog', () => {
  it('merges a partial server page without clobbering other live projections', async () => {
    $agentBoxSessions.set({ 'session-live': session({ id: asWireId('session-live') }) })
    const call = vi.fn(async () => ({ items: [session()], nextCursor: null }))

    await refreshAgentBoxSessions({ call } as unknown as WireV1Client, {
      workspaceId: asWireId('workspace-1')
    })

    expect($agentBoxSessions.get()).toMatchObject({
      'session-1': { id: 'session-1' },
      'session-live': { id: 'session-live' }
    })
    expect(call).toHaveBeenCalledWith('sessions.list', {
      includeArchived: false,
      workspaceId: 'workspace-1'
    })
  })

  it('never lets a stale list page roll a newer record back', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Newer', version: 7 }) })

    const call = vi.fn(async () => ({ items: [session({ displayName: 'Stale', version: 6 })], nextCursor: null }))

    await refreshAgentBoxSessions({ call } as unknown as WireV1Client)

    expect($agentBoxSessions.get()['session-1']?.displayName).toBe('Newer')
    expect($agentBoxSessions.get()['session-1']?.version).toBe(7)
  })

  it('adopts the same or a newer version from a list page', async () => {
    $agentBoxSessions.set({ 'session-1': session({ displayName: 'Old', version: 1 }) })

    const call = vi.fn(async () => ({ items: [session({ displayName: 'Normalized', version: 1 })], nextCursor: null }))

    await refreshAgentBoxSessions({ call } as unknown as WireV1Client)

    expect($agentBoxSessions.get()['session-1']?.displayName).toBe('Normalized')
  })

  it('adopts only server-confirmed shared metadata and archive records', async () => {
    const responses = [
      { session: session({ displayName: 'Renamed', pinned: true, version: 2 }) },
      { session: session({ archivedAt: '2026-09-14T01:00:00.000Z', version: 3 }) }
    ]

    const call = vi.fn(async () => responses.shift()!)
    const client = { call } as unknown as WireV1Client
    const ids = ['request-update', 'request-archive'].map(asRequestId)
    const options = { createRequestId: () => ids.shift()! }

    await updateAgentBoxSession(
      client,
      { displayName: 'Renamed', expectedVersion: 1, pinned: true, sessionId: 'session-1' },
      options
    )
    await archiveAgentBoxSession(client, { expectedVersion: 2, sessionId: 'session-1' }, options)

    expect(call.mock.calls).toEqual([
      [
        'sessions.update',
        {
          displayName: 'Renamed',
          expectedVersion: 1,
          pinned: true,
          requestId: 'request-update',
          sessionId: 'session-1'
        }
      ],
      [
        'sessions.archive',
        { expectedVersion: 2, requestId: 'request-archive', sessionId: 'session-1' }
      ]
    ])
    expect($agentBoxSessions.get()['session-1']?.archivedAt).not.toBeNull()
  })
})
