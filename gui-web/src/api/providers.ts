/**
 * Providers API — CRUD operations for providers and Claude.md
 *
 * Calls PyWebView bridge functions via window.pywebview.api (async)
 * Converts snake_case fields from CLI to camelCase.
 */

import { call } from '@/lib/bridge'
import type { AgentType, ClaudeMd, Provider } from './types'

/** Convert snake_case provider from CLI to camelCase */
function toProvider(raw: Record<string, unknown>): Provider {
  return {
    id: raw.id as string,
    name: raw.name as string,
    category: raw.category as string | undefined,
    websiteUrl: raw.website_url as string | undefined,
    settings: raw.settings as Provider['settings'],
    meta: raw.meta as Provider['meta'] | undefined,
    createdAt: raw.created_at as number | undefined,
    isCurrent: raw.is_current as boolean | undefined,
  }
}

/** Convert snake_case claude_md from CLI to camelCase */
function toClaudeMd(raw: Record<string, unknown>): ClaudeMd {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: raw.description as string | undefined,
    content: (raw.content as string | undefined) ?? '',
    createdAt: raw.created_at as number | undefined,
  }
}

// ── Providers ──────────────────────────────────────────────────────────

export async function fetchProviders(agentType: AgentType): Promise<Provider[]> {
  const raw = await call<Record<string, unknown>[]>((api) => api.list_providers!(agentType), [])
  return raw.map(toProvider)
}

export async function fetchProviderDetail(
  agentType: AgentType,
  providerId: string,
): Promise<Provider | null> {
  const raw = await call<Record<string, unknown> | null>((api) => api.get_provider!(agentType, providerId), null)
  return raw ? toProvider(raw) : null
}


export async function fetchClaudeMds(agentType: AgentType): Promise<ClaudeMd[]> {
  const raw = await call<Record<string, unknown>[]>((api) => api.list_claude_mds!(agentType), [])
  return raw.map(toClaudeMd)
}

export async function fetchClaudeMdDetail(
  agentType: AgentType,
  mdId: string,
): Promise<ClaudeMd | null> {
  const raw = await call<Record<string, unknown> | null>((api) => api.get_claude_md!(agentType, mdId), null)
  return raw ? toClaudeMd(raw) : null
}

export async function saveClaudeMd(
  agentType: AgentType,
  mdId: string,
  content: string,
  name?: string,
  description?: string,
): Promise<ClaudeMd> {
  const raw = await call<Record<string, unknown>>(
    (api) => api.save_claude_md!(agentType, mdId, content, name ?? '', description ?? ''),
    {} as Record<string, unknown>,
  )
  return toClaudeMd(raw)
}

export async function deleteClaudeMd(
  agentType: AgentType,
  mdId: string,
): Promise<void> {
  await call<void>((api) => api.delete_claude_md!(agentType, mdId), undefined)
}

export async function applyClaudeMdToProfile(
  profileName: string,
  mdId: string,
): Promise<void> {
  await call<void>((api) => api.apply_claude_md!(profileName, mdId), undefined)
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
