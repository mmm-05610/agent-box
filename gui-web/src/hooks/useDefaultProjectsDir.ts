/**
 * useDefaultProjectsDir — the backend's default projects directory
 * (config.default_projects_dir(), env-overridable).
 *
 * Served by the backend so the frontend never hardcodes a default path
 * that drifts. Module-level cache: fetched once, shared app-wide.
 */

import { useSyncExternalStore } from 'react'
import { fetchDefaultProjectsDir } from '@/api/agentConfigs'

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
  inflight = fetchDefaultProjectsDir()
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

export function useDefaultProjectsDir(): string {
  ensureLoaded()
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) ?? ''
}
