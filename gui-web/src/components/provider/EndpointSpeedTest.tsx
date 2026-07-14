/**
 * EndpointSpeedTest — test multiple endpoint URLs and pick the fastest.
 *
 * Props:
 *   endpoints:  initial URL list (from preset or provider)
 *   selected:   currently selected URL
 *   onSelect:   called when user picks (or auto-selects) an endpoint
 */

import { useState, useCallback } from 'react'
import { Button } from '@/components/ui'
import { testEndpoint } from '@/api'

interface EndpointResult {
  url: string
  latency: number | null
  status: 'operational' | 'degraded' | 'failed' | 'pending'
  error?: string
}

export interface EndpointSpeedTestProps {
  endpoints: string[]
  selected: string
  onSelect: (url: string) => void
}

export function EndpointSpeedTest({ endpoints, selected, onSelect }: EndpointSpeedTestProps) {
  const [results, setResults] = useState<EndpointResult[]>([])
  const [testing, setTesting] = useState(false)
  const [autoSelect, setAutoSelect] = useState(true)

  const runTest = useCallback(async () => {
    setTesting(true)
    // Initialize all as pending
    setResults(endpoints.map((url) => ({ url, latency: null, status: 'pending' as const })))

    // Test all concurrently
    const promises = endpoints.map(async (url, i) => {
      try {
        const result = await testEndpoint(url)
        const entry: EndpointResult = {
          url,
          latency: result?.response_time_ms ?? null,
          status: result?.status ?? 'failed',
          error: result?.status === 'failed' ? result.message : undefined,
        }
        return { i, entry }
      } catch {
        return { i, entry: { url, latency: null, status: 'failed' as const, error: 'Request failed' } }
      }
    })

    // Update results as each completes
    const allResults = await Promise.all(promises)
    const sorted: EndpointResult[] = allResults
      .map((r) => r.entry)
      .sort((a, b) => {
        if (a.latency === null && b.latency === null) return 0
        if (a.latency === null) return 1
        if (b.latency === null) return -1
        return a.latency - b.latency
      })

    setResults(sorted)
    setTesting(false)

    // Auto-select best
    if (autoSelect) {
      const best = sorted.find((r) => r.status === 'operational' || r.status === 'degraded')
      if (best) onSelect(best.url)
    }
  }, [endpoints, autoSelect, onSelect])

  if (endpoints.length === 0) return null

  return (
    <div className="rounded-lg border border-border/50 bg-muted/20 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Endpoint 测速</span>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <input
              type="checkbox"
              checked={autoSelect}
              onChange={(e) => setAutoSelect(e.target.checked)}
              className="rounded"
            />
            自动选最快
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={runTest}
            disabled={testing}
            className="h-7 gap-1 text-xs"
          >
            {testing ? (
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            )}
            测速
          </Button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="space-y-1.5">
          {results.map((r) => {
            const isSelected = r.url === selected
            const latencyColor =
              r.latency === null
                ? 'text-muted-foreground'
                : r.latency < 300
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : r.latency < 500
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : r.latency < 800
                      ? 'text-orange-600 dark:text-orange-400'
                      : 'text-red-600 dark:text-red-400'

            return (
              <button
                key={r.url}
                type="button"
                onClick={() => onSelect(r.url)}
                className={[
                  'w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition-colors cursor-pointer',
                  isSelected
                    ? 'border border-primary/30 bg-primary/5 text-foreground'
                    : 'border border-transparent hover:bg-muted/40 text-muted-foreground',
                ].join(' ')}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isSelected && (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                  )}
                  <span className="truncate font-mono">{r.url}</span>
                </div>
                <span className={`font-mono font-medium ml-2 shrink-0 ${latencyColor}`}>
                  {r.status === 'pending' ? (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  ) : r.latency !== null ? (
                    `${r.latency}ms`
                  ) : (
                    'failed'
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
