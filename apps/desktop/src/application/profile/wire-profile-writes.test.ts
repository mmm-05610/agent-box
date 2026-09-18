import { describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { asRequestId, asWireId, type ProfileRecord } from '@/types/wire/wire-v1'

import { cloneAgentBoxProfile, setAgentBoxProfilePermissions } from './wire-profile-writes'

const profile = (overrides: Partial<ProfileRecord> = {}): ProfileRecord => ({
  archivedAt: null,
  capabilities: {},
  createdAt: '2026-09-18T00:00:00.000Z',
  displayName: 'Builder',
  harness: 'opaque-alpha',
  id: asWireId('profile_1'),
  updatedAt: '2026-09-18T00:00:00.000Z',
  version: 3,
  ...overrides
})

describe('cloneAgentBoxProfile', () => {
  it('calls profiles.clone with the intent and reports the migration report back', async () => {
    const result = {
      migration: {
        items: [{ item: 'native-sessions', migrated: false, reason: 'a clone starts with none' }],
        migratedCount: 0,
        permissions: null,
        reboundAssets: [],
        refusedCount: 1,
        sameFamily: true,
        sourceFamily: 'opaque-alpha',
        targetFamily: 'opaque-alpha'
      },
      profile: profile({ displayName: 'Builder copy', id: asWireId('profile_2'), version: 1 })
    }
    const call = vi.fn(async () => result)
    const client = { call } as unknown as WireV1Client

    await expect(
      cloneAgentBoxProfile(client, { displayName: 'Builder copy', harness: 'opaque-beta', profileId: 'profile_1' }, {
        createRequestId: () => asRequestId('request-clone-1')
      })
    ).resolves.toBe(result)

    expect(call.mock.calls[0]).toEqual([
      'profiles.clone',
      { displayName: 'Builder copy', harness: 'opaque-beta', profileId: 'profile_1', requestId: 'request-clone-1' }
    ])
  })

  it('omits the family when the caller keeps it, so the service stays the authority', async () => {
    const call = vi.fn(async () => ({ migration: {} as never, profile: profile() }))
    const client = { call } as unknown as WireV1Client

    await cloneAgentBoxProfile(client, { displayName: 'No family change', profileId: 'profile_1' })

    const [, params] = call.mock.calls[0] as unknown as [string, Record<string, unknown>]

    expect('harness' in params).toBe(false)
  })
})

describe('setAgentBoxProfilePermissions', () => {
  it('sends the rule order unchanged and returns the service record', async () => {
    const updated = profile({ permissionPreset: 'plan', version: 4 })
    const call = vi.fn(async () => ({ profile: updated }))
    const client = { call } as unknown as WireV1Client
    const rules = [
      { action: 'allow' as const, key: 'read' as const, pattern: null },
      { action: 'deny' as const, key: 'bash' as const, pattern: 'rm *' }
    ]

    await expect(
      setAgentBoxProfilePermissions(
        client,
        { expectedVersion: 3, preset: 'plan', profileId: 'profile_1', rules },
        { createRequestId: () => asRequestId('request-perm-1') }
      )
    ).resolves.toBe(updated)

    expect(call.mock.calls[0]).toEqual([
      'profiles.setPermissions',
      { expectedVersion: 3, preset: 'plan', profileId: 'profile_1', requestId: 'request-perm-1', rules }
    ])
  })

  it('carries the caller version so a stale write is refused, not replayed', async () => {
    const call = vi.fn(async () => ({ profile: profile() }))
    const client = { call } as unknown as WireV1Client

    await setAgentBoxProfilePermissions(client, {
      expectedVersion: 9,
      preset: 'default',
      profileId: 'profile_1',
      rules: []
    })

    const [, params] = call.mock.calls[0] as unknown as [string, { expectedVersion: number }]

    expect(params.expectedVersion).toBe(9)
  })
})
