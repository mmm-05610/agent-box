import { useEffect, useState } from 'react'
import { fetchProfileDetail } from '@/api'

/**
 * Resolve a profile's config directory from its name.
 * Shared plumbing for domain lists that need profile-local file paths.
 */
export function useProfileConfigDir(profileName: string): string | null {
  const [configDir, setConfigDir] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchProfileDetail(profileName)
      .then((detail) => {
        if (cancelled) return
        const dir = detail?.config_dir
        setConfigDir(typeof dir === 'string' ? dir : null)
      })
      .catch(() => {
        if (!cancelled) setConfigDir(null)
      })
    return () => { cancelled = true }
  }, [profileName])

  return configDir
}
