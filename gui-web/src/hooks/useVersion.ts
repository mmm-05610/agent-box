/**
 * useVersion — the agent-box backend version (agent_box.__version__).
 *
 * Served by the backend so the frontend never hardcodes a version string
 * that drifts. Module-level cache: fetched once, shared app-wide.
 */

import { useSyncExternalStore } from 'react'
import { fetchVersion } from '@/api/agentConfigs'

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
  inflight = fetchVersion()
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

export function useVersion(): string {
  ensureLoaded()
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) ?? ''
}
