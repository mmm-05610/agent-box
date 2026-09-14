import { describe, expect, it } from 'vitest'

import {
  asWireId,
  type ServerHelloResult,
  type SessionRecord,
  WIRE_PROTOCOL_VERSION,
  type WorkspaceRecord
} from '@/types/wire/wire-v1'

import {
  $agentBoxSessions,
  $agentBoxWorkspaces,
  adoptAgentBoxSession,
  agentBoxCapabilitySupported,
  agentBoxQueueControlsAvailable,
  upsertAgentBoxSession,
  upsertAgentBoxWorkspace
} from './agentbox-service'

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

const sessionRecord = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Session',
  id: asWireId('session-1'),
  pinned: false,
  profileId: null,
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  workspaceId: asWireId('workspace-1'),
  ...overrides
})

describe('AgentBox Session cache (version-monotonic adoption)', () => {
  it('keeps the newer record when a stale answer arrives after it', () => {
    const newest = sessionRecord({ displayName: 'Newest', version: 7 })

    expect(adoptAgentBoxSession({ 'session-1': newest }, sessionRecord({ version: 6 }))).toEqual({
      'session-1': newest
    })
  })

  it('adopts the service value on the same or a higher version', () => {
    const normalized = sessionRecord({ displayName: 'Normalized', version: 7 })

    expect(adoptAgentBoxSession({}, normalized)).toEqual({ 'session-1': normalized })
    // An equal version is still the service's word: its normalized fields win.
    expect(adoptAgentBoxSession({ 'session-1': sessionRecord({ version: 7 }) }, normalized)).toEqual({
      'session-1': normalized
    })
  })

  it('keeps other ids intact while one id rolls back', () => {
    const newer = sessionRecord({ id: asWireId('session-2'), version: 9 })

    expect(
      adoptAgentBoxSession(
        {
          'session-1': sessionRecord({ version: 7 }),
          'session-2': newer
        },
        sessionRecord({ id: asWireId('session-2'), version: 8 })
      )
    ).toEqual({
      'session-1': sessionRecord({ version: 7 }),
      'session-2': newer
    })
  })

  it('upserts a fresh record into the store without erasing the rest', () => {
    $agentBoxSessions.set({ 'session-live': sessionRecord({ id: asWireId('session-live'), version: 5 }) })

    upsertAgentBoxSession(sessionRecord({ displayName: 'Renamed', version: 2 }))

    expect($agentBoxSessions.get()['session-1']?.displayName).toBe('Renamed')
    expect($agentBoxSessions.get()['session-live']?.version).toBe(5)
    $agentBoxSessions.set({})
  })
})

const workspaceRecord = (overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord => ({
  accessibility: { executableForRole: null, readable: true, reasons: [], writable: true },
  archivedAt: null,
  connection: { state: 'connected' },
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'App',
  environment: { host: null, kind: 'local', user: null },
  id: asWireId('workspace-1'),
  normalizedPath: 'C:/work/app',
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  ...overrides
})

describe('AgentBox Workspace projection', () => {
  it('keeps only what the service returned, replacing by id', () => {
    const original = workspaceRecord()
    const renamed = workspaceRecord({ displayName: 'Renamed', version: 2 })

    $agentBoxWorkspaces.set([original])

    upsertAgentBoxWorkspace(renamed)

    expect($agentBoxWorkspaces.get()).toEqual([renamed])
  })

  it('never merges a record by path or display name', () => {
    const samePathOtherId = workspaceRecord({ id: asWireId('workspace-2') })

    $agentBoxWorkspaces.set([samePathOtherId])

    upsertAgentBoxWorkspace(workspaceRecord({ id: asWireId('workspace-3'), displayName: 'App' }))

    expect($agentBoxWorkspaces.get().map(record => record.id)).toEqual(['workspace-2', 'workspace-3'])
  })

  it('drops an archived record from the live projection', () => {
    $agentBoxWorkspaces.set([workspaceRecord(), workspaceRecord({ id: asWireId('workspace-2') })])

    upsertAgentBoxWorkspace(workspaceRecord({ archivedAt: '2026-09-14T01:00:00.000Z' }))

    expect($agentBoxWorkspaces.get().map(record => record.id)).toEqual(['workspace-2'])
  })
})
