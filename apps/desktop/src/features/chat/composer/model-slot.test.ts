import { describe, expect, it } from 'vitest'

import {
  choiceFromRef,
  modelSlotChoices,
  type ModelSlotControl,
  modelSlotCurrentValue,
  overrideModelRef,
  removeOverride,
  replaceOverride,
  slotModelRef
} from '@/features/profiles/model-slot'
import type { ComposerProviderModelChoice } from '@/lib/composer/types'
import { asWireId, type ConfigOverride, type ProviderModelRef } from '@/types/wire/wire-v1'

const slotControl = (model: ProviderModelRef | null): ModelSlotControl => ({
  controlId: 'model',
  editable: true,
  kind: 'model_slot',
  slots: [{ model, name: 'primary' }]
})

const choice = (
  providerId: string,
  modelId: string,
  availability: ComposerProviderModelChoice['availability'] = 'available'
): ComposerProviderModelChoice => ({
  availability,
  displayName: `Display ${modelId}`,
  modelId,
  providerDisplayName: `Display ${providerId}`,
  providerId,
  unavailableReason: null
})

const override = (controlId: string, value: unknown): ConfigOverride => ({ controlId, value })

describe('override list helpers', () => {
  it('replaces the one control id in place and leaves the others untouched', () => {
    const overrides = [override('a', 1), override('b', 2)]

    expect(replaceOverride(overrides, 'b', 3)).toEqual([override('a', 1), override('b', 3)])
    expect(overrides).toEqual([override('a', 1), override('b', 2)])
  })

  it('removes exactly the one control id', () => {
    expect(removeOverride([override('a', 1), override('b', 2)], 'a')).toEqual([override('b', 2)])
  })

  it('reads a provider/model reference out of an override and rejects anything else', () => {
    expect(overrideModelRef([override('model', { modelId: 'm1', providerId: 'p1' })], 'model')).toEqual({
      modelId: 'm1',
      providerId: 'p1'
    })
    expect(overrideModelRef([override('model', 'a slot name')], 'model')).toBeNull()
    expect(overrideModelRef([override('other', { modelId: 'm1', providerId: 'p1' })], 'model')).toBeNull()
    expect(overrideModelRef([override('model', { providerId: 'p1' })], 'model')).toBeNull()
  })
})

describe('slot references', () => {
  it('prefers the slot the descriptor names, then the first slot that carries a model', () => {
    const named = slotControl(null)

    expect(slotModelRef(named)).toBeNull()

    const declared: ModelSlotControl = {
      ...named,
      slots: [
        { model: null, name: 'primary' },
        { model: { availability: 'available', modelId: 'm2', providerId: asWireId('p2'), unavailableReason: null }, name: 'secondary' }
      ],
      currentValue: 'secondary'
    }

    expect(slotModelRef(declared)?.modelId).toBe('m2')
  })
})

describe('model slot choices', () => {
  it('keeps a service-declared reference the directory no longer lists', () => {
    const control = slotControl({
      availability: 'unavailable',
      modelId: 'legacy-model',
      providerId: asWireId('legacy-provider'),
      unavailableReason: 'Retired'
    })

    expect(modelSlotChoices(control, [choice('p1', 'm1')], [])).toEqual([
      choice('p1', 'm1'),
      {
        availability: 'unavailable',
        displayName: 'legacy-model',
        modelId: 'legacy-model',
        providerDisplayName: 'legacy-provider',
        providerId: 'legacy-provider',
        unavailableReason: 'Retired'
      }
    ])
  })

  it('keeps an explicit override the directory no longer lists, above the descriptor slot', () => {
    const control = slotControl({
      availability: 'available',
      modelId: 'slot-model',
      providerId: asWireId('slot-provider'),
      unavailableReason: null
    })

    const choices = modelSlotChoices(control, [], [override('model', { modelId: 'draft-model', providerId: 'draft-provider' })])

    expect(choices.map(entry => entry.modelId)).toEqual(['draft-model'])
  })

  it('does not duplicate a reference the directory already offers', () => {
    const control = slotControl({ availability: 'available', modelId: 'm1', providerId: asWireId('p1'), unavailableReason: null })

    expect(modelSlotChoices(control, [choice('p1', 'm1')], [])).toHaveLength(1)
  })
})

describe('model slot current value', () => {
  it('shows the explicit override while one exists, even when it is unparseable', () => {
    const control = slotControl({
      availability: 'available',
      modelId: 'slot-model',
      providerId: asWireId('slot-provider'),
      unavailableReason: null
    })

    expect(modelSlotCurrentValue(control, [choice('slot-provider', 'slot-model')], [override('model', 'garbage')])).toBeNull()
  })

  it('shows the descriptor slot when no override exists, and nothing when none is declared', () => {
    const declared = slotControl({
      availability: 'available',
      modelId: 'slot-model',
      providerId: asWireId('slot-provider'),
      unavailableReason: null
    })

    expect(modelSlotCurrentValue(declared, [], [])?.modelId).toBe('slot-model')
    expect(modelSlotCurrentValue(slotControl(null), [], [])).toBeNull()
  })

  it('resolves an override back to its directory entry and synthesizes display data otherwise', () => {
    const control = slotControl(null)

    expect(modelSlotCurrentValue(control, [choice('p1', 'm1')], [override('model', { modelId: 'm1', providerId: 'p1' })])?.displayName).toBe('Display m1')

    const synthesized = modelSlotCurrentValue(control, [], [override('model', { modelId: 'm9', providerId: 'p9' })])

    expect(synthesized).toMatchObject({ availability: 'unknown', modelId: 'm9', providerId: 'p9' })
  })
})

describe('choiceFromRef', () => {
  it('mirrors the opaque ids as display data without inventing availability', () => {
    expect(
      choiceFromRef({ availability: 'unavailable', modelId: 'm1', providerId: 'p1', unavailableReason: 'Down' })
    ).toEqual({
      availability: 'unavailable',
      displayName: 'm1',
      modelId: 'm1',
      providerDisplayName: 'p1',
      providerId: 'p1',
      unavailableReason: 'Down'
    })
  })
})
