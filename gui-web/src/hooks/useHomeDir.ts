/**
 * useHomeDir — the OS home directory (WSL home on Windows-host GUI).
 *
 * The frontend uses it to render paths home-relatively (`~/…`) instead of
 * `/home/<user>/…`.  Served by the backend so the home path never lives in
 * the frontend.  Module-level cache: fetched once, shared app-wide.
 */

import { useSyncExternalStore } from 'react'
import { fetchHomeDir } from '@/api/agentConfigs'

let cache: string | null = null
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): string | null {
  return cache
}

function notify() {
  for (const l of listeners) l()
}

function ensureLoaded(): void {
  if (cache !== null || inflight) return
  inflight = fetchHomeDir()
    .then((value) => {
      cache = value
      notify()
    })
    .catch(() => {
      cache = ''
      notify()
    })
    .finally(() => { inflight = null })
}

export function useHomeDir(): string {
  ensureLoaded()
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) ?? ''
}
