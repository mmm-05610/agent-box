/**
 * Providers API — CRUD operations for providers and Claude.md
 *
 * Calls PyWebView bridge functions via window.pywebview.api (async).
 * ACS rows are already snake_case — no conversion layer needed.
 */

import { call } from '@/lib/bridge'
import type { AgentType, Prompt, Provider } from './types'

// ── Providers ──────────────────────────────────────────────────────────

export async function fetchProviders(agentType: AgentType): Promise<Provider[]> {
  return call<Provider[]>((api) => api.list_providers!(agentType), [])
}

export async function fetchProviderDetail(
  agentType: AgentType,
  providerId: string,
): Promise<Provider | null> {
  return call<Provider | null>((api) => api.get_provider!(agentType, providerId), null)
}


export async function fetchPrompts(agentType: AgentType): Promise<Prompt[]> {
  return call<Prompt[]>((api) => api.list_prompts!(agentType), [])
}

export async function fetchPromptDetail(
  agentType: AgentType,
  mdId: string,
): Promise<Prompt | null> {
  return call<Prompt | null>((api) => api.get_prompt!(agentType, mdId), null)
}

export async function applyPromptToProfile(
  profileName: string,
  mdId: string,
): Promise<void> {
  await call<void>((api) => api.apply_prompt!(profileName, mdId), undefined)
}

// ── Profile Provider Store (Hermes / OpenCode) ──────────────────────────

export interface ProfileProvider {
  id: string
  name: string
  settings: Record<string, unknown>
  website_url?: string
  icon?: string
  icon_color?: string
  category?: string
}

export async function fetchProfileProviders(profileName: string): Promise<ProfileProvider[]> {
  return call<ProfileProvider[]>((api) => api.list_profile_providers!(profileName), [])
}

export async function removeProfileProvider(profileName: string, providerId: string): Promise<boolean> {
  return call<boolean>((api) => api.remove_profile_provider!(profileName, providerId), false)
}

export async function applyProvider(profileName: string, providerId: string): Promise<void> {
  await call<void>((api) => api.apply_provider!(profileName, providerId), undefined)
}
