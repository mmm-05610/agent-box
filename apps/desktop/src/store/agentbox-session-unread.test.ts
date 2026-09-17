import { describe, expect, it } from 'vitest'

import { asWireId } from '@/types/wire/wire-v1'

import {
  $agentBoxSessionSeenAt,
  agentBoxSessionUnread,
  markAgentBoxSessionSeen
} from '@/store/agentbox-session-unread'

describe('local session read cursor', () => {
  it('remembers the revision that was opened', () => {
    $agentBoxSessionSeenAt.set({})

    markAgentBoxSessionSeen('session-1', '2026-09-14T05:00:00.000Z')

    expect($agentBoxSessionSeenAt.get()).toEqual({ 'session-1': '2026-09-14T05:00:00.000Z' })
  })

  it('preserves the identity of the map when the mark does not move', () => {
    $agentBoxSessionSeenAt.set({ 'session-1': 'v1' })
    const before = $agentBoxSessionSeenAt.get()

    markAgentBoxSessionSeen('session-1', 'v1')

    expect($agentBoxSessionSeenAt.get()).toBe(before)
  })

  it('is unread only past the mark: never-seen is not unread, moved is', () => {
    expect(agentBoxSessionUnread({ id: asWireId('a'), updatedAt: 'v1' }, {})).toBe(false)
    expect(agentBoxSessionUnread({ id: asWireId('a'), updatedAt: 'v1' }, { a: 'v1' })).toBe(false)
    expect(agentBoxSessionUnread({ id: asWireId('a'), updatedAt: 'v2' }, { a: 'v1' })).toBe(true)
    expect(agentBoxSessionUnread({ id: asWireId('b'), updatedAt: 'v1' }, { a: 'v0' })).toBe(false)
  })
})
