/**
 * useDefaultAgent — the backend's default agent type (config.DEFAULT_AGENT_TYPE).
 *
 * Served by the backend so the frontend never hardcodes which agent is the
 * default. Module-level cache: fetched once, shared app-wide.
 */

import { useSyncExternalStore } from 'react'
import { fetchDefaultAgent } from '@/api/agentConfigs'

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
  inflight = fetchDefaultAgent()
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

export function useDefaultAgent(): string {
  ensureLoaded()
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) ?? ''
}
