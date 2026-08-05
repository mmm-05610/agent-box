/**
 * useBinaries — agent/cc-switch binary presence inside WSL.
 *
 * Registry-driven detection: the backend reports each agent type's binary +
 * cc-switch with installed/version.  Powers the Environment page list and the
 * sidebar ACS guard.
 */

import { useCallback, useEffect, useState } from 'react'
import { fetchBinaries, type BinaryInfo } from '@/api/environment'

export function useBinaries() {
  const [binaries, setBinaries] = useState<BinaryInfo[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setBinaries(await fetchBinaries())
    } catch {
      setBinaries([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { binaries, loading, refresh }
}
