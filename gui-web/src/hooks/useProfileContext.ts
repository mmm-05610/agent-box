/**
 * useProfileContext — the currently selected profile.
 *
 * Module-level store (no provider tree needed): setCurrentProfile() is the
 * single write path, useProfileContext() subscribes to it. The detail page
 * still passes profileName via props (stage 5), so nothing writes here yet —
 * this is the wired-in replacement for that prop once the page adopts it.
 */

import { useSyncExternalStore } from 'react'

let currentProfile: string | null = null
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) listener()
}

/** Set (or clear) the currently selected profile. */
export function setCurrentProfile(profileName: string | null): void {
  if (currentProfile === profileName) return
  currentProfile = profileName
  emit()
}

export function getCurrentProfile(): string | null {
  return currentProfile
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export interface UseProfileContextReturn {
  profileName: string | null
}

export function useProfileContext(): UseProfileContextReturn {
  const profileName = useSyncExternalStore(subscribe, getCurrentProfile, getCurrentProfile)
  return { profileName }
}
