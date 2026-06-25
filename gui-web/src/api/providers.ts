/**
 * Providers API — CRUD operations for providers and Claude.md
 *
 * Calls PyWebView bridge functions.
 */

import { call } from '@/lib/bridge'
import type { AgentType, ClaudeMd, Provider } from './types'

// ── Providers ──────────────────────────────────────────────────────────

export async function fetchProviders(agentType: AgentType): Promise<Provider[]> {
  // @ts-expect-error
  return call<Provider[]>(() => window.api.list_providers(agentType), [])
}

export async function fetchProviderDetail(
  agentType: AgentType,
  providerId: string,
): Promise<Provider | null> {
  // @ts-expect-error
  return call<Provider | null>(() => window.api.get_provider(agentType, providerId), null)
}

export async function saveProvider(
  agentType: AgentType,
  providerId: string,
  settingsJson: string,
): Promise<Provider> {
  // @ts-expect-error
  return call<Provider>(() => window.api.save_provider(agentType, providerId, settingsJson), {} as Provider)
}

export async function deleteProvider(
  agentType: AgentType,
  providerId: string,
): Promise<void> {
  // @ts-expect-error
  await call<void>(() => window.api.delete_provider(agentType, providerId), undefined)
}

export async function applyProviderToProfile(
  profileName: string,
  providerId: string,
): Promise<void> {
  // @ts-expect-error
  await call<void>(() => window.api.apply_provider(profileName, providerId), undefined)
}

// ── Claude.md ──────────────────────────────────────────────────────────

export async function fetchClaudeMds(agentType: AgentType): Promise<ClaudeMd[]> {
  // @ts-expect-error
  return call<ClaudeMd[]>(() => window.api.list_claude_mds(agentType), [])
}

export async function fetchClaudeMdDetail(
  agentType: AgentType,
  mdId: string,
): Promise<ClaudeMd | null> {
  // @ts-expect-error
  return call<ClaudeMd | null>(() => window.api.get_claude_md(agentType, mdId), null)
}

export async function saveClaudeMd(
  agentType: AgentType,
  mdId: string,
  content: string,
  name?: string,
  description?: string,
): Promise<ClaudeMd> {
  // @ts-expect-error
  return call<ClaudeMd>(
    () => window.api.save_claude_md(agentType, mdId, content, name ?? '', description ?? ''),
    {} as ClaudeMd,
  )
}

export async function deleteClaudeMd(
  agentType: AgentType,
  mdId: string,
): Promise<void> {
  // @ts-expect-error
  await call<void>(() => window.api.delete_claude_md(agentType, mdId), undefined)
}

export async function applyClaudeMdToProfile(
  profileName: string,
  mdId: string,
): Promise<void> {
  // @ts-expect-error
  await call<void>(() => window.api.apply_claude_md(profileName, mdId), undefined)
}
