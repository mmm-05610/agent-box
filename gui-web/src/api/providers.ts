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
    settings: raw.settings as Provider['settings'] | undefined,
    meta: raw.meta as Provider['meta'] | undefined,
    createdAt: raw.created_at as number | undefined,
    isCurrent: raw.is_current as boolean | undefined,
  }
}

// ── Providers ──────────────────────────────────────────────────────────

export async function fetchProviders(agentType: AgentType): Promise<Provider[]> {
  const raw = await call<Record<string, unknown>[]>((api) => api.list_providers(agentType), [])
  return raw.map(toProvider)
}

export async function fetchProviderDetail(
  agentType: AgentType,
  providerId: string,
): Promise<Provider | null> {
  const raw = await call<Record<string, unknown> | null>((api) => api.get_provider(agentType, providerId), null)
  return raw ? toProvider(raw) : null
}

export async function saveProvider(
  agentType: AgentType,
  providerId: string,
  settingsJson: string,
): Promise<Provider> {
  const raw = await call<Record<string, unknown>>(
    (api) => api.save_provider(agentType, providerId, settingsJson),
    {} as Record<string, unknown>,
  )
  return toProvider(raw)
}

export async function deleteProvider(
  agentType: AgentType,
  providerId: string,
): Promise<void> {
  await call<void>((api) => api.delete_provider(agentType, providerId), undefined)
}

export async function duplicateProvider(
  agentType: AgentType,
  providerId: string,
  newId: string,
): Promise<Provider> {
  const raw = await call<Record<string, unknown>>(
    (api) => api.duplicate_provider(agentType, providerId, newId),
    {} as Record<string, unknown>,
  )
  return toProvider(raw)
}

export async function fetchPresets(agentType: AgentType): Promise<ProviderPreset[]> {
  return call<ProviderPreset[]>((api) => api.get_presets(agentType), [])
}

// ── Usage ────────────────────────────────────────────────────────────────

export interface UsageData {
  planName?: string
  remaining?: number
  used?: number
  total?: number
  unit?: string
  isValid?: boolean
  invalidMessage?: string
  extra?: string
}

export interface UsageResult {
  success: boolean
  data?: UsageData[]
  error?: string
}

export interface UsageScript {
  enabled: boolean
  code: string
  timeout: number
  autoQueryInterval: number
  templateType: string
}

export async function queryUsage(
  agentType: AgentType,
  providerId: string,
): Promise<UsageResult> {
  return call<UsageResult>(
    (api) => api.query_usage(agentType, providerId),
    { success: false, error: 'Unknown' },
  )
}

export async function saveUsageScript(
  agentType: AgentType,
  providerId: string,
  script: UsageScript,
): Promise<boolean> {
  return call<boolean>(
    (api) => api.save_usage_script(agentType, providerId, JSON.stringify(script)),
    false,
  )
}

export async function applyProviderToProfile(
  profileName: string,
  providerId: string,
): Promise<void> {
  await call<void>((api) => api.apply_provider(profileName, providerId), undefined)
}

// ── Claude.md ──────────────────────────────────────────────────────────

/** Convert snake_case claude_md from CLI to camelCase */
function toClaudeMd(raw: Record<string, unknown>): ClaudeMd {
  return {
    id: raw.id as string,
    name: raw.name as string,
    description: raw.description as string | undefined,
    content: raw.content as string | undefined,
    createdAt: raw.created_at as number | undefined,
  }
}

export async function fetchClaudeMds(agentType: AgentType): Promise<ClaudeMd[]> {
  const raw = await call<Record<string, unknown>[]>((api) => api.list_claude_mds(agentType), [])
  return raw.map(toClaudeMd)
}

export async function fetchClaudeMdDetail(
  agentType: AgentType,
  mdId: string,
): Promise<ClaudeMd | null> {
  const raw = await call<Record<string, unknown> | null>((api) => api.get_claude_md(agentType, mdId), null)
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
    (api) => api.save_claude_md(agentType, mdId, content, name ?? '', description ?? ''),
    {} as Record<string, unknown>,
  )
  return toClaudeMd(raw)
}

export async function deleteClaudeMd(
  agentType: AgentType,
  mdId: string,
): Promise<void> {
  await call<void>((api) => api.delete_claude_md(agentType, mdId), undefined)
}

export async function applyClaudeMdToProfile(
  profileName: string,
  mdId: string,
): Promise<void> {
  await call<void>((api) => api.apply_claude_md(profileName, mdId), undefined)
}
