import { describe, expect, it } from 'vitest'

import { asWireId, type ServerHelloResult, WIRE_PROTOCOL_VERSION, type WorkspaceRecord } from '@/types/wire/wire-v1'

import {
  $agentBoxWorkspaces,
  agentBoxCapabilitySupported,
  agentBoxQueueControlsAvailable,
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
