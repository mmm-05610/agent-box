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
  name: string,
  options?: { agentType?: string; mode?: string; cwd?: string },
): Promise<void> {
  await call<void>(
    (api) => api.launch_profile(
      name,
      options?.agentType ?? 'claude',
      options?.mode ?? 'interactive',
      options?.cwd ?? '',
    ),
    undefined,
  )
}

/**
 * Get last used cwd for each profile from session history.
 * Returns {profile_name: last_cwd_path}.
 */
export async function getLastCwdMap(): Promise<Record<string, string>> {
  return call<Record<string, string>>((api) => api.last_cwd_map(), {})
}

/**
 * Update profile metadata fields.
 * Only non-empty fields are changed; empty strings are ignored.
 */
export async function editProfile(
  name: string,
  fields: { displayName?: string; description?: string; provider?: string; claudeMd?: string },
): Promise<Record<string, unknown> | null> {
  return call<Record<string, unknown> | null>(
    (api) => api.edit_profile(
      name,
      fields.displayName ?? '',
      fields.description ?? '',
      fields.provider ?? '',
      fields.claudeMd ?? '',
    ),
    null,
  )
}

/**
 * Open native folder picker dialog.
 * Returns the selected WSL path, or empty string if cancelled.
 * @param initial - WSL path to start in (e.g. ~/projects)
 */
export async function browseDir(initial?: string): Promise<string> {
  return call<string>((api) => api.browse_dir(initial ?? ''), '')
}
