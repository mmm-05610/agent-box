/**
 * useAgentBoxUpdate — is a newer agent-box release available?
 *
 * Mirrors cc-switch's update badge: the backend fetches the latest GitHub
 * release version; this hook semver-compares it against the running version.
 * When `hasUpdate`, the UI shows a badge + download/browser actions.
 */

import { useCallback, useEffect, useState } from 'react'
import { fetchLatestVersion, type VersionInfo } from '@/api/environment'

function parseVersion(v: string): number[] {
  return v.split('.').map((n) => parseInt(n, 10) || 0)
}

function isNewer(latest: string, current: string): boolean {
  if (!latest || !current || latest === current) return false
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x > y) return true
    if (x < y) return false
  }
  return false
}

export function useAgentBoxUpdate() {
  const [info, setInfo] = useState<VersionInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setInfo(await fetchLatestVersion())
    } catch {
      setInfo(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const hasUpdate = !!info && isNewer(info.latest, info.current)
  return { hasUpdate, info, loading, refresh }
}
