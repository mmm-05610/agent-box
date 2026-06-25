/**
 * Profiles API — CRUD operations for profiles
 *
 * Calls PyWebView bridge functions via window.pywebview.api
 */

import { call } from '@/lib/bridge'
import type { AgentType, Profile } from './types'

export async function fetchProfiles(): Promise<Profile[]> {
  return call<Profile[]>((api) => api.list_profiles(), [])
}

export async function fetchProfileDetail(name: string): Promise<Profile | null> {
  return call<Profile | null>((api) => api.get_profile(name), null)
}

export async function createProfile(
  name: string,
  agentType: AgentType,
  options?: { displayName?: string; description?: string; preset?: string },
): Promise<Profile> {
  return call<Profile>(
    (api) => api.create_profile(
      name,
      agentType,
      options?.displayName ?? '',
      options?.description ?? '',
      options?.preset ?? '',
    ),
    {} as Profile,
  )
}

export async function deleteProfile(name: string): Promise<void> {
  await call<void>((api) => api.delete_profile(name), undefined)
}

export async function launchProfile(
  _name: string,
  _options?: { cwd?: string; mode?: string },
): Promise<void> {
  // Launch is handled by the OS/CLI, not through the bridge
  throw new Error('Launch not available in web mode')
}
