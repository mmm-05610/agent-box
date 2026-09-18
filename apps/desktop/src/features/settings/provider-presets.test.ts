import { describe, expect, it } from 'vitest'

import { asWireId, type ProviderModelConfigRecord } from '@/types/wire/wire-v1'

import {
  CUSTOM_HARNESS,
  CUSTOM_PROVIDER,
  harnessOptions,
  knownModelIds,
  PROVIDER_PRESETS,
  providerOptions
} from './provider-presets'

const record = (overrides: Partial<ProviderModelConfigRecord> = {}): ProviderModelConfigRecord => ({
  archivedAt: null,
  configuration: [],
  createdAt: '2026-09-14T00:00:00Z',
  credentialId: null,
  displayName: 'Team model',
  harness: 'opaque-harness',
  id: asWireId('pm-1'),
  models: [{ availability: 'available', displayName: 'Model A', modelId: 'model-a', unavailableReason: null }],
  provider: 'opaque-provider',
  updatedAt: '2026-09-14T00:00:00Z',
  version: 1,
  ...overrides
})

describe('provider presets', () => {
  it('carries identifiers only: no endpoint, auth or protocol facts are invented', () => {
    for (const preset of PROVIDER_PRESETS) {
      expect(Object.keys(preset).sort()).toEqual(['id', 'label'])
    }
  })

  it('offers presets first, then the provider ids the service records already use', () => {
    const options = providerOptions(['opaque-provider', 'deepseek'])

    expect(options.slice(0, PROVIDER_PRESETS.length).map(option => option.id)).toEqual(
      PROVIDER_PRESETS.map(preset => preset.id)
    )
    // A value already used by the directory appears once, marked in-use.
    expect(options.filter(option => option.id === 'deepseek')).toEqual([
      { id: 'deepseek', inUse: false, label: 'DeepSeek' }
    ])
    expect(options.find(option => option.id === 'opaque-provider')).toEqual({
      id: 'opaque-provider',
      inUse: true,
      label: 'opaque-provider'
    })
  })

  it('reports the directory as empty when it is empty — no provider is implied', () => {
    expect(providerOptions([]).every(option => !option.inUse)).toBe(true)
  })

  it('names only harness families the service declared, keeping the current value visible', () => {
    expect(harnessOptions([], '')).toEqual([])
    expect(harnessOptions(['opaque-harness', 'opaque-harness'], '')).toEqual(['opaque-harness'])
    expect(harnessOptions(['a-harness'], 'z-harness')).toEqual(['a-harness', 'z-harness'])
  })

  it('suggests model ids from records of the same provider only', () => {
    const records = [
      record(),
      record({ id: asWireId('pm-2'), provider: 'other-provider', models: [{ availability: 'unknown', displayName: 'B', modelId: 'model-b', unavailableReason: null }] })
    ]

    expect(knownModelIds(records, 'opaque-provider')).toEqual(['model-a'])
    expect(knownModelIds(records, 'other-provider')).toEqual(['model-b'])
    expect(knownModelIds(records, 'unused-provider')).toEqual([])
  })

  it('keeps the explicit-override sentinels distinct from any real id', () => {
    expect(CUSTOM_PROVIDER.startsWith('__')).toBe(true)
    expect(CUSTOM_HARNESS.startsWith('__')).toBe(true)
    expect(CUSTOM_PROVIDER).not.toBe(CUSTOM_HARNESS)
  })
})
