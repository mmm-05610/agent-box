/**
 * useProjectsDir — the current projects directory (user-stored value from the
 * backend's gui-settings.json, else the backend default).
 *
 * Persisted backend-side so it survives GUI restarts — browser localStorage
 * for a file:// origin is not reliable. Module-level cache shared app-wide;
 * callers call `refresh()` after saving a new value.
 */

import { useSyncExternalStore } from 'react'
import { fetchProjectsDir } from '@/api/agentConfigs'

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
  inflight = fetchProjectsDir()
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

export function useProjectsDir(): { dir: string; refresh: () => void } {
  ensureLoaded()
  const dir = useSyncExternalStore(subscribe, getSnapshot, getSnapshot) ?? ''
  return {
    dir,
    refresh: () => {
      cache = null
      inflight = null
      ensureLoaded()
    },
  }
}
