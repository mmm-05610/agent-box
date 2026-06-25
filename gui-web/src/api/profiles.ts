/**
 * Profiles API — CRUD operations for profiles
 */

import type { AgentType, Profile } from './types'
import { MOCK_PROFILES } from './mock-data'

export async function fetchProfiles(): Promise<Profile[]> {
  await delay(300)
  return [...MOCK_PROFILES]
}

export async function fetchProfileDetail(name: string): Promise<Profile | null> {
  await delay(200)
  return MOCK_PROFILES.find((p) => p.name === name) ?? null
}

export async function createProfile(
  name: string,
  agentType: AgentType,
  options?: { displayName?: string; description?: string; preset?: string },
): Promise<Profile> {
  await delay(500)
  return {
    name,
    agentType,
    displayName: options?.displayName,
    description: options?.description,
    createdAt: Date.now(),
  }
}

export async function deleteProfile(_name: string): Promise<void> {
  await delay(300)
}

export async function launchProfile(
  _name: string,
  _options?: { cwd?: string; mode?: string },
): Promise<void> {
  await delay(500)
}

// ── Helpers ────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
