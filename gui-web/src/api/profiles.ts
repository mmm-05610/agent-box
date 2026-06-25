/**
 * Profiles API — CRUD operations for profiles
 *
 * Calls PyWebView bridge functions via window.pywebview.api (async)
 * Converts snake_case fields from CLI to camelCase.
 */

import { call } from '@/lib/bridge'
import type { AgentType, Profile } from './types'

/** Convert snake_case profile from CLI to camelCase */
function toProfile(raw: Record<string, unknown>): Profile {
  return {
    name: raw.name as string,
    agentType: raw.agent_type as AgentType,
    displayName: raw.display_name as string | undefined,
    description: raw.description as string | undefined,
    providerRef: raw.provider_ref as string | undefined,
    claudeMdRef: raw.claude_md_ref as string | undefined,
    createdAt: raw.created_at as number | undefined,
  }
}

export async function fetchProfiles(): Promise<Profile[]> {
  const raw = await call<Record<string, unknown>[]>((api) => api.list_profiles(), [])
  return raw.map(toProfile)
}

export async function fetchProfileDetail(name: string): Promise<Record<string, unknown> | null> {
  return call<Record<string, unknown> | null>((api) => api.get_profile(name), null)
}

export async function createProfile(
  name: string,
  agentType: AgentType,
  options?: { displayName?: string; description?: string; preset?: string },
): Promise<Profile> {
  const raw = await call<Record<string, unknown>>(
    (api) => api.create_profile(
      name,
      agentType,
      options?.displayName ?? '',
      options?.description ?? '',
      options?.preset ?? '',
    ),
    {} as Record<string, unknown>,
  )
  return toProfile(raw)
}

export async function deleteProfile(name: string): Promise<void> {
  await call<void>((api) => api.delete_profile(name), undefined)
}

export async function launchProfile(
  _name: string,
  _options?: { cwd?: string; mode?: string },
): Promise<void> {
  throw new Error('Launch not available in web mode')
}
