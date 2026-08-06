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

  const refresh = useCallback(async (): Promise<BinaryInfo[]> => {
    // Refresh silently — never blank the whole list with a spinner.  The
    // `loading` state only reflects the FIRST load (initial value true).
    try {
      const data = await fetchBinaries()
      setBinaries(data)
      return data
    } catch {
      setBinaries([])
      return []
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { binaries, loading, refresh }
}
