import { wireCapability, type WireV1Client } from '@/api/wire-v1-client'
import type { ComposerProviderModelChoice } from '@/lib/composer/types'
import {
  $agentBoxHello,
  $agentBoxProviderModels,
  $agentBoxProviderModelState,
  setAgentBoxProviderModels
} from '@/store/agentbox-service'
import type { ProviderModelConfigRecord } from '@/types/wire/wire-v1'

let refresh: Promise<ComposerProviderModelChoice[]> | null = null

const detailOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export async function refreshAgentBoxProviderModelCatalog(
  client: WireV1Client
): Promise<ComposerProviderModelChoice[]> {
  $agentBoxProviderModelState.set({ detail: null, phase: 'loading' })

  try {
    const hello = $agentBoxHello.get()

    const capability = hello
      ? wireCapability(hello, 'providerModels.list')
      : { supported: false, reason: 'AgentBox service has not completed hello' }

    if (!capability.supported) {
      throw new Error(capability.reason || 'providerModels.list is unavailable')
    }

    const result = await client.call('providerModels.list', { includeArchived: false })
    setAgentBoxProviderModels(result.items)
    $agentBoxProviderModelState.set({ detail: null, phase: 'ready' })

    return choicesFromModels($agentBoxProviderModels.get())
  } catch (error) {
    $agentBoxProviderModelState.set({ detail: detailOf(error), phase: 'unavailable' })

    return choicesFromModels($agentBoxProviderModels.get())
  }
}

export function ensureAgentBoxProviderModelCatalog(client: WireV1Client): Promise<ComposerProviderModelChoice[]> {
  if ($agentBoxProviderModelState.get().phase === 'ready') {
    return Promise.resolve(choicesFromModels($agentBoxProviderModels.get()))
  }

  refresh ??= refreshAgentBoxProviderModelCatalog(client).finally(() => {
    refresh = null
  })

  return refresh
}

export function choicesFromModels(models: readonly ProviderModelConfigRecord[]): ComposerProviderModelChoice[] {
  return models.flatMap(model =>
    model.models.map(entry => ({
      availability: entry.availability,
      displayName: entry.displayName,
      modelId: entry.modelId,
      providerDisplayName: model.displayName,
      providerId: model.id,
      unavailableReason: entry.unavailableReason
    }))
  )
}
