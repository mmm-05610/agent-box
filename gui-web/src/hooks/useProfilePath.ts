/**
 * useProfilePath — resolve a profile's project directory from its name.
 *
 * Shared plumbing for components that need the profile path (e.g. the
 * instructions domain, which resolves relative instruction paths against it).
 */

import { useEffect, useState } from 'react'
import { fetchProfileDetail } from '@/api'

export function useProfilePath(profileName: string): string | null {
  const [profilePath, setProfilePath] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchProfileDetail(profileName)
      .then((detail) => {
        if (cancelled) return
        setProfilePath(typeof detail?.path === 'string' ? detail.path : null)
      })
      .catch(() => {
        if (!cancelled) setProfilePath(null)
      })
    return () => { cancelled = true }
  }, [profileName])

  return profilePath
}
