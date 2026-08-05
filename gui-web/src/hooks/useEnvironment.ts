/**
 * useEnvironment — runtime health of the backend the GUI depends on.
 *
 * Windows host: probes `wsl.exe` + a bootable default distro (the exact
 * `wsl.exe bash -lc` path every call uses). Linux host: always ready. The
 * App renders a setup/install guide until `status.ready` is true, so a
 * bare machine sees onboarding instead of scattered RPC errors.
 */

import { useCallback, useEffect, useState } from 'react'
import { call } from '@/lib/bridge'

export interface EnvironmentStatus {
  ready: boolean
  wsl: boolean
  distro: boolean
  detail: string
}

const FALLBACK: EnvironmentStatus = {
  ready: false,
  wsl: false,
  distro: false,
  detail: '',
}

export function useEnvironment() {
  const [status, setStatus] = useState<EnvironmentStatus | null>(null)
  const [checking, setChecking] = useState(true)

  const refresh = useCallback(async () => {
    setChecking(true)
    try {
      const next = await call<EnvironmentStatus>(
        (api) => api.check_environment(),
        FALLBACK,
      )
      setStatus(next)
    } catch (e) {
      // check_environment is structured and never throws, but guard anyway.
      setStatus({ ...FALLBACK, detail: String(e) })
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { status, checking, refresh }
}
