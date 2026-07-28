import { useCallback, useState } from 'react'
import { fetchModels, type FetchedModel } from '@/api'

export function useFetchedModels(baseUrl: string, apiKey: string, isFullUrl = false) {
  const [models, setModels] = useState<FetchedModel[]>([])
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fetch = useCallback(async () => {
    if (!baseUrl.trim()) { setError('请先填写 API 请求地址。'); return [] }
    setFetching(true); setError(null)
    try {
      const next = await fetchModels(baseUrl, apiKey, undefined, isFullUrl)
      setModels(next)
      if (next.length === 0) setError('接口没有返回可用模型。')
      return next
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
      return []
    } finally { setFetching(false) }
  }, [apiKey, baseUrl, isFullUrl])
  return { models, fetching, error, fetch, clear: () => { setModels([]); setError(null) } }
}
