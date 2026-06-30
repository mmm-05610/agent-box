/**
 * UsageFooter — inline usage display on provider cards (like cc-switch).
 *
 * Shows remaining credit / used / total for the current provider.
 * Refresh button to manually re-query.
 */

import { useEffect, useRef, useState } from 'react'
import { queryUsage, type UsageResult, type UsageScript } from '@/api/providers'
import type { AgentType, Provider } from '@/api'

interface UsageFooterProps {
  provider: Provider
  agentType: AgentType
  usageScript?: UsageScript | null
  autoQueryInterval?: number
}

/** Format relative time since timestamp (ms). */
function formatRelativeTime(timestamp: number, now: number): string {
  const diff = Math.floor((now - timestamp) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export function UsageFooter({
  provider,
  agentType,
  usageScript,
  autoQueryInterval,
}: UsageFooterProps) {
  const enabled = usageScript?.enabled ?? false
  const [result, setResult] = useState<UsageResult | null>(null)
  const [fetching, setFetching] = useState(false)
  const [queriedAt, setQueriedAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const lastGoodRef = useRef<{ data: UsageResult; at: number } | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Auto-query on mount and interval
  useEffect(() => {
    if (!enabled) return

    const fetch = () => {
      setFetching(true)
      queryUsage(agentType, provider.id).then((r) => {
        setResult(r)
        setQueriedAt(Date.now())
        setFetching(false)
        if (r.success && r.data) {
          lastGoodRef.current = { data: r, at: Date.now() }
        }
      }).catch(() => setFetching(false))
    }

    fetch()

    if (autoQueryInterval && autoQueryInterval > 0) {
      intervalRef.current = setInterval(fetch, autoQueryInterval * 60 * 1000)
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [enabled, agentType, provider.id, autoQueryInterval])

  // Keep "now" updated for relative time display
  useEffect(() => {
    if (!queriedAt) return
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [queriedAt])

  const handleRefresh = () => {
    setFetching(true)
    queryUsage(agentType, provider.id).then((r) => {
      setResult(r)
      setQueriedAt(Date.now())
      setFetching(false)
      if (r.success && r.data) {
        lastGoodRef.current = { data: r, at: Date.now() }
      }
    }).catch(() => setFetching(false))
  }

  if (!enabled) return null
  if (!result) return null

  const usageDataList = result.data || []

  if (!result.success) {
    return (
      <div className="inline-flex items-center gap-2 text-xs rounded-lg border border-border bg-card px-2.5 py-1.5">
        <span className="text-red-500">⚠</span>
        <span className="text-muted-foreground">{result.error || 'Query failed'}</span>
        <button
          onClick={(e) => { e.stopPropagation(); handleRefresh() }}
          disabled={fetching}
          className="ml-1 hover:opacity-70"
          title="Refresh"
        >
          ↻
        </button>
      </div>
    )
  }

  if (usageDataList.length === 0) return null

  const first = usageDataList[0]
  const isPercentUnit = first.unit === '%'
  const isTokenPlan = isPercentUnit && usageDataList.length > 0

  if (isTokenPlan) {
    // Token Plan display — show tier utilization like cc-switch
    return (
      <div className="flex flex-col items-end gap-0.5 text-xs flex-shrink-0">
        <div className="flex items-center gap-1.5">
          {queriedAt && (
            <span className="text-[10px] text-muted-foreground/70">
              {formatRelativeTime(queriedAt, now)}
            </span>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleRefresh() }}
            disabled={fetching}
            className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
            title="Refresh usage"
          >
            <span className={fetching ? 'animate-spin inline-block' : ''}>↻</span>
          </button>
        </div>
        <div className="flex items-center gap-2">
          {usageDataList.map((d, i) => {
            const used = typeof d.used === 'number' ? d.used : Number(d.used || 0)
            const pct = Math.round(used)
            const color = pct > 80 ? 'text-red-500' : pct > 50 ? 'text-orange-500' : 'text-emerald-500'
            const name = (d.planName || '').replace(' window', '')
            return (
              <span key={i} className="flex items-center gap-1">
                <span className="text-muted-foreground">{name}</span>
                <span className={`font-semibold tabular-nums ${color}`}>{pct}%</span>
                {d.extra && (
                  <span className="text-[10px] text-muted-foreground/60">{String(d.extra)}</span>
                )}
              </span>
            )
          })}
        </div>
      </div>
    )
  }

  const remaining = typeof first.remaining === 'number' ? first.remaining : Number(first.remaining)
  const total = typeof first.total === 'number' ? first.total : Number(first.total)
  const used = typeof first.used === 'number' ? first.used : Number(first.used)
  const isValidNumber = (v: number) => !isNaN(v) && isFinite(v)

  return (
    <div className="flex flex-col items-end gap-0.5 text-xs flex-shrink-0">
      {/* Query time + refresh */}
      <div className="flex items-center gap-1.5">
        {queriedAt && (
          <span className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5">
            {formatRelativeTime(queriedAt, now)}
          </span>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); handleRefresh() }}
          disabled={fetching}
          className="p-0.5 rounded hover:bg-muted transition-colors text-muted-foreground"
          title="Refresh usage"
        >
          <span className={fetching ? 'animate-spin inline-block' : ''}>↻</span>
        </button>
      </div>

      {/* Usage data */}
      <div className="flex items-center gap-1.5">
        {isValidNumber(remaining) && (
          <>
            <span className="text-muted-foreground">Remaining</span>
            <span className={`font-semibold tabular-nums ${
              isValidNumber(total) && remaining < total * 0.1
                ? 'text-orange-500'
                : 'text-emerald-500'
            }`}>
              {remaining.toFixed(2)}
            </span>
          </>
        )}
        {isValidNumber(used) && (
          <>
            <span className="text-muted-foreground ml-1">/ Used</span>
            <span className="tabular-nums text-muted-foreground">
              {used.toFixed(2)}
            </span>
          </>
        )}
        {first.unit && (
          <span className="text-muted-foreground">{String(first.unit)}</span>
        )}
      </div>
      {first.planName && !isPercentUnit && (
        <span className="text-[10px] text-muted-foreground/70">💰 {String(first.planName)}</span>
      )}
    </div>
  )
}
