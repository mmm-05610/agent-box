/**
 * useProfileConfigDir — resolve a profile's config directory from its name.
 *
 * Shared plumbing for per-profile data that lives in files (provider config
 * files, skills dir, settings.json, prompt file). Hooks and domain lists
 * depend on this single implementation — no duplicated fetchProfileDetail.
 */

import { useEffect, useState } from 'react'
import { fetchProfileDetail } from '@/api'

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
