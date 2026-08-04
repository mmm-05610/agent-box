import { call } from '@/lib/bridge'

export interface FetchedModel {
  id: string
  ownedBy?: string
}

interface BridgeFetchedModel {
  id: string
  owned_by?: string | null
}

export async function fetchModels(baseUrl: string, apiKey: string): Promise<FetchedModel[]> {
  const models = await call<BridgeFetchedModel[]>(
    (api) => api.fetch_models!(baseUrl, apiKey, '', false),
    [],
  )

  return models.map((model) => ({
    id: model.id,
    ...(model.owned_by ? { ownedBy: model.owned_by } : {}),
  }))
}
