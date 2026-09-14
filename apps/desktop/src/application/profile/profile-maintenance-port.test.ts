import { describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { asRequestId, asWireId, type ProfileRecord, type ProfilesUpdateConfigResult } from '@/types/wire/wire-v1'

import { harnessChoicesFromProfiles, wireProfileMaintenancePort } from './profile-maintenance-port'

const profile = (overrides: Partial<ProfileRecord> = {}): ProfileRecord => ({
  archivedAt: null,
  capabilities: {},
  createdAt: '2026-09-14T00:00:00.000Z',
  displayName: 'Builder',
  harness: 'opaque-alpha',
  id: asWireId('profile-1'),
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  ...overrides
})

describe('wireProfileMaintenancePort', () => {
  it('maps create, CAS update, and archive to the single wire authority', async () => {
    const call = vi.fn(async (method: string) => ({
      profile: profile(method === 'profiles.archive' ? { archivedAt: '2026-09-14T01:00:00.000Z' } : {})
    }))

    const client = { call } as unknown as WireV1Client
    const ids = ['request-create', 'request-update', 'request-archive'].map(asRequestId)

    const port = wireProfileMaintenancePort(client, {
      createRequestId: () => ids.shift()!,
      harnessChoices: [{ id: 'opaque-alpha', label: 'Opaque alpha' }]
    })

    await port.create({ displayName: 'Builder', harness: 'opaque-alpha' })
    await port.update({ displayName: 'Renamed', expectedVersion: 1, profileId: 'profile-1' })
    await port.archive({ expectedVersion: 2, profileId: 'profile-1' })

    expect(call.mock.calls).toEqual([
      [
        'profiles.create',
        { displayName: 'Builder', harness: 'opaque-alpha', requestId: 'request-create' }
      ],
      [
        'profiles.update',
        { displayName: 'Renamed', expectedVersion: 1, profileId: 'profile-1', requestId: 'request-update' }
      ],
      [
        'profiles.archive',
        { expectedVersion: 2, profileId: 'profile-1', requestId: 'request-archive' }
      ]
    ])
  })

  it('maps profile config updates and preserves the complete service result', async () => {
    const result: ProfilesUpdateConfigResult = {
      configVersion: 7,
      effectiveFor: 'next_send',
      profile: profile({ version: 4 })
    }

    const call = vi.fn(async () => result)
    const client = { call } as unknown as WireV1Client

    const port = wireProfileMaintenancePort(client, {
      createRequestId: () => asRequestId('request-config'),
      harnessChoices: []
    })

    await expect(
      port.updateConfig({
        expectedVersion: 3,
        profileId: 'profile-1',
        values: [{ controlId: 'role', value: 'reviewer' }]
      })
    ).resolves.toBe(result)
    expect(call).toHaveBeenCalledWith('profiles.updateConfig', {
      expectedVersion: 3,
      profileId: 'profile-1',
      requestId: 'request-config',
      values: [{ controlId: 'role', value: 'reviewer' }]
    })
  })

  it('derives choices only from opaque service records', () => {
    expect(
      harnessChoicesFromProfiles([
        profile({ harness: 'opaque-zeta' }),
        profile({ harness: 'opaque-alpha', id: asWireId('profile-2') }),
        profile({ harness: 'opaque-zeta', id: asWireId('profile-3') })
      ])
    ).toEqual([
      { id: 'opaque-alpha', label: 'opaque-alpha' },
      { id: 'opaque-zeta', label: 'opaque-zeta' }
    ])
  })
})
