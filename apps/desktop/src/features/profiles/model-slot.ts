import type { ComposerProviderModelChoice } from '@/lib/composer/types'
import type { ConfigControl, ConfigOverride, ProviderModelRef } from '@/types/wire/wire-v1'

/** The one control kind whose value is an opaque provider/model reference. */
export type ModelSlotControl = Extract<ConfigControl, { kind: 'model_slot' }>

/** A model reference in the same shape an override carries. */
export interface ModelRefValue {
  modelId: string
  providerId: string
}

export const modelChoiceKey = (choice: Pick<ComposerProviderModelChoice, 'modelId' | 'providerId'>): string =>
  JSON.stringify([choice.providerId, choice.modelId])

const sameRef = (choice: Pick<ComposerProviderModelChoice, 'modelId' | 'providerId'>, ref: ModelRefValue): boolean =>
  choice.providerId === ref.providerId && choice.modelId === ref.modelId

export const replaceOverride = (overrides: ConfigOverride[], controlId: string, value: unknown): ConfigOverride[] => [
  ...overrides.filter(override => override.controlId !== controlId),
  { controlId, value }
]

export const removeOverride = (overrides: ConfigOverride[], controlId: string): ConfigOverride[] =>
  overrides.filter(override => override.controlId !== controlId)

/** The override's provider/model reference for one control, or null. */
export const overrideModelRef = (overrides: ConfigOverride[], controlId: string): ModelRefValue | null => {
  const value = overrides.find(override => override.controlId === controlId)?.value

  if (!value || typeof value !== 'object') {
    return null
  }

  const candidate = value as { modelId?: unknown; providerId?: unknown }

  return typeof candidate.providerId === 'string' && typeof candidate.modelId === 'string'
    ? { modelId: candidate.modelId, providerId: candidate.providerId }
    : null
}

/** The service-declared reference of a model slot: the slot the descriptor
 *  names, else the first slot that carries a model at all. */
export const slotModelRef = (control: ModelSlotControl): ProviderModelRef | null =>
  control.slots.find(slot => slot.name === control.currentValue)?.model ??
  control.slots.find(slot => slot.model)?.model ??
  null

/** Display data for a raw reference — used when the directory no longer lists
 *  what the service or the user holds, so the value stays visible. */
export const choiceFromRef = (ref: {
  availability: ProviderModelRef['availability']
  modelId: string
  providerId: string
  unavailableReason: string | null
}): ComposerProviderModelChoice => ({
  availability: ref.availability,
  displayName: ref.modelId,
  modelId: ref.modelId,
  providerDisplayName: ref.providerId,
  providerId: ref.providerId,
  unavailableReason: ref.unavailableReason
})

/** The choice a raw override value resolves to: the matching directory entry,
 *  else display data synthesized from the opaque ids themselves. */
const choiceFromValue = (
  value: unknown,
  choices: ComposerProviderModelChoice[],
  fallback?: ComposerProviderModelChoice | null
): ComposerProviderModelChoice | null => {
  if (!value || typeof value !== 'object') {
    return fallback ?? null
  }

  const candidate = value as { modelId?: unknown; providerId?: unknown }

  if (typeof candidate.providerId !== 'string' || typeof candidate.modelId !== 'string') {
    return fallback ?? null
  }

  return (
    choices.find(choice => choice.providerId === candidate.providerId && choice.modelId === candidate.modelId) ?? {
      availability: 'unknown',
      displayName: candidate.modelId,
      modelId: candidate.modelId,
      providerDisplayName: candidate.providerId,
      providerId: candidate.providerId,
      unavailableReason: null
    }
  )
}

/** The choices a model slot offers: the directory, plus the value the user or
 *  the service currently holds when the directory no longer lists it. The
 *  client displays data; it never decides that a model stopped existing. */
export const modelSlotChoices = (
  control: ModelSlotControl,
  modelChoices: ComposerProviderModelChoice[],
  overrides: ConfigOverride[]
): ComposerProviderModelChoice[] => {
  const currentSlot = slotModelRef(control)

  const currentChoice = currentSlot
    ? (modelChoices.find(choice => sameRef(choice, currentSlot)) ?? choiceFromRef(currentSlot))
    : null

  const overrideRef = overrideModelRef(overrides, control.controlId)
  const extraChoice = (overrideRef ? choiceFromValue(overrideRef, modelChoices) : null) ?? currentChoice

  return extraChoice && !modelChoices.some(choice => modelChoiceKey(choice) === modelChoiceKey(extraChoice))
    ? [...modelChoices, extraChoice]
    : modelChoices
}

/** What a model slot shows right now: the explicit override, else the
 *  service-declared slot reference — null when the service declared none. */
export const modelSlotCurrentValue = (
  control: ModelSlotControl,
  modelChoices: ComposerProviderModelChoice[],
  overrides: ConfigOverride[]
): ComposerProviderModelChoice | null => {
  const hasOverride = overrides.some(override => override.controlId === control.controlId)
  const overrideRef = overrideModelRef(overrides, control.controlId)

  if (hasOverride) {
    return overrideRef ? choiceFromValue(overrideRef, modelChoices, null) : null
  }

  const slotRef = slotModelRef(control)

  return slotRef ? (modelChoices.find(choice => sameRef(choice, slotRef)) ?? choiceFromRef(slotRef)) : null
}
