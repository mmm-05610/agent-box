import { describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { asRequestId, asWireId, type ProviderModelConfigRecord } from '@/types/wire/wire-v1'

import { wireProviderModelMaintenancePort } from './provider-model-maintenance-port'

const providerModel = (overrides: Partial<ProviderModelConfigRecord> = {}): ProviderModelConfigRecord => ({
  archivedAt: null,
  configuration: [{ controlId: 'endpoint', value: 'opaque://service' }],
  createdAt: '2026-09-14T00:00:00.000Z',
  credentialId: null,
  displayName: 'Opaque provider',
  harness: 'opaque-harness',
  id: asWireId('provider-model-1'),
  models: [
    { availability: 'unknown', displayName: 'Opaque model', modelId: 'opaque-model', unavailableReason: null }
  ],
  provider: 'opaque-provider',
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  ...overrides
})

describe('wireProviderModelMaintenancePort', () => {
  it('forwards list with an explicit default and preserves pagination', async () => {
    const result = { items: [providerModel()], nextCursor: 'cursor-2' }
    const call = vi.fn(async () => result)
    const port = wireProviderModelMaintenancePort({ call } as unknown as WireV1Client)

    await expect(port.list()).resolves.toBe(result)
    await expect(port.list({ includeArchived: true })).resolves.toBe(result)
    expect((call.mock.calls as unknown as Array<[string, unknown]>).map(([method, params]) => [method, params])).toEqual([
      ['providerModels.list', { includeArchived: false }],
      ['providerModels.list', { includeArchived: true }]
    ])
  })

  it('generates request ids and maps opaque ids at every write boundary', async () => {
    const record = providerModel()
    const call = vi.fn(async (method: string) => ({ providerModel: method === 'providerModels.archive' ? { ...record, archivedAt: '2026-09-14T01:00:00.000Z' } : record }))
    const ids = ['request-create', 'request-update', 'request-archive'].map(asRequestId)

    const port = wireProviderModelMaintenancePort({ call } as unknown as WireV1Client, {
      createRequestId: () => ids.shift()!
    })

    const models = record.models

    await port.create({ configuration: record.configuration, credentialId: 'credential-1', displayName: 'New', harness: 'h', models, provider: 'p' })
    await port.update({ configuration: record.configuration, credentialId: null, displayName: 'Changed', expectedVersion: 1, models, providerModelId: 'provider-model-1' })
    await port.archive({ expectedVersion: 2, providerModelId: 'provider-model-1' })

    expect(call.mock.calls).toEqual([
      ['providerModels.create', { configuration: record.configuration, credentialId: 'credential-1', displayName: 'New', harness: 'h', models, provider: 'p', requestId: 'request-create' }],
      ['providerModels.update', { configuration: record.configuration, credentialId: null, displayName: 'Changed', expectedVersion: 1, models, providerModelId: 'provider-model-1', requestId: 'request-update' }],
      ['providerModels.archive', { expectedVersion: 2, providerModelId: 'provider-model-1', requestId: 'request-archive' }]
    ])
  })

  it('propagates typed client failures without fabricating records', async () => {
    const error = new Error('CAS conflict')
    const call = vi.fn(async () => { throw error })
    const port = wireProviderModelMaintenancePort({ call } as unknown as WireV1Client)

    await expect(port.archive({ expectedVersion: 1, providerModelId: 'provider-model-1' })).rejects.toBe(error)
  })
})
