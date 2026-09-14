import { describe, expect, it } from 'vitest'

import { asWireId, type SessionRecord } from '@/types/wire/wire-v1'

import { projectAgentBoxSessionsForWorkspace } from './agentbox-session-projection'

const session = ({ id, ...overrides }: { id: string } & Omit<Partial<SessionRecord>, 'id'>): SessionRecord => ({
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: `Session ${id}`,
  id: asWireId(id),
  pinned: false,
  profileId: null,
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  workspaceId: asWireId('workspace-1'),
  ...overrides
})

const byId = (records: SessionRecord[]) => records.map(record => record.id)

describe('AgentBox Session projection (pure)', () => {
  it('keeps only the sessions of the requested workspace', () => {
    const projected = projectAgentBoxSessionsForWorkspace(
      {
        'session-mine': session({ id: 'session-mine' }),
        'session-elsewhere': session({ id: 'session-elsewhere', workspaceId: asWireId('workspace-2') })
      },
      'workspace-1'
    )

    expect(byId(projected)).toEqual(['session-mine'])
  })

  it('excludes archived sessions from the live projection', () => {
    const projected = projectAgentBoxSessionsForWorkspace(
      {
        'session-live': session({ id: 'session-live' }),
        'session-archived': session({ archivedAt: '2026-09-14T01:00:00.000Z', id: 'session-archived' })
      },
      'workspace-1'
    )

    expect(byId(projected)).toEqual(['session-live'])
  })

  it('ranks pinned sessions ahead of unpinned ones', () => {
    const projected = projectAgentBoxSessionsForWorkspace(
      {
        'session-new': session({ id: 'session-new', updatedAt: '2026-09-14T05:00:00.000Z' }),
        'session-pinned': session({ id: 'session-pinned', pinned: true, updatedAt: '2026-09-13T00:00:00.000Z' })
      },
      'workspace-1'
    )

    expect(byId(projected)).toEqual(['session-pinned', 'session-new'])
  })

  it('orders each group by updatedAt descending', () => {
    const projected = projectAgentBoxSessionsForWorkspace(
      {
        'session-old': session({ id: 'session-old', pinned: true, updatedAt: '2026-09-12T00:00:00.000Z' }),
        'session-new': session({ id: 'session-new', pinned: true, updatedAt: '2026-09-14T05:00:00.000Z' }),
        'session-recent': session({ id: 'session-recent', updatedAt: '2026-09-14T09:00:00.000Z' }),
        'session-stale': session({ id: 'session-stale', updatedAt: '2026-09-13T00:00:00.000Z' })
      },
      'workspace-1'
    )

    expect(byId(projected)).toEqual(['session-new', 'session-old', 'session-recent', 'session-stale'])
  })

  it('breaks updatedAt ties by id, deterministically in both groups', () => {
    const stamp = '2026-09-14T05:00:00.000Z'

    const projected = projectAgentBoxSessionsForWorkspace(
      {
        'session-b': session({ id: 'session-b', pinned: true, updatedAt: stamp }),
        'session-a': session({ id: 'session-a', pinned: true, updatedAt: stamp }),
        'session-d': session({ id: 'session-d', updatedAt: stamp }),
        'session-c': session({ id: 'session-c', updatedAt: stamp })
      },
      'workspace-1'
    )

    // Same instant: the id tie-break holds regardless of cache insertion order.
    expect(byId(projected)).toEqual(['session-a', 'session-b', 'session-c', 'session-d'])
  })

  it('projects an empty list for a workspace the cache knows nothing about', () => {
    expect(projectAgentBoxSessionsForWorkspace({}, 'workspace-1')).toEqual([])
  })
})
