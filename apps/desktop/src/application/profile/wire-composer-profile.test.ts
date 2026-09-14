import { afterEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxProfiles, $agentBoxSessions, $draftConfigStates } from '@/store/agentbox-service'
import { clearSessionDraft, sessionDraftExecutionContext } from '@/store/composer'
import { $workspaceProfilePreferences } from '@/store/workspace-profile-preference'
import { asWireId, type ConfigDescribeResult, type SessionRecord } from '@/types/wire/wire-v1'

import { selectComposerProfile } from './wire-composer-profile'

const session = (profileId: string, version = 4): SessionRecord => ({
  archivedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Session',
  id: asWireId('session-a'),
  pinned: false,
  profileId: asWireId(profileId),
  updatedAt: '2026-09-14T00:00:00.000Z',
  version,
  workspaceId: asWireId('workspace-a')
})

function deferred<T>() {
  let resolve!: (value: T) => void

  const promise = new Promise<T>(done => {
    resolve = done
  })

  return { promise, resolve }
}

afterEach(() => {
  clearSessionDraft('workspace:workspace-a')
  clearSessionDraft('session-a')
  $agentBoxProfiles.set([])
  $agentBoxSessions.set({})
  $draftConfigStates.set({})
  $workspaceProfilePreferences.set({})
  window.localStorage.clear()
})

describe('selectComposerProfile', () => {
  it('pins a new draft and only reads config; it never creates a Session or starts a harness', async () => {
    const call = vi.fn(async (_method: string) => ({
      descriptor: {
        controls: [],
        effectTiming: 'next_send',
        profileId: asWireId('profile-a'),
        securityLockedIds: [],
        workspaceId: asWireId('workspace-a')
      }
    }))

    const client = { call } as unknown as WireV1Client

    await expect(
      selectComposerProfile(client, {
        currentSession: null,
        profileId: 'profile-a',
        scope: 'workspace:workspace-a',
        workspaceId: 'workspace-a'
      })
    ).resolves.toBe(true)

    expect(call.mock.calls.map(([method]) => method)).toEqual(['config.describe'])
    expect(call).not.toHaveBeenCalledWith('sessions.createAndSend', expect.anything())
    expect(sessionDraftExecutionContext('workspace:workspace-a')).toEqual({ overrides: [], profileId: 'profile-a' })
    expect($workspaceProfilePreferences.get()['workspace-a']).toBe('profile-a')
  })

  it('discards a late config description after the draft selected another profile', async () => {
    const descriptionA = deferred<ConfigDescribeResult>()
    const descriptionB = deferred<ConfigDescribeResult>()
    let invocation = 0
    const call = vi.fn((_method: string) => (invocation++ === 0 ? descriptionA.promise : descriptionB.promise))
    const client = { call } as unknown as WireV1Client
    const common = { currentSession: null, scope: 'workspace:workspace-a', workspaceId: 'workspace-a' }

    const selectionA = selectComposerProfile(client, { ...common, profileId: 'profile-a' })
    const selectionB = selectComposerProfile(client, { ...common, profileId: 'profile-b' })

    descriptionA.resolve({
      descriptor: {
        controls: [],
        effectTiming: 'next_send',
        profileId: asWireId('profile-a'),
        securityLockedIds: [],
        workspaceId: asWireId('workspace-a')
      }
    })
    await selectionA
    expect($draftConfigStates.get()['workspace:workspace-a']?.profileId).toBe('profile-b')

    descriptionB.resolve({
      descriptor: {
        controls: [],
        effectTiming: 'next_send',
        profileId: asWireId('profile-b'),
        securityLockedIds: [],
        workspaceId: asWireId('workspace-a')
      }
    })
    await selectionB
    expect($draftConfigStates.get()['workspace:workspace-a']).toMatchObject({ profileId: 'profile-b', status: 'ready' })
  })

  it('keeps the authoritative old profile when an existing Session switch is rejected', async () => {
    const oldSession = session('profile-a')

    const call = vi.fn(async (_method: string) => ({
      outcome: 'rejected',
      reason: 'different harness',
      session: oldSession
    }))

    const client = { call } as unknown as WireV1Client

    await expect(
      selectComposerProfile(client, {
        currentSession: oldSession,
        profileId: 'profile-b',
        scope: 'session-a',
        workspaceId: 'workspace-a'
      })
    ).resolves.toBe(false)

    expect(call.mock.calls.map(([method]) => method)).toEqual(['sessions.switchProfile'])
    expect($agentBoxSessions.get()['session-a']?.profileId).toBe('profile-a')
    expect(sessionDraftExecutionContext('session-a')).toEqual({ overrides: [], profileId: null })
    expect($workspaceProfilePreferences.get()['workspace-a']).toBeUndefined()
  })

  it('updates the profile only after confirmation, then reloads its described controls', async () => {
    const oldSession = session('profile-a')
    const confirmedSession = session('profile-b', 5)

    const call = vi.fn(async (method: string) =>
      method === 'sessions.switchProfile'
        ? { outcome: 'confirmed', session: confirmedSession }
        : {
            descriptor: {
              controls: [],
              effectTiming: 'next_send',
              profileId: asWireId('profile-b'),
              securityLockedIds: [],
              workspaceId: asWireId('workspace-a')
            }
          }
    )

    const client = { call } as unknown as WireV1Client

    await expect(
      selectComposerProfile(client, {
        currentSession: oldSession,
        profileId: 'profile-b',
        scope: 'session-a',
        workspaceId: 'workspace-a'
      })
    ).resolves.toBe(true)

    expect(call.mock.calls.map(([method]) => method)).toEqual(['sessions.switchProfile', 'config.describe'])
    expect($agentBoxSessions.get()['session-a']?.profileId).toBe('profile-b')
    expect(sessionDraftExecutionContext('session-a')).toEqual({ overrides: [], profileId: 'profile-b' })
    expect($workspaceProfilePreferences.get()['workspace-a']).toBe('profile-b')
  })
})
