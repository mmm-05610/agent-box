import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SessionInfo } from '@/types/hermes'

const patch = vi.fn<(id: string, unread: boolean, profile?: null | string) => Promise<{ ok: boolean }>>(() =>
  Promise.resolve({ ok: true })
)

vi.mock('@/api/sessions', () => ({
  // The use case only needs the REST mutation; keep the mock minimal.
  setSessionUnreadRemote: (id: string, unread: boolean, profile?: null | string) => patch(id, unread, profile)
}))

import { $selectedStoredSessionId, $sessions, $unreadFinishedSessionIds } from '@/store/session'
import { $unreadWriteGuard } from '@/store/session/unread'

import { markSessionUnread, markStoredSessionViewed, selectStoredSessionForViewing } from './session-read-state'

const row = (id: string, extra: Partial<SessionInfo> = {}): SessionInfo =>
  ({ id, message_count: 1, source: 'cli', started_at: 0, title: id, ...extra }) as SessionInfo

/** Let the fire-and-forget PATCH settle (success path, rollback path). */
const settle = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  $sessions.set([])
  $selectedStoredSessionId.set(null)
  $unreadFinishedSessionIds.set([])
  $unreadWriteGuard.set(new Map())
  patch.mockClear()
})

afterEach(() => {
  $sessions.set([])
  $selectedStoredSessionId.set(null)
  $unreadFinishedSessionIds.set([])
  $unreadWriteGuard.set(new Map())
})

describe('markSessionUnread', () => {
  it('optimistically paints the row, then PATCHes with the owning profile', async () => {
    $sessions.set([row('a', { profile: 'work', unread: false })])

    await markSessionUnread('a', true)

    expect(patch).toHaveBeenCalledWith('a', true, 'work')
    expect($sessions.get().find(s => s.id === 'a')?.unread).toBe(true)
  })

  it('no-ops for a runtime-only session with no persisted row', async () => {
    await markSessionUnread('ghost', true)

    expect(patch).not.toHaveBeenCalled()
  })

  it('holds the write guard while the PATCH is in flight', async () => {
    $sessions.set([row('a', { unread: false })])

    const inFlight = markSessionUnread('a', true)

    expect($unreadWriteGuard.get().get('a')?.value).toBe(true)

    await inFlight
  })

  it('rolls back the row, releases the guard and rethrows when the PATCH fails', async () => {
    $sessions.set([row('a', { unread: false })])
    patch.mockImplementationOnce(() => Promise.reject(new Error('offline')))

    await expect(markSessionUnread('a', true)).rejects.toThrow('offline')

    // The backend kept the old value, so the optimistic flip is undone and
    // the guard is released (nothing to fence a page about).
    expect($sessions.get().find(s => s.id === 'a')?.unread).toBe(false)
    expect($unreadWriteGuard.get().has('a')).toBe(false)
  })
})

describe('markStoredSessionViewed', () => {
  it('retires the local finished-unread dot and PATCHes read, using the row profile', async () => {
    $sessions.set([row('a', { profile: 'p2', unread: true })])
    $unreadFinishedSessionIds.set(['a'])

    markStoredSessionViewed('a')

    expect($unreadFinishedSessionIds.get()).toEqual([])
    // The optimistic flip is synchronous; the PATCH is fire-and-forget.
    expect($sessions.get().find(s => s.id === 'a')?.unread).toBe(false)

    await settle()
    expect(patch).toHaveBeenCalledWith('a', false, 'p2')
  })

  it('does not PATCH a session that is already read', async () => {
    $sessions.set([row('a', { unread: false })])

    markStoredSessionViewed('a')

    await settle()
    expect(patch).not.toHaveBeenCalled()
  })

  it('swallows a failed PATCH and lets the row roll back (a refresh heals the dot)', async () => {
    $sessions.set([row('a', { unread: true })])
    patch.mockImplementationOnce(() => Promise.reject(new Error('offline')))

    expect(() => markStoredSessionViewed('a')).not.toThrow()

    await settle()
    expect(patch).toHaveBeenCalledTimes(1)
    // The backend kept "unread", so the optimistic clear is undone rather than
    // leaving a row that disagrees with the server.
    expect($sessions.get().find(s => s.id === 'a')?.unread).toBe(true)
  })
})

describe('selectStoredSessionForViewing', () => {
  it('selects the session and clears its persisted unread row', async () => {
    $sessions.set([row('s1', { unread: true })])

    selectStoredSessionForViewing('s1')

    expect($selectedStoredSessionId.get()).toBe('s1')
    expect($sessions.get().find(s => s.id === 's1')?.unread).toBe(false)

    await settle()
    expect(patch).toHaveBeenCalledWith('s1', false, undefined)
  })

  it('does not PATCH a read row when it is opened', async () => {
    $sessions.set([row('s1', { unread: false })])

    selectStoredSessionForViewing('s1')

    await settle()
    expect(patch).not.toHaveBeenCalled()
  })
})
