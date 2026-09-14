import { describe, expect, it } from 'vitest'

import { asWireId, type SessionRecord } from '@/types/wire/wire-v1'

import { projectAgentBoxPaletteSessions } from './palette-helpers'

const record = (overrides: { id: string } & Omit<Partial<SessionRecord>, 'id'>): SessionRecord => {
  const { id, ...rest } = overrides

  return {
    archivedAt: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    displayName: `Session ${id}`,
    id: asWireId(id),
    pinned: false,
    profileId: null,
    updatedAt: '2026-09-01T00:00:00.000Z',
    version: 1,
    workspaceId: asWireId('workspace-1'),
    ...rest
  }
}

describe('projectAgentBoxPaletteSessions', () => {
  it('puts every pinned record ahead of every unpinned one', () => {
    const projected = projectAgentBoxPaletteSessions({
      'a-recent': record({ id: 'a-recent', updatedAt: '2026-09-14T09:00:00.000Z' }),
      'b-pinned-old': record({ id: 'b-pinned-old', pinned: true, updatedAt: '2026-09-02T09:00:00.000Z' }),
      'c-recent': record({ id: 'c-recent', updatedAt: '2026-09-13T09:00:00.000Z' }),
      'd-pinned-new': record({ id: 'd-pinned-new', pinned: true, updatedAt: '2026-09-03T09:00:00.000Z' })
    })

    const lastPinned = projected.findLastIndex(session => session.pinned)
    const firstUnpinned = projected.findIndex(session => !session.pinned)

    expect(lastPinned).toBeGreaterThanOrEqual(0)
    expect(firstUnpinned).toBeGreaterThan(lastPinned)
  })

  it('orders each pin bucket by updatedAt descending', () => {
    const projected = projectAgentBoxPaletteSessions({
      'a-oldest': record({ id: 'a-oldest', updatedAt: '2026-09-01T00:00:00.000Z' }),
      'b-newest': record({ id: 'b-newest', updatedAt: '2026-09-14T00:00:00.000Z' }),
      'c-middle': record({ id: 'c-middle', updatedAt: '2026-09-07T00:00:00.000Z' }),
      'd-pinned-old': record({ id: 'd-pinned-old', pinned: true, updatedAt: '2026-08-31T00:00:00.000Z' }),
      'e-pinned-new': record({ id: 'e-pinned-new', pinned: true, updatedAt: '2026-09-10T00:00:00.000Z' })
    })

    const stamps = (rows: SessionRecord[]) => rows.map(session => session.updatedAt)
    const descending = (values: string[]) => [...values].sort((a, b) => b.localeCompare(a))

    const pinned = projected.filter(session => session.pinned)
    const recent = projected.filter(session => !session.pinned)

    expect(stamps(pinned)).toEqual(descending(stamps(pinned)))
    expect(stamps(recent)).toEqual(descending(stamps(recent)))
    expect(stamps(pinned).at(0)).toBe('2026-09-10T00:00:00.000Z')
    expect(stamps(recent).at(0)).toBe('2026-09-14T00:00:00.000Z')
  })

  it('breaks equal updatedAt stamps by session id, independent of cache insertion order', () => {
    const sameStamp = '2026-09-14T12:00:00.000Z'
    const zeta = record({ id: 'zeta', updatedAt: sameStamp })
    const alpha = record({ id: 'alpha', updatedAt: sameStamp })

    const forward = projectAgentBoxPaletteSessions({ zeta, alpha })
    const reverse = projectAgentBoxPaletteSessions({ alpha, zeta })

    expect(forward.map(session => session.id)).toEqual(['alpha', 'zeta'])
    expect(reverse.map(session => session.id)).toEqual(['alpha', 'zeta'])
  })

  it('drops archived records and keeps the rest of the record untouched', () => {
    const live = record({ displayName: 'Live session', id: 'live' })
    const archived = record({ archivedAt: '2026-09-14T06:00:00.000Z', id: 'archived' })

    const projected = projectAgentBoxPaletteSessions({ archived, live })

    expect(projected.map(session => session.id)).toEqual(['live'])
    // The projection is a view: the row is the service record itself, so no
    // preview/branch/title field can be invented on the way to the palette.
    expect(projected[0]).toBe(live)
  })

  it('is not workspace-scoped: every non-archived record can be a palette row', () => {
    const projected = projectAgentBoxPaletteSessions({
      'a-here': record({ id: 'a-here', workspaceId: asWireId('workspace-1') }),
      'b-elsewhere': record({ id: 'b-elsewhere', workspaceId: asWireId('workspace-2') })
    })

    expect(projected.map(session => session.id).sort()).toEqual(['a-here', 'b-elsewhere'])
  })
})
