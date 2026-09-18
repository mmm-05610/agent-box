import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { WireV1Client } from '@/api/wire-v1-client'
import { $agentBoxHello, $agentBoxProviderModels, $agentBoxProviderModelState } from '@/store/agentbox-service'
import { asWireId, type ProviderModelConfigRecord, WIRE_PROTOCOL_VERSION } from '@/types/wire/wire-v1'

import { ensureAgentBoxProviderModelCatalog, refreshAgentBoxProviderModelCatalog } from './wire-provider-model-catalog'

const model = (overrides: Partial<ProviderModelConfigRecord> = {}): ProviderModelConfigRecord => ({
  archivedAt: null,
  configuration: [],
  createdAt: '2026-09-14T00:00:00.000Z',
  credentialId: null,
  displayName: 'Provider One',
  harness: 'opaque-harness',
  id: asWireId('provider-one'),
  models: [
    { availability: 'unknown', displayName: 'Slash model', modelId: 'family/model-v1', unavailableReason: null }
  ],
  provider: 'opaque-provider',
  updatedAt: '2026-09-14T00:00:00.000Z',
  version: 1,
  ...overrides
})

const hello = (supported: boolean) => ({
  auth: { required: false as const },
  capabilities: [{ id: 'providerModels.list', supported }],
  protocolVersion: WIRE_PROTOCOL_VERSION as typeof WIRE_PROTOCOL_VERSION,
  serverId: asWireId('server-test')
})

beforeEach(() => {
  $agentBoxHello.set(hello(true))
  $agentBoxProviderModels.set([])
  $agentBoxProviderModelState.set({ detail: null, phase: 'idle' })
})

describe('wire provider model catalog', () => {
  it('reports a missing capability without changing the service projection', async () => {
    const cached = model()
    $agentBoxProviderModels.set([cached])
    $agentBoxHello.set(hello(false))

    const result = await refreshAgentBoxProviderModelCatalog({ call: vi.fn() } as unknown as WireV1Client)

    expect(result[0]?.modelId).toBe('family/model-v1')
    expect($agentBoxProviderModels.get()).toEqual([cached])
    expect($agentBoxProviderModelState.get().phase).toBe('unavailable')
  })

  it('projects successful list results with opaque provider and model identity', async () => {
    const call = vi.fn(async () => ({ items: [model()], nextCursor: null }))

    const result = await refreshAgentBoxProviderModelCatalog({ call } as unknown as WireV1Client)

    expect(call).toHaveBeenCalledWith('providerModels.list', { includeArchived: false })
    expect(result).toEqual([
      expect.objectContaining({
        modelId: 'family/model-v1',
        providerId: 'provider-one',
        providerDisplayName: 'Provider One'
      })
    ])
    expect($agentBoxProviderModelState.get().phase).toBe('ready')
  })

  it('single-flights concurrent refreshes and keeps cached data after failure', async () => {
    const cached = model()
    $agentBoxProviderModels.set([cached])
    let reject!: (error: Error) => void

    const call = vi.fn(
      () =>
        new Promise<never>((_, fail) => {
          reject = fail
        })
    )

    const first = ensureAgentBoxProviderModelCatalog({ call } as unknown as WireV1Client)
    const second = ensureAgentBoxProviderModelCatalog({ call } as unknown as WireV1Client)
    expect(first).toBe(second)
    reject(new Error('offline'))

    await expect(first).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ modelId: 'family/model-v1' })])
    )
    expect(call).toHaveBeenCalledTimes(1)
    expect($agentBoxProviderModels.get()).toEqual([cached])
    expect($agentBoxProviderModelState.get()).toMatchObject({ detail: 'offline', phase: 'unavailable' })
  })
})
