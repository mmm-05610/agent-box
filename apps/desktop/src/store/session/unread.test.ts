import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { SessionInfo } from '@/types/hermes'

import { $sessions } from './atoms'
import {
  $unreadWriteGuard,
  guardUnreadWrite,
  releaseUnreadWrite,
  sessionRowById,
  setStoredSessionUnread,
  UNREAD_WRITE_GUARD_MS,
  watchUnreadWriteGuard
} from './unread'

const row = (id: string, extra: Partial<SessionInfo> = {}): SessionInfo =>
  ({ id, message_count: 1, source: 'cli', started_at: 0, title: id, ...extra }) as SessionInfo

beforeEach(() => {
  $sessions.set([])
  $unreadWriteGuard.set(new Map())
})

afterEach(() => {
  $sessions.set([])
  $unreadWriteGuard.set(new Map())
})

describe('the unread write guard', () => {
  it('arms one row without disturbing the others', () => {
    guardUnreadWrite('a', true)
    guardUnreadWrite('b', false)

    expect($unreadWriteGuard.get().get('a')?.value).toBe(true)
    expect($unreadWriteGuard.get().get('b')?.value).toBe(false)
    expect($unreadWriteGuard.get().get('a')?.at).toBeTypeOf('number')
  })

  it('releases only the row named', () => {
    guardUnreadWrite('a', true)
    guardUnreadWrite('b', true)

    releaseUnreadWrite('a')

    expect($unreadWriteGuard.get().has('a')).toBe(false)
    expect($unreadWriteGuard.get().has('b')).toBe(true)
  })

  it('tolerates releasing a row that was never guarded', () => {
    guardUnreadWrite('a', true)
    const before = $unreadWriteGuard.get()

    releaseUnreadWrite('ghost')

    // Nothing to do, and no needless atom write that would wake subscribers.
    expect($unreadWriteGuard.get()).toBe(before)
  })
})

describe('setStoredSessionUnread', () => {
  it('paints exactly the named row', () => {
    $sessions.set([row('a', { unread: false }), row('b', { unread: false })])

    setStoredSessionUnread('a', true)

    expect($sessions.get().map(s => s.unread)).toEqual([true, false])
  })

  it('leaves the list alone for a runtime-only session', () => {
    $sessions.set([row('a', { unread: false })])
    const before = $sessions.get()

    setStoredSessionUnread('ghost', true)

    expect($sessions.get().map(s => s.id)).toEqual(['a'])
    expect(before[0].unread).toBe(false)
  })
})

describe('sessionRowById', () => {
  it('finds the loaded row, and reports a runtime-only session as absent', () => {
    $sessions.set([row('a')])

    expect(sessionRowById('a')?.id).toBe('a')
    expect(sessionRowById('ghost')).toBeUndefined()
  })
})

describe('watchUnreadWriteGuard', () => {
  it('drops a guard entry once a list page confirms the value we wrote', () => {
    watchUnreadWriteGuard()
    guardUnreadWrite('a', true)

    // The server caught up and echoes our value back.
    $sessions.set([row('a', { unread: true })])

    expect($unreadWriteGuard.get().has('a')).toBe(false)
  })

  it('keeps the guard while a page contradicts a write still in flight', () => {
    watchUnreadWriteGuard()
    guardUnreadWrite('a', true)

    // A list request issued before the PATCH still says read. Honouring it
    // would silently undo the mark the user just made.
    $sessions.set([row('a', { unread: false })])

    expect($unreadWriteGuard.get().has('a')).toBe(true)
  })

  it('releases a row whose guard has expired only when the page agrees', () => {
    watchUnreadWriteGuard()
    const expired = new Map([['a', { at: Date.now() - UNREAD_WRITE_GUARD_MS - 1, value: true }]])

    $unreadWriteGuard.set(expired)
    // The value still disagrees: expiry is the READ side's business
    // (session-dot-state.ts stops honouring the entry), not this writer's —
    // the entry stays until a page actually confirms the value.
    $sessions.set([row('a', { unread: false })])

    expect($unreadWriteGuard.get().has('a')).toBe(true)
  })
})
