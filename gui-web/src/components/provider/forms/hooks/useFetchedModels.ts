import { useCallback, useState } from 'react'
import { fetchModels, type FetchedModel } from '@/api'
import i18n from '@/i18n'

export function useFetchedModels(baseUrl: string, apiKey: string, isFullUrl = false) {
  const [models, setModels] = useState<FetchedModel[]>([])
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetch = useCallback(async () => {
    if (!baseUrl.trim()) { setError(i18n.t('providerForm.modelFetch.noBaseUrl')); return [] }
    setFetching(true); setError(null)
    try {
      const next = await fetchModels(baseUrl, apiKey, undefined, isFullUrl)
      setModels(next)
      if (next.length === 0) setError(i18n.t('providerForm.modelFetch.noModels'))
      return next
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return []
    } finally { setFetching(false) }
  }, [apiKey, baseUrl, isFullUrl])
  return { models, fetching, error, fetch, clear: () => { setModels([]); setError(null) } }
}
