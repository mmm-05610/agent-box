import { describe, expect, it } from 'vitest'

import type { WireSessionProjection } from '@/application/session/wire-session-projection'
import { asWireId, type SessionRecord } from '@/types/wire/wire-v1'

import { agentBoxSessionStatus } from './agentbox-session-status'

const session = (overrides: Partial<SessionRecord> = {}): Pick<SessionRecord, 'archivedAt' | 'id' | 'updatedAt'> => ({
  archivedAt: null,
  id: asWireId('session-1'),
  updatedAt: '2026-09-14T05:00:00.000Z',
  ...overrides
})

const withExecution = (state: NonNullable<WireSessionProjection['execution']>['state']): WireSessionProjection => ({
  ...({} as WireSessionProjection),
  execution: { executionId: 'exec-1', reason: null, state }
})

describe('agentBoxSessionStatus running', () => {
  it('is running exactly for the states the service has not finished', () => {
    for (const state of ['queued', 'dispatched', 'running', 'stopping', 'unknown'] as const) {
      expect(agentBoxSessionStatus({ projection: withExecution(state), seenAt: undefined, session: session() }).running).toBe(true)
    }

    for (const state of ['completed', 'failed', 'stopped'] as const) {
      expect(agentBoxSessionStatus({ projection: withExecution(state), seenAt: undefined, session: session() }).running).toBe(false)
    }
  })

  it('shows nothing without a projection, and never a running archived row', () => {
    expect(agentBoxSessionStatus({ projection: undefined, seenAt: undefined, session: session() }).running).toBe(false)
    expect(
      agentBoxSessionStatus({
        projection: withExecution('running'),
        seenAt: undefined,
        session: session({ archivedAt: '2026-09-15T00:00:00.000Z' })
      }).running
    ).toBe(false)
  })
})

describe('agentBoxSessionStatus unread (local cursor)', () => {
  it('is unread only for a record this window opened before it changed', () => {
    expect(agentBoxSessionStatus({ projection: undefined, seenAt: undefined, session: session() }).unread).toBe(false)

    expect(
      agentBoxSessionStatus({ projection: undefined, seenAt: session().updatedAt, session: session() }).unread
    ).toBe(false)

    expect(
      agentBoxSessionStatus({ projection: undefined, seenAt: '2026-09-14T04:00:00.000Z', session: session() }).unread
    ).toBe(true)
  })

  it('never marks an archived row unread', () => {
    expect(
      agentBoxSessionStatus({
        projection: undefined,
        seenAt: '2026-09-14T04:00:00.000Z',
        session: session({ archivedAt: '2026-09-15T00:00:00.000Z' })
      }).unread
    ).toBe(false)
  })
})
