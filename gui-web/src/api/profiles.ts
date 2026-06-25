/**
 * Profiles API — CRUD operations for profiles
 *
 * Currently returns empty data. Will be connected to PyWebView bridge.
 */

import type { AgentType, Profile } from './types'

export async function fetchProfiles(): Promise<Profile[]> {
  return []
}

export async function fetchProfileDetail(_name: string): Promise<Profile | null> {
  return null
}

export async function createProfile(
  _name: string,
  _agentType: AgentType,
  _options?: { displayName?: string; description?: string; preset?: string },
): Promise<Profile> {
  throw new Error('Not connected to backend')
}

export async function deleteProfile(_name: string): Promise<void> {
  throw new Error('Not connected to backend')
}

export async function launchProfile(
  _name: string,
  _options?: { cwd?: string; mode?: string },
): Promise<void> {
  throw new Error('Not connected to backend')
}
