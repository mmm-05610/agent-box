import type { WireV1Client } from '@/api/wire-v1-client'
import {
  asRequestId,
  asWireId,
  type ConfigOverride,
  type ProviderModelConfigRecord,
  type ProviderModelsListResult,
  type RequestId
} from '@/types/wire/wire-v1'

export interface CreateProviderModelIntent {
  configuration: ConfigOverride[]
  credentialId: string | null
  displayName: string
  harness: string
  models: ProviderModelConfigRecord['models']
  provider: string
}

export interface UpdateProviderModelIntent {
  configuration: ConfigOverride[]
  credentialId: string | null
  displayName: string
  expectedVersion: number
  models: ProviderModelConfigRecord['models']
  providerModelId: string
}

export interface ArchiveProviderModelIntent {
  expectedVersion: number
  providerModelId: string
}

export interface ProviderModelListOptions {
  includeArchived?: boolean
}

export interface ProviderModelMaintenancePort {
  archive(intent: ArchiveProviderModelIntent): Promise<ProviderModelConfigRecord>
  create(intent: CreateProviderModelIntent): Promise<ProviderModelConfigRecord>
  list(options?: ProviderModelListOptions): Promise<ProviderModelsListResult>
  update(intent: UpdateProviderModelIntent): Promise<ProviderModelConfigRecord>
}

export interface WireProviderModelMaintenanceOptions {
  createRequestId?: () => RequestId
}

const defaultRequestId = (): RequestId => asRequestId(`desktop-${crypto.randomUUID()}`)

/** Production provider/model adapter. Values remain opaque service data. */
export function wireProviderModelMaintenancePort(
  client: WireV1Client,
  options: WireProviderModelMaintenanceOptions = {}
): ProviderModelMaintenancePort {
  const requestId = options.createRequestId ?? defaultRequestId

  return {
    async list(options = {}) {
      return client.call('providerModels.list', { includeArchived: options.includeArchived ?? false })
    },
    async create(intent) {
      const result = await client.call('providerModels.create', {
        ...intent,
        credentialId: intent.credentialId === null ? null : asWireId(intent.credentialId),
        requestId: requestId()
      })

      return result.providerModel
    },
    async update(intent) {
      const result = await client.call('providerModels.update', {
        ...intent,
        credentialId: intent.credentialId === null ? null : asWireId(intent.credentialId),
        providerModelId: asWireId(intent.providerModelId),
        requestId: requestId()
      })

      return result.providerModel
    },
    async archive(intent) {
      const result = await client.call('providerModels.archive', {
        ...intent,
        providerModelId: asWireId(intent.providerModelId),
        requestId: requestId()
      })

      return result.providerModel
    }
  }
}
